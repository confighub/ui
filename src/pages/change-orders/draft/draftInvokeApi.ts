// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The function dry run an Invoke draft previews with: the same call the ChangeOrder will run (an
 * inline function and its arguments, or a saved Invocation and its values), run over the Units
 * each variant in scope selects, written nowhere (`dry_run=true`), with each Unit's diff.
 *
 * Untagged and never invalidating: it is a POST that writes nothing, and the generated
 * `invokeFunctionsOnOrg` mutation invalidates every Invocation list on each run. One request per
 * chunk of Spaces (`fetchChunks`), so a Component of many variants is not one request.
 */
import {
  confighubApi,
  type CreateInvocationApiResponse,
  type FunctionInvocationsRequest,
  type Invocation,
  type InvokeFunctionsOnOrgApiResponse,
} from '@confighub/rtk-query';
import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

import { fetchChunks } from '@/hooks/chunkedQueriesApi';

export interface DraftFunctionDryRunArg {
  spaceIds: string[];
  /** A Unit where expression ANDed with the Spaces; `''` for every Unit of them. */
  whereUnit: string;
  request: FunctionInvocationsRequest;
}

/** Sorted, without duplicates: the same Spaces in another order share one cache entry. */
const idSet = (ids: readonly string[] | undefined): string[] => [...new Set(ids ?? [])].sort();

/** `SpaceID IN (…)` ANDed with a Unit where expression. The grammar joins terms with AND, and has no brackets. */
export const withWhereUnit = (where: string, whereUnit: string) => (whereUnit.trim() === '' ? where : `${where} AND ${whereUnit.trim()}`);

const draftInvokeApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    getDraftFunctionDryRun: build.query<InvokeFunctionsOnOrgApiResponse, DraftFunctionDryRunArg>({
      queryFn: (arg, _api, _extra, baseQuery) =>
        fetchChunks<InvokeFunctionsOnOrgApiResponse[number]>(
          'SpaceID',
          idSet(arg.spaceIds),
          (where) => ({
            url: '/function/invoke',
            method: 'POST',
            body: arg.request,
            params: { dry_run: true, include: 'Diff', where: withWhereUnit(where, arg.whereUnit) },
          }),
          baseQuery,
        ),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({ endpointName, endpointDefinition, queryArgs: { ...queryArgs, spaceIds: idSet(queryArgs.spaceIds) } }),
      keepUnusedDataFor: 30,
    }),
    /**
     * The Invocation an inline call's Create would save, saved as a dry run: every check the save
     * makes, rolled back. Untagged, like the function dry run: the generated `createInvocation`
     * would invalidate every Invocation list on each check.
     */
    getDraftInvocationDryRun: build.query<CreateInvocationApiResponse, { spaceId: string; invocation: Invocation }>({
      query: ({ spaceId, invocation }) => ({ url: `/space/${spaceId}/invocation`, method: 'POST', body: invocation, params: { dry_run: true } }),
      keepUnusedDataFor: 30,
    }),
  }),
  overrideExisting: false,
});

export const { useGetDraftFunctionDryRunQuery, useGetDraftInvocationDryRunQuery } = draftInvokeApi;
