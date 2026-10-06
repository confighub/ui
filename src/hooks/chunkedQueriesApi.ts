// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Bulk reads by id, split into requests the server accepts.
 *
 * The generated `listAllUnits`, `searchUnitData`, `searchRevisionData` and the two
 * mutation-source searches take one `where` string. For a large Component the
 * `<column> IN (...)` over every id is longer than the server's 8,192-character query
 * string, and a Revision search's `limit` goes over its 1,000-row cap, so the whole read
 * fails with HTTP 400. These endpoints take the ids themselves, send one request per
 * chunk from `chunkInClause` and return the rows of all chunks as one list, with the
 * generated endpoints' URLs, parameters, response types and tags.
 *
 * The cache key is the SET of ids: the same ids in another order or with duplicates
 * share one cache entry, so a list that arrives in a different order does not refetch.
 */
import {
  defaultSerializeQueryArgs,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
  type FetchBaseQueryMeta,
} from '@reduxjs/toolkit/query';

import {
  confighubApi,
  type ListAllReleasesApiResponse,
  type ListAllUnitsApiResponse,
  type ListUsersApiResponse,
  type SearchRevisionDataApiResponse,
  type SearchRevisionMutationSourcesApiResponse,
  type SearchUnitDataApiResponse,
  type SearchUnitMutationSourcesApiResponse,
} from '@confighub/rtk-query';

import { chunkIds, inClause } from './inClauseChunks';

/** At most this many chunk requests are in flight for one query. */
export const MAX_PARALLEL_CHUNKS = 4;

export interface ListAllUnitsChunkedArg {
  spaceIds: string[];
  select?: string;
  include?: string;
}

export interface SpaceIdsArg {
  spaceIds: string[];
}

export interface UnitIdsArg {
  unitIds: string[];
}

export interface RevisionIdsArg {
  revisionIds: string[];
}

export interface ReleaseIdsArg {
  releaseIds: string[];
}

export interface UserIdsArg {
  userIds: string[];
}

/** Ids for each request of a by-id read that a page fires on its own, kept short. */
export const BY_ID_CHUNK_SIZE = 50;

/** The base query RTK hands a `queryFn`: the API's own, with its auth handling. */
type ChunkBaseQuery = (
  args: string | FetchArgs,
) => ReturnType<BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError>>;
type ChunkResult<T> = { data: T[] } | { error: FetchBaseQueryError };

/**
 * Sorted and without duplicates or empties: the form the cache key is built from.
 *
 * `ids` can be undefined: when a query is skipped, RTK still runs the endpoint's
 * `serializeQueryArgs` on `skipToken` (a Symbol, so every field reads undefined), and a
 * throw there takes the whole page down on first render.
 */
const idSet = (ids: readonly (string | undefined | null)[] | undefined): string[] =>
  Array.from(new Set((ids ?? []).filter((id): id is string => !!id))).sort();

/** The response header carrying the token for a list's next page. */
const CONTINUE_HEADER = 'ConfigHub-Continue';

/** The largest page a list returns. */
const PAGE_LIMIT = 1000;

/**
 * Every page of one list request: the request is repeated with the token from the
 * previous response's `ConfigHub-Continue` header until a response has none. A page can
 * hold fewer rows than the limit, or none, and still be followed by more, so the header
 * and not the row count says when the list is done.
 */
async function fetchAllPages<T>(
  args: FetchArgs,
  baseQuery: ChunkBaseQuery,
): Promise<{ data: T[]; error?: undefined } | { error: FetchBaseQueryError }> {
  const rows: T[] = [];
  let token: string | undefined;
  do {
    const params: Record<string, unknown> = { ...args.params, limit: PAGE_LIMIT };
    if (token) params.continue = token;
    const result = await baseQuery({ ...args, params });
    if (result.error) return { error: result.error };
    rows.push(...((result.data as T[] | undefined) ?? []));
    const meta = result.meta as FetchBaseQueryMeta | undefined;
    token = meta?.response?.headers.get(CONTINUE_HEADER) ?? undefined;
  } while (token);
  return { data: rows };
}

/**
 * One request per chunk, at most MAX_PARALLEL_CHUNKS at a time, rows concatenated in
 * chunk order. When a chunk fails, the result is the error of the first failed chunk:
 * a partial list would look complete to every caller. With `paged`, each chunk is read
 * to its last page.
 */
async function fetchChunks<T>(
  column: string,
  ids: readonly string[],
  request: (where: string, count: number) => FetchArgs,
  baseQuery: ChunkBaseQuery,
  { paged = false, maxItems }: { paged?: boolean; maxItems?: number } = {},
): Promise<ChunkResult<T>> {
  const chunks = chunkIds(column, ids, { maxItems });
  const results: ({ data: T[] } | { error: FetchBaseQueryError } | undefined)[] = new Array(
    chunks.length,
  );
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const index = next++;
      const chunk = chunks[index];
      const args = request(inClause(column, chunk), chunk.length);
      const result = paged
        ? await fetchAllPages<T>(args, baseQuery)
        : await baseQuery(args);
      results[index] = result.error
        ? { error: result.error }
        : { data: (result.data as T[] | undefined) ?? [] };
      // Later chunks cannot change the outcome once one has failed.
      if (result.error) next = chunks.length;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MAX_PARALLEL_CHUNKS, chunks.length) }, () => worker()),
  );

  const rows: T[] = [];
  for (const result of results) {
    if (!result) continue;
    if ('error' in result) return { error: result.error };
    rows.push(...result.data);
  }
  return { data: rows };
}

const chunkedQueriesApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    listAllUnitsChunked: build.query<ListAllUnitsApiResponse, ListAllUnitsChunkedArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<ListAllUnitsApiResponse[number]>(
          'SpaceID',
          idSet(arg.spaceIds),
          (where) => ({
            url: `/unit`,
            params: { where, select: arg.select, include: arg.include },
          }),
          baseQuery,
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { ...queryArgs, spaceIds: idSet(queryArgs.spaceIds) },
        }),
      providesTags: ['Unit'],
    }),
    // Every published Release of the Spaces, narrowed to what picking each Space's
    // running Release and drawing its live status needs. Releases accumulate with every
    // publish, so unlike the reads above one chunk can run to several pages.
    listPublishedReleasesChunked: build.query<ListAllReleasesApiResponse, SpaceIdsArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<ListAllReleasesApiResponse[number]>(
          'SpaceID',
          idSet(arg.spaceIds),
          (where) => ({
            url: `/release`,
            params: {
              where: `${where} AND Published = true`,
              select: 'ReleaseID,SpaceID,TargetID,ReleaseNum,ManifestDigest,CreatedAt,Published,LiveStatus',
            },
          }),
          baseQuery,
          { paged: true },
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { spaceIds: idSet(queryArgs.spaceIds) },
        }),
      providesTags: ['Release'],
    }),
    listReleasesByIdChunked: build.query<ListAllReleasesApiResponse, ReleaseIdsArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<ListAllReleasesApiResponse[number]>(
          'ReleaseID',
          idSet(arg.releaseIds),
          (where) => ({ url: `/release`, params: { where } }),
          baseQuery,
          { maxItems: BY_ID_CHUNK_SIZE },
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { releaseIds: idSet(queryArgs.releaseIds) },
        }),
      providesTags: ['Release'],
    }),
    listUsersByIdChunked: build.query<ListUsersApiResponse, UserIdsArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<ListUsersApiResponse[number]>(
          'UserID',
          idSet(arg.userIds),
          (where) => ({ url: `/user`, params: { where } }),
          baseQuery,
          { maxItems: BY_ID_CHUNK_SIZE },
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { userIds: idSet(queryArgs.userIds) },
        }),
      providesTags: ['User'],
    }),
    searchUnitDataChunked: build.query<SearchUnitDataApiResponse, UnitIdsArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<SearchUnitDataApiResponse[number]>(
          'UnitID',
          idSet(arg.unitIds),
          (where) => ({ url: `/unit_data`, params: { where } }),
          baseQuery,
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { unitIds: idSet(queryArgs.unitIds) },
        }),
      providesTags: ['Unit'],
    }),
    // distinct_on=Off: the default keeps one Revision per Unit, and a diff asks for two
    // of the same Unit. The server wants an explicit limit in exchange, and the rows of
    // one chunk are at most its ids.
    searchRevisionDataChunked: build.query<SearchRevisionDataApiResponse, RevisionIdsArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<SearchRevisionDataApiResponse[number]>(
          'RevisionID',
          idSet(arg.revisionIds),
          (where, count) => ({
            url: `/revision_data`,
            params: { where, distinct_on: 'Off', limit: count },
          }),
          baseQuery,
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { revisionIds: idSet(queryArgs.revisionIds) },
        }),
      providesTags: ['Revision'],
    }),
    searchUnitMutationSourcesChunked: build.query<SearchUnitMutationSourcesApiResponse, UnitIdsArg>(
      {
        queryFn: (arg, _api, _extra, baseQuery) =>
          fetchChunks<SearchUnitMutationSourcesApiResponse[number]>(
            'UnitID',
            idSet(arg.unitIds),
            (where) => ({ url: `/unit_mutation_sources`, params: { where } }),
            baseQuery,
          ),
        serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
          defaultSerializeQueryArgs({
            endpointName,
            endpointDefinition,
            queryArgs: { unitIds: idSet(queryArgs.unitIds) },
          }),
        providesTags: ['Unit'],
      },
    ),
    searchRevisionMutationSourcesChunked: build.query<
      SearchRevisionMutationSourcesApiResponse,
      RevisionIdsArg
    >({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<SearchRevisionMutationSourcesApiResponse[number]>(
          'RevisionID',
          idSet(arg.revisionIds),
          (where, count) => ({
            url: `/revision_mutation_sources`,
            params: { where, distinct_on: 'Off', limit: count },
          }),
          baseQuery,
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { revisionIds: idSet(queryArgs.revisionIds) },
        }),
      providesTags: ['Revision'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAllUnitsChunkedQuery,
  useListPublishedReleasesChunkedQuery,
  useListReleasesByIdChunkedQuery,
  useListUsersByIdChunkedQuery,
  useSearchUnitDataChunkedQuery,
  useSearchRevisionDataChunkedQuery,
  useSearchUnitMutationSourcesChunkedQuery,
  useSearchRevisionMutationSourcesChunkedQuery,
} = chunkedQueriesApi;
