// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { letterFor } from '@/pages/x/apps/compare/slotLetter';

import type { ExplorerState } from './types';

/**
 * A comparison of Units: their UnitIDs in slot order, slot A first. Every
 * change to the slots goes through these functions, so a Unit is never held
 * twice and there are never more than five slots, whichever control made the
 * change (a slot's ✕, the swap, a drag, the picker, the rail).
 */

/** Slots go up to E: wider than five columns, the grid stops being readable. */
export const MAX_COMPARE_SLOTS = 5;

/** `?compare=<UnitID>,<UnitID>,…`, slot A first. */
export const COMPARE_PARAM = 'compare';

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function encodeCompareParam(ids: readonly string[]): string {
  return ids.join(',');
}

export interface DecodedCompareParam {
  ids: string[];
  /** Parts that are not UnitIDs. */
  invalid: number;
  /** UnitIDs given more than once; the first is kept. */
  duplicates: number;
  /** UnitIDs past the fifth slot. */
  overflow: number;
}

/**
 * The UnitIDs of a `compare` parameter, slot A first. What is dropped is
 * counted by reason, so the page can say what it could not use: a part it
 * could not read, a Unit named twice, or one past slot E.
 */
export function decodeCompareParam(raw: string | null | undefined): DecodedCompareParam {
  const out: DecodedCompareParam = { ids: [], invalid: 0, duplicates: 0, overflow: 0 };
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const id = part.trim().toLowerCase();
    if (id === '') continue;
    if (!UUID.test(id)) out.invalid++;
    else if (out.ids.includes(id)) out.duplicates++;
    else if (out.ids.length >= MAX_COMPARE_SLOTS) out.overflow++;
    else out.ids.push(id);
  }
  return out;
}

/** Add a Unit to the next empty slot; a Unit already held, or a sixth, changes nothing. */
export function addSlot(ids: readonly string[], id: string): readonly string[] {
  if (ids.includes(id) || ids.length >= MAX_COMPARE_SLOTS) return ids;
  return [...ids, id];
}

/**
 * Add a Unit to the next empty slot, and say what happened: the letter it
 * took, the letter that already holds it, or that every slot is in use.
 */
export function fillNextSlot(
  ids: readonly string[],
  id: string,
): { ids: readonly string[]; result: { kind: 'added'; letter: string } | { kind: 'held'; letter: string } | { kind: 'full' } } {
  const at = ids.indexOf(id);
  if (at !== -1) return { ids, result: { kind: 'held', letter: letterFor(at) } };
  if (ids.length >= MAX_COMPARE_SLOTS) return { ids, result: { kind: 'full' } };
  return { ids: [...ids, id], result: { kind: 'added', letter: letterFor(ids.length) } };
}

/** Clear a slot; the slots after it move left, so there is never a gap. */
export function removeSlot(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : ids;
}

export function swapFirstTwo(ids: readonly string[]): readonly string[] {
  if (ids.length < 2) return ids;
  return [ids[1], ids[0], ...ids.slice(2)];
}

/**
 * Swap the Units in two slots, as a drag of one slot onto another does. An
 * index outside the slots changes nothing.
 */
export function reorderSlots(ids: readonly string[], from: number, to: number): readonly string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * Put a Unit in a slot that is filled. A Unit already held in another slot
 * trades places with the one being replaced, so it is never held twice.
 */
export function replaceSlot(ids: readonly string[], index: number, id: string): readonly string[] {
  if (index < 0 || index >= ids.length || ids[index] === id) return ids;
  const held = ids.indexOf(id);
  if (held !== -1) return reorderSlots(ids, held, index);
  const next = [...ids];
  next[index] = id;
  return next;
}

const NO_IDS: readonly string[] = [];

/** The Units a tab compares, slot A first; empty when it compares none. */
export function compareIdsFor(state: ExplorerState, tabId: string): readonly string[] {
  return state.compare?.[tabId] ?? NO_IDS;
}

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The state with the active tab comparing `ids`: no Unit twice, at most five,
 * and an empty list ends the comparison. Only a Units view compares.
 */
export function withCompare(state: ExplorerState, ids: readonly string[]): ExplorerState {
  const tab = state.tabs.find((t) => t.id === state.activeId);
  if (!tab || tab.work.entity !== 'Unit') return state;
  const next = [...new Set(ids)].slice(0, MAX_COMPARE_SLOTS);
  if (sameIds(compareIdsFor(state, tab.id), next)) return state;
  const compare: Record<string, readonly string[]> = { ...state.compare };
  delete compare[tab.id];
  if (next.length) compare[tab.id] = next;
  return { ...state, compare: Object.keys(compare).length ? compare : undefined };
}

/**
 * Keep the comparisons in line with the tabs after a reducer step, so every
 * action follows the same rules:
 *
 * - A tab that closed, or that no longer lists Units, compares nothing.
 * - The first edit of "All units" forks it into a new tab (`forkId`, which
 *   the reducer names before the step). That is still the view the Units are
 *   compared in, so the fork starts with the comparison "All units" had; the
 *   built-in tab keeps its own.
 * - Moving between tabs changes nothing: each tab keeps its comparison.
 *
 * The state comes back unchanged (the same object) when no rule applies.
 */
export function reconcileCompare(prev: ExplorerState, next: ExplorerState, forkId: string | null): ExplorerState {
  let compare = next.compare;
  const from = prev.compare?.[prev.activeId];
  const forked = !!forkId && next.activeId === forkId && prev.activeId !== forkId && !prev.tabs.some((t) => t.id === forkId);
  if (from && forked && !compare?.[forkId]) compare = { ...compare, [forkId]: from };
  if (!compare) return next;
  const kept: Record<string, readonly string[]> = {};
  let changed = compare !== next.compare;
  for (const [tabId, ids] of Object.entries(compare)) {
    if (next.tabs.some((t) => t.id === tabId && t.work.entity === 'Unit')) kept[tabId] = ids;
    else changed = true;
  }
  if (!changed) return next;
  return { ...next, compare: Object.keys(kept).length ? kept : undefined };
}

/**
 * What the page says about a link's `compare` parameter when it could not
 * use all of it, in plain words; null when it used all of it. `listsUnits` is
 * false when the link opens a view of Spaces or Resources, which compares
 * nothing.
 */
export function compareLinkNotice(decoded: DecodedCompareParam, listsUnits: boolean): string | null {
  const { ids, invalid, duplicates, overflow } = decoded;
  if (!listsUnits) return ids.length || invalid ? 'The link’s comparison was left out, because this view does not list Units.' : null;
  if (ids.length === 0) return invalid ? 'The link’s comparison could not be read, so the table is shown.' : null;
  const parts: string[] = [];
  if (invalid) parts.push(invalid === 1 ? '1 entry is not a Unit ID and was left out' : `${invalid} entries are not Unit IDs and were left out`);
  if (duplicates) parts.push(duplicates === 1 ? '1 Unit is named twice and is compared once' : `${duplicates} Units are named twice and are compared once`);
  if (overflow) parts.push(`only five Units fit, so ${overflow} ${overflow === 1 ? 'was' : 'were'} left out`);
  return parts.length ? `In the link’s comparison, ${parts.join('; ')}.` : null;
}
