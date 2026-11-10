// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How the ChangeOrder screens list Spaces: a short run of names, then a count that
 * opens the whole list. A stage can hold 50 or more Spaces whose names differ by
 * one word, so a list that prints all of them cannot be read. The logic here is
 * pure; `SpaceListing.tsx` draws it.
 */

import { plural } from '../changeOrderHistory';

/** How many names a list shows before it folds the rest behind a count. */
export const NAMES_SHOWN = 3;

/** The label that Spaces are grouped by when they have it. */
const PREFERRED_GROUP_KEY = 'region';

/** The group for Spaces that have no value for the chosen label. */
export const OTHER_GROUP_LABEL = 'Other';

/** A Space as the list draws it. `labels` are the Space's labels, when known. */
export interface ListedSpace {
  spaceId: string;
  name: string;
  labels?: Readonly<Record<string, string>>;
  /** Where the name links, for an entry that is not a Space, such as a Target; the Space's page when left out. */
  href?: string;
}

/** The first `limit` items, and how many are left. */
export function capNames<T>(items: readonly T[], limit: number = NAMES_SHOWN): { shown: T[]; more: number } {
  const shown = items.slice(0, Math.max(0, limit));
  return { shown, more: items.length - shown.length };
}

/** The text of the button that opens the whole list: "51 more". */
export function moreText(more: number): string {
  return `${more} more`;
}

/** The name of that button for a screen reader: "Show all 54 Spaces". */
export function showAllName(total: number, noun: string = 'Space'): string {
  return `Show all ${plural(total, noun)}`;
}

/** "a, b and c", or "a, b, c and 51 more" past `limit` names. */
export function namesText(names: readonly string[], limit: number = NAMES_SHOWN): string {
  const { shown, more } = capNames(names, limit);
  if (more > 0) return `${shown.join(', ')} and ${moreText(more)}`;
  if (shown.length < 2) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** One choice in the Group by menu. */
export interface GroupChoice {
  key: string;
  /** Distinct values over the listed Spaces; Spaces with no value count as one. */
  valueCount: number;
}

function valueOf(space: ListedSpace, key: string): string | null {
  const value = space.labels?.[key]?.trim();
  return value === undefined || value === '' ? null : value;
}

/**
 * The labels that split the Spaces into more than one group, and into fewer groups
 * than there are Spaces (a label that is different on every Space only repeats the
 * list). A label named Region comes first, then the others by name.
 */
export function groupChoices(spaces: readonly ListedSpace[]): GroupChoice[] {
  const keys = new Set<string>();
  for (const space of spaces) {
    for (const [key, value] of Object.entries(space.labels ?? {})) if (value.trim() !== '') keys.add(key);
  }
  const choices: GroupChoice[] = [];
  for (const key of keys) {
    // Two spellings that differ only in case are one value, as `groupSpaces` treats them.
    const values = new Set(spaces.map((space) => valueOf(space, key)?.toLowerCase() ?? null));
    if (values.size > 1 && values.size < spaces.length) choices.push({ key, valueCount: values.size });
  }
  const rank = (key: string) => (key.toLowerCase() === PREFERRED_GROUP_KEY ? 0 : 1);
  return choices.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

/** Region when the Spaces can be grouped by it, otherwise no grouping. */
export function defaultGroupKey(choices: readonly GroupChoice[]): string | null {
  return choices.find((choice) => choice.key.toLowerCase() === PREFERRED_GROUP_KEY)?.key ?? null;
}

/** The text of a choice: "Region · 8 values". */
export function groupChoiceText(choice: GroupChoice): string {
  return `${choice.key} · ${plural(choice.valueCount, 'value')}`;
}

/** One group of Spaces. `value` is null for the group of Spaces with no value. */
export interface SpaceGroup {
  id: string;
  value: string | null;
  spaces: ListedSpace[];
}

/** The header of a group: "eu-west · 9 Spaces". */
export function groupHeaderText(group: SpaceGroup): string {
  return `${group.value ?? OTHER_GROUP_LABEL} · ${plural(group.spaces.length, 'Space')}`;
}

const byName = (a: ListedSpace, b: ListedSpace) => a.name.localeCompare(b.name);

/**
 * The Spaces in groups by one label, the groups by value and the Spaces by name. Two
 * spellings that differ only in case are one value. Spaces with no value come last,
 * in the Other group. With no key there is one group, and `value` is null.
 */
export function groupSpaces(spaces: readonly ListedSpace[], key: string | null): SpaceGroup[] {
  if (key === null) return spaces.length === 0 ? [] : [{ id: 'all', value: null, spaces: [...spaces].sort(byName) }];
  const byValue = new Map<string | null, { value: string | null; spaces: ListedSpace[] }>();
  for (const space of spaces) {
    const value = valueOf(space, key);
    const same = value === null ? null : value.toLowerCase();
    const entry = byValue.get(same);
    if (entry) entry.spaces.push(space);
    else byValue.set(same, { value, spaces: [space] });
  }
  return [...byValue.entries()]
    .sort(([a], [b]) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a.localeCompare(b)))
    .map(([same, { value, spaces: members }]) => ({
      id: `v:${same ?? ''}`,
      value,
      spaces: members.sort(byName),
    }));
}

/** The Spaces whose name or a label value holds the text, ignoring case. */
export function filterSpaces(spaces: readonly ListedSpace[], query: string): ListedSpace[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...spaces];
  return spaces.filter(
    (space) =>
      space.name.toLowerCase().includes(needle) ||
      Object.values(space.labels ?? {}).some((value) => value.toLowerCase().includes(needle)),
  );
}

/**
 * What a group of Spaces that took the same change says: "Same in all 54 Spaces". When
 * other Spaces of the stage took a different change, "all" would claim the whole stage,
 * so it says "Same in 50 Spaces".
 */
export function sameInAllText(total: number, wholeStage: boolean = true): string {
  return wholeStage ? `Same in all ${plural(total, 'Space')}` : `Same in ${plural(total, 'Space')}`;
}

/**
 * The accessible name of a button that opens a list. It holds the button's visible text,
 * so a person who speaks the visible words reaches it: "+51 more: Show all 54 Spaces".
 */
export function buttonName(visible: string | undefined, total: number, noun: string = 'Space'): string {
  const name = showAllName(total, noun);
  return visible === undefined || visible === '' || name.includes(visible) ? name : `${visible}: ${name}`;
}

/** Rows drawn at once in an opened list; more come on request, so 5000 Spaces stay fast. */
export const ROWS_SHOWN = 200;

/** Groups are open at first when the whole list is short. */
export const OPEN_GROUPS_UP_TO = 12;
