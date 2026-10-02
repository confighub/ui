// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A wave's bulk Upgrade and Release report each Space on its own. A mixed
// bulk PATCH is HTTP 207, which RTK Query counts as success, so the answer's
// items decide which Spaces failed.
import { expect, test } from '@playwright/test';

import type { WaveUpgradePlan } from '../src/pages/x/apps/flow-graph/fold/waveActions';
import {
  type BulkPatchItem,
  type WaveReleaseDeps,
  type WaveUpgradeDeps,
  runWaveRelease,
  runWaveUpgrade,
} from '../src/pages/x/apps/flow-graph/fold/waveRuns';

const SPACE_OF: Record<string, string> = { u1: 's1', u2: 's2', u3: 's3', u4: 's4' };

function plan(chunks: string[][]): WaveUpgradePlan {
  const unitIds = chunks.flat();
  return {
    unitIds,
    spaceIds: [...new Set(unitIds.map((u) => SPACE_OF[u]))],
    wheres: chunks.map((_, i) => `chunk${i}`),
    unitIdChunks: chunks,
  };
}

function upgradeHarness(answers: Array<BulkPatchItem[] | Error>): {
  deps: WaveUpgradeDeps;
  log: Record<string, unknown[]>;
  upgrading: Set<string>;
} {
  const log: Record<string, unknown[]> = { errors: [], landed: [], flash: [], calls: [] };
  const upgrading = new Set<string>();
  let call = 0;
  const deps: WaveUpgradeDeps = {
    bulkPatch: async (where) => {
      log.calls.push(where);
      const answer = answers[call++];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    errorMessage: (e) => (e as Error).message,
    settleTargets: new Map(),
    unitInfo: (id) => ({ spaceId: SPACE_OF[id], headRevisionNum: 3 }),
    setUpgrading: (update) => {
      const next = update(upgrading);
      upgrading.clear();
      next.forEach((id) => upgrading.add(id));
    },
    setErrors: (ids, entry) =>
      log.errors.push({ ids: [...ids], title: entry.title, detail: entry.detail }),
    onLanded: (ids) => log.landed.push([...ids].sort()),
    flashSuccess: (ids, msg) => log.flash.push({ ids: [...ids].sort(), msg }),
  };
  return { deps, log, upgrading };
}

const ok = (id: string): BulkPatchItem => ({ Unit: { UnitID: id, SpaceID: SPACE_OF[id] } });
const bad = (id: string, message: string): BulkPatchItem => ({
  Unit: { UnitID: id, SpaceID: SPACE_OF[id] },
  Error: { Message: message },
});

test('an upgrade where every item succeeded flashes Upgraded on every Space', async () => {
  const { deps, log } = upgradeHarness([[ok('u1'), ok('u2')]]);
  await runWaveUpgrade(plan([['u1', 'u2']]), deps);
  expect(log.errors).toEqual([]);
  expect(log.landed).toEqual([['s1', 's2']]);
  expect(log.flash).toEqual([{ ids: ['s1', 's2'], msg: 'Upgraded' }]);
});

test('a 207 with one failing item reports that Space only and stops waiting on its Unit', async () => {
  const { deps, log, upgrading } = upgradeHarness([
    [ok('u1'), bad('u2', 'conflict'), ok('u3')],
  ]);
  await runWaveUpgrade(plan([['u1', 'u2', 'u3']]), deps);
  expect(log.errors).toEqual([{ ids: ['s2'], title: 'Upgrade failed', detail: 'conflict' }]);
  expect(log.landed).toEqual([['s1', 's3']]);
  expect(log.flash).toEqual([{ ids: ['s1', 's3'], msg: 'Upgraded' }]);
  // The failed Unit never waits for a new Revision; the others still do.
  expect([...deps.settleTargets.keys()].sort()).toEqual(['u1', 'u3']);
  expect([...upgrading].sort()).toEqual(['s1', 's3']);
});

test('a failed item does not stop the requests after it', async () => {
  const { deps, log } = upgradeHarness([[bad('u1', 'locked')], [ok('u2')]]);
  await runWaveUpgrade(plan([['u1'], ['u2']]), deps);
  expect(log.calls).toEqual(['chunk0', 'chunk1']);
  expect(log.errors).toHaveLength(1);
  expect(log.landed).toEqual([['s2']]);
});

test('a Space with one failed Unit and one good Unit is a failed Space and keeps settling', async () => {
  const { deps, log, upgrading } = upgradeHarness([[ok('u1'), bad('u3', 'x')]]);
  const p = plan([['u1', 'u3']]);
  // u1 and u3 share the Space s1 in this case.
  SPACE_OF.u3 = 's1';
  try {
    await runWaveUpgrade({ ...p, spaceIds: ['s1'] }, deps);
  } finally {
    SPACE_OF.u3 = 's3';
  }
  expect(log.errors).toEqual([{ ids: ['s1'], title: 'Upgrade failed', detail: 'x' }]);
  expect(log.landed).toEqual([]);
  expect(deps.settleTargets.has('u1')).toBe(true);
  expect(upgrading.has('s1')).toBe(true);
});

test('an item with an Error but no Unit fails the whole request, not none of it', async () => {
  const { deps, log } = upgradeHarness([[{ Error: { Message: 'boom' } }]]);
  await runWaveUpgrade(plan([['u1', 'u2']]), deps);
  expect(log.errors.map((e) => (e as { ids: string[] }).ids)).toEqual([['s1'], ['s2']]);
  expect(log.landed).toEqual([]);
});

test('a thrown request fails its Units and every later request, and runs no more', async () => {
  const { deps, log } = upgradeHarness([[ok('u1')], new Error('HTTP 500'), [ok('u4')]]);
  await runWaveUpgrade(plan([['u1'], ['u2'], ['u4']]), deps);
  expect(log.calls).toEqual(['chunk0', 'chunk1']);
  expect(log.errors.map((e) => (e as { ids: string[] }).ids)).toEqual([['s2'], ['s4']]);
  expect(log.landed).toEqual([['s1']]);
});

function releaseHarness(results: Record<string, number | Error>) {
  const log = { flash: [] as unknown[], errors: [] as unknown[], published: [] as string[] };
  const held = new Set<string>();
  let releasing: ReadonlySet<string> = new Set();
  const deps: WaveReleaseDeps = {
    publish: async (id) => {
      log.published.push(id);
      const r = results[id];
      if (r instanceof Error) throw r;
      return { ReleaseNum: r };
    },
    errorDetail: (e) => (e as Error).message,
    setReleasing: (update) => {
      releasing = update(releasing);
    },
    setErrors: (ids, entry) =>
      log.errors.push({ ids: [...ids], title: entry.title, detail: entry.detail }),
    flashSuccess: (ids, msg) => log.flash.push({ ids: [...ids], msg }),
    claim: (id) => !held.has(id) && !!held.add(id),
    release: (id) => held.delete(id),
  };
  return { deps, log, held, getReleasing: () => releasing };
}

test('a release that fails in one Space still publishes the others', async () => {
  const { deps, log, getReleasing } = releaseHarness({ a: 1, b: new Error('gate'), c: 2 });
  await runWaveRelease(['a', 'b', 'c'], deps);
  expect(log.published).toEqual(['a', 'b', 'c']);
  expect(log.errors).toEqual([{ ids: ['b'], title: 'Release failed', detail: 'gate' }]);
  expect(log.flash).toEqual([
    { ids: ['a'], msg: 'Released rel-1' },
    { ids: ['c'], msg: 'Released rel-2' },
  ]);
  expect(getReleasing().size).toBe(0);
});

test('a Space that another run holds is not published twice', async () => {
  const { deps, log, held } = releaseHarness({ a: 1, b: 2 });
  held.add('a');
  await runWaveRelease(['a', 'b'], deps);
  expect(log.published).toEqual(['b']);
  expect([...held]).toEqual(['a']);
});
