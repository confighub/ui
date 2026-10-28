// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { KeyboardEvent, ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { SvgIconComponent } from '@mui/icons-material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import RemoveIcon from '@mui/icons-material/Remove';

import { VISUALLY_HIDDEN_SX } from '@/utility/visually-hidden';
import { changeOrderCopy, stageDisplayName } from '../../x/apps/change-order/changeOrderCopy';
import { gatesOpen, tallyGates } from '../../x/apps/change-order/changeOrderGates';
import type {
  ChangeOrderGate,
  ChangeOrderGateTally,
  ChangeOrderStageState,
} from '../../x/apps/change-order/changeOrderTypes';
import { COMPLETE_STAGE_ID, COMPLETE_STEP_LABEL, type CompleteStepTone } from '../changeOrderCompleteStep';
import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderSelectedRing,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import type { StageReviewRail } from '../reviews/changeOrderReviewTypes';
import { reviewCopy } from '../reviews/reviewCopy';
import { OutcomeBar } from './OutcomeBar';
import { OUTCOME_META, type OutcomeBarSegment } from './outcomeMeta';
import { completeRailDot, railDot, type RailDot } from './railDots';
import { railStageLabel, reviewHoldTone } from './railStage';

interface StageLinkTone {
  bg: string;
  border: string;
  color: string;
  Icon: SvgIconComponent;
}

/** A gate nobody has passed or is about to: the connector's resting state. */
const CLOSED_LINK: StageLinkTone = {
  bg: changeOrderSurface.sunk,
  border: changeOrderBorder.strong,
  color: changeOrderInk.subtle,
  Icon: LockOutlinedIcon,
};

/** The connector into a stage of an existing ChangeOrder, as that stage stands. */
export interface StageLinkStateProps {
  preview?: false;
  state: ChangeOrderStageState;
  isNext: boolean;
  /** Whether the ChangeOrder has passed the stage on the right, by the console row's count. */
  stagePassed?: boolean;
  /** The review state of the stage on the right, when it has reviews. */
  review?: StageReviewRail;
}

/** The connector into a stage of a draft, before any gate can be evaluated. */
export interface StageLinkPreviewProps {
  preview: true;
  /** The gates that guard the stage on the right. */
  gateCount: number;
}

export type StageLinkProps = StageLinkStateProps | StageLinkPreviewProps;

/**
 * The connector between two adjacent rail nodes — the mockup's `.link`
 * (~line 4160): a small badge naming whether the gate INTO the right-hand
 * stage is passed, open or closed, plus the same satisfied/total tally
 * `changeOrderCopy.laneGateTally` already renders in the flow-graph lane, reused
 * rather than re-derived so the two surfaces cannot disagree about one count.
 *
 * Three gate states, as the mockup draws them: PASSED — this stage has already been entered, so whatever it took
 * to get here is history now (`promoted`/`released`/`source`). OPEN — this is
 * the one stage the sequence would promote into next; drawn as open
 * regardless of whether every one of its gates is actually satisfied yet,
 * matching the reference, because this is an at-a-glance overview and the
 * real breakdown is one click away in `ChangeOrderGateList`. CLOSED — everything
 * else, including `gated`: the reference has no separate red connector state,
 * and the node's own dot (`railDot`) still carries that distinction on the
 * stage it sits before, so nothing is lost by folding it into "closed" here.
 * A stage held on review overrides the gate state with the review's tone:
 * HELD while approvals are waiting, BLOCKED once a rejection stands.
 *
 * `aria-hidden`: a sighted-reader overview only. The tally is decorative
 * relative to the accessible tree — `ChangeOrderGateList` is the surface that
 * states a gate's outcome as a fact, once its stage is selected, and duplicating
 * that here would risk the two texts drifting apart.
 *
 * `data-testid` lets tests find the connector.
 *
 * In a draft's `preview`, no gate can have been evaluated: the connector is
 * closed and neutral, with the "0/3" every stage not yet reached shows, and
 * says "3 gates, not evaluated" in words, to assistive technology and on hover,
 * so the figure is not read as three checks made and none passed.
 */
export function StageLink(props: StageLinkProps) {
  if (props.preview === true) {
    return (
      <StageLinkMark
        tone={CLOSED_LINK}
        tally={changeOrderCopy.laneGateTally(0, props.gateCount)}
        hold={null}
        spokenText={changeOrderCopy.laneGatesNotEvaluated(props.gateCount)}
        tooltip={changeOrderCopy.laneGatesNotEvaluated(props.gateCount)}
      />
    );
  }
  const { state, isNext, stagePassed = false, review } = props;
  const passed =
    stagePassed || state.verdict === 'promoted' || state.verdict === 'released' || state.verdict === 'source';
  const open = !passed && isNext;
  const hold = passed ? null : reviewHoldTone(state, isNext, review);
  let tone: StageLinkTone = passed
    ? { bg: changeOrderStatus.successGround, border: changeOrderStatus.successLine, color: changeOrderStatus.success, Icon: LockOpenOutlinedIcon }
    : open
      ? { bg: changeOrderStatus.progressSoft, border: changeOrderStatus.progressLine, color: changeOrderStatus.progress, Icon: ArrowForwardIcon }
      : CLOSED_LINK;
  let tally = changeOrderCopy.laneGateTally(state.gateTally.satisfied, state.gateTally.total);
  if (hold === 'held') {
    tone = { bg: changeOrderStatus.warnSoft, border: changeOrderStatus.warnLine, color: changeOrderStatus.warn, Icon: PersonOutlineOutlinedIcon };
  } else if (hold === 'blocked') {
    tone = { bg: changeOrderStatus.dangerSoft, border: changeOrderStatus.dangerLine, color: changeOrderStatus.danger, Icon: BlockIcon };
    tally = reviewCopy.rail.fail;
  }
  return <StageLinkMark tone={tone} tally={tally} hold={hold} />;
}

interface StageLinkMarkProps {
  tone: StageLinkTone;
  /** The figure under the dot. */
  tally: string;
  hold: 'held' | 'blocked' | null;
  /**
   * What a screen reader hears instead of the drawing. Without it the whole
   * connector is hidden from assistive technology.
   */
  spokenText?: string;
  /** A one-line label on hover. */
  tooltip?: string;
}

/** The connector's drawing: a dot in the gate's tone over its tally. */
function StageLinkMark({ tone, tally, hold, spokenText, tooltip }: StageLinkMarkProps) {
  const drawing = (
    <Box
      aria-hidden="true"
      data-testid="stage-rail-link"
      data-review-hold={hold ?? undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        width: 44,
        flex: '0 0 auto',
      }}
    >
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: '999px',
          display: 'grid',
          placeItems: 'center',
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          color: tone.color,
        }}
      >
        <tone.Icon sx={{ fontSize: 12 }} />
      </Box>
      <Box
        sx={{
          fontFamily: changeOrderFontMono,
          fontSize: changeOrderType.size.micro,
          fontWeight: hold === null ? 600 : 700,
          color: tone.color,
          whiteSpace: 'nowrap',
        }}
      >
        {tally}
      </Box>
    </Box>
  );
  const mark =
    tooltip === undefined ? (
      drawing
    ) : (
      <Tooltip title={tooltip} enterDelay={400} describeChild>
        {drawing}
      </Tooltip>
    );
  if (spokenText === undefined) return mark;
  // The connector's own positioned box holds its hidden text, and stretches like the drawing would.
  return (
    <Box sx={{ position: 'relative', display: 'flex', flex: '0 0 auto' }}>
      <Box component="span" sx={VISUALLY_HIDDEN_SX}>
        {spokenText}
      </Box>
      {mark}
    </Box>
  );
}

/**
 * One step of the rail: the link into a node, and the node. They wrap together.
 * Positioned so the connector's hidden text stays inside the step.
 */
const RAIL_STEP_SX = { position: 'relative', display: 'flex', gap: '10px', alignItems: 'stretch', flex: '0 0 auto' } as const;

/**
 * How a rail node selects its stage: a link to the stage's own address (the
 * detail view keeps its selection in the URL), a button that selects it in
 * place, or neither, when the nodes are not selectable.
 */
export type ChangeOrderStageRailSelection =
  | { hrefForStage: (stageId: string) => string; onSelectStage?: never }
  | { onSelectStage: (stageId: string) => void; hrefForStage?: never }
  | { hrefForStage?: never; onSelectStage?: never };

interface RailDotMarkProps {
  dot: RailDot;
}

function RailDotMark({ dot }: RailDotMarkProps) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 22,
        height: 22,
        borderRadius: '999px',
        flex: '0 0 auto',
        display: 'grid',
        placeItems: 'center',
        background: dot.bg,
        border: `1px solid ${dot.border}`,
        color: dot.color,
      }}
    >
      <dot.Icon sx={{ fontSize: 14 }} />
    </Box>
  );
}

/** A node's own card, whichever way it selects. */
function railNodeSx(selected: boolean, minWidth: number) {
  return {
    textDecoration: 'none',
    /*
      An anchor with no explicit colour computes the user agent's default link
      blue, a value in no palette. Inheriting is not enough: the element itself
      carries the computed colour even when every child overrides it.
    */
    color: changeOrderInk.default,
    fontSize: changeOrderType.size.body,
    minWidth,
    textAlign: 'left',
    /*
      ONE BORDER WIDTH, PLUS A RING. A selected state that thickens its own
      edge shifts its content by a pixel; the inset ring changes colour and
      nothing else.
    */
    // Positioned so the node's hidden text stays inside it.
    position: 'relative',
    border: `${changeOrderShape.borderWidth}px solid ${selected ? changeOrderAction.ink : changeOrderBorder.default}`,
    boxShadow: selected ? changeOrderSelectedRing : 'none',
    borderRadius: `${changeOrderShape.radius.lg}px`,
    padding: '10px 12px',
    background: changeOrderSurface.page,
    display: 'block',
  } as const;
}

interface RailNodeProps {
  stageId: string;
  selected: boolean;
  selection: ChangeOrderStageRailSelection;
  testId?: string;
  minWidth?: number;
  children: ReactNode;
}

/** A link with the button role answers Space as a button does, not by scrolling the page. */
function pressOnSpace(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== ' ') return;
  event.preventDefault();
  event.currentTarget.click();
}

/**
 * One node of the rail. A link to the stage's address, or a button that
 * selects it in place: both selectable forms carry `aria-pressed`, not
 * `aria-expanded`, because selecting a stage rescopes the screen rather than
 * disclosing anything. With no way to select, it is a plain card with neither.
 */
function RailNode({ stageId, selected, selection, testId, minWidth = 150, children }: RailNodeProps) {
  const sx = railNodeSx(selected, minWidth);
  const { onSelectStage, hrefForStage } = selection;
  if (onSelectStage !== undefined) {
    return (
      <Box
        component="button"
        type="button"
        aria-pressed={selected}
        data-testid={testId}
        onClick={() => onSelectStage(stageId)}
        sx={{
          font: 'inherit',
          cursor: 'pointer',
          ...sx,
          // A button centres its content; the link form's content starts at the top.
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'stretch',
          '&:hover': { borderColor: selected ? changeOrderAction.ink : changeOrderBorder.strong },
          '&:focus-visible': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: '2px' },
        }}
      >
        {children}
      </Box>
    );
  }
  if (hrefForStage !== undefined) {
    return (
      <Box
        component={RouterLink}
        to={hrefForStage(stageId)}
        aria-pressed={selected}
        role="button"
        data-testid={testId}
        onKeyDown={pressOnSpace}
        sx={sx}
      >
        {children}
      </Box>
    );
  }
  return (
    <Box data-testid={testId} sx={sx}>
      {children}
    </Box>
  );
}

/** The Complete node's sign-off line: "Sign-off 1/2" while waiting, "Rejected" when a rejection blocks it. */
function SignOffLine({ review, notOpen }: { review: StageReviewRail; notOpen: boolean }) {
  let color: string = changeOrderStatus.warn;
  let Icon: SvgIconComponent = PersonOutlineOutlinedIcon;
  let text: ReactNode = (
    <>
      {reviewCopy.rail.signOff}{' '}
      {/* No server rows for the viewer: no count (#5788). */}
      {/* Before Final opens it is "not open yet", not a permission problem. */}
      {!review.evaluated ? (notOpen ? reviewCopy.rail.finalNotOpen : reviewCopy.rail.notEvaluated) : (
        <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.bold }}>
          {review.passes}/{review.required}
        </Box>
      )}
    </>
  );
  if (review.state === 'rejected') {
    color = changeOrderStatus.danger;
    Icon = BlockIcon;
    text = reviewCopy.rail.rejectedBy(review.rejecterFirstName ?? 'a reviewer');
  } else if (review.state === 'satisfied') {
    color = changeOrderStatus.success;
    Icon = CheckIcon;
  }
  return (
    <Box
      data-testid="stage-rail-signoff"
      data-review-state={review.state}
      sx={{
        marginTop: '8px',
        paddingTop: '8px',
        borderTop: `1px dashed ${changeOrderBorder.default}`,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: changeOrderType.size.small,
        color,
      }}
    >
      <Icon aria-hidden="true" sx={{ fontSize: 12, flex: '0 0 auto' }} />
      <span>{text}</span>
    </Box>
  );
}

/**
 * The review line at the foot of a rail node: "Review 1/2 on security-review"
 * while held, "Rejected by Tom" when blocked, "Reviewed 2/2" when satisfied,
 * and "Review required, 2 requirements" on a later stage.
 */
function StageReviewLine({
  review,
  hold,
  isNext,
}: {
  review: StageReviewRail;
  hold: 'held' | 'blocked' | null;
  isNext: boolean;
}) {
  let Icon: SvgIconComponent = PersonOutlineOutlinedIcon;
  let color: string = changeOrderInk.muted;
  let text: ReactNode = reviewCopy.rail.required(review.requirementCount);
  const fig = (value: string) => (
    <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.bold }}>
      {value}
    </Box>
  );
  if (hold === 'held') {
    color = changeOrderStatus.warn;
    text = (
      <>
        {/* No server rows for the viewer: no count (#5788). */}
        {review.gateKind === 'release' ? reviewCopy.rail.releaseReview : reviewCopy.rail.review}{' '}
        {review.evaluated ? fig(`${review.passes}/${review.required}`) : null}
        {review.primaryName !== undefined ? reviewCopy.rail.reviewOn(review.primaryName) : ''}
      </>
    );
  } else if (hold === 'blocked') {
    Icon = BlockIcon;
    color = changeOrderStatus.danger;
    text = reviewCopy.rail.rejectedBy(review.rejecterFirstName ?? 'a reviewer');
  } else if (isNext && review.state === 'satisfied') {
    Icon = CheckIcon;
    color = changeOrderStatus.success;
    text = (
      <>
        {reviewCopy.rail.reviewed}{' '}
        {review.evaluated ? fig(`${review.passes}/${review.required}`) : null}
      </>
    );
  }
  return (
    <Box
      data-testid="stage-rail-review"
      sx={{
        marginTop: '8px',
        paddingTop: '8px',
        borderTop: `1px dashed ${changeOrderBorder.default}`,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: changeOrderType.size.small,
        color,
      }}
    >
      <Icon aria-hidden="true" sx={{ fontSize: 12, flex: '0 0 auto' }} />
      <span>{text}</span>
    </Box>
  );
}

/** The rail of an existing ChangeOrder: each stage as it stands, with its verdict. */
export interface ChangeOrderStageRailDetailProps {
  preview?: false;
  stageStates: ChangeOrderStageState[];
  /** The steps the ChangeOrder has passed: stage `i` is passed when `i < stagesDone`. */
  stagesDone: number;
  selectedStageId: string | undefined;
  nextStageId: string | null;
  /**
   * How the trailing Complete step reads, or `null` when there is no console
   * row to read it from — an ungoverned ChangeOrder has no `Final` to draw.
   */
  completeTone: CompleteStepTone | null;
  /**
   * Whether the `restored` tone means "abandoned where it stood" rather than
   * "taken back out" — the one thing the tone cannot say for itself.
   */
  completeAbandoned: boolean;
  completeLabel: string;
  completeSelected: boolean;
  /** `Final.Prerequisites` over the last stage's own Spaces — the step's checklist. */
  finalGates: ChangeOrderGate[];
  /**
   * What the source node names, where it is not the base the rest of the page is about:
   * the Spaces a fan-out ChangeOrder's change was made in, or the Invocation an Invoke
   * ChangeOrder runs. Empty otherwise.
   */
  sourceSummary: string;
  /** The review state of every stage with reviews (`useChangeOrderReviews`). */
  reviewRail?: Readonly<Record<string, StageReviewRail>>;
  /** "Waiting on check/healthy" for each gated stage whose gates only wait (`railGateWaits`). */
  gateWaits?: Readonly<Record<string, string>>;
  /** The Final sign-off's review state, for the Complete node. */
  completeReview?: StageReviewRail;
  /** The Final sign-off has no rows because Final is not open yet (PromoteResult.Complete false). */
  completeNotOpen?: boolean;
}

/**
 * The stage rail.
 *
 * ⚠️ DRAWS NO SPACE-TO-SPACE EDGES. That is a ruling, not an omission, and it
 * is recorded here because there is nowhere else it survives: the
 * left-to-right order of the nodes already states the promotion order, so an
 * arrow from every Space of stage N to every Space of stage N+1 restates it
 * once per pair — on a fan-out stage, a thicket of lines carrying no
 * information the order did not already carry. Anyone adding such edges is
 * re-opening a settled call, not filling a gap.
 *
 * The reference DOES draw something between its nodes: a small `.link`
 * connector between each pair (`StageLink`, above), naming the gate's own
 * requirements and whether it is locked, open or passed. A gate connector is
 * not a Space-to-Space edge, so it is not the thicket the ruling refuses — and
 * it reuses the same gate tally the lane head renders rather than inventing a
 * second count of the same thing.
 *
 * Each node is a link to its stage's address with the button role and
 * `aria-pressed` (see `RailNode`), so the URL stays the whole selection state.
 */
function DetailStageRail({
  stageStates,
  stagesDone,
  selectedStageId,
  nextStageId,
  completeTone,
  completeAbandoned,
  completeLabel,
  completeSelected,
  finalGates,
  sourceSummary,
  reviewRail = {},
  gateWaits = {},
  completeReview,
  completeNotOpen,
  hrefForStage,
  onSelectStage,
}: ChangeOrderStageRailDetailProps & ChangeOrderStageRailSelection) {
  const finalTally = tallyGates(finalGates);
  const selection = selectionOf(hrefForStage, onSelectStage);
  return (
    <Box sx={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'stretch' }}>
      {stageStates.map((state, i) => {
        /*
         * Selection is EXCLUSIVE across the whole rail, Complete included. The
         * page falls back to the next stage when the URL names no real stage,
         * which is right for a bare `/change-orders/:space/:slug` and wrong the moment
         * Complete is the thing selected: two ringed nodes say two things are
         * selected when one is.
         */
        const selected = !completeSelected && state.stageId === selectedStageId;
        const isSource = state.verdict === 'source';
        /*
         * A stage's gates hold back only a change that has not entered it yet.
         * Once every Space of the stage has taken the change — promoted,
         * released, or since restored — its gates are holding nothing, whatever
         * they read now.
         */
        const entered =
          state.verdict === 'promoted' ||
          state.verdict === 'released' ||
          state.verdict === 'restored' ||
          state.verdict === 'restore-released';
        const held =
          !isSource && !entered && state.spaceCount > 0 && state.gates.length > 0 && !state.gatesOpen;
        const isNext = state.stageId === nextStageId;
        const rail = reviewRail[state.stageId];
        // A release review is for a promoted stage; an entry review only for a stage still ahead.
        let review: StageReviewRail | undefined;
        if (rail?.gateKind === 'release') review = state.verdict === 'promoted' ? rail : undefined;
        else review = isSource || entered || i < stagesDone ? undefined : rail;
        const gateWait = held ? gateWaits[state.stageId] : undefined;
        const dot = railDot(state, isNext, i < stagesDone, review, gateWait !== undefined);
        const hold = reviewHoldTone(state, isNext, review);
        const stageLabel = railStageLabel(state, isNext, review, gateWait);
        return (
          /* The link and the node it leads into wrap as one step, so a link is
             never left at the end of a row with its node on the next. */
          <Box data-testid="stage-rail-step" sx={RAIL_STEP_SX} key={state.stageId}>
            {/* One `StageLink` per pair, never before the first node — the
                source has no gate of its own to describe. */}
            {i > 0 && (
              <StageLink state={state} isNext={isNext} stagePassed={i < stagesDone} review={review} />
            )}
            <RailNode stageId={state.stageId} selected={selected} selection={selection}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RailDotMark dot={dot} />
                <Box sx={{ fontSize: changeOrderType.size.prose, fontWeight: 600, color: changeOrderInk.default }}>
                  {stageDisplayName(state.stageId, state.verdict === 'source')}
                </Box>
              </Box>
              {isSource && sourceSummary !== '' ? (
                <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.default }}>
                  {sourceSummary}
                </Box>
              ) : null}
              {/* `label` and `progress` are composed by the shared derivation, so
                  the rail and every other surface say the same thing about a
                  stage rather than each phrasing it. */}
              <Box
                sx={{
                  fontSize: changeOrderType.size.small,
                  color: hold === null ? changeOrderInk.muted : dot.color,
                  fontWeight: hold === null ? undefined : changeOrderType.weight.strong,
                }}
              >
                {stageLabel}
              </Box>
              <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
                {state.progress}
                {/*
                  A closed padlock means HELD, never FAILED. `tallyGates` cannot
                  tell a gate that was evaluated and failed from one never
                  evaluated, so any negative framing here would assert an
                  assessment the data cannot support.
                */}
                {held && hold === null && gateWait === undefined ? ' · held' : ''}
              </Box>
              {review !== undefined ? <StageReviewLine review={review} hold={hold} isNext={isNext} /> : null}
            </RailNode>
          </Box>
        );
      })}

      {/*
        THE TRAILING NODE: the ChangeWorkflow's `Final` completion checklist.

        Not a ChangeOrder stage, and drawn as its own node precisely because it is
        not one. Every node to its left is entered by satisfying gates over the
        stage BEFORE it; this one asks the LAST stage about ITSELF — "has the
        whole ChangeOrder landed". With no node of its own, an unsatisfied `Final`
        had nowhere to be seen: the rail ended on a stage that had taken the
        change, and the checklist still holding the ChangeOrder open was off-screen.

        Nothing follows it, so it offers no Promote and no Release — see
        `CompleteStepDetail`.

        The connector in front of it is therefore never `isNext`: `StageLink`
        draws that state as the one gate the sequence would promote INTO next,
        and nothing is ever entered here. `completeLinkState` supplies the rest
        — passed once the change has reached this step, closed while a stage is
        still ahead or the ChangeOrder was taken back out — never an inviting arrow
        in front of a ChangeOrder nobody can promote.
      */}
      {completeTone !== null ? (
        <Box data-testid="stage-rail-step" sx={RAIL_STEP_SX}>
          <StageLink state={completeLinkState(completeTone, finalGates, finalTally)} isNext={false} />
          <RailNode
            stageId={COMPLETE_STAGE_ID}
            selected={completeSelected}
            selection={selection}
            testId="stage-rail-complete"
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RailDotMark dot={completeRailDot(completeTone, completeAbandoned)} />
              <Box sx={{ fontSize: changeOrderType.size.prose, fontWeight: 600, color: changeOrderInk.default }}>
                {COMPLETE_STEP_LABEL}
              </Box>
            </Box>
            <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>{completeLabel}</Box>
            <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
              {changeOrderCopy.laneGateTally(finalTally.satisfied, finalTally.total)}
            </Box>
            {completeReview !== undefined ? <SignOffLine review={completeReview} notOpen={completeNotOpen === true} /> : null}
          </RailNode>
        </Box>
      ) : null}
    </Box>
  );
}

/** One stage of a draft's rail, before the ChangeOrder exists. */
export interface ChangeOrderStageRailPreviewStage {
  stageId: string;
  isSource: boolean;
  /** Variants the stage selects. */
  variantCount: number;
  /**
   * The dry run's outcome over those variants. Absent while it has not landed,
   * or when it could not be read: the node then draws no bar rather than a guess.
   */
  segments?: readonly OutcomeBarSegment[];
  /** The gates into the stage. None can be evaluated before the ChangeOrder exists. */
  gateCount: number;
}

/**
 * A draft's rail. A draft has no verdicts to report, so its nodes carry no
 * verdict labels: each stage shows how many variants it selects and how the
 * dry run says they come out, and every gate reads as not evaluated.
 */
export interface ChangeOrderStageRailPreviewProps {
  preview: true;
  stages: readonly ChangeOrderStageRailPreviewStage[];
  /** The selected node: a stage's id, or `COMPLETE_STAGE_ID` for the Complete step. */
  selectedStageId: string | undefined;
  /** The source node's one line, such as how many changes the draft carries. Empty for none. */
  sourceSummary: string;
  /** A line under it, in words: "Change defined" for a change that runs as each stage is promoted. */
  sourceVerdict?: string;
  /** The trailing Complete step: how many `Final` prerequisites guard it. `null` with no workflow. */
  complete: { gateCount: number } | null;
}

export type ChangeOrderStageRailProps = (ChangeOrderStageRailDetailProps | ChangeOrderStageRailPreviewProps) &
  ChangeOrderStageRailSelection;

function selectionOf(
  hrefForStage: ((stageId: string) => string) | undefined,
  onSelectStage: ((stageId: string) => void) | undefined,
): ChangeOrderStageRailSelection {
  if (onSelectStage !== undefined) return { onSelectStage };
  if (hrefForStage !== undefined) return { hrefForStage };
  return {};
}

const PREVIEW_NODE_MIN_WIDTH = 160;

function previewDot(stage: ChangeOrderStageRailPreviewStage): RailDot {
  const closed = { bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
  if (stage.isSource) return { Icon: EditNoteOutlinedIcon, ...closed };
  // A stage that selects no Space has nothing of its own to hold back.
  if (stage.variantCount === 0) return { Icon: RemoveIcon, ...closed };
  return { Icon: LockOutlinedIcon, ...closed };
}

function PreviewStageRail({
  stages,
  selectedStageId,
  sourceSummary,
  sourceVerdict,
  complete,
  hrefForStage,
  onSelectStage,
}: ChangeOrderStageRailPreviewProps & ChangeOrderStageRailSelection) {
  const selection = selectionOf(hrefForStage, onSelectStage);
  const completeSelected = selectedStageId === COMPLETE_STAGE_ID;
  return (
    <Box sx={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'stretch' }}>
      {stages.map((stage, i) => {
        const selected = !completeSelected && stage.stageId === selectedStageId;
        const segments = stage.segments;
        return (
          <Box data-testid="stage-rail-step" sx={RAIL_STEP_SX} key={stage.stageId}>
            {i > 0 && <StageLink preview gateCount={stage.gateCount} />}
            <RailNode stageId={stage.stageId} selected={selected} selection={selection} minWidth={PREVIEW_NODE_MIN_WIDTH}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RailDotMark dot={previewDot(stage)} />
                <Box sx={{ fontSize: changeOrderType.size.prose, fontWeight: 600, color: changeOrderInk.default }}>
                  {stageDisplayName(stage.stageId, stage.isSource)}
                </Box>
                {stage.isSource ? null : (
                  <Box
                    component="span"
                    data-testid="stage-rail-variant-count"
                    sx={{
                      position: 'relative',
                      marginLeft: 'auto',
                      fontSize: changeOrderType.size.small,
                      color: changeOrderInk.subtle,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {stage.variantCount}
                    <Box component="span" sx={VISUALLY_HIDDEN_SX}>
                      {stage.variantCount === 1 ? ' variant' : ' variants'}
                    </Box>
                  </Box>
                )}
              </Box>
              {stage.isSource && sourceSummary !== '' ? (
                <Box
                  sx={{
                    fontSize: changeOrderType.size.small,
                    color: changeOrderInk.default,
                    fontFamily: changeOrderFontMono,
                    marginTop: '4px',
                  }}
                >
                  {sourceSummary}
                </Box>
              ) : null}
              {stage.isSource && sourceVerdict !== undefined ? (
                <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted, marginTop: '2px' }}>{sourceVerdict}</Box>
              ) : null}
              {!stage.isSource && segments !== undefined && stage.variantCount > 0 ? (
                <>
                  <OutcomeBar segments={segments} height={6} sx={{ marginTop: '8px', minWidth: 120 }} />
                  <Box component="span" sx={VISUALLY_HIDDEN_SX}>
                    {segments.map((segment) => `${segment.count} ${OUTCOME_META[segment.kind].label}`).join(', ')}
                  </Box>
                </>
              ) : null}
            </RailNode>
          </Box>
        );
      })}
      {complete !== null ? (
        <Box data-testid="stage-rail-step" sx={RAIL_STEP_SX}>
          <StageLink preview gateCount={complete.gateCount} />
          <RailNode
            stageId={COMPLETE_STAGE_ID}
            selected={completeSelected}
            selection={selection}
            testId="stage-rail-complete"
            minWidth={PREVIEW_NODE_MIN_WIDTH}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RailDotMark
                dot={{ Icon: LockOutlinedIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle }}
              />
              <Box sx={{ fontSize: changeOrderType.size.prose, fontWeight: 600, color: changeOrderInk.default }}>
                {COMPLETE_STEP_LABEL}
              </Box>
            </Box>
          </RailNode>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * The stage rail: the source, each stage of the workflow, and the trailing
 * Complete step, joined by the gate into each. An existing ChangeOrder's rail
 * reports each stage's verdict; a draft's (`preview`) reports the dry run.
 */
export function ChangeOrderStageRail(props: ChangeOrderStageRailProps) {
  if (props.preview === true) return <PreviewStageRail {...props} />;
  return <DetailStageRail {...props} />;
}

/**
 * The connector into the Complete step, expressed in the one shape `StageLink`
 * reads.
 *
 * `StageLink` describes the gate INTO the node on its right, and for this node
 * that gate is `Final` — so it carries `Final`'s own gates and tally rather
 * than the last stage's entry gates, which are a different check over a
 * different set of Spaces.
 *
 * ⚠️ THE VERDICT HERE MEANS ARRIVED, NOT VERIFIED. Every other connector on the
 * rail is handed the state of the node to its RIGHT, so a green open padlock
 * says only "the change reached the node past me" — a stage that landed and
 * then went degraded still carries `released` and still draws green, and the
 * gate tally beside it is text that never touches the colour. This connector
 * sits in the same row and must answer the same question, so `released` is
 * carried for every tone that implies the change got here (`gated` is the only
 * tone with a stage still ahead, and `restored` is terminal without ever having
 * landed) and `unknown` for those two. Whether `Final` was actually satisfied is
 * the stronger, separate claim, and the step's own dot is where it is made
 * (`completeRailDot`). Nothing reads this object but `StageLink`.
 */
function completeLinkState(
  tone: CompleteStepTone,
  gates: ChangeOrderGate[],
  tally: ChangeOrderGateTally,
): ChangeOrderStageState {
  return {
    stageId: COMPLETE_STAGE_ID,
    verdict: tone === 'gated' || tone === 'restored' ? 'unknown' : 'released',
    label: '',
    progress: '',
    promotedCount: 0,
    restoredCount: 0,
    inFlightCount: 0,
    spaceCount: 0,
    gates,
    gateTally: tally,
    /*
      Required by `ChangeOrderStageState` and read by nothing on this path, so it is
      taken from the checklist it carries rather than inferred from the tone — a
      field nobody reads is the easiest place for a false claim to survive.
    */
    gatesOpen: gatesOpen(gates),
  };
}
