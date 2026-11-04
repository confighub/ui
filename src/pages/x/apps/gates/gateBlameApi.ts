// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  CONTINUE_HEADER,
  type ChunkBaseQuery,
  MAX_PARALLEL_CHUNKS,
  inParallel,
} from '@/hooks/chunkedQueriesApi';
import { chunkIds, inClause } from '@/hooks/inClauseChunks';
import { type SearchUnitBlameApiResponse, confighubApi } from '@confighub/rtk-query';
import {
  type FetchBaseQueryError,
  type FetchBaseQueryMeta,
  defaultSerializeQueryArgs,
} from '@reduxjs/toolkit/query';

/** The largest page `/unit_blame` returns. */
const BLAME_PAGE_LIMIT = 50;

export interface GateBlameArg {
  spaceIds: string[];
  /** `errors` or `warnings`: only Units with a gate, or a warning. `both`: every Unit, both kinds. */
  findings: 'errors' | 'warnings' | 'both';
}

const FINDING_FILTER: Record<GateBlameArg['findings'], { where?: string; flags: string }> = {
  errors: { where: 'LEN(ValidationErrors) > 0', flags: 'ValidationError' },
  warnings: { where: 'LEN(ValidationWarnings) > 0', flags: 'ValidationWarning' },
  both: { flags: 'ValidationError,ValidationWarning' },
};

const sortedIds = (ids: readonly string[] | undefined) =>
  Array.from(new Set(ids ?? [])).sort();

/** Every page of one `/unit_blame` read, by the `ConfigHub-Continue` token of each response. */
const readAllPages = async (
  baseQuery: ChunkBaseQuery,
  params: Record<string, string>,
): Promise<{ data: SearchUnitBlameApiResponse } | { error: FetchBaseQueryError }> => {
  const rows: SearchUnitBlameApiResponse = [];
  let token: string | undefined;
  do {
    const result = await baseQuery({
      url: '/unit_blame',
      params: { ...params, limit: BLAME_PAGE_LIMIT, ...(token ? { continue: token } : {}) },
    });
    if (result.error) return { error: result.error };
    rows.push(...((result.data as SearchUnitBlameApiResponse | undefined) ?? []));
    token =
      (result.meta as FetchBaseQueryMeta | undefined)?.response?.headers.get(
        CONTINUE_HEADER,
      ) ?? undefined;
  } while (token);
  return { data: rows };
};

/**
 * The Blame of the Units of some Spaces, with only the fields a finding names. The Space list is
 * chunked under the server's query length limit, and each chunk is read to its last page.
 */
const gateBlameApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    searchGateBlame: build.query<SearchUnitBlameApiResponse, GateBlameArg>({
      queryFn: async (arg, _api, _extra, baseQuery) => {
        const filter = FINDING_FILTER[arg.findings];
        const chunks = chunkIds('SpaceID', sortedIds(arg.spaceIds));
        const results = await inParallel(chunks, MAX_PARALLEL_CHUNKS, (chunk) =>
          readAllPages(baseQuery, {
            where: filter.where
              ? `${inClause('SpaceID', chunk)} AND ${filter.where}`
              : inClause('SpaceID', chunk),
            flags: filter.flags,
          }),
        );
        const rows: SearchUnitBlameApiResponse = [];
        for (const result of results) {
          if ('error' in result) return { error: result.error };
          rows.push(...result.data);
        }
        return { data: rows };
      },
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { ...queryArgs, spaceIds: sortedIds(queryArgs?.spaceIds) },
        }),
      providesTags: ['Unit'],
    }),
  }),
});

export const { useSearchGateBlameQuery } = gateBlameApi;
