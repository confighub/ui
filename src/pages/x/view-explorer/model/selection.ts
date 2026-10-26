// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { letterFor } from '@/pages/x/apps/compare/slotLetter';

import { MAX_COMPARE_SLOTS } from './compare';

/**
 * The rows picked in the Table, by row id. What counts is the stored set
 * intersected with the rows shown: a row a filter hides is not part of the
 * selection while it is hidden, and comes back when the filter goes.
 *
 * The anchor is the row a ⇧-click range starts from: the row last clicked.
 */

export interface RowSelection {
  ids: ReadonlySet<string>;
  anchor: string | null;
}

export const EMPTY_SELECTION: RowSelection = { ids: new Set(), anchor: null };

export function toggle(selection: RowSelection, id: string): RowSelection {
  const ids = new Set(selection.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ids, anchor: id };
}

/**
 * Pick one row and leave it picked: the selection itself when it already is,
 * so a second pick changes nothing.
 */
export function pick(selection: RowSelection, id: string): RowSelection {
  if (selection.ids.has(id)) return selection;
  return { ids: new Set(selection.ids).add(id), anchor: id };
}

/**
 * The rows from the anchor to the target, both included, in the order given.
 * With no anchor, or one not in the order (folded away, filtered out), the
 * range is the target alone.
 */
export function rangeBetween(order: readonly string[], anchor: string | null, target: string): string[] {
  const to = order.indexOf(target);
  if (to === -1) return [];
  const from = anchor === null ? -1 : order.indexOf(anchor);
  if (from === -1) return [target];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return order.slice(lo, hi + 1);
}

/**
 * A ⇧-click: every row of the range takes the state the target is changing
 * to, so ⇧-click on an unpicked row picks the range and on a picked row
 * unpicks it. The anchor stays, so a second ⇧-click resizes the same range.
 */
export function applyRange(selection: RowSelection, order: readonly string[], target: string): RowSelection {
  const range = rangeBetween(order, selection.anchor, target);
  if (range.length === 0) return selection;
  const pick = !selection.ids.has(target);
  const ids = new Set(selection.ids);
  for (const id of range) {
    if (pick) ids.add(id);
    else ids.delete(id);
  }
  const anchor = selection.anchor !== null && order.includes(selection.anchor) ? selection.anchor : target;
  return { ids, anchor };
}

export function selectAll(selection: RowSelection, ids: readonly string[]): RowSelection {
  const next = new Set(selection.ids);
  for (const id of ids) next.add(id);
  return { ids: next, anchor: selection.anchor };
}

/** Unpick the given rows (the shown ones), keeping any a filter hides. */
export function unselect(selection: RowSelection, ids: readonly string[]): RowSelection {
  const next = new Set(selection.ids);
  for (const id of ids) next.delete(id);
  return { ids: next, anchor: next.size ? selection.anchor : null };
}

export function clear(): RowSelection {
  return EMPTY_SELECTION;
}

/** Drop rows that no longer exist at all (deleted, or no longer visible to the viewer). */
export function prune(selection: RowSelection, universeIds: ReadonlySet<string>): RowSelection {
  let removed = false;
  const ids = new Set<string>();
  for (const id of selection.ids) {
    if (universeIds.has(id)) ids.add(id);
    else removed = true;
  }
  if (!removed) return selection;
  const anchor = selection.anchor !== null && ids.has(selection.anchor) ? selection.anchor : null;
  return { ids, anchor };
}

/** The selection that counts: the picked rows that are shown. */
export function effective(selection: RowSelection, shownIds: ReadonlySet<string>): ReadonlySet<string> {
  if (selection.ids.size === 0) return selection.ids;
  const out = new Set<string>();
  for (const id of selection.ids) if (shownIds.has(id)) out.add(id);
  return out;
}

/** The picked rows in table order. */
export function orderedPicked(tableOrder: readonly string[], picked: ReadonlySet<string>): string[] {
  if (picked.size === 0) return [];
  return tableOrder.filter((id) => picked.has(id));
}

/**
 * What a comparison of the selection holds: the first five picked rows in
 * table order, and how many picked rows are left out.
 */
export function compareSet(picked: ReadonlySet<string>, tableOrder: readonly string[]): { ids: string[]; overflow: number } {
  const ordered = orderedPicked(tableOrder, picked);
  return { ids: ordered.slice(0, MAX_COMPARE_SLOTS), overflow: Math.max(0, ordered.length - MAX_COMPARE_SLOTS) };
}

/** The slot letter (A–E) of each of the first five picked rows, in table order. */
export function slotLetters(tableOrder: readonly string[], picked: ReadonlySet<string>): ReadonlyMap<string, string> {
  const letters = new Map<string, string>();
  if (picked.size === 0) return letters;
  for (const id of tableOrder) {
    if (!picked.has(id)) continue;
    letters.set(id, letterFor(letters.size));
    if (letters.size === MAX_COMPARE_SLOTS) break;
  }
  return letters;
}

/** True when both lists hold the same ids in the same order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** A change to the selection that the Functions panel asks for (`panelChange`). */
export interface PanelChange {
  clear: boolean;
  removed: readonly string[];
  added: readonly string[];
}

/**
 * A change the Functions panel made to its list of Units, as a change to the
 * selection. `known` is the list the panel had from the explorer, `list` the
 * one it has now. A Unit taken out is unpicked, the last one too: rows a filter
 * hides stay picked. `removedAll` (the panel's "deselect all") clears the
 * selection, hidden rows included, as Clear does. A Unit put in is picked only
 * when the table shows it. Null when nothing in the selection changes: then
 * the table cannot show the panel's list.
 */
export function panelChange(
  known: readonly string[],
  list: readonly string[],
  shownIds: ReadonlySet<string>,
  removedAll = false,
): PanelChange | null {
  if (list.length === 0 && removedAll) return known.length > 0 ? { clear: true, removed: known, added: [] } : null;
  const inList = new Set(list);
  const wasKnown = new Set(known);
  const removed = known.filter((id) => !inList.has(id));
  const added = list.filter((id) => !wasKnown.has(id) && shownIds.has(id));
  return removed.length > 0 || added.length > 0 ? { clear: false, removed, added } : null;
}

export function applyPanelChange(selection: RowSelection, change: PanelChange): RowSelection {
  if (change.clear) return EMPTY_SELECTION;
  return selectAll(unselect(selection, change.removed), change.added);
}
