// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type ChangeOrder,
  type ChangeOrderRead,
  type Invocation,
  useCreateChangeOrderMutation,
  useCreateInvocationMutation,
  useDeleteInvocationMutation,
  useLazyListInvocationsQuery,
} from '@confighub/rtk-query';

import { changeOrderPath } from '../changeOrderAddress';
import { draftCopy } from './draftCopy';
import { type DraftSavedInvocation, functionErrorText, sameInvocationShape, savedInvocationOf } from './draftKinds';
import type { DraftProblem } from './draftTypes';
import { isRefusal, refusalProblem } from './draftValidation';

export type DraftCreateOutcome =
  /** Created. `path` is its detail view, to navigate to. */
  | { ok: true; changeOrder: ChangeOrderRead; path: string }
  /**
   * Not created, or not known to be. `kept` is an Invocation this Create saved and left in place
   * (the ChangeOrder may exist, or the Invocation could not be deleted): the draft holds it from
   * now on, and the next Create runs it rather than save another.
   */
  | { ok: false; problem: DraftProblem; kept?: DraftSavedInvocation };

export interface CreateDraft {
  create: (input: CreateInput) => Promise<DraftCreateOutcome | undefined>;
  isCreating: boolean;
}

/** The create request as `useCreateDraft` sends it. */
interface CreateInput {
  baseSpaceId: string;
  baseSpaceSlug: string;
  request: ChangeOrder;
  /**
   * An Invoke draft's inline call, as the Invocation to save first (`DraftInvoke.save`). Absent
   * when the request already names its Invocation.
   */
  save?: Invocation;
}

const statusOf = (error: unknown) => (error as { status?: unknown } | undefined)?.status;

/** "Could not establish" beside Create: the server did not say, so nobody knows what happened. */
const UNKNOWN: DraftProblem = {
  row: 'create',
  code: 'create-unknown',
  message: draftCopy.couldNotEstablish,
  source: 'server',
  blocks: true,
};

/** A failed write of the ChangeOrder, as the problem beside it: the server's refusal on its row, or not knowing. */
function problemOf(error: unknown, slug: string): DraftProblem {
  const status = statusOf(error);
  if (!isRefusal(status)) return UNKNOWN;
  const problem = refusalProblem(status, getApiErrorMessage(error));
  return problem.code === 'name-taken' ? { ...problem, message: draftCopy.problems.nameTaken(slug) } : problem;
}

/**
 * Create the ChangeOrder the draft describes: the generated `createChangeOrder`, for real.
 * Its `ChangeOrder` invalidation is wanted here, so the console lists the new one.
 *
 * No confirm step: the page is the preview, and Create commits.
 *
 * AN INLINE CALL IS TWO WRITES, MADE SAFE. Its Invocation is saved first, in the base Space; the
 * ChangeOrder is then dry-run against it, and created. The two are not one transaction, so:
 * - the ChangeOrder refused (a 4xx, by the dry run or the create): the Invocation this Create saved
 *   is deleted again, and the problem says so. Nothing is left behind.
 * - the outcome unknown (a 5xx, the network): the ChangeOrder may exist, so the Invocation stays;
 *   the outcome hands it back (`kept`) for the draft to hold, and the next Create runs it.
 * - a 409 on the save (another Invocation took the slug in between): one that runs exactly this
 *   call is used; one that runs anything else is never overwritten, and the name is to change.
 *
 * One Create at a time: a second press while one is under way does nothing.
 */
export function useCreateDraft(): CreateDraft {
  const [createChangeOrder] = useCreateChangeOrderMutation();
  const [createInvocation] = useCreateInvocationMutation();
  const [deleteInvocation] = useDeleteInvocationMutation();
  const [listInvocations] = useLazyListInvocationsQuery();
  const busy = useRef(false);
  const [isCreating, setCreating] = useState(false);

  const saveFirst = useCallback(
    async (baseSpaceId: string, baseSpaceSlug: string, save: Invocation): Promise<{ invocation: DraftSavedInvocation; savedNow: boolean } | { problem: DraftProblem }> => {
      try {
        const created = savedInvocationOf(await createInvocation({ spaceId: baseSpaceId, invocation: save }).unwrap());
        return created === undefined ? { problem: UNKNOWN } : { invocation: created, savedNow: true };
      } catch (error) {
        const status = statusOf(error);
        if (status === 409) {
          // Taken between the check and the save: the one there is used only if it is this very call.
          try {
            const found = await listInvocations({ spaceId: baseSpaceId, where: `Slug = '${save.Slug}'` }).unwrap();
            const existing = savedInvocationOf(found[0]?.Invocation);
            if (existing !== undefined && sameInvocationShape(existing, save)) return { invocation: existing, savedNow: false };
          } catch {
            return { problem: UNKNOWN };
          }
          return {
            problem: { row: 'name', code: 'invocation-name-taken', message: draftCopy.invoke.problems.invocationNameRaced(save.Slug, baseSpaceSlug), source: 'server', blocks: true },
          };
        }
        if (isRefusal(status))
          return { problem: { row: 'what', code: 'invocation-refused', message: functionErrorText(getApiErrorMessage(error)), source: 'server', blocks: true } };
        return { problem: UNKNOWN };
      }
    },
    [createInvocation, listInvocations],
  );

  /** The ChangeOrder was refused after this Create saved its Invocation: take the Invocation back. */
  const undoSave = useCallback(
    async (problem: DraftProblem, invocation: DraftSavedInvocation, baseSpaceSlug: string): Promise<DraftCreateOutcome> => {
      const words = draftCopy.invoke.problems;
      try {
        await deleteInvocation({ spaceId: invocation.spaceId, invocationId: invocation.invocationId }).unwrap();
        return { ok: false, problem: { ...problem, detail: words.invocationRemoved(invocation.slug) } };
      } catch {
        return { ok: false, problem: { ...problem, detail: words.invocationLeft(invocation.slug, baseSpaceSlug) }, kept: invocation };
      }
    },
    [deleteInvocation],
  );

  const create = useCallback(
    async ({ baseSpaceId, baseSpaceSlug, request, save }: CreateInput): Promise<DraftCreateOutcome | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setCreating(true);
      try {
        let sent = request;
        let saved: { invocation: DraftSavedInvocation; savedNow: boolean } | undefined;
        if (save !== undefined) {
          const result = await saveFirst(baseSpaceId, baseSpaceSlug, save);
          if ('problem' in result) return { ok: false, problem: result.problem };
          saved = result;
          sent = { ...request, InvocationID: result.invocation.invocationId };
          // Asked before the real write: a refusal now costs only the Invocation just saved.
          try {
            await createChangeOrder({ spaceId: baseSpaceId, changeOrder: sent, dryRun: true }).unwrap();
          } catch (error) {
            const problem = problemOf(error, request.Slug);
            if (problem === UNKNOWN) return failedAfterSave(problem, result.invocation, baseSpaceSlug);
            return result.savedNow ? undoSave({ ...problem, message: refusedWords(problem) }, result.invocation, baseSpaceSlug) : { ok: false, problem };
          }
        }
        try {
          const changeOrder = await createChangeOrder({ spaceId: baseSpaceId, changeOrder: sent }).unwrap();
          return { ok: true, changeOrder, path: changeOrderPath(baseSpaceSlug, changeOrder.Slug) };
        } catch (error) {
          const problem = problemOf(error, request.Slug);
          if (saved === undefined) return { ok: false, problem };
          if (problem === UNKNOWN) return failedAfterSave(problem, saved.invocation, baseSpaceSlug);
          return saved.savedNow ? undoSave({ ...problem, message: refusedWords(problem) }, saved.invocation, baseSpaceSlug) : { ok: false, problem };
        }
      } finally {
        busy.current = false;
        setCreating(false);
      }
    },
    [saveFirst, undoSave, createChangeOrder],
  );
  return { create, isCreating };
}

/** A refusal said beside Create leads with what did not happen; one on a row of its own keeps the row's words. */
const refusedWords = (problem: DraftProblem) => (problem.row === 'create' ? `${draftCopy.invoke.problems.notCreated} ${problem.message}` : problem.message);

/** Not known whether the ChangeOrder was created: the Invocation it would run stays, and is held. */
function failedAfterSave(problem: DraftProblem, invocation: DraftSavedInvocation, baseSpaceSlug: string): DraftCreateOutcome {
  const words = draftCopy.invoke.problems;
  return {
    ok: false,
    problem: { ...problem, message: words.unknownCreated, detail: words.invocationKept(invocation.slug, baseSpaceSlug) },
    kept: invocation,
  };
}
