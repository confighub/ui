// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Rollouts console's summary cards group the eleven console states by what
// happens next. Exercised directly: no page, no browser.

import { expect, test } from '@playwright/test';

import {
  CONSOLE_GROUPS,
  consoleGroupOf,
  type ConsoleGroup,
  type ConsoleState,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';
import { rolloutsConsoleCopy } from '../src/pages/x/apps/rollout/rolloutsConsoleCopy';

/** Every `ConsoleState`, typed as a `Record` so a new state fails here too until it is listed. */
const EXPECTED: Record<ConsoleState, ConsoleGroup | null> = {
  ready: 'needs-you',
  degraded: 'stuck',
  blocked: 'stuck',
  held: 'stuck',
  'no-stages': 'stuck',
  progressing: 'in-progress',
  complete: 'finished',
  'complete-unverified': 'finished',
  aborted: 'finished',
  'no-workflow': null,
  unknown: null,
};

test.describe('rollouts console groups', () => {
  for (const [state, group] of Object.entries(EXPECTED) as [ConsoleState, ConsoleGroup | null][]) {
    test(`${state} is in ${group ?? 'no group'}`, () => {
      expect(consoleGroupOf(state)).toBe(group);
    });
  }

  test('covers all eleven states', () => {
    expect(Object.keys(EXPECTED)).toHaveLength(11);
  });

  test('the cards are four, in what-happens-next order', () => {
    expect(CONSOLE_GROUPS).toEqual(['needs-you', 'stuck', 'in-progress', 'finished']);
  });

  test('every group has a state in it', () => {
    const used = new Set(Object.values(EXPECTED));
    for (const group of CONSOLE_GROUPS) expect(used.has(group)).toBe(true);
  });

  test('each card has its label and hint', () => {
    expect(CONSOLE_GROUPS.map((group) => rolloutsConsoleCopy.groups[group])).toEqual([
      { label: 'Needs you', hint: 'ready to promote' },
      { label: 'Stuck', hint: 'needs a fix to move' },
      { label: 'In progress', hint: 'no action needed' },
      { label: 'Finished', hint: 'complete or aborted' },
    ]);
  });
});
