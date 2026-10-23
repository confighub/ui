// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * useReleaseMagnitudes -- how many changes each Release made, for the counts the release
 * selectors show beside each Release.
 *
 * A Release's count is the diff from the Release before it to itself (from nothing, for the
 * oldest), over every Unit of the release target: the same comparison `ReleasesPane` shows
 * when the Release is selected, read through the same endpoint (`releaseDiffApi`), so the
 * count beside a Release is the count of the changes the pane then draws.
 *
 * The newest `maxReleases` are counted, newest first, a few at a time, so the Releases a
 * reader looks at first are counted first and a long history does not fire every read at
 * once. Each read stays subscribed while the pane is mounted, so publishing a Release, which
 * invalidates `Release`, refreshes the counts. Older Releases read as `unavailable`.
 */
import { useEffect, useMemo } from 'react';
import { shallowEqual } from 'react-redux';

import type { ExtendedReleaseRead } from '@confighub/rtk-query';

import { useAppDispatch, useAppSelector } from '@/hooks/useApp';

import { releaseDiffApi, type ReleaseDiffArgs } from './releaseDiffApi';
import { summarizeReleaseDiff } from './useReleaseDiff';

/** A unit in the release-target set, as `ComponentSidePane` builds the list. */
export interface ReleaseUnitRef {
  unitId: string;
  slug: string;
  spaceId: string;
}

export type ReleaseMagnitudeState =
  /** Not counted yet. */
  | 'pending'
  /** `changedFields`/`changedUnits` are final. */
  | 'resolved'
  /** Outside the counted window, or its diff could not be read. */
  | 'unavailable';

export interface ReleaseMagnitude {
  releaseId: string;
  releaseNum: number;
  /** Changes this Release made against its predecessor. undefined unless state === 'resolved'. */
  changedFields: number | undefined;
  /** Units with at least one change. undefined unless state === 'resolved'. */
  changedUnits: number | undefined;
  state: ReleaseMagnitudeState;
  /** The diff, or a Unit's part of it, could not be read. */
  failed: boolean;
}

export interface UseReleaseMagnitudesResult {
  /** Index-aligned with the `releases` input (newest-first). */
  magnitudes: ReleaseMagnitude[];
  byReleaseId: ReadonlyMap<string, ReleaseMagnitude>;
  /** Some Releases are older than the counted window. */
  truncated: boolean;
}

export interface UseReleaseMagnitudesOptions {
  /** Newest-first, exactly as `ReleaseActions.releases` provides. */
  releases: ExtendedReleaseRead[];
  units: ReleaseUnitRef[];
  /** False => nothing is read, and every count is pending. */
  enabled: boolean;
  /** How many newest Releases are counted. Default 30. */
  maxReleases?: number;
}

/** How many newest Releases are counted by default. Older ones read 'unavailable'. */
const DEFAULT_MAX_RELEASES = 30;
/** Releases whose diffs are read at once. Each read is itself chunked over the Units. */
const PARALLEL_RELEASES = 3;

export function useReleaseMagnitudes({
  releases,
  units,
  enabled,
  maxReleases = DEFAULT_MAX_RELEASES,
}: UseReleaseMagnitudesOptions): UseReleaseMagnitudesResult {
  const dispatch = useAppDispatch();

  // Joined into one string so that a new array of the same Units reads nothing again.
  const unitIdKey = useMemo(() => [...new Set(units.map((u) => u.unitId))].sort().join(','), [units]);

  // One read per counted Release, newest first: the Release before it to the Release.
  const pairArgs = useMemo((): (ReleaseDiffArgs | undefined)[] => {
    const unitIds = unitIdKey ? unitIdKey.split(',') : [];
    const windowSize = Math.min(maxReleases, releases.length);
    return releases.slice(0, windowSize).map((release, i) => {
      const releaseId = release.Release?.ReleaseID;
      if (!enabled || !releaseId || unitIds.length === 0) return undefined;
      return { unitIds, fromReleaseId: releases[i + 1]?.Release?.ReleaseID, to: releaseId, context: false };
    });
  }, [releases, unitIdKey, enabled, maxReleases]);

  useEffect(() => {
    const pending = pairArgs.filter((arg): arg is ReleaseDiffArgs => arg !== undefined);
    const subscriptions: { unsubscribe: () => void }[] = [];
    let cancelled = false;
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < pending.length) {
        const subscription = dispatch(releaseDiffApi.endpoints.getReleaseDiff.initiate(pending[next++]));
        subscriptions.push(subscription);
        await subscription;
      }
    };
    void Promise.all(Array.from({ length: Math.min(PARALLEL_RELEASES, pending.length) }, () => worker()));
    return () => {
      cancelled = true;
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [dispatch, pairArgs]);

  const selectors = useMemo(
    () => pairArgs.map((arg) => (arg ? releaseDiffApi.endpoints.getReleaseDiff.select(arg) : undefined)),
    [pairArgs],
  );
  const reads = useAppSelector((state) => selectors.map((select) => select?.(state)), shallowEqual);

  const magnitudes = useMemo(
    () =>
      releases.map((release, i): ReleaseMagnitude => {
        const base = {
          releaseId: release.Release?.ReleaseID ?? '',
          releaseNum: release.Release?.ReleaseNum ?? 0,
          changedFields: undefined,
          changedUnits: undefined,
          failed: false,
        };
        if (i >= pairArgs.length) return { ...base, state: 'unavailable' };
        const read = reads[i];
        if (read?.isError) return { ...base, state: 'unavailable', failed: true };
        if (read?.data === undefined) return { ...base, state: 'pending' };
        const summary = summarizeReleaseDiff(read.data);
        if (summary.failed) return { ...base, state: 'unavailable', failed: true };
        return {
          ...base,
          changedFields: summary.totalChanges,
          changedUnits: summary.changedUnits,
          state: 'resolved',
        };
      }),
    [releases, pairArgs.length, reads],
  );

  const byReleaseId = useMemo(() => new Map(magnitudes.map((m) => [m.releaseId, m])), [magnitudes]);

  return { magnitudes, byReleaseId, truncated: releases.length > pairArgs.length };
}
