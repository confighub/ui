// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';

import { useListPublishedReleasesChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { usePolling } from '@/hooks/usePolling';

import { runningReleases, type RunningRelease } from './liveStatus';

/** A Space whose running Release is wanted: its id and its current release Target. */
export interface ReleaseSpace {
  spaceId: string;
  releaseTargetId?: string | null;
}

export interface RunningReleasesResult {
  /**
   * The Release each Space with a release Target is running. A Space with a release
   * Target and no entry has published nothing for it.
   */
  bySpaceId: ReadonlyMap<string, RunningRelease>;
  /**
   * Whether the Releases of these Spaces have been read. Until they have, a Space
   * without an entry tells nothing: it may simply not have arrived.
   */
  loaded: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
}

const NO_RELEASES: ReadonlyMap<string, RunningRelease> = new Map();

/** `usePolling` always runs a timer; when no poll is asked for, its tick does nothing. */
const IDLE_POLL_MS = 60_000;

/**
 * The Release each of the given Spaces is running, with its live status, from one
 * org-level search over the Spaces' published Releases rather than a request per
 * Space. A Space with no release Target runs no Release, so it is not asked about.
 *
 * `pollIntervalMs` keeps the live status current: a reporter writes it onto the
 * Release at its own pace, and nothing in this application is told when. Polling
 * pauses while the tab is hidden.
 */
export function useRunningReleases(
  spaces: readonly ReleaseSpace[],
  { pollIntervalMs = 0 }: { pollIntervalMs?: number } = {},
): RunningReleasesResult {
  const releaseTargetIdBySpaceId = useMemo(() => {
    const map = new Map<string, string>();
    for (const space of spaces) {
      if (space.releaseTargetId) map.set(space.spaceId, space.releaseTargetId);
    }
    return map;
  }, [spaces]);

  // A sorted key, so a list rebuilt on every poll of the Spaces does not refetch.
  const spaceIdsKey = useMemo(
    () => [...releaseTargetIdBySpaceId.keys()].sort().join(','),
    [releaseTargetIdBySpaceId],
  );
  const spaceIds = useMemo(() => (spaceIdsKey ? spaceIdsKey.split(',') : []), [spaceIdsKey]);

  const skip = spaceIds.length === 0;
  const { data, currentData, isSuccess, isFetching, error, refetch } =
    useListPublishedReleasesChunkedQuery({ spaceIds }, { skip });

  const refetchIfAsked = useCallback(() => {
    if (!skip) void refetch();
  }, [skip, refetch]);
  const poll = useCallback(() => {
    if (pollIntervalMs > 0) refetchIfAsked();
  }, [pollIntervalMs, refetchIfAsked]);
  usePolling(poll, pollIntervalMs > 0 ? pollIntervalMs : IDLE_POLL_MS);

  // The previous read is kept on screen while a changed set of Spaces is read, so a
  // card does not flash to "not reported" and back. `loaded` says whether the read is
  // of THESE Spaces, which is what a verdict needs.
  const bySpaceId = useMemo(
    () => (data ? runningReleases(data, releaseTargetIdBySpaceId) : NO_RELEASES),
    [data, releaseTargetIdBySpaceId],
  );

  return {
    bySpaceId,
    loaded: skip || (isSuccess && currentData !== undefined),
    isFetching,
    error,
    refetch: refetchIfAsked,
  };
}
