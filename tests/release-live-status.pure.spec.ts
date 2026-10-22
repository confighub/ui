// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A deployment's live status is the `LiveStatus` of the Release it is running:
// its latest published Release for its current release Target. These pin how
// that Release is picked, what the `Healthy` gate concludes from its status,
// and what the component graph carries for it — browser-free.

import { expect, test } from '@playwright/test';

import type { ExtendedReleaseRead, ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';

import { buildComponentData } from '../src/pages/x/apps/componentData';
import { formatDigest, type LiveStatus, liveStatusText, runningReleases } from '../src/pages/x/apps/liveStatus';
import { buildGatesForStage, liveStatusFailure } from '../src/pages/x/apps/change-order/changeOrderGates';
import { deriveProgress } from '../src/pages/x/apps/change-order/changeOrderState';
import type { ChangeOrderProgress, ChangeOrderStage } from '../src/pages/x/apps/change-order/changeOrderTypes';
import { carryingReleaseMap } from './fixtures/running-release';

const GREEN: LiveStatus = {
  Reporter: 'argobot',
  Sync: 'Synced',
  Health: 'Healthy',
  Operation: 'Succeeded',
  ObservedAt: '2026-01-01T00:00:00Z',
};

function release(
  spaceId: string,
  releaseNum: number,
  liveStatus?: LiveStatus,
  extra: { TargetID?: string; Published?: boolean } = {},
): ExtendedReleaseRead {
  return {
    Release: {
      ReleaseID: `${spaceId}-r${releaseNum}`,
      SpaceID: spaceId,
      ReleaseNum: releaseNum,
      TargetID: 'target-1',
      Published: true,
      ...(liveStatus && { LiveStatus: liveStatus }),
      ...extra,
    },
  } as ExtendedReleaseRead;
}

const TARGETED = new Map([['space-1', 'target-1']]);

// ── Which Release a Space is running ────────────────────────────────────────

test('the running Release is the published one with the highest number', () => {
  const running = runningReleases(
    [release('space-1', 1, GREEN), release('space-1', 3, GREEN), release('space-1', 2, GREEN)],
    TARGETED,
  );
  expect(running.get('space-1')?.releaseNum).toBe(3);
});

/*
 * ⚠️ THE STALE-HEALTH BUG. The status describes the Release it is on. A newer
 * Release nobody has reported on yet is unreported, however green the one
 * before it was: that green is about a configuration the Space no longer runs.
 */
test('a newer Release with no status does not borrow an older Release\'s', () => {
  const running = runningReleases([release('space-1', 1, GREEN), release('space-1', 2)], TARGETED);
  expect(running.get('space-1')).toMatchObject({ releaseNum: 2, liveStatus: null });
});

test('a withdrawn Release is not the one running', () => {
  const running = runningReleases(
    [release('space-1', 1, GREEN), release('space-1', 2, undefined, { Published: false })],
    TARGETED,
  );
  expect(running.get('space-1')?.releaseNum).toBe(1);
});

test('a Release for another Target is not the one running', () => {
  const running = runningReleases(
    [release('space-1', 1, GREEN), release('space-1', 2, GREEN, { TargetID: 'target-old' })],
    TARGETED,
  );
  expect(running.get('space-1')?.releaseNum).toBe(1);
});

test('a Space with no release Target runs no Release', () => {
  const running = runningReleases([release('space-1', 1, GREEN)], new Map([['space-1', undefined]]));
  expect(running.has('space-1')).toBe(false);
});

// ── What the Healthy gate concludes from it ─────────────────────────────────

test('a green Release passes, with or without an operation', () => {
  expect(liveStatusFailure('dev', { releaseNum: 4, liveStatus: GREEN })).toBeNull();
  const noOperation: LiveStatus = { Reporter: 'flux-watcher', Sync: 'Synced', Health: 'Healthy' };
  expect(liveStatusFailure('dev', { releaseNum: 4, liveStatus: noOperation })).toBeNull();
});

const STAGE: ChangeOrderStage = {
  id: 'staging',
  previousStageId: 'dev',
  spaceIds: ['s1'],
  index: 2,
  isSource: false,
  isFirst: false,
  prerequisites: ['Healthy'],
};

/** `carrying` is the Spaces `ChangeOrder.Releases` names; by default, every released one. */
function progress(released: string[], carrying: string[] = released): ChangeOrderProgress {
  return {
    availability: 'available',
    resolvedSpaceIds: new Set(['d1']),
    releasedSpaceIds: new Set(released),
    carryingReleases: carryingReleaseMap(carrying),
    restoredSpaceIds: new Set(),
    releasedRestoredSpaceIds: new Set(),
  };
}

function healthyGate(released: string[], liveStatus: LiveStatus | null, carrying: string[] = released) {
  return buildGatesForStage({
    stage: STAGE,
    previousStageSpaces: [
      {
        spaceId: 'd1',
        loaded: true,
        variantName: 'dev',
        releaseTargetId: 't1',
        release: { releaseNum: 2, liveStatus },
      },
    ],
    progress: progress(released, carrying),
    componentName: 'app',
    changeOrderSlug: 'co-1',
  }).find((gate) => gate.id === 'check/healthy');
}

test('the healthy gate passes over a released, green previous stage', () => {
  expect(healthyGate(['d1'], GREEN)).toMatchObject({ ok: true, evaluated: true });
});

/*
 * The Release whose status is read has to carry the change. A green status on a
 * Space that has not released the change is about something else.
 */
test('the healthy gate fails when no published Release carries the change', () => {
  expect(healthyGate([], GREEN)).toMatchObject({
    ok: false,
    evaluated: true,
    reason: "dev has not published a release carrying 'co-1'.",
  });
});

/*
 * ⚠️ RELEASED ONCE IS NOT CARRIED NOW. The Release that released the change
 * was withdrawn: the Space stays in `ReleasedSpaceIDs`, but `ChangeOrder.Releases`
 * has no entry for it, and that entry is what the server's gate reads. A green
 * status on what the Space now runs is not about this change.
 */
test('the healthy gate fails for a released Space whose carrying Release was withdrawn', () => {
  expect(healthyGate(['d1'], GREEN, [])).toMatchObject({
    ok: false,
    evaluated: true,
    reason: "dev has not published a release carrying 'co-1'.",
  });
});

test('ChangeOrder.Releases, not ReleasedSpaceIDs, is what the progress carries', () => {
  const read = deriveProgress({
    changeOrderSpaceId: 'base',
    ownSpaceReached: true,
    state: undefined,
    resolvedSpaceIds: ['base', 'd1', 'd2'],
    releasedSpaceIds: ['d1', 'd2'],
    restoredSpaceIds: undefined,
    releasedRestoredSpaceIds: undefined,
    releases: [{ SpaceID: 'd1', ReleaseID: 'r-7', ReleaseNum: 7 }],
  });
  expect(read.releasedSpaceIds.has('d2')).toBe(true);
  expect(read.carryingReleases.get('d1')).toEqual({ releaseId: 'r-7', releaseNum: 7 });
  expect(read.carryingReleases.has('d2')).toBe(false);
});

test('the healthy gate fails on a Release not reported on yet', () => {
  expect(healthyGate(['d1'], null)).toMatchObject({
    ok: false,
    evaluated: true,
    reason: 'dev has no live status for release 2 yet.',
  });
});

test('a digest keeps its algorithm and abbreviates its hash', () => {
  expect(formatDigest('sha256:4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1')).toBe(
    'sha256:4f4fb700ef54',
  );
  expect(formatDigest('4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5')).toBe('4f4fb70');
});

// ── The component graph ─────────────────────────────────────────────────────

test('a deployment carries the status of the Release it runs, and a Base carries none', () => {
  const spaces = [
    { Space: { SpaceID: 'dep', Slug: 'dep', ReleaseTargetID: 'target-1' } },
    { Space: { SpaceID: 'base', Slug: 'base', ReleaseTargetID: 'target-2' } },
  ] as ExtendedSpaceRead[];
  // Only `dep` has a Unit on a Target, so `base` is a Base.
  const units = [{ Unit: { UnitID: 'u1', SpaceID: 'dep', Slug: 'app', TargetID: 'target-1' } }] as ExtendedUnitRead[];
  const running = new Map([
    ['dep', { releaseNum: 3, manifestDigest: 'sha256:abc', liveStatus: GREEN }],
    ['base', { releaseNum: 1, liveStatus: GREEN }],
  ]);
  const { deployments } = buildComponentData(
    spaces,
    units,
    new Map(units.map((u) => [u.Unit!.UnitID!, u])),
    new Map(),
    undefined,
    undefined,
    undefined,
    running,
  );
  const dep = deployments.find((d) => d.deploymentId === 'dep');
  expect(dep?.liveStatus).toEqual(GREEN);
  expect(dep?.runningRelease).toEqual({ releaseNum: 3, manifestDigest: 'sha256:abc' });

  const base = deployments.find((d) => d.deploymentId === 'base');
  expect(base?.type).toBe('Base');
  expect(base?.liveStatus).toBeUndefined();
  expect(base?.runningRelease).toBeUndefined();
});

test('live status reads in normalized words whatever tool reported it', () => {
  const flux: LiveStatus = {
    ...GREEN,
    Reporter: 'k8sbot',
    ReporterSync: 'ReconciliationSucceeded',
    ReporterHealth: 'Succeeded',
  };
  expect(liveStatusText(GREEN)).toBe('Synced · Healthy');
  expect(liveStatusText(flux)).toBe('Synced · Healthy');
  expect(liveStatusText({ ...flux, Health: 'Degraded' })).toBe('Synced · Degraded');
  expect(liveStatusText(null)).toBe('Not reported');
});
