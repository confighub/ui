// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { getApiErrorMessage } from '@/utility/error-functions';
import type { ChangeOrder, ChangeOrderRead } from '@confighub/rtk-query';

import { useGetDraftCreateDryRunQuery } from '../changeOrderImageDiffApi';
import { draftCopy } from './draftCopy';
import type { DraftProblem, DraftUpstream } from './draftTypes';
import {
  type DraftSkippedUnit,
  isRefusal,
  refusalProblem,
  skippedUnitsOf,
} from './draftValidation';
import { useRetry } from './useRetry';
import { useSettledValue } from './useSettledValue';

/** How long the draft waits after the last change before it asks the server again. */
export const DRAFT_VALIDATION_SETTLE_MS = 400;

export interface DraftValidation {
  /**
   * - `idle`: there is no request to make (the end or the workflow is not decided yet).
   * - `pending`: the draft changed and the answer for it has not landed.
   * - `passed`: the server would create it. `skippedUnits` is its answer.
   * - `refused`: the server would not (a 4xx). `problems` says why, on the row it belongs to.
   * - `failed`: the server did not answer (a 5xx, the network): nothing is known about the draft,
   *   and Create waits; `problems` holds one "Could not establish" beside Create.
   */
  status: 'idle' | 'pending' | 'passed' | 'refused' | 'failed';
  problems: DraftProblem[];
  /**
   * The Units the ChangeOrder would pass over, and why. From this answer when it `passed`; when
   * it was refused over the name alone, from the last answer for the same decisions under another
   * name, since which Units are passed over does not depend on the name. Empty otherwise.
   */
  skippedUnits: DraftSkippedUnit[];
  /** True when `skippedUnits` is the server's answer for these decisions (empty can be one). */
  answered: boolean;
  /**
   * The ChangeOrder as the server would create it. Its ids were rolled back with the dry run and
   * name nothing.
   */
  result: ChangeOrderRead | undefined;
  /** Asks again when the server did not answer (`failed`). Does nothing otherwise. */
  retry: () => void;
}

export interface UseDraftValidationArgs {
  baseSpaceId: string | undefined;
  /** `draftCreateRequest` of the decisions; `undefined` while there is no request to make. */
  request: ChangeOrder | undefined;
  /** The base's Units in their listed order, for `skippedUnits`' order. */
  unitOrder?: readonly string[];
  /** `useDraftChangeCards`' `basis`: a write to the base asks again, whatever the request says. */
  basis?: string;
  /**
   * True while the client already refuses the name (empty, malformed, taken): the server would
   * only refuse it again, so nothing is sent, and `skippedUnits` stays the last answer for the
   * same decisions under another name.
   */
  nameRefused?: boolean;
  /**
   * What the request is built from (the end, the ranges): when its reads failed there is no
   * request to send, and validation fails with them, with their retry, rather than wait.
   */
  upstream?: DraftUpstream;
  skip?: boolean;
}

/**
 * The server's own verdict on the draft: the create request, sent as a dry run (`dry_run=true`,
 * which runs every check the create makes and rolls back), whenever the decisions have been
 * still for `DRAFT_VALIDATION_SETTLE_MS`.
 *
 * Through `getDraftCreateDryRun`, an untagged query keyed on the request: never the generated
 * `createChangeOrder` mutation, whose `ChangeOrder` invalidation refetches every ChangeOrder list
 * on each dry run. Asking again about the same decisions reads the answer already had.
 *
 * Its answer is `SkippedUnits` ("Passed over") and every refusal the create would meet, mapped
 * to the ledger row it belongs to: a name the Space has (409) on Name; the policy on Path; a
 * Space the change cannot reach, or targets that disagree on the start, on Where and How much.
 */
export function useDraftValidation(args: UseDraftValidationArgs): DraftValidation {
  const {
    baseSpaceId,
    request,
    unitOrder,
    basis = '',
    nameRefused = false,
    upstream,
    skip = false,
  } = args;
  const upstreamFailed = upstream?.failed === true;
  const decided = request !== undefined && baseSpaceId !== undefined;
  const asked = decided && !nameRefused;
  // Keyed on the request's text, so a render that rebuilds an equal request is not a change.
  const key = asked ? JSON.stringify([baseSpaceId, request, basis]) : '';
  const settledKey = useSettledValue(key, DRAFT_VALIDATION_SETTLE_MS);
  const settled = useMemo(
    () =>
      settledKey === ''
        ? undefined
        : (JSON.parse(settledKey) as [string, ChangeOrder, string]),
    [settledKey],
  );
  // The same decisions under any name: what `SkippedUnits` depends on.
  const unnamedKey = decided
    ? JSON.stringify([baseSpaceId, { ...request, Slug: '' }, basis])
    : '';
  const [lastPassed, setLastPassed] = useState<
    { key: string; result: ChangeOrderRead; skippedUnits: DraftSkippedUnit[] } | undefined
  >(undefined);
  const read = useGetDraftCreateDryRunQuery(
    {
      spaceId: settled?.[0] ?? '',
      changeOrder: settled?.[1] ?? { Slug: '' },
      basis: settled?.[2],
    },
    { skip: skip || settled === undefined },
  );

  // Only a server that did not answer is asked again: a refusal would be the same refusal.
  const failedToAnswer =
    read.isError && !isRefusal((read.error as { status?: unknown } | undefined)?.status);
  const retry = useRetry(
    [
      {
        isError: failedToAnswer,
        isUninitialized: read.isUninitialized,
        refetch: read.refetch,
      },
    ],
    upstream?.retry,
  );

  const validation = useMemo((): DraftValidation => {
    if (upstreamFailed && !skip)
      return {
        status: 'failed',
        problems: [
          {
            row: 'create',
            code: 'read-failed',
            message: draftCopy.couldNotEstablish,
            source: 'client',
            blocks: true,
          },
        ],
        skippedUnits: [],
        answered: false,
        result: undefined,
        retry,
      };
    if (key === '' || skip)
      return {
        status: 'idle',
        problems: [],
        skippedUnits: [],
        answered: false,
        result: undefined,
        retry,
      };
    if (
      key !== settledKey ||
      read.isFetching ||
      (read.currentData === undefined && !read.isError)
    ) {
      return {
        status: 'pending',
        problems: [],
        skippedUnits: [],
        answered: false,
        result: undefined,
        retry,
      };
    }
    if (read.isError) {
      const status = (read.error as { status?: unknown } | undefined)?.status;
      if (!isRefusal(status)) {
        const problem: DraftProblem = {
          row: 'create',
          code: 'dry-run-failed',
          message: draftCopy.couldNotEstablish,
          source: 'server',
          blocks: true,
        };
        return {
          status: 'failed',
          problems: [problem],
          skippedUnits: [],
          answered: false,
          result: undefined,
          retry,
        };
      }
      const problem = refusalProblem(status, getApiErrorMessage(read.error));
      // The server names the Tag the slug would mint; the reader chose a name.
      const slug = settled?.[1].Slug ?? '';
      const named =
        problem.code === 'name-taken'
          ? { ...problem, message: draftCopy.problems.nameTaken(slug) }
          : problem;
      return {
        status: 'refused',
        problems: [named],
        skippedUnits: [],
        answered: false,
        result: undefined,
        retry,
      };
    }
    return {
      status: 'passed',
      problems: [],
      skippedUnits: skippedUnitsOf(read.currentData, unitOrder),
      answered: true,
      result: read.currentData,
      retry,
    };
  }, [
    upstreamFailed,
    key,
    skip,
    settledKey,
    settled,
    read.isFetching,
    read.currentData,
    read.isError,
    read.error,
    unitOrder,
    retry,
  ]);

  // Recorded during render, guarded so it settles at once: the last list passed for these decisions.
  if (
    validation.status === 'passed' &&
    validation.result !== undefined &&
    (lastPassed?.key !== unnamedKey || lastPassed.result !== validation.result)
  ) {
    setLastPassed({
      key: unnamedKey,
      result: validation.result,
      skippedUnits: validation.skippedUnits,
    });
  }
  const refusedOverName =
    validation.status === 'refused' &&
    validation.problems.every((problem) => problem.row === 'name');
  if (refusedOverName && lastPassed?.key === unnamedKey) {
    return { ...validation, skippedUnits: lastPassed.skippedUnits, answered: true };
  }
  if (decided && nameRefused && !skip && lastPassed?.key === unnamedKey) {
    return { ...validation, skippedUnits: lastPassed.skippedUnits, answered: true };
  }
  return validation;
}
