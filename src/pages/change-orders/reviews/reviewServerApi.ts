// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The server gate reads the reviews need beyond the promote dry run per stage
 * (`useServerStageGates`), as RTK Query endpoints. The two dry runs are sent with
 * `authFetch` (`quietServerCalls.ts`), NOT the RTK base query, whose 403 handler
 * replaces the page with /access-denied: a 403 here is "not evaluated for you".
 * Each returns the HTTP status
 * and the body, a refusal's body too, because #5788 puts the gate rows in the
 * 422 of a Release dry run; `stageReviewInputs.ts` reads them (`releaseAnswerOf`,
 * `promoteFinalOf`). Nothing here reads message text.
 *
 * - `releaseGates`: `POST /space/{id}/release {ChangeOrderID, DryRun:true}` per
 *   Space. Rolled back by the server; writes nothing.
 * - `promoteFinal`: `POST /promote {ChangeOrderID, DryRun:true}` with no
 *   TargetStage: `Complete` and the `Final` rows, or the completed refusal.
 * - `listGroupMembers`: the CURRENT members of each Group a requirement names
 *   (`/user?where=GroupIDs ? '<id>'`), for the who-can list only.
 */

import { defaultSerializeQueryArgs } from '@reduxjs/toolkit/query';

import { confighubApi, type UserRead } from '@confighub/rtk-query';

import { authFetch } from '@/auth/session';
import { fetchAllPages } from '@/hooks/chunkedQueriesApi';

import { promoteDryRun, releaseDryRuns } from './quietServerCalls';
import type { ServerAnswer } from './stageReviewInputs';

const sorted = (ids: readonly string[] | undefined) => [...new Set((ids ?? []).filter(Boolean))].sort();


export const reviewServerApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    releaseGates: build.query<Record<string, ServerAnswer>, { changeOrderId: string; spaceIds: string[] }>({
      queryFn: async (arg) => ({ data: await releaseDryRuns(authFetch, arg.changeOrderId, sorted(arg.spaceIds)) }),
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({
          endpointName,
          endpointDefinition,
          queryArgs: { changeOrderId: queryArgs?.changeOrderId, spaceIds: sorted(queryArgs?.spaceIds) },
        }),
      providesTags: ['Release', 'Attest', 'Attestation'],
    }),
    promoteFinal: build.query<ServerAnswer, { changeOrderId: string; refreshKey: string }>({
      queryFn: async (arg) => ({ data: await promoteDryRun(authFetch, { ChangeOrderID: arg.changeOrderId }) }),
      providesTags: ['Attest', 'Attestation', 'Release'],
    }),
    listGroupMembers: build.query<Record<string, UserRead[]>, { groupIds: string[] }>({
      queryFn: async (arg, _api, _extra, baseQuery) => {
        const groupIds = sorted(arg.groupIds);
        const answers = await Promise.all(
          groupIds.map((groupId) =>
            fetchAllPages<{ User?: UserRead }>({ url: '/user', params: { where: `GroupIDs ? '${groupId}'` } }, baseQuery),
          ),
        );
        const members: Record<string, UserRead[]> = {};
        for (const [index, answer] of answers.entries()) {
          if ('error' in answer && answer.error !== undefined) return { error: answer.error };
          members[groupIds[index]] = (answer.data ?? []).flatMap((entry) => (entry.User ? [entry.User] : []));
        }
        return { data: members };
      },
      serializeQueryArgs: ({ endpointName, endpointDefinition, queryArgs }) =>
        defaultSerializeQueryArgs({ endpointName, endpointDefinition, queryArgs: { groupIds: sorted(queryArgs?.groupIds) } }),
      providesTags: ['User', 'Group'],
    }),
  }),
  overrideExisting: false,
});

export const { useReleaseGatesQuery, usePromoteFinalQuery, useListGroupMembersQuery } = reviewServerApi;
