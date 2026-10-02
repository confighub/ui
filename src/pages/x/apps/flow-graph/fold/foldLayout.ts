// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentDeployment } from '../../componentTypes';
import {
  BAND_GAP,
  BLOCK_GAP,
  CARD_GAP,
  CARD_W,
  COMPACT_CARD_H,
  FOLD_GAP,
  FOLD_PAD,
  FRAME_HEAD,
  FRAME_PAD_BOTTOM,
  MAX_CARD_COLUMNS,
  STACK_DECK,
  STACK_GAP,
  STACK_H,
  STACK_W,
  TOP_MARGIN,
  TREE_GAP,
  TREE_NODE_H,
  TREE_NODE_W,
} from './foldConstants';
import {
  type ComponentGroup,
  FRAME_PAD_X,
  componentFrameId,
  placeFrames,
} from '../componentFrames';
import { foldHeaderGeometry, foldHeaderLines, foldHeaderValues } from './foldHeader';
import type { BaseFold, FoldModel } from './foldModel';
import type { QuietGroup } from './groupBy';

/**
 * The column choices Fit made. Fit freezes them, and every later layout until
 * the next Fit reuses them, so a status poll or an expanded stack can move
 * things down but never sideways.
 */
export interface FrozenFoldParams {
  /** The model width the columns were chosen for. */
  availableWidth: number;
  /** Card columns beside each Base: 0 (no cards at Fit) to MAX_CARD_COLUMNS. */
  cardColumnsByBase: ReadonlyMap<string, number>;
  /** Stack columns in each Base's fold, at least 1. */
  stackColumnsByBase: ReadonlyMap<string, number>;
  /**
   * The group id in each cell of each Base's fold, in cell order. A group
   * that goes away leaves an empty cell, and a new group takes the first
   * empty cell, so the other stacks keep their cells. Without it, one loose
   * card that breaks out of its cell would shift every later stack left.
   */
  cellOrderByBase?: ReadonlyMap<string, readonly string[]>;
  /**
   * The lines of values each fold header keeps room for. A value that comes
   * or goes on a poll would otherwise change the header's height and move
   * every stack below it.
   */
  headerLinesByBase?: ReadonlyMap<string, number>;
}

export type FoldLayoutNodeKind =
  | 'deployment'
  | 'foldFrame'
  | 'stack'
  | 'expandFrame'
  | 'componentFrame';

export interface FoldLayoutNode {
  /** A Deployment's Space ID, `fold:<baseId>`, a QuietGroup id or `frame:<groupId>`. */
  id: string;
  kind: FoldLayoutNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The Base whose block holds the node; absent on tree nodes. */
  baseId?: string;
  /** The QuietGroup of a stack, a loose card, an expand frame or its members. */
  groupId?: string;
  /**
   * Deployment nodes only:
   * - `tree`: a node of the Base tree (compact 132 x 56);
   * - `card`: an attention card beside its Base;
   * - `loose`: a group of 1, as a quiet card in a fold cell;
   * - `member`: a member of an expanded stack.
   */
  placement?: 'tree' | 'card' | 'loose' | 'member';
  /** Component frames only: the Component ID. */
  componentKey?: string;
  /** Fold frames only: the header height. */
  headerHeight?: number;
  /** Fold frames only: the wave chips sit beside the values, not below them. */
  chipsBeside?: boolean;
  /** Fold frames only: the lines of values the header has room for. */
  headerLines?: number;
  /** Fold frames only: the values the header lists, in cell order. */
  headerValues?: string[];
  /** Fold frames only: an estimate of the values' width, until it is measured. */
  headerValuesWidth?: number;
}

export interface FoldLayoutEdge {
  id: string;
  source: string;
  target: string;
  /** `fold`: one edge from a Base into its fold, instead of one per quiet Deployment. */
  kind: 'promotion' | 'fold';
}

export interface FoldLayout {
  nodes: FoldLayoutNode[];
  edges: FoldLayoutEdge[];
  /** The right edge of the right-most node (the tree starts at x = 0). */
  width: number;
  /** The bottom edge of the lowest node (the first band starts at TOP_MARGIN). */
  height: number;
  /** The params this layout used; freeze these at Fit. */
  frozen: FrozenFoldParams;
}

export interface FoldLayoutOptions {
  /** The model width to fill, used for every Base the frozen params do not cover. */
  availableWidth: number;
  frozen?: FrozenFoldParams | null;
  /** The stacks shown open in place. Loose groups have nothing to open. */
  expandedGroupIds: ReadonlySet<string>;
  /**
   * The Components of a graph that spans two or more. Each one's tree gets a
   * frame, and the frames stack in this order. Absent for a single Component,
   * which is laid out as it always was.
   */
  components?: readonly ComponentGroup[];
}

export const foldFrameId = (baseId: string): string => `fold:${baseId}`;
export const expandFrameId = (groupId: string): string => `frame:${groupId}`;
export const foldEdgeId = (baseId: string): string => `foldedge-${baseId}`;
/** The same id the unfolded layout gives a promotion edge. */
export const promotionEdgeId = (parentId: string, childId: string): string =>
  `edge-${parentId}-${childId}`;

const TREE_PITCH_X = TREE_NODE_W + TREE_GAP;
const CARD_PITCH_X = CARD_W + CARD_GAP;
const CARD_PITCH_Y = COMPACT_CARD_H + CARD_GAP;
const CELL_PITCH_X = STACK_W + STACK_GAP;
/** A cell row holds a stack and its deck, then the gap. */
const CELL_PITCH_Y = STACK_H + STACK_DECK + STACK_GAP;
const MEMBER_PITCH_Y = COMPACT_CARD_H + STACK_GAP;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Where the fold starts: right of the card columns, or at the block start without cards. */
function foldXFor(blockX: number, cardColumns: number): number {
  return cardColumns > 0 ? blockX + cardColumns * CARD_PITCH_X - CARD_GAP + FOLD_GAP : blockX;
}

/** As many stack columns as fit in the available width, at least 1, at most one per cell. */
function fitStackColumns(availableWidth: number, foldX: number, cellCount: number): number {
  const fit = Math.floor((availableWidth - foldX - 2 * FOLD_PAD + STACK_GAP) / CELL_PITCH_X);
  return clamp(fit, 1, Math.max(1, cellCount));
}

/** The fold's inner width; never narrower than a card, so the header has room. */
function foldInnerWidth(stackColumns: number): number {
  return Math.max(stackColumns * CELL_PITCH_X - STACK_GAP, CARD_W);
}

/** Height of `n` cards in `k` column-major columns. */
function cardColumnHeight(n: number, k: number): number {
  if (n === 0 || k === 0) return 0;
  return Math.ceil(n / k) * CARD_PITCH_Y - CARD_GAP;
}

/**
 * The card columns that give a Base the lowest band at this width. A choice
 * whose block runs past the width loses to one that fits; on a tie, fewer
 * columns keep the cards closer to their Base.
 */
function chooseCardColumns(
  base: BaseFold,
  blockX: number,
  availableWidth: number,
  cellCount: number,
  headerValues: readonly string[],
): number {
  const n = base.cards.length;
  if (n === 0) return 0;
  const hasFold = cellCount > 0;
  let best: { k: number; overflows: boolean; height: number } | null = null;
  for (let k = 1; k <= MAX_CARD_COLUMNS; k++) {
    let height = cardColumnHeight(n, k);
    let right = blockX + k * CARD_PITCH_X - CARD_GAP;
    if (hasFold) {
      const foldX = foldXFor(blockX, k);
      const c = fitStackColumns(availableWidth, foldX, cellCount);
      const foldWidth = foldInnerWidth(c) + 2 * FOLD_PAD;
      const lines = foldHeaderLines(base, foldWidth, headerValues);
      const headerHeight = foldHeaderGeometry(base, foldWidth, lines).height;
      // The cards start level with the first row of stacks.
      height = headerHeight + Math.max(height, Math.ceil(cellCount / c) * CELL_PITCH_Y);
      right = foldX + foldWidth;
    }
    height = Math.max(height, TREE_NODE_H);
    const overflows = right > availableWidth;
    if (
      best === null ||
      (best.overflows && !overflows) ||
      (best.overflows === overflows && height < best.height)
    ) {
      best = { k, overflows, height };
    }
  }
  return best?.k ?? 1;
}

/**
 * Place a Base's groups in cells. Without a frozen order, groups take cells
 * in their sorted order. With one, every group keeps its frozen cell, a
 * missing group leaves its cell empty, and a new group takes the first empty
 * cell or goes at the end.
 */
function arrangeCells(
  groups: readonly QuietGroup[],
  frozenOrder: readonly string[] | undefined,
): { cells: (QuietGroup | null)[]; order: string[] } {
  if (!frozenOrder) return { cells: [...groups], order: groups.map((g) => g.id) };
  const byId = new Map(groups.map((g) => [g.id, g]));
  const order = [...frozenOrder];
  const cells: (QuietGroup | null)[] = order.map((id) => byId.get(id) ?? null);
  const placed = new Set(order.filter((id) => byId.has(id)));
  for (const g of groups) {
    if (placed.has(g.id)) continue;
    const hole = cells.indexOf(null);
    if (hole >= 0) {
      cells[hole] = g;
      order[hole] = g.id;
    } else {
      cells.push(g);
      order.push(g.id);
    }
  }
  // Empty cells at the end would only add blank rows; the order keeps them,
  // so a group that comes back still finds its cell.
  while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop();
  return { cells, order };
}

/**
 * Positions for a folded Component graph: the Base tree on the left, and to
 * the right of each Base one band holding its attention cards and its fold
 * of quiet stacks.
 *
 * An open stack keeps its cell; its members take whole rows below that cell
 * row, so cells before it keep their place and cells after it only move
 * down.
 */
function layoutComponent(
  deployments: readonly ComponentDeployment[],
  model: FoldModel,
  opts: FoldLayoutOptions,
): FoldLayout {
  const { expandedGroupIds } = opts;
  const frozen = opts.frozen ?? null;
  const availableWidth = frozen?.availableWidth ?? opts.availableWidth;

  const nodes: FoldLayoutNode[] = [];
  const edges: FoldLayoutEdge[] = [];
  const cardColumnsByBase = new Map(frozen?.cardColumnsByBase ?? []);
  const stackColumnsByBase = new Map(frozen?.stackColumnsByBase ?? []);
  const cellOrderByBase = new Map(frozen?.cellOrderByBase ?? []);
  const headerLinesByBase = new Map(frozen?.headerLinesByBase ?? []);

  const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
  const isMember = new Set<string>();
  for (const base of model.bases.values()) {
    for (const id of base.memberIds) isMember.add(id);
  }

  // Children in the order of `deployments`, as the unfolded layout orders them.
  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const d of deployments) {
    const parent = d.parentDeploymentId;
    if (parent !== null && byId.has(parent)) {
      const list = childrenOf.get(parent);
      if (list) list.push(d.deploymentId);
      else childrenOf.set(parent, [d.deploymentId]);
    } else {
      roots.push(d.deploymentId);
    }
  }

  const treeX = (d: ComponentDeployment): number => d.stage * TREE_PITCH_X;

  /** Lay out one Base's band at `bandTop`; returns the band's bottom. */
  function layoutBlock(base: BaseFold, baseX: number, bandTop: number): number {
    const baseId = base.baseId;
    const blockX = baseX + TREE_NODE_W + BLOCK_GAP;
    const { cells, order } = arrangeCells(base.groups, frozen?.cellOrderByBase?.get(baseId));
    const hasFold = cells.length > 0;
    const n = base.cards.length;
    const headerValues = foldHeaderValues(cells, model.groupKey);

    const k =
      frozen?.cardColumnsByBase.get(baseId) ??
      chooseCardColumns(base, blockX, availableWidth, cells.length, headerValues);
    cardColumnsByBase.set(baseId, k);

    const foldX = foldXFor(blockX, k);
    let stackColumns = 0;
    let foldWidth = 0;
    if (hasFold) {
      stackColumns =
        frozen?.stackColumnsByBase.get(baseId) ??
        fitStackColumns(availableWidth, foldX, cells.length);
      stackColumnsByBase.set(baseId, stackColumns);
      cellOrderByBase.set(baseId, order);
      foldWidth = foldInnerWidth(stackColumns) + 2 * FOLD_PAD;
    }
    const headerLines = hasFold
      ? (frozen?.headerLinesByBase?.get(baseId) ??
        foldHeaderLines(base, foldWidth, headerValues))
      : 0;
    if (hasFold) headerLinesByBase.set(baseId, headerLines);
    const header = foldHeaderGeometry(base, foldWidth, headerLines);

    let bottom = bandTop + TREE_NODE_H;
    let foldTop = bandTop;

    const pushCard = (id: string, x: number, y: number) => {
      nodes.push({
        id,
        kind: 'deployment',
        placement: 'card',
        baseId,
        x,
        y,
        width: CARD_W,
        height: COMPACT_CARD_H,
      });
      edges.push({
        id: promotionEdgeId(baseId, id),
        source: baseId,
        target: id,
        kind: 'promotion',
      });
      bottom = Math.max(bottom, y + COMPACT_CARD_H);
    };

    if (n > 0 && k === 0) {
      // Fit saw no cards here, so the fold sits where the cards would go. New
      // cards take a strip above the fold and push it down; moving the fold
      // right would move every stack sideways.
      const wrapWidth = hasFold ? foldWidth : Math.max(availableWidth - blockX, CARD_W);
      const perRow = Math.max(1, Math.floor((wrapWidth + CARD_GAP) / CARD_PITCH_X));
      base.cards.forEach((card, i) => {
        pushCard(
          card.id,
          blockX + (i % perRow) * CARD_PITCH_X,
          bandTop + Math.floor(i / perRow) * CARD_PITCH_Y,
        );
      });
      foldTop = bandTop + Math.ceil(n / perRow) * CARD_PITCH_Y;
    } else if (n > 0) {
      // Column-major, so the worst card is at the top of the first column.
      const rows = Math.ceil(n / k);
      const top = bandTop + (hasFold ? header.height : 0);
      base.cards.forEach((card, i) => {
        pushCard(
          card.id,
          blockX + Math.floor(i / rows) * CARD_PITCH_X,
          top + (i % rows) * CARD_PITCH_Y,
        );
      });
    }

    if (!hasFold) return bottom;

    const innerWidth = foldInnerWidth(stackColumns);
    const headerHeight = header.height;
    const cellX = (col: number) => foldX + FOLD_PAD + col * CELL_PITCH_X;
    const inner: FoldLayoutNode[] = [];
    let cy = foldTop + headerHeight;

    for (let start = 0; start < cells.length; start += stackColumns) {
      const row = cells.slice(start, start + stackColumns);
      row.forEach((group, col) => {
        if (!group) return;
        if (group.kind === 'loose') {
          inner.push({
            id: group.memberIds[0],
            kind: 'deployment',
            placement: 'loose',
            baseId,
            groupId: group.id,
            x: cellX(col),
            y: cy,
            width: STACK_W,
            height: COMPACT_CARD_H,
          });
        } else {
          inner.push({
            id: group.id,
            kind: 'stack',
            baseId,
            groupId: group.id,
            x: cellX(col),
            y: cy,
            width: STACK_W,
            height: STACK_H,
          });
        }
      });
      cy += CELL_PITCH_Y;

      for (const group of row) {
        if (!group || group.kind === 'loose' || !expandedGroupIds.has(group.id)) continue;
        const memberRows = Math.ceil(group.memberIds.length / stackColumns);
        const frameHeight =
          FRAME_HEAD + memberRows * MEMBER_PITCH_Y - STACK_GAP + FRAME_PAD_BOTTOM;
        inner.push({
          id: expandFrameId(group.id),
          kind: 'expandFrame',
          baseId,
          groupId: group.id,
          x: foldX + FOLD_PAD - 6,
          y: cy,
          width: innerWidth + 12,
          height: frameHeight,
        });
        group.memberIds.forEach((id, j) => {
          inner.push({
            id,
            kind: 'deployment',
            placement: 'member',
            baseId,
            groupId: group.id,
            x: cellX(j % stackColumns),
            y: cy + FRAME_HEAD + Math.floor(j / stackColumns) * MEMBER_PITCH_Y,
            width: STACK_W,
            height: COMPACT_CARD_H,
          });
        });
        cy += frameHeight + STACK_GAP;
      }
    }

    const foldHeight = cy - foldTop;
    // The frame goes first so it is drawn under its cells.
    nodes.push({
      id: foldFrameId(baseId),
      kind: 'foldFrame',
      baseId,
      x: foldX,
      y: foldTop,
      width: foldWidth,
      height: foldHeight,
      headerHeight,
      chipsBeside: header.chipsBeside,
      headerLines,
      headerValues,
      headerValuesWidth: header.valuesWidth,
    });
    nodes.push(...inner);
    edges.push({
      id: foldEdgeId(baseId),
      source: baseId,
      target: foldFrameId(baseId),
      kind: 'fold',
    });
    return Math.max(bottom, foldTop + foldHeight);
  }

  let nextTop = TOP_MARGIN;
  const placed = new Set<string>();

  /**
   * Depth first: a Base's own band, then the bands of its tree children. The
   * node is centred on the span of all of them, as the unfolded layout
   * centres a parent on its children.
   */
  function place(id: string, ancestors: ReadonlySet<string>): { top: number; bottom: number } {
    placed.add(id);
    const d = byId.get(id)!;
    const x = treeX(d);
    let top: number | null = null;
    let bottom = 0;

    const base = model.bases.get(id);
    if (base) {
      top = nextTop;
      bottom = layoutBlock(base, x, nextTop);
      nextTop = bottom + BAND_GAP;
    }

    const nextAncestors = new Set(ancestors).add(id);
    for (const childId of childrenOf.get(id) ?? []) {
      // A cycle cannot happen in a promotion DAG; the guard only stops a
      // malformed graph from recursing forever.
      if (isMember.has(childId) || ancestors.has(childId) || placed.has(childId)) continue;
      const span = place(childId, nextAncestors);
      top ??= span.top;
      bottom = span.bottom;
      edges.push({
        id: promotionEdgeId(id, childId),
        source: id,
        target: childId,
        kind: 'promotion',
      });
    }

    if (top === null) {
      top = nextTop;
      bottom = nextTop + TREE_NODE_H;
      nextTop = bottom + BAND_GAP;
    }

    nodes.push({
      id,
      kind: 'deployment',
      placement: 'tree',
      x,
      y: (top + bottom) / 2 - TREE_NODE_H / 2,
      width: TREE_NODE_W,
      height: TREE_NODE_H,
    });
    return { top, bottom };
  }

  for (const rootId of roots) {
    if (!placed.has(rootId)) place(rootId, new Set());
  }
  // Only a cycle leaves a tree node unplaced; give it a band of its own.
  for (const d of deployments) {
    if (!placed.has(d.deploymentId) && !isMember.has(d.deploymentId)) {
      place(d.deploymentId, new Set());
    }
  }

  let width = 0;
  let height = 0;
  for (const node of nodes) {
    width = Math.max(width, node.x + node.width);
    height = Math.max(height, node.y + node.height);
  }

  return {
    nodes,
    edges,
    width,
    height,
    frozen: {
      availableWidth,
      cardColumnsByBase,
      stackColumnsByBase,
      cellOrderByBase,
      headerLinesByBase,
    },
  };
}

/**
 * Each Component's tree laid out on its own, then stacked in frames. A
 * Component's columns and cells are frozen by Base like any other, so a poll
 * or an opened stack moves only the frames below it, down.
 */
function computeFramedLayout(
  deployments: readonly ComponentDeployment[],
  model: FoldModel,
  opts: FoldLayoutOptions,
  components: readonly ComponentGroup[],
): FoldLayout {
  const frozen = opts.frozen ?? null;
  const outerWidth = frozen?.availableWidth ?? opts.availableWidth;
  const innerWidth = Math.max(0, outerWidth - 2 * FRAME_PAD_X);
  const byId = new Map(deployments.map((d) => [d.deploymentId, d]));

  const trees = components.map((c) => {
    const members = c.deploymentIds
      .map((id) => byId.get(id))
      .filter((d): d is ComponentDeployment => d !== undefined);
    return layoutComponent(members, model, {
      availableWidth: innerWidth,
      expandedGroupIds: opts.expandedGroupIds,
      frozen: frozen && { ...frozen, availableWidth: innerWidth },
    });
  });
  const placement = placeFrames(
    trees.map((t) => ({ width: t.width, height: t.height - TOP_MARGIN })),
  );

  const nodes: FoldLayoutNode[] = [];
  const edges: FoldLayoutEdge[] = [];
  const cardColumnsByBase = new Map<string, number>();
  const stackColumnsByBase = new Map<string, number>();
  const cellOrderByBase = new Map<string, readonly string[]>();
  const headerLinesByBase = new Map<string, number>();

  components.forEach((c, i) => {
    const frame = placement.frames[i];
    const offset = placement.offsets[i];
    const tree = trees[i];
    nodes.push({
      id: componentFrameId(c.key),
      kind: 'componentFrame',
      componentKey: c.key,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    });
    // The tree's own layout starts at TOP_MARGIN.
    const dy = offset.y - TOP_MARGIN;
    for (const n of tree.nodes) nodes.push({ ...n, x: n.x + offset.x, y: n.y + dy });
    edges.push(...tree.edges);
    for (const [k, v] of tree.frozen.cardColumnsByBase) cardColumnsByBase.set(k, v);
    for (const [k, v] of tree.frozen.stackColumnsByBase) stackColumnsByBase.set(k, v);
    for (const [k, v] of tree.frozen.cellOrderByBase ?? []) cellOrderByBase.set(k, v);
    for (const [k, v] of tree.frozen.headerLinesByBase ?? []) headerLinesByBase.set(k, v);
  });

  return {
    nodes,
    edges,
    width: placement.width,
    height: placement.height,
    frozen: {
      availableWidth: outerWidth,
      cardColumnsByBase,
      stackColumnsByBase,
      cellOrderByBase,
      headerLinesByBase,
    },
  };
}

/**
 * Positions for a folded graph: one Component's tree as it always was, or,
 * for a graph of two or more Components, one framed tree per Component.
 */
export function computeFoldedLayout(
  deployments: readonly ComponentDeployment[],
  model: FoldModel,
  opts: FoldLayoutOptions,
): FoldLayout {
  return opts.components && opts.components.length > 0
    ? computeFramedLayout(deployments, model, opts, opts.components)
    : layoutComponent(deployments, model, opts);
}
