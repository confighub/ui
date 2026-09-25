// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Edge, Node } from 'reactflow';

import type { ComponentDeployment, Stage } from '../componentTypes';
import { componentTheme } from '../componentTheme';
import { arrowKey } from '../componentData';
import { computeSubtreeCenteredY } from './treeCenterLayout';
import type { DeploymentFlowNodeData, NodeUnitSummary } from './DeploymentFlowNode';
import type { PromotionEdgeData } from './PromotionEdge';

// ============================================================================
// CONSTANTS
// ============================================================================

export const NODE_WIDTH = 260;
// Vertical slot reserved per node in the layout (and used for edge/centering
// math in ComponentFlowGraph). The card has a min-height of 84 and grows with
// its status content: the signal chips (Stale / Unreleased changes / Gated /
// live status) are compact single-line chips that wrap, so even a busy card
// stays modest. Sized (with NODE_GAP) to clear the next stacked sibling.
export const NODE_HEIGHT = 112;
export const STAGE_GAP = 100;
// Exported so composerLayout.ts can use the exact same vertical spacing unit
// when computing landing-slot/composer positions from already-computed node
// positions — it must match this module's own math pixel-for-pixel.
export const NODE_GAP = 30;

// ============================================================================
// TYPES
// ============================================================================

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

// ============================================================================
// LAYOUT
// ============================================================================

/**
 * Compute explicit positions for deployments organized by stage (left-to-right).
 * Handles fanout by positioning parent nodes vertically centered relative to children.
 */
export function computeLayout(
  deployments: ComponentDeployment[],
  stages: Stage[],
  // X/Y come entirely from `deployments`/`stages` — this is used below to
  // resolve a promotion edge's upstream display name for its popover header.
  deploymentById: Map<string, ComponentDeployment>,
  selectedDeploymentIds: Set<string>,
  activeUpgrades: Set<string>,
  onDeploymentToggle: (deploymentId: string) => void,
  onUpgradeToggle: (parentDeploymentId: string, childDeploymentId: string) => void,
  errorDeploymentIds?: Set<string>,
  unitSummariesByDeployment?: Map<string, NodeUnitSummary[]>,
  upgradingDeploymentIds?: Set<string>,
  deploymentSuccessMessages?: Map<string, string>,
  /** Latest release per Space (release-enabled deployments only), for the node header chip. */
  latestReleaseBySpaceId?: Map<string, { num: number; createdAt?: string }>,
  /** Deployment IDs currently publishing (drives the node-card ripple). */
  releasingDeploymentIds?: Set<string>,
  /** The Space that just finished a publish — pulses its OUTGOING promotion edge(s) toward the next stage ("graph-forward" signature move). */
  pulseFromDeploymentId?: string | null,
  /** Deep-link a deployment's side pane to a tab from a status-chip peek (Stale → config, Unreleased/Gated → releases). `releaseNum`, when given (the release-stamp peek), asks the Releases tab to scroll to and highlight that specific release. */
  onOpenTab?: (deploymentId: string, tab: 'config' | 'releases', releaseNum?: number) => void,
  /** Opens the inline variant composer anchored to this deployment as parent. Fired by the node's own click affordance or the 'V' key — never routed through onDeploymentToggle. */
  onComposerOpen?: (deploymentId: string) => void,
  /** Every deployment (Space) ID in this graph, comma-joined — each promotion edge uses this to fetch its own Link data (see PromotionEdge.tsx). */
  deploymentSpaceIdsKey?: string,
): LayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const childrenOf = new Map<string, string[]>();
  for (const d of deployments) {
    if (d.parentDeploymentId) {
      const children = childrenOf.get(d.parentDeploymentId) ?? [];
      children.push(d.deploymentId);
      childrenOf.set(d.parentDeploymentId, children);
    }
  }

  const roots = deployments.filter((d) => !d.parentDeploymentId);

  // Subtree-centered Y per deployment — recursive fan-out centering. See
  // treeCenterLayout.ts.
  const yById = computeSubtreeCenteredY(
    deployments.map((d) => d.deploymentId),
    childrenOf,
    roots.map((d) => d.deploymentId),
    NODE_HEIGHT,
    NODE_GAP,
    20,
  );

  const stageX = new Map<number, number>();
  let currentX = 0;
  stages.forEach((stage) => {
    stageX.set(stage.depth, currentX);
    currentX += NODE_WIDTH + STAGE_GAP;
  });

  const nodePositions = new Map<string, { x: number; y: number }>();
  deployments.forEach((d) => {
    const x = stageX.get(d.stage) ?? 0;
    const y = yById.get(d.deploymentId) ?? 20;
    nodePositions.set(d.deploymentId, { x, y });
  });

  deployments.forEach((deployment) => {
    const pos = nodePositions.get(deployment.deploymentId);
    if (!pos) return;

    const isSelected = selectedDeploymentIds.has(deployment.deploymentId);
    const isUpgradeActive =
      deployment.parentDeploymentId != null &&
      activeUpgrades.has(arrowKey(deployment.parentDeploymentId, deployment.deploymentId));

    nodes.push({
      id: deployment.deploymentId,
      type: 'deploymentNode',
      position: pos,
      data: {
        deployment,
        isSelected,
        isUpgradeActive,
        onSelect: onDeploymentToggle,
        onUpgradeToggle,
        hasError: errorDeploymentIds?.has(deployment.deploymentId),
        units: unitSummariesByDeployment?.get(deployment.deploymentId) ?? [],
        isUpgrading: upgradingDeploymentIds?.has(deployment.deploymentId),
        successMessage: deploymentSuccessMessages?.get(deployment.deploymentId),
        latestRelease: latestReleaseBySpaceId?.get(deployment.deploymentId),
        isReleasing: releasingDeploymentIds?.has(deployment.deploymentId),
        onOpenTab,
        onComposerOpen,
      } satisfies DeploymentFlowNodeData,
      draggable: false,
    });

    if (deployment.parentDeploymentId) {
      const childSel = isSelected;
      const active = activeUpgrades.has(
        arrowKey(deployment.parentDeploymentId, deployment.deploymentId),
      );
      // This edge's source just published — pulse it toward the next stage.
      const releasePulsing = pulseFromDeploymentId != null && deployment.parentDeploymentId === pulseFromDeploymentId;

      edges.push({
        id: `edge-${deployment.parentDeploymentId}-${deployment.deploymentId}`,
        source: deployment.parentDeploymentId,
        target: deployment.deploymentId,
        type: 'promotionEdge',
        className: releasePulsing ? 'release-pulse-edge' : undefined,
        style: {
          stroke: active || childSel ? componentTheme.done : componentTheme.borderDefault,
          strokeWidth: active || childSel ? 2.5 : 1.5,
          strokeDasharray: !active && !childSel ? '5 4' : undefined,
        },
        animated: active || childSel,
        zIndex: active || childSel || releasePulsing ? 1 : 0,
        data: {
          deploymentSpaceIdsKey: deploymentSpaceIdsKey ?? '',
          sourceLabel: deploymentById.get(deployment.parentDeploymentId)?.displayName ?? '',
          targetLabel: deployment.displayName,
        } satisfies PromotionEdgeData,
      });
    }
  });

  return { nodes, edges };
}
