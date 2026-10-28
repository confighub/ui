// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a Transform paths draft reads, untagged and never invalidating:
 *
 * - The fan-out Links of the variants: which shared sources they read, and how far each has taken
 *   its source. Chunked by the variants' Spaces and read to the last page (`fetchChunks`).
 * - The resolve dry run that previews the change: each followed Link resolved in its variant, to
 *   the change's end, written nowhere (`dry_run=true`), with each Unit's configuration and diff.
 *   A PATCH that writes nothing; chunked by the Units it resolves.
 * - Each source's diff from where the variants are to the end, for "At the source".
 */
import {
  confighubApi,
  type SearchListLinksApiArg,
  type SearchListLinksApiResponse,
  type UnitCreateOrUpdateResponseRead,
  type UnitDiff,
} from '@confighub/rtk-query';
import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

import { fetchChunks } from '@/hooks/chunkedQueriesApi';

import { FAN_OUT_TYPES, type DraftResolveRequest } from './draftFanOut';

// Typed as the generated argument's so tests/api-field-lists.pure.spec.ts checks it against the API.
/** What the draft reads off a fan-out Link. */
const LINK_FIELDS: Pick<SearchListLinksApiArg, 'select'> = {
  select: 'LinkID,Slug,SpaceID,FromUnitID,ToUnitID,ToSpaceID,UpdateType,AutoUpdate,UpstreamLastMergedRevisionNum,UpstreamPaths,UpstreamGetters',
};

const TYPE_CLAUSE = `UpdateType IN (${FAN_OUT_TYPES.map((type) => `'${type}'`).join(', ')})`;

/** Sorted, without duplicates: the same ids in another order share one cache entry. */
const idSet = (ids: readonly string[] | undefined): string[] => [...new Set(ids ?? [])].sort();

export interface DraftFanOutLinksArg {
  /** The variants' Spaces: `Link.SpaceID`. */
  spaceIds: string[];
}

export interface DraftResolveDryRunArg extends DraftResolveRequest {
  /** A write anywhere asks again: the variants' and the sources' head Revisions, as text. */
  basis: string;
}

export interface DraftFanOutDiffItem {
  spaceId: string;
  unitId: string;
  from: string;
  to: string;
}

const draftFanOutApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    listDraftFanOutLinks: build.query<SearchListLinksApiResponse, DraftFanOutLinksArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<SearchListLinksApiResponse[number]>(
          'SpaceID',
          idSet(arg.spaceIds),
          (where) => ({ url: `/link`, params: { where: `${where} AND ${TYPE_CLAUSE}`, ...LINK_FIELDS } }),
          baseQuery,
          { paged: true },
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({ endpointName, endpointDefinition, queryArgs: { spaceIds: idSet(queryArgs.spaceIds) } }),
    }),
    getDraftResolveDryRun: build.query<UnitCreateOrUpdateResponseRead[], DraftResolveDryRunArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<UnitCreateOrUpdateResponseRead>(
          'UnitID',
          idSet(arg.fromUnitIds),
          (where) => ({
            url: '/unit',
            method: 'PATCH',
            headers: { 'Content-Type': 'application/merge-patch+json' },
            // Pre-stringified: the merge-patch body is sent as it is.
            body: JSON.stringify({}),
            params: { where, resolve: `Link:${arg.linkWhere}`, dry_run: true, include: 'ConfigData,Diff', merge_end: arg.mergeEnd },
          }),
          baseQuery,
        ),
      keepUnusedDataFor: 30,
    }),
    getDraftFanOutSourceDiffs: build.query<UnitDiff[], { items: DraftFanOutDiffItem[] }>({
      queryFn: async ({ items }, _api, _extra, baseQuery) => {
        const answers = await Promise.all(
          items.map((item) =>
            baseQuery({ url: `/space/${item.spaceId}/unit/${item.unitId}/diff`, params: { from: item.from, to: item.to, include: 'Context' } }),
          ),
        );
        const failed = answers.find((answer) => answer.error !== undefined);
        if (failed?.error !== undefined) return { error: failed.error };
        return { data: answers.map((answer, index) => ({ ...(answer.data as UnitDiff), UnitID: items[index].unitId })) };
      },
      keepUnusedDataFor: 30,
    }),
  }),
  overrideExisting: false,
});

export const { useListDraftFanOutLinksQuery, useGetDraftResolveDryRunQuery, useGetDraftFanOutSourceDiffsQuery } = draftFanOutApi;
