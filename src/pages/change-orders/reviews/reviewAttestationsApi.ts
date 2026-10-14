// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Attestation reads of the review panel, as RTK Query endpoints. They read
 * RECORDS (who, what, note, revoker) for the decisions list and the history;
 * counts come only from the server's gate rows (#5788).
 *
 * - `listAttestationRecords`: this ChangeOrder's records (`ChangeOrderID =`),
 *   and the records the server's gate entries name (`AttestationID IN`), which
 *   include approvals made without the ChangeOrder and carried forward.
 * - `listRevocations`: the records that revoke any of the given ones
 *   (`RevokedAttestationID IN`), of ANY Type, for the revoker's name.
 * - `attestDryRunsByType`: `POST /attest?dry_run=true`, one per Type, as one
 *   query keyed by its request, so coverage needs no effect. It writes nothing.
 *   Sent with `authFetch` (`quietServerCalls.ts`): a 403 is this Type's error.
 *
 * Paging and chunking reuse `fetchAllPages` / `fetchChunks` (4 chunks in parallel).
 */

import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

import {
  confighubApi,
  type AttestRequest,
  type AttestationRead,
  type ExtendedAttestationRead,
} from '@confighub/rtk-query';

import { authFetch } from '@/auth/session';
import { fetchAllPages, fetchChunks } from '@/hooks/chunkedQueriesApi';

import { attestDryRuns, type DryRunAnswer } from './quietServerCalls';

export type { DryRunAnswer } from './quietServerCalls';

const sorted = (ids: readonly string[] | undefined) => [...new Set((ids ?? []).filter(Boolean))].sort();
const records = (rows: readonly ExtendedAttestationRead[]) =>
  rows.flatMap((row) => (row.Attestation === undefined ? [] : [row.Attestation]));

export const reviewAttestationsApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    listAttestationRecords: build.query<AttestationRead[], { changeOrderId: string; attestationIds: string[] }>({
      queryFn: async (arg, _api, _extra, baseQuery) => {
        const own = await fetchAllPages<ExtendedAttestationRead>(
          { url: '/attestation', params: { where: `ChangeOrderID = '${arg.changeOrderId}'` } },
          baseQuery,
        );
        if ('error' in own && own.error !== undefined) return { error: own.error };
        const ids = sorted(arg.attestationIds);
        const named =
          ids.length === 0
            ? { data: [] as ExtendedAttestationRead[] }
            : await fetchChunks<ExtendedAttestationRead>('AttestationID', ids, (where) => ({ url: '/attestation', params: { where } }), baseQuery, {
                paged: true,
              });
        if ('error' in named) return { error: named.error };
        const byId = new Map<string, AttestationRead>();
        for (const record of [...records(own.data ?? []), ...records(named.data)]) {
          if (record.AttestationID) byId.set(record.AttestationID, record);
        }
        return { data: [...byId.values()] };
      },
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { changeOrderId: queryArgs?.changeOrderId, attestationIds: sorted(queryArgs?.attestationIds) },
        }),
      // `attest` invalidates `Attest`; a revocation invalidates `Attestation`.
      providesTags: ['Attestation', 'Attest'],
    }),
    listRevocations: build.query<AttestationRead[], { attestationIds: string[] }>({
      queryFn: async (arg, _api, _extra, baseQuery) => {
        const ids = sorted(arg.attestationIds);
        if (ids.length === 0) return { data: [] };
        const read = await fetchChunks<ExtendedAttestationRead>(
          'RevokedAttestationID',
          ids,
          (where) => ({ url: '/attestation', params: { where } }),
          baseQuery,
          { paged: true },
        );
        if ('error' in read) return { error: read.error };
        return { data: records(read.data) };
      },
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({ endpointName, endpointDefinition, queryArgs: { attestationIds: sorted(queryArgs?.attestationIds) } }),
      providesTags: ['Attestation', 'Attest'],
    }),
    /** One dry run per Type, in one query: a hook cannot call a query per Type in a loop. */
    attestDryRunsByType: build.query<Record<string, DryRunAnswer>, { request: AttestRequest; types: string[] }>({
      // authFetch, not the RTK base query: a reviewer without Approve is refused (403), which
      // must say so here rather than replace the page with /access-denied.
      queryFn: async (arg) => ({ data: await attestDryRuns(authFetch, arg.request, arg.types) }),
      providesTags: ['Attest', 'Attestation'],
    }),
  }),
  overrideExisting: false,
});

export const { useListAttestationRecordsQuery, useListRevocationsQuery, useAttestDryRunsByTypeQuery } = reviewAttestationsApi;
