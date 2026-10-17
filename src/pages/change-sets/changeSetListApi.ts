// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a row of the ChangeSets list reads of its ChangeSet: its Revisions, with the
 * Attestations covering them, and the diff of its Units from before it to it.
 *
 * Untagged, unlike the generated reads: a Unit or Revision written anywhere would
 * otherwise refetch every row the list has shown. The list's Refresh reads them
 * again instead, through `at`, the time the list was last read, which is part of
 * the cache key and sent nowhere.
 */

import {
  confighubApi,
  type ListAllRevisionsApiResponse,
  type SearchUnitDiffApiResponse,
} from '@confighub/rtk-query';

import { SOURCE_REVISION_LIMIT } from '../x/apps/change-order/useFanOutSource';

const changeSetListApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    getChangeSetRowRevisions: build.query<ListAllRevisionsApiResponse, { changeSetId: string; at: number }>({
      query: ({ changeSetId }) => ({
        url: '/revision',
        params: {
          where: `ChangeSetID = '${changeSetId}'`,
          distinct_on: 'Off',
          limit: SOURCE_REVISION_LIMIT,
          // Attestations is what `include` expands, so it has to be selected for them to come back.
          select: 'RevisionID,UnitID,SpaceID,RevisionNum,UserID,CreatedAt,Attestations',
          include: 'Attestations',
        },
      }),
    }),
    getChangeSetRowDiff: build.query<SearchUnitDiffApiResponse, { changeSetId: string; unitIds: string[]; at: number }>({
      query: ({ changeSetId, unitIds }) => ({
        url: '/unit_diff',
        params: {
          where: `UnitID IN (${unitIds.map((id) => `'${id}'`).join(', ')})`,
          from: `Before:ChangeSet:${changeSetId}`,
          to: `ChangeSet:${changeSetId}`,
          // The unchanged siblings of each changed container: where a native sidecar is read.
          include: 'Context',
        },
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetChangeSetRowRevisionsQuery, useGetChangeSetRowDiffQuery } = changeSetListApi;
