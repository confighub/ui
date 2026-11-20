// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What counts as the person's staged work for the new-tab rule (b) and the Back blocker
// (team-lead decision): value edits, deletes and restores, and upgrade picks that DIFFER from the
// default the Incoming view stages by itself. The default picks cost nothing to lose: they come
// back on their own. (Staged guard actions are counted by the pane, apart.)
import { expect, test } from '@playwright/test';

import { userStagedCount } from '../src/pages/x/apps/field-diagnosis/stagedUserChanges';

const set = (...k: string[]) => new Set(k);

test('only the default picks: nothing', () => {
  expect(userStagedCount({ staged: set('a', 'b'), edits: set(), defaults: set('a', 'b') })).toBe(0);
});

test('a default pick unticked: one', () => {
  expect(userStagedCount({ staged: set('a'), edits: set(), defaults: set('a', 'b') })).toBe(1);
});

test('a pick ticked by hand: one', () => {
  expect(userStagedCount({ staged: set('a', 'b', 'c'), edits: set(), defaults: set('a', 'b') })).toBe(1);
});

test('an edit counts once, also on a path the default staged', () => {
  expect(userStagedCount({ staged: set('a', 'e'), edits: set('e'), defaults: set('a') })).toBe(1);
  expect(userStagedCount({ staged: set('a'), edits: set('a'), defaults: set('a') })).toBe(1);
});

test('no default (All view): every pick is the person\'s', () => {
  expect(userStagedCount({ staged: set('a', 'b'), edits: set(), defaults: set() })).toBe(2);
});
