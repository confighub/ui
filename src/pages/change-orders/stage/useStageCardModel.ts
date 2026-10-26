// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Everything the selected stage's card shows and does, composed from what the
 * page already reads: the state of its status box, its one action, the reviews it
 * hosts, how the change reaches each Space, the quiet dry run, and the sidebar.
 *
 * The derivations are the pure `stage/*.ts` functions; this hook gathers their
 * inputs. The writes are `useStageConfirm`, and focus after them `useOutcomeFocus`.
 */

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';

import type { ChangeOrderDetail } from '../useChangeOrderDetail';
import type { ChangeOrderHistory } from '../useChangeOrderHistory';
import type { useChangeOrderConsoleChanges } from '../useChangeOrderConsoleChanges';
import { buildChangeOrderOutcome, carriedResourceKeysOf } from '../changeOrderOutcome';
import type {
  GateReviewSummary,
  ReviewChoice,
  SubmitReviewOutcome,
  UseChangeOrderReviewsResult,
} from '../reviews/changeOrderReviewTypes';
import { useGateReviews } from '../reviews/useStageReviews';
import { partitionBlockingGates } from '../../x/apps/change-order/changeOrderGates';
import { gatesBlockPromotion } from '../../x/apps/change-order/changeOrderFooterModel';
import { stageDisplayName } from '../../x/apps/change-order/changeOrderCopy';
import { promotionTargets } from '../../x/apps/change-order/changeOrderStages';
import type { ChangeOrderStageState } from '../../x/apps/change-order/changeOrderTypes';
import { useChangeOrderActions } from '../../x/apps/change-order/useChangeOrderActions';
import {
  actionStageOf,
  cardDryRunView,
  dryRunRefreshKey,
  changeCardModel,
  gateDetailsOf,
  gateSpacesFor,
  isReviewRequirementGate,
  nextStepOf,
  previousStageOf,
  sidebarGateFlags,
  otherGatesHolding as otherGatesHoldingOf,
  sidebarMarks,
  sidebarSpaces,
  stageGatesAnswered,
  sidebarReviewsOf,
  sidebarTargets,
} from './stageCardParts';
import { stageCardCopy } from './stageCardCopy';
import {
  defaultMethod,
  deriveStageCardState,
  dryRunWanted,
  isReviewState,
  methodsFor,
  stageBoxLook,
  stageBylines,
  stageFailure,
  type HostedReview,
  type StageCardStateInput,
} from './stageCardState';
import { stageDiffSections } from './stageDiffSections';
import { classifyDryRunAnswer, dryRunLine, releaseLine } from './stageDryRun';
import { outcomeByMajority, stagePropagation } from './stagePropagation';
import { releaseReviewOf, stageSectionGates, subjectReviews, viewerFlow } from './stageReviewModel';
import type { MergeControl, StageLinks } from './StageStatusBox';
import type { StageCardState } from './stageTypes';
import { useOutcomeFocus } from './useOutcomeFocus';
import { useStageConfirm } from './useStageConfirm';
import { useStageDiff } from './useStageDiff';
import { useStageDryRun } from './useStageDryRun';

type Changes = ReturnType<typeof useChangeOrderConsoleChanges>;
type Recorded = (outcome: Extract<SubmitReviewOutcome, { ok: true }>, summary: GateReviewSummary, result: ReviewChoice) => void;

export interface UseStageCardModelArgs {
  detail: ChangeOrderDetail;
  stage: ChangeOrderStageState;
  changes: Changes;
  coReviews: UseChangeOrderReviewsResult;
  history: ChangeOrderHistory;
  hrefForStage: (stageId: string) => string;
  /** The path ends in a Complete step, so the last stage's "Go to" leads there. */
  hasComplete: boolean;
  /** Approve…, so the band's "Review now" can focus it. */
  approveRef: RefObject<HTMLButtonElement>;
  /** The page's one live region. */
  announce: (text: string) => void;
  onReviewRecorded: Recorded;
}

export function useStageCardModel(args: UseStageCardModelArgs) {
  const { detail, stage, changes, coReviews, history, hrefForStage, hasComplete, approveRef, announce, onReviewRecorded } = args;
  const stageId = stage.stageId;
  const isSource = stage.verdict === 'source';
  const stageName = stageDisplayName(stageId, isSource);
  const sequenceStage = detail.sequence.stages.find((s) => s.id === stageId);
  const memberSpaceIds = useMemo(() => sequenceStage?.spaceIds ?? [], [sequenceStage]);
  const { previousSeq, previousStage, previousLanded } = previousStageOf(sequenceStage, detail);

  const actions = useChangeOrderActions({
    changeOrderId: detail.changeOrderId,
    baseSpaceId: detail.baseSpaceId,
    onSettled: detail.refetch,
  });

  // ── Names ────────────────────────────────────────────────────────────────
  const nameOfSpace = useCallback(
    (spaceId: string) =>
      changes.spaceNameBySpaceId.get(spaceId) ?? detail.scopedSpaces?.find((s) => s.spaceId === spaceId)?.slug ?? spaceId,
    [changes.spaceNameBySpaceId, detail.scopedSpaces],
  );
  const nameOfUnit = useCallback((unitId: string) => changes.slugByUnitId.get(unitId) ?? unitId, [changes.slugByUnitId]);
  const releaseTargetOf = useCallback(
    (spaceId: string) => detail.scopedSpaces?.find((s) => s.spaceId === spaceId)?.releaseTargetId,
    [detail.scopedSpaces],
  );

  // ── What the actions write into ─────────────────────────────────────────
  /*
   * The Spaces this stage's actions write into: its membership minus the Space
   * the promotion passes over. Every write and every count of one reads this,
   * never stage membership, which is a different question.
   */
  const targets = useMemo(() => promotionTargets(memberSpaceIds, detail.skippedSpaceId), [memberSpaceIds, detail.skippedSpaceId]);
  /*
   * Release publishes only Spaces that have a release Target: the server refuses a
   * Space without one, so a stage that mixes the two promotes every Space and
   * publishes those with a Target. A stage where no Space has one is never released,
   * and once promoted it is done.
   */
  const releaseSpaceIds = useMemo(() => targets.filter((id) => releaseTargetOf(id) !== undefined), [targets, releaseTargetOf]);
  const stageHasTargets = releaseSpaceIds.length > 0;

  /*
   * What holds the stage, split by whether anybody checked: a gate that ran and
   * failed holds it; a gate nobody could evaluate is left to the server, whose
   * verdict comes back with the quiet dry run.
   */
  const blocking = partitionBlockingGates(stage.gates);
  const failedGateCount = blocking.failed.length;
  const gatesBlock = gatesBlockPromotion(failedGateCount);

  // ── Reviews ─────────────────────────────────────────────────────────────
  const verdictOf = useCallback(
    (id: string) => detail.stageStates.find((s) => s.stageId === id)?.verdict,
    [detail.stageStates],
  );
  const hasReleaseReview = useMemo(() => releaseReviewOf(coReviews.byGateKey), [coReviews.byGateKey]);
  const summaries = useMemo(() => Object.values(coReviews.byGateKey), [coReviews.byGateKey]);
  /*
   * One form per gate, on one card at a time: this card hosts the gates
   * `stageSectionGates` gives it and no others, so two forms can never record two
   * decisions for one gate.
   */
  const hosted = useMemo(
    () => stageSectionGates(summaries, stageId, verdictOf, hasReleaseReview),
    [summaries, stageId, verdictOf, hasReleaseReview],
  );
  const hostedRefs = useMemo(() => hosted.map((s) => s.gate), [hosted]);
  const reviews = useGateReviews(detail, hostedRefs);
  const reviewSummary = hosted.length > 0 ? reviews.summary : undefined;
  const flow = useMemo(
    () => (reviewSummary === undefined ? undefined : viewerFlow(reviewSummary, reviews.coverageByType)),
    [reviewSummary, reviews.coverageByType],
  );
  const hostedReview: HostedReview | undefined =
    reviewSummary !== undefined && flow !== undefined ? { summary: reviewSummary, flow } : undefined;
  const hostsRelease = hosted.some((s) => s.gate.kind === 'release');
  const hostsOwnEntry = hosted.some((s) => s.gate.kind === 'entry' && s.gate.stageId === stageId);
  /** This stage's own entry review when another card (or none yet) hosts it. */
  const ownEntryElsewhere = hostsOwnEntry ? undefined : coReviews.byGateKey[`entry:${stageId}`];
  const hostedEntry = hosted.find((s) => s.gate.kind === 'entry');
  const otherGatesHolding =
    hostedEntry === undefined
      ? undefined
      : otherGatesHoldingOf(detail.stageStates.find((s) => s.stageId === hostedEntry.gate.stageId)?.gates ?? [], hostedEntry);

  // ── How the change reaches each Space ───────────────────────────────────
  const carriedResourceKeys = useMemo(
    () =>
      detail.fanOutSource !== undefined
        ? null
        : carriedResourceKeysOf(changes.sourceGroupsByUnitId.values(), changes.sourceCreatedResourceKeys),
    [detail.fanOutSource, changes.sourceGroupsByUnitId, changes.sourceCreatedResourceKeys],
  );
  const outcome = useMemo(() => buildChangeOrderOutcome(changes.matrix, carriedResourceKeys), [changes.matrix, carriedResourceKeys]);
  const propagation = useMemo(
    () =>
      stagePropagation({
        outcome,
        matrix: changes.matrix,
        groupsByUnitId: changes.groupsByUnitId,
        spaceIdByUnitId: changes.spaceIdByUnitId,
        carriedResourceKeys,
        unplannedReasonBySpaceId: changes.unplannedReasonBySpaceId,
        stageName,
        previousLanded,
      }),
    [outcome, changes.matrix, changes.groupsByUnitId, changes.spaceIdByUnitId, carriedResourceKeys, changes.unplannedReasonBySpaceId, stageName, previousLanded],
  );
  const diffModel = useMemo(
    () =>
      stageDiffSections({
        stageId,
        // The groups the status box names: the majority is the reference, not whichever Space came first.
        outcome: outcomeByMajority(outcome, propagation),
        units: changes.units,
        groupsByUnitId: changes.groupsByUnitId,
        skippedUnits: detail.skippedUnits,
        matrix: changes.matrix,
        chainedSpaceIds: propagation.chainedSpaceIds,
      }),
    [stageId, outcome, propagation, changes.units, changes.groupsByUnitId, detail.skippedUnits, changes.matrix],
  );
  const diff = useStageDiff(diffModel);
  // Another stage selected: its diff starts closed. Adjusted during render, not in an effect.
  const [diffStageId, setDiffStageId] = useState(stageId);
  if (diffStageId !== stageId) {
    setDiffStageId(stageId);
    if (diff.open) diff.toggle();
  }
  // The stages whose change has been read once, so "could not be read" is never said during a first read.
  const settledStages = useRef(new Set<string>());
  if (changes.stageChangesStatus !== 'loading') settledStages.current.add(stageId);
  const groupKindOf = useCallback(
    (spaceId: string) => outcome.groups.find((g) => g.spaceIds.includes(spaceId))?.kind,
    [outcome.groups],
  );
  const { openAt, reveal } = diff;
  const links: StageLinks = useMemo(
    () => ({
      resolvers: { hrefForStage, groupKindOf },
      onField: (ref: { spaceId: string; unitId: string; path: string }) => openAt({ groupKind: groupKindOf(ref.spaceId) ?? 'differs', unitId: ref.unitId, path: ref.path }),
      onDiff: reveal,
    }),
    [hrefForStage, groupKindOf, openAt, reveal],
  );

  // ── A failed promotion or release ───────────────────────────────────────
  const resolvedSpaceIds = detail.progress.resolvedSpaceIds;
  const failure = useMemo(
    () =>
      stageFailure({
        stageId,
        verdict: stage.verdict,
        targets,
        baseSpaceId: detail.baseSpaceId,
        lastResult: actions.lastResult,
        lastResultStageId: actions.lastResultStageId,
        // Passed over, or nothing landed for that cause: either way every retry passes the Space over again.
        lastResultOutOfScope: actions.lastResult?.outOfScope === true,
        promotionFailures: detail.promotionFailures,
        promotions: detail.promotions,
        resolvedSpaceIds,
        releasedSpaceIds: detail.progress.releasedSpaceIds,
        slugOf: nameOfSpace,
      }),
    [stageId, stage.verdict, targets, detail.baseSpaceId, actions.lastResult, actions.lastResultStageId, detail.promotionFailures, detail.promotions, resolvedSpaceIds, detail.progress.releasedSpaceIds, nameOfSpace],
  );

  // ── Card-local state, tagged with the stage it belongs to ───────────────
  /*
   * The action this card is writing now, with the box as it was when Confirm was
   * pressed. Until Confirm lets go (the write and a read after it are done, release
   * leg included), the box shows that state with its confirm saying "Working…":
   * a read that lands between the promote and the release would otherwise show
   * "Promoted, not released" with a live Release button mid-action.
   */
  const [runningAction, setRunningAction] = useState<{ stageId: string; shown: StageCardState | null } | null>(null);
  const running = runningAction?.stageId ?? null;
  const shownState = useRef<StageCardState | null>(null);
  const setRunning = useCallback(
    (id: string | null) => setRunningAction(id === null ? null : { stageId: id, shown: shownState.current }),
    [],
  );
  const [approvedOn, setApprovedOn] = useState<string | null>(null);
  const [askedAgain, setAskedAgain] = useState<{ stageId: string; userId: string } | null>(null);

  // ── The state ───────────────────────────────────────────────────────────
  const emptyInFlight = useMemo(() => new Set<string>(), []);
  const baseInput: Omit<StageCardStateInput, 'dryRun'> = {
    stageId,
    verdict: stage.verdict,
    isSource,
    invocationSource: isSource && detail.invocationSource !== undefined,
    abortedReason: detail.abortedReason,
    spaceIds: memberSpaceIds,
    // Until the stage's Spaces are read, "No Spaces in this stage" would be a guess.
    membershipLoaded: !detail.isLoading,
    gatesAnswered: stageGatesAnswered({
      stageId,
      membershipLoaded: !detail.isLoading,
      workflow: detail.workflow,
      workflowCompleted: detail.workflowCompleted,
      ownSpaceReached: detail.ownSpaceReached,
      hasSpaces: memberSpaceIds.length > 0,
      serverAnswered: detail.serverGatesByStage[stageId] !== undefined || detail.serverGateRefusals[stageId] !== undefined,
      previousSpaces: (previousSeq?.spaceIds ?? []).map((id) => detail.scopedSpaces?.find((sp) => sp.spaceId === id)),
    }),
    targets,
    stageHasTargets,
    gates: stage.gates,
    ...(previousStage === undefined ? {} : { previousStage }),
    // While this card writes, its box keeps its state and its confirm says "Working…".
    inFlightSpaceIds: running === stageId ? emptyInFlight : actions.inFlightSpaceIds,
    failure,
    ...(stage.verdict === 'promoted' && hostsRelease && hostedReview !== undefined ? { releaseReview: hostedReview } : {}),
    ...(stage.verdict !== 'promoted' && hostsOwnEntry && hostedReview !== undefined ? { entryReview: hostedReview } : {}),
    ...(detail.serverGateRefusals[stageId] === undefined ? {} : { serverGateRefusal: detail.serverGateRefusals[stageId] }),
    problems: propagation.problems,
    approvedByYou: approvedOn === stageId,
  };
  // The dry run is asked only where it can change what the box offers.
  const before = deriveStageCardState({ ...baseInput, dryRun: { mode: 'idle' } });

  const dryRun = useStageDryRun({
    changeOrderId: detail.changeOrderId,
    baseSpaceId: detail.baseSpaceId,
    stageId: isSource ? undefined : stageId,
    targetSpaceIds: targets,
    enabled: dryRunWanted(before),
    forcedDryRunSettled: changes.stageChangesStatus !== 'loading',
    refreshKey: dryRunRefreshKey(detail),
    adoptPlan: actions.adoptPlan,
  });
  const classified = useMemo(
    () => (dryRun.answer === undefined ? undefined : classifyDryRunAnswer({ status: dryRun.answer.status, body: dryRun.answer.body }, detail.baseSpaceId)),
    [dryRun.answer, detail.baseSpaceId],
  );
  const wanted = dryRunWanted(before);
  const dryRunView = useMemo(
    () => cardDryRunView({ wanted, last: classified, running: dryRun.running, targetCount: targets.length }),
    [wanted, classified, dryRun.running, targets.length],
  );

  const derived = deriveStageCardState({ ...baseInput, dryRun: dryRunView });
  const state = (runningAction?.stageId === stageId ? runningAction.shown : null) ?? derived;
  shownState.current = state;
  const look = stageBoxLook(state);
  const problemsHere = state.kind === 'problem' ? state.problems : [];
  const line = dryRunLine({
    view: dryRunView,
    targetCount: targets.length,
    nameOf: nameOfSpace,
    problems: problemsHere,
  });

  // ── Focus after an action, and the action ───────────────────────────────
  const { headingRef, mainRef, focusAfter } = useOutcomeFocus(state.kind, approveRef);
  const confirm = useStageConfirm({
    stageId,
    stageName,
    actions,
    dryRun,
    baseSpaceId: detail.baseSpaceId,
    gatesBlock,
    failedGateCount,
    targets,
    releaseSpaceIds,
    failure: state.kind === 'failed' ? state.failure : undefined,
    nameOfSpace,
    readAt: detail.readAt,
    announce,
    focusAfter,
    setRunning,
  });

  const methods = methodsFor(state, stageHasTargets, stageName);
  /*
   * A dry run that fails now offers no Promote: the box says which Spaces fail
   * and offers Check again, as a return to the window does.
   */
  const offersAction = !(dryRunView.mode === 'fails' && state.kind !== 'failed');
  const merge: MergeControl | undefined =
    methods.length > 0 && offersAction
      ? {
          methods,
          defaultMethod: defaultMethod(methods),
          /*
           * Nothing is wrong and the box already says what the click writes: no
           * confirm. A re-check in flight (the window took focus) keeps it one
           * click; the click waits for that answer and writes only if it plans the same.
           */
          oneClick: (state.kind === 'ready' && classified?.kind === 'done') || state.kind === 'promoted',
          busy: running === stageId,
          gated: gatesBlock,
          mainRef,
          onConfirm: confirm.onConfirm,
          onCancel: confirm.onCancel,
          confirmWaiting: confirm.checking,
          ...(confirm.ackNoDryRun ? { ack: stageCardCopy.merge.ack.noDryRun, confirmAnyway: true } : {}),
          ...(confirm.note !== undefined ? { confirmNote: confirm.note } : {}),
        }
      : undefined;

  // ── Reviews: what the box and the sidebar need ──────────────────────────
  const onRecorded: Recorded = useCallback(
    (outcomeOfSubmit, summary, result) => {
      onReviewRecorded(outcomeOfSubmit, summary, result);
      if (result === 'Pass') setApprovedOn(stageId);
      focusAfter('review');
    },
    [onReviewRecorded, stageId, focusAfter],
  );
  const onAskedAgain = useCallback((userId: string) => setAskedAgain({ stageId, userId }), [stageId]);

  const sidebarReviews = sidebarReviewsOf({
    ...(reviewSummary === undefined
      ? {}
      : {
          hosted: {
            summary: reviewSummary,
            reviews,
            ...(state.kind === 'reviewRejected' && state.rejection !== undefined ? { quotedRejecterId: state.rejection.rejecter.userId } : {}),
            ...(askedAgain?.stageId === stageId ? { askedAgainUserId: askedAgain.userId } : {}),
          },
        }),
    ...(ownEntryElsewhere === undefined ? {} : { ownEntryElsewhere }),
    verdictOf,
  });
  const sidebarSubjectReviews = subjectReviews(summaries, stageId, verdictOf, hasReleaseReview).map(({ summary, actionStageId }) => {
    const actionStage = actionStageOf(detail.stageStates, actionStageId);
    return { summary, ...(actionStage === undefined ? {} : { actionStage }) };
  });
  const base =
    detail.baseSpaceId === undefined ? undefined : { spaceId: detail.baseSpaceId, name: detail.baseSpaceSlug ?? nameOfSpace(detail.baseSpaceId) };
  const failureHere = state.kind === 'failed' ? state.failure : undefined;

  return {
    stage: { id: stageId, name: stageName },
    verdict: stage.verdict,
    state,
    look,
    links,
    next: nextStepOf(detail.stageStates, stageId, hasComplete, hrefForStage),
    nameOfSpace,
    nameOfUnit,
    headingRef,
    dryRunLine: line,
    recheck: dryRun.recheck,
    merge,
    bylines: stageBylines(history.entries, stageId, memberSpaceIds),
    releaseText: releaseLine(targets, releaseTargetOf),
    progress: { promoted: stage.promotedCount, total: stage.spaceCount },
    gateCheckedAt: detail.gateCheckedAt(stageId),
    gateSpaces: gateSpacesFor(detail.serverGatesByStage[stageId], stage.gates, nameOfSpace),
    review: {
      summary: reviewSummary,
      reviews,
      otherGatesHolding,
      onRecorded,
      onAskedAgain,
    },
    sidebar: {
      gates: stage.gates.filter((gate) => !isReviewRequirementGate(gate, sidebarReviews.map((r) => r.summary))),
      gateDetails: gateDetailsOf(previousSeq?.spaceIds, nameOfSpace),
      ...sidebarGateFlags(state),
      // The box hosts no review now, so the first review row is where a review link lands.
      reviewAnchor: !isReviewState(state.kind),
      reviews: sidebarReviews,
      subjectReviews: sidebarSubjectReviews,
      spaces: sidebarSpaces(memberSpaceIds, nameOfSpace),
      marks: sidebarMarks(propagation.marks, failureHere, targets, resolvedSpaceIds, nameOfSpace),
      targets: sidebarTargets(targets, releaseTargetOf, stage.verdict),
    },
    change: changeCardModel({
      isSource,
      verdict: stage.verdict,
      ...(base === undefined ? {} : { base }),
      ...(detail.fanOutSource === undefined
        ? {}
        : { fanOutSources: detail.fanOutSource.spaceIds.map((spaceId) => ({ spaceId, name: detail.fanOutSource?.spaceNameBySpaceId.get(spaceId) ?? spaceId })) }),
      ...(failureHere === undefined ? {} : { failure: failureHere }),
      targets,
      fieldCount: diffModel.fieldCount,
      sameEverywhere: diffModel.sameEverywhere,
      status: changes.stageChangesStatus,
      groups: changes.groupsByUnitId.values(),
      ...(previousLanded || previousStage === undefined ? {} : { notReachedFrom: { stageId: previousStage.stageId, name: previousStage.name } }),
      sourceFieldCount: [...changes.sourceGroupsByUnitId.values()].reduce((n, g) => n + g.fieldDiffs.length, 0),
      settledOnce: settledStages.current.has(stageId),
      propagation,
    }),
    diff,
    diffModel,
    spaceCount: targets.length,
  };
}

export type StageCardModel = ReturnType<typeof useStageCardModel>;
