// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `partitionSourceUnitsByChange` (useRolloutConsoleChanges.ts) — the "At the source"
// list's split into the resources a change rewrites and the resources it leaves
// as they are, exercised directly.
//
// WHY THIS IS A PLAYWRIGHT SPEC AND NOT A UNIT-TEST FILE. The UI has no unit-test
// runner (no Jest), so `*.test.ts` files expecting one would never run.
// `rollout-stage-matrix.spec.ts` and
// `rollout-outcome.spec.ts` already take the same shape: the Playwright runner,
// no `page` fixture, no browser, a few milliseconds of pure assertion in the
// place the project keeps its tests.
//
// WHY THE RULES LIVE IN A PURE FUNCTION AT ALL. Two of them are defaults — the
// group opens itself when there is nothing else to read, and renders nothing at
// all when nothing is unchanged — and a default that only exists inside JSX can
// only be checked by driving a seeded rollout through a browser. Keeping the
// decision in the partition means the page holds the markup and this file holds
// the reasoning.
//
// ⚠️ EMPTY `fieldDiffs` IS NOT "PASSED OVER". A unit reaching this partition is
// in scope; the page filters `skippedUnits` out before calling it. An empty diff
// means the resource already holds the value being promoted — the reading a
// fully-landed rollout's own units give — so it must still be reachable, never
// dropped. That conflation is a regression this repo has already had once, and
// `rollout-outcome.spec.ts` guards the same distinction one layer down.

import { expect, test } from '@playwright/test';

import { partitionSourceUnitsByChange } from '../src/pages/rollouts/useRolloutConsoleChanges';
import { conflictBlocks } from '../src/pages/x/apps/rollout/rolloutChanges';
import type { RolloutChangeGroup } from '../src/pages/x/apps/rollout/rolloutTypes';

/** Just enough of a source unit for the partition: it keys on `unitId` and nothing else. */
interface SourceUnitStub {
  unitId: string;
}

/**
 * `unitId -> the paths that unit's change rewrites`. An empty list is the
 * "already holds the value" case; a unit absent from the map entirely is the
 * page's `group?.fieldDiffs ?? []` fallback, which reads the same way.
 *
 * `undeterminableUnitIds` names the units whose group came back with
 * `determinable: false`. `buildRolloutChangeGroups` empties `fieldDiffs` for
 * exactly those, so they are built here with an empty diff list too — a
 * fixture that gave them paths would not be reproducing the state under test.
 */
function partition(
  units: string[],
  changedPathsByUnitId: Record<string, string[]>,
  undeterminableUnitIds: string[] = [],
) {
  const groups = new Map<string, Pick<RolloutChangeGroup, 'fieldDiffs' | 'determinable'>>();
  for (const [unitId, paths] of Object.entries(changedPathsByUnitId)) {
    groups.set(unitId, {
      fieldDiffs: paths.map((path) => ({ path, oldValue: 'before', newValue: 'after' })),
      determinable: true,
    });
  }
  for (const unitId of undeterminableUnitIds) {
    groups.set(unitId, { fieldDiffs: [], determinable: false });
  }
  return partitionSourceUnitsByChange<SourceUnitStub>(
    units.map((unitId) => ({ unitId })),
    groups,
  );
}

/** Unit ids in render order: changed list first, then the group's contents. */
function renderOrder(result: ReturnType<typeof partition>): string[] {
  return [...result.changedUnits, ...result.unchangedUnits].map((u) => u.unitId);
}

test.describe('partitionSourceUnitsByChange', () => {
  test('sinks the unchanged units below the changed ones', () => {
    const result = partition(['already-there', 'moves', 'also-already-there', 'moves-too'], {
      moves: ['/spec/image'],
      'moves-too': ['/spec/replicas'],
      'already-there': [],
      'also-already-there': [],
    });

    expect(result.changedUnits.map((u) => u.unitId)).toEqual(['moves', 'moves-too']);
    expect(result.unchangedUnits.map((u) => u.unitId)).toEqual([
      'already-there',
      'also-already-there',
    ]);
    expect(renderOrder(result)).toEqual([
      'moves',
      'moves-too',
      'already-there',
      'also-already-there',
    ]);
  });

  test('keeps the incoming order inside each half rather than sorting it', () => {
    // Deliberately not alphabetical: the source list arrives in the order the
    // change was assembled in, and only the changed/unchanged split may move a
    // unit. `zeta` before `alpha` proves nothing else re-ordered them.
    const result = partition(['zeta', 'quiet-z', 'alpha', 'quiet-a'], {
      zeta: ['/spec/image'],
      alpha: ['/spec/image'],
      'quiet-z': [],
      'quiet-a': [],
    });

    expect(renderOrder(result)).toEqual(['zeta', 'alpha', 'quiet-z', 'quiet-a']);
  });

  test('counts every unchanged unit, which is what the group header reports', () => {
    const result = partition(['a', 'b', 'c', 'd'], {
      a: ['/spec/image'],
      b: [],
      c: [],
      d: [],
    });

    // The header renders `Unchanged (N)` off this length.
    expect(result.unchangedUnits).toHaveLength(3);
    expect(result.changedUnits).toHaveLength(1);
  });

  test('a unit with no group at all reads as unchanged, not as missing', () => {
    // The page looks its group up by id and falls back to an empty diff list.
    // Dropping such a unit would silently shorten the source list.
    const result = partition(['moves', 'no-group'], { moves: ['/spec/image'] });

    expect(result.unchangedUnits.map((u) => u.unitId)).toEqual(['no-group']);
  });

  test('a resource the change was REFUSED is not filed as unchanged', () => {
    /*
     * The exception the whole feature turns on. A resource the change does not
     * touch and a resource the change tried to alter and was refused both diff
     * to nothing, so the refusal has to come from the conflicts the dry run
     * reported -- it cannot be read out of the empty diff.
     */
    const groups = new Map([
      ['blocked', {
        fieldDiffs: [],
        determinable: true,
        conflicts: [{ reason: 'ProtectedPath', blocks: true, resourceName: 'app/api' }],
      }],
      ['quiet', { fieldDiffs: [], determinable: true }],
    ]);
    const result = partitionSourceUnitsByChange(
      [{ unitId: 'blocked' }, { unitId: 'quiet' }],
      groups,
    );
    expect(result.blockedUnits.map((u) => u.unitId)).toEqual(['blocked']);
    expect(result.unchangedUnits.map((u) => u.unitId)).toEqual(['quiet']);
    expect(result.changedUnits).toEqual([]);
  });

  test('a PARTIAL refusal stays a changed resource, and keeps its refusal', () => {
    /*
     * A merge is refused in parts, not wholesale: `Unit.Conflicts` is "the parts
     * of the last merge's patch that were not applied". So a resource can take
     * three paths and be refused two, and it has real field diffs — an ordinary
     * changed resource that never reaches the blocked block.
     *
     * That is the user's case exactly: they expected five paths and got three.
     * The resource stays where it belongs, and the refusal is marked on it —
     * `blockedUnits` keeps meaning "nothing happened here", which is what makes
     * it readable.
     */
    const refused = [{ reason: 'ProtectedPath', blocks: true, path: '/spec/replicas' }];
    const result = partitionSourceUnitsByChange(
      [{ unitId: 'partly' }],
      new Map([['partly', {
        fieldDiffs: [{ path: '/spec/image', oldValue: 'a', newValue: 'b' }],
        determinable: true,
        conflicts: refused,
      }]]),
    );
    expect(result.changedUnits.map((u) => u.unitId)).toEqual(['partly']);
    expect(result.blockedUnits).toEqual([]);
    // And the refusal is still reachable from the group, which is what the row
    // renders. Losing it here would make a partial refusal invisible.
    expect(refused.filter((c) => c.blocks)).toHaveLength(1);
  });

  test('an unreadable resource carrying a refusal keeps both facts', () => {
    // `determinable: false` routes it to `changedUnits` before any conflict is
    // considered, so the refusal has to survive on the group rather than in the
    // bucketing.
    const refused = [{ reason: 'ReplayFailed', blocks: true, details: 'replay of X failed' }];
    const result = partitionSourceUnitsByChange(
      [{ unitId: 'unreadable' }],
      new Map([['unreadable', { fieldDiffs: [], determinable: false, conflicts: refused }]]),
    );
    expect(result.changedUnits.map((u) => u.unitId)).toEqual(['unreadable']);
    expect(result.blockedUnits).toEqual([]);
    expect(result.unchangedUnits).toEqual([]);
  });

  test('a conflict that reports the change LANDING does not block', () => {
    // `ExclusiveCleared` and `DeleteShadowed` say the patch applied and name
    // what the variant lost. Reading either as blocked would tell a reader the
    // promote did not do something it did.
    for (const reason of ['ExclusiveCleared', 'DeleteShadowed']) {
      const result = partitionSourceUnitsByChange(
        [{ unitId: 'u' }],
        new Map([['u', {
          fieldDiffs: [],
          determinable: true,
          conflicts: [{ reason, blocks: conflictBlocks(reason) }],
        }]]),
      );
      expect(result.blockedUnits, reason).toEqual([]);
      expect(result.unchangedUnits.map((u) => u.unitId), reason).toEqual(['u']);
    }
  });

  test('a reason nobody modelled still blocks, so it cannot vanish', () => {
    // `Reason` arrives as a plain string and this list is a snapshot. Reading an
    // unknown reason as harmless would delete it from the screen; reading it as
    // blocking says "something stopped this" and shows the word verbatim.
    expect(conflictBlocks('SomeReasonAddedNextYear')).toBe(true);
    expect(conflictBlocks(undefined)).toBe(true);
    expect(conflictBlocks('ProtectedPath')).toBe(true);
    expect(conflictBlocks('ExclusiveCleared')).toBe(false);
  });

  test('no conflicts at all leaves the ordinary behaviour untouched', () => {
    // The server field is unverified against a live dry run, so an empty or
    // absent `Conflicts` must degrade to plain: changed resources only, nothing
    // blocked, no empty section.
    const result = partitionSourceUnitsByChange(
      [{ unitId: 'moves' }, { unitId: 'quiet' }],
      new Map([
        ['moves', { fieldDiffs: [{ path: '/spec/image', oldValue: 'a', newValue: 'b' }], determinable: true }],
        ['quiet', { fieldDiffs: [], determinable: true, conflicts: [] }],
      ]),
    );
    expect(result.changedUnits.map((u) => u.unitId)).toEqual(['moves']);
    expect(result.blockedUnits).toEqual([]);
  });

  test('sorts the resources the change moves apart from the ones it does not', () => {
    const result = partition(['moves', 'quiet'], { moves: ['/spec/image'], quiet: [] });

    expect(result.changedUnits.map((u) => u.unitId)).toEqual(['moves']);
    expect(result.unchangedUnits.map((u) => u.unitId)).toEqual(['quiet']);
    expect(result.blockedUnits).toEqual([]);
  });

  test('a change that moves nothing leaves nothing to show', () => {
    const result = partition(['quiet', 'quieter'], { quiet: [], quieter: [] });

    expect(result.changedUnits).toHaveLength(0);
    expect(result.blockedUnits).toHaveLength(0);
  });

  test('has no group to render when every unit changed', () => {
    // `unchangedUnits` empty is the page's own guard for rendering no header at
    // all: the disclosure never appears with a count of zero.
    const result = partition(['moves', 'moves-too'], {
      moves: ['/spec/image'],
      'moves-too': ['/spec/replicas'],
    });

    expect(result.unchangedUnits).toEqual([]);
  });

  test('keeps an undeterminable resource out of the unchanged group', () => {
    // `buildRolloutChangeGroups` empties `fieldDiffs` when a resource is not
    // determinable, so emptiness alone cannot tell "already holds the value"
    // from "we could not work out what this change does to it". The second is
    // the one thing on the card a reader must not miss, and the group exists
    // to hide what is safe to ignore.
    const result = partition(
      ['moves', 'quiet', 'cannot-tell'],
      { moves: ['/spec/image'], quiet: [] },
      ['cannot-tell'],
    );

    expect(result.unchangedUnits.map((u) => u.unitId)).toEqual(['quiet']);
    expect(result.changedUnits.map((u) => u.unitId)).toEqual(['moves', 'cannot-tell']);
  });

  test('leaves an undeterminable resource out of the group header count', () => {
    const result = partition(
      ['quiet', 'cannot-tell', 'quieter'],
      { quiet: [], quieter: [] },
      ['cannot-tell'],
    );

    // `Unchanged (N)` renders off this length: N is 2, never 3.
    expect(result.unchangedUnits).toHaveLength(2);
  });

  test('does not read an all-undeterminable list as "nothing changed"', () => {
    // An unreadable resource is not an unchanged one. It goes with the changed
    // units, where it is rendered in the open and says so, rather than into a
    // bucket the screen no longer shows at all.
    const result = partition(['cannot-tell', 'cannot-tell-either'], {}, [
      'cannot-tell',
      'cannot-tell-either',
    ]);

    expect(result.unchangedUnits).toEqual([]);
    expect(result.changedUnits).toHaveLength(2);
  });

  test('has nothing to render either way when the source list is empty', () => {
    const result = partition([], {});

    expect(result.changedUnits).toEqual([]);
    expect(result.unchangedUnits).toEqual([]);
  });
});
