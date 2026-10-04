// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A deployment's live status is the `LiveStatus` of the Release it is running:
// its latest published Release for its current release Target. These pin how
// that Release is picked, what the `Healthy` gate concludes from its status,
// and how the status is drawn — browser-free.

import { expect, test } from '@playwright/test';

import type { ExtendedReleaseRead, ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';

import { buildComponentData } from '../src/pages/x/apps/componentData';
import {
  deriveHealthPresentation,
  deriveSyncPresentation,
  formatDigest,
  type LiveStatus,
  reporterDetailLines,
  resolveLiveStatusProvider,
  runningReleases,
} from '../src/pages/x/apps/liveStatus';
import { buildGatesForStage, liveStatusFailure } from '../src/pages/x/apps/rollout/rolloutGates';
import { deriveProgress } from '../src/pages/x/apps/rollout/rolloutState';
import type { RolloutProgress, RolloutStage } from '../src/pages/x/apps/rollout/rolloutTypes';
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

test('each failing axis is named, in the server\'s order and words', () => {
  const failure = (status: LiveStatus | null) => liveStatusFailure('dev', { releaseNum: 4, liveStatus: status });
  expect(failure(null)).toBe('dev has no live status for release 4 yet.');
  expect(failure({ ...GREEN, Sync: 'OutOfSync', Health: 'Degraded' })).toBe(
    'dev release 4 is not synced (OutOfSync).',
  );
  expect(failure({ ...GREEN, Operation: 'Running', Health: 'Progressing' })).toBe(
    'dev release 4 is still being deployed.',
  );
  expect(failure({ ...GREEN, Operation: 'Failed', Health: 'Degraded' })).toBe(
    'dev release 4 failed to deploy.',
  );
  expect(failure({ ...GREEN, Health: 'Progressing' })).toBe('dev release 4 is not healthy (Progressing).');
});

const STAGE: RolloutStage = {
  id: 'staging',
  previousStageId: 'dev',
  spaceIds: ['s1'],
  index: 2,
  isSource: false,
  isFirst: false,
  prerequisites: ['Healthy'],
};

/** `carrying` is the Spaces `ChangeOrder.Releases` names; by default, every released one. */
function progress(released: string[], carrying: string[] = released): RolloutProgress {
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

// ── How it is drawn ─────────────────────────────────────────────────────────

test('the vitals read the normalized fields', () => {
  expect(deriveSyncPresentation(GREEN)?.state).toBe('Synced');
  expect(deriveHealthPresentation(GREEN)?.state).toBe('Healthy');
  expect(deriveSyncPresentation({ ...GREEN, Operation: 'Running' })?.state).toBe('Progressing');
  expect(deriveSyncPresentation({ ...GREEN, Operation: 'Failed' })?.state).toBe('OutOfSync');
  expect(deriveHealthPresentation({ ...GREEN, Health: 'Missing' })?.tone).toBe('danger');
  expect(deriveSyncPresentation(null)).toBeNull();
  expect(deriveHealthPresentation(undefined)).toBeNull();
});

test('the reporter names the delivery system', () => {
  expect(resolveLiveStatusProvider(GREEN)).toBe('argocd');
  expect(resolveLiveStatusProvider({ ...GREEN, Reporter: 'flux-watcher' })).toBe('flux');
  expect(resolveLiveStatusProvider({ ...GREEN, Reporter: 'something-else' })).toBe('unknown');
  expect(resolveLiveStatusProvider(null)).toBe('unknown');
});

test("the peek carries the reporter's own words where they say more", () => {
  const errored: LiveStatus = {
    ...GREEN,
    Sync: 'OutOfSync',
    ReporterSync: 'OutOfSync',
    Operation: 'Failed',
    ReporterOperation: 'Error',
  };
  // The reporter's sync word matches the normalized one, so it is not repeated.
  expect(reporterDetailLines(errored, 'sync')).toEqual(['operation: Error']);
  expect(reporterDetailLines({ ...GREEN, ReporterHealth: 'Healthy' }, 'health')).toEqual([
    'operation: Succeeded',
  ]);
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
  expect(dep?.liveStatusProvider).toBe('argocd');

  const base = deployments.find((d) => d.deploymentId === 'base');
  expect(base?.type).toBe('Base');
  expect(base?.liveStatus).toBeUndefined();
  expect(base?.runningRelease).toBeUndefined();
  expect(base?.liveStatusProvider).toBe('unknown');
});
