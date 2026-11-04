// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { fetchChunks } from '@/hooks/chunkedQueriesApi';
import { type ListAllTriggersApiResponse, confighubApi } from '@confighub/rtk-query';
import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

const sortedIds = (ids: readonly string[] | undefined) =>
  Array.from(new Set(ids ?? [])).sort();

/**
 * The Triggers behind a Space's gates, by the IDs its Units record. A Space with many Triggers
 * would put a `TriggerID IN (...)` past the server's query length limit, so the IDs are chunked.
 */
const gateTriggersApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    listGateTriggers: build.query<ListAllTriggersApiResponse, { triggerIds: string[] }>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<ListAllTriggersApiResponse[number]>(
          'TriggerID',
          sortedIds(arg.triggerIds),
          (where) => ({ url: '/trigger', params: { where } }),
          baseQuery,
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { triggerIds: sortedIds(queryArgs?.triggerIds) },
        }),
      providesTags: ['Trigger'],
    }),
  }),
});

export const { useListGateTriggersQuery } = gateTriggersApi;
