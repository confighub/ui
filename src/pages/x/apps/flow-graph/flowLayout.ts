// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Edge, Node } from 'reactflow';

import type { ComponentDeployment, Stage } from '../componentTypes';
import { componentTheme } from '../componentTheme';
import { arrowKey } from '../componentData';
import {
  type ComponentFrameActions,
  type ComponentGroup,
  buildComponentFrameNode,
  placeFrames,
} from './componentFrames';
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

/**
 * Whether an edge draws its sync badge: only when the node-to-node gap is the
 * unfolded graph's STAGE_GAP, so the badge sits on the edge as it does there.
 */
export const showsPromotionBadge = (gap: number): boolean => gap === STAGE_GAP;

// ============================================================================
// TYPES
// ============================================================================

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

// ============================================================================
// NODE AND EDGE BUILDERS
// ============================================================================

/**
 * What a Deployment card needs besides the Deployment itself. The unfolded
 * layout and the folded one (fold/foldNodes.ts) build their cards from the
 * same function, so a card says the same thing wherever it is drawn.
 */
export interface DeploymentNodeContext {
  selectedDeploymentIds: ReadonlySet<string>;
  activeUpgrades: ReadonlySet<string>;
  onDeploymentToggle: (deploymentId: string) => void;
  onUpgradeToggle: (parentDeploymentId: string, childDeploymentId: string) => void;
  errorDeploymentIds?: ReadonlySet<string>;
  unitSummariesByDeployment?: ReadonlyMap<string, NodeUnitSummary[]>;
  upgradingDeploymentIds?: ReadonlySet<string>;
  deploymentSuccessMessages?: ReadonlyMap<string, string>;
  latestReleaseBySpaceId?: ReadonlyMap<string, { num: number; createdAt?: string }>;
  releasingDeploymentIds?: ReadonlySet<string>;
  onOpenTab?: (deploymentId: string, tab: 'config' | 'releases', releaseNum?: number) => void;
  onComposerOpen?: (deploymentId: string) => void;
}

export function buildDeploymentNodeData(
  deployment: ComponentDeployment,
  ctx: DeploymentNodeContext,
): DeploymentFlowNodeData {
  const isSelected = ctx.selectedDeploymentIds.has(deployment.deploymentId);
  const isUpgradeActive =
    deployment.parentDeploymentId != null &&
    ctx.activeUpgrades.has(arrowKey(deployment.parentDeploymentId, deployment.deploymentId));
  return {
    deployment,
    isSelected,
    isUpgradeActive,
    onSelect: ctx.onDeploymentToggle,
    onUpgradeToggle: ctx.onUpgradeToggle,
    hasError: ctx.errorDeploymentIds?.has(deployment.deploymentId),
    units: ctx.unitSummariesByDeployment?.get(deployment.deploymentId) ?? [],
    isUpgrading: ctx.upgradingDeploymentIds?.has(deployment.deploymentId),
    successMessage: ctx.deploymentSuccessMessages?.get(deployment.deploymentId),
    latestRelease: ctx.latestReleaseBySpaceId?.get(deployment.deploymentId),
    isReleasing: ctx.releasingDeploymentIds?.has(deployment.deploymentId),
    onOpenTab: ctx.onOpenTab,
    onComposerOpen: ctx.onComposerOpen,
  };
}

/** What a promotion edge needs to pick its style and fetch its Link data. */
export interface PromotionEdgeContext {
  selectedDeploymentIds: ReadonlySet<string>;
  activeUpgrades: ReadonlySet<string>;
  /** The Space that just finished a publish; its outgoing edges pulse. */
  pulseFromDeploymentId?: string | null;
  deploymentSpaceIdsKey?: string;
  deploymentById: ReadonlyMap<string, ComponentDeployment>;
}

/** The promotion edge from a parent into one child, idle or lit by selection or an upgrade. */
export function buildPromotionEdge(
  parentDeploymentId: string,
  child: ComponentDeployment,
  ctx: PromotionEdgeContext,
  hideBadge = false,
): Edge {
  const childSel = ctx.selectedDeploymentIds.has(child.deploymentId);
  const active = ctx.activeUpgrades.has(arrowKey(parentDeploymentId, child.deploymentId));
  // This edge's source just published — pulse it toward the next stage.
  const releasePulsing =
    ctx.pulseFromDeploymentId != null && parentDeploymentId === ctx.pulseFromDeploymentId;

  return {
    id: `edge-${parentDeploymentId}-${child.deploymentId}`,
    source: parentDeploymentId,
    target: child.deploymentId,
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
      deploymentSpaceIdsKey: ctx.deploymentSpaceIdsKey ?? '',
      sourceLabel: ctx.deploymentById.get(parentDeploymentId)?.displayName ?? '',
      targetLabel: child.displayName,
      ...(hideBadge && { hideBadge }),
    } satisfies PromotionEdgeData,
  };
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
  /** The Components of a graph of two or more: each tree is laid out in its own frame. */
  components?: readonly ComponentGroup[],
  frameActions?: ComponentFrameActions,
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

  const stageX = new Map<number, number>();
  let currentX = 0;
  stages.forEach((stage) => {
    stageX.set(stage.depth, currentX);
    currentX += NODE_WIDTH + STAGE_GAP;
  });

  const nodePositions = new Map<string, { x: number; y: number }>();
  const framed = components !== undefined && components.length > 0;

  if (!framed) {
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
    deployments.forEach((d) => {
      const x = stageX.get(d.stage) ?? 0;
      const y = yById.get(d.deploymentId) ?? 20;
      nodePositions.set(d.deploymentId, { x, y });
    });
  } else {
    // Each Component's tree is centred on its own, then the trees stack in
    // frames, so a tree never shares rows with another Component's.
    const trees = components.map((c) => {
      const own = new Set(c.deploymentIds);
      const ownChildren = new Map<string, string[]>();
      for (const [parent, kids] of childrenOf) {
        if (own.has(parent)) ownChildren.set(parent, kids.filter((k) => own.has(k)));
      }
      const y = computeSubtreeCenteredY(
        c.deploymentIds,
        ownChildren,
        c.rootIds,
        NODE_HEIGHT,
        NODE_GAP,
        0,
      );
      let bottom = 0;
      let right = 0;
      for (const id of c.deploymentIds) {
        bottom = Math.max(bottom, (y.get(id) ?? 0) + NODE_HEIGHT);
        const d = deploymentById.get(id);
        right = Math.max(right, (stageX.get(d?.stage ?? 0) ?? 0) + NODE_WIDTH);
      }
      return { y, size: { width: right, height: bottom } };
    });
    const placement = placeFrames(trees.map((t) => t.size));
    components.forEach((c, i) => {
      const offset = placement.offsets[i];
      for (const id of c.deploymentIds) {
        const d = deploymentById.get(id);
        nodePositions.set(id, {
          x: (stageX.get(d?.stage ?? 0) ?? 0) + offset.x,
          y: (trees[i].y.get(id) ?? 0) + offset.y,
        });
      }
      nodes.push(buildComponentFrameNode(c, placement.frames[i], frameActions ?? {}));
    });
  }

  const nodeContext: DeploymentNodeContext = {
    selectedDeploymentIds,
    activeUpgrades,
    onDeploymentToggle,
    onUpgradeToggle,
    errorDeploymentIds,
    unitSummariesByDeployment,
    upgradingDeploymentIds,
    deploymentSuccessMessages,
    latestReleaseBySpaceId,
    releasingDeploymentIds,
    onOpenTab,
    onComposerOpen,
  };
  const edgeContext: PromotionEdgeContext = {
    selectedDeploymentIds,
    activeUpgrades,
    pulseFromDeploymentId,
    deploymentSpaceIdsKey,
    deploymentById,
  };

  deployments.forEach((deployment) => {
    const pos = nodePositions.get(deployment.deploymentId);
    if (!pos) return;

    const data = buildDeploymentNodeData(deployment, nodeContext);
    if (framed && deployment.type === 'Base' && deployment.componentName) {
      data.componentName = deployment.componentName;
    }
    nodes.push({
      id: deployment.deploymentId,
      type: 'deploymentNode',
      position: pos,
      data,
      draggable: false,
    });

    if (deployment.parentDeploymentId) {
      edges.push(buildPromotionEdge(deployment.parentDeploymentId, deployment, edgeContext));
    }
  });

  return { nodes, edges };
}
