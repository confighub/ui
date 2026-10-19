// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The reads "New ChangeOrder"'s picker makes once it opens, by Space id: the bases'
 * ChangeOrders, the bases' Units and the variants' Units. However many Components there are,
 * each read is a bounded number of requests: `fetchChunks` splits its `SpaceID IN (...)` so
 * every request fits the server's query-string limit (see `inClauseChunks.ts`).
 */
import {
  confighubApi,
  type ListAllChangeOrdersApiArg,
  type ListAllChangeOrdersApiResponse,
  type ListAllUnitsApiArg,
  type ListAllUnitsApiResponse,
} from '@confighub/rtk-query';
import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

import { fetchChunks } from '@/hooks/chunkedQueriesApi';

import { PICKER_READ_COLUMN } from './newChangeOrderModel';

// Typed as the generated arguments' so tests/api-field-lists.pure.spec.ts checks them against the API.
/** What the draft's default-template rule and the row read off a ChangeOrder. */
const CHANGE_ORDER_FIELDS: Pick<ListAllChangeOrdersApiArg, 'select'> = {
  select: 'ChangeOrderID,Slug,SpaceID,CreatedAt,InScopeSpaceIDs,UpdateType,State,AbortedReason',
};
const BASE_UNIT_FIELDS: Pick<ListAllUnitsApiArg, 'select'> = { select: 'UnitID,SpaceID,HeadRevisionNum' };
const VARIANT_UNIT_FIELDS: Pick<ListAllUnitsApiArg, 'select'> = {
  select: 'UnitID,SpaceID,UpstreamSpaceID,UpstreamUnitID,UpstreamRevisionNum',
};

export interface PickerSpaceIdsArg {
  spaceIds: string[];
}

/** Sorted, without duplicates: the same Spaces in another order share one cache entry. */
const idSet = (ids: readonly string[] | undefined): string[] => [...new Set(ids ?? [])].sort();

const pickerReadsApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    /** Every ChangeOrder of the base Spaces: a base can hold many, so each chunk is read to its last page. */
    listPickerChangeOrders: build.query<ListAllChangeOrdersApiResponse, PickerSpaceIdsArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<ListAllChangeOrdersApiResponse[number]>(
          PICKER_READ_COLUMN.changeOrders,
          idSet(arg.spaceIds),
          (where) => ({ url: `/change_order`, params: { where, ...CHANGE_ORDER_FIELDS } }),
          baseQuery,
          { paged: true },
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({ endpointName, endpointDefinition, queryArgs: { spaceIds: idSet(queryArgs.spaceIds) } }),
      providesTags: ['ChangeOrder'],
    }),
    /** The base Spaces' Units and their heads. */
    listPickerBaseUnits: build.query<ListAllUnitsApiResponse, PickerSpaceIdsArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<ListAllUnitsApiResponse[number]>(
          PICKER_READ_COLUMN.baseUnits,
          idSet(arg.spaceIds),
          (where) => ({ url: `/unit`, params: { where, ...BASE_UNIT_FIELDS } }),
          baseQuery,
          { paged: true },
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({ endpointName, endpointDefinition, queryArgs: { spaceIds: idSet(queryArgs.spaceIds) } }),
      providesTags: ['Unit'],
    }),
    /** Every Unit of the variant Spaces, with what it was cloned from and which Revision of it it took. */
    listPickerVariantUnits: build.query<ListAllUnitsApiResponse, PickerSpaceIdsArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<ListAllUnitsApiResponse[number]>(
          PICKER_READ_COLUMN.variantUnits,
          idSet(arg.spaceIds),
          (where) => ({ url: `/unit`, params: { where, ...VARIANT_UNIT_FIELDS } }),
          baseQuery,
          { paged: true },
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({ endpointName, endpointDefinition, queryArgs: { spaceIds: idSet(queryArgs.spaceIds) } }),
      providesTags: ['Unit'],
    }),
  }),
  overrideExisting: false,
});

export const { useListPickerChangeOrdersQuery, useListPickerBaseUnitsQuery, useListPickerVariantUnitsQuery } = pickerReadsApi;
