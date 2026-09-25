// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Ending a rollout: the decision, and then the undoing.
 *
 * TWO LEGS, IN A FORCED ORDER.
 *
 *   1. PATCH `AbortedReason` on the ChangeOrder. This is the whole of "Stop
 *      promoting", and it is also the precondition for the second leg — the
 *      server refuses a restore on a ChangeOrder with no reason set
 *      (`changeorder_restore.go`), so the order is not a preference.
 *   2. Per Space, find the Units this ChangeOrder marked there (the Revisions
 *      carrying its start Tag) and restore them in ONE bulk PATCH with
 *      `restore=Before:ChangeOrder:<id>` and `change_order=<id>`. That is
 *      `cub variant demote`, verbatim (`variant_demote.go`): naming the
 *      ChangeOrder on the request is what mints the restore Tag and advances
 *      the merge pointers of the links that follow each restored Unit.
 *
 * ONE SPACE AT A TIME, AND REPORTED THAT WAY. There is no fleet-wide demote —
 * the CLI has none either — so a rollback across three Spaces is three requests
 * that can land differently. A single "it worked" over the lot would hide the
 * one that did not.
 *
 * ⚠️ 207 IS NOT SUCCESS, AND `.unwrap()` WILL NOT TELL YOU. `bulkPatchUnits`
 * answers a partly rejected request with per-entry `Error` fields and a
 * resolved promise. Every entry is read (`summariseRestore`).
 *
 * ⚠️ THE FIRST SUCCESSFUL RESTORE IS THE ONE-WAY DOOR. After it,
 * `AbortedReason` can no longer be cleared, so a run that fails part way leaves
 * the rollout aborted and partly rolled back with no route back to promotable.
 * `RollbackReport.stranded` is what the dialog says that with.
 */

import { useCallback, useRef, useState } from 'react';

import {
  useBulkPatchUnitsMutation,
  useLazyListAllRevisionsQuery,
  usePatchChangeOrderMutation,
  type UnitCreateOrUpdateResponseRead,
} from '@confighub/rtk-query';

import { describeRequestError } from './rolloutAbort';
import { rolloutCopy } from './rolloutCopy';
import {
  rollbackReport,
  retryTargets,
  summariseRestore,
  type RollbackReport,
  type SpaceOutcome,
} from './rolloutRollback';

export interface UseRollBackRolloutArgs {
  /** The Space the ChangeOrder resides in — the PATCH's path parameter. */
  baseSpaceId: string | undefined;
  changeOrderId: string | undefined;
  /** `ChangeOrder.StartTagID`: what says which Units of a Space this rollout marked. */
  startTagId: string | undefined;
  /** The ChangeOrder's slug, which names the restored Revisions. */
  changeOrderSlug: string;
  /** True when `AbortedReason` is already set, so the abort leg is skipped. */
  alreadyAborted: boolean;
  /** Called after the whole run settles, so the caller can refetch. */
  onSettled?: () => void;
}

export interface RollBackRun {
  busy: boolean;
  /** Per-Space progress for the run in flight or the last one. `null` before any run. */
  outcomes: SpaceOutcome[] | null;
  /** The last completed run's verdict. `null` while one is in flight or before any. */
  report: RollbackReport | null;
  /**
   * Abort, then restore each Space in turn. `reason` is ignored when the
   * rollout is already aborted — the reason on record is the one that was given
   * when the decision was made, and overwriting it would rewrite that history.
   *
   * Resolves to the ABORT LEG's error message, or `null`. That leg is returned
   * rather than stored because it fails before any Space is touched, so there
   * is no per-Space account for it to sit beside; every later failure is in
   * `outcomes` and `report`.
   */
  run: (reason: string, spaces: readonly { spaceId: string; label: string }[]) => Promise<string | null>;
  /** Re-run the Spaces that failed or were never reached. Idempotent, per the server. */
  retry: () => Promise<void>;
  /** Drop the last run's state, so reopening the dialog starts clean. */
  reset: () => void;
}

export function useRollBackRollout(args: UseRollBackRolloutArgs): RollBackRun {
  const { baseSpaceId, changeOrderId, startTagId, changeOrderSlug, alreadyAborted, onSettled } = args;

  const [patchChangeOrder] = usePatchChangeOrderMutation();
  const [listRevisions] = useLazyListAllRevisionsQuery();
  const [restorePatch] = useBulkPatchUnitsMutation();

  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<SpaceOutcome[] | null>(null);
  const [report, setReport] = useState<RollbackReport | null>(null);

  /*
   * The outcome list is read back inside the loop to decide what a retry acts
   * on, and React state is a snapshot inside an async closure. The ref is the
   * live copy; `setOutcomes` exists only to redraw.
   */
  const outcomesRef = useRef<SpaceOutcome[]>([]);

  const publish = useCallback((next: SpaceOutcome[]) => {
    outcomesRef.current = next;
    setOutcomes([...next]);
  }, []);

  /** One Space's leg. Never throws: every failure becomes that Space's outcome. */
  const restoreOneSpace = useCallback(
    async (spaceId: string): Promise<Pick<SpaceOutcome, 'phase' | 'restoredUnits' | 'message'>> => {
      if (changeOrderId === undefined || startTagId === undefined) {
        return { phase: 'failed', restoredUnits: 0, message: rolloutCopy.abort.notReady };
      }
      let unitIds: string[];
      try {
        const tagged = await listRevisions({
          where: `SpaceID = '${spaceId}' AND Tags ? '${startTagId}'`,
          select: 'UnitID,RevisionNum,SpaceID',
        }).unwrap();
        unitIds = [
          ...new Set(
            tagged
              .map((item) => item.Revision?.UnitID)
              .filter((id): id is string => id !== undefined && id !== ''),
          ),
        ];
      } catch (error) {
        return { phase: 'failed', restoredUnits: 0, message: describeRequestError(error) };
      }

      /*
       * The start Tag marks no Unit here. That is not a failure and not a
       * rollback either: this Space never took the change, or its Units were
       * already restored and re-tagged. Reported as its own phase so the dialog
       * cannot count it as a Space it rolled back.
       */
      if (unitIds.length === 0) {
        return { phase: 'skipped', restoredUnits: 0, message: '' };
      }

      const quoted = unitIds.map((id) => `'${id}'`).join(', ');
      try {
        const results: UnitCreateOrUpdateResponseRead[] = await restorePatch({
          where: `SpaceID = '${spaceId}' AND UnitID IN (${quoted})`,
          restore: `Before:ChangeOrder:${changeOrderId}`,
          changeOrder: changeOrderId,
          include: 'UnitEventID,TargetID,UpstreamUnitID,SpaceID',
          // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
          body: JSON.stringify({
            LastChangeDescription: `Undo change order ${changeOrderSlug}`,
          }),
        }).unwrap();
        const summary = summariseRestore(results, rolloutCopy.unnamedResource, rolloutCopy.itemFailure);
        if (summary.failures.length > 0) {
          return {
            phase: 'failed',
            restoredUnits: summary.restoredUnits,
            message: summary.failures.join(' '),
          };
        }
        return { phase: 'done', restoredUnits: summary.restoredUnits, message: '' };
      } catch (error) {
        return { phase: 'failed', restoredUnits: 0, message: describeRequestError(error) };
      }
    },
    [changeOrderId, startTagId, changeOrderSlug, listRevisions, restorePatch],
  );

  /** Walk the Spaces whose ids are in `targets`, leaving every other outcome alone. */
  const walk = useCallback(
    async (targets: readonly string[]) => {
      for (const spaceId of targets) {
        publish(
          outcomesRef.current.map((outcome) =>
            outcome.spaceId === spaceId ? { ...outcome, phase: 'running', message: '' } : outcome,
          ),
        );
        const leg = await restoreOneSpace(spaceId);
        publish(
          outcomesRef.current.map((outcome) =>
            outcome.spaceId === spaceId ? { ...outcome, ...leg } : outcome,
          ),
        );
      }
      setReport(rollbackReport(outcomesRef.current));
    },
    [publish, restoreOneSpace],
  );

  const run = useCallback(
    async (reason: string, spaces: readonly { spaceId: string; label: string }[]) => {
      if (baseSpaceId === undefined || changeOrderId === undefined) {
        return rolloutCopy.abort.notReady;
      }
      setBusy(true);
      setReport(null);
      publish(
        spaces.map((space) => ({
          spaceId: space.spaceId,
          label: space.label,
          phase: 'pending' as const,
          restoredUnits: 0,
          message: '',
        })),
      );

      try {
        /*
         * The abort goes first, always — the restore is refused without it. It
         * is skipped only when the reason is already on record, because
         * rewriting it would replace the account of why the change was called
         * off with whatever was typed into this dialog.
         */
        if (!alreadyAborted) {
          try {
            await patchChangeOrder({
              spaceId: baseSpaceId,
              changeOrderId,
              body: { AbortedReason: reason },
            }).unwrap();
          } catch (error) {
            return rolloutCopy.endRollout.rollBackAbortLegFailed(describeRequestError(error));
          }
        }
        await walk(spaces.map((space) => space.spaceId));
        return null;
      } finally {
        setBusy(false);
        onSettled?.();
      }
    },
    [baseSpaceId, changeOrderId, alreadyAborted, patchChangeOrder, publish, walk, onSettled],
  );

  const retry = useCallback(async () => {
    const targets = retryTargets(outcomesRef.current);
    if (targets.length === 0) return;
    setBusy(true);
    try {
      await walk(targets);
    } finally {
      setBusy(false);
      onSettled?.();
    }
  }, [walk, onSettled]);

  const reset = useCallback(() => {
    outcomesRef.current = [];
    setOutcomes(null);
    setReport(null);
  }, []);

  return { busy, outcomes, report, run, retry, reset };
}
