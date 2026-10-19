// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback } from 'react';

import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type ChangeOrder,
  type ChangeOrderRead,
  useCreateChangeOrderMutation,
} from '@confighub/rtk-query';

import { changeOrderPath } from '../changeOrderAddress';
import { draftCopy } from './draftCopy';
import type { DraftProblem } from './draftTypes';
import { isRefusal, refusalProblem } from './draftValidation';

export type DraftCreateOutcome =
  /** Created. `path` is its detail view, to navigate to. */
  | { ok: true; changeOrder: ChangeOrderRead; path: string }
  /** Refused, on the row the refusal belongs to: nothing was created. */
  | { ok: false; problem: DraftProblem };

export interface CreateDraft {
  create: (input: CreateInput) => Promise<DraftCreateOutcome>;
  isCreating: boolean;
}

/** The create request as `useCreateDraft` sends it. */
interface CreateInput {
  baseSpaceId: string;
  baseSpaceSlug: string;
  request: ChangeOrder;
}

/**
 * Create the ChangeOrder the draft describes: the generated `createChangeOrder`, for real.
 * Its `ChangeOrder` invalidation is wanted here, so the console lists the new one.
 *
 * No confirm step: the page is the preview, and Create commits.
 *
 * A 4xx is the server refusing, shown on the row it belongs to. Anything else — a 5xx, a
 * network error — leaves it unknown whether the ChangeOrder was created, which is what the
 * problem beside Create says.
 */
export function useCreateDraft(): CreateDraft {
  const [createChangeOrder, { isLoading }] = useCreateChangeOrderMutation();
  const create = useCallback(
    async ({
      baseSpaceId,
      baseSpaceSlug,
      request,
    }: CreateInput): Promise<DraftCreateOutcome> => {
      try {
        const changeOrder = await createChangeOrder({
          spaceId: baseSpaceId,
          changeOrder: request,
        }).unwrap();
        return {
          ok: true,
          changeOrder,
          path: changeOrderPath(baseSpaceSlug, changeOrder.Slug),
        };
      } catch (error) {
        const status = (error as { status?: unknown } | undefined)?.status;
        if (!isRefusal(status)) {
          return {
            ok: false,
            problem: {
              row: 'create',
              code: 'create-unknown',
              message: draftCopy.couldNotEstablish,
              source: 'server',
              blocks: true,
            },
          };
        }
        const problem = refusalProblem(status, getApiErrorMessage(error));
        if (problem.code !== 'name-taken') return { ok: false, problem };
        return {
          ok: false,
          problem: { ...problem, message: draftCopy.problems.nameTaken(request.Slug) },
        };
      }
    },
    [createChangeOrder],
  );
  return { create, isCreating: isLoading };
}
