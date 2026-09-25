// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Rolling a rollout back, as a set of pure decisions.
 *
 * TWO INTENTS, ONE MECHANISM UNDERNEATH. Setting `AbortedReason` is a DECISION
 * and nothing else: it says the change is not coming to the Spaces still
 * waiting, and it moves nothing (`changeorder_update.go`). Taking the change
 * back out of the Spaces that already took it is a SECOND operation, run once
 * per Space — `cub variant demote`, which is a bulk PATCH of that Space's
 * marked Units with `restore=Before:ChangeOrder:<id>`.
 *
 * So the screen offers the two things an operator actually wants:
 *
 *   - "Roll back"      — abort, then restore every Space that took the change.
 *   - "Abort"          — sets `AbortedReason` and stops there, leaving what
 *                        already landed where it is.
 *
 * THE ORDER IS FORCED, NOT PREFERRED. The server refuses a restore on a
 * ChangeOrder with no `AbortedReason` (`changeorder_restore.go`), so the abort
 * always goes first. Doing them the other way round is not slower, it is
 * rejected.
 *
 * ⚠️ THE ONE-WAY DOOR IS THE FIRST RESTORE, NOT THE ABORT. `AbortedReason` is
 * clearable at any point until something has been restored; once
 * `RestoreTagID` is set the server refuses the clearing forever
 * (`internal/views/changeorder.go`). A rollback that restores two Spaces of
 * three therefore leaves the rollout ABORTED AND PARTLY RESTORED, and no
 * sequence of UI actions returns it to promotable — only a new ChangeOrder
 * re-applies the change. That is why `rollbackReport` reports "stranded"
 * separately from "failed": the reader has to be told which of the two
 * happened.
 */

import type { UnitCreateOrUpdateResponseRead } from '@confighub/rtk-query';

import type { RolloutProgress } from './rolloutTypes';

/** What the reader asked for. Both end the rollout; only one moves anything. */
export type RolloutEndIntent = 'roll-back' | 'abort';

/**
 * Which Spaces this rollout has reached and not yet been taken back out of —
 * `ResolvedSpaceIDs` minus `RestoredSpaceIDs`, the same set `cub variant
 * demote` would be run over one Space at a time.
 *
 * THREE ANSWERS, BECAUSE "NONE" AND "CANNOT SAY" ARE NOT THE SAME. The server
 * derives `ResolvedSpaceIDs` when the ChangeOrder is read and swallows
 * derivation failures, so an absent field is 200-with-no-answer rather than
 * "nothing has been promoted" (see `RolloutProgressAvailability`). Rolling back
 * over an empty set derived from silence would report a rollback that restored
 * nothing while the change sat in production — so `unavailable` is its own
 * answer and the destructive action is not offered against it.
 *
 * A restored Space stays in `ResolvedSpaceIDs`: the restore mints a new
 * Revision and leaves the end Tag where it was. Subtracting `RestoredSpaceIDs`
 * is what keeps a re-run from claiming to undo what it already undid.
 */
export type RollbackScope =
  | { kind: 'spaces'; spaceIds: string[] }
  /** Every Space that took the change has already been taken back out of it. */
  | { kind: 'none' }
  /** The server did not derive the propagation fields; the set is unknowable. */
  | { kind: 'unavailable' };

export function rollbackScope(progress: RolloutProgress): RollbackScope {
  if (progress.availability !== 'available') return { kind: 'unavailable' };
  const spaceIds = [...progress.resolvedSpaceIds].filter((id) => !progress.restoredSpaceIds.has(id));
  return spaceIds.length === 0 ? { kind: 'none' } : { kind: 'spaces', spaceIds };
}

/**
 * The Spaces this intent will WRITE INTO.
 *
 * Empty for "Abort", by construction and not by accident: setting
 * `AbortedReason` is a decision and nothing more, so the Spaces that already
 * took the change are left exactly as they are. The dialog still LISTS them
 * under that intent — a reader deciding between the two controls needs to see
 * what stays behind — which is why the list and the write targets are two
 * functions rather than one.
 */
export function restoreTargets(intent: RolloutEndIntent, scope: RollbackScope): string[] {
  if (intent === 'abort') return [];
  return scope.kind === 'spaces' ? scope.spaceIds : [];
}

/** What one Space's restore did. */
export interface SpaceRestoreSummary {
  /** Units whose restore the server accepted. */
  restoredUnits: number;
  /** One sentence per rejected Unit, naming it. Empty when nothing was rejected. */
  failures: string[];
}

/**
 * Read a bulk restore's response.
 *
 * ⚠️ 207 IS NOT SUCCESS. `bulkPatchUnits` answers a partly-rejected request
 * with 207 Multi-Status and a per-entry `Error`, which `.unwrap()` resolves
 * happily — a past defect in this codebase was exactly that, a partly failed
 * write reading as done. Every entry is inspected, and an entry carrying an
 * `Error` is a failure whether or not it came with a sentence.
 */
export function summariseRestore(
  results: UnitCreateOrUpdateResponseRead[] | undefined,
  unnamedResource: string,
  itemFailure: (name: string, message: string) => string,
): SpaceRestoreSummary {
  let restoredUnits = 0;
  const failures: string[] = [];
  for (const result of results ?? []) {
    if (result.Error !== undefined && result.Error !== null) {
      const message = result.Error.Message;
      failures.push(
        itemFailure(
          result.Unit?.Slug ?? unnamedResource,
          typeof message === 'string' && message.length > 0 ? message : 'no reason given',
        ),
      );
      continue;
    }
    restoredUnits += 1;
  }
  return { restoredUnits, failures };
}

/** Where one Space's leg of the rollback got to. */
export type SpacePhase = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface SpaceOutcome {
  spaceId: string;
  /** The Space's slug when the caller could resolve one, else its id. */
  label: string;
  phase: SpacePhase;
  restoredUnits: number;
  /** Why it failed, or why it was skipped. Empty otherwise. */
  message: string;
}

export interface RollbackReport {
  ok: boolean;
  /**
   * Something was restored, so `AbortedReason` can no longer be cleared and
   * this rollout can never be promoted again. TRUE ON A CLEAN FULL ROLLBACK
   * TOO — that is the intended end state, not a fault — so a caller must read
   * it together with `ok` rather than as an alarm on its own.
   */
  stranded: boolean;
  /** Every rejected Unit, across every Space. */
  failures: string[];
}

export function rollbackReport(outcomes: readonly SpaceOutcome[]): RollbackReport {
  const failures = outcomes.flatMap((outcome) =>
    outcome.phase === 'failed' && outcome.message !== '' ? [outcome.message] : [],
  );
  return {
    ok: outcomes.every((outcome) => outcome.phase !== 'failed'),
    stranded: outcomes.some((outcome) => outcome.restoredUnits > 0),
    failures,
  };
}

/**
 * The Spaces a retry would act on: the ones that failed, and the ones the run
 * never reached.
 *
 * A Space already restored is left out rather than re-sent. The server passes
 * over a Unit already carrying the restore tag, so re-sending is harmless — but
 * a retry that reports "3 Spaces restored" when it restored one is the same
 * false account of a write that 207-as-success was.
 */
export function retryTargets(outcomes: readonly SpaceOutcome[]): string[] {
  return outcomes
    .filter((outcome) => outcome.phase === 'failed' || outcome.phase === 'pending')
    .map((outcome) => outcome.spaceId);
}
