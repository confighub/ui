// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Edge, Node } from 'reactflow';

import { componentTheme } from '../../componentTheme';
import {
  type ComponentFrameActions,
  type ComponentGroup,
  buildComponentFrameNode,
} from '../componentFrames';
import type { ComponentDeployment } from '../../componentTypes';
import type { DeploymentFlowNodeData } from '../DeploymentFlowNode';
import {
  type DeploymentNodeContext,
  type PromotionEdgeContext,
  buildDeploymentNodeData,
  buildPromotionEdge,
  showsPromotionBadge,
} from '../flowLayout';
import {
  type ConditionKind,
  WAVE_CONDITIONS,
  type WaveCondition,
  stripMark,
} from './deploymentCondition';
import { CARD_W, STACK_W } from './foldConstants';
import { foldHeaderCountText, foldHeaderTitle } from './foldHeader';
import type { FoldLayout, FoldLayoutNode } from './foldLayout';
import type { BaseFold, FoldModel } from './foldModel';
import { groupKeyLabel } from './groupBy';
import type { MarkKind } from './markStyle';
import { waveKey } from './waveActions';

/** Data of a `stackNode`: the quiet members of one label value, as one card. */
export interface StackNodeData {
  groupId: string;
  label: string;
  count: number;
  /** One per member, in member order. */
  marks: MarkKind[];
  /**
   * Member names, or for a stack of groups of 1 merged by a Space label, the
   * label values it holds. Never the stack's own label.
   */
  previewNames: string[];
  expanded: boolean;
  /** The Component's name, in a graph of two or more Components. */
  componentName?: string;
  onToggle: (groupId: string) => void;
  width: number;
  height: number;
}

/** Data of a `foldFrameNode`: the panel behind one Base's stacks. */
export interface FoldFrameNodeData {
  baseId: string;
  /** The values the fold holds, in cell order; empty when nothing splits the members. */
  values: string[];
  /** The full list with its key, for the tooltip and assistive technology. */
  valuesTitle: string;
  /** "53 departments": shown alone when not even one value fits. */
  valuesCountText: string;
  waves: { condition: WaveCondition; count: number }[];
  overCapCount: number;
  /** The one bulk action of a wave. Absent when the page offers none; the button is then hidden. */
  onWaveAction?: (baseId: string, condition: WaveCondition) => void;
  /** Waves whose bulk action is running; their button is disabled until it ends. */
  runningConditions: WaveCondition[];
  headerHeight: number;
  /** The wave chips sit beside the values, not on rows below them. */
  chipsBeside: boolean;
  /** The lines of values the header has room for. */
  valuesLines: number;
  /** An estimate of the values' width, used until the real width is measured. */
  valuesWidth: number;
  width: number;
  height: number;
}

/** Data of an `expandFrameNode`: the frame an open stack's members sit in. */
export interface ExpandFrameNodeData {
  groupId: string;
  label: string;
  count: number;
  groupLabel: string | null;
  baseName: string;
  /** The Component's name, in a graph of two or more Components. */
  componentName?: string;
  /** Who opened it: the user, or a search jump that revealed a member. */
  openedBy: 'you' | 'search';
  onCollapse: (groupId: string) => void;
  width: number;
  height: number;
}

export interface FoldElementsContext {
  node: DeploymentNodeContext;
  edge: PromotionEdgeContext;
  expandedGroupIds: ReadonlySet<string>;
  /** Stacks a search jump opened; every other open stack was opened by the user. */
  openedBySearchIds?: ReadonlySet<string>;
  onToggleStack: (groupId: string) => void;
  /** Deployment id -> time (ms) its recovered hold runs out. */
  recoveredUntilById?: ReadonlyMap<string, number>;
  /** Quiet cards kept only because they are selected. */
  keptSelectedIds?: ReadonlySet<string>;
  onWaveAction?: (baseId: string, condition: WaveCondition) => void;
  /** `waveKey`s of the waves whose bulk action is running. */
  runningWaveKeys?: ReadonlySet<string>;
  /** The Components of a graph of two or more, each drawn in a frame. */
  components?: readonly ComponentGroup[];
  frameActions?: ComponentFrameActions;
}

/** Conditions of a node the model does not know; it reads as quiet. */
const noConditions: Record<ConditionKind, boolean> = {
  degraded: false,
  outOfSync: false,
  gated: false,
  progressing: false,
  unreleased: false,
  stale: false,
};
/** A tree node's mark shows only what would earn it a card, so Stale is left out. */
const STALE_ONLY: ReadonlySet<WaveCondition> = new Set(['stale']);

/**
 * Variant Spaces downstream of each node, at every depth: what a tree node's
 * "N variants" counts. For the root it is its class Bases and every
 * Deployment under them. It reads only the component tree, so opening a
 * stack or forming a wave does not change it.
 */
function variantCountsBelow(
  deploymentsById: ReadonlyMap<string, ComponentDeployment>,
): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const d of deploymentsById.values()) {
    if (d.parentDeploymentId === null || !deploymentsById.has(d.parentDeploymentId)) continue;
    const list = children.get(d.parentDeploymentId);
    if (list) list.push(d.deploymentId);
    else children.set(d.parentDeploymentId, [d.deploymentId]);
  }
  const counts = new Map<string, number>();
  const count = (id: string, seen: Set<string>): number => {
    const known = counts.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    let n = 0;
    for (const child of children.get(id) ?? []) {
      n += 1 + count(child, seen);
    }
    counts.set(id, n);
    return n;
  };
  for (const id of deploymentsById.keys()) count(id, new Set());
  return counts;
}

function waveList(base: BaseFold | undefined): ReadonlyArray<WaveCondition> | undefined {
  if (!base || base.waveSet.size === 0) return undefined;
  return WAVE_CONDITIONS.filter((c) => base.waveSet.has(c));
}

/**
 * The reactflow nodes and edges of a folded graph. Pure, so it holds no React
 * state: the component passes what the user has open and the callbacks.
 *
 * Deployment nodes keep the Space ID as their id and the `deploymentNode`
 * type, so selection, compare letters, `focusTrigger` and the side pane work
 * the same as in the unfolded graph.
 */
export function toFlowElements(
  layout: FoldLayout,
  model: FoldModel,
  deploymentsById: ReadonlyMap<string, ComponentDeployment>,
  ctx: FoldElementsContext,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const groupLabel = model.groupKey === null ? null : groupKeyLabel(model.groupKey);
  const variants = variantCountsBelow(deploymentsById);
  const groupById = new Map(
    [...model.bases.values()].flatMap((base) => base.groups.map((g) => [g.id, g] as const)),
  );

  const componentByKey = new Map((ctx.components ?? []).map((c) => [c.key, c] as const));

  /** The Component of a Base, only in a graph that frames Components. */
  const componentNameOf = (baseId: string): string | undefined =>
    componentByKey.size > 0 ? deploymentsById.get(baseId)?.componentName : undefined;

  const deploymentNode = (n: FoldLayoutNode, d: ComponentDeployment): Node => {
    const base = n.baseId ? model.bases.get(n.baseId) : undefined;
    const data: DeploymentFlowNodeData = buildDeploymentNodeData(d, ctx.node);
    if (componentByKey.size > 0 && d.type === 'Base') data.componentName = d.componentName;
    if (n.placement === 'tree') {
      const mark = stripMark(model.conditions.get(d.deploymentId) ?? noConditions, STALE_ONLY);
      data.density = 'tree';
      data.variantCount = variants.get(d.deploymentId) ?? 0;
      data.treeMark = mark === 'quiet' || mark === 'stale' ? undefined : mark;
    } else {
      data.density = 'compact';
      data.width = n.placement === 'card' ? CARD_W : STACK_W;
      data.suppressedConditions = waveList(base);
      if (n.placement === 'card') {
        data.recoveredUntil = ctx.recoveredUntilById?.get(d.deploymentId);
        data.keptSelected = ctx.keptSelectedIds?.has(d.deploymentId) || undefined;
      }
    }
    return {
      id: n.id,
      type: 'deploymentNode',
      position: { x: n.x, y: n.y },
      data,
      draggable: false,
    };
  };

  for (const n of layout.nodes) {
    const position = { x: n.x, y: n.y };
    if (n.kind === 'componentFrame') {
      const group = n.componentKey ? componentByKey.get(n.componentKey) : undefined;
      if (group) nodes.push(buildComponentFrameNode(group, n, ctx.frameActions ?? {}));
      continue;
    }
    if (n.kind === 'deployment') {
      const d = deploymentsById.get(n.id);
      if (d) nodes.push(deploymentNode(n, d));
      continue;
    }
    const base = n.baseId ? model.bases.get(n.baseId) : undefined;
    if (n.kind === 'foldFrame' && base) {
      nodes.push({
        id: n.id,
        type: 'foldFrameNode',
        position,
        // Drawn under the stacks and cards it holds.
        zIndex: -1,
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          baseId: base.baseId,
          values: n.headerValues ?? [],
          valuesTitle: foldHeaderTitle(model.groupKey, n.headerValues ?? []),
          valuesCountText: foldHeaderCountText(model.groupKey, n.headerValues?.length ?? 0),
          waves: base.waves.map((w) => ({ condition: w.condition, count: w.count })),
          overCapCount: base.overCapIds.length,
          onWaveAction: ctx.onWaveAction,
          runningConditions: base.waves
            .map((w) => w.condition)
            .filter((c) => ctx.runningWaveKeys?.has(waveKey(base.baseId, c))),
          headerHeight: n.headerHeight ?? 0,
          chipsBeside: n.chipsBeside ?? true,
          valuesLines: n.headerLines ?? 1,
          valuesWidth: n.headerValuesWidth ?? 0,
          width: n.width,
          height: n.height,
        } satisfies FoldFrameNodeData,
      });
      continue;
    }
    const group = n.groupId ? groupById.get(n.groupId) : undefined;
    if (!group || !base) continue;
    if (n.kind === 'stack') {
      nodes.push({
        id: n.id,
        type: 'stackNode',
        position,
        draggable: false,
        selectable: false,
        data: {
          groupId: group.id,
          label: group.label,
          count: group.memberIds.length,
          marks: group.memberIds.map((id) =>
            stripMark(model.conditions.get(id) ?? noConditions, base.waveSet),
          ),
          previewNames:
            group.kind === 'other' && group.mergedLabels
              ? group.mergedLabels
              : group.memberIds.map((id) => deploymentsById.get(id)?.displayName ?? id),
          expanded: ctx.expandedGroupIds.has(group.id),
          componentName: componentNameOf(base.baseId),
          onToggle: ctx.onToggleStack,
          width: n.width,
          height: n.height,
        } satisfies StackNodeData,
      });
    } else if (n.kind === 'expandFrame') {
      nodes.push({
        id: n.id,
        type: 'expandFrameNode',
        position,
        zIndex: -1,
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          groupId: group.id,
          label: group.label,
          count: group.memberIds.length,
          groupLabel,
          baseName: deploymentsById.get(base.baseId)?.displayName ?? base.baseId,
          componentName: componentNameOf(base.baseId),
          openedBy: ctx.openedBySearchIds?.has(group.id) ? 'search' : 'you',
          onCollapse: ctx.onToggleStack,
          width: n.width,
          height: n.height,
        } satisfies ExpandFrameNodeData,
      });
    }
  }

  const placed = new Map(layout.nodes.map((n) => [n.id, n]));
  for (const e of layout.edges) {
    if (e.kind === 'promotion') {
      const child = deploymentsById.get(e.target);
      const from = placed.get(e.source);
      const to = placed.get(e.target);
      const hideBadge = !(from && to && showsPromotionBadge(to.x - (from.x + from.width)));
      if (child) edges.push(buildPromotionEdge(e.source, child, ctx.edge, hideBadge));
      continue;
    }
    // The fold edge is lit when the selected Deployment is one of the fold's
    // quiet members, so the path from the Base to the open card still reads.
    const lit = [...ctx.edge.selectedDeploymentIds].some((id) => {
      const loc = model.location.get(id);
      return loc !== undefined && loc.baseId === e.source && loc.kind !== 'card';
    });
    edges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      pathOptions: { borderRadius: 8 },
      style: {
        stroke: lit ? componentTheme.done : componentTheme.borderDefault,
        strokeWidth: lit ? 2.5 : 1.5,
        strokeDasharray: lit ? undefined : '5 4',
      },
      zIndex: lit ? 1 : 0,
    });
  }

  return { nodes, edges };
}
