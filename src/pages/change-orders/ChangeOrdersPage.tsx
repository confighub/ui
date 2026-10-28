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
 * A KNOWN RISK RIDES ON EVERY PROMOTE THIS PAGE OFFERS: a promotion gate can
 * report itself satisfied when a Space has not received the change. Stated in
 * full beside the action, in `stage/useStageConfirm.ts`.
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
import { changeOrderCopy, stageDisplayName } from '../x/apps/change-order/changeOrderCopy';
import { changeOrdersConsoleCopy } from '../x/apps/change-order/changeOrdersConsoleCopy';
import { changeOrderOwnSpaceReached } from '../x/apps/change-order/changeOrderStages';
import { componentSpaceDeepLink } from '../x/apps/change-order/changeOrdersConsoleModel';
import { unitLinksHref } from '../unit-detail/unitDetailHrefs';
import type { ConsoleState } from '../x/apps/change-order/changeOrdersConsoleModel';
import type { ChangeOrderGate, ChangeOrderStage } from '../x/apps/change-order/changeOrderTypes';
import { TreeDiffSection } from '../x/apps/TreeDiffSection';
import { ROUTE_COMPONENTS } from '../x/apps/appTypes';
import type { MergedUnit } from '../x/apps/componentTypes';
import Button from '@mui/material/Button';

import { EndChangeOrderDialog } from '../x/apps/change-order/EndChangeOrderDialog';
import { hasPromotionPath, changeOrderIntents } from '../x/apps/change-order/changeOrdersConsoleModel';
import type { ChangeOrderEndIntent } from '../x/apps/change-order/changeOrderRollback';
import { useEndChangeOrder } from '../x/apps/change-order/useEndChangeOrder';
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
import { cardRepresentativeUnits, rowRefusals } from './changeOrderCard';
import { partitionSourceUnitsByChange, useChangeOrderConsoleChanges } from './useChangeOrderConsoleChanges';
import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderFontMono,
  changeOrderFontSans,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from './changeOrdersTokens';
import { ChangeOrderBlockedResources, ChangeOrderRefusals } from './changeOrderRefusals';
import { FOCUS_TITLE_STATE, changeOrderPath } from './changeOrderAddress';
import { useSharedDiffColumns } from './useSharedDiffColumns';
import { UnitDiffRow } from './components/UnitDiffRow';
import { Fact, FactLink, OpenedAt, StateChip, SummaryCard } from './components/SummaryFacts';
import { useChangeOrderDetail, type ChangeOrderSpace } from './useChangeOrderDetail';
import { useChangeOrderImageChanges } from './useChangeOrderImageChanges';
import { useChangeOrderChangeSets } from './useChangeOrderChangeSets';
import { ChangeOrderChangeSets } from './components/ChangeOrderChangeSets';
import { OrganizationRow } from '@/components/organization-switcher/OrganizationRow';
import { FullDiffDisclosure, ImageChangeSummary } from './components/ImageChangeHero';
import { onlyChangesHint } from './imageChangeCopy';
import { imageChangesForSource } from './imageChange';
import Snackbar from '@mui/material/Snackbar';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { ReviewBand, type ReviewBandAction } from './reviews/ReviewBand';
import { ReviewChip, ReviewGateActions, ReviewGateSpaces } from './reviews/reviewParts';
import type { ChangeOrderGateExtra } from '../x/apps/change-order/ChangeOrderGateList';
import { recordedToastText, reviewCopy, reviewFeeds, reviewSubject } from './reviews/reviewCopy';
import { AnnounceContext } from './reviews/announceContext';
import { REVIEW_PANEL_ID } from './reviews/reviewAnchor';
import { ReviewPanel } from './reviews/ReviewPanel';
import { ReviewCommentsProvider } from './review-comments/ReviewCommentsProvider';
import { useReviewDiffComments } from './review-comments/useReviewDiffComments';
import { ReviewConversation } from './review-comments/ReviewConversation';
import { useChangeOrderReviewComments } from './review-comments/useChangeOrderReviewComments';
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
import { PassedOver } from './components/PassedOver';
import { SequenceProblems } from './components/SequenceProblems';
import { ChangeOrderStageRail } from './components/ChangeOrderStageRail';
import { completeRailDot, railDot } from './components/railDots';
import { reviewActionStageId, releaseReviewOf } from './stage/stageReviewModel';
import { StageSection, type StageSectionHandle } from './stage/StageSection';

/**
 * The header status chip's own tone, per `ConsoleState`.
 *
 * ⚠️ THE CHIP MUST BE TONED BY STATE, not by a single colour. Every state
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
  ready: changeOrderStatus.progress,
  degraded: changeOrderStatus.danger,
  blocked: changeOrderStatus.warn,
  held: changeOrderStatus.warn,
  progressing: changeOrderStatus.progress,
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
): { tone: 'bad' | 'progress' | 'ok' | 'warn'; text: string } {
  if (summary.state === 'rejected') return { tone: 'bad', text: words.rejected };
  const kind = summary.gate.kind;
  if (summary.open) {
    if (kind === 'entry' && readiness?.kind === 'ready') return { tone: 'progress', text: reviewCopy.summaryChip.ready };
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
            outline: `2px solid ${changeOrderAction.focus}`,
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
          Checked over the last stage&rsquo;s Spaces.
        </Box>
        {gates.length === 0 ? (
          <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
            No ChangeWorkflow.
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
  const { search, hash, state: navigationState } = useLocation();
  const detail = useChangeOrderDetail({ space, slug, stage });
  // Arriving from the draft that created it: the title takes the keyboard once, when it is drawn.
  const focusTitle = (navigationState as Record<string, unknown> | null)?.[FOCUS_TITLE_STATE] === true;
  const titleFocused = useRef(false);
  const titleRef = useCallback(
    (title: HTMLElement | null) => {
      if (title === null || !focusTitle || titleFocused.current) return;
      titleFocused.current = true;
      title.focus({ preventScroll: true });
    },
    [focusTitle],
  );
  const { address } = detail;
  /** Whether the URL addresses a ChangeOrder at all, rather than the console. */
  const addressed = address?.kind !== 'none';
  /** The stage segment, wherever the address form put it. */
  const stageParam = address?.kind === 'found' ? address.stage : undefined;
  /** The URL names the Complete step — the same `:stage` segment a real stage uses. */
  const completeSelected = stageParam === COMPLETE_STAGE_ID;

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
  /*
   * REVIEWS: attestation prerequisites (`reviews/`). The selected stage's card
   * hosts its own reviews (`StageSection`); the page keeps the Complete step's
   * Final sign-off and the band in the summary card, which is for the next stage
   * and may not be the one selected. The promote dry run stays the authority for
   * "satisfied" (`useStageReviews`).
   */
  const { userInfo } = useUserInfo();
  const coReviews = useChangeOrderReviews(detail, { poll: true });
  const stageVerdictOf = useCallback(
    (stageId: string) => detail.stageStates.find((s) => s.stageId === stageId)?.verdict,
    [detail.stageStates],
  );
  /** The Final sign-off, which only the Complete step hosts. */
  const signOffGates: ReviewGateRef[] = useMemo(
    () => (completeSelected ? Object.values(coReviews.byGateKey).filter((g) => g.gate.kind === 'final').map((g) => g.gate) : []),
    [coReviews.byGateKey, completeSelected],
  );
  const reviews = useGateReviews(detail, signOffGates);
  const reviewSummary = reviews.summary;
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
  const signOffSelected = completeSelected && reviewSummary !== undefined && reviewSummary.gate.kind === 'final';

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

  const [announcement, setAnnouncement] = useState('');
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
   * The "Full diff" disclosure, `undefined` meaning "no manual override yet",
   * so the default can depend on what is shown. Shut by default only when the change is
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
  /*
   * Review comments on the diffs: every comment names this ChangeOrder, and each is anchored to
   * the Revision its Unit's diff is read at (the end of the change at the source, the head a
   * stage's dry run runs on).
   */
  const reviewComments = useChangeOrderReviewComments(detail.found ? detail.changeOrderId : undefined);
  const diffCommentsFor = useReviewDiffComments(detail.found);
  const reviewVariantNameOf = useCallback(
    (unitId: string) => {
      const spaceId = changes.spaceIdByUnitId.get(unitId);
      return spaceId === undefined ? undefined : changes.spaceNameBySpaceId.get(spaceId);
    },
    [changes.spaceIdByUnitId, changes.spaceNameBySpaceId],
  );
  // The Units a stage diff's one row stands for, by the row they are on: their comments show there too.
  const rowKeyByUnitId = changes.matrix?.rowKeyByUnitId;
  const unitIdsByRowKey = useMemo(() => {
    const index = new Map<string, string[]>();
    for (const [unitId, key] of rowKeyByUnitId ?? []) index.set(key, [...(index.get(key) ?? []), unitId]);
    return index;
  }, [rowKeyByUnitId]);

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
          comments={diffCommentsFor({ unitId: unit.unitId, spaceId: unit.spaceId })}
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
      diffCommentsFor,
    ],
  );
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
   * The step whose card has the band's review form, by the rule every card follows
   * (`reviewActionStageId`), so "Review now" lands where the form is. Undefined while
   * the change the review reads has not landed: the band then offers no way to a review.
   */
  const bandFormStep =
    bandSummary === undefined ? undefined : reviewActionStageId(bandSummary, stageVerdictOf, releaseReviewOf(coReviews.byGateKey));
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

  /** Opens the stage card's Full diff, for a review comment whose row is inside it. */
  const stageRef = useRef<StageSectionHandle>(null);
  const revealStageDiff = useCallback(() => stageRef.current?.revealDiff(), []);

  return (
    <ReviewCommentsProvider reviews={reviewComments} revisionNumByUnitId={changes.reviewRevisionNumByUnitId} variantNameOf={reviewVariantNameOf}>
    {/* Components deep in the page announce through the one live region below. */}
    <AnnounceContext.Provider value={setAnnouncement}>
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
        // A flex item may otherwise grow to its widest content and widen every card in it.
        minWidth: 0,
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
        The dialog is mounted at the root and portals to `document.body`, so a
        fidelity probe scoped to this page's root will not see it unless it is
        given the portal container as a second selector.
      */}
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

      <OrganizationRow />

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
          changeOrderHref={(row) => changeOrderPath(row.spaceSlug, row.slug)}
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
            Pick the Space:
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
                  ref={titleRef}
                  tabIndex={-1}
                  data-testid="change-order-title"
                  sx={{
                    outline: 'none',
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
                        Every resource was passed over.
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
                  ? 'The server did not report the target Spaces.'
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
            <StageSection
              ref={stageRef}
              detail={detail}
              stage={selectedStage}
              changes={changes}
              coReviews={coReviews}
              history={history}
              workflow={{ href: workflowHref, label: changeWorkflowLabel(workflowId, workflowNames) }}
              hrefForStage={hrefForStage}
              hasComplete={completeStage !== null}
              diffDeps={{
                unitLinksHrefFor,
                diffColumns,
                fallbackColumnStyle: stableDiffColumnStyle,
                diffCommentsFor,
                unitIdsByRowKey,
              }}
              approveRef={approveRef}
              now={reviewNow}
              announce={setAnnouncement}
              onReviewRecorded={onReviewRecorded}
              onNotice={showNotice}
            />
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

          <ReviewConversation slugOf={(unitId) => changes.slugByUnitId.get(unitId)} revealDiffs={revealStageDiff} />

          {/* Last: the record of what happened, below what the selected step does now. */}
          <ChangeOrderHistory history={history} />
        </>
      ) : null}
    </Box>
    </AnnounceContext.Provider>
    </ReviewCommentsProvider>
  );
}
