// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Audit log's pages of AuditEvents. The generated `listAuditEvents` returns the rows and
 * drops the response's `ConfigHub-Continue` header, which says where the next page starts, so
 * this reads it as the page's `continueToken`. "Load more" asks for the page after the last.
 */
import { CONTINUE_HEADER } from '@/hooks/chunkedQueriesApi';
import {
  type ExtendedAuditEventRead,
  type ListAuditEventsApiResponse,
  confighubApi,
} from '@confighub/rtk-query';
import type { FetchBaseQueryMeta } from '@reduxjs/toolkit/query';

/** Events per page. The server allows up to 1,000. */
export const AUDIT_PAGE_SIZE = 100;

export interface AuditEventPage {
  events: ExtendedAuditEventRead[];
  /** Where the next page starts; absent on the last page. */
  continueToken?: string;
}

export interface AuditEventPagesArg {
  /** The where expression, or `''` for every event the caller may read. */
  where: string;
  limit?: number;
}

const auditLogApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    listAuditEventPages: build.infiniteQuery<AuditEventPage, AuditEventPagesArg, string>({
      infiniteQueryOptions: {
        // The first page has no token; `''` sends none.
        initialPageParam: '',
        getNextPageParam: (lastPage) => lastPage.continueToken,
      },
      query: ({ queryArg, pageParam }) => ({
        url: `/audit_event`,
        params: {
          where: queryArg.where === '' ? undefined : queryArg.where,
          order_by: 'DESC:OccurredAt',
          limit: queryArg.limit ?? AUDIT_PAGE_SIZE,
          continue: pageParam === '' ? undefined : pageParam,
        },
      }),
      transformResponse: (events: ListAuditEventsApiResponse, meta) => ({
        events: events ?? [],
        continueToken:
          (meta as FetchBaseQueryMeta | undefined)?.response?.headers.get(CONTINUE_HEADER) ||
          undefined,
      }),
      providesTags: ['AuditEvent'],
    }),
  }),
});

export const { useListAuditEventPagesInfiniteQuery } = auditLogApi;
