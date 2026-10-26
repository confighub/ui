// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The selected stage's card: the stage name, then two columns. The main column is
 * the change and the one box that says the stage's state and holds its action;
 * the sidebar holds the stage's facts (gates and reviews, Spaces, Targets).
 *
 * The state is said once, in the status box. Outcomes are announced through the
 * page's live region (`announce`); the card has none of its own, so a screen
 * reader never hears one event from two places.
 *
 * A done stage says so and offers nothing. A disabled Promote on a released
 * stage would need a reason beside it, and the box already is that reason.
 */

import { forwardRef, useImperativeHandle, type CSSProperties, type RefObject } from 'react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import type { ConfigDiffColumns } from '@/components/config-diff/ConfigDiffView';
import type { DiffComments } from '@/components/config-diff/diffComments';
import { InvocationSourceDetails } from '../components/InvocationSourceDetails';
import type { ChangeOrderDetail } from '../useChangeOrderDetail';
import type { ChangeOrderHistory } from '../useChangeOrderHistory';
import type { useChangeOrderConsoleChanges } from '../useChangeOrderConsoleChanges';
import type { ReviewDiffTarget } from '../review-comments/reviewCommentsContext';
import type {
  GateReviewSummary,
  ReviewChoice,
  SubmitReviewOutcome,
  UseChangeOrderReviewsResult,
} from '../reviews/changeOrderReviewTypes';
import type { ChangeOrderStageState } from '../../x/apps/change-order/changeOrderTypes';
import { StageChangeCard } from './StageChangeCard';
import { StageOutcomeBoxes } from './StageOutcomeBoxes';
import { StageFailureBox, StageHeldBox, StageProblemBox } from './StageProblem';
import { StageReviewBox } from './StageReviewActions';
import { StageSidebar } from './StageSidebar';
import { StageStateBox } from './StageStatusBox';
import { stageCardCopy } from './stageCardCopy';
import { useStageCardModel, type StageCardModel } from './useStageCardModel';

/** What the page holds for drawing a Unit's diff, shared with its other diffs so their columns line up. */
export interface StageSectionDiffDeps {
  unitLinksHrefFor: (unit: { spaceId: string; unitId: string }, direction: 'from' | 'to') => string | undefined;
  diffColumns: ConfigDiffColumns;
  fallbackColumnStyle: CSSProperties;
  diffCommentsFor: (target: ReviewDiffTarget | undefined) => DiffComments | undefined;
  unitIdsByRowKey: ReadonlyMap<string, readonly string[]>;
}

export interface StageSectionProps {
  detail: ChangeOrderDetail;
  stage: ChangeOrderStageState;
  changes: ReturnType<typeof useChangeOrderConsoleChanges>;
  coReviews: UseChangeOrderReviewsResult;
  history: ChangeOrderHistory;
  workflow: { href: string | null; label: string };
  hrefForStage: (stageId: string) => string;
  /** The path ends in a Complete step. */
  hasComplete: boolean;
  diffDeps: StageSectionDiffDeps;
  approveRef: RefObject<HTMLButtonElement>;
  now: number;
  /** The page's live region. */
  announce: (text: string) => void;
  onReviewRecorded: (outcome: Extract<SubmitReviewOutcome, { ok: true }>, summary: GateReviewSummary, result: ReviewChoice) => void;
  onNotice: (message: string) => void;
}

/** What the page can ask of the card. */
export interface StageSectionHandle {
  /** Open the outcome boxes, for a review comment whose row is inside them. */
  revealDiff: () => void;
}

/** Under this width the sidebar goes below the main column. */
const ONE_COLUMN = '@media (max-width: 759.98px)';
const NARROW_GAP = '@media (max-width: 1179.98px)';

/** The status box for the card's state. Each review, problem and failure has a box of its own. */
function StatusBox({ model, props }: { model: StageCardModel; props: StageSectionProps }) {
  const { state, look, stage, links, nameOfSpace, nameOfUnit, headingRef, merge, dryRunLine } = model;
  const checkAgain = () => void model.recheck();
  switch (state.kind) {
    case 'reviewNeeded':
    case 'reviewWaiting':
    case 'reviewRejected': {
      const summary = model.review.summary;
      if (summary === undefined) return null;
      return (
        <StageReviewBox
          state={state}
          look={look}
          stage={stage}
          summary={summary}
          reviews={model.review.reviews}
          orderSlug={props.detail.slug}
          now={props.now}
          links={links}
          nameOfSpace={nameOfSpace}
          nameOfUnit={nameOfUnit}
          otherGatesHolding={model.review.otherGatesHolding}
          approveRef={props.approveRef}
          headingRef={headingRef}
          announce={props.announce}
          onAskedAgain={model.review.onAskedAgain}
          onRecorded={model.review.onRecorded}
        />
      );
    }
    case 'gateFailed':
    case 'serverHeld':
      return (
        <StageHeldBox
          state={state}
          look={look}
          stage={stage}
          links={links}
          nameOfSpace={nameOfSpace}
          gateCheckedAt={model.gateCheckedAt}
          gateSpaces={model.gateSpaces}
          headingRef={headingRef}
        />
      );
    case 'problem':
      return (
        <StageProblemBox
          problems={state.problems}
          spaceCount={model.spaceCount}
          look={look}
          stage={stage}
          links={links}
          nameOfSpace={nameOfSpace}
          nameOfUnit={nameOfUnit}
          dryRun={dryRunLine}
          onCheckAgain={checkAgain}
          {...(merge === undefined ? {} : { merge })}
          headingRef={headingRef}
        />
      );
    case 'failed':
      return (
        <StageFailureBox
          failure={state.failure}
          canRetry={state.canRetry}
          look={look}
          stage={stage}
          links={links}
          nameOfSpace={nameOfSpace}
          dryRun={dryRunLine}
          onCheckAgain={checkAgain}
          {...(merge === undefined ? {} : { merge })}
          headingRef={headingRef}
        />
      );
    default:
      return (
        <StageStateBox
          state={state}
          look={look}
          stage={stage}
          next={model.next}
          links={links}
          nameOfSpace={nameOfSpace}
          bylines={model.bylines}
          now={props.now}
          dryRun={dryRunLine}
          releaseText={model.releaseText}
          progress={model.progress}
          onCheckAgain={checkAgain}
          nameOfUnit={nameOfUnit}
          gateCheckedAt={model.gateCheckedAt}
          gateSpaces={model.gateSpaces}
          {...(merge === undefined ? {} : { merge })}
          headingRef={headingRef}
        />
      );
  }
}

export const StageSection = forwardRef<StageSectionHandle, StageSectionProps>(function StageSection(props, ref) {
  const { detail, stage, changes, diffDeps } = props;
  const model = useStageCardModel({
    detail,
    stage,
    changes,
    coReviews: props.coReviews,
    history: props.history,
    hrefForStage: props.hrefForStage,
    hasComplete: props.hasComplete,
    approveRef: props.approveRef,
    announce: props.announce,
    onReviewRecorded: props.onReviewRecorded,
  });
  const { diff } = model;
  /*
   * Deferred a tick: a review comment asks for the diff from an effect, and the
   * boxes open with a synchronous render that must not run inside another one.
   */
  useImperativeHandle(ref, () => ({ revealDiff: () => window.setTimeout(diff.reveal, 0) }), [diff.reveal]);

  const invocationSource = model.state.kind === 'invocationSource' && detail.invocationSource !== undefined;
  return (
    <Box
      component="section"
      role="region"
      aria-label={stageCardCopy.regionLabel(model.stage.name)}
      data-testid="stage-card"
      data-stage={model.stage.id}
      sx={{ mt: '28px', fontFamily: 'var(--font-sans)', color: 'text.primary' }}
    >
      {/* The stage name at the design's largest size; an h2, since the ChangeOrder's slug is the page's h1. */}
      <Typography variant="h1" component="h2" sx={{ mb: '16px', overflowWrap: 'anywhere' }}>
        {model.stage.name}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 7fr) minmax(260px, 3fr)',
          gap: '24px',
          alignItems: 'start',
          [NARROW_GAP]: { gap: '20px' },
          [ONE_COLUMN]: { gridTemplateColumns: 'minmax(0, 1fr)' },
        }}
      >
        {/* One track that may shrink: an auto track grows to its widest unbreakable line (a path, an image tag) and runs under the sidebar. */}
        <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px' }}>
          {/* An Invocation's source writes nothing itself: the card shows the Invocation each stage runs as it is promoted. */}
          {invocationSource && detail.invocationSource !== undefined ? (
            <InvocationSourceDetails source={detail.invocationSource} />
          ) : (
            <StageChangeCard
              written={model.change.written}
              scope={model.change.scope}
              links={model.links}
              notice={model.change.notice}
              notes={model.change.notes}
              {...(model.change.shortfallNote === undefined ? {} : { shortfall: model.change.shortfallNote })}
            >
              <StageOutcomeBoxes
                model={model.diffModel}
                deps={{
                  groupsByUnitId: changes.groupsByUnitId,
                  spaceIdByUnitId: changes.spaceIdByUnitId,
                  spaceNameBySpaceId: changes.spaceNameBySpaceId,
                  writtenUnitIds: changes.writtenUnitIds,
                  undeterminedUnitIds: changes.undeterminedUnitIds,
                  scopedSpaces: detail.scopedSpaces,
                  componentName: detail.componentName,
                  rowKeyByUnitId: changes.matrix?.rowKeyByUnitId,
                  ...diffDeps,
                }}
                open={diff.open}
                onToggle={diff.toggle}
                highlight={diff.highlight}
                boxesRef={diff.cardRef}
                onShowInDiff={diff.openAt}
              />
            </StageChangeCard>
          )}
          {/* Keyed by stage: a method chosen, a confirm or a form open on one stage never carries over to another. */}
          <StatusBox key={model.stage.id} model={model} props={props} />
        </Box>
        <StageSidebar
          stageId={model.stage.id}
          gates={model.sidebar.gates}
          gateDetails={model.sidebar.gateDetails}
          waitingGateIds={model.sidebar.waitingGateIds}
          gateIdsInBox={model.sidebar.gateIdsInBox}
          reviewAnchor={model.sidebar.reviewAnchor}
          gatesPending={model.sidebar.pending}
          reviews={model.sidebar.reviews}
          subjectReviews={model.sidebar.subjectReviews}
          workflow={props.workflow}
          spaces={model.sidebar.spaces}
          marks={model.sidebar.marks}
          targets={model.sidebar.targets}
          links={model.links}
          now={props.now}
          onNotice={props.onNotice}
        />
      </Box>
    </Box>
  );
});
