// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every Revision a set of where clauses selects: each clause read to its last page (the
 * `ConfigHub-Continue` header, not the row count, says when a list is done), the rows merged
 * and kept once per Revision. See `taggedRevisionReads.ts` for why the Tags are read this way.
 */
import { MAX_PARALLEL_CHUNKS, fetchAllPages, inParallel } from '@/hooks/chunkedQueriesApi';
import { type ListAllRevisionsApiResponse, confighubApi } from '@confighub/rtk-query';

import { uniqueRevisions } from './taggedRevisionReads';

export interface TaggedRevisionsArgs {
  wheres: string[];
  select: string;
  include?: string;
  /**
   * Read again when a Revision is written. A page's own view of a ChangeOrder is live; a row
   * in a list of ChangeOrders is not, so a write elsewhere does not refetch every row.
   */
  live?: boolean;
}

const taggedRevisionsApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    getTaggedRevisions: build.query<ListAllRevisionsApiResponse, TaggedRevisionsArgs>({
      queryFn: async ({ wheres, select, include }, _api, _extra, baseQuery) => {
        const pages = await inParallel(wheres, MAX_PARALLEL_CHUNKS, (where) =>
          fetchAllPages<ListAllRevisionsApiResponse[number]>(
            {
              url: '/revision',
              params: {
                where,
                distinct_on: 'Off',
                select,
                ...(include === undefined ? {} : { include }),
              },
            },
            baseQuery,
          ),
        );
        const rows: ListAllRevisionsApiResponse = [];
        for (const page of pages) {
          if (page.error !== undefined) return { error: page.error };
          rows.push(...page.data);
        }
        return { data: uniqueRevisions(rows) };
      },
      providesTags: (_result, _error, { live }) => (live === true ? ['Revision'] : []),
    }),
  }),
});

export const { useGetTaggedRevisionsQuery } = taggedRevisionsApi;

/** Fills the cache `useGetTaggedRevisionsQuery` reads, for the same arguments, and draws nothing. */
export const useTaggedRevisionsPrefetch = () => taggedRevisionsApi.usePrefetch('getTaggedRevisions');
