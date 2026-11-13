// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a row of the ChangeSets list reads of its ChangeSet: its Revisions, with the
 * Attestations covering them, and the diff of its Units from before it to it. And what the
 * list reads of every ChangeSet it shows to count their approvals: the same Revisions, of all
 * of them at once.
 *
 * Untagged, unlike the generated reads: a Unit or Revision written anywhere would
 * otherwise refetch every row the list has shown. The list's Refresh reads them
 * again instead, through `at`, the time the list was last read, which is part of
 * the cache key and sent nowhere.
 */

import {
  confighubApi,
  type ExtendedRevisionRead,
  type ListAllRevisionsApiResponse,
  type SearchUnitDiffApiResponse,
} from '@confighub/rtk-query';
import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

import { fetchChunks } from '@/hooks/chunkedQueriesApi';

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
    getChangeSetsRevisions: build.query<ExtendedRevisionRead[], { changeSetIds: string[] }>({
      queryFn: async ({ changeSetIds }, _api, _extra, baseQuery) => {
        const read = await fetchChunks<ExtendedRevisionRead>(
          'ChangeSetID',
          changeSetIds,
          (where) => ({
            url: '/revision',
            params: {
              where,
              distinct_on: 'Off',
              // ChangeSetID groups them by ChangeSet; Attestations is what `include` expands.
              select: 'RevisionID,UnitID,SpaceID,RevisionNum,UserID,CreatedAt,ChangeSetID,Attestations',
              include: 'Attestations',
            },
          }),
          baseQuery,
          { paged: true },
        );
        return 'error' in read ? { error: read.error } : { data: read.data };
      },
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { changeSetIds: [...(queryArgs?.changeSetIds ?? [])].sort() },
        }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetChangeSetRowRevisionsQuery, useGetChangeSetRowDiffQuery, useGetChangeSetsRevisionsQuery } = changeSetListApi;
