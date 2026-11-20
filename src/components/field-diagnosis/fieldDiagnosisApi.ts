// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The one read field diagnosis adds: the same field in the other Variants of a Component
// (ARCHITECTURE.md §7.7, PLAN.md decision 15). Read only when the person opens Variants: one blame
// search over the Units, chunked as searchGuardedFieldsChunked is, narrowed to the field's path,
// without following upstream. The rows are matched by Ref, which is the same in every Variant.
import { type SearchUnitBlameApiResponse, confighubApi } from '@confighub/rtk-query';
import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

import { BY_ID_CHUNK_SIZE, fetchChunks } from '@/hooks/chunkedQueriesApi';

export interface FieldVariantsArg {
  unitIds: readonly string[];
  /** The field's server path: the search keeps fields whose path contains it. */
  path: string;
}

const idSet = (ids: readonly string[]) => Array.from(new Set(ids)).sort();

const fieldDiagnosisApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    searchFieldVariants: build.query<SearchUnitBlameApiResponse, FieldVariantsArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<SearchUnitBlameApiResponse[number]>(
          'UnitID',
          idSet(arg.unitIds),
          (where, count) => ({ url: '/unit_blame', params: { where, path: arg.path, upstream: false, limit: count } }),
          baseQuery,
          { maxItems: BY_ID_CHUNK_SIZE },
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { unitIds: idSet(queryArgs.unitIds), path: queryArgs.path },
        }),
      providesTags: ['Unit'],
    }),
  }),
});

export const { useSearchFieldVariantsQuery } = fieldDiagnosisApi;
