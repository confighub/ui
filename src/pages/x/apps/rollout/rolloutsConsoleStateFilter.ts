// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Rollouts console's State filter: one selection of `ConsoleState`s, read
 * and written by two controls — the summary cards and the State dropdown.
 *
 * Both controls derive what they show from the selection and write a new
 * selection back, so neither keeps a value of its own and they cannot
 * disagree. A card is a shortcut for "exactly this group's states"; the
 * dropdown edits the same set one state, or one heading, at a time.
 *
 * Pure, so the rules are tested without a page.
 */

import { CONSOLE_GROUPS, CONSOLE_STATES, consoleGroupOf } from './rolloutsConsoleModel';
import type { ConsoleGroup, ConsoleState } from './rolloutsConsoleModel';
import { rolloutsConsoleCopy } from './rolloutsConsoleCopy';

/** The selected states. Empty means no filter: every row shows. */
export type StateSelection = ReadonlySet<ConsoleState>;

export const NO_STATES: StateSelection = new Set();

/**
 * A heading in the dropdown: one per card, then `other` for the states no
 * card counts, so those rows can still be filtered to.
 */
export type StateSection = ConsoleGroup | 'other';

export const STATE_SECTIONS: readonly StateSection[] = [...CONSOLE_GROUPS, 'other'];

function sectionOf(state: ConsoleState): StateSection {
  return consoleGroupOf(state) ?? 'other';
}

const SECTION_STATES: Readonly<Record<StateSection, readonly ConsoleState[]>> = {
  'needs-you': CONSOLE_STATES.filter((s) => sectionOf(s) === 'needs-you'),
  stuck: CONSOLE_STATES.filter((s) => sectionOf(s) === 'stuck'),
  'in-progress': CONSOLE_STATES.filter((s) => sectionOf(s) === 'in-progress'),
  finished: CONSOLE_STATES.filter((s) => sectionOf(s) === 'finished'),
  other: CONSOLE_STATES.filter((s) => sectionOf(s) === 'other'),
};

/** The states under one heading, in `CONSOLE_STATES` order. */
export function statesInSection(section: StateSection): readonly ConsoleState[] {
  return SECTION_STATES[section];
}

export function sectionLabel(section: StateSection): string {
  return section === 'other' ? rolloutsConsoleCopy.filters.otherStates : rolloutsConsoleCopy.groups[section].label;
}

export function rowMatchesStates(selection: StateSelection, state: ConsoleState): boolean {
  return selection.size === 0 || selection.has(state);
}

function equalsSection(selection: StateSelection, section: StateSection): boolean {
  const states = SECTION_STATES[section];
  return selection.size === states.length && states.every((s) => selection.has(s));
}

/**
 * How a summary card reads the selection.
 *
 * `on` only when the selection is exactly the card's group, because that is
 * the selection a click on the card makes. `partial` when the dropdown has
 * narrowed or widened it, so the card does not claim a filter it did not set.
 */
export type CardStatus = 'on' | 'partial' | 'off';

export function groupCardStatus(selection: StateSelection, group: ConsoleGroup): CardStatus {
  if (equalsSection(selection, group)) return 'on';
  return SECTION_STATES[group].some((s) => selection.has(s)) ? 'partial' : 'off';
}

/**
 * A card click. An `on` card clears the filter; any other card replaces the
 * selection with its group, so one click always lands on a known filter.
 */
export function selectionAfterCardClick(selection: StateSelection, group: ConsoleGroup): StateSelection {
  return groupCardStatus(selection, group) === 'on' ? NO_STATES : new Set(SECTION_STATES[group]);
}

/** A dropdown heading's checkbox: every state under it, some, or none. */
export type SectionCheck = 'checked' | 'indeterminate' | 'unchecked';

export function sectionCheck(selection: StateSelection, section: StateSection): SectionCheck {
  const states = SECTION_STATES[section];
  const selected = states.filter((s) => selection.has(s)).length;
  if (selected === 0) return 'unchecked';
  return selected === states.length ? 'checked' : 'indeterminate';
}

/**
 * A heading click. A fully checked heading removes its states; otherwise it
 * adds all of them. States under other headings are kept.
 */
export function selectionAfterSectionToggle(selection: StateSelection, section: StateSection): StateSelection {
  const states = SECTION_STATES[section];
  const next = new Set(selection);
  if (sectionCheck(selection, section) === 'checked') {
    for (const s of states) next.delete(s);
  } else {
    for (const s of states) next.add(s);
  }
  return next;
}

export function selectionAfterStateToggle(selection: StateSelection, state: ConsoleState): StateSelection {
  const next = new Set(selection);
  if (next.has(state)) next.delete(state);
  else next.add(state);
  return next;
}

/**
 * What the dropdown shows as its value. A selection a card or heading would
 * make reads as that heading's name, so a card click and the dropdown say the
 * same word. Two state names fit the control; more are counted, not listed.
 */
export function selectionLabel(selection: StateSelection): string {
  if (selection.size === 0) return rolloutsConsoleCopy.filters.allStates;
  const section = STATE_SECTIONS.find((s) => equalsSection(selection, s));
  if (section !== undefined) return sectionLabel(section);
  const labels = CONSOLE_STATES.filter((s) => selection.has(s)).map((s) => rolloutsConsoleCopy.states[s].label);
  if (labels.length <= 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} ${rolloutsConsoleCopy.filters.moreStates(labels.length - 2)}`;
}

/** Rows per state. Every state present, zero included. */
export function countStates(states: Iterable<ConsoleState>): Record<ConsoleState, number> {
  const counts = Object.fromEntries(CONSOLE_STATES.map((s) => [s, 0])) as Record<ConsoleState, number>;
  for (const state of states) counts[state] += 1;
  return counts;
}

/** Rows per card, from the per-state tally. A state in no group counts nowhere. */
export function countGroups(stateCounts: Readonly<Record<ConsoleState, number>>): Record<ConsoleGroup, number> {
  const counts = Object.fromEntries(CONSOLE_GROUPS.map((g) => [g, 0])) as Record<ConsoleGroup, number>;
  for (const state of CONSOLE_STATES) {
    const group = consoleGroupOf(state);
    if (group !== null) counts[group] += stateCounts[state];
  }
  return counts;
}
