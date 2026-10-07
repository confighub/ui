// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The server's verdicts on the entry gates of a ChangeOrder's stages.
 *
 * Some gates this page cannot evaluate: `Validated`, a custom CEL check, and an
 * Attestation requirement (`rolloutGates.ts`). The server evaluates every gate
 * when it promotes, and a dry run of `POST /promote` into a stage reports every
 * verdict without writing anything — in a 200, or in the body of the 409 a
 * held stage is refused with. So for each stage that gates on one of those,
 * this asks for a dry run, and `applyServerGates` puts the answers in place of
 * the page's "not evaluated".
 *
 * ONE CHANGEORDER, NEVER A LIST. A dry run is a promotion planned in full, so
 * it is asked for by the page that shows one rollout, for the stages that need
 * it, and refreshed on its own slower clock. The list of rollouts does not ask:
 * a row held only by checks it cannot make reads as held, and opening it is
 * what gets the server's answer.
 *
 * An answer that does not come — no permission to promote, a ChangeOrder the
 * server will no longer promote — leaves the stage's gates as the page
 * evaluated them, which is not evaluated.
 */

import { useCallback, useEffect, useState } from 'react';

import { usePromoteMutation, type PromoteGateResult, type PromoteResult } from '@confighub/rtk-query';

import { usePolling } from '@/hooks/usePolling';

import { promoteResultOf, statusOf } from './useRolloutActions';

/**
 * How often the verdicts are asked for again with nothing else changed.
 * Slower than the ChangeOrder's own poll, because each ask is a planned
 * promotion per stage, and what it answers for — a Revision's ValidationErrors,
 * an Attestation recorded — changes on a person's schedule, not a deployer's.
 */
export const SERVER_GATES_POLL_INTERVAL_MS = 30_000;

export type ServerGatesByStage = Readonly<Record<string, readonly PromoteGateResult[]>>;

const NO_GATES: ServerGatesByStage = {};

export interface UseServerStageGatesArgs {
  changeOrderId: string | undefined;
  /** The stages to ask about, by name. Empty asks nothing. */
  stageNames: readonly string[];
  /**
   * Changes whenever the ChangeOrder's progress does, so a promotion or a
   * Release is followed by fresh verdicts rather than ones up to a poll old.
   */
  refreshKey: string;
}

export function useServerStageGates({
  changeOrderId,
  stageNames,
  refreshKey,
}: UseServerStageGatesArgs): ServerGatesByStage {
  const [runPromote] = usePromoteMutation();
  const [gates, setGates] = useState<{ changeOrderId: string | undefined; byStage: ServerGatesByStage }>({
    changeOrderId,
    byStage: NO_GATES,
  });
  const [tick, setTick] = useState(0);
  const poll = useCallback(() => setTick((t) => t + 1), []);
  usePolling(poll, SERVER_GATES_POLL_INTERVAL_MS);

  const stagesKey = stageNames.join('\u0000');

  useEffect(() => {
    if (changeOrderId === undefined || stageNames.length === 0) {
      setGates({ changeOrderId, byStage: NO_GATES });
      return;
    }
    let cancelled = false;
    void Promise.all(
      stageNames.map(async (stageName): Promise<[string, readonly PromoteGateResult[]] | null> => {
        let result: PromoteResult | undefined;
        try {
          result = await runPromote({
            promoteRequest: { ChangeOrderID: changeOrderId, TargetStage: stageName, DryRun: true },
          }).unwrap();
        } catch (error) {
          // A held stage is refused, and the refusal carries the verdicts.
          // Anything else is no answer.
          if (statusOf(error) !== 409) return null;
          result = promoteResultOf(error);
        }
        const stage = result?.Stages?.find((candidate) => candidate.Name === stageName);
        return stage === undefined ? null : [stageName, stage.Gates ?? []];
      }),
    ).then((answers) => {
      if (cancelled) return;
      const byStage: Record<string, readonly PromoteGateResult[]> = {};
      for (const answer of answers) {
        if (answer !== null) byStage[answer[0]] = answer[1];
      }
      // The same answer keeps its identity, so a poll that changed nothing
      // does not re-derive everything the rollout page computes from it.
      setGates((previous) =>
        previous.changeOrderId === changeOrderId && JSON.stringify(previous.byStage) === JSON.stringify(byStage)
          ? previous
          : { changeOrderId, byStage },
      );
    });
    return () => {
      cancelled = true;
    };
    // `stagesKey` stands for `stageNames`, whose identity may change while its
    // contents do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeOrderId, stagesKey, refreshKey, tick, runPromote]);

  // Verdicts about another ChangeOrder are never shown for this one, even for
  // the moment before this one's arrive.
  return gates.changeOrderId === changeOrderId ? gates.byStage : NO_GATES;
}
