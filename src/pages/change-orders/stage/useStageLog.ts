// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Stage log's lines and its pill, from the card's model and what the page
 * already read: the ChangeOrder's records (`history.entries`), the stage's
 * prerequisites, and the reviews of its entry and release gates. The
 * derivation is `stageLogModel.ts`; this hook gathers its inputs.
 */
import { useEffect, useMemo, useRef } from 'react';

import { stageDisplayName } from '../../x/apps/change-order/changeOrderCopy';
import type { ChangeOrderStageState } from '../../x/apps/change-order/changeOrderTypes';
import type {
  GateReviewSummary,
  ReviewDecision,
  UseChangeOrderReviewsResult,
} from '../reviews/changeOrderReviewTypes';
import type { ChangeOrderDetail } from '../useChangeOrderDetail';
import type { ChangeOrderHistory } from '../useChangeOrderHistory';
import { isReviewRequirementGate } from './stageCardParts';
import { gateWaitsFor } from './stageCardState';
import {
  type StageLogApproval,
  type StageLogGate,
  type StageLogPillView,
  type StageLogView,
  deriveStageLog,
  releaseRanCount,
  releaseReviewHolds,
  stageLogPill,
  warnProblemsOf,
} from './stageLogModel';
import { propagationHeadline } from './stagePropagation';
import { flowShowsForm, namedApprovers } from './stageReviewModel';
import type { StageCardModel } from './useStageCardModel';

function approvalsOf(
  summary: GateReviewSummary | undefined,
  requirement?: string,
): StageLogApproval[] {
  if (summary === undefined) return [];
  return (
    summary.decisions
      // Approvals that count; one the server does not count (expired, by an author) is listed in Review details.
      .filter(
        (d: ReviewDecision) =>
          d.live &&
          !d.expired &&
          d.result === 'Pass' &&
          (!summary.evaluated || d.countsToward.length > 0),
      )
      .map((d) => {
        const at = Date.parse(d.createdAt);
        return {
          ...(Number.isNaN(at) ? {} : { at }),
          person: { name: d.person.name, isYou: d.person.isYou },
          ...(d.note.trim() === '' ? {} : { note: d.note }),
          ...(requirement === undefined ? {} : { requirement }),
        };
      })
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
  );
}

/**
 * The state the log says. When the prerequisite read itself is refused (403), the viewer cannot see
 * what holds the stage, so it reads "No permission" with Promote locked (F4), even where the card's
 * own state order would put an open review first.
 */
function logStateOf(model: StageCardModel, gatesUnread: boolean): StageCardModel['state'] {
  const { state } = model;
  const review =
    state.kind === 'reviewNeeded' ||
    state.kind === 'reviewWaiting' ||
    state.kind === 'reviewRejected' ||
    state.kind === 'reviewApproved';
  return gatesUnread && review ? { kind: 'noPermission' } : state;
}

export interface StageLogArgs {
  model: StageCardModel;
  detail: ChangeOrderDetail;
  stage: ChangeOrderStageState;
  history: ChangeOrderHistory;
  coReviews: UseChangeOrderReviewsResult;
}

/** The log's lines and the pill, from the card's model and what the page read. */
export function useStageLog({ model, detail, stage, history, coReviews }: StageLogArgs): {
  view: StageLogView;
  pill: StageLogPillView;
  /** The stage's entry and release reviews, for Review details. */
  entrySummary: GateReviewSummary | undefined;
  releaseSummary: GateReviewSummary | undefined;
} {
  const stageId = model.stage.id;
  const summaries = useMemo(() => Object.values(coReviews.byGateKey), [coReviews.byGateKey]);
  const entrySummary = coReviews.byGateKey[`entry:${stageId}`];
  const releaseSummary = coReviews.byGateKey[`release:${stageId}`];

  /*
   * The last view with lines, for this stage. The skeleton is for the first read only: after an action
   * the stage re-reads (its state, then a fresh quiet dry run), and a skeleton for that read would
   * unmount every line and move the content under the log. The lines stay, and change in place.
   * Keyed by ChangeOrder too: the same stage id of another ChangeOrder never shows these lines.
   */
  // A ref, not state: keeping the view must not cause another render.
  const shownKey = `${detail.changeOrderId ?? ''}|${stageId}`;
  const shown = useRef<{ key: string; view: StageLogView } | undefined>(undefined);
  const shownBefore = shown.current?.key === shownKey;
  const derived = useMemo(() => {
    const state = logStateOf(model, detail.serverGateRefusals[stageId] === 403);
    const sequenceStage = detail.sequence.stages.find((s) => s.id === stageId);
    const previousId = sequenceStage?.previousStageId ?? undefined;
    const previousSeq =
      previousId === undefined
        ? undefined
        : detail.sequence.stages.find((s) => s.id === previousId);
    const previousStage =
      previousSeq === undefined
        ? undefined
        : {
            stageId: previousSeq.id,
            name: stageDisplayName(previousSeq.id, previousSeq.isSource),
          };

    // When the change reached the stage before, and who promoted it there.
    let arrival: { at: number; person?: { name: string; isYou: boolean } } | undefined;
    for (const entry of history.entries) {
      if (
        entry.kind !== 'action' ||
        entry.promotion === undefined ||
        entry.stage !== previousId
      )
        continue;
      if (arrival === undefined || entry.at > arrival.at)
        arrival = {
          at: entry.at,
          person: { name: entry.person.name, isYou: entry.person.isYou },
        };
    }
    if (arrival === undefined && history.createdAt !== undefined)
      arrival = { at: history.createdAt };

    // Who made the newest failed action into this stage.
    let failurePerson: { at: number; name: string; isYou: boolean } | undefined;
    for (const entry of history.entries) {
      if (entry.kind !== 'action' || entry.failure === undefined || entry.stage !== stageId)
        continue;
      if (failurePerson === undefined || entry.at > failurePerson.at)
        failurePerson = { at: entry.at, name: entry.person.name, isYou: entry.person.isYou };
    }

    // Gates the card's state says only wait (not failed): drawn calm, never red.
    const waitingIds = new Set(
      (state.kind === 'gateWaiting'
        ? state.gates
        : state.kind === 'gateFailed'
          ? state.waiting
          : state.kind === 'reviewNeeded' ||
              state.kind === 'reviewWaiting' ||
              state.kind === 'reviewApproved'
            ? state.waitingGates
            : []
      ).map((g) => g.id),
    );
    const gates: StageLogGate[] = stage.gates
      .filter((g) => g.prerequisite !== 'Promoted' && !isReviewRequirementGate(g, summaries))
      .map((g) => ({
        id: g.id,
        // The prerequisite's own name (`soak-1h`, `released`), not the gate's display path (`check/released`).
        name: g.name.replace(/^check\//, ''),
        passed: g.evaluated && g.ok,
        evaluated: g.evaluated,
        waiting: waitingIds.has(g.id),
        ...(waitingIds.has(g.id) &&
        (gateWaitsFor(g, model.previousStage) === 'promoted' ||
          gateWaitsFor(g, model.previousStage) === 'released')
          ? { onStageBefore: true }
          : {}),
        ...(g.description === undefined || g.description.trim() === ''
          ? {}
          : { description: g.description }),
        ...(g.reason.trim() === '' ? {} : { reason: g.reason }),
        failedIn: g.evaluated && !g.ok ? model.gateSpaces(g.id) : [],
      }));
    // Release stays locked while a declared release requirement is unmet or not checked yet (fail closed).
    const promotedHere = stage.verdict === 'promoted';
    const releaseOpen = releaseReviewHolds(releaseSummary?.requirements ?? [], promotedHere);
    const releaseName = releaseSummary?.requirements[0]?.name;
    const ranCount = releaseRanCount(
      sequenceStage?.spaceIds ?? [],
      detail.skippedSpaceId,
      detail.releaseTargetOf,
      detail.progress,
    );
    const busyMethod =
      model.merge?.busy === true
        ? model.merge.methods[0]?.method === 'r'
          ? 'release'
          : 'promote'
        : null;
    return deriveStageLog({
      state,
      stage: model.stage,
      ...(previousStage === undefined ? {} : { previousStage }),
      ...(detail.baseSpaceId === undefined
        ? {}
        : {
            sourceSpace: {
              spaceId: detail.baseSpaceId,
              name: detail.baseSpaceSlug ?? model.nameOfSpace(detail.baseSpaceId),
            },
          }),
      ...(arrival === undefined ? {} : { arrival }),
      spaceCount: model.spaceCount,
      targetCount: model.releaseTargetCount,
      stageHasTargets: model.stageHasTargets,
      gates,
      gatesUnread: detail.serverGateRefusals[stageId] === 403,
      ...(model.gateCheckedAt === undefined ? {} : { gateCheckedAt: model.gateCheckedAt }),
      approvals: approvalsOf(entrySummary),
      approvalsRequired: Math.max(
        1,
        ...(entrySummary?.requirements ?? []).map((r) => r.required),
      ),
      releaseApprovals: approvalsOf(releaseSummary, releaseName),
      releaseReviewOpen: releaseOpen,
      ...(failurePerson === undefined
        ? {}
        : { failurePerson: { name: failurePerson.name, isYou: failurePerson.isYou } }),
      ...(model.bylines.promoted === undefined
        ? {}
        : {
            promoted: {
              at: model.bylines.promoted.at,
              person: {
                name: model.bylines.promoted.name,
                isYou: model.bylines.promoted.isYou,
              },
            },
          }),
      ...(model.bylines.released === undefined
        ? {}
        : {
            released: {
              at: model.bylines.released.at,
              person: {
                name: model.bylines.released.name,
                isYou: model.bylines.released.isYou,
              },
              ...(ranCount === undefined ? {} : { ranCount }),
            },
          }),
      dryRunUnavailable: model.dryRunLine.mode === 'unavailable',
      // Only a first read waits for the dry run: after it, the promote line says it is checking, in place.
      dryRunRunning:
        !shownBefore &&
        model.dryRunLine.mode === 'running' &&
        (state.kind === 'ready' || state.kind === 'problem' || state.kind === 'inProgress'),
      busy: busyMethod === null ? null : { method: busyMethod },
      problems: warnProblemsOf(state, model.dryRunLine.mode === 'held', model.problems),
      now: history.now,
    });
  }, [
    model,
    detail,
    stage.gates,
    stage.verdict,
    history.entries,
    history.createdAt,
    history.now,
    summaries,
    entrySummary,
    releaseSummary,
    stageId,
    shownBefore,
  ]);
  // A stage read again (its state "loading" for a moment) keeps the lines it showed.
  const view = derived.loading && shownBefore && shown.current !== undefined ? shown.current.view : derived;
  useEffect(() => {
    if (!derived.loading) shown.current = { key: shownKey, view: derived };
  }, [derived, shownKey]);

  const pill = useMemo(() => {
    const state = logStateOf(model, detail.serverGateRefusals[stageId] === 403);
    const reviewState =
      state.kind === 'reviewNeeded' ||
      state.kind === 'reviewWaiting' ||
      state.kind === 'reviewRejected' ||
      state.kind === 'reviewApproved'
        ? state
        : undefined;
    const warnProblems = warnProblemsOf(
      state,
      model.dryRunLine.mode === 'held',
      model.problems,
    );
    const waitingOn =
      model.review.summary === undefined ? [] : namedApprovers(model.review.summary).names;
    return stageLogPill({
      view,
      state,
      stageName: model.stage.name,
      ...(warnProblems.length > 0
        ? { warningTitle: propagationHeadline(warnProblems, model.spaceCount) }
        : {}),
      ...(state.kind === 'reviewRejected' && state.rejection !== undefined
        ? {
            rejecterName: state.rejection.rejecter.isYou
              ? 'you'
              : state.rejection.rejecter.name,
          }
        : {}),
      waitingOn,
      viewerPrompted:
        reviewState !== undefined &&
        reviewState.kind !== 'reviewRejected' &&
        reviewState.kind !== 'reviewApproved' &&
        flowShowsForm(reviewState.flow),
      busy: model.merge?.busy === true,
    });
  }, [model, view, detail.serverGateRefusals, stageId]);

  return { view, pill, entrySummary, releaseSummary };
}
