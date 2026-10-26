// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedUnitRead } from '@confighub/rtk-query';

import { letterFor } from '@/pages/x/apps/compare/slotLetter';

import type { GroupNode } from '../model/grouping';
import { idOf } from './unit-row';

/**
 * What the Unit picker offers to compare a Unit with, all from the Units the
 * page has already loaded: the same slug in other Spaces (how Components
 * pairs Units), the upstream Unit it merges from, and the other Units of its
 * group in the table. Each Unit is offered once. The upstream Unit is
 * offered as the upstream even when it shares the slug, since that is what
 * says how far ahead it is; any other Unit goes in the first section that
 * holds it. A Unit already in a slot is offered with its letter, so the
 * picker can show it as taken.
 */

export type PickerSectionId = 'same-slug' | 'upstream' | 'group' | 'search';

export interface PickerOption {
  id: string;
  row: ExtendedUnitRead;
  /** The slot letter that already holds this Unit. */
  slot?: string;
}

export interface PickerSection {
  id: PickerSectionId;
  title: string;
  /** A second, quieter line: why the section is there, or the group it is. */
  hint: string;
  options: PickerOption[];
}

export interface PickerSectionsInput {
  /** The Unit the comparison is with: slot A, or the Unit being replaced. */
  base: ExtendedUnitRead;
  /** Every Unit the page has loaded. */
  universe: readonly ExtendedUnitRead[];
  /** The rows of the innermost table group that holds the base, and its value; absent when the view is not grouped. */
  group?: { value: string; rows: readonly ExtendedUnitRead[] };
  /** The UnitIDs in the slots, slot A first. */
  taken: readonly string[];
}

const slugOf = (row: ExtendedUnitRead) => row.Unit?.Slug ?? '';
const spaceOf = (row: ExtendedUnitRead) => row.Space?.Slug ?? '';

// One collator for every sort here: it orders as localeCompare does, many times faster over thousands of Units.
const collator = new Intl.Collator();

const bySpaceThenSlug = (a: ExtendedUnitRead, b: ExtendedUnitRead) =>
  collator.compare(spaceOf(a), spaceOf(b)) || collator.compare(slugOf(a), slugOf(b));

function option(row: ExtendedUnitRead, taken: readonly string[]): PickerOption {
  const id = idOf(row);
  const at = taken.indexOf(id);
  return at === -1 ? { id, row } : { id, row, slot: letterFor(at) };
}

export function buildPickerSections({ base, universe, group, taken }: PickerSectionsInput): PickerSection[] {
  const baseId = idOf(base);
  const upstreamId = base.Unit?.UpstreamUnitID;
  const upstream = upstreamId && upstreamId !== baseId ? universe.find((r) => idOf(r) === upstreamId) : undefined;
  const seen = new Set<string>([baseId]);
  if (upstream) seen.add(idOf(upstream));
  const take = (rows: readonly ExtendedUnitRead[]) =>
    rows.filter((r) => {
      const id = idOf(r);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const sections: PickerSection[] = [];

  const sameSlug = take(universe.filter((r) => slugOf(r) === slugOf(base)).sort(bySpaceThenSlug));
  if (sameSlug.length)
    sections.push({ id: 'same-slug', title: 'Same slug in other Spaces', hint: 'How Components pairs Units', options: sameSlug.map((r) => option(r, taken)) });

  if (upstream)
    sections.push({ id: 'upstream', title: 'Upstream', hint: 'The Link this Unit merges from', options: [option(upstream, taken)] });

  const groupRows = group ? take(group.rows) : [];
  if (group && groupRows.length)
    sections.push({ id: 'group', title: 'In this group', hint: group.value, options: groupRows.map((r) => option(r, taken)) });

  return sections;
}

/**
 * The innermost group of a table grouping that holds a row (the group the
 * row is drawn under), for the picker's "In this group"; undefined when the
 * view is not grouped or the row is not shown.
 */
export function innermostGroup<R>(nodes: readonly GroupNode<R>[], row: R): GroupNode<R> | undefined {
  for (const node of nodes) {
    if (!node.rows.includes(row)) continue;
    return innermostGroup(node.children, row) ?? node;
  }
  return undefined;
}

/** The first Unit the picker would suggest that is not already in a slot, for the empty slot's "Suggested: …". */
export function suggestForEmptySlot(sections: readonly PickerSection[]): PickerOption | undefined {
  for (const section of sections) {
    const free = section.options.find((o) => !o.slot);
    if (free) return free;
  }
  return undefined;
}

/**
 * How many revisions the upstream Unit has that this Unit has not merged; null
 * when it has no upstream or the numbers are not known.
 */
export function upstreamAhead(row: ExtendedUnitRead, upstreamRow: ExtendedUnitRead | undefined): number | null {
  const head = upstreamRow?.Unit?.HeadRevisionNum;
  const merged = row.Unit?.UpstreamRevisionNum;
  if (!row.Unit?.UpstreamUnitID || head === undefined || merged === undefined) return null;
  return Math.max(0, head - merged);
}

export interface SearchOptions {
  /** The Unit being compared with: Units of its slug rank first after an exact match. */
  base?: ExtendedUnitRead;
  taken: readonly string[];
  limit?: number;
}

interface SearchIndex {
  /** The Units in Space then slug order, so a search needs no sort of its own. */
  rows: readonly ExtendedUnitRead[];
  /** What a query is matched against, one per row: slug, Space, Target and display name, in lower case. */
  hay: readonly string[];
}

// Built once per list of Units (the universe is replaced, not changed, when it is read again).
const indexes = new WeakMap<readonly ExtendedUnitRead[], SearchIndex>();

function searchIndex(universe: readonly ExtendedUnitRead[]): SearchIndex {
  let index = indexes.get(universe);
  if (!index) {
    const rows = [...universe].sort(bySpaceThenSlug);
    const hay = rows.map((r) => [slugOf(r), spaceOf(r), r.Target?.Slug ?? '', r.Unit?.DisplayName ?? ''].join('\n').toLowerCase());
    index = { rows, hay };
    indexes.set(universe, index);
  }
  return index;
}

/**
 * Units whose slug, Space, Target or display name holds every word of the
 * query, ignoring case. An exact slug ranks first, then the base's slug, then
 * Space and slug. `total` counts every match, so the picker can say when it
 * shows only the first `limit`.
 *
 * One pass over thousands of Units per keystroke: the Units are sorted and
 * their text joined once, and the three ranks are kept as three lists in
 * that order, so nothing is sorted per query.
 */
export function searchUnits(
  universe: readonly ExtendedUnitRead[],
  query: string,
  { base, taken, limit = 100 }: SearchOptions,
): { options: PickerOption[]; total: number } {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { options: [], total: 0 };
  const baseId = base ? idOf(base) : '';
  const baseSlug = base ? slugOf(base) : '';
  const q = query.trim().toLowerCase();
  const { rows, hay } = searchIndex(universe);
  const ranks: ExtendedUnitRead[][] = [[], [], []];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!tokens.every((t) => hay[i].includes(t)) || idOf(r) === baseId) continue;
    const slug = slugOf(r);
    ranks[slug.toLowerCase() === q ? 0 : baseSlug && slug === baseSlug ? 1 : 2].push(r);
  }
  const total = ranks[0].length + ranks[1].length + ranks[2].length;
  const first = ranks.flat().slice(0, limit);
  return { options: first.map((r) => option(r, taken)), total };
}
