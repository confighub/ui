// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Rollout History card's reads: the people and the Releases its records
 * name, put together with the ChangeOrder's own records by `rolloutHistory.ts`.
 *
 * READS
 * - Users: `ListUsers` with `UserID IN (...)` over every UserID in the three
 *   records and the Releases, in chunks of `BY_ID_CHUNK_SIZE`. A UserID it
 *   does not return is drawn as "Unknown user".
 * - Releases: `ChangeOrderID = '<id>'` returns the Releases published for this
 *   Rollout, with publisher and time. `ReleaseID IN (...)` over
 *   `ChangeOrder.Releases`, in chunks of `BY_ID_CHUNK_SIZE`, adds the Release
 *   each Space carries the change in, which can have been published without
 *   naming the Rollout. The two are merged by ReleaseID.
 * - Space names: the org-wide Space list `useRolloutDetail` already reads,
 *   under the same cache key, so it costs no request.
 *
 * The Release reads are polled with the ChangeOrder, as a publish can land at
 * any time and nothing else here would show it.
 */

import { useCallback, useMemo, useState } from 'react';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { useListReleasesByIdChunkedQuery, useListUsersByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { usePolling } from '@/hooks/usePolling';
import { useListAllReleasesQuery, useListSpacesQuery, type ListAllReleasesApiResponse } from '@confighub/rtk-query';

import { ROLLOUT_POLL_INTERVAL_MS } from '../x/apps/rollout/useRolloutData';
import {
  buildHistory,
  historyUserIds,
  mergeReleases,
  resolvePerson,
  type HistoryEntry,
  type HistoryReleaseInput,
  type HistoryUser,
} from './rolloutHistory';
import type { RolloutDetail } from './useRolloutDetail';

const NOW_TICK_MS = 60_000;

export interface RolloutHistory {
  entries: HistoryEntry[];
  recordCount: number;
  /** Stage names in the workflow's order, for the Stage pills. */
  workflowStages: string[];
  /** A Space's name for its ID. Absent when the Space is not in the viewer's list. */
  spaceSlugById: ReadonlyMap<string, string>;
  /** Epoch ms, ticked each minute, for "Today" and "N min ago". */
  now: number;
  createdAt?: number;
  isLoading: boolean;
  error: unknown;
}

const EMPTY_RELEASES: HistoryReleaseInput[] = [];

export function useRolloutHistory(detail: RolloutDetail): RolloutHistory {
  const { userInfo } = useUserInfo();
  const currentUserId = userInfo?.UserID;

  const [now, setNow] = useState(() => Date.now());
  const tick = useCallback(() => setNow(Date.now()), []);
  usePolling(tick, NOW_TICK_MS);

  const changeOrderId = detail.changeOrderId;
  const forOrder = useListAllReleasesQuery(
    { where: `ChangeOrderID = '${changeOrderId ?? ''}'` },
    { skip: changeOrderId === undefined },
  );

  const carriedIds = useMemo(
    () => detail.changeOrderReleases.map((r) => r.ReleaseID).filter((id): id is string => !!id),
    [detail.changeOrderReleases],
  );
  const carried = useListReleasesByIdChunkedQuery({ releaseIds: carriedIds }, { skip: carriedIds.length === 0 });

  const refetchForOrder = forOrder.refetch;
  const refetchReleases = useCallback(() => {
    if (changeOrderId !== undefined) void refetchForOrder();
  }, [changeOrderId, refetchForOrder]);
  usePolling(refetchReleases, ROLLOUT_POLL_INTERVAL_MS);

  const releases = useMemo(() => {
    const read = (data: ListAllReleasesApiResponse | undefined) =>
      (data ?? []).flatMap((entry) => (entry.Release === undefined ? [] : [entry.Release]));
    const merged = mergeReleases(read(forOrder.data), read(carried.data));
    return merged.length === 0 ? EMPTY_RELEASES : merged;
  }, [forOrder.data, carried.data]);

  const userIds = useMemo(
    () =>
      historyUserIds({
        promotions: detail.promotions,
        overrides: detail.promotionOverrides,
        failures: detail.promotionFailures,
        releases,
      }),
    [detail.promotions, detail.promotionOverrides, detail.promotionFailures, releases],
  );
  // `data` keeps the last answer while new IDs are read, so known names stay. Only an ID
  // no finished read has covered waits as "loading"; one a read covered and did not
  // return is "Unknown user".
  const users = useListUsersByIdChunkedQuery({ userIds }, { skip: userIds.length === 0 });
  const [answered, setAnswered] = useState<{ ids: readonly string[]; set: ReadonlySet<string> }>({
    ids: [],
    set: new Set(),
  });
  if (users.currentData !== undefined && answered.ids !== userIds) {
    setAnswered({ ids: userIds, set: new Set([...answered.set, ...userIds]) });
  }
  const usersFetching = users.isFetching;
  const answeredIds = answered.set;
  const userById = useMemo(() => {
    const map = new Map<string, HistoryUser>();
    for (const entry of users.data ?? []) {
      if (entry.User?.UserID) map.set(entry.User.UserID, entry.User);
    }
    return map;
  }, [users.data]);

  const spaces = useListSpacesQuery({});
  const spaceSlugById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of spaces.data ?? []) {
      if (entry.Space?.SpaceID && entry.Space.Slug) map.set(entry.Space.SpaceID, entry.Space.Slug);
    }
    return map;
  }, [spaces.data]);

  const stages = detail.sequence.stages;
  const { workflowStages, stageBySpaceId } = useMemo(() => {
    const names: string[] = [];
    const bySpace = new Map<string, string>();
    for (const stage of stages) {
      if (stage.isSource) continue;
      names.push(stage.id);
      for (const spaceId of stage.spaceIds) if (!bySpace.has(spaceId)) bySpace.set(spaceId, stage.id);
    }
    return { workflowStages: names, stageBySpaceId: bySpace };
  }, [stages]);

  const built = useMemo(
    () =>
      buildHistory({
        promotions: detail.promotions,
        overrides: detail.promotionOverrides,
        failures: detail.promotionFailures,
        releases,
        stageBySpaceId,
        person: (userId) =>
          resolvePerson(
            userId,
            userById,
            currentUserId,
            usersFetching && userId !== undefined && !answeredIds.has(userId),
          ),
      }),
    [
      detail.promotions,
      detail.promotionOverrides,
      detail.promotionFailures,
      releases,
      stageBySpaceId,
      userById,
      currentUserId,
      usersFetching,
      answeredIds,
    ],
  );

  const createdAt = detail.createdAt === undefined ? undefined : Date.parse(detail.createdAt);

  return {
    entries: built.entries,
    recordCount: built.recordCount,
    workflowStages,
    spaceSlugById,
    now,
    createdAt: createdAt === undefined || Number.isNaN(createdAt) ? undefined : createdAt,
    // People resolve after the records; until then every name would read "Unknown user".
    isLoading: users.isLoading || forOrder.isLoading || carried.isLoading,
    error: users.error ?? forOrder.error ?? carried.error,
  };
}
