// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What an Invoke ChangeOrder's Invocation would withhold in the Spaces it has not run in yet: the
 * invoke API's dry run with the ChangeOrder (`change_order`), which runs what the ChangeOrder runs
 * and passes over every Unit that has already taken it. Its `Conflicts` name the guards.
 *
 * Keyed by the Invocation's Version, so an edit of the Invocation asks again. Untagged, as the
 * draft's dry runs are: the generated invoke mutation would invalidate every Invocation list.
 *
 * SENT WITH `authFetch`, NOT RTK's base query. A reader who may see the ChangeOrder but not invoke
 * is refused (403), and RTK hands a 403 to the app's handler, which leaves the page. Here a refusal
 * is an error the panel reads as "cannot say".
 */
import { confighubApi, type FunctionInvocationsResponse } from '@confighub/rtk-query';

import { authFetch } from '@/auth/session';
import { chunkInClause } from '@/hooks/inClauseChunks';

import { answerOf } from './reviews/quietServerCalls';

export interface InvocationWithheldArg {
  changeOrderId: string;
  /** The Spaces in scope the ChangeOrder has not run in yet. */
  spaceIds: string[];
  /** Not sent: it keys the answer, so an edit of the Invocation asks again. */
  invocationVersion: number | undefined;
}

const invocationClearanceApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    getInvocationWithheld: build.query<FunctionInvocationsResponse[], InvocationWithheldArg>({
      queryFn: async ({ changeOrderId, spaceIds }) => {
        const responses: FunctionInvocationsResponse[] = [];
        for (const where of chunkInClause('SpaceID', [...spaceIds].sort())) {
          const params = new URLSearchParams({ dry_run: 'true', change_order: changeOrderId, where });
          const answer = await answerOf(authFetch, `/api/function/invoke?${params.toString()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (answer.status < 200 || answer.status >= 300 || !Array.isArray(answer.body)) {
            return { error: { status: answer.status, data: answer.body } };
          }
          responses.push(...(answer.body as FunctionInvocationsResponse[]));
        }
        return { data: responses };
      },
      keepUnusedDataFor: 30,
    }),
  }),
  overrideExisting: false,
});

export const { useGetInvocationWithheldQuery } = invocationClearanceApi;
