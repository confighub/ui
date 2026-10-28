// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Links a draft can propagate over, from its base: their downstream Space and their type,
 * and nothing else. A base can have a Link per variant Unit, so the read is chunked by base
 * and read to its last page (`fetchChunks`), and selects two fields rather than whole Links.
 *
 * Nothing provides or invalidates a tag: the draft asks again each time it opens.
 */
import { confighubApi, type SearchListLinksApiArg, type SearchListLinksApiResponse } from '@confighub/rtk-query';
import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

import { fetchChunks } from '@/hooks/chunkedQueriesApi';

import { DRAFT_UPDATE_TYPES } from './draftUpdateTypes';

// Typed as the generated argument's so tests/api-field-lists.pure.spec.ts checks it against the API.
/** What the draft reads off a Link: where it goes, and how. */
const LINK_FIELDS: Pick<SearchListLinksApiArg, 'select'> = { select: 'SpaceID,UpdateType' };

/** Only the types a draft propagates by. */
const TYPE_CLAUSE = `UpdateType IN (${DRAFT_UPDATE_TYPES.map((type) => `'${type}'`).join(', ')})`;

export interface DraftLinksArg {
  /** The base Spaces whose Links are read: `Link.ToSpaceID`. */
  baseSpaceIds: string[];
}

/** Sorted, without duplicates: the same Spaces in another order share one cache entry. */
const idSet = (ids: readonly string[] | undefined): string[] => [...new Set(ids ?? [])].sort();

const draftLinksApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    /** The UpgradeUnit and MergeUnits Links from the base Spaces, by their downstream Space and type. */
    listDraftLinks: build.query<SearchListLinksApiResponse, DraftLinksArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<SearchListLinksApiResponse[number]>(
          'ToSpaceID',
          idSet(arg.baseSpaceIds),
          (where) => ({ url: `/link`, params: { where: `${where} AND ${TYPE_CLAUSE}`, ...LINK_FIELDS } }),
          baseQuery,
          { paged: true },
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({ endpointName, endpointDefinition, queryArgs: { baseSpaceIds: idSet(queryArgs.baseSpaceIds) } }),
    }),
  }),
  overrideExisting: false,
});

export const { useListDraftLinksQuery } = draftLinksApi;
