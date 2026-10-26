// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useState } from 'react';

import {
  confighubApi,
  type ExtendedUnitRead,
  useGetSpaceQuery,
  useGetUnitQuery,
  useListExtendedRevisionsQuery,
} from '@confighub/rtk-query';

import { useListPublishedReleasesChunkedQueryState } from '@/hooks/chunkedQueriesApi';

import { runningReleases } from '../../apps/liveStatus';
import { type ReleaseSpace, useRunningReleases } from '../../apps/useRunningReleases';
import { unreleasedCount } from './attention';
import { detailsFromUnit, releaseLive, revisionAuthor } from './details';
import type { FetchedDetails } from './verdict';

/**
 * Everything the open Unit's verdict needs that its row does not carry,
 * read for that one Unit only, when its panel opens:
 *
 * - the Unit itself, with its latest event: one read, cached, so moving back
 *   to a Unit already seen asks for nothing;
 * - the author of its head revision, only while it has revisions to release;
 * - the Release its Space runs (with the live status), when the Space has a
 *   release Target;
 * - the slug of the Space's Component, for the link that releases it: only
 *   while there is something to release, so a Unit with nothing to release
 *   never waits for it.
 *
 * While the panel moves from row to row, nothing is asked for, but what is in
 * the cache already is shown, so a Unit read before shows its verdict at once.
 */

/** The Space, Target, upstream and latest event of the Unit, as the Unit page reads them. */
export const UNIT_PANEL_INCLUDE = 'TargetID,SpaceID,UpstreamUnitID,UpstreamSpaceID,UnitEventID';

const NO_SPACES: readonly ReleaseSpace[] = [];

export interface UnitPanelData {
  fetched: FetchedDetails;
  /** The Unit is gone: its read answered 404. */
  gone: boolean;
  /** The slug of the Space's Component, for the Components view's `app`. */
  componentSlug?: string;
  /** Read again what could not be read. */
  retry: () => void;
  /**
   * The read's state is this visit's: not an error left in the cache by an
   * earlier visit, which the panel asks again for as it settles. The live
   * region waits for it, so it says the verdict once, not an old error first.
   */
  current: boolean;
}

const statusOf = (error: unknown): number | string | undefined =>
  error && typeof error === 'object' && 'status' in error ? (error as { status: number | string }).status : undefined;

/** `settled`: the panel has stayed on this row (`useSettledId`); until then nothing is asked for. */
export function useUnitPanelData(row: ExtendedUnitRead | null, settled: boolean): UnitPanelData {
  const spaceId = row?.Unit?.SpaceID ?? '';
  const unitId = row?.Unit?.UnitID ?? '';
  const noIds = !spaceId || !unitId;
  const wait = !settled;
  const head = row?.Unit?.HeadRevisionNum ?? 0;
  const unreleased = row ? unreleasedCount(row) > 0 : false;
  const releaseTargetId = row?.Space?.ReleaseTargetID || undefined;
  const componentId = row?.Space?.ComponentID || undefined;
  const spaceSlug = row?.Space?.Slug ?? '';

  const unitArgs = { spaceId, unitId, include: UNIT_PANEL_INCLUDE };
  const revisionArgs = { spaceId, unitId, where: `RevisionNum = ${head}`, include: 'UserID' };
  const spaceArgs = { spaceId, select: 'ComponentID', include: 'ComponentID' };
  const skipRevisions = noIds || !unreleased || head <= 0;
  const skipSpace = noIds || !componentId || !unreleased;

  // The subscriptions, which ask for what is not cached, once the panel stays on the row.
  const unitQuery = useGetUnitQuery(unitArgs, { skip: wait || noIds });
  useListExtendedRevisionsQuery(revisionArgs, { skip: wait || skipRevisions });
  const spaceQuery = useGetSpaceQuery(spaceArgs, { skip: wait || skipSpace });
  // The same entries, read from the cache only, so they show while the panel moves. currentData, not data:
  // data would still hold the last Unit's answer while a new Unit's is on its way.
  const unit = confighubApi.endpoints.getUnit.useQueryState(unitArgs, { skip: noIds });
  const revisions = confighubApi.endpoints.listExtendedRevisions.useQueryState(revisionArgs, { skip: skipRevisions });
  const space = confighubApi.endpoints.getSpace.useQueryState(spaceArgs, { skip: skipSpace });

  const spaces = useMemo(
    () => (!wait && spaceId && releaseTargetId ? [{ spaceId, releaseTargetId }] : NO_SPACES),
    [wait, spaceId, releaseTargetId],
  );
  const running = useRunningReleases(spaces);
  // While the panel moves, the Release a Space was read running is shown from the cache, so the fact does not come
  // and go as rows pass; nothing is asked for until the panel settles.
  const cachedReleases = useListPublishedReleasesChunkedQueryState({ spaceIds: [spaceId] }, { skip: !spaceId || !releaseTargetId });
  const cachedRelease = useMemo(
    () => (cachedReleases.currentData && releaseTargetId ? runningReleases(cachedReleases.currentData, new Map([[spaceId, releaseTargetId]])).get(spaceId) : undefined),
    [cachedReleases.currentData, spaceId, releaseTargetId],
  );

  const read = unit.currentData;
  const author = revisionAuthor(revisions.currentData?.[0]);
  const runningRelease = running.bySpaceId.get(spaceId) ?? cachedRelease;
  const componentSlug = space.currentData?.Component?.Slug || undefined;
  const componentError = !skipSpace && !componentSlug && space.isError;
  // Release is the primary of a Unit with something to release, so the verdict waits for the slug its link needs.
  const slugPending = !skipSpace && !space.currentData && !space.isError;
  // Read, and the Space has no Component (the row's id is out of date): the same as a Space that is not a Component.
  const noComponent = !skipSpace && !!space.currentData && !componentSlug;
  // A row without ids cannot be read, which is the same to the verdict as a read that failed.
  const status: FetchedDetails['status'] = read && !slugPending ? 'ready' : (!read && unit.isError) || noIds ? 'error' : 'loading';
  const fetched = useMemo<FetchedDetails>(
    () => ({
      status,
      ...(read ? detailsFromUnit(read, spaceSlug) : {}),
      space: { releaseTargetId, componentId: noComponent ? undefined : componentId, componentSlug, componentError },
      headRevision: author ? { author } : undefined,
      release: releaseLive(runningRelease),
    }),
    [status, read, spaceSlug, releaseTargetId, componentId, noComponent, componentSlug, componentError, author, runningRelease],
  );

  const refetchUnit = unitQuery.refetch;
  const refetchSpace = spaceQuery.refetch;
  const unitFailed = unit.isError;
  const spaceFailed = space.isError;
  // A query refetches only once it has started, which it has while the panel stays on the row.
  const retry = useCallback(() => {
    if (wait) return;
    if (!noIds && unitFailed) void refetchUnit();
    if (!skipSpace && spaceFailed) void refetchSpace();
  }, [wait, noIds, unitFailed, refetchUnit, skipSpace, spaceFailed, refetchSpace]);

  // When the panel last settled on this Unit. An error from before then is asked again, so it is not this visit's
  // until a request started since has ended.
  const [settledAt, setSettledAt] = useState<{ unitId: string; at: number } | null>(null);
  if (settled && settledAt?.unitId !== unitId) setSettledAt({ unitId, at: Date.now() });
  if (!settled && settledAt) setSettledAt(null);
  const staleError =
    !read && unit.isError && (!settledAt || settledAt.unitId !== unitId || (unit.startedTimeStamp ?? 0) < settledAt.at || unitQuery.isFetching);

  return {
    fetched,
    gone: !read && unit.isError && statusOf(unit.error) === 404,
    componentSlug,
    retry,
    current: !staleError,
  };
}
