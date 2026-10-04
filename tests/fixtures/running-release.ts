// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Releases a fixture Space is running, and the ones that released a
// ChangeOrder's change, for specs that hand the rollout model its inputs
// directly.

import type { ChangeOrderRelease } from '@confighub/rtk-query';

import type { LiveStatus, RunningRelease } from '../../src/pages/x/apps/liveStatus';
import type { CarryingRelease } from '../../src/pages/x/apps/rollout/rolloutTypes';

/**
 * A published Release carrying `liveStatus`, or one its deploying tool has not
 * reported on yet when `liveStatus` is null.
 */
export function runningRelease(liveStatus: LiveStatus | null, releaseNum = 1): RunningRelease {
  return { releaseNum, liveStatus };
}

/**
 * `ChangeOrder.Releases` for Spaces whose change a published Release carries:
 * one entry per Space, as the server derives it for each released Space whose
 * carrying Release is still published.
 */
export function carryingReleases(
  spaceIds: readonly string[] | undefined,
  releaseNum = 1,
): ChangeOrderRelease[] {
  return (spaceIds ?? []).map((spaceId) => ({
    SpaceID: spaceId,
    ReleaseID: `${spaceId}-release-${releaseNum}`,
    ReleaseNum: releaseNum,
  }));
}

/** The same, as `RolloutProgress.carryingReleases` holds it. */
export function carryingReleaseMap(
  spaceIds: Iterable<string>,
  releaseNum = 1,
): ReadonlyMap<string, CarryingRelease> {
  return new Map(
    [...spaceIds].map((spaceId) => [spaceId, { releaseId: `${spaceId}-release-${releaseNum}`, releaseNum }]),
  );
}
