// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The server's verdicts on the entry gates of a ChangeOrder's stages.
 *
 * Some gates this page cannot evaluate: `Validated`, a custom CEL check, and an
 * Attestation requirement (`changeOrderGates.ts`). The server evaluates every gate
 * when it promotes, and a dry run of `POST /promote` into a stage reports every
 * verdict without writing anything — in a 200, or in the body of the 409 a
 * held stage is refused with. So for each stage that gates on one of those,
 * this asks for a dry run, and `applyServerGates` puts the answers in place of
 * the page's "not evaluated".
 *
 * ONE CHANGEORDER, NEVER A LIST. A dry run is a promotion planned in full, so
 * it is asked for by the page that shows one ChangeOrder, for the stages that need
 * it, and refreshed on its own slower clock. The list of ChangeOrders does not ask:
 * a row held only by checks it cannot make reads as held, and opening it is
 * what gets the server's answer.
 *
 * An answer that does not come — no permission to promote, a ChangeOrder the
 * server will no longer promote — leaves the stage's gates as the page
 * evaluated them, which is not evaluated.
 *
 * SENT WITH `authFetch`, NOT THE RTK BASE QUERY. RTK hands every 403 to the
 * app's `handleForbidden`, which replaces the page with /access-denied; a viewer
 * who may look at a ChangeOrder but not promote it is refused this dry run as a
 * matter of course, and must keep the page (`refusedByStage` says 403).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PromoteGateResult, PromoteResult } from '@confighub/rtk-query';

import { authFetch } from '@/auth/session';
import { usePolling } from '@/hooks/usePolling';

import { promoteDryRun } from '../../../change-orders/reviews/quietServerCalls';

/**
 * How often the verdicts are asked for again with nothing else changed.
 * Slower than the ChangeOrder's own poll, because each ask is a planned
 * promotion per stage, and what it answers for — a Revision's ValidationErrors,
 * an Attestation recorded — changes on a person's schedule, not a deployer's.
 */
export const SERVER_GATES_POLL_INTERVAL_MS = 30_000;

export type ServerGatesByStage = Readonly<Record<string, readonly PromoteGateResult[]>>;

const NO_GATES: ServerGatesByStage = {};

/**
 * Why a stage asked about has no verdicts: the HTTP status of the refusal (403
 * is no permission to promote), or 0 for an answer that named no such stage.
 */
export type ServerGateRefusals = Readonly<Record<string, number>>;

const NO_REFUSALS: ServerGateRefusals = {};

export interface ServerStageGateReads {
  byStage: ServerGatesByStage;
  refusedByStage: ServerGateRefusals;
  /**
   * Asks again now, and resolves once an answer asked for after this call has arrived, so
   * a caller that wrote something the verdicts depend on can read them afresh.
   */
  refresh: () => Promise<void>;
}

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

export function useServerStageGates(args: UseServerStageGatesArgs): ServerGatesByStage {
  return useServerStageGateReads(args).byStage;
}

/** The verdicts, and why a stage asked about has none (the reviews say "no permission" from a 403). */
export function useServerStageGateReads({
  changeOrderId,
  stageNames,
  refreshKey,
}: UseServerStageGatesArgs): ServerStageGateReads {
  const [gates, setGates] = useState<{
    changeOrderId: string | undefined;
    byStage: ServerGatesByStage;
    refusedByStage: ServerGateRefusals;
  }>({
    changeOrderId,
    byStage: NO_GATES,
    refusedByStage: NO_REFUSALS,
  });
  const [tick, setTick] = useState(0);
  const poll = useCallback(() => setTick((t) => t + 1), []);
  usePolling(poll, SERVER_GATES_POLL_INTERVAL_MS);

  /** Each `refresh` call's number; an answer settles the calls made before it was asked for. */
  const asked = useRef(0);
  const waiting = useRef<{ call: number; resolve: () => void }[]>([]);
  const settle = useCallback((upTo: number) => {
    const done = waiting.current.filter((waiter) => waiter.call <= upTo);
    waiting.current = waiting.current.filter((waiter) => waiter.call > upTo);
    for (const waiter of done) waiter.resolve();
  }, []);
  const refresh = useCallback(() => {
    asked.current += 1;
    const call = asked.current;
    const settled = new Promise<void>((resolve) => waiting.current.push({ call, resolve }));
    setTick((t) => t + 1);
    return settled;
  }, []);

  const stagesKey = stageNames.join('\u0000');

  useEffect(() => {
    const call = asked.current;
    if (changeOrderId === undefined || stageNames.length === 0) {
      setGates({ changeOrderId, byStage: NO_GATES, refusedByStage: NO_REFUSALS });
      settle(call);
      return;
    }
    let cancelled = false;
    void Promise.all(
      stageNames.map(async (stageName): Promise<[string, readonly PromoteGateResult[] | number]> => {
        const answer = await promoteDryRun(authFetch, { ChangeOrderID: changeOrderId, TargetStage: stageName });
        // A held stage is refused (409), and the refusal carries the verdicts.
        // Anything else is no answer; its status says why.
        const ok = answer.status >= 200 && answer.status < 300;
        if (!ok && answer.status !== 409) return [stageName, answer.status];
        const result = answer.body as PromoteResult | undefined;
        const stage = result?.Stages?.find((candidate) => candidate.Name === stageName);
        return stage === undefined ? [stageName, 0] : [stageName, stage.Gates ?? []];
      }),
    ).then((answers) => {
      if (cancelled) return;
      const byStage: Record<string, readonly PromoteGateResult[]> = {};
      const refusedByStage: Record<string, number> = {};
      for (const [stageName, answer] of answers) {
        if (typeof answer === 'number') refusedByStage[stageName] = answer;
        else byStage[stageName] = answer;
      }
      // The same answer keeps its identity, so a poll that changed nothing
      // does not re-derive everything the ChangeOrder page computes from it.
      setGates((previous) =>
        previous.changeOrderId === changeOrderId &&
        JSON.stringify(previous.byStage) === JSON.stringify(byStage) &&
        JSON.stringify(previous.refusedByStage) === JSON.stringify(refusedByStage)
          ? previous
          : { changeOrderId, byStage, refusedByStage },
      );
      settle(call);
    });
    return () => {
      cancelled = true;
    };
    // `stagesKey` stands for `stageNames`, whose identity may change while its
    // contents do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeOrderId, stagesKey, refreshKey, tick, settle]);

  // Verdicts about another ChangeOrder are never shown for this one, even for
  // the moment before this one's arrive.
  return gates.changeOrderId === changeOrderId
    ? { byStage: gates.byStage, refusedByStage: gates.refusedByStage, refresh }
    : { byStage: NO_GATES, refusedByStage: NO_REFUSALS, refresh };
}
