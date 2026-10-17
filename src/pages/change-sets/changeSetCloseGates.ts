// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The gates closing a ChangeSet is judged against, when a ChangeWorkflow governs it.
 *
 * The server evaluates them: closing a ChangeSet is detaching its Units, and the
 * first Unit detached closes the whole of it, so the workflow's `Final` is evaluated
 * then over every Space in `InScopeSpaceIDs` (internal/views/changeset_workflow.go).
 * This page asks the same question with a dry run of that bulk Unit PATCH, and reads
 * the answer two ways:
 *
 * - **200 or 207**: the close would go ahead (or some Units failed for another
 *   reason). Each detached Unit's response carries `ChangeSetClose`, every gate per
 *   Space.
 * - **422**: refused. Every Unit fails the same way, so the server answers with that
 *   one error (under `Error`), whose items name each gate that does not hold as
 *   `<space slug>/<prerequisite>`. A Space slug has no `/`, so the first one splits
 *   them. The gates not named hold.
 *
 * Anything else is no answer, and the page says the gates could not be checked
 * rather than guessing: the server decides when Close is pressed.
 *
 * Pure: the hook passes the answer in, and the specs pass fakes.
 */

import type { ChangeSetCloseResult, ChangeSetRead, PromoteGateResult, UnitCreateOrUpdateResponse } from '@confighub/rtk-query';

import type { ServerAnswer } from '../change-orders/reviews/stageReviewInputs';
import { refusalText } from '../change-orders/reviews/stageReviewInputs';
import type { ChangeOrderGate } from '../x/apps/change-order/changeOrderTypes';

/** One gate that does not hold in one Space. */
export interface CloseGateFailure {
  spaceSlug: string;
  message: string;
}

/** One prerequisite of the workflow's Final, over every Space. */
export interface CloseGate {
  prerequisite: string;
  /** The Spaces it does not hold in, in Space order. */
  failures: CloseGateFailure[];
}

export type ChangeSetCloseGates =
  /** No ChangeWorkflow governs the ChangeSet, or it is not open. */
  | { status: 'ungoverned' }
  | { status: 'loading' }
  /** Every gate holds: Close goes ahead. */
  | { status: 'open'; gates: CloseGate[]; spaceCount: number }
  /** Some gate does not hold: Close is refused unless forced. */
  | { status: 'held'; gates: CloseGate[]; spaceCount: number; failedCount: number }
  /** The server gave no verdict; `httpStatus` 403 is no permission to close. */
  | { status: 'unknown'; message: string; httpStatus: number };

interface ErrorMetadataBody {
  ErrorMetadata?: { Items?: { Item?: string; Description?: string }[] };
}

/** An error response: the server's words, and the error itself under `Error`. */
interface ResponseErrorBody extends ErrorMetadataBody {
  message?: string;
  Error?: ErrorMetadataBody & { Message?: string };
}

const byName = (a: string, b: string) => a.localeCompare(b);

/** The Final prerequisites of the ChangeSet's copy of its workflow. */
export function closePrerequisites(changeSet: Pick<ChangeSetRead, 'ChangeWorkflow'> | undefined): string[] {
  return changeSet?.ChangeWorkflow?.Final?.Prerequisites ?? [];
}

/** Every gate of a close the server evaluated, grouped by prerequisite in the workflow's order. */
function gatesOfResults(prerequisites: readonly string[], results: readonly PromoteGateResult[]): CloseGate[] {
  const names = [...prerequisites];
  for (const result of results) {
    if (result.Prerequisite && !names.includes(result.Prerequisite)) names.push(result.Prerequisite);
  }
  return names.map((prerequisite) => ({
    prerequisite,
    failures: results
      .filter((result) => result.Prerequisite === prerequisite && result.Satisfied !== true)
      .map((result) => ({ spaceSlug: result.SpaceSlug ?? result.SpaceID ?? '', message: result.Message ?? '' }))
      .sort((a, b) => byName(a.spaceSlug, b.spaceSlug)),
  }));
}

function summarize(gates: CloseGate[], spaceCount: number): ChangeSetCloseGates {
  const failedCount = gates.filter((gate) => gate.failures.length > 0).length;
  if (failedCount === 0) return { status: 'open', gates, spaceCount };
  return { status: 'held', gates, spaceCount, failedCount };
}

/**
 * The gates, from the answer to a dry run of the close. `spaceCount` is how many
 * Spaces the ChangeSet was opened in, which a refusal does not repeat.
 */
export function closeGatesOfAnswer(
  answer: ServerAnswer,
  prerequisites: readonly string[],
  spaceCount: number,
): ChangeSetCloseGates {
  if (answer.status === 200 || answer.status === 207) {
    const responses = Array.isArray(answer.body) ? (answer.body as UnitCreateOrUpdateResponse[]) : [];
    const close: ChangeSetCloseResult | undefined = responses.find((response) => response.ChangeSetClose !== undefined)?.ChangeSetClose;
    if (close !== undefined) return summarize(gatesOfResults(prerequisites, close.Gates ?? []), spaceCount);
    const failed = responses.find((response) => response.Error !== undefined)?.Error;
    if (failed !== undefined) return { status: 'unknown', message: failed.Message ?? 'The gates could not be checked.', httpStatus: answer.status };
    // Nothing failed and nothing was judged: the workflow names no gates.
    return summarize(gatesOfResults(prerequisites, []), spaceCount);
  }
  const body = (answer.body ?? {}) as ResponseErrorBody;
  const items = body.Error?.ErrorMetadata?.Items ?? body.ErrorMetadata?.Items ?? [];
  if (answer.status === 422 && items.length > 0) {
    const failures = new Map<string, CloseGateFailure[]>();
    for (const item of items) {
      const key = item.Item ?? '';
      const slash = key.indexOf('/');
      if (slash < 0) continue;
      const prerequisite = key.slice(slash + 1);
      const list = failures.get(prerequisite) ?? [];
      list.push({ spaceSlug: key.slice(0, slash), message: item.Description ?? '' });
      failures.set(prerequisite, list);
    }
    if (failures.size > 0) {
      const names = [...prerequisites, ...[...failures.keys()].filter((name) => !prerequisites.includes(name))];
      return summarize(
        names.map((prerequisite) => ({
          prerequisite,
          failures: (failures.get(prerequisite) ?? []).sort((a, b) => byName(a.spaceSlug, b.spaceSlug)),
        })),
        spaceCount,
      );
    }
  }
  const message =
    answer.status === 403 ? 'You may not close this ChangeSet, so its gates were not checked.' : refusalText(answer.body)?.trim() || 'The gates could not be checked.';
  return { status: 'unknown', message, httpStatus: answer.status };
}

const spaces = (n: number) => (n === 1 ? 'its Space' : n === 2 ? 'both Spaces' : `all ${n} Spaces`);

/** The gates as the gate list draws them. */
export function closeGateRows(gates: readonly CloseGate[], spaceCount: number): ChangeOrderGate[] {
  return gates.map((gate) => ({
    id: gate.prerequisite,
    name: gate.prerequisite,
    prerequisite: gate.prerequisite,
    evaluated: true,
    ok: gate.failures.length === 0,
    reason:
      gate.failures.length === 0
        ? `Holds in ${spaces(spaceCount)}.`
        : `Does not hold in ${gate.failures.length === 1 ? gate.failures[0]?.spaceSlug : `${gate.failures.length} Spaces`}.`,
  }));
}

/** "2 of 3 gates hold", for the line beside Close. */
export function closeGatesSummaryText(gates: ChangeSetCloseGates): string | undefined {
  if (gates.status === 'loading') return 'Checking the close gates…';
  if (gates.status === 'unknown') return 'The close gates could not be checked.';
  if (gates.status !== 'open' && gates.status !== 'held') return undefined;
  const total = gates.gates.length;
  if (total === 0) return 'Its ChangeWorkflow names no close gates.';
  const holding = total - (gates.status === 'held' ? gates.failedCount : 0);
  if (holding === total) return total === 1 ? 'Its close gate holds.' : `All ${total} close gates hold.`;
  return `${holding} of ${total} close gates hold.`;
}
