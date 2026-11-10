// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What the End dialog draws: the order of the Spaces and the collapse of the ones that went through.

import { expect, test } from '@playwright/test';

import { endDialogRows, type SpaceOutcome } from '../src/pages/x/apps/change-order/changeOrderRollback';
import { changeOrderCopy } from '../src/pages/x/apps/change-order/changeOrderCopy';

const spaces = Array.from({ length: 104 }, (_, i) => ({ spaceId: `s${i}`, label: `space-${i}` }));
const outcome = (spaceId: string, phase: SpaceOutcome['phase']): SpaceOutcome => ({ spaceId, label: spaceId, phase, restoredUnits: 0, message: phase === 'failed' ? 'refused' : '' });
const all = (phase: SpaceOutcome['phase'], overrides: Record<string, SpaceOutcome['phase']> = {}) =>
  spaces.map((s) => outcome(s.spaceId, overrides[s.spaceId] ?? phase));
const ids = (rows: readonly { spaceId: string }[]) => rows.map((r) => r.spaceId);

test.describe('endDialogRows', () => {
  test('before a run, every Space in the order given', () => {
    const shown = endDialogRows(spaces, null, null);
    expect(ids(shown.rows)).toEqual(ids(spaces));
    expect(shown.collapsed).toEqual([]);
    expect(shown.memory).toBeNull();
  });

  test('after a run, failed Spaces first, by name, and the others collapse into one line', () => {
    const shown = endDialogRows(spaces, all('done', { s40: 'failed', s7: 'failed' }), null);
    expect(ids(shown.rows)).toEqual(['s7', 's40']);
    expect(shown.collapsed).toHaveLength(102);
    expect(shown.anyFailed).toBe(true);
  });

  test('a run with no failure: no row, every Space in the line, and no "failed" claim', () => {
    const shown = endDialogRows(spaces, all('done'), null);
    expect(shown.rows).toEqual([]);
    expect(shown.collapsed).toHaveLength(104);
    expect(shown.anyFailed).toBe(false);
  });

  test('a run where every Space failed: every row by name, nothing collapsed', () => {
    const shown = endDialogRows(spaces, all('failed'), null);
    expect(shown.rows).toHaveLength(104);
    expect(shown.collapsed).toEqual([]);
    expect(shown.anyFailed).toBe(true);
  });

  test('three or fewer that went through keep their own rows, after the failures', () => {
    const few = spaces.slice(0, 4);
    const outcomes = few.map((s) => outcome(s.spaceId, s.spaceId === 's3' ? 'failed' : 'done'));
    const shown = endDialogRows(few, outcomes, null);
    expect(ids(shown.rows)).toEqual(['s3', 's0', 's1', 's2']);
    expect(shown.collapsed).toEqual([]);
  });

  test('skipped Spaces went through, and do not need a row', () => {
    const shown = endDialogRows(spaces, all('skipped', { s9: 'failed' }), null);
    expect(ids(shown.rows)).toEqual(['s9']);
    expect(shown.collapsed).toHaveLength(103);
  });

  test('while the first run goes, every Space has a row in the order given', () => {
    const shown = endDialogRows(spaces, all('pending', { s0: 'running', s1: 'done' }), null);
    expect(ids(shown.rows)).toEqual(ids(spaces));
    expect(shown.collapsed).toEqual([]);
    expect(shown.memory?.reported).toBe(false);
  });

  test('a retry of one Space out of 104: the failed and running rows by name, the rest in the line', () => {
    const first = endDialogRows(spaces, all('done', { s5: 'failed', s60: 'failed' }), null);
    expect(ids(first.rows)).toEqual(['s5', 's60']);
    // The retry sets one failed Space to running.
    const retrying = endDialogRows(spaces, all('done', { s5: 'running', s60: 'failed' }), first.memory);
    expect(ids(retrying.rows)).toEqual(['s5', 's60']);
    expect(retrying.collapsed).toHaveLength(102);
    expect(retrying.anyFailed).toBe(true);
    // Only the Space that is running: it keeps its row and the line holds the other 103.
    const onlyOne = endDialogRows(spaces, all('done', { s5: 'running' }), first.memory);
    expect(ids(onlyOne.rows)).toEqual(['s5']);
    expect(onlyOne.collapsed).toHaveLength(103);
  });

  test('a retry ends: a Space that failed again stays on top, one that went through joins the line', () => {
    const first = endDialogRows(spaces, all('done', { s5: 'failed', s60: 'failed' }), null);
    const retrying = endDialogRows(spaces, all('done', { s5: 'running', s60: 'failed' }), first.memory);
    const second = endDialogRows(spaces, all('done', { s60: 'failed' }), retrying.memory);
    expect(ids(second.rows)).toEqual(['s60']);
    expect(second.collapsed).toHaveLength(103);
    expect(ids(second.collapsed)).toContain('s5');
  });
});

test.describe('the line for the Spaces that went through', () => {
  const copy = changeOrderCopy.endChangeOrder;
  test('says "other" only when something failed, and handles the plural', () => {
    expect(copy.spacesThrough(102)).toBe('102 other Spaces had no failure.');
    expect(copy.spacesThrough(1)).toBe('1 other Space had no failure.');
    expect(copy.seeAllSpaces(104)).toBe('See the 104 Spaces');
    expect(copy.seeAllSpaces(1)).toBe('See the 1 Space');
    expect(copy.seeSpaces).toBe('See the Spaces');
  });
});
