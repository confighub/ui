// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Fleet-wide ChangeOrders console and ChangeOrder detail: every change in motion across
 * the org, the stage it has reached, and what promoting it would do.
 *
 * Built against `7-typographic.html` in `design-mockups/change-order-promotions/`.
 *
 * ⚠️ THIS IS A PARTIAL BUILD AND EVERY GAP IS MARKED. Regions that are not yet
 * implemented render an explicit `Stub` band naming what is missing and why.
 * That is deliberate and it is the one rule this file must keep: a placeholder
 * that looks finished is indistinguishable from a finished region, and a review
 * that cannot tell them apart is worth nothing. Nothing here renders invented
 * data to fill a space.
 *
 * ANCHORING IS A BUILD REQUIREMENT, NOT A TEST ARTEFACT
 * (`tools/design-fidelity/ANCHOR-REQUIREMENTS.md`). The fidelity contract binds
 * to real roles and accessible names — never to class names — so a region with
 * no role and no name is permanently unmeasurable rather than merely untested.
 * Every section below carries a landmark and a name for that reason.
 *
 * A KNOWN RISK RIDES ON EVERY PROMOTE THIS FILE OFFERS: a promotion gate can
 * report itself satisfied when a Space has not received the change. Stated in
 * full beside the promote state below, where the affordance is.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import FolderCopyOutlinedIcon from '@mui/icons-material/FolderCopyOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import SyncAltOutlinedIcon from '@mui/icons-material/SyncAltOutlined';
import UpdateOutlinedIcon from '@mui/icons-material/UpdateOutlined';

import { INFO_PEEK_TOOLTIP_SX } from '@/components/info-peek/InfoPeek';
import { ChangeOrderGateList } from '../x/apps/change-order/ChangeOrderGateList';
import { gateStateFor, partitionBlockingGates, tallyGates } from '../x/apps/change-order/changeOrderGates';
import { gatesBlockPromotion } from '../x/apps/change-order/changeOrderFooterModel';
import { changeOrderCopy, stageDisplayName } from '../x/apps/change-order/changeOrderCopy';
import { changeOrdersConsoleCopy } from '../x/apps/change-order/changeOrdersConsoleCopy';
import { changeOrderOwnSpaceReached, promotionTargets } from '../x/apps/change-order/changeOrderStages';
import { componentSpaceDeepLink } from '../x/apps/change-order/changeOrdersConsoleModel';
import { unitLinksHref } from '../unit-detail/unitDetailHrefs';
import type { ConsoleState } from '../x/apps/change-order/changeOrdersConsoleModel';
import type { ChangeOrderGate, ChangeOrderStage } from '../x/apps/change-order/changeOrderTypes';
import { TreeDiffSection } from '../x/apps/TreeDiffSection';
import { ROUTE_COMPONENTS } from '../x/apps/appTypes';
import { componentTheme } from '../x/apps/componentTheme';
import type { MergedUnit } from '../x/apps/componentTypes';
import { ChangeOrderUnitHeader } from '../x/apps/change-order/ChangeOrderUnitHeader';
import Button from '@mui/material/Button';

import { EndChangeOrderDialog } from '../x/apps/change-order/EndChangeOrderDialog';
import { hasPromotionPath, changeOrderIntents } from '../x/apps/change-order/changeOrdersConsoleModel';
import type { ChangeOrderEndIntent } from '../x/apps/change-order/changeOrderRollback';
import { useEndChangeOrder } from '../x/apps/change-order/useEndChangeOrder';
import { promoteAnnouncement, useChangeOrderActions } from '../x/apps/change-order/useChangeOrderActions';
import { PromoteDialog } from './components/PromoteDialog';
import { InvocationSourceDetails } from './components/InvocationSourceDetails';
import { ChangeOrderHistory, ChangeOrderLastActivity } from './components/ChangeOrderHistory';
import { ChangeOrdersConsole } from './ChangeOrdersConsole';
import {
  COMPLETE_STAGE_ID,
  COMPLETE_STEP_LABEL,
  buildCompleteConsoleStage,
  completeStepTone,
  isCompleteStepAbandoned,
  type CompleteStepTone,
} from './changeOrderCompleteStep';
import { buildChangeOrderOutcome, carriedResourceKeysOf, partitionShortfall } from './changeOrderOutcome';
import { cardRepresentativeUnits, cardSpaceLabel, rowRefusals } from './changeOrderCard';
import { partitionSourceUnitsByChange, useChangeOrderConsoleChanges } from './useChangeOrderConsoleChanges';
import {
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderInk,
  changeOrderFontMono,
  changeOrderFontSans,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from './changeOrdersTokens';
import { ChangeOrderBlockedResources, ChangeOrderRefusals } from './changeOrderRefusals';
import { changeOrderPath } from './changeOrderAddress';
import { useSharedDiffColumns } from './useSharedDiffColumns';
import { UnitDiffRow } from './components/UnitDiffRow';
import { Fact, FactLink, OpenedAt, StateChip, SummaryCard } from './components/SummaryFacts';
import { useChangeOrderDetail, type ChangeOrderSpace } from './useChangeOrderDetail';
import { useChangeOrderImageChanges } from './useChangeOrderImageChanges';
import { useChangeOrderChangeSets } from './useChangeOrderChangeSets';
import { ChangeOrderChangeSets } from './components/ChangeOrderChangeSets';
import { FullDiffDisclosure, ImageChangeSummary } from './components/ImageChangeHero';
import { onlyChangesHint } from './imageChangeCopy';
import { imageChangesForSource } from './imageChange';
import Snackbar from '@mui/material/Snackbar';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { ReviewBand, type ReviewBandAction } from './reviews/ReviewBand';
import { ReviewChip, ReviewEntryStatus, ReviewGateActions, ReviewGateBlockedLine, ReviewGateSpaces } from './reviews/reviewParts';
import type { ChangeOrderGateExtra } from '../x/apps/change-order/ChangeOrderGateList';
import { recordedToastText, reviewCopy, reviewFeeds, reviewSubject } from './reviews/reviewCopy';
import { reviewCardStageId, reviewFormStageId, stageChangeLanded } from './reviews/stageReviewInputs';
import { REVIEW_PANEL_ID, ReviewPanel } from './reviews/ReviewPanel';
import { withReviewApprovers } from './reviews/changeOrderReviews';
import type {
  PromoteReadiness,
  ReviewChoice,
  ReviewGateRef,
  StageReviewSummary,
  SubmitReviewOutcome,
} from './reviews/changeOrderReviewTypes';
import { useChangeOrderReviews, useGateReviews } from './reviews/useStageReviews';
import { useChangeOrderHistory } from './useChangeOrderHistory';
import { changeWorkflowHref, changeWorkflowLabel, useChangeWorkflowNames } from './useChangeWorkflowNames';
import { GateDisclosure } from './components/GateDisclosure';
import { OutcomeBreakdown } from './components/OutcomeBar';
import { outcomeSegments } from './components/outcomeMeta';
import { OutcomeGroupCards, type OutcomeCardContext } from './components/OutcomeGroupCards';
import { OutcomeUnknownNote } from './components/OutcomeUnknownNote';
import { OutcomeUnitDiff } from './components/OutcomeUnitDiff';
import { PassedOver } from './components/PassedOver';
import { SequenceProblems } from './components/SequenceProblems';
import { ChangeOrderStageRail } from './components/ChangeOrderStageRail';
import { completeRailDot, railDot } from './components/railDots';

/**
 * The header status chip's own tone, per `ConsoleState`.
 *
 * ⚠️ THE CHIP MUST BE TONED BY STATE, not by a single accent. Every state
 * renders through this one chip, so a constant colour makes a degraded ChangeOrder
 * and a healthy one indistinguishable at the spot a reader looks first.
 *
 * The same mapping `ChangeOrdersConsole.tsx`'s `STATE_INK` holds, spelt out again
 * rather than imported. Both resolve to the shared `changeOrderStatus`/`changeOrderInk`
 * tokens, which is where the two are actually kept in step; importing one
 * page's private constant into the other would couple two screens that only
 * happen to agree.
 */
const CONSOLE_STATE_TONE: Record<ConsoleState, string> = {
  ready: changeOrderStatus.accent,
  degraded: changeOrderStatus.danger,
  blocked: changeOrderStatus.warn,
  held: changeOrderStatus.warn,
  progressing: changeOrderStatus.accent,
  complete: changeOrderStatus.success,
  'complete-unverified': changeOrderInk.subtle,
  aborted: changeOrderInk.subtle,
  'no-workflow': changeOrderStatus.warn,
  'no-stages': changeOrderStatus.warn,
  unknown: changeOrderInk.subtle,
};

/** The `--root` target for `check.mjs`. One stable selector, per U1. */
/** A Final gate's reason once the server reports the ChangeWorkflow complete. */
const WORKFLOW_COMPLETED_REASON = 'Satisfied: the server reports this ChangeWorkflow as complete.';

export const CHANGE_ORDERS_ROOT_ID = 'change-orders-root';

function reviewRequirementOf(gate: ChangeOrderGate, summary: StageReviewSummary) {
  return summary.requirements.find(
    (r) => gate.prerequisite === r.name || gate.id === `attestation-prerequisite:${r.name}`,
  );
}

/** The workflow author's description of a review gate, when its reason ends with it. */
function reviewGateDescription(gate: ChangeOrderGate): string | undefined {
  const description = gate.description?.trim();
  if (description === undefined || description === '') return undefined;
  return gate.reason.endsWith(description) ? description : undefined;
}

/**
 * The review gates of a stage, ready for `ChangeOrderGateList`: the reviewers as
 * approvers (`withReviewApprovers`), and the server's message as a sentence
 * of its own. `applyServerGates` joins the message and the workflow author's
 * description with a space and no full stop; the description goes on its own
 * line under the reason instead (`reviewGateExtras`).
 */
function reviewGatesForList(gates: ChangeOrderGate[], summary: StageReviewSummary): ChangeOrderGate[] {
  return withReviewApprovers(gates, summary).map((gate) => {
    const description = reviewGateDescription(gate);
    if (reviewRequirementOf(gate, summary) === undefined || description === undefined) return gate;
    const message = gate.reason.slice(0, gate.reason.length - description.length).trim();
    if (message === '') return gate;
    return { ...gate, reason: /[.!?]$/.test(message) ? message : `${message}.` };
  });
}

/**
 * The extra content of each review gate row in `ChangeOrderGateList`, keyed by
 * gate id, matched the way `withReviewApprovers` matches gates.
 */
function reviewGateExtras(
  gates: readonly ChangeOrderGate[],
  summary: StageReviewSummary,
  /** Undefined while no card has the review's form: the rows then have no link. */
  onReview: (() => void) | undefined,
  reviewLabel?: string,
  /** The stage `reviewLabel` names. */
  reviewLabelStage?: string,
): Record<string, ChangeOrderGateExtra> {
  const extras: Record<string, ChangeOrderGateExtra> = {};
  for (const gate of gates) {
    const requirement = reviewRequirementOf(gate, summary);
    if (requirement === undefined) continue;
    extras[gate.id] = {
      hideApprovers: true,
      below: (
        <>
          {reviewGateDescription(gate) !== undefined ? (
            <Box sx={{ marginTop: '2px', fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, lineHeight: changeOrderType.lineHeight.body }}>
              {reviewGateDescription(gate)}
            </Box>
          ) : null}
          <ReviewGateSpaces requirement={requirement} />
        </>
      ),
      right: <ReviewGateActions requirement={requirement} onReview={onReview} label={reviewLabel} labelStage={reviewLabelStage} />,
    };
  }
  return extras;
}

/**
 * The text of a review chip, for the gate's kind and the stage's readiness.
 * "Ready to promote" only when `PromoteReadiness` is `ready` (M5): complete
 * reviews with another gate still holding read "Reviews complete".
 */
function reviewChipText(
  summary: StageReviewSummary,
  readiness: PromoteReadiness | undefined,
  words: { waiting: string; rejected: string },
): { tone: 'bad' | 'accent' | 'ok' | 'warn'; text: string } {
  if (summary.state === 'rejected') return { tone: 'bad', text: words.rejected };
  const kind = summary.gate.kind;
  if (summary.open) {
    if (kind === 'entry' && readiness?.kind === 'ready') return { tone: 'accent', text: reviewCopy.summaryChip.ready };
    return { tone: 'ok', text: reviewCopy.summaryChip.reviewsComplete };
  }
  if (kind === 'release') return { tone: 'warn', text: reviewCopy.summaryChip.releaseWaiting };
  if (kind === 'final') return { tone: 'warn', text: reviewCopy.summaryChip.signOffWaiting };
  return { tone: 'warn', text: words.waiting };
}

/** The summary chip while a gate is held on review, in place of the console state. */
function ReviewSummaryChip({ summary, readiness }: { summary: StageReviewSummary; readiness?: PromoteReadiness }) {
  const chip = reviewChipText(summary, readiness, {
    waiting: reviewCopy.summaryChip.waiting,
    rejected: reviewCopy.summaryChip.rejected,
  });
  return (
    <ReviewChip tone={chip.tone} dot>
      {chip.text}
    </ReviewChip>
  );
}

/** The selected stage's chip while it has reviews. */
function ReviewStageChip({ summary, readiness }: { summary: StageReviewSummary; readiness?: PromoteReadiness }) {
  const chip = reviewChipText(summary, readiness, { waiting: reviewCopy.stage.held, rejected: reviewCopy.stage.rejected });
  return (
    <ReviewChip tone={chip.tone} dot>
      {chip.text}
    </ReviewChip>
  );
}

/** "Next: prod-eu", or with the review state when the next stage's entry gate has reviews. */
function nextStageHint(stage: string, summary: StageReviewSummary | undefined, readiness: PromoteReadiness | undefined): string {
  if (summary === undefined || summary.gate.kind !== 'entry') return `Next: ${stage}`;
  if (summary.state === 'rejected') return reviewCopy.progressHint.rejected(stage);
  if (summary.open && readiness?.kind === 'ready') return reviewCopy.progressHint.ready(stage);
  if (summary.open) return reviewCopy.progressHint.reviewsComplete(stage);
  return reviewCopy.progressHint.held(stage);
}

/**
 * The Scope fact: how many Spaces the ChangeOrder is headed for, with the Spaces
 * themselves one hover or keyboard focus away.
 *
 * The list reads in the order the ChangeOrder travels. A Space sorts by the first
 * stage whose `WhereSpace` selected it, the same membership the rest of this
 * page draws, so the base Space (the source stage's one member) comes first.
 * A Space no stage selected comes last. Slug orders the Spaces within each
 * group. The muted text names the stage, or the Space's `Stage` label when no
 * stage selected it.
 *
 * The popper renders in place rather than in a portal, so Tab from the count
 * moves into the links. `open` is controlled so the list stays open while focus
 * is inside it: MUI closes a tooltip when its trigger loses focus, and would
 * otherwise close it under the link that just took the focus.
 */
function ScopeSpaces({ spaces, stages }: { spaces: ChangeOrderSpace[]; stages: ChangeOrderStage[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const rows = useMemo(() => {
    // A real stage before the synthetic source row: a base a stage's selector
    // covers is promoted (or gated on) in that stage, which is the fact worth
    // naming. `viewerPositionIn` places a Space the same way.
    const firstStage = new Map<string, ChangeOrderStage>();
    for (const stage of stages) {
      if (stage.isSource) continue;
      for (const spaceId of stage.spaceIds) {
        if (!firstStage.has(spaceId)) firstStage.set(spaceId, stage);
      }
    }
    for (const stage of stages) {
      if (!stage.isSource) continue;
      for (const spaceId of stage.spaceIds) {
        if (!firstStage.has(spaceId)) firstStage.set(spaceId, stage);
      }
    }
    return spaces
      .map((space) => {
        const stage = firstStage.get(space.spaceId);
        return {
          space,
          rank: stage?.index ?? Number.MAX_SAFE_INTEGER,
          stageName: stage ? stageDisplayName(stage.id, stage.isSource) : space.labels?.Stage,
        };
      })
      .sort((a, b) => a.rank - b.rank || a.space.slug.localeCompare(b.space.slug));
  }, [spaces, stages]);

  const label = `${spaces.length} ${spaces.length === 1 ? 'Space' : 'Spaces'}`;
  if (spaces.length === 0) return <>{label}</>;

  const inList = (node: EventTarget | null) => node instanceof Node && (listRef.current?.contains(node) ?? false);

  const handleClose = (event: Event | React.SyntheticEvent) => {
    if (event.type === 'keydown') {
      // Escape. Focus goes back to the count before the list unmounts under it.
      if (inList(document.activeElement)) triggerRef.current?.focus();
      setOpen(false);
      return;
    }
    const next = event.type === 'blur' ? (event as React.FocusEvent).relatedTarget : document.activeElement;
    if (!inList(next)) setOpen(false);
  };

  const handleListBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget;
    if (inList(next) || next === triggerRef.current) return;
    setOpen(false);
  };

  const list = (
    <Box
      component="ul"
      ref={listRef}
      data-testid="change-order-scope-spaces-list"
      aria-label="In-scope Spaces"
      onBlur={handleListBlur}
      sx={{
        listStyle: 'none',
        margin: 0,
        padding: '6px 0',
        maxHeight: 320,
        overflowY: 'auto',
        minWidth: 200,
        fontFamily: changeOrderFontSans,
        fontSize: changeOrderType.size.body,
        lineHeight: changeOrderType.lineHeight.body,
      }}
    >
      {rows.map(({ space, stageName }) => (
        <Box
          component="li"
          key={space.spaceId}
          sx={{ display: 'flex', alignItems: 'baseline', gap: '12px', padding: '3px 12px' }}
        >
          <Box sx={{ minWidth: 0, flex: 1, color: changeOrderInk.default, overflowWrap: 'anywhere' }}>
            <FactLink href={`/spaces/${space.spaceId}`}>{space.displayName || space.slug}</FactLink>
          </Box>
          {stageName && (
            <Box component="span" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
              {stageName}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );

  return (
    <Tooltip
      title={list}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={handleClose}
      describeChild
      placement="bottom-start"
      slotProps={{ tooltip: { sx: INFO_PEEK_TOOLTIP_SX }, popper: { disablePortal: true } }}
    >
      <Box
        component="button"
        ref={triggerRef}
        type="button"
        data-testid="change-order-scope-spaces"
        aria-label={`Show the ${label} in scope`}
        sx={{
          font: 'inherit',
          color: 'inherit',
          background: 'none',
          border: 0,
          padding: 0,
          cursor: 'help',
          textDecoration: 'underline dotted',
          textDecorationColor: changeOrderBorder.strong,
          textUnderlineOffset: '3px',
          '&:focus-visible': {
            outline: `2px solid ${changeOrderStatus.accent}`,
            outlineOffset: 2,
            borderRadius: `${changeOrderShape.radius.xs}px`,
          },
        }}
      >
        {label}
      </Box>
    </Tooltip>
  );
}

/**
 * The Complete step's own panel: what the ChangeWorkflow's `Final` checklist
 * says, and nothing else.
 *
 * ⚠️ NO PROMOTE AND NO RELEASE, DELIBERATELY. Every stage panel on this screen
 * ends in an action because a stage is something the change moves INTO. Nothing
 * follows Complete — it is the checklist that decides whether the ChangeOrder is
 * finished, not another destination — so an action here would offer a promotion
 * with nowhere to go.
 *
 * THE LIST IS NEVER BLANK FOR A GOVERNED CHANGEORDER. `buildGatesForStage` always
 * injects the mandatory landed check, so a workflow declaring no `Final`
 * prerequisites still shows that one, and the step reads unverified rather than
 * quietly finished. An empty list means nothing governs this ChangeOrder at all.
 */
function CompleteStepDetail({
  label,
  gates,
  signOff,
}: {
  label: string;
  gates: ChangeOrderGate[];
  /**
   * The Final sign-off, when `Final.Prerequisites` names a review: its chip,
   * the gate rows' reviewer extras, and the panel. The card then has the same
   * two columns as a stage card, with the panel on the right.
   */
  signOff?: {
    summary: StageReviewSummary;
    extras: Record<string, ChangeOrderGateExtra>;
    panel: React.ReactNode;
  };
}) {
  const listGates = signOff === undefined ? gates : reviewGatesForList(gates, signOff.summary);
  return (
    <Box
      component="section"
      role="region"
      aria-label={COMPLETE_STEP_LABEL}
      data-testid="complete-step-detail"
      sx={{
        marginTop: '20px',
        background: changeOrderSurface.card,
        border: `1px solid ${changeOrderBorder.default}`,
        borderRadius: `${changeOrderCardTokens.radius}px`,
        boxShadow: changeOrderCardTokens.shadow,
        // `clip`, not `hidden`, so the sticky sign-off panel can stick.
        overflow: 'clip',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          padding: '14px 20px',
          background: changeOrderSurface.sunk,
          borderBottom: `1px solid ${changeOrderBorder.default}`,
        }}
      >
        <Box
          component="h2"
          sx={{
            fontSize: changeOrderType.size.heading,
            lineHeight: changeOrderType.lineHeight.heading,
            fontWeight: changeOrderType.weight.semibold,
            fontFamily: changeOrderFontMono,
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {COMPLETE_STEP_LABEL}
        </Box>
        {signOff !== undefined ? <ReviewStageChip summary={signOff.summary} /> : <StateChip label={label} tone={changeOrderInk.muted} />}
        {signOff !== undefined ? (
          <Box component="span" sx={{ marginLeft: 'auto', fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>
            {reviewCopy.stage.signOffEvaluatedOver}{' '}
            <Box component="span" sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.muted }}>
              {signOff.summary.gateSpaces.map((space) => space.spaceSlug).join(', ')}
            </Box>
          </Box>
        ) : null}
      </Box>

      <Box
        sx={
          signOff !== undefined
            ? {
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 384px',
                alignItems: 'start',
                '@media (max-width: 1179.98px)': { gridTemplateColumns: 'minmax(0,1fr)' },
              }
            : undefined
        }
      >
      <Box sx={{ padding: '18px 20px 22px', minWidth: 0 }}>
        {/*
          Says which question these checks answer, because it is NOT the one
          every other gate list on this screen answers. A stage's gates are
          entry gates over the stage before it; these are checked over the last
          stage's OWN Spaces.
        */}
        <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted, marginBottom: '12px' }}>
          The ChangeWorkflow&rsquo;s final prerequisites, checked over the last stage&rsquo;s
          own Spaces. They decide whether this ChangeOrder is finished. Nothing is promoted after this
          step.
        </Box>
        {gates.length === 0 ? (
          <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
            No ChangeWorkflow governs this ChangeOrder, so there is no final checklist to report.
          </Box>
        ) : (
          <Box
            sx={{
              border: `1px solid ${changeOrderBorder.default}`,
              borderRadius: `${changeOrderShape.radius.md}px`,
              overflow: 'hidden',
            }}
          >
            <ChangeOrderGateList
              stageId={COMPLETE_STAGE_ID}
              gates={listGates}
              isSource={false}
              extras={signOff?.extras}
            />
          </Box>
        )}
      </Box>
      {signOff !== undefined ? (
        <Box
          sx={{
            borderLeft: `1px solid ${changeOrderBorder.default}`,
            alignSelf: 'stretch',
            minWidth: 0,
            '@media (max-width: 1179.98px)': { borderLeft: 0, borderTop: `1px solid ${changeOrderBorder.default}` },
          }}
        >
          <Box sx={{ position: 'sticky', top: 16, '@media (max-width: 1179.98px)': { position: 'static' } }}>
            {signOff.panel}
          </Box>
        </Box>
      ) : null}
      </Box>
    </Box>
  );
}

export default function ChangeOrdersPage() {
  const { space, slug, stage } = useParams<{ space?: string; slug?: string; stage?: string }>();
  const navigate = useNavigate();
  const { search, hash } = useLocation();
  const detail = useChangeOrderDetail({ space, slug, stage });
  const { address } = detail;
  /** Whether the URL addresses a ChangeOrder at all, rather than the console. */
  const addressed = address?.kind !== 'none';
  /** The stage segment, wherever the address form put it. */
  const stageParam = address?.kind === 'found' ? address.stage : undefined;

  /*
   * A slug-only link that names one ChangeOrder is replaced with its full
   * address, so a bookmark made from it keeps opening the same ChangeOrder after
   * another Space takes the slug too.
   */
  useEffect(() => {
    if (address?.kind !== 'found' || address.canonical) return;
    const pathname = changeOrderPath(address.order.spaceSlug, address.order.slug, address.stage);
    navigate({ pathname, search, hash }, { replace: true });
  }, [address, navigate, search, hash]);
  const history = useChangeOrderHistory(detail);
  const workflowNames = useChangeWorkflowNames();
  const workflowId = detail.consoleRow?.changeWorkflowId;
  const workflowHref = changeWorkflowHref(workflowId, workflowNames);
  /** `null` when the ChangeOrder names no component, which the Components view cannot be scoped to. */
  const componentDeepLink =
    detail.consoleRow?.appName === undefined
      ? null
      : `${ROUTE_COMPONENTS}?app=${encodeURIComponent(detail.consoleRow.appName)}`;

  /** The URL names the Complete step — the same `:stage` segment a real stage uses. */
  const completeSelected = stageParam === COMPLETE_STAGE_ID;
  /** A rail node's address: the URL is the whole selection state. */
  const hrefForStage = useCallback(
    (stageId: string) => changeOrderPath(detail.baseSpaceSlug, detail.slug, stageId),
    [detail.baseSpaceSlug, detail.slug],
  );
  const sourceSummary = useMemo(() => {
    if (detail.invocationSource !== undefined) return detail.invocationSource.slug ?? '';
    return (detail.fanOutSource?.spaceIds ?? [])
      .map((spaceId) => detail.fanOutSource?.spaceNameBySpaceId.get(spaceId) ?? spaceId)
      .join(', ');
  }, [detail.invocationSource, detail.fanOutSource]);

  /**
   * The stage whose panel this page shows, or `undefined` for none.
   *
   * The Complete step is not in `detail.stageStates`, so without the first
   * check an unmatched `:stage` would fall through to the next-stage default
   * below and open a stage panel nobody selected — above the Complete panel,
   * and with no selection ring on the rail to account for it.
   *
   * The fallback is that default: the same stage the bare route opens, not a
   * previous selection. Nothing on this page stores one — the URL is the whole
   * selection state.
   */
  const selectedStage = useMemo(() => {
    if (detail.stageStates.length === 0) return undefined;
    if (stageParam === COMPLETE_STAGE_ID) return undefined;
    if (stageParam !== undefined) {
      const match = detail.stageStates.find((s) => s.stageId === stageParam);
      if (match !== undefined) return match;
    }
    return detail.stageStates.find((s) => s.stageId === detail.nextStageId);
  }, [detail.stageStates, detail.nextStageId, stageParam]);
  // An Invoke ChangeOrder's source writes nothing: its panel shows the Invocation that runs
  // in each stage as it is promoted, and "At the source" what running it changes.
  const invocationSourceSelected =
    selectedStage?.verdict === 'source' && detail.invocationSource !== undefined;

  /*
   * REVIEWS: attestation prerequisites on a stage (`reviews/`). The panel is
   * for the selected stage; the band in the summary card is for the next
   * stage, which a reader may not have selected. The promote dry run stays
   * the authority for "satisfied" (`useStageReviews`).
   */
  const { userInfo } = useUserInfo();
  const coReviews = useChangeOrderReviews(detail, { poll: true });
  const completeSelectedEarly = stageParam === COMPLETE_STAGE_ID;
  /**
   * ONE review panel, on the card of the stage whose change it approves, beside
   * that change. Once a stage's change has landed in its Spaces, its card reviews
   * it for every gate that reads those Spaces: its own release gate while it is
   * to be released, and the next stage's entry gate. Both record the same
   * Attestations, so they are one review with one form, never two. The first
   * stage's entry gate reads the ChangeOrder's own Space, which has no card, so it
   * is reviewed on the first stage. The Complete step has the Final sign-off.
   * Which card has a gate's form is `reviewFormStageId`, the rule every link to a
   * review follows too.
   */
  const stageVerdictOf = useCallback(
    (stageId: string) => detail.stageStates.find((s) => s.stageId === stageId)?.verdict,
    [detail.stageStates],
  );
  const selectedLanded = stageChangeLanded(selectedStage?.verdict);
  const sectionGates: ReviewGateRef[] = useMemo(() => {
    const summaries = Object.values(coReviews.byGateKey);
    if (completeSelectedEarly) return summaries.filter((g) => g.gate.kind === 'final').map((g) => g.gate);
    if (selectedStage === undefined) return [];
    const stageId = selectedStage.stageId;
    const onCard = summaries.filter((g) => reviewFormStageId(g, stageVerdictOf) === stageId);
    const ofChange = onCard.filter((g) => g.attestTarget.TargetStage === stageId);
    if (ofChange.length > 0) {
      const order = (kind: string) => (kind === 'release' ? 0 : 1);
      return ofChange.sort((a, b) => order(a.gate.kind) - order(b.gate.kind)).map((g) => g.gate);
    }
    return onCard.filter((g) => g.gate.kind === 'entry' && g.attestTarget.TargetStage === undefined).map((g) => g.gate);
  }, [coReviews.byGateKey, completeSelectedEarly, selectedStage, stageVerdictOf]);
  const reviews = useGateReviews(detail, sectionGates);
  const reviewSummary = reviews.summary;
  /** The selected stage's own entry gate: its gate rows, and its state when it reviews the stage before. */
  const ownEntrySummary: StageReviewSummary | undefined =
    selectedStage === undefined ? undefined : coReviews.byGateKey[`entry:${selectedStage.stageId}`];
  /** Where the own entry gate is reviewed, when that is another stage's card. */
  const ownEntryReviewedOn =
    ownEntrySummary === undefined || reviewCardStageId(ownEntrySummary) === selectedStage?.stageId
      ? undefined
      : reviewCardStageId(ownEntrySummary);
  /**
   * Where the own entry gate's form is now: undefined while the change it reads has not
   * landed, and then the status says so instead of linking to a card without the form.
   */
  const ownEntryFormOn = ownEntryReviewedOn === undefined || ownEntrySummary === undefined ? undefined : reviewFormStageId(ownEntrySummary, stageVerdictOf);
  /** Before the stage's own change lands, its card says how the review of the stage before stands. */
  const entryStatusSummary = ownEntryReviewedOn !== undefined && !selectedLanded && !completeSelectedEarly ? ownEntrySummary : undefined;
  /**
   * The band: the first held gate in time order (`bandGate`). With nothing
   * held, the next stage's entry review, so a complete review still shows its
   * "Reviews complete" band (design C).
   */
  const bandSummary: StageReviewSummary | undefined =
    coReviews.bandGate !== undefined
      ? coReviews.byGateKey[coReviews.bandGate.key]
      : detail.nextStageId === null
        ? undefined
        : coReviews.byGateKey[`entry:${detail.nextStageId}`];
  const readinessOf = (summary: StageReviewSummary | undefined): PromoteReadiness | undefined =>
    summary === undefined || summary.gate.kind !== 'entry' ? undefined : coReviews.readinessByStageId[summary.gate.stageId];
  const reviewNow = Date.now();
  const approveRef = useRef<HTMLButtonElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** The decision last recorded here, until its toast closes. */
  const [recorded, setRecorded] = useState<{ gateKeys: string[]; subject: string; result: ReviewChoice; refreshed: boolean } | null>(null);
  // State 'none' = nothing evaluated. The panel still shows a gate with requirements the
  // server did not evaluate for this viewer: "Not evaluated for you", the decisions, the form.
  const reviewedStageSelected =
    reviewSummary !== undefined &&
    (reviewSummary.state !== 'none' || reviewSummary.requirements.length > 0) &&
    reviewSummary.gate.kind !== 'final' &&
    !invocationSourceSelected &&
    !completeSelectedEarly;
  const signOffSelected = completeSelectedEarly && reviewSummary !== undefined && reviewSummary.gate.kind === 'final';
  /** The release dry run refuses on a review requirement (422): the Release button is held, as Promote is on a 409. */
  const releaseHeldByReview =
    reviewSummary !== undefined && reviewSummary.requirements.some((r) => r.gate.kind === 'release' && r.evaluated && !r.satisfied);
  /** The gates a review on this card holds, one summary each, for their blocked lines and chip. */
  const sectionSummaries = sectionGates.flatMap((gate) => (coReviews.byGateKey[gate.key] === undefined ? [] : [coReviews.byGateKey[gate.key]]));
  /** This stage's own gates among them (its release, or the first stage's entry): the card's chip follows them. */
  const ownSectionSummary = sectionSummaries.find((summary) => summary.gate.stageId === selectedStage?.stageId);

  /**
   * The console row, when it has a promotion path. The rail, its pips and the
   * "N of M" figure are all drawn from this one row, or not at all: a row with
   * no stages counts "0 of 0", and a rail built from the workflow alone beside
   * it would be a second path for one ChangeOrder.
   */
  const pathRow =
    detail.consoleRow !== undefined && hasPromotionPath(detail.consoleRow) ? detail.consoleRow : undefined;

  /**
   * The Complete step, when there is a path to end it.
   *
   * ⚠️ READ FROM THE CONSOLE ROW, NOT RE-DERIVED. The step's tone follows the
   * row's own state, so the rail's trailing node and the console strip's
   * trailing segment cannot come to say two different things about one ChangeOrder.
   */
  const completeStage = useMemo(
    () => (pathRow === undefined ? null : buildCompleteConsoleStage(pathRow)),
    [pathRow],
  );
  /*
   * THE SERVER'S "COMPLETE" WINS. `ChangeOrder.Stage` can lag the workflow's
   * completion, while the promote dry run already refuses with "has completed
   * ChangeWorkflow" (`detail.workflowCompleted`). The console row reads only
   * `Stage`, so without this the Complete node said "Not complete 1/2" beside
   * a sign-off panel that the server counts as satisfied. A restored or
   * abandoned ChangeOrder keeps its own reading.
   */
  const rowCompleteTone: CompleteStepTone | null = pathRow === undefined ? null : completeStepTone(pathRow);
  const completedByServer = detail.workflowCompleted && rowCompleteTone !== null && rowCompleteTone !== 'restored';
  const completeTone: CompleteStepTone | null = completedByServer ? 'done' : rowCompleteTone;
  const completeLabel = completedByServer ? changeOrdersConsoleCopy.states.complete.label : (completeStage?.state.label ?? '');
  /** The Final gates, all satisfied when the server reports the workflow complete, so the tally agrees. */
  const finalGates = useMemo(
    () =>
      completedByServer
        ? detail.finalGates.map((gate) =>
            gate.evaluated && gate.ok ? gate : { ...gate, ok: true, evaluated: true, reason: WORKFLOW_COMPLETED_REASON },
          )
        : detail.finalGates,
    [completedByServer, detail.finalGates],
  );
  const completeAbandoned =
    detail.consoleRow !== undefined && isCompleteStepAbandoned(detail.consoleRow);
  /** The selected stage's name as a reader sees it. Empty when none is selected. */
  const selectedStageName =
    selectedStage === undefined
      ? ''
      : stageDisplayName(selectedStage.stageId, selectedStage.verdict === 'source');

  const gates = selectedStage?.gates ?? [];
  /**
   * The gates of the stage the review's entry gate leads into that are not its
   * reviews and are not yet satisfied: what still holds that stage when the
   * reviews are done. With none, completing the review can honestly say the
   * gate opens (M5); `PromoteReadiness` says the same for the band and the chips.
   * Undefined when the review counts toward no entry gate.
   */
  const sectionEntry = sectionSummaries.find((summary) => summary.gate.kind === 'entry');
  const sectionEntryStageGates = detail.stageStates.find((s) => s.stageId === sectionEntry?.gate.stageId)?.gates;
  const otherHoldingGates = useMemo(
    () =>
      sectionEntry === undefined
        ? undefined
        : (sectionEntryStageGates ?? [])
            .filter((g) => reviewRequirementOf(g, sectionEntry) === undefined && !(g.evaluated && g.ok))
            .map((g) => g.name),
    [sectionEntryStageGates, sectionEntry],
  );
  /**
   * What holds this stage, split by whether anybody checked.
   *
   * BOTH HALVES ARE NEEDED TO STATE A CAUSE HONESTLY. `blockingGates` returns
   * failures and unmade checks mixed in declared order, so the first entry is
   * whichever happens to come first — and a CEL custom ahead of a failing
   * `Released` would have this screen quote "not checked" while the real cause
   * went unmentioned, naming something that was never the reason.
   */
  const blocking = partitionBlockingGates(gates);
  const failedGateCount = blocking.failed.length;
  /**
   * Whether this stage may be promoted at all: not when a gate was evaluated
   * and failed. A gate nobody could evaluate here is left to the server, which
   * the preview asks.
   *
   * The same rule the side pane's footer applies (`gatesBlockPromotion`), so
   * the two surfaces cannot come to disagree about whether a stage is clear.
   * The two differ only in what they do with the answer: the footer makes its
   * buttons inert, and this page refuses the action and says what holds it.
   */
  const gatesBlock = gatesBlockPromotion(failedGateCount);

  const resolvedSpaceIds = useMemo(
    () => new Set(detail.progress.resolvedSpaceIds ?? []),
    [detail.progress.resolvedSpaceIds],
  );

  const changes = useChangeOrderConsoleChanges({
    changeOrderId: detail.changeOrderId,
    baseSpaceId: detail.baseSpaceId,
    fanOutSource: detail.fanOutSource,
    runsInvocation: detail.invocationSource !== undefined,
    inScopeSpaceIds: detail.inScopeSpaceIds,
    stages: detail.sequence.stages,
    selectedStageId: selectedStage?.stageId ?? null,
    scopedSpaces: detail.scopedSpaces,
    resolvedSpaceIds,
    skip: !detail.found,
  });

  const { changeSets } = useChangeOrderChangeSets({
    changeOrderId: detail.found ? detail.changeOrderId : undefined,
    baseSpaceId: detail.baseSpaceId,
    updateType: detail.updateType,
    ownSpaceReached: detail.ownSpaceReached,
    inScopeSpaceIds: detail.inScopeSpaceIds,
    adoptedEndTagId: detail.adoptedEndTagId,
  });

  /*
   * ⚠️ THE GATED PROMOTE IS EXERCISED; THE ORDINARY ONE IS NOT.
   *
   * The held-stage test in `change-orders-console-promote.spec.ts` drives a held
   * stage through this page against a live server and asserts that it wrote nothing. Promoting a stage
   * nothing is holding, and aborting, still reach the real `useChangeOrderActions`
   * and `useAbortChangeOrder` without ever having been clicked in any environment:
   * a promote mutates a database shared across many worktrees.
   *
   * For those two, "renders and is wired" is the whole claim. A wired
   * affordance that has never fired is indistinguishable from a working one —
   * which is the failure this page exists to argue against, and here it sits
   * under a control that changes production state.
   *
   * KNOWN RISK, ACCEPTED DELIBERATELY. A promotion gate can report itself
   * satisfied when a Space has not received the change: a Unit skipped at
   * creation carries neither start nor end tag, so promotion passes it over
   * without error and the propagation walk never holds the Space back on its
   * account. `State` then reads Resolved and the next stage opens while a Space
   * never took that part of the change. Inferred from the skip rules and the
   * propagation derivation — NOT observed, and no execution of it has been
   * recorded. It needs scope to change after creation, it affects the derived
   * verdict rather than the write, and it does not touch Abort, which sets
   * AbortedReason and reads no gate.
   *
   * Do not add an affordance that acts on many ChangeOrders at once without
   * revisiting that first: one person promoting one stage can look at what
   * happened; a fleet-wide sweep cannot.
   */
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  /**
   * The gate bar's own open/closed state, per stage.
   *
   * ⚠️ ALWAYS STARTS COLLAPSED, EVEN WHEN HELD. An earlier version of this
   * comment argued a held stage should open by default, on the reference's
   * own line "satisfied, it is one line; failing, it is the story and opens
   * itself" — the reference's actual view B does not do that: every stage's
   * gate list starts collapsed regardless of state, in the screenshot this
   * page is built against. Overruled on that measurement rather than the
   * argument, which is why the argument is kept here rather than deleted:
   * `undefined` still means "no manual override yet," it just now resolves
   * to closed instead of to `held`, so a reader who wants the story opens it
   * themselves rather than having it opened for them.
   */
  const [gateOverride, setGateOverride] = useState<Record<string, boolean>>({});
  /** The "Passed over" list's own disclosure — one switch, closed by default: it can list every Unit in the Space and is not what a reader opens this screen to see first. */
  const [skippedExpanded, setSkippedExpanded] = useState(false);
  // Every diff on the page (the source's and every group card's) shares one set of columns.
  const {
    columns: diffColumns,
    columnStyle: stableDiffColumnStyle,
    onDividerMouseDown: onDiffDividerMouseDown,
    isDragging: isDiffDragging,
  } = useSharedDiffColumns();
  /**
   * "At the source" units the ChangeOrder actually covers. A unit the
   * ChangeOrder declined to touch at all is already accounted for in "Passed
   * over" — `detail.skippedUnits` says so directly — so it is filtered out
   * here rather than repeated.
   *
   * ⚠️ NOT the same test as "this unit's `fieldDiffs` came back empty". A
   * resource whose value already matches (nothing left to write — the same
   * reading a fully-landed ChangeOrder's own targets get) also has zero
   * `fieldDiffs`, for a completely different reason: it IS part of the
   * change, it just already holds it. Filtering on emptiness conflated the
   * two and made a genuinely complete ChangeOrder's own units disappear from
   * here as though they had never been in scope — regression, caught by a
   * "the completed state stopped rendering right" report. `skippedUnits`
   * membership is the only honest test for "this belongs in Passed over
   * instead".
   */
  /** A fan-out source's narrowed paths, by unit id (`FanOutSourceUnit.linkedPaths`). */
  const linkedPathsByUnitId = useMemo(() => {
    const index = new Map<string, string[]>();
    for (const unit of detail.fanOutSource?.units ?? []) {
      if (unit.linkedPaths !== undefined) index.set(unit.unitId, unit.linkedPaths);
    }
    return index;
  }, [detail.fanOutSource]);
  /**
   * A resource's Links of this ChangeOrder's type that cross into other Spaces, which are the
   * ones it travels over. An Invoke ChangeOrder travels over none.
   */
  const unitLinksHrefFor = useCallback(
    (unit: { spaceId: string; unitId: string }, direction: 'from' | 'to') =>
      detail.updateType === 'Invoke'
        ? undefined
        : unitLinksHref(unit.spaceId, unit.unitId, {
            // An absent UpdateType is the server's default.
            updateType: detail.updateType || 'UpgradeUnit',
            otherSpacesOnly: true,
            direction,
          }),
    [detail.updateType],
  );
  const visibleSourceUnits = useMemo(
    () => changes.sourceUnits.filter((unit) => !(unit.unitId in detail.skippedUnits)),
    [changes.sourceUnits, detail.skippedUnits],
  );
  /**
   * The same list, split so the resources that move are read first and the
   * ones that already hold the value collapse into one line behind them.
   * Derived AFTER the skipped filter, never instead of it — see
   * `partitionSourceUnitsByChange` for why the two tests are not the same
   * question.
   */
  const { changedUnits: changedSourceUnits, blockedUnits: blockedSourceUnits } = useMemo(
    () => partitionSourceUnitsByChange(visibleSourceUnits, changes.sourceGroupsByUnitId),
    [visibleSourceUnits, changes.sourceGroupsByUnitId],
  );
  /*
   * IMAGE CHANGES: the hero card above the source diff.
   *
   * A fan-out ChangeOrder makes its change in Units outside its own Space, and
   * an Invoke ChangeOrder's change is what running its Invocation writes, so the
   * diff of the ChangeOrder's own Space says nothing for either. Their hero is
   * read from the source diffs this page already holds, not from a request. The
   * status says whether they are still arriving or could not be read, so an
   * empty diff there is never shown as "No image change".
   */
  const sourceDataStatus = changes.fanOutSourceStatus ?? changes.invocationSourceStatus;
  const readsSourceData = sourceDataStatus !== undefined;
  const heroEligible = readsSourceData || changeOrderOwnSpaceReached(detail.updateType);
  const ownSpaceImageChanges = useChangeOrderImageChanges({
    changeOrderId: detail.changeOrderId,
    baseSpaceId: detail.baseSpaceId,
    skip: !heroEligible || readsSourceData || detail.changeOrderId === undefined || detail.baseSpaceId === undefined,
  });
  const sourceDataImageChanges = useMemo(
    () =>
      sourceDataStatus === undefined
        ? undefined
        : imageChangesForSource(sourceDataStatus, [...changes.sourceGroupsByUnitId.values()]),
    [sourceDataStatus, changes.sourceGroupsByUnitId],
  );
  const imageChanges = sourceDataImageChanges ?? ownSpaceImageChanges;
  const heroStageNames = useMemo(
    () => detail.sequence.stages.filter((stage) => !stage.isSource).map((stage) => stage.id),
    [detail.sequence.stages],
  );
  /** What the "Full diff" header counts: changed fields, and the Units that carry them. */
  const fullDiffCounts = useMemo(() => {
    const units = changes.sourceSpaceGroups.length > 0 ? changes.sourceUnits : changedSourceUnits;
    let changeCount = 0;
    let unitCount = 0;
    for (const unit of units) {
      const n = changes.sourceGroupsByUnitId.get(unit.unitId)?.fieldDiffs.length ?? 0;
      if (n > 0) {
        changeCount += n;
        unitCount += 1;
      }
    }
    return { changes: changeCount, units: unitCount };
  }, [changes.sourceSpaceGroups.length, changes.sourceUnits, changedSourceUnits, changes.sourceGroupsByUnitId]);
  /**
   * The "Full diff" disclosure, `undefined` meaning "no manual override yet" —
   * the same idiom as `gateOverride`. Shut by default only when the change is
   * images and nothing else, which the hero above already says in full; open
   * whenever there is anything the hero does not show, including while it
   * cannot tell (an unreadable diff is never read as "images only").
   */
  const [fullDiffOverride, setFullDiffOverride] = useState<boolean | undefined>(undefined);
  const fullDiffDefaultOpen = !(
    heroEligible && (imageChanges.status === 'loading' || (imageChanges.status === 'some' && imageChanges.fieldChanges.count === 0))
  );
  const fullDiffOpen = fullDiffOverride ?? fullDiffDefaultOpen;
  const toggleFullDiff = useCallback(() => setFullDiffOverride(!fullDiffOpen), [fullDiffOpen]);
  /**
   * The unchanged group's own disclosure, `undefined` meaning "no manual
   * override yet" — the same idiom as `gateOverride` above, and for the same
   * reason: the default has to be able to depend on what is being shown.
   * `partitionSourceUnitsByChange` decides that default, so it is testable
   * without the page.
   */
  /**
   * One "At the source" row, rendered identically whether it sits in the
   * changed list or inside the collapsed group: the density comes from the
   * group being shut, not from telling the reader less about the unit.
   */
  const renderSourceUnit = useCallback(
    (unit: MergedUnit) => {
      const group = changes.sourceGroupsByUnitId.get(unit.unitId);
      const fieldDiffs = group?.fieldDiffs ?? [];
      const linkedPaths = linkedPathsByUnitId.get(unit.unitId);
      return (
        <UnitDiffRow
          key={unit.unitId}
          unitId={unit.unitId}
          spaceId={unit.spaceId}
          slug={unit.slug}
          resourceKind={group?.resourceKind}
          spaceName={changes.spaceNameBySpaceId.get(unit.spaceId) ?? unit.spaceId}
          // A fan-out ChangeOrder's sources are outside the component, so
          // they open as Spaces rather than in the component view.
          spaceHref={
            detail.fanOutSource !== undefined
              ? `/spaces/${unit.spaceId}`
              : (componentSpaceDeepLink(detail.componentName, unit.spaceId) ?? undefined)
          }
          // The change leaves a source over the Links to it.
          linksHref={unitLinksHrefFor(unit, 'to')}
          // Every unit reaching `sourceUnits` was determinable by construction: one
          // that was not is dropped and counted in `sourceDropped` instead.
          changed={fieldDiffs.length > 0}
          diff={group?.diff}
          columns={diffColumns}
          notes={
            <>
              {linkedPaths !== undefined && fieldDiffs.length > 0 ? (
                <Box
                  sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 6px' }}
                  data-testid={`change-order-unit-linked-paths-${unit.unitId}`}
                >
                  {changeOrderCopy.linkedPathsCaption(linkedPaths)}
                </Box>
              ) : null}
              <ChangeOrderRefusals conflicts={rowRefusals(group)} />
            </>
          }
          fallback={
            <TreeDiffSection
              entry={{ unitId: unit.unitId, fieldDiffs }}
              allPaths={group?.allPaths}
              keyPrefix="change-order-source"
              label=""
              hideLabel
              variant="data"
              columnStyle={stableDiffColumnStyle}
              onDividerMouseDown={onDiffDividerMouseDown}
              isDragging={isDiffDragging}
            />
          }
        />
      );
    },
    [
      changes.sourceGroupsByUnitId,
      changes.spaceNameBySpaceId,
      detail.componentName,
      detail.fanOutSource,
      linkedPathsByUnitId,
      unitLinksHrefFor,
      stableDiffColumnStyle,
      onDiffDividerMouseDown,
      isDiffDragging,
      diffColumns,
    ],
  );
  /**
   * Every outcome-group card's open/closed state, ONE switch for all of
   * them — expanding or collapsing any card does the same to every other
   * card, on this stage and any other. User instruction, given after
   * watching cards fall out of sync with each other: "if I expand/collapse
   * that section in one please expand/collapse it in all of them." A
   * per-card Record used to be the state here, keyed `${stageId}:${kind}`;
   * that was the deliberate design until this override. Always starts
   * collapsed, same rule as the gate bar above — a reader opens a card to
   * read it, not by default.
   */
  const [groupsExpanded, setGroupsExpanded] = useState(false);
  /**
   * Each outcome card's own "Unchanged" disclosure, `undefined` per card
   * meaning "no manual override yet" — the same idiom as `gateOverride` and as
   * the source list's own override, and for the same reason: the default
   * depends on what the card holds.
   *
   * ⚠️ KEYED PER CARD, deliberately unlike `groupsExpanded` above. That switch
   * is shared across cards on a direct user instruction about opening a CARD;
   * this one is about one card's tail of already-matching resources, and
   * sharing it would make opening one card's tail open every other card's too.
   */

  const actions = useChangeOrderActions({
    changeOrderId: detail.changeOrderId,
    baseSpaceId: detail.baseSpaceId,
    onSettled: detail.refetch,
  });

  /**
   * THE TWO END CONTROLS, ON THE SAME RULE AS EVERY OTHER SURFACE.
   *
   * `changeOrderIntents` is the rule; this page reads it and adds nothing, so the
   * same ChangeOrder cannot offer the action here and not in the component
   * view a click away.
   *
   * `detail.consoleRow` is the same row the fleet console builds, so there is
   * no second construction of the facts either. It is absent only while the
   * ChangeOrder is still loading or was not found, and neither state offers a
   * control.
   */
  /**
   * Space id → slug, for the Spaces this ChangeOrder is scoped to. An id the scope
   * cannot name is passed through as itself: a Space this page does not hold is
   * still one a rollback writes into.
   */
  const spaceSlug = useCallback(
    (spaceId: string) =>
      detail.scopedSpaces?.find((space) => space.spaceId === spaceId)?.slug ?? spaceId,
    [detail.scopedSpaces],
  );
  const endChangeOrder = useEndChangeOrder({ spaceLabel: spaceSlug, onSettled: detail.refetch });
  const intents = useMemo(
    () =>
      detail.consoleRow === undefined
        ? { rollBack: false, abort: false }
        : changeOrderIntents(detail.consoleRow),
    [detail.consoleRow],
  );
  /*
   * The controller owns the abort-only outcome, so its one sentence is folded
   * into this page's own live region rather than announced from a second one —
   * two live regions on one screen read out in an order nobody controls.
   */
  useEffect(() => {
    if (endChangeOrder.announcement !== '') setAnnouncement(endChangeOrder.announcement);
  }, [endChangeOrder.announcement]);

  const requestEnd = useCallback(
    (intent: ChangeOrderEndIntent) =>
      endChangeOrder.request(intent, {
        changeOrderId: detail.changeOrderId ?? '',
        slug: detail.slug,
        baseSpaceId: detail.baseSpaceId,
        startTagId: detail.startTagId,
        abortedReason: detail.abortedReason,
        progress: detail.progress,
      }),
    [endChangeOrder, detail],
  );

  /**
   * The Spaces this stage's actions WRITE INTO — its membership minus the Space
   * the promotion passes over (`promotionTargets`).
   *
   * Every consumer below is a write or a statement about one: the promote, the
   * release, the retried upgrade leg, the count the confirmation dialog states,
   * and whether any of them could publish at all. Stage MEMBERSHIP is a
   * different question and is read off `detail.sequence` where it is asked.
   */
  const stageSpaceIds = useMemo(
    () =>
      promotionTargets(
        detail.sequence.stages.find((st) => st.id === selectedStage?.stageId)?.spaceIds ?? [],
        detail.skippedSpaceId,
      ),
    [detail.sequence.stages, selectedStage?.stageId, detail.skippedSpaceId],
  );
  /**
   * Whether ANY variant of this stage can even publish. A Space with no
   * `releaseTargetId` can never be released — `changeOrderGates.ts`'s own
   * `releasedGate` reads this exact field for the same reason on the PREVIOUS
   * stage's side of a gate check; this is the same fact asked about the stage
   * being promoted INTO, to decide whether offering "release" here is a real
   * choice or a button with nothing behind it.
   */
  const stageHasTargets = useMemo(
    () =>
      stageSpaceIds.some(
        (id) => detail.scopedSpaces?.some((s) => s.spaceId === id && s.releaseTargetId !== undefined) ?? false,
      ),
    [stageSpaceIds, detail.scopedSpaces],
  );

  const confirmPromote = useCallback(
    ({ release }: { release: boolean }) => {
      const stageId = selectedStage?.stageId ?? '';
      /*
       * The gate is enforced HERE as well as in the dialog, and deliberately.
       * The dialog decides what to offer; this decides what may be written. A
       * promote past a held gate is the failure this whole path exists to
       * prevent, so it is refused at the point of action rather than only at
       * the point of asking.
       */
      if (gatesBlock) {
        setAnnouncement(`${stageId} is held by a gate, so it was not promoted.`);
        return;
      }
      setPromoteOpen(false);
      setAnnouncement(`Promoting to ${stageId}.`);
      const run = release ? actions.promoteAndRelease : actions.promote;
      void run(stageSpaceIds, { failedGateCount }).then((r) => {
        // Branch on the returned result, never on message text: the hook already
        // inspects every item of a bulk 200/207, which `.unwrap()` does not.
        // `promoteAnnouncement` owns which of those results says what, so the
        // wiring is one tested rule rather than a chain of ternaries per screen.
        setAnnouncement(promoteAnnouncement(stageId, r));
      });
    },
    [actions, selectedStage?.stageId, stageSpaceIds, gatesBlock, failedGateCount],
  );

  /*
   * The resources the change CARRIES, read at the base where it was authored.
   *
   * Stage-invariant by construction, which is what makes it worth computing
   * separately: a stage row's own diffs go empty as soon as a variant already
   * holds the target value, and "the promote writes nothing here" must not be
   * read as "the promote does not involve this resource".
   *
   * Unknown for a fan-out ChangeOrder: its source Units are other resources
   * than the ones it writes — a registry fact, not the Deployment taking the
   * image — so they say nothing about which rows of a stage it carries.
   */
  /**
   * The band's call to action. Scrolls to the review panel (or the Promote
   * button) and, for "Review now", focuses the Approve choice. The band is for
   * the next stage, so it selects that stage first when another one is open.
   */
  const goToReview = useCallback(
    (action: ReviewBandAction, target: string | undefined) => {
      const needsSelect = target !== undefined && target !== selectedStage?.stageId;
      if (needsSelect) navigate(changeOrderPath(detail.baseSpaceSlug, detail.slug, target));
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // The review is often on another stage's card, which renders some time after it is selected.
      let waits = 0;
      const go = () => {
        let element: HTMLElement | null = document.getElementById(REVIEW_PANEL_ID);
        if (action === 'promote') element = document.querySelector<HTMLElement>('[data-promote-stage]');
        if (action === 'release') element = document.querySelector<HTMLElement>('[data-release-stage]');
        if (element === null) {
          waits += 1;
          if (needsSelect && waits < 40) window.setTimeout(go, 150);
          return;
        }
        const toButton = action === 'promote' || action === 'release';
        element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: toButton ? 'center' : 'start' });
        if (action === 'panel') return;
        /*
         * Read the target when focusing, not now: the panel can re-render the
         * form (a poll lands, the dry run returns) while the page scrolls, and
         * an element held from the click would then be detached. Try again a
         * few times until the focus holds.
         */
        const target = () => (action === 'review' ? approveRef.current : element);
        let tries = 0;
        const focus = () => {
          const el = target();
          el?.focus({ preventScroll: true });
          tries += 1;
          if ((el === null || document.activeElement !== el) && tries < 8) window.setTimeout(focus, 150);
        };
        window.setTimeout(focus, reduced ? 0 : 350);
      };
      if (needsSelect) window.setTimeout(go, 100);
      else go();
    },
    [selectedStage?.stageId, navigate, detail.baseSpaceSlug, detail.slug],
  );
  /**
   * The step whose card has the band's review form: the stage whose change it reads
   * (the stage before, for an entry gate), or Complete for the sign-off. Undefined while
   * that change has not landed: the band then offers no way to a review.
   */
  const bandFormStep =
    bandSummary === undefined
      ? undefined
      : bandSummary.gate.kind === 'final'
        ? COMPLETE_STAGE_ID
        : reviewFormStageId(bandSummary, stageVerdictOf);
  /** Promote and Release are on the card of the stage the gate holds, not where it is reviewed. */
  const bandGateStep = bandSummary?.gate.kind === 'final' ? COMPLETE_STAGE_ID : bandSummary?.gate.stageId;
  const onReviewBandAction = useCallback(
    (action: ReviewBandAction) => {
      const target = action === 'promote' || action === 'release' ? bandGateStep : bandFormStep;
      if (target !== undefined) goToReview(action, target);
    },
    [goToReview, bandFormStep, bandGateStep],
  );

  /**
   * A decision was recorded. The toast is worded from the gates as the server
   * reports them after the write (`submit` waits for them), read at render, so
   * it says what the server counts rather than what the page expected.
   */
  const onReviewRecorded = useCallback(
    (outcome: Extract<SubmitReviewOutcome, { ok: true }>, summary: StageReviewSummary, result: ReviewChoice) => {
      setAnnouncement('');
      setToast(null);
      setRecorded({
        gateKeys: reviewFeeds(summary).map((gate) => gate.key),
        subject: reviewSubject(summary).name,
        result,
        refreshed: outcome.refreshed !== false,
      });
    },
    [],
  );
  const showNotice = useCallback((message: string) => {
    setRecorded(null);
    setToast(message);
  }, []);
  const recordedText =
    recorded === null
      ? null
      : recordedToastText(
          recorded.gateKeys.flatMap((key) => (coReviews.byGateKey[key] === undefined ? [] : [coReviews.byGateKey[key]])),
          recorded.subject,
          recorded.result,
          (stageId) => coReviews.readinessByStageId[stageId],
          recorded.refreshed,
        );

  const carriedResourceKeys = useMemo(
    () =>
      detail.fanOutSource !== undefined
        ? null
        : carriedResourceKeysOf(
            changes.sourceGroupsByUnitId.values(),
            changes.sourceCreatedResourceKeys,
          ),
    [detail.fanOutSource, changes.sourceGroupsByUnitId, changes.sourceCreatedResourceKeys],
  );
  const outcome = useMemo(
    () => buildChangeOrderOutcome(changes.matrix, carriedResourceKeys),
    [changes.matrix, carriedResourceKeys],
  );
  /*
   * Resources the grid holds no row for.
   *
   * `unresolvedGroupCount` ONLY. `duplicateIdentityCount` counts resources that
   * shared an identity with a sibling and were given a disambiguated row — they
   * are in the comparison, on their own row, so summing them in made this
   * sentence false exactly when it fired.
   */
  const omittedResourceCount = changes.matrix?.unresolvedGroupCount ?? 0;
  /*
   * Resources the grid could not line up across the variants, as against
   * resources it lined up and found to differ. A declined comparison rendered
   * as two separate rows looks exactly like a real difference, and that is the
   * reading a reader would take without being told.
   */
  const undecidedResourceCount = changes.matrix?.mergeDeclinedCount ?? 0;
  /*
   * The bar sits above a promote decision, so the one number that must never
   * drift is checked rather than assumed. Non-zero is a defect in the
   * partition, and it says so on screen rather than quietly rendering short.
   * Checked against the FULL `outcome`, unknown included — the invariant is
   * about every variant being accounted for somewhere, not just the ones the
   * bar chooses to draw.
   */
  const shortfall = partitionShortfall(outcome);
  /*
   * `unknown` is not a fourth peer of `same`/`differs`/`adds` — it is not a
   * comparison result at all, it is the absence of one ("we looked and it
   * matches" vs "we could not look" — the file header's own distinction).
   * Giving it a bar segment and a group card presented it as though the
   * promotion had somehow written a fourth kind of outcome, which is not a
   * claim the data supports. It is never folded into `same` either, so it
   * still has to be said — just not as a peer: a plain count, separate from
   * the comparison the bar and cards below actually draw.
   */
  const comparableGroups = useMemo(() => outcome.groups.filter((g) => g.kind !== 'unknown'), [outcome]);
  const unknownGroup = outcome.groups.find((g) => g.kind === 'unknown');
  const comparableSegments = useMemo(() => outcomeSegments(comparableGroups), [comparableGroups]);
  const unknownVariants = useMemo(
    () => (unknownGroup?.spaceIds ?? []).map((spaceId, i) => ({ spaceId, label: unknownGroup?.labels[i] ?? '' })),
    [unknownGroup],
  );
  /**
   * An unknown variant's chip opens that variant on the Components graph,
   * not this ChangeOrder at it: the reader asked to look at that Space. Plain
   * when there is no Component to build the link from.
   */
  const unknownVariantHref = useCallback(
    (spaceId: string) => componentSpaceDeepLink(detail.componentName, spaceId),
    [detail.componentName],
  );
  /**
   * One resource row of an outcome card, rendered identically above the
   * blocked block and inside it: the density comes from the card being shut,
   * not from telling the reader less about any one resource.
   */
  const renderRepUnit = useCallback(
    (unit: MergedUnit, card: OutcomeCardContext) => {
      const g = changes.groupsByUnitId.get(unit.unitId);
      /*
       * The card's Space by its `Variant` label, the name it has inside its
       * Component; the slug underneath reads as plumbing.
       */
      const repVariantLabel = cardSpaceLabel(card.representativeSpaceId, detail.scopedSpaces, changes.spaceNameBySpaceId);
      const fieldDiffs = g?.fieldDiffs ?? [];
      return (
        <Box key={unit.unitId}>
          <ChangeOrderUnitHeader
            unitId={unit.unitId}
            spaceId={unit.spaceId}
            slug={unit.slug}
            resourceKind={g?.resourceKind}
            spaceName={repVariantLabel}
            written={changes.writtenUnitIds.has(unit.unitId)}
            undetermined={changes.undeterminedUnitIds.has(unit.unitId)}
            unchanged={fieldDiffs.length === 0}
            spaceHref={componentSpaceDeepLink(detail.componentName, unit.spaceId) ?? undefined}
            // A promotion reaches a stage's resource over the Links from it.
            linksHref={unitLinksHrefFor(unit, 'from')}
          />
          {/*
            The server's diff, resource by resource, through `ConfigDiffView`, with
            what the variant keeps drawn as rows in it. Can genuinely be empty: a
            `same` group's members already hold the value being promoted. That is
            its own honest answer, said instead of a blank tree.
          */}
          <OutcomeUnitDiff
            unitId={unit.unitId}
            group={g}
            columns={diffColumns}
            fallbackColumnStyle={stableDiffColumnStyle}
            keyPrefix={`change-order-group-${card.groupKey}`}
            empty={
              <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 10px' }}>
                No fields differ here.
              </Box>
            }
          />
        </Box>
      );
    },
    [
      changes.groupsByUnitId,
      changes.spaceNameBySpaceId,
      changes.writtenUnitIds,
      changes.undeterminedUnitIds,
      detail.componentName,
      detail.scopedSpaces,
      unitLinksHrefFor,
      stableDiffColumnStyle,
      diffColumns,
    ],
  );

  return (
    <Box
      id={CHANGE_ORDERS_ROOT_ID}
      sx={{
        padding: '20px 22px',
        background: changeOrderSurface.page,
        minHeight: '100%',
        /*
          The app's global theme sets Manrope on `body`, and every plain Box
          on this page inherits it unless told otherwise — every size/weight
          value in `changeOrderType` was on-contract and the page still rendered in
          the wrong typeface, because nothing had ever set the family itself.
          Set once here so every descendant gets it, `changeOrderFontMono` headings
          included (they override this explicitly, same as before).
        */
        fontFamily: changeOrderFontSans,
        /*
         * ⚠️ `flex: 1`, NOT OPTIONAL. This root's immediate parent is a
         * `display: flex; flex-direction: row` container (the page shell), so
         * this Box is a flex item on the ROW axis. With no `flex` set, the
         * default `flex: 0 1 auto` shrinks it to its own content's width
         * instead of filling the row — measured at 900px against a 1549px
         * available row on a 1600px viewport, well short of the mockup's own
         * ~1180px content width. Every card and rail inside inherits that cap,
         * which is why they all read narrower than the reference regardless of
         * their own width rules.
         */
        flex: 1,
        /*
          LINE HEIGHT, SET ONCE AT THE ROOT. The contract never uses `normal`,
          and leaving it unset is what put most of this page's type roles
          off-contract — a miss invisible to any check reading only size and
          weight. Set here so every element this page owns inherits it; headings
          below vary it deliberately.
        */
        lineHeight: changeOrderType.lineHeight.body,
        color: changeOrderInk.default,
        /*
          A base size, so nothing inherits the user agent's 16px. Every element
          here sets its own, but an unstyled one added later would otherwise
          land off-contract silently — the inheritance hole is the kind of miss
          that only shows up once someone else edits the file.
        */
        fontSize: changeOrderType.size.body,

        /*
          RETUNING THE REUSED DIFF RENDERER, SCOPED TO THIS PAGE ONLY.

          ⚠️ THE CUSTOM-PROPERTY VERSION OF THIS WAS BUILT, MEASURED AND
          REVERTED. Routing `componentTheme`'s tokens through
          `var(--ct-x, <present value>)` should have been inert everywhere the
          property is undefined. A computed-colour census of the ChangeOrder side
          pane — `ComponentValuesSection`'s other consumer — showed six values
          moving outside this page: two alpha-tinted backgrounds
          (`rgba(21,128,61,.15)`, `rgba(159,66,0,.15)`) vanished entirely and
          black rose by 76 elements. Something composites alpha from these
          tokens and cannot parse a `var()`, so the declaration is dropped and
          the element falls back. Two consecutive censuses with no code change
          were byte-identical, so that is signal, not run variance.

          Until the compositing sites are found, the override binds to the
          classes instead. Narrower, uglier, and provably inert outside this
          subtree — which is the property that matters.

          `.seg-dot`/`.seg-label` are `TreeDiffSection`'s own path-segment dot
          and label classes, still present now that the page's diffs render
          through it. `.dim-path` is NOT: that class belongs to
          `ComponentValuesSection` alone, which this page no longer mounts, so
          the override was removed with it rather than left aimed at nothing.
        */
        '& .seg-dot': { opacity: 1, color: changeOrderInk.subtle },
        '& .seg-label': { color: changeOrderInk.muted },
      }}
    >
      {/*
        The live region. TWELVE contracted states assert an announcement, and a
        page without one loses all twelve while looking pixel-identical — which
        is the clearest single reason a screenshot review cannot verify this
        screen. Present from the start so nothing has to be retrofitted around it.
      */}
      <Box id="announce" role="status" aria-live="polite" sx={{ position: 'absolute', left: -9999 }}>
        {recordedText ?? announcement}
      </Box>

      {/*
        Both dialogs are mounted at the root and portal to `document.body`, so a
        fidelity probe scoped to this page's root will not see them unless it is
        given the portal container as a second selector. That is a measurement
        obligation, not a reason to render them somewhere they do not belong.
      */}
      <PromoteDialog
        open={promoteOpen}
        stageName={selectedStageName}
        targetCount={stageSpaceIds.length}
        /*
          The DRY RUN's own reach, not the diff grid's. A promotion plans on the
          server, so what it would touch is a question only the server answers;
          the grid answers a different one (what the change carries) and reading
          it here would state a coverage nothing checked.
        */
        previewedCount={actions.promotePreview.reachedSpaceCount}
        canRelease={stageHasTargets}
        /*
          The SERVER's gates where a dry run reported them, and this page's own
          reading otherwise — which is the held case, since a stage held by a
          gate that failed is not previewed at all. The page's reading is the richer one: it names how
          many checks failed, how many were never made, and the principal cause.
        */
        blockedReason={
          actions.promotePreview.gatesHolding ??
          (gatesBlock
            ? changeOrderCopy.blockedBy(
                blocking.failed.length,
                blocking.notEvaluated.length,
                blocking.principal?.reason ?? changeOrderCopy.promoteHeld.generic,
              )
            : null)
        }
        refusedReason={actions.promotePreview.error}
        busy={actions.busy}
        onCancel={() => {
          setPromoteOpen(false);
          actions.clearPreview();
        }}
        onConfirm={confirmPromote}
      />
      <EndChangeOrderDialog {...endChangeOrder.dialogProps} />
      {/* The review toast: what a recorded decision did. The live region above says the same. */}
      <Snackbar
        open={recordedText !== null || toast !== null}
        autoHideDuration={recordedText !== null ? 6000 : 3600}
        onClose={() => {
          // The live region keeps the last result once the toast has gone.
          if (recordedText !== null) setAnnouncement(recordedText);
          setRecorded(null);
          setToast(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={recordedText ?? toast ?? ''}
        data-testid="review-toast"
        ContentProps={{ sx: { fontFamily: changeOrderFontSans, fontSize: changeOrderType.size.body } }}
      />

      {/*
        Altitude 0. The console renders its own `h1` — it IS the page when no
        ChangeOrder is addressed — so there is no heading contract spanning the two
        files and no `showHeading` prop to keep in step.

        It owns its own promote and its own end-ChangeOrder controls, bound to the
        row a reader picked rather than to the one this page has open. Passing
        either down from here would bind a list's actions to a ChangeOrder the list
        is not showing.
      */}
      {!addressed ? (
        <ChangeOrdersConsole
          onOpenChangeOrder={(row) => {
            navigate(changeOrderPath(row.spaceSlug, row.slug));
          }}
          /*
            ONE LIVE REGION ON THIS PAGE, AND IT IS THE ONE ABOVE.
            Passing this makes the console render none of its own and hand its
            sentence up instead. Two `role="status"` regions were live together
            here — measured — and a screen reader has no way to know they are
            one surface: the same event can be announced twice, or the two can
            race and announce out of order.

            NOT a portal into `#announce`, deliberately. That node belongs to
            this React tree; having the console render into it would put two
            trees on one element, which is a different bug from the one being
            fixed. The console keeps its own region when this prop is absent,
            so standalone use and its own specs never go silent.
          */
          onAnnounce={setAnnouncement}
        />
      ) : null}

      {addressed ? (
      <Box sx={{ marginBottom: '12px' }}>
        <Box
          component={RouterLink}
          to="/change-orders"
          sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted, textDecoration: 'none' }}
        >
          ← All ChangeOrders
        </Box>
      </Box>
      ) : null}

      {addressed && detail.isLoading ? (
        <Box sx={{ fontSize: changeOrderType.size.prose }}>Loading…</Box>
      ) : null}

      {address?.kind === 'ambiguous' ? (
        <Box role="region" aria-label="ChangeOrders with this slug" sx={{ fontSize: changeOrderType.size.prose }}>
          <Box
            component="h1"
            sx={{
              fontSize: changeOrderType.size.heading,
              lineHeight: changeOrderType.lineHeight.heading,
              fontWeight: changeOrderType.weight.semibold,
              margin: '0 0 6px',
            }}
          >
            {address.candidates.length} ChangeOrders are named “{address.slug}”
          </Box>
          <Box sx={{ color: changeOrderInk.muted, marginBottom: '8px' }}>
            A ChangeOrder slug is unique only within its Space. Pick the Space:
          </Box>
          <Box component="ul" sx={{ margin: 0, paddingLeft: '20px' }} data-testid="change-order-candidates">
            {address.candidates.map((candidate) => (
              <li key={candidate.changeOrderId}>
                <RouterLink to={changeOrderPath(candidate.spaceSlug, candidate.slug, address.stage) + search + hash}>
                  {candidate.spaceSlug}/{candidate.slug}
                </RouterLink>
              </li>
            ))}
          </Box>
        </Box>
      ) : null}

      {/* `address` is undefined here only when the list read failed. */}
      {addressed && !detail.isLoading && !detail.found && address?.kind !== 'ambiguous' ? (
        <Box role="region" aria-label="ChangeOrder not found" sx={{ fontSize: changeOrderType.size.prose }}>
          <Box
            component="h1"
            sx={{
              fontSize: changeOrderType.size.heading,
              lineHeight: changeOrderType.lineHeight.heading,
              fontWeight: changeOrderType.weight.semibold,
              margin: '0 0 6px',
            }}
          >
            No ChangeOrder matches “{address?.kind === 'notFound' ? address.label : [space, slug].filter(Boolean).join('/')}”
          </Box>
          <Box sx={{ color: changeOrderInk.muted }}>
            It may have been deleted, or the address may be wrong.
          </Box>
        </Box>
      ) : null}

      {detail.found ? (
        <>
          <SummaryCard label="ChangeOrder summary">
            {bandSummary !== undefined ? (
              <ReviewBand
                summary={bandSummary}
                readiness={readinessOf(bandSummary)}
                now={reviewNow}
                reviewable={bandFormStep !== undefined}
                onAction={onReviewBandAction}
                onGoToSubject={
                  bandFormStep === undefined ||
                  bandFormStep === COMPLETE_STAGE_ID ||
                  bandFormStep === selectedStage?.stageId ||
                  bandSummary.attestTarget.TargetStage === undefined
                    ? undefined
                    : () => goToReview('panel', bandFormStep)
                }
              />
            ) : null}
            <Box
              sx={{
                padding: '18px 20px',
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 220px',
                // No row gap: the full-width row below sets its own top margin.
                gap: '0 32px',
              }}
            >
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <Box
                  component="h1"
                  sx={{
                    fontSize: changeOrderType.size.display,
                    lineHeight: changeOrderType.lineHeight.tight,
                    fontWeight: changeOrderType.weight.strong,
                    fontFamily: changeOrderFontMono,
                    letterSpacing: '-0.015em',
                    margin: 0,
                    color: changeOrderInk.default,
                  }}
                >
                  {detail.slug}
                </Box>
                {/*
                  The DERIVED verdict, not the server's `State` field. `State` is
                  computed from promotion and release counts alone and never
                  consults gates or live status, so it reads `Resolved` on a
                  ChangeOrder whose workload is degraded. Using the same
                  `buildConsoleRow` derivation the console uses means this chip
                  and that row cannot tell two stories about one ChangeOrder.
                */}
                {bandSummary !== undefined ? (
                  <ReviewSummaryChip summary={bandSummary} readiness={readinessOf(bandSummary)} />
                ) : detail.consoleRow !== undefined ? (
                  <StateChip
                    label={changeOrdersConsoleCopy.states[detail.consoleRow.state].label}
                    tone={CONSOLE_STATE_TONE[detail.consoleRow.state]}
                  />
                ) : null}
              </Box>
              {/* What the change is, in its author's words, where they gave any. */}
              {detail.description !== undefined && detail.description.trim() !== '' ? (
                <Box
                  data-testid="change-order-description"
                  sx={{
                    fontSize: changeOrderType.size.prose,
                    lineHeight: changeOrderType.lineHeight.body,
                    color: changeOrderInk.muted,
                    margin: '6px 0 0',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {detail.description}
                </Box>
              ) : null}

              <Box
                component="dl"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '14px',
                  margin: '16px 0 0',
                }}
              >
                <Fact term="Component" icon={AccountTreeOutlinedIcon}>
                  {detail.componentName === undefined ? (
                    '—'
                  ) : componentDeepLink !== null ? (
                    <FactLink href={componentDeepLink}>{detail.componentName}</FactLink>
                  ) : (
                    detail.componentName
                  )}
                </Fact>
                <Fact term="Base Space" icon={FolderOutlinedIcon}>
                  {detail.baseSpaceSlug === undefined || detail.baseSpaceId === undefined ? (
                    detail.baseSpaceSlug ?? '—'
                  ) : (
                    <FactLink href={`/spaces/${detail.baseSpaceId}`}>{detail.baseSpaceSlug}</FactLink>
                  )}
                </Fact>
                <Fact term="Update type" icon={SyncAltOutlinedIcon}>{detail.updateType ?? '—'}</Fact>
                {/*
                  The workflow this ChangeOrder was created under, opened in the
                  workflow builder to view or edit. The ChangeOrder keeps the copy
                  it was created with, so an edit there governs later
                  ChangeOrders, not this one.
                */}
                <Fact term="Workflow" icon={SchemaOutlinedIcon}>
                  {workflowHref !== null ? (
                    <FactLink href={workflowHref}>{changeWorkflowLabel(workflowId, workflowNames)}</FactLink>
                  ) : (
                    changeWorkflowLabel(workflowId, workflowNames)
                  )}
                </Fact>
                {/*
                  The reference states this fact as "N variants in M Spaces" —
                  two figures, because its `stage.targets` can fan out past one
                  target per Space. This model has no such fan-out: a ChangeOrder
                  stage's targets ARE its `spaceIds` (`ChangeOrderStage.spaceIds`,
                  changeOrderTypes.ts), one target per Space, always. Printing a
                  second number here would not report a second quantity — it
                  would print the same integer as `.length` under a different
                  label, asserting a distinction the data does not have. One
                  figure stays a fact; a duplicated one would be a claim.
                */}
                <Fact term="Scope" icon={FolderCopyOutlinedIcon}>
                  {detail.scopedSpaces === null ? (
                    'Not reported by the server'
                  ) : (
                    <ScopeSpaces spaces={detail.scopedSpaces} stages={detail.sequence.stages} />
                  )}
                </Fact>
                <Fact term="Opened" icon={CalendarTodayOutlinedIcon}>
                  <OpenedAt value={detail.createdAt} />
                </Fact>
                <Fact term="Last activity" icon={UpdateOutlinedIcon} wide>
                  <ChangeOrderLastActivity history={history} />
                </Fact>
                {/*
                  `detail.serverState` (the raw `ChangeOrder.State`) is
                  deliberately NOT shown here. The design's fact row has no
                  concept of it, and the derived chip above already carries
                  the health-truth job this field would duplicate — showing
                  both was extra transparency the design never asked for, not
                  a requirement of the correctness fix that motivated reading
                  the field at all. The field stays on `ChangeOrderDetail` for
                  whoever wants it later; only its display is gone.
                */}
              </Box>
            </Box>

            <Box>
              {/*
                Progress refuses to produce a count when the server did not
                derive it. "0 of 3 promoted" and "could not be derived" have
                identical payloads apart from the base Space, and guessing wrong
                tells a reader a ChangeOrder has not moved when it may well have.
              */}
              {detail.consoleRow !== undefined && pathRow === undefined ? (
                // No stages to count, so the row's own reason is said instead,
                // as the list says it.
                <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
                  {detail.consoleRow.blocker}
                </Box>
              ) : detail.progress.availability === 'available' ? (
                <>
                  <Box
                    sx={{
                      fontSize: changeOrderType.size.figure,
                      fontWeight: changeOrderType.weight.bold,
                      lineHeight: changeOrderType.lineHeight.flush,
                    }}
                  >
                    {detail.stagesDone}
                    <Box component="span" sx={{ fontSize: changeOrderType.size.prose, fontWeight: 400, marginLeft: '6px' }}>
                      {/*
                        The figure counts the nodes of the rail below: the
                        source, every stage (one that selects no Space
                        included) and Complete. The chips draw the same nodes,
                        so the figure, the chips and the rail always agree.
                      */}
                      of {detail.stagesTotal} {detail.stagesTotal === 1 ? 'stage' : 'stages'}
                    </Box>
                  </Box>
                  <Box
                    aria-hidden="true"
                    sx={{ display: 'flex', gap: '3px', marginTop: '8px' }}
                  >
                    {/*
                      ONE CHIP PER RAIL NODE — the source, every stage, and the
                      trailing Complete step. The rail below is the same ChangeOrder
                      drawn larger, and a reader compares the two by counting:
                      a row of marks shorter than the rail it faces reads as a
                      bar that stops short of its own end, whatever the figure
                      above it says.

                      EVERY TONE COMES FROM THE RAIL'S OWN DOT HELPERS, never a
                      second mapping. The dot's ink is the chip's outline and
                      the dot's fill is the chip's fill, so a chip cannot come
                      to claim something the node it faces does not.
                    */}
                    {[
                      ...detail.stageStates.map((state, i) => ({
                        key: state.stageId,
                        dot: railDot(
                          state,
                          state.stageId === detail.nextStageId,
                          i < detail.stagesDone,
                          coReviews.railByStageId[state.stageId],
                        ),
                      })),
                      ...(completeTone === null
                        ? []
                        : [
                            {
                              key: COMPLETE_STAGE_ID,
                              dot: completeRailDot(completeTone, completeAbandoned),
                            },
                          ]),
                    ].map(({ key, dot }) => (
                      <Box
                        key={key}
                        sx={{
                          height: 8,
                          flex: 1,
                          borderRadius: `${changeOrderShape.radius.sm}px`,
                          background: dot.bg,
                          boxShadow: `inset 0 0 0 1.5px ${dot.color}`,
                        }}
                      />
                    ))}
                  </Box>
                  <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted, marginTop: '8px' }}>
                    {/*
                      `nextStageId === null` is also true when there was never a
                      promotable stage to reach — the console row's `no-stages`.
                      Without this, a ChangeOrder with nowhere to promote to reads
                      as one that finished — the opposite of what
                      `noStagesBlocker` tells the same reader one screen back,
                      in the console row they clicked from.
                    */}
                    {detail.stagesTotal === 0 || detail.consoleRow?.state === 'no-stages'
                      ? changeOrdersConsoleCopy.noStagesBlocker
                      : detail.nextStageId === null
                        ? 'Every stage has taken the change.'
                        : nextStageHint(stageDisplayName(detail.nextStageId, false), bandSummary, readinessOf(bandSummary))}
                  </Box>
                </>
              ) : (
                <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
                  {changeOrderCopy.progressUnavailable}
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                {/*
                  `.btn-danger`: a bordered pill, not a text link. The
                  reference reserves plain text buttons for low-stakes actions
                  and gives every destructive one a visible border — an
                  unmarked link reads as low-stakes, and taking a change back
                  out of production is not.

                  "Abort" gets the plain pill precisely because it is the
                  low-stakes one: it decides and writes into no Space.
                */}
                {intents.abort ? (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => requestEnd('abort')}
                    data-abort
                    sx={{ color: changeOrderInk.muted, textTransform: 'none' }}
                  >
                    {changeOrderCopy.endChangeOrder.abortLabel}
                  </Button>
                ) : null}
                {intents.rollBack ? (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => requestEnd('roll-back')}
                    data-roll-back
                    sx={{
                      color: changeOrderStatus.danger,
                      borderColor: '#eec5c5',
                      textTransform: 'none',
                      '&:hover': { borderColor: changeOrderStatus.danger, background: '#fef2f2' },
                    }}
                  >
                    {changeOrderCopy.endChangeOrder.rollBackLabel}
                  </Button>
                ) : null}
              </Box>
            </Box>

            {/*
              The source tree and everything after it span both columns, so
              the tree gets the card's full width rather than the width left
              beside the stages panel.
            */}
            <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
              {/*
                THE SUBJECT OF THE PAGE, not a second copy of the stage trees.
                The reference pairs the two deliberately — "this is the value as
                authored, that is the value as each target reported it… the
                reader compares two trees, not a table against a list." One says
                what the ChangeOrder carries; the other says what promoting into
                a given stage would write. Overlapping field names, different
                questions.

                Costs no extra request: both sides are already fetched for the
                comparison above, and the answer cannot vary by stage.
              */}
              {/*
                The ChangeSets the change was made in, with their Descriptions, ahead of the
                diff: what the change is meant to be, then what it did.
              */}
              <ChangeOrderChangeSets changeSets={changeSets} baseSpaceId={detail.baseSpaceId} />
              {heroEligible ? (
                <ImageChangeSummary
                  changes={imageChanges}
                  stageNames={heroStageNames}
                />
              ) : null}
              {changes.sourceSpaceGroups.length > 0 || changes.sourceUnits.length > 0 ? (
                <>
                  <FullDiffDisclosure
                    changeCount={fullDiffCounts.changes}
                    unitCount={fullDiffCounts.units}
                    imagesOnly={heroEligible && imageChanges.status === 'some' && imageChanges.fieldChanges.count === 0}
                    hintText={onlyChangesHint(imageChanges.images)}
                    expanded={fullDiffOpen}
                    onToggle={toggleFullDiff}
                    renderBody={() =>
              changes.sourceSpaceGroups.length > 0 ? (
                /*
                  An Invoke ChangeOrder's source is what running its Invocation
                  changes: the in-scope Spaces grouped as a stage's are, so
                  Spaces where it makes the same change show one diff.
                */
                <Box
                  component="section"
                  role="region"
                  aria-label="At the source"
                  sx={{ marginTop: '14px' }}
                >
                  <Box
                    component="h3"
                    sx={{
                      fontSize: changeOrderType.size.prose,
                      lineHeight: changeOrderType.lineHeight.heading,
                      fontWeight: changeOrderType.weight.semibold,
                      margin: '0 0 8px',
                    }}
                  >
                    At the source
                  </Box>
                  <Box>
                    {changes.sourceSpaceGroups.map((group) => {
                      const { changedUnits, blockedUnits } = partitionSourceUnitsByChange(
                        cardRepresentativeUnits(changes.sourceUnits, group.representativeSpaceId, detail.skippedUnits),
                        changes.sourceGroupsByUnitId,
                      );
                      return (
                        <Box key={group.representativeSpaceId} sx={{ marginBottom: '10px' }}>
                          <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, marginBottom: '4px' }}>
                            {changeOrderCopy.invocationSource.groupCaption(group.labels)}
                          </Box>
                          {changedUnits.length === 0 && blockedUnits.length === 0 ? (
                            <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 10px' }}>
                              No fields differ here.
                            </Box>
                          ) : (
                            [...changedUnits, ...blockedUnits].map(renderSourceUnit)
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              ) : changes.sourceUnits.length > 0 ? (
                <Box
                  component="section"
                  role="region"
                  aria-label="At the source"
                  sx={{ marginTop: '14px' }}
                >
                  <Box
                    component="h3"
                    sx={{
                      fontSize: changeOrderType.size.prose,
                      lineHeight: changeOrderType.lineHeight.heading,
                      fontWeight: changeOrderType.weight.semibold,
                      margin: '0 0 8px',
                    }}
                  >
                    At the source
                  </Box>
                  {/*
                    The card is not the whole change when something was
                    omitted, and saying so is the difference between a partial
                    list and a partial list that reads as complete.
                  */}
                  {changes.sourceDropped > 0 ? (
                    <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, marginBottom: '8px' }}>
                      {changes.sourceDropped}{' '}
                      {changes.sourceDropped === 1 ? 'resource is' : 'resources are'} not shown here —
                      what the change did to them could not be read.
                    </Box>
                  ) : null}
                  <Box>
                    {/*
                      A unit the ChangeOrder never touched is not shown here —
                      it is already accounted for in "Passed over" — so
                      `visibleSourceUnits` filters it out rather than
                      repeating it. A unit that IS in scope but has nothing
                      left to write (its value already matches) still shows,
                      with its own "No fields differ here" line below, inside
                      the "Unchanged" group beneath the resources that do move
                      — see `visibleSourceUnits`'s own comment for why that is
                      a different case from "skipped".
                    */}
                    {visibleSourceUnits.length === 0 ? (
                      <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
                        Every resource here was passed over — see "Passed over" below.
                      </Box>
                    ) : (
                      <>
                        {changedSourceUnits.map(renderSourceUnit)}
                        {/*
                          The resources this change does not move are not listed
                          at all. This screen reports what the change does, and a
                          resource it leaves alone is not that.
                          The exception below is the resource the change DID try
                          to alter and could not, which reads identically in the
                          diffs — both are empty — and could not be more
                          different to a reader.
                        */}
                        <ChangeOrderBlockedResources
                          units={blockedSourceUnits}
                          renderUnit={renderSourceUnit}
                        />
                      </>
                    )}
                  </Box>
                </Box>
              ) : null}
                  />
                </>
              ) : null}
              <PassedOver
                skippedUnits={detail.skippedUnits}
                spaceIdByUnitId={changes.spaceIdByUnitId}
                slugByUnitId={changes.slugByUnitId}
                fallbackLabel="a resource outside this view"
                expanded={skippedExpanded}
                onToggle={() => setSkippedExpanded((prev) => !prev)}
                sx={{ marginTop: '14px' }}
              />

              {detail.abortedReason !== '' ? (
                <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
                  Aborted: {detail.abortedReason}
                </Box>
              ) : null}
            </Box>
            </Box>
          </SummaryCard>

          <Box
            component="section"
            role="region"
            aria-label="Promotion path"
            sx={{
              /* Same `.rail-block` card treatment as the head above it. */
              marginTop: '20px',
              background: changeOrderSurface.card,
              border: `1px solid ${changeOrderBorder.default}`,
              borderRadius: `${changeOrderCardTokens.radius}px`,
              boxShadow: changeOrderCardTokens.shadow,
              padding: '20px 20px 22px',
            }}
          >
            <Box
              component="h2"
              sx={{
                fontSize: changeOrderType.size.prose,
                lineHeight: changeOrderType.lineHeight.heading,
                fontWeight: changeOrderType.weight.semibold,
                margin: '0 0 12px',
              }}
            >
              Promotion path
            </Box>
            {detail.consoleRow !== undefined && pathRow === undefined ? (
              <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
                {detail.consoleRow.blocker}
              </Box>
            ) : detail.sequence.stages.length === 0 ? (
              <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
                {detail.scopedSpaces === null
                  ? 'The server did not report which Spaces this ChangeOrder targets, so no sequence can be built.'
                  : changeOrderCopy.emptyNoStages.title}
              </Box>
            ) : (
              <ChangeOrderStageRail
                stageStates={detail.stageStates}
                stagesDone={detail.stagesDone}
                selectedStageId={selectedStage?.stageId}
                nextStageId={detail.nextStageId}
                hrefForStage={hrefForStage}
                completeTone={completeTone}
                completeAbandoned={completeAbandoned}
                completeLabel={completeLabel}
                completeSelected={completeSelected}
                finalGates={finalGates}
                sourceSummary={sourceSummary}
                reviewRail={coReviews.railByStageId}
                completeReview={coReviews.completeRail}
                completeNotOpen={
                  Object.values(coReviews.byGateKey).find((g) => g.gate.kind === 'final')?.primary?.notEvaluated === 'finalNotOpen'
                }
              />
            )}
            <SequenceProblems problems={detail.sequence.problems} />
          </Box>

          {selectedStage ? (
            <Box
              component="section"
              role="region"
              aria-label={`Stage ${selectedStageName}`}
              sx={{
                /* Same `.detail` card treatment; overflow hidden so the sunk
                   head band's own corners don't square off past the card's. */
                marginTop: '20px',
                background: changeOrderSurface.card,
                border: `1px solid ${changeOrderBorder.default}`,
                borderRadius: `${changeOrderCardTokens.radius}px`,
                boxShadow: changeOrderCardTokens.shadow,
                // `clip`, not `hidden`: `hidden` makes a scroll container, and
                // the sticky review panel inside would then never stick.
                overflow: 'clip',
              }}
            >
              <Box
                sx={{
                  /* `.detail-head`: the sunk header band every card in the
                     design uses to separate its title row from its body. */
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                  padding: '14px 20px',
                  background: changeOrderSurface.sunk,
                  borderBottom: `1px solid ${changeOrderBorder.default}`,
                }}
              >
                <Box
                  component="h2"
                  sx={{
                    fontSize: changeOrderType.size.heading,
                    lineHeight: changeOrderType.lineHeight.heading,
                    fontWeight: changeOrderType.weight.semibold,
                    fontFamily: changeOrderFontMono,
                    letterSpacing: '-0.01em',
                    margin: 0,
                  }}
                >
                  {selectedStageName}
                </Box>
                {/*
                  The chip follows this stage's own review gates: its release, the first
                  stage's entry over the own Space, or (before its change lands) its entry
                  gate over the stage before. A review here of the next stage's entry gate
                  is not this stage's state, so the stage keeps its own label then.
                */}
                {reviewedStageSelected && ownSectionSummary !== undefined ? (
                  <ReviewStageChip summary={ownSectionSummary} readiness={readinessOf(ownSectionSummary)} />
                ) : entryStatusSummary !== undefined ? (
                  <ReviewStageChip summary={entryStatusSummary} readiness={readinessOf(entryStatusSummary)} />
                ) : (
                  <StateChip label={selectedStage.label} tone={changeOrderInk.muted} />
                )}
                {reviewedStageSelected || entryStatusSummary !== undefined ? (
                  <Box
                    component="span"
                    data-testid="review-stage-spaces"
                    sx={{ marginLeft: 'auto', fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}
                  >
                    {reviewedStageSelected ? reviewCopy.stage.reviewedIn : reviewCopy.stage.evaluatedOver}{' '}
                    <Box component="span" sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.muted }}>
                      {(reviewedStageSelected ? reviewSummary : entryStatusSummary)?.gateSpaces.map((space) => space.spaceSlug).join(', ')}
                    </Box>
                  </Box>
                ) : null}
              </Box>

              {/*
                TWO COLUMNS WHEN THE STAGE HAS REVIEWS: the stage content on the
                left, unchanged, and the review panel on the right, sticky. One
                column under 1180px, with the panel below and not sticky.
              */}
              <Box
                sx={
                  reviewedStageSelected
                    ? {
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0,1fr) 384px',
                        alignItems: 'start',
                        '@media (max-width: 1179.98px)': { gridTemplateColumns: 'minmax(0,1fr)' },
                      }
                    : undefined
                }
              >
              <Box sx={{ padding: '18px 20px 22px', minWidth: 0 }}>
              {gates.length > 0 ? (() => {
                // Same shared derivation the connector pill and the per-component
                // side pane's gates bar use (`changeOrderGates.ts`), so this summary
                // and those surfaces can never disagree about what holds a stage.
                // `held` and `unknown` are different claims and draw differently:
                // one is a refusal somebody issued, the other a check nobody made.
                const tally = tallyGates(gates);
                const gateState = gateStateFor(gates);
                /*
                 * Open by default whenever the stage is not clear — the gate
                 * list IS the explanation of why, so a reader should not have to
                 * click to see it. `gateOverride` still wins once they have
                 * touched the toggle themselves, in either direction.
                 */
                const expanded = gateOverride[selectedStage.stageId] ?? gateState !== 'open';
                return (
                  <GateDisclosure
                    state={gateState}
                    summary={
                      <>
                        {tally.satisfied} of {tally.total} satisfied
                      </>
                    }
                    bodyId={`gate-list-${selectedStage.stageId}`}
                    expanded={expanded}
                    onToggle={() => setGateOverride((prev) => ({ ...prev, [selectedStage.stageId]: !expanded }))}
                  >
                    {/*
                      The rows are this stage's own entry gates, so their review
                      progress is its own entry gate's, whichever card reviews it.
                    */}
                    <ChangeOrderGateList
                      stageId={selectedStage.stageId}
                      gates={ownEntrySummary !== undefined ? reviewGatesForList(gates, ownEntrySummary) : gates}
                      isSource={selectedStage.verdict === 'source'}
                      extras={
                        ownEntrySummary === undefined
                          ? undefined
                          : ownEntryReviewedOn === undefined
                            ? reviewGateExtras(gates, ownEntrySummary, () => goToReview('panel', undefined))
                            : reviewGateExtras(
                                gates,
                                ownEntrySummary,
                                ownEntryFormOn === undefined ? undefined : () => goToReview('review', ownEntryFormOn),
                                reviewCopy.stage.reviewIn(reviewSubject(ownEntrySummary).name),
                                reviewSubject(ownEntrySummary).name,
                              )
                      }
                    />
                  </GateDisclosure>
                );
              })() : null}
              {reviewedStageSelected
                ? sectionSummaries.map((summary) => <ReviewGateBlockedLine key={summary.gate.key} summary={summary} />)
                : null}
              {entryStatusSummary !== undefined && ownEntryReviewedOn !== undefined ? (
                <>
                  <ReviewGateBlockedLine
                    summary={entryStatusSummary}
                    onGoToSubject={ownEntryFormOn === undefined ? undefined : () => goToReview('panel', ownEntryFormOn)}
                  />
                  <ReviewEntryStatus
                    summary={entryStatusSummary}
                    onGo={ownEntryFormOn === undefined ? undefined : () => goToReview('panel', ownEntryFormOn)}
                  />
                </>
              ) : null}

              <Box sx={{ marginTop: '12px' }}>
                {/*
                  Its OWN row, above the buttons — not squeezed into the same
                  flex row as them. At this card's actual width that row had
                  three things fighting for space (two buttons plus a
                  multi-line sentence) and every one of them wrapped, "to"
                  included, into something unreadable. A row of its own gets
                  the sentence its full width, and the buttons below get
                  theirs.
                */}
                {actions.lastResult !== null && !actions.lastResult.ok ? (
                  /*
                    NAMED, because it is the only place a promotion says what
                    went wrong. A 207 resolves without throwing and a Space the
                    promotion passed over carries no error field at all, so this
                    sentence is the whole of what stands between a reader and a
                    silent half-promotion — and a test that cannot address it
                    cannot check that it appeared.
                  */
                  <Box
                    data-testid="change-order-foot-error"
                    sx={{ fontSize: changeOrderType.size.body, color: changeOrderStatus.danger, marginBottom: '8px' }}
                  >
                    {actions.lastResult.message}
                  </Box>
                ) : null}
                <Box sx={{ display: 'flex', gap: `${changeOrderShape.gap.md}px`, flexWrap: 'wrap' }}>
                {/*
                  Rendered and disabled rather than hidden where the stage is
                  the source or already released: the affordance exists in
                  this design, and hiding it would misreport the screen as one
                  that never offers the action.

                  `verdict === 'promoted'` gets a DIFFERENT button, not this
                  one disabled — that verdict means the stage already took the
                  change but was promoted alone (`actions.promote`, not
                  `promoteAndRelease`), which is real, unfinished work still
                  waiting on this screen, not a reason to go inert. Re-running
                  Promote there would re-clone/re-upgrade what already landed
                  for no reason; Release is the one action actually left —
                  ONLY when `stageHasTargets`, though: a stage none of whose
                  variants can ever publish never has that unfinished work.
                  `promoted` is its terminal state, same as `released` is for
                  a stage that can — so it falls through to the disabled
                  branch below instead of offering a release with nothing
                  behind it.
                */}
                {selectedStage.verdict === 'promoted' && stageHasTargets ? (
                  <Button
                    size="small"
                    variant="contained"
                    sx={{
                      backgroundColor: componentTheme.done,
                      '&:hover': { backgroundColor: componentTheme.doneEmphasis },
                    }}
                    /*
                      Held by a release review the same way Promote is held by
                      an entry gate: the release dry run refuses (422) on a
                      review requirement, and the line above says why. When the
                      UI cannot read the verdict, the button stays enabled.
                    */
                    disabled={actions.busy || detail.abortedReason !== '' || releaseHeldByReview}
                    data-release-held={releaseHeldByReview ? 'true' : 'false'}
                    onClick={() => {
                      setAnnouncement(`Releasing ${selectedStageName}.`);
                      void actions.release(stageSpaceIds).then((r) => {
                        setAnnouncement(
                          r.ok ? `Released ${selectedStageName}.` : r.message,
                        );
                      });
                    }}
                    data-release-stage={selectedStage.stageId}
                  >
                    Release to {selectedStageName}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    /*
                      NOT the MUI default primary. `theme.palette.primary.main`
                      is ConfigHub's own brand rust — correct for the navbar,
                      which the overnight scope keeps as-is, and wrong for this
                      page. The reference's blue accent has since been replaced
                      by the same purple the Components view uses for its one
                      primary action (`componentTheme.done`/`doneEmphasis`),
                      matching `PromoteDialog.tsx`'s own confirm button so the
                      two surfaces that trigger the same action agree on its
                      colour.
                    */
                    sx={{
                      backgroundColor: componentTheme.done,
                      '&:hover': { backgroundColor: componentTheme.doneEmphasis },
                    }}
                    disabled={
                      actions.busy
                      || detail.abortedReason !== ''
                      || selectedStage.verdict === 'source'
                      || selectedStage.verdict === 'released'
                      // A targetless stage that already took the change has
                      // nothing left to do — `promoted` is as far as it ever
                      // goes, same reason `released` disables the button above.
                      || (selectedStage.verdict === 'promoted' && !stageHasTargets)
                    }
                    onClick={() => {
                      setPromoteOpen(true);
                      /*
                        Plan it before confirming it. The dialog states what
                        this promotion reaches, and the plan it comes back with
                        is sent with the promotion itself, so what was previewed
                        is what gets written or nothing is.

                        A stage held by a gate that failed is not previewed: the
                        gates below are what its dialog reports. One whose gates
                        were only not evaluated is, and the server's verdict on
                        them comes back with the preview.
                      */
                      void actions.preview(stageSpaceIds, { failedGateCount });
                    }}
                    data-promote-stage={selectedStage.stageId}
                    /*
                      The gate state is on the control, not in it: the button
                      still opens the dialog, because a reader clicking it is
                      owed the reason the stage is held rather than a control
                      that does nothing. The dialog offers no way to proceed,
                      and `confirmPromote` refuses regardless.
                    */
                    data-promote-gated={gatesBlock ? 'true' : 'false'}
                  >
                    Promote to {selectedStageName}
                  </Button>
                )}
                </Box>
              </Box>
              <Box
                component="section"
                role="region"
                aria-label={invocationSourceSelected ? changeOrderCopy.invocationSource.selectedHeading : 'What this promotion writes'}
                sx={{ marginTop: '18px' }}
              >
                <Box
                  component="h3"
                  sx={{
                    fontSize: changeOrderType.size.prose,
                    lineHeight: changeOrderType.lineHeight.heading,
                    fontWeight: changeOrderType.weight.semibold,
                    margin: '0 0 10px',
                  }}
                >
                  {invocationSourceSelected ? changeOrderCopy.invocationSource.selectedHeading : 'What this promotion writes'}
                </Box>
                {unknownGroup !== undefined ? (
                  <OutcomeUnknownNote variants={unknownVariants} hrefFor={unknownVariantHref} />
                ) : null}
                {invocationSourceSelected ? null : comparableGroups.length < 2 ? (
                  /*
                   * NO BAR FOR FEWER THAN TWO COMPARABLE OUTCOMES.
                   *
                   * The bar's job is proportion — how a stage came out several
                   * ways at once. With one comparable group there is no
                   * proportion to show, and a full-width single segment above
                   * a card that already says "N variants · Same change" is the
                   * same claim twice. The card carries it.
                   *
                   * `outcome.tooFewToCompare` names a DIFFERENT reason for the
                   * same absence: genuinely fewer than two variants exist at
                   * all. Filtering `unknown` out can also leave fewer than two
                   * comparable groups while several variants really do exist
                   * — the note above already said so, and "one variant in
                   * this stage" would be false for those, not just redundant.
                   */
                  outcome.tooFewToCompare ? (
                    <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, marginBottom: '10px' }}>
                      One variant in this stage, so there is nothing to compare it against.
                    </Box>
                  ) : null
                ) : (
                  <OutcomeBreakdown segments={comparableSegments} variantCount={outcome.variantCount}>
                    {/*
                      A partial stage's counts are a FLOOR, not the stage's
                      total. Presenting one Space's contents as the whole stage
                      is the failure `contributingSpaceCount` exists to prevent,
                      so the qualification is not decoration.
                    */}
                    {/*
                      A resource this grid could not place is a resource nobody
                      compared, and the outcome above says nothing about it. The
                      counts existed but reached no reader, which made them a
                      record of a decision rather than a report of one — so the
                      grid could drop a resource and still read as a full answer.
                    */}
                    {omittedResourceCount > 0 ? (
                      <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted, marginTop: '6px' }}>
                        {omittedResourceCount === 1
                          ? '1 resource is not in this comparison, so the outcome above does not cover it.'
                          : `${omittedResourceCount} resources are not in this comparison, so the outcome above does not cover them.`}
                      </Box>
                    ) : null}
                    {undecidedResourceCount > 0 ? (
                      <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted, marginTop: '6px' }}>
                        {undecidedResourceCount === 1
                          ? '1 resource is held under more than one namespace in a Space, so the variants could not be compared for it.'
                          : `${undecidedResourceCount} resources are held under more than one namespace in a Space, so the variants could not be compared for them.`}
                      </Box>
                    ) : null}
                    {outcome.partial ? (
                      <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted, marginTop: '6px' }}>
                        Some Spaces of this stage hold no resources yet, so these counts are a floor.
                      </Box>
                    ) : null}
                    {shortfall !== 0 ? (
                      <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderStatus.danger, marginTop: '6px' }}>
                        Segments do not account for every variant ({shortfall} unaccounted). This is
                        a defect in the grouping, not a state of the ChangeOrder.
                      </Box>
                    ) : null}
                  </OutcomeBreakdown>
                )}
                {invocationSourceSelected && detail.invocationSource !== undefined ? (
                  <InvocationSourceDetails source={detail.invocationSource} />
                ) : changes.isLoading ? (
                  <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
                    Working out what this promotion writes…
                  </Box>
                ) : changes.units.length === 0 ? (
                  <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
                    {changeOrderCopy.noResourcesYet}
                  </Box>
                ) : comparableGroups.length === 0 ? (
                  // Every variant landed in `unknown` — the note above already
                  // said so; an empty grid here would say nothing further and
                  // read as though the stage had no variants at all.
                  <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
                    Nothing here could be compared this round.
                  </Box>
                ) : (
                  /*
                   * ONE TREE PER GROUP, NOT PER VARIANT — the whole point of the
                   * grouping. A stage with 7 Spaces taking one change rendered 7
                   * byte-identical trees, leaving the reader to find the
                   * divergence (the signal) by eye among the repetition (the
                   * noise). Members of a group take the same change by
                   * construction, so a group renders its representative ONCE and
                   * says how many variants it stands for.
                   *
                   * Sameness comes from `buildStageMatrix`, whose `diffSignature`
                   * keys on PATH AND NEW VALUE ONLY — the old value is
                   * deliberately excluded, so two variants arriving at the same
                   * value from different starting points are correctly ONE group.
                   * Keying on the starting point would report a difference in
                   * where they were, not in what the promote does to them.
                   */
                  <OutcomeGroupCards
                    stageId={selectedStage.stageId}
                    groups={comparableGroups}
                    units={changes.units}
                    groupsByUnitId={changes.groupsByUnitId}
                    skippedUnits={detail.skippedUnits}
                    expanded={groupsExpanded}
                    onToggle={() => setGroupsExpanded((prev) => !prev)}
                    renderUnit={renderRepUnit}
                  />
                )}
              </Box>
              </Box>
              {reviewedStageSelected ? (
                <Box
                  sx={{
                    borderLeft: `1px solid ${changeOrderBorder.default}`,
                    alignSelf: 'stretch',
                    minWidth: 0,
                    '@media (max-width: 1179.98px)': {
                      borderLeft: 0,
                      borderTop: `1px solid ${changeOrderBorder.default}`,
                    },
                  }}
                >
                  <Box
                    sx={{
                      position: 'sticky',
                      top: 16,
                      '@media (max-width: 1179.98px)': { position: 'static' },
                    }}
                  >
                    <ReviewPanel
                      reviews={reviews}
                      summary={reviewSummary}
                      otherGatesHolding={otherHoldingGates}
                      orderSlug={detail.slug}
                      viewerName={userInfo?.DisplayName}
                      now={reviewNow}
                      approveRef={approveRef}
                      onRecorded={onReviewRecorded}
                      onNotice={showNotice}
                    />
                  </Box>
                </Box>
              ) : null}
              </Box>
            </Box>
          ) : null}

          {/*
            The only panel on screen when the Complete step is selected: it is a
            step of its own on the rail, and `selectedStage` resolves to
            `undefined` for it, so no stage panel is stacked above this one.
          */}
          {completeSelected && completeStage !== null ? (
            <CompleteStepDetail
              label={completeLabel}
              gates={finalGates}
              signOff={
                signOffSelected
                  ? {
                      summary: reviewSummary,
                      extras: reviewGateExtras(finalGates, reviewSummary, () => goToReview('panel', undefined)),
                      panel: (
                        <ReviewPanel
                          reviews={reviews}
                          summary={reviewSummary}
                          orderSlug={detail.slug}
                          viewerName={userInfo?.DisplayName}
                          now={reviewNow}
                          approveRef={approveRef}
                          onRecorded={onReviewRecorded}
                          onNotice={showNotice}
                        />
                      ),
                    }
                  : undefined
              }
            />
          ) : null}

          {/* Last: the record of what happened, below what the selected step does now. */}
          <ChangeOrderHistory history={history} />
        </>
      ) : null}
    </Box>
  );
}
