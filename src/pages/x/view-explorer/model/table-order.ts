// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { EntityRow } from './fields';
import { buildGroupTree, flattenGroups, type GroupNode } from './grouping';
import { groupLevelsFor } from './sort';
import type { EntityKind } from './types';

/**
 * The order the Table shows its rows in, as if no group were folded: the
 * sorted rows, regrouped level by level. The row panel's ↑/↓ and the slot
 * letters both follow this order, so "the next row" and "the first five rows"
 * mean the same rows the viewer reads from top to bottom.
 */

function rowsInTreeOrder(rows: readonly EntityRow[], tree: readonly GroupNode<EntityRow>[]): readonly EntityRow[] {
  if (!tree.length) return rows;
  return flattenGroups(rows, tree, new Set())
    .filter((i): i is Extract<typeof i, { type: 'row' }> => i.type === 'row')
    .map((i) => i.row);
}

export function orderedRows(rows: readonly EntityRow[], groupBy: readonly string[], entity: EntityKind): readonly EntityRow[] {
  if (!groupBy.length) return rows;
  return rowsInTreeOrder(rows, buildGroupTree(rows, groupLevelsFor(entity, groupBy)));
}

/** The Table's order with its group tree and each row's place in it, for the row panel's moves (one lookup per key). */
export interface TableOrder {
  tree: GroupNode<EntityRow>[];
  ordered: readonly EntityRow[];
  index: ReadonlyMap<string, number>;
}

export function tableOrder(
  rows: readonly EntityRow[],
  groupBy: readonly string[],
  entity: EntityKind,
  rowId: (row: EntityRow) => string,
): TableOrder {
  const tree = groupBy.length ? buildGroupTree(rows, groupLevelsFor(entity, groupBy)) : [];
  const ordered = rowsInTreeOrder(rows, tree);
  return { tree, ordered, index: new Map(ordered.map((r, i) => [rowId(r), i])) };
}

export function orderedRowIds(
  rows: readonly EntityRow[],
  groupBy: readonly string[],
  entity: EntityKind,
  rowId: (row: EntityRow) => string,
): string[] {
  return orderedRows(rows, groupBy, entity).map(rowId);
}
