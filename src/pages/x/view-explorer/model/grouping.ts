// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { EMPTY_GROUP_VALUE, compareGroupValues } from '@/components/group-nav/groupOrder';

/**
 * Multi-level grouping of rows that are already sorted. Groups keep the order
 * of the rows inside them, so the sort applies within each group; sibling
 * groups are ordered by `compareGroupValues` (the empty group last), unless a
 * level gives its own order, as the Status level does (most urgent first).
 */

export { EMPTY_GROUP_VALUE };

export interface GroupLevel<R> {
  /** The field id grouped on. */
  field: string;
  /** The group key of a row; empty text and null both go to the empty group. */
  value: (row: R) => string | number | boolean | null;
  /** A fixed order of values; values not listed follow, in `compareGroupValues` order. */
  order?: readonly string[];
  /** How to order two group keys (never the empty group); `compareGroupValues` when absent. */
  compare?: (a: string, b: string) => number;
}

export interface GroupNode<R> {
  /** A path that names the group across renders: `Space=a/Target=b`. */
  key: string;
  depth: number;
  field: string;
  value: string;
  rows: R[];
  children: GroupNode<R>[];
}

function groupKeyOf(v: string | number | boolean | null): string {
  if (v === null || v === '') return EMPTY_GROUP_VALUE;
  return String(v);
}

function siblingOrder(
  order: readonly string[] | undefined,
  compare?: (a: string, b: string) => number,
) {
  return (a: string, b: string): number => {
    if (a !== b && (a === EMPTY_GROUP_VALUE || b === EMPTY_GROUP_VALUE))
      return a === EMPTY_GROUP_VALUE ? 1 : -1;
    if (order) {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) {
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      }
    }
    return compare ? compare(a, b) : compareGroupValues(a, b);
  };
}

/** Group rows level by level. With no levels, the result is no groups. */
export function buildGroupTree<R>(
  rows: readonly R[],
  levels: readonly GroupLevel<R>[],
): GroupNode<R>[] {
  const build = (subset: readonly R[], depth: number, parentKey: string): GroupNode<R>[] => {
    if (depth >= levels.length) return [];
    const level = levels[depth];
    const buckets = new Map<string, R[]>();
    for (const r of subset) {
      const k = groupKeyOf(level.value(r));
      const bucket = buckets.get(k);
      if (bucket) bucket.push(r);
      else buckets.set(k, [r]);
    }
    const values = [...buckets.keys()].sort(siblingOrder(level.order, level.compare));
    return values.map((value) => {
      const key = `${parentKey}${parentKey ? '/' : ''}${level.field}=${value}`;
      const groupRows = buckets.get(value) ?? [];
      return {
        key,
        depth,
        field: level.field,
        value,
        rows: groupRows,
        children: build(groupRows, depth + 1, key),
      };
    });
  };
  return build(rows, 0, '');
}

export type FlatItem<R> =
  | { type: 'group'; node: GroupNode<R> }
  | { type: 'row'; row: R; depth: number };

/**
 * The tree as one list of group headers and rows, for one virtual list.
 * A collapsed group shows its header and nothing under it.
 */
export function flattenGroups<R>(
  rows: readonly R[],
  tree: readonly GroupNode<R>[],
  collapsed: ReadonlySet<string>,
): FlatItem<R>[] {
  if (tree.length === 0) return rows.map((row) => ({ type: 'row', row, depth: 0 }));
  const out: FlatItem<R>[] = [];
  const walk = (nodes: readonly GroupNode<R>[]) => {
    for (const node of nodes) {
      out.push({ type: 'group', node });
      if (collapsed.has(node.key)) continue;
      if (node.children.length) walk(node.children);
      else for (const row of node.rows) out.push({ type: 'row', row, depth: node.depth + 1 });
    }
  };
  walk(tree);
  return out;
}

/** How many rows of a group have each status, in the given order, leaving out zeros. */
export function statusMix<R>(
  rows: readonly R[],
  statusOf: (row: R) => string,
  order: readonly string[],
): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const s = statusOf(r);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const listed = order
    .filter((s) => counts.has(s))
    .map((status) => ({ status, count: counts.get(status) ?? 0 }));
  const rest = [...counts.keys()]
    .filter((s) => !order.includes(s))
    .sort(compareGroupValues)
    .map((status) => ({ status, count: counts.get(status) ?? 0 }));
  return [...listed, ...rest];
}

/** Every group key in a tree, for "collapse all". */
export function allGroupKeys<R>(tree: readonly GroupNode<R>[]): string[] {
  return tree.flatMap((n) => [n.key, ...allGroupKeys(n.children)]);
}
