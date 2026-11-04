// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The selected stage's card, in one column: the stage name with its status pill,
 * the change ("What this promotion writes" and the Full diff), then the Stage log
 * (what happened, Now, what still has to happen, each with its own button).
 *
 * The state is said at a glance by the pill and in full by the log. Outcomes are
 * announced through the page's live region (`announce`); the card has none of its
 * own, so a screen reader never hears one event from two places.
 *
 * A done stage says so and offers nothing: the log ends with where to go next.
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
import { StageLog } from './StageLog';
import { StageLogPill } from './StageLogPill';
import { StageOutcomeBoxes } from './StageOutcomeBoxes';
import { stageCardCopy } from './stageCardCopy';
import { useStageCardModel } from './useStageCardModel';
import { useStageLog } from './useStageLog';

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

  const log = useStageLog({ model, detail, stage, history: props.history, coReviews: props.coReviews });
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
      {/* "Stage: Test" at the design's largest size; an h2, since the ChangeOrder's slug is the page's h1. The word is quieter than the name. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '14px' }}>
        <Typography variant="h1" component="h2" data-testid="stage-name" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
          <Box component="span" sx={{ color: 'text.secondary', fontWeight: 'fontWeightRegular' }}>
            {stageCardCopy.stageHeadingLead}
          </Box>{' '}
          {model.stage.name}
        </Typography>
        <StageLogPill pill={log.pill} headingRef={model.headingRef} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px', mb: '16px', '&:empty': { display: 'none' } }}>
        {/* An Invocation's source writes nothing itself: the card shows the Invocation each stage runs as it is promoted. */}
        {invocationSource && detail.invocationSource !== undefined ? (
          <Box data-testid="invocation-card">
            <InvocationSourceDetails source={detail.invocationSource} />
          </Box>
        ) : log.view.hideChangeCard ? null : (
          <Box data-testid="change-card">
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
          </Box>
        )}
      </Box>
      {/* Keyed by stage: a choice, a confirm or a form open on one stage never carries over to another. */}
      <StageLog
        key={model.stage.id}
        view={log.view}
        entryReview={log.entrySummary}
        releaseReview={log.releaseSummary}
        onNotice={props.onNotice}
        model={model}
        orderSlug={detail.slug}
        now={props.now}
        approveRef={props.approveRef}
        announce={props.announce}
      />
    </Box>
  );
});
