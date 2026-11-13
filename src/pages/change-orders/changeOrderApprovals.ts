// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How many approvals each ChangeOrder of the list has, for the No approvals card: the Approvals
 * recorded with the ChangeOrder, at any of its gates, that passed and have not been revoked.
 */

import { useCallback, useMemo } from 'react';

import { type AttestationRead, confighubApi, type ExtendedAttestationRead } from '@confighub/rtk-query';
import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

import { fetchChunks } from '@/hooks/chunkedQueriesApi';

import { DEFAULT_ATTESTATION_TYPE } from './reviews/changeOrderReviews';
import { useListRevocationsQuery } from './reviews/reviewAttestationsApi';

const changeOrderApprovalsApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    listChangeOrderApprovals: build.query<AttestationRead[], { changeOrderIds: string[] }>({
      queryFn: async ({ changeOrderIds }, _api, _extra, baseQuery) => {
        const read = await fetchChunks<ExtendedAttestationRead>(
          'ChangeOrderID',
          changeOrderIds,
          (where) => ({ url: '/attestation', params: { where: `${where} AND Type = '${DEFAULT_ATTESTATION_TYPE}'` } }),
          baseQuery,
          { paged: true },
        );
        if ('error' in read) return { error: read.error };
        return { data: read.data.flatMap((row) => (row.Attestation === undefined ? [] : [row.Attestation])) };
      },
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { changeOrderIds: [...(queryArgs?.changeOrderIds ?? [])].sort() },
        }),
      providesTags: ['Attestation', 'Attest'],
    }),
  }),
  overrideExisting: false,
});

const { useListChangeOrderApprovalsQuery } = changeOrderApprovalsApi;

/**
 * Each ChangeOrder's approvals: its Approval records that passed, not counting a record that
 * revokes another or one that has been revoked. Every ChangeOrder named is in the map.
 */
export function approvalsByChangeOrder(
  changeOrderIds: readonly string[],
  records: readonly AttestationRead[],
  revocations: readonly AttestationRead[],
): Map<string, number> {
  const revoked = new Set(revocations.flatMap((record) => (record.RevokedAttestationID ? [record.RevokedAttestationID] : [])));
  const counts = new Map<string, number>(changeOrderIds.map((id) => [id, 0]));
  for (const record of records) {
    const id = record.ChangeOrderID;
    if (id === undefined || !counts.has(id)) continue;
    if (record.Type !== DEFAULT_ATTESTATION_TYPE || record.Result !== 'Pass') continue;
    if (record.RevokedAttestationID || revoked.has(record.AttestationID ?? '')) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The approvals of each of the ChangeOrders named, or undefined until they have been read.
 * `refetch` reads them again, keeping the last answer until it is back.
 */
export function useChangeOrderApprovals(changeOrderIds: readonly string[]) {
  const ids = useMemo(() => [...changeOrderIds].sort(), [changeOrderIds]);
  const records = useListChangeOrderApprovalsQuery({ changeOrderIds: ids }, { skip: ids.length === 0 });
  const attestationIds = useMemo(
    () => (records.currentData ?? []).flatMap((record) => (record.AttestationID && !record.RevokedAttestationID ? [record.AttestationID] : [])),
    [records.currentData],
  );
  const revocations = useListRevocationsQuery({ attestationIds }, { skip: attestationIds.length === 0 });

  const approvals = useMemo(() => {
    if (ids.length === 0) return new Map<string, number>();
    if (records.currentData === undefined) return undefined;
    if (attestationIds.length > 0 && revocations.currentData === undefined) return undefined;
    return approvalsByChangeOrder(ids, records.currentData, revocations.currentData ?? []);
  }, [ids, records.currentData, attestationIds.length, revocations.currentData]);

  const refetchRecords = records.refetch;
  const refetch = useCallback(() => {
    if (ids.length > 0) void refetchRecords();
  }, [ids.length, refetchRecords]);

  return { approvals, isError: records.isError || revocations.isError, refetch };
}
