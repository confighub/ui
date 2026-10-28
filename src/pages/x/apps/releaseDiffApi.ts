// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What changed in each Unit between two points of a Space's release history -- a Release,
 * each Unit's head, or nothing -- as the server diffs it.
 *
 * A Release is named by `Release:<id>`, the Revision it bundled in each Unit. A Unit it did
 * not bundle is absent on that side and comes back with that side's RevisionNum 0: absent
 * on the From side, the Unit's resources read as added; absent on the To side, the Unit was
 * not part of the Release at all.
 *
 * One `GET /unit_diff` covers every Unit of a comparison, chunked by id. It needs a From
 * side, and the oldest Release has no predecessor, so a comparison from nothing reads each
 * Unit through `POST /diff`, whose empty From side is no configuration at all.
 */
import { confighubApi, type SearchUnitDiffApiResponse, type UnitDiff } from '@confighub/rtk-query';

import { fetchChunks, inParallel, MAX_PARALLEL_CHUNKS } from '@/hooks/chunkedQueriesApi';
import { fetchConfigDiff, isNothingToDiff } from '@/hooks/configDiffApi';
import { unitDiffErrorOf } from '@/pages/change-orders/changeOrderImageDiffApi';

/** The `to` of a comparison that ends at each Unit's head rather than at a Release. */
export const RELEASE_DIFF_HEAD = 'head';

export interface ReleaseDiffArgs {
  /** The Units compared, sorted, so that one comparison over the same Units is one cache entry. */
  unitIds: string[];
  /** The Release on the From side, or undefined to diff from nothing. */
  fromReleaseId: string | undefined;
  /** The Release on the To side, or RELEASE_DIFF_HEAD. */
  to: string;
  /** Also read the unchanged paths around each change, which name the container an image is in. */
  context: boolean;
}

function toSelector(to: string): string {
  return to === RELEASE_DIFF_HEAD ? 'HeadRevisionNum' : `Release:${to}`;
}

export const releaseDiffApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    getReleaseDiff: build.query<SearchUnitDiffApiResponse, ReleaseDiffArgs>({
      queryFn: async ({ unitIds, fromReleaseId, to, context }, _api, _extra, baseQuery) => {
        const include = context ? 'Context' : undefined;
        if (fromReleaseId !== undefined) {
          const result = await fetchChunks<UnitDiff>(
            'UnitID',
            unitIds,
            (where) => ({
              url: '/unit_diff',
              params: { where, from: `Release:${fromReleaseId}`, to: toSelector(to), include },
            }),
            baseQuery,
            { paged: true },
          );
          return 'error' in result ? { error: result.error } : { data: result.data };
        }
        const data = await inParallel(unitIds, MAX_PARALLEL_CHUNKS, async (unitId): Promise<UnitDiff> => {
          const result = await fetchConfigDiff(
            baseQuery,
            { From: {}, To: { UnitID: unitId, Revision: toSelector(to) } },
            include,
          );
          if ('error' in result) return unitDiffErrorOf(unitId, result.error);
          const read = result.data;
          // The Release bundled no Revision of the Unit: there is nothing on either side.
          if (isNothingToDiff(read)) return { UnitID: unitId, FromRevisionNum: 0, ToRevisionNum: 0 };
          return {
            UnitID: unitId,
            SpaceID: read.To?.SpaceID,
            FromRevisionNum: 0,
            ToRevisionNum: read.To?.RevisionNum,
            Diff: read.Diff,
          };
        });
        return { data };
      },
      // A Release's Revisions stay as they were bundled; a head moves with every write.
      providesTags: (_result, _error, { to }) => (to === RELEASE_DIFF_HEAD ? ['Unit', 'Release'] : ['Release']),
    }),
  }),
  overrideExisting: false,
});

export const { useGetReleaseDiffQuery, useLazyGetReleaseDiffQuery } = releaseDiffApi;
