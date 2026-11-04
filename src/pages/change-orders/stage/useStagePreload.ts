// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The open stage first; then, quietly, the stages the reader is likely to open next.
 *
 * Once the open stage's own reads and quiet dry run have answered, the next stage on the path is
 * read ahead: its review's GET read, and its quiet promote dry run when that stage would ask for one
 * itself. Then the review reads of up to two more stages. Nothing is drawn: the answers wait in the
 * caches the cards read (RTK's, and the dry run's kept answers). Only GET reads and the next stage's
 * quiet dry run are asked ahead; never for an aborted ChangeOrder, never while the tab is hidden,
 * and a failure shows nothing.
 *
 * The dry run asked ahead serves a rail click to a next stage that is ready to promote now: the
 * click shows its plan at once. It does not serve the move after a Promote: the Promote changes the
 * ChangeOrder, so the next stage's answer is for a state that is gone, and the card asks again.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { ChangeOrderStageVerdict } from '../../x/apps/change-order/changeOrderTypes';
import { promotionTargets } from '../../x/apps/change-order/changeOrderStages';
import { taggedRevisionWheres } from '../../x/apps/change-order/taggedRevisionReads';
import { useTaggedRevisionsPrefetch } from '../../x/apps/change-order/taggedRevisionsApi';
import { combineGateReviews } from '../reviews/changeOrderReviews';
import type { GateReviewSummary } from '../reviews/changeOrderReviewTypes';
import type { ChangeOrderDetail } from '../useChangeOrderDetail';
import { dryRunRefreshKey } from './stageCardParts';
import { stageSectionGates } from './stageReviewModel';
import { preloadStageDryRun } from './useStageDryRun';

/** A path longer than this reads ahead only the next stage. */
const READ_AHEAD_ALL_UP_TO = 6;
/** Besides the next stage, at most this many more are read ahead. */
const READ_AHEAD_MORE = 2;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
const hiddenNow = () => document.visibilityState === 'hidden';

export function useStagePreload(args: {
  detail: ChangeOrderDetail;
  /** The open stage. */
  stageId: string;
  /** The open stage's own reads and quiet dry run have answered. */
  activeSettled: boolean;
  summaries: readonly GateReviewSummary[];
  verdictOf: (stageId: string) => ChangeOrderStageVerdict | undefined;
}) {
  const { detail, stageId, activeSettled, summaries, verdictOf } = args;
  const hidden = useSyncExternalStore(subscribeVisibility, hiddenNow, () => false);
  const prefetchTagged = useTaggedRevisionsPrefetch();
  const refreshKey = dryRunRefreshKey(detail);
  const changeOrderId = detail.changeOrderId;
  // Read when the effect runs: a new identity of these, with the same content, must not ask again.
  const latest = useRef({ detail, summaries, verdictOf, prefetchTagged });
  latest.current = { detail, summaries, verdictOf, prefetchTagged };

  useEffect(() => {
    const { detail, summaries, verdictOf, prefetchTagged } = latest.current;
    if (!activeSettled || hidden || detail.changeOrderId === undefined) return;
    const stages = detail.sequence.stages.filter((s) => !s.isSource);
    const index = stages.findIndex((s) => s.id === stageId);
    const next = index >= 0 ? stages[index + 1] : undefined;
    const more =
      stages.length <= READ_AHEAD_ALL_UP_TO
        ? stages.filter((s) => s.id !== stageId && s.id !== next?.id).slice(0, READ_AHEAD_MORE)
        : [];

    /** The review's GET read of a stage, with the arguments its card's `useStageReviews` gives it. */
    const readReview = (id: string) => {
      const combined = combineGateReviews(stageSectionGates(summaries, id, verdictOf));
      if (combined === undefined) return;
      const onlyChanged = (combined.feeds ?? [combined.gate]).every((gate) => gate.kind !== 'release');
      if (!onlyChanged) return;
      const wheres = taggedRevisionWheres(detail.startTagId, detail.endTagId, {
        in: combined.gateSpaces.map((space) => space.spaceId),
      });
      if (wheres !== undefined) {
        prefetchTagged({ wheres, select: 'RevisionID,UnitID,RevisionNum,Tags', live: true }, { ifOlderThan: 60 });
      }
    };

    /**
     * Whether the next stage would ask its own quiet dry run, by the rule its card applies
     * (`dryRunWanted`): a stage still to promote that no review and no gate holds, of a
     * ChangeOrder that is not aborted (the server refuses those).
     */
    const wantsDryRun = (id: string) => {
      if (detail.abortedReason !== '') return false;
      const verdict = verdictOf(id);
      if (verdict !== 'waiting' && verdict !== 'in-progress') return false;
      const rows = detail.serverGatesByStage[id];
      if (rows === undefined || rows.some((row) => row.Satisfied !== true)) return false;
      const review = combineGateReviews(stageSectionGates(summaries, id, verdictOf));
      return review === undefined || review.open;
    };

    let cancelled = false;
    void (async () => {
      if (next !== undefined) {
        readReview(next.id);
        if (wantsDryRun(next.id)) {
          await preloadStageDryRun({
            changeOrderId: detail.changeOrderId,
            baseSpaceId: detail.baseSpaceId,
            stageId: next.id,
            targetSpaceIds: promotionTargets(next.spaceIds, detail.skippedSpaceId),
            refreshKey,
          });
        }
      }
      for (const stage of more) {
        if (cancelled || hiddenNow()) return;
        readReview(stage.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSettled, hidden, changeOrderId, stageId, refreshKey]);
}
