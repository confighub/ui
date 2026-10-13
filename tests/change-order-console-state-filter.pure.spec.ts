// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The ChangeOrders console's State filter is one selection that two controls edit:
// the summary cards and the State dropdown. These are the rules both read,
// exercised directly: no page, no browser.

import { expect, test } from '@playwright/test';

import { CONSOLE_STATES, type ConsoleState } from '../src/pages/x/apps/change-order/changeOrdersConsoleModel';
import {
  NO_STATES,
  STATE_SECTIONS,
  countGroups,
  countStates,
  groupCardStatus,
  rowMatchesStates,
  sectionCheck,
  selectionAfterCardClick,
  selectionAfterSectionToggle,
  selectionAfterStateToggle,
  statesInSection,
  type StateSelection,
} from '../src/pages/x/apps/change-order/changeOrdersConsoleStateFilter';

const STUCK: ConsoleState[] = ['degraded', 'blocked', 'held', 'no-stages'];
const FINISHED: ConsoleState[] = ['complete', 'complete-unverified', 'aborted'];
const OTHER: ConsoleState[] = ['no-workflow', 'unknown'];

function sel(...states: ConsoleState[]): StateSelection {
  return new Set(states);
}

/** Sets compare by identity; the tests care about members, in `CONSOLE_STATES` order. */
function members(selection: StateSelection): ConsoleState[] {
  return CONSOLE_STATES.filter((s) => selection.has(s));
}

test.describe('ChangeOrders console state filter: sections', () => {
  test('each state is under exactly one heading, and every state is under one', () => {
    const listed = STATE_SECTIONS.flatMap((section) => statesInSection(section));
    expect(listed).toHaveLength(11);
    expect(new Set(listed).size).toBe(11);
    expect([...listed].sort()).toEqual([...CONSOLE_STATES].sort());
  });

  test('Other holds the states no card counts', () => {
    expect(statesInSection('other')).toEqual(OTHER);
    expect(statesInSection('stuck')).toEqual(STUCK);
  });
});

test.describe('ChangeOrders console state filter: row matching', () => {
  test('an empty selection shows every row', () => {
    for (const state of CONSOLE_STATES) expect(rowMatchesStates(NO_STATES, state)).toBe(true);
  });

  test('a selection shows only its states, across groups and Other', () => {
    const selection = sel('ready', 'unknown');
    expect(rowMatchesStates(selection, 'ready')).toBe(true);
    expect(rowMatchesStates(selection, 'unknown')).toBe(true);
    expect(rowMatchesStates(selection, 'degraded')).toBe(false);
    expect(rowMatchesStates(selection, 'no-workflow')).toBe(false);
  });
});

test.describe('ChangeOrders console state filter: card status', () => {
  test('off when the selection is empty', () => {
    expect(groupCardStatus(NO_STATES, 'stuck')).toBe('off');
  });

  test('on when the selection is exactly the group', () => {
    expect(groupCardStatus(sel(...STUCK), 'stuck')).toBe('on');
    expect(groupCardStatus(sel('ready'), 'needs-you')).toBe('on');
  });

  test('partial when the selection is some of the group', () => {
    expect(groupCardStatus(sel('degraded', 'held'), 'stuck')).toBe('partial');
  });

  test('partial when the selection is the whole group and more', () => {
    expect(groupCardStatus(sel(...STUCK, 'ready'), 'stuck')).toBe('partial');
    expect(groupCardStatus(sel(...STUCK, 'ready'), 'needs-you')).toBe('partial');
  });

  test('off when the selection is only in other groups or Other', () => {
    expect(groupCardStatus(sel('ready', 'unknown'), 'stuck')).toBe('off');
    expect(groupCardStatus(sel(...OTHER), 'finished')).toBe('off');
  });
});

test.describe('ChangeOrders console state filter: card click', () => {
  test('from off, selects exactly the group', () => {
    expect(members(selectionAfterCardClick(NO_STATES, 'stuck'))).toEqual(STUCK);
    expect(members(selectionAfterCardClick(sel('ready'), 'stuck'))).toEqual(STUCK);
  });

  test('from partial, selects exactly the group', () => {
    expect(members(selectionAfterCardClick(sel('held'), 'stuck'))).toEqual(STUCK);
    expect(members(selectionAfterCardClick(sel(...STUCK, 'unknown'), 'stuck'))).toEqual(STUCK);
  });

  test('from on, clears the selection', () => {
    expect(selectionAfterCardClick(sel(...STUCK), 'stuck').size).toBe(0);
  });
});

test.describe('ChangeOrders console state filter: heading toggle', () => {
  test('heading checkbox reads none, some and all', () => {
    expect(sectionCheck(NO_STATES, 'finished')).toBe('unchecked');
    expect(sectionCheck(sel('aborted'), 'finished')).toBe('indeterminate');
    expect(sectionCheck(sel(...FINISHED), 'finished')).toBe('checked');
    expect(sectionCheck(sel(...FINISHED, 'ready'), 'finished')).toBe('checked');
  });

  test('from none, adds every state under it and keeps the rest', () => {
    expect(members(selectionAfterSectionToggle(sel('ready'), 'finished'))).toEqual(['ready', ...FINISHED]);
  });

  test('from some, adds the missing states', () => {
    expect(members(selectionAfterSectionToggle(sel('aborted'), 'finished'))).toEqual(FINISHED);
  });

  test('from all, removes its states and keeps the rest', () => {
    expect(members(selectionAfterSectionToggle(sel(...FINISHED, 'unknown'), 'finished'))).toEqual(['unknown']);
  });

  test('Other toggles the ungrouped states', () => {
    const on = selectionAfterSectionToggle(NO_STATES, 'other');
    expect(members(on)).toEqual(OTHER);
    expect(selectionAfterSectionToggle(on, 'other').size).toBe(0);
  });

  test('a heading toggle that fills a group turns its card on', () => {
    const selection = selectionAfterSectionToggle(NO_STATES, 'stuck');
    expect(groupCardStatus(selection, 'stuck')).toBe('on');
  });

  test('a state toggle adds and removes one state', () => {
    const added = selectionAfterStateToggle(sel('ready'), 'unknown');
    expect(members(added)).toEqual(['ready', 'unknown']);
    expect(members(selectionAfterStateToggle(added, 'ready'))).toEqual(['unknown']);
  });

  test('the toggles never change the selection they are given', () => {
    const before = sel('ready');
    selectionAfterStateToggle(before, 'unknown');
    selectionAfterSectionToggle(before, 'stuck');
    expect(members(before)).toEqual(['ready']);
  });
});

test.describe('ChangeOrders console state filter: counts', () => {
  test('counts every state, zero included, and sums groups from them', () => {
    const states = countStates(['ready', 'degraded', 'held', 'held', 'unknown', 'complete']);
    expect(Object.keys(states)).toHaveLength(11);
    expect(states.held).toBe(2);
    expect(states.aborted).toBe(0);
    expect(countGroups(states)).toEqual({ 'needs-you': 1, stuck: 3, 'in-progress': 0, finished: 1 });
  });
});
