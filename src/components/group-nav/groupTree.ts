// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { EMPTY_GROUP_VALUE, compareGroupValues } from './groupOrder';
import { ALL_GROUPS } from './types';

/*
 * The group tree as data, kept free of React and the DOM so the specs can
 * import it. `GroupNavPanel` builds the tree, and `GroupNavTree` renders the
 * rows `flattenVisible` returns: only the rows on screen are in the DOM, so
 * the panel stays fast with thousands of groups.
 */

/** Geometry of a tree row, shared by `GroupNavTree` and `measureGroupNavWidth`. */
export const TREE_LAYOUT = {
  /** Horizontal padding of the panel body, each side. */
  bodyPaddingX: 8,
  /** Top padding of the panel body: where the first row starts in the scroll element. */
  bodyPaddingTop: 4,
  /** Height of one row. */
  rowHeight: 31,
  /** Space under each row. */
  rowGap: 2,
  /** Horizontal padding inside a row, each side. */
  rowPaddingX: 8,
  /** Offset of each level from its parent. The guide line of the level is at `guideOffset`. */
  indent: 29,
  /** Where an ancestor level's dashed guide line is, from the left of that level. */
  guideOffset: 16,
  /** Width of the chevron slot. */
  chevronWidth: 20,
  /** Gap between the chevron slot and the label. */
  chevronGap: 8,
  /** Inset of the label after the gap. */
  labelPaddingLeft: 4,
  /** Gap between a row's icon and its text. */
  iconGap: 6,
  /** Space for the row's icon. */
  iconWidth: 20,
  /** Gap between the text and the count. */
  countPaddingLeft: 8,
} as const;

export interface GroupTreeNode {
  /** The path joined with `\0`. */
  id: string;
  label: string;
  count: number;
  /** Values chosen at each level, up to and including this node. */
  path: string[];
  /** 0-indexed level of this node. */
  depth: number;
  /** True for an item's own node (a leaf). */
  isItem: boolean;
  children: GroupTreeNode[];
}

/** One row of the tree as it is on screen. */
export interface FlatTreeRow {
  /** `ALL_GROUPS` for the "All" row, else the node's id. */
  id: string;
  label: string;
  count: number;
  /** `[]` for the "All" row. */
  path: string[];
  /** 0-indexed level; the "All" row and the top-level nodes are 0. */
  depth: number;
  isAll: boolean;
  isItem: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  /** Number of siblings, this row included (`aria-setsize`). */
  setSize: number;
  /** 1-based position among the siblings (`aria-posinset`). */
  posInSet: number;
  /** Index of the parent row in the returned list; -1 at the top level. */
  parentIndex: number;
}

/**
 * Buckets `items` by `groupByColumns[depth]`, then recurses one level down.
 * Under the last level, `leaf` makes each item a node of its own.
 */
export function buildGroupTree<T>(
  items: T[],
  groupByColumns: string[],
  depth: number,
  parentPath: string[],
  getValue: (item: T, column: string) => string,
  leaf?: { getId: (item: T) => string; getCount?: (item: T) => number },
): GroupTreeNode[] {
  if (depth >= groupByColumns.length) {
    if (!leaf) return [];
    return items
      .map((item) => {
        const label = leaf.getId(item);
        const path = [...parentPath, label];
        return {
          id: path.join('\0'),
          label,
          count: leaf.getCount ? leaf.getCount(item) : 1,
          path,
          depth,
          isItem: true,
          children: [],
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const column = groupByColumns[depth];
  const buckets = new Map<string, T[]>();

  for (const item of items) {
    const val = getValue(item, column) || EMPTY_GROUP_VALUE;
    let bucket = buckets.get(val);
    if (!bucket) {
      bucket = [];
      buckets.set(val, bucket);
    }
    bucket.push(item);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => compareGroupValues(a, b))
    .map(([value, bucketItems]) => {
      const path = [...parentPath, value];
      return {
        id: path.join('\0'),
        label: value,
        count: bucketItems.length,
        path,
        depth,
        isItem: false,
        children: buildGroupTree(bucketItems, groupByColumns, depth + 1, path, getValue, leaf),
      };
    });
}

/**
 * IDs of all ancestors of the selected path. For `[a, b, c]` the selected
 * node is `a\0b\0c` and its ancestors are `a` and `a\0b`. Expanded on first
 * load so that a deep-linked selection is visible.
 */
export function ancestorIds(selectedGroups: string[] | null): string[] {
  if (!selectedGroups) return [];
  const ids: string[] = [];
  for (let i = 1; i < selectedGroups.length; i++) {
    ids.push(selectedGroups.slice(0, i).join('\0'));
  }
  return ids;
}

/**
 * The rows of the tree on screen, in order: the "All" row, then each node
 * whose ancestors are all in `expanded`. The "All" row is a sibling of the
 * top-level nodes. Linear in the number of rows returned, plus the top level.
 */
export function flattenVisible(
  tree: GroupTreeNode[],
  expanded: ReadonlySet<string>,
  all: { label: string; count: number },
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [
    {
      id: ALL_GROUPS,
      label: all.label,
      count: all.count,
      path: [],
      depth: 0,
      isAll: true,
      isItem: false,
      hasChildren: false,
      isExpanded: false,
      setSize: tree.length + 1,
      posInSet: 1,
      parentIndex: -1,
    },
  ];

  const visit = (nodes: GroupTreeNode[], parentIndex: number, posOffset: number) => {
    const setSize = nodes.length + posOffset;
    nodes.forEach((node, i) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = hasChildren && expanded.has(node.id);
      const index = rows.length;
      rows.push({
        id: node.id,
        label: node.label,
        count: node.count,
        path: node.path,
        depth: node.depth,
        isAll: false,
        isItem: node.isItem,
        hasChildren,
        isExpanded,
        setSize,
        posInSet: i + 1 + posOffset,
        parentIndex,
      });
      if (isExpanded) visit(node.children, index, 0);
    });
  };
  // The top-level nodes follow the "All" row in the same set.
  visit(tree, -1, 1);
  return rows;
}

/**
 * The row type-ahead moves to: the first row after `fromIndex` whose label
 * starts with `char` (ignoring case), wrapping round to the start. -1 when no
 * row matches.
 */
export function findTypeAheadIndex(rows: FlatTreeRow[], fromIndex: number, char: string): number {
  const needle = char.toLowerCase();
  for (let step = 1; step <= rows.length; step++) {
    const i = (fromIndex + step) % rows.length;
    if (rows[i].label.toLowerCase().startsWith(needle)) return i;
  }
  return -1;
}
