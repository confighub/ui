// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The staging store of the spec sheet: components.md rules 8, 9, 10 and 18, and the footer
// verb of the design (Update for edits and keeps, Upgrade for upstream changes only).

import { expect, test } from '@playwright/test';
import {
  EMPTY_STAGING,
  commitPlan,
  footerVerb,
  isEmptyStaging,
  stagedCounts,
  stagedValueKeys,
  stagingReducer,
  type StagingAction,
  type StagingState,
} from '../src/pages/x/apps/spec-sheet/staging/stagingReducer';
import { STAGED_DELETE_SENTINEL } from '../src/pages/x/apps/spec-sheet/staging/types';
import { nextStagingMap } from '../src/pages/x/apps/spec-sheet/staging/useUnitStagingStore';

const run = (...actions: StagingAction[]): StagingState => actions.reduce(stagingReducer, EMPTY_STAGING);

test.describe('spec sheet staging', () => {
  test('an edit stages and writes nothing (rule 8)', () => {
    const s = run({ type: 'stageEdit', key: 'spec.replicas', value: '3' });
    expect([...s.edits]).toEqual([['spec.replicas', '3']]);
    expect(stagedValueKeys(s)).toEqual(new Set(['spec.replicas']));
  });

  test('leaving Incoming drops upgrade picks only; edits and keeps stay (rule 9)', () => {
    const s = run(
      { type: 'stageAll', keys: ['a', 'b'] },
      { type: 'stageEdit', key: 'c', value: 'x' },
      { type: 'setProtection', key: 'd', keep: true, committed: false },
      { type: 'clearUpgradeOnly' },
    );
    expect(s.upgrades.size).toBe(0);
    expect(s.edits.get('c')).toBe('x');
    expect(s.protection.get('d')).toBe(true);
  });

  test('a manual edit wins over the upgrade of the same key (rule 10)', () => {
    const s = run({ type: 'stageAll', keys: ['a', 'b'] }, { type: 'stageEdit', key: 'a', value: 'mine' });
    const plan = commitPlan(s);
    expect([...plan.upgrades]).toEqual(['b']);
    expect(plan.edits.get('a')).toBe('mine');
    expect(stagedCounts(s)).toEqual({ edits: 1, upgrades: 1, keeps: 0 });
  });

  test('stageAll ticks only the keys it is given: a guarded key is never ticked for the person (rule 18)', () => {
    const s = run({ type: 'stageAll', keys: ['a'] });
    expect(s.upgrades.has('guarded')).toBe(false);
    const ticked = stagingReducer(s, { type: 'stageUpgrade', key: 'guarded', on: true });
    expect(ticked.upgrades.has('guarded')).toBe(true);
  });

  test('remove stages the delete sentinel; removing an add takes the add back', () => {
    const removed = run({ type: 'stageRemove', key: 'k' });
    expect(removed.edits.get('k')).toBe(STAGED_DELETE_SENTINEL);
    const added = run({ type: 'stageEdit', key: 'n', value: 'v', add: true }, { type: 'stageRemove', key: 'n' });
    expect(added.edits.size).toBe(0);
    expect(added.adds.size).toBe(0);
  });

  test('a keep that returns to the committed value is no change', () => {
    const s = run(
      { type: 'setProtection', key: 'k', keep: true, committed: false },
      { type: 'setProtection', key: 'k', keep: false, committed: false },
    );
    expect(s.protection.size).toBe(0);
  });

  test('Discard and a commit clear everything; a withheld key is offered again, unticked', () => {
    const s = run({ type: 'stageAll', keys: ['a', 'b'] }, { type: 'stageEdit', key: 'c', value: 'x' });
    expect(stagingReducer(s, { type: 'discardAll' })).toBe(EMPTY_STAGING);
    expect(stagingReducer(s, { type: 'committed' })).toBe(EMPTY_STAGING);
    expect(stagingReducer(s, { type: 'committed', withheldKeys: ['b'] })).toBe(EMPTY_STAGING);
  });

  test('a value write leaves the staged keeps until their own write succeeds', () => {
    const s = run(
      { type: 'stageEdit', key: 'c', value: 'x' },
      { type: 'setProtection', key: 'c', keep: true, committed: false },
    );
    const afterValues = stagingReducer(s, { type: 'committed' });
    expect(afterValues.edits.size).toBe(0);
    expect([...afterValues.protection]).toEqual([['c', true]]);
    expect(isEmptyStaging(stagingReducer(afterValues, { type: 'protectionCommitted' }))).toBe(true);
  });

  test('a Unit whose staging returns to nothing leaves the store, so nothing asks before leaving', () => {
    let store = nextStagingMap(new Map(), 'u', { type: 'stageAll', keys: ['a'] });
    expect([...store.keys()]).toEqual(['u']);
    // Leaving Incoming drops the ticks: nothing is staged, so the Unit has no entry.
    store = nextStagingMap(store, 'u', { type: 'clearUpgradeOnly' });
    expect(store.size).toBe(0);
    store = nextStagingMap(store, 'u', { type: 'stageEdit', key: 'c', value: 'x' });
    store = nextStagingMap(store, 'u', { type: 'unstageEdit', key: 'c' });
    expect(store.size).toBe(0);
  });

  test('the footer verb: Update for edits and keeps, Upgrade for upstream changes only', () => {
    expect(footerVerb({ edits: 4, upgrades: 2, keeps: 1 })).toEqual({ verb: 'Update', count: 4 });
    expect(footerVerb({ edits: 0, upgrades: 2, keeps: 3 })).toEqual({ verb: 'Update', count: 3 });
    expect(footerVerb({ edits: 0, upgrades: 4, keeps: 0 })).toEqual({ verb: 'Upgrade', count: 4 });
  });
});
