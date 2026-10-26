// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useRef, useState } from 'react';

import { listText } from '../reviews/reviewCopy';
import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import {
  promoteAnnouncement,
  type ChangeOrderActionResult,
  type ChangeOrderActions,
} from '../../x/apps/change-order/useChangeOrderActions';
import { stageCardCopy } from './stageCardCopy';
import { classifyDryRunAnswer, samePlan } from './stageDryRun';
import { retryTargets } from './stageFailure';
import type { DryRunAnswer, DryRunSummary, MergeMethod, StageFailure } from './stageTypes';
import type { OutcomeFocusTarget } from './useOutcomeFocus';
import type { StageDryRun, StageDryRunAnswer } from './useStageDryRun';

export interface UseStageConfirmArgs {
  stageId: string;
  stageName: string;
  actions: ChangeOrderActions;
  dryRun: StageDryRun;
  baseSpaceId: string | undefined;
  /** A gate evaluated and failed: nothing is promoted, whatever the box offers. */
  gatesBlock: boolean;
  failedGateCount: number;
  /** The Spaces the promote writes into. */
  targets: readonly string[];
  /** The ones a release publishes: those with a release Target. */
  releaseSpaceIds: readonly string[];
  /** The failure the box shows, if any: "Release again" goes only to the Spaces whose release failed. */
  failure: StageFailure | undefined;
  nameOfSpace: (spaceId: string) => string;
  /** When the ChangeOrder was last read, epoch ms, read when called. */
  readAt: () => number | undefined;
  announce: (text: string) => void;
  focusAfter: (target: OutcomeFocusTarget) => void;
  /** The stage being written, or `null`: its box keeps its state and its confirm says "Working…" meanwhile. */
  setRunning: (stageId: string | null) => void;
}

/** How long Confirm waits for the read that follows a write before it lets the box move on. */
const SETTLE_WAIT_MS = 15_000;
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const ok = (answer: StageDryRunAnswer | undefined): answer is StageDryRunAnswer => answer !== undefined && answer.status >= 200 && answer.status < 300;

function summaryOf(answer: StageDryRunAnswer, baseSpaceId: string | undefined): DryRunSummary | undefined {
  const classified = classifyDryRunAnswer({ status: answer.status, body: answer.body }, baseSpaceId);
  return classified.kind === 'done' ? classified.summary : undefined;
}

/**
 * What Confirm does, and what the confirm shows while it does it.
 *
 * WHAT IS PREVIEWED IS WHAT GETS WRITTEN. Confirm makes sure the quiet dry run's
 * answer is fresh ("Running the dry run…" while it is asked again), and the
 * promote carries that answer's plan. A one-click (no confirm) writes only the
 * plan the box showed: when the answer asked again plans something else, nothing
 * is written and the box shows the new answer for a second look. A ChangeOrder that changed since is refused
 * (412): nothing is written, the confirm stays open, and the dry run is asked again.
 * When the dry run cannot answer at all, the confirm asks for "anyway" with a box
 * to tick, and the promote is sent without a plan; if an answer has arrived by the
 * time it is ticked, its plan is sent after all.
 *
 * ONE STEADY STATE WHILE IT WRITES. The box keeps its state and the confirm says
 * "Working…" until the write and the read after it have both finished, release leg
 * included, so no half-way state (a live Release button, "Promoted in 1 of 2")
 * shows in between for a second click to land on.
 *
 * KNOWN RISK, ACCEPTED DELIBERATELY. A promotion gate can report itself satisfied
 * when a Space has not received the change: a Unit skipped at creation carries
 * neither start nor end Tag, so promotion passes it over without error and the
 * propagation walk never holds the Space back on its account. The stage then
 * reads promoted and the next stage opens while a Space never took that part of
 * the change. It needs scope to change after creation, and it affects the derived
 * verdict rather than the write. One person promoting one stage can look at what
 * happened; do not add an action that promotes many ChangeOrders at once without
 * revisiting this first.
 */
export function useStageConfirm(args: UseStageConfirmArgs) {
  const { stageId, stageName, actions, dryRun, baseSpaceId, gatesBlock, failedGateCount, targets, releaseSpaceIds, failure, nameOfSpace, announce, focusAfter, setRunning } = args;
  const stageHasTargets = releaseSpaceIds.length > 0;
  /** The stage whose confirm found no dry-run answer: the confirm then asks for "anyway". */
  const [noDryRun, setNoDryRun] = useState<string | null>(null);
  const [staleNote, setStaleNote] = useState<{ stageId: string; text: string } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  // The latest getter, for a wait that outlives the render it started in.
  const readAt = useRef(args.readAt);
  readAt.current = args.readAt;

  /** A write ends with a read of the ChangeOrder: wait until one that started after the write has landed. */
  const settled = useCallback(async () => {
    const writtenAt = Date.now();
    while ((readAt.current() ?? 0) < writtenAt && Date.now() - writtenAt < SETTLE_WAIT_MS) await sleep(100);
  }, []);

  /** Why Confirm stopped, said through the page's live region: the box now says it in place of the button. */
  const stopped = useCallback(
    (answer: DryRunAnswer) => {
      const h = stageCardCopy.headline;
      if (answer.kind === 'held') announce(`${h.serverHeld(stageName)}. ${answer.text}`);
      else if (answer.kind === 'noPermission') announce(`${h.noPermission(stageName)}. ${stageCardCopy.body.noPermission}`);
      else if (answer.kind === 'refused') announce(`${h.dryRunRefused}. ${answer.reason}`);
      else if (answer.kind === 'fails') announce(stageCardCopy.dryRun.fails(listText([...answer.summary.failuresBySpace.keys()].map(nameOfSpace))));
      focusAfter('heading');
    },
    [announce, stageName, nameOfSpace, focusAfter],
  );

  const onConfirm = useCallback(
    async (method: MergeMethod, how: { oneClick: boolean } = { oneClick: false }): Promise<boolean> => {
      if (method === 'r') {
        // "Release again" publishes only where the release failed; a first release, every Space with a Target.
        const spaceIds = failure?.action === 'release' ? retryTargets(failure, targets, releaseSpaceIds, nameOfSpace) : [...releaseSpaceIds];
        setRunning(stageId);
        announce(stageCardCopy.announce.releasing(stageName));
        const result = await actions.release(spaceIds, { stageId });
        await settled();
        focusAfter('heading');
        setRunning(null);
        announce(result.ok ? stageCardCopy.announce.released(stageName) : result.message);
        return true;
      }
      // The gate is enforced at the point of action as well as in what the box offers.
      if (gatesBlock) {
        announce(stageCardCopy.announce.heldByGate(stageName));
        focusAfter('heading');
        return true;
      }
      // An acknowledged "anyway" is sent without a plan only while there is still no answer to plan on.
      const planless = noDryRun === stageId && !ok(dryRun.answer);
      if (planless) {
        actions.adoptPlan(null);
      } else {
        // What the reader saw when they clicked: a one-click writes only that.
        const shown = how.oneClick && ok(dryRun.answer) ? summaryOf(dryRun.answer, baseSpaceId) : undefined;
        let answer: StageDryRunAnswer | undefined;
        setChecking(stageId);
        try {
          answer = await dryRun.ensureFresh();
        } finally {
          setChecking(null);
        }
        const classified: DryRunAnswer = answer === undefined ? { kind: 'unavailable' } : classifyDryRunAnswer({ status: answer.status, body: answer.body }, baseSpaceId);
        if (classified.kind === 'unavailable') {
          setNoDryRun(stageId);
          return false;
        }
        if (classified.kind !== 'done') {
          stopped(classified);
          return false;
        }
        // Asked again and it plans something else: nothing is written, and the box shows the new answer.
        if (shown !== undefined && !samePlan(shown, classified.summary)) {
          if (answer !== undefined) dryRun.unspend(answer);
          announce(stageCardCopy.announce.planChanged(stageName));
          focusAfter('heading');
          return true;
        }
      }
      setStaleNote(null);
      setRunning(stageId);
      announce(stageCardCopy.announce.promoting(stageName));
      const request = { failedGateCount, stageId, releaseSpaceIds };
      const withRelease = method === 'pr' && stageHasTargets;
      const result: ChangeOrderActionResult = withRelease ? await actions.promoteAndRelease([...targets], request) : await actions.promote([...targets], request);
      if (result.planStale === true) {
        setRunning(null);
        // Nothing was written. The confirm stays open over a fresh dry run.
        setStaleNote({ stageId, text: changeOrderCopy.promotePlanStaleInPlace });
        void dryRun.recheck();
        return false;
      }
      // A gate closed after the dry run: nothing was written, and the dry run asked again shows the hold.
      if (result.gatesHolding !== undefined) void dryRun.recheck();
      await settled();
      focusAfter(method === 'p' && stageHasTargets && result.ok && result.didNothing !== true ? 'release' : 'heading');
      setRunning(null);
      setNoDryRun(null);
      // `promoteAnnouncement` reads `didNothing` first: "Nothing to promote" never becomes "Promoted".
      const said = promoteAnnouncement(stageId, result);
      announce(withRelease && result.ok ? `${said} ${stageCardCopy.announce.released(stageName)}` : said);
      return true;
    },
    [stageId, stageName, announce, actions, releaseSpaceIds, gatesBlock, noDryRun, dryRun, baseSpaceId, failedGateCount, stageHasTargets, targets, failure, nameOfSpace, focusAfter, setRunning, settled, stopped],
  );
  const onCancel = useCallback(() => {
    setNoDryRun(null);
    setStaleNote(null);
  }, []);

  const isChecking = checking === stageId;
  const note = (staleNote?.stageId === stageId ? staleNote.text : undefined) ?? (isChecking && dryRun.stale ? stageCardCopy.dryRun.rerunning : undefined);
  return { onConfirm, onCancel, ackNoDryRun: noDryRun === stageId && !ok(dryRun.answer), checking: isChecking, note };
}
