// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { innermostGroup } from '../compare/suggest';
import { EMPTY_GROUP_VALUE, type GroupNode } from '../model/grouping';
import type { StatusKind } from '../model/types';
import type { RowClass } from './attention';
import { GROUP } from './copy';

/**
 * Where the open Unit sits in the view: the counts of the innermost table
 * group that holds it, and the next Unit, in table order, that needs
 * attention. All from the rows already loaded; nothing is fetched.
 */

/** The order the panel lists the statuses in: the table's group order of its Status column. */
export const STATUS_COUNT_ORDER: readonly StatusKind[] = ['unreleased', 'upgradable', 'untargeted', 'released'];

/** Per status: how many Units the table shows with it, and how many of them a gate blocks. */
export type StatusCounts = Record<StatusKind, { count: number; gated: number }>;

export interface GroupSummary {
  /** The group's key in the table's tree; '' for a view with no groups. */
  key: string;
  /** "In payments-prod", "Toolchain: Kubernetes/YAML", or "In this view" when the view is not grouped. */
  label: string;
  total: number;
  counts: StatusCounts;
  /** Units that are gated, unreleased or have an upgrade. */
  needing: number;
}

/** The fields whose groups are places, which read "In <value>". */
const PLACE_FIELDS: ReadonlySet<string> = new Set(['Space', 'Target']);

export function groupLabel(node: { field: string; value: string } | undefined, fieldLabel: (field: string) => string): string {
  if (!node) return GROUP.ungrouped;
  const empty = node.value === EMPTY_GROUP_VALUE || node.value === '';
  if (PLACE_FIELDS.has(node.field) && !empty) return GROUP.place(node.value);
  return GROUP.field(fieldLabel(node.field), empty ? GROUP.notSet : node.value);
}

/** A group as a place to name in a sentence: "payments-staging", "app checkout". */
export function groupName(node: { field: string; value: string }, fieldLabel: (field: string) => string): string {
  const empty = node.value === EMPTY_GROUP_VALUE || node.value === '';
  if (PLACE_FIELDS.has(node.field) && !empty) return node.value;
  return `${fieldLabel(node.field)} ${empty ? GROUP.notSet.toLowerCase() : node.value}`;
}

export function countStatuses<R>(rows: readonly R[], classOf: (row: R) => RowClass): { counts: StatusCounts; needing: number } {
  const counts = Object.fromEntries(STATUS_COUNT_ORDER.map((s) => [s, { count: 0, gated: 0 }])) as StatusCounts;
  let needing = 0;
  for (const r of rows) {
    const c = classOf(r);
    counts[c.status].count += 1;
    if (c.gated) counts[c.status].gated += 1;
    if (c.needs) needing += 1;
  }
  return { counts, needing };
}

/**
 * The group the table draws `row` (a shown row) under, with its counts; the
 * whole shown set for a view with no groups. Null when the groups do not hold
 * the row. A group already
 * in `cache` (by its key) is not counted again, so moving from row to row
 * inside a group costs no count; the cache belongs to one set of rows.
 */
export function summarizeGroup<R>({
  tree,
  shown,
  row,
  classOf,
  fieldLabel,
  cache,
}: {
  tree: readonly GroupNode<R>[];
  shown: readonly R[];
  row: R;
  classOf: (row: R) => RowClass;
  fieldLabel: (field: string) => string;
  cache?: Map<string, GroupSummary>;
}): GroupSummary | null {
  const node = tree.length ? innermostGroup(tree, row) : undefined;
  if (tree.length && !node) return null;
  const key = node?.key ?? '';
  const cached = cache?.get(key);
  if (cached) return cached;
  const rows = node ? node.rows : shown;
  const summary = { key, label: groupLabel(node, fieldLabel), total: rows.length, ...countStatuses(rows, classOf) };
  cache?.set(key, summary);
  return summary;
}

/**
 * The index of the next row after `from` (or before it, for `dir` -1), in
 * table order, that needs attention. It wraps past the end, and never returns
 * `from` itself; null when no other row needs attention.
 */
export function nextProblemIndex<R>(ordered: readonly R[], from: number, dir: 1 | -1, needs: (row: R) => boolean): number | null {
  const n = ordered.length;
  if (n === 0) return null;
  const start = from >= 0 && from < n ? from : dir === 1 ? -1 : n;
  for (let step = 1; step <= n; step++) {
    const i = (((start + dir * step) % n) + n) % n;
    if (i === from) return null;
    if (needs(ordered[i])) return i;
  }
  return null;
}
