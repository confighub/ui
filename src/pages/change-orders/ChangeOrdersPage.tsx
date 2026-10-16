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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { BoxProps } from '@mui/material/Box';
import type { SvgIconComponent } from '@mui/icons-material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import FolderCopyOutlinedIcon from '@mui/icons-material/FolderCopyOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import SyncAltOutlinedIcon from '@mui/icons-material/SyncAltOutlined';
import UpdateOutlinedIcon from '@mui/icons-material/UpdateOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import RemoveIcon from '@mui/icons-material/Remove';
import RestoreIcon from '@mui/icons-material/Restore';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

import { INFO_PEEK_TOOLTIP_SX } from '@/components/info-peek/InfoPeek';
import { ChangeOrderGateList } from '../x/apps/change-order/ChangeOrderGateList';
import { gateStateFor, gatesOpen, partitionBlockingGates, tallyGates } from '../x/apps/change-order/changeOrderGates';
import { gatesBlockPromotion } from '../x/apps/change-order/changeOrderFooterModel';
import { changeOrderCopy, skippedUnitReasonText, stageDisplayName } from '../x/apps/change-order/changeOrderCopy';
import { changeOrdersConsoleCopy } from '../x/apps/change-order/changeOrdersConsoleCopy';
import { changeOrderOwnSpaceReached, promotionTargets } from '../x/apps/change-order/changeOrderStages';
import { componentSpaceDeepLink } from '../x/apps/change-order/changeOrdersConsoleModel';
import { unitLinksHref } from '../unit-detail/unitDetailHrefs';
import type { ConsoleState } from '../x/apps/change-order/changeOrdersConsoleModel';
import type {
  ChangeOrderGate,
  ChangeOrderGateTally,
  ChangeOrderSequenceProblem,
  ChangeOrderStage,
  ChangeOrderStageState,
} from '../x/apps/change-order/changeOrderTypes';
import { TreeDiffSection } from '../x/apps/TreeDiffSection';
import { ConfigDiffView, type ConfigDiffColumns } from '@/components/config-diff/ConfigDiffView';
import { useColumnResize } from '../x/apps/useColumnResize';
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
import type { ChangeOrderOutcomeKind } from './changeOrderOutcome';
import {
  cardRepresentativeUnits,
  cardSpaceLabel,
  outcomeGroupKey, rowRefusals } from './changeOrderCard';
import { partitionSourceUnitsByChange, useChangeOrderConsoleChanges } from './useChangeOrderConsoleChanges';
import type { SourceUnitPartition } from './useChangeOrderConsoleChanges';
import {
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderInk,
  changeOrderFontMono,
  changeOrderFontSans,
  changeOrderKindLine,
  changeOrderSelectedRing,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from './changeOrdersTokens';
import { ChangeOrderBlockedResources, ChangeOrderRefusals } from './changeOrderRefusals';
import { changeOrderPath } from './changeOrderAddress';
import { useChangeOrderDetail, type ChangeOrderSpace } from './useChangeOrderDetail';
import { useChangeOrderImageChanges } from './useChangeOrderImageChanges';
import { useChangeOrderChangeSets } from './useChangeOrderChangeSets';
import { ChangeOrderChangeSets } from './components/ChangeOrderChangeSets';
import { FullDiffDisclosure, ImageChangeSummary } from './components/ImageChangeHero';
import { onlyChangesHint } from './imageChangeCopy';
import { imageChangesForSource } from './imageChange';
import Snackbar from '@mui/material/Snackbar';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
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
  StageReviewRail,
  StageReviewSummary,
  SubmitReviewOutcome,
} from './reviews/changeOrderReviewTypes';
import { useChangeOrderReviews, useGateReviews } from './reviews/useStageReviews';
import { useChangeOrderHistory } from './useChangeOrderHistory';
import { clockTime, shortDate, utcTime, zoneName } from './changeOrderHistory';
import { changeWorkflowHref, changeWorkflowLabel, useChangeWorkflowNames } from './useChangeWorkflowNames';

/**
 * A sequence problem, said plainly.
 *
 * `changeOrderStages.ts` degrades to "not in the sequence" and REPORTS rather than
 * guessing, on the stated grounds that a ChangeOrder view which quietly invents an
 * order is worse than one admitting it cannot find one. Carrying that answer to
 * the screen is the whole point; rounding it off here would undo it.
 */
function describeSequenceProblem(problem: ChangeOrderSequenceProblem): string {
  switch (problem.kind) {
    case 'no-workflow':
      return 'This ChangeOrder has no governing ChangeWorkflow, so no sequence could be built.';
    case 'stage-selects-nothing':
      return `Stage "${problem.stageName}" selects no Space.`;
  }
}

/**
 * Outcome tones and wording.
 *
 * `unknown` is deliberately NOT a failure tone and not a reassuring one — it is
 * its own thing, because "we could not establish this" is neither good news nor
 * bad. Rendering it as either would assert something the data does not support.
 *
 * `adds` MEANS BOTH HALVES OF WHAT IT SAYS — the change brings this resource,
 * and this variant does not hold it — WHENEVER THE AUTHORED CHANGE IS KNOWN.
 * `kindForSpace` then weighs only the rows that change carries, so a variant is
 * never grouped here for holding different resources the promote never mentions.
 * Until the base has been read there is no authored change to weigh against and
 * no row is excluded, so the label falls back to its second half alone. That is
 * the noisier reading, never the quieter one.
 *
 * `hint` is the plain-language half of each label, rendered under it. A label is
 * a name for an outcome and cannot also explain itself; "Adds resources" tells a
 * reader which group this is, and "do not hold it yet" tells them what it means
 * for the variants inside.
 */
const OUTCOME_META: Record<ChangeOrderOutcomeKind, { tone: string; label: string; hint: string }> = {
  same: { tone: changeOrderStatus.success, label: 'Same change', hint: 'take the change identically' },
  differs: { tone: changeOrderStatus.warn, label: 'Differs', hint: 'take a different change' },
  adds: { tone: changeOrderInk.muted, label: 'Adds resources', hint: 'do not hold it yet' },
  unknown: { tone: changeOrderInk.subtle, label: 'Could not establish', hint: 'not determinable this round' },
};

/**
 * The group-card badge's own soft fill, one step separate from
 * `OUTCOME_META.tone`. `same`/`differs` get the reference's real soft tint
 * (`--ok-soft`/`--wait-soft`) because `OUTCOME_META.tone` already agrees with
 * the reference there. `adds`/`unknown` stay neutral (`changeOrderSurface.inset`)
 * rather than the reference's literal blue/red — see the comment at the
 * badge's call site for why.
 */
const OUTCOME_BADGE: Record<ChangeOrderOutcomeKind, { bg: string; fg: string }> = {
  same: { bg: changeOrderStatus.successGround, fg: changeOrderStatus.success },
  differs: { bg: changeOrderStatus.warnSoft, fg: changeOrderStatus.warn },
  adds: { bg: changeOrderSurface.inset, fg: changeOrderInk.muted },
  unknown: { bg: changeOrderSurface.inset, fg: changeOrderInk.subtle },
};

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

/**
 * The partition an outcome card falls back to when its key is not in
 * `repUnitsByGroupKey` — a card with nothing to list, which renders the "no
 * resources yet" line rather than an empty split. A module constant so the
 * fallback is one object rather than a fresh literal per card per render.
 */
const EMPTY_UNIT_PARTITION: SourceUnitPartition<MergedUnit> = {
  changedUnits: [],
  blockedUnits: [],
  unchangedUnits: [],
};

/** The `--root` target for `check.mjs`. One stable selector, per U1. */
/** A Final gate's reason once the server reports the ChangeWorkflow complete. */
const WORKFLOW_COMPLETED_REASON = 'Satisfied: the server reports this ChangeWorkflow as complete.';

export const CHANGE_ORDERS_ROOT_ID = 'change-orders-root';

function StateChip({ label, tone }: { label: string; tone: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: `${changeOrderShape.radius.pill}px`,
        border: `1px solid ${tone}`,
        color: tone,
        padding: '2px 10px',
        fontSize: changeOrderType.size.small,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  );
}

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
 * A fact's value, as a link to somewhere else in the product. New tab,
 * deliberately: this page is a stopping point in its own right (a URL people
 * come back to, poll, share), and navigating away in place would discard it —
 * the same reasoning `ChangeOrderUnitHeader`'s own unit-detail link already
 * states for this module.
 */
function FactLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: changeOrderBorder.strong }}
    >
      {children}
    </Box>
  );
}

/**
 * One term/value pair in the header's fact grid. `icon` sits before the term,
 * in the term's ink; it is decorative (the term names the fact), so it stays
 * out of the accessibility tree.
 */
function Fact({
  term,
  icon: Icon,
  children,
  wide = false,
}: {
  term: string;
  icon?: SvgIconComponent;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0, gridColumn: wide ? 'span 2' : undefined }}>
      <Box
        component="dt"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: changeOrderType.size.micro,
          letterSpacing: '.07em',
          color: changeOrderInk.subtle,
          margin: 0,
        }}
      >
        {Icon !== undefined ? <Icon aria-hidden="true" sx={{ fontSize: 14, flex: '0 0 auto' }} /> : null}
        {term}
      </Box>
      <Box
        component="dd"
        sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.default, margin: 0, overflowWrap: 'anywhere' }}
      >
        {children}
      </Box>
    </Box>
  );
}

/**
 * The Opened fact, in the viewer's time zone with the zone named, as the History
 * card writes its times. Hover gives UTC, readable and then verbatim as the
 * server sent it. No weekday, so it fits its column on one line. A value that
 * does not parse is shown as it came, rather than as "Invalid Date".
 */
function OpenedAt({ value }: { value: string | undefined }) {
  if (value === undefined) return <>—</>;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return <>{value}</>;
  const utc = (
    <>
      <div>{utcTime(at)}</div>
      <div>{value}</div>
    </>
  );
  return (
    <Tooltip title={utc} describeChild placement="bottom-start">
      <Box component="time" dateTime={value}>
        {`${shortDate(at)}, ${clockTime(at)} ${zoneName(at)}`}
      </Box>
    </Tooltip>
  );
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
 * A list of unit rows behind one disclosure — the page's only implementation of
 * that control, mounted by "Passed over", by "At the source"'s unchanged group,
 * and by each outcome card's unchanged group.
 *
 * One component because all three answer the same kind of question: real,
 * checkable, and not what the reader opened this screen for. The
 * `aria-controls`/`id` pairing in particular only stays correct while it has a
 * single home — three hand-maintained copies of it drift the first time any one
 * of them is adjusted.
 *
 * `bodyId` is the caller's to supply because uniqueness is the caller's
 * problem: two of these render once per page and can be named literally, while
 * an outcome card's renders once per card and must derive its id from the card
 */
function CollapsibleUnitGroup({
  regionLabel,
  label,
  count,
  bodyId,
  expanded,
  onToggle,
  sx,
  children,
}: {
  /** Accessible name for the region — the visible label alone does not say whose resources these are. */
  regionLabel: string;
  label: string;
  /** The count exactly as this header states it: `(3)` in one place, `3 resources` in another. */
  count: React.ReactNode;
  /** `id` of the body, which the header's `aria-controls` points at. Must be unique on the page. */
  bodyId: string;
  expanded: boolean;
  onToggle: () => void;
  sx?: BoxProps['sx'];
  children: React.ReactNode;
}) {
  return (
    <Box component="section" role="region" aria-label={regionLabel} sx={sx}>
      <Box
        component="button"
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
        sx={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 12px',
          borderRadius: `${changeOrderShape.radius.md}px`,
          border: `1px solid ${changeOrderBorder.default}`,
          background: changeOrderSurface.sunk,
        }}
      >
        <Box
          sx={{
            fontSize: changeOrderType.size.small,
            fontWeight: changeOrderType.weight.semibold,
            color: changeOrderInk.default,
          }}
        >
          {label}
        </Box>
        <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>{count}</Box>
        <Box
          sx={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: changeOrderType.size.small,
            fontWeight: changeOrderType.weight.semibold,
            color: changeOrderInk.muted,
          }}
        >
          {expanded ? 'Hide' : 'Show'}
          <ExpandMoreIcon
            aria-hidden="true"
            sx={{
              fontSize: 18,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform .15s ease',
            }}
          />
        </Box>
      </Box>
      {expanded ? (
        <Box
          id={bodyId}
          sx={{
            border: `1px solid ${changeOrderBorder.default}`,
            borderRadius: `${changeOrderShape.radius.md}px`,
            marginTop: '6px',
            padding: '6px 12px',
          }}
        >
          {children}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Whether a stage is held on review: it is the next stage, it has not taken
 * the change, and its review requirements are waiting (`held`) or rejected
 * (`blocked`). `null` for a stage with no reviews, or one not held by them.
 */
function reviewHoldTone(
  state: ChangeOrderStageState,
  isNext: boolean,
  review: StageReviewRail | undefined,
): 'held' | 'blocked' | null {
  if (review === undefined || state.verdict === 'source') return null;
  // An entry review holds the next stage; a release review holds a promoted stage's release.
  if (review.gateKind === 'release' ? state.verdict !== 'promoted' : !isNext) return null;
  if (review.state === 'rejected') return 'blocked';
  if (review.state === 'pending' || review.state === 'partial') return 'held';
  return null;
}

/**
 * The rail node's leading dot, keyed off `ChangeOrderStageVerdict` the same way
 * the reference keys its own node off `stage.state` (`ICON.check`/`spin`/
 * `play`/`warn`/`lock` at line ~4224 of the mockup). `source`, `promoted` and
 * `released` all read as the reference's "done" — none of them is a stage
 * still to happen. `waiting` splits in two: the one stage the sequence would
 * promote next reads as "next" (a ready action), every later `waiting` stage
 * reads as the reference's untouched default (a future stage, locked).
 *
 * `passed` is the console row's own count (`stagePathProgress`): a stage the
 * ChangeOrder has passed is drawn done, so the rail, its pips and "N of M" agree.
 */
function railDot(state: ChangeOrderStageState, isNext: boolean, passed: boolean, review?: StageReviewRail) {
  const done = { Icon: CheckIcon, bg: changeOrderStatus.successGround, border: changeOrderStatus.successLine, color: changeOrderStatus.success };
  if (passed && state.verdict !== 'restored' && state.verdict !== 'restore-released') return done;
  // Held on review: the next stage waits on approvals (person) or a rejection blocks it (ban).
  const reviewTone = reviewHoldTone(state, isNext, review);
  if (reviewTone === 'blocked') {
    return { Icon: BlockIcon, bg: changeOrderStatus.dangerSoft, border: changeOrderStatus.dangerLine, color: changeOrderStatus.danger };
  }
  if (reviewTone === 'held') {
    return { Icon: PersonOutlineOutlinedIcon, bg: changeOrderStatus.warnSoft, border: changeOrderStatus.warnLine, color: changeOrderStatus.warn };
  }
  // The stage selects no Space, so there is no workload of its own to report
  // on: it is drawn neutral rather than in the danger tone of a failed gate.
  // What it does to the stage after it — the server refuses to promote past a
  // stage that selects no Space — is said on that stage's gate.
  if (state.verdict !== 'source' && state.spaceCount === 0) {
    return { Icon: RemoveIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
  }
  switch (state.verdict) {
    case 'source':
    case 'promoted':
    case 'released':
      return done;
    case 'in-progress':
      return { Icon: AutorenewIcon, bg: changeOrderStatus.accentSoft, border: changeOrderStatus.accentLine, color: changeOrderStatus.accent };
    case 'gated':
      return { Icon: WarningAmberOutlinedIcon, bg: changeOrderStatus.dangerSoft, border: changeOrderKindLine.unknown, color: changeOrderStatus.danger };
    case 'waiting':
      return isNext
        ? { Icon: PlayCircleOutlineIcon, bg: changeOrderStatus.accentSoft, border: changeOrderStatus.accentLine, color: changeOrderStatus.accent }
        : { Icon: LockOutlinedIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
    case 'unknown':
      return { Icon: LockOutlinedIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
    // Reverted, not a live problem — same neutral treatment as 'unknown'
    // rather than the danger tone 'gated' gets, so a reader does not mistake
    // an undone stage for one still failing a check.
    case 'restored':
    case 'restore-released':
      return { Icon: RestoreIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
  }
}

/**
 * The Complete node's leading dot, keyed off `completeStepTone` rather than a
 * stage verdict — the step has none, because it is not a stage.
 *
 * Same icons `railDot` draws (check / warning / lock / restore), so the
 * trailing node reads as one more node on the same rail rather than a second
 * vocabulary at the end of it.
 *
 * A complete ChangeOrder reads `done` whether or not its last stage's health was
 * checked. The rail's ticks report ARRIVAL, not health — every stage node to
 * the left draws a plain green tick off promote/release counts — and the
 * node's label ("Complete, unverified") says when health went unchecked.
 *
 * `blocked` takes the accent rather than the danger tone — something is
 * outstanding, which is a thing to do, not a thing that failed.
 *
 * ⚠️ `restored` NEEDS `abandoned` TO DRAW AT ALL, AND THE TONE ALONE CANNOT
 * SUPPLY IT. Two different ChangeOrders reach that tone (`completeStepTone` rung
 * 4) and only one of them was ever undone; `isCompleteStepAbandoned` is the
 * one place that tells them apart. An undo glyph on a ChangeOrder that was
 * abandoned in place claims a restore that never happened — the promotions it
 * had already made are still standing. The TREATMENT stays identical either
 * way, deliberately: both readings are terminal and unactionable, and an
 * abandoned ChangeOrder is not an error, so the neutral ground/border/ink is the
 * honest one for both and only the glyph moves.
 */
function completeRailDot(tone: CompleteStepTone, abandoned: boolean) {
  switch (tone) {
    case 'done':
      return { Icon: CheckIcon, bg: changeOrderStatus.successGround, border: changeOrderStatus.successLine, color: changeOrderStatus.success };
    case 'degraded':
      return { Icon: WarningAmberOutlinedIcon, bg: changeOrderStatus.dangerSoft, border: changeOrderKindLine.unknown, color: changeOrderStatus.danger };
    case 'blocked':
      return { Icon: WarningAmberOutlinedIcon, bg: changeOrderStatus.accentSoft, border: changeOrderStatus.accentLine, color: changeOrderStatus.accent };
    case 'restored':
      return {
        Icon: abandoned ? BlockIcon : RestoreIcon,
        bg: changeOrderSurface.sunk,
        border: changeOrderBorder.strong,
        color: changeOrderInk.subtle,
      };
    case 'gated':
      return { Icon: LockOutlinedIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
  }
}

/**
 * The connector between two adjacent rail nodes — the mockup's `.link`
 * (~line 4160): a small badge naming whether the gate INTO the right-hand
 * stage is passed, open or closed, plus the same satisfied/total tally
 * `changeOrderCopy.laneGateTally` already renders in the flow-graph lane, reused
 * rather than re-derived so the two surfaces cannot disagree about one count.
 *
 * Three states, matching the mockup's own vocabulary exactly (it has no
 * fourth): PASSED — this stage has already been entered, so whatever it took
 * to get here is history now (`promoted`/`released`/`source`). OPEN — this is
 * the one stage the sequence would promote into next; drawn as open
 * regardless of whether every one of its gates is actually satisfied yet,
 * matching the reference, because this is an at-a-glance overview and the
 * real breakdown is one click away in `ChangeOrderGateList`. CLOSED — everything
 * else, including `gated`: the reference has no separate red connector state,
 * and the node's own dot (`railDot`) still carries that distinction on the
 * stage it sits before, so nothing is lost by folding it into "closed" here.
 *
 * `aria-hidden`: a sighted-reader overview only. The tally is decorative
 * relative to the accessible tree — `ChangeOrderGateList` is the surface that
 * states a gate's outcome as a fact, once its stage is selected, and duplicating
 * that here would risk the two texts drifting apart, the exact failure this
 * file's own header on `railDot` names for the node dots.
 *
 * ⚠️ `data-testid` NAMES IT, DELIBERATELY. Nothing about this element's own
 * purpose needs one — MUI's own hashed class carries no meaning either way —
 * but `scripts/detail-compare.mjs`'s selector for this exact chrome element
 * matches on a class or testid CONTAINING "link"/"connector", the same
 * class-name-as-anchor shape `console-compare.mjs` had before tonight. Named
 * to satisfy a real query rather than to satisfy the harness's current
 * (imperfect) one.
 */
function StageLink({
  state,
  isNext,
  stagePassed = false,
  review,
}: {
  state: ChangeOrderStageState;
  isNext: boolean;
  /** Whether the ChangeOrder has passed the stage on the right, by the console row's count. */
  stagePassed?: boolean;
  /** The review state of the stage on the right, when it has reviews. */
  review?: StageReviewRail;
}) {
  const passed =
    stagePassed || state.verdict === 'promoted' || state.verdict === 'released' || state.verdict === 'source';
  const open = !passed && isNext;
  const hold = passed ? null : reviewHoldTone(state, isNext, review);
  let tone: { bg: string; border: string; color: string; Icon: SvgIconComponent } = passed
    ? { bg: changeOrderStatus.successGround, border: changeOrderStatus.successLine, color: changeOrderStatus.success, Icon: LockOpenOutlinedIcon }
    : open
      ? { bg: changeOrderStatus.accentSoft, border: changeOrderStatus.accentLine, color: changeOrderStatus.accent, Icon: ArrowForwardIcon }
      : { bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle, Icon: LockOutlinedIcon };
  let tally = changeOrderCopy.laneGateTally(state.gateTally.satisfied, state.gateTally.total);
  if (hold === 'held') {
    tone = { bg: changeOrderStatus.warnSoft, border: changeOrderStatus.warnLine, color: changeOrderStatus.warn, Icon: PersonOutlineOutlinedIcon };
  } else if (hold === 'blocked') {
    tone = { bg: changeOrderStatus.dangerSoft, border: changeOrderStatus.dangerLine, color: changeOrderStatus.danger, Icon: BlockIcon };
    tally = reviewCopy.rail.fail;
  }
  return (
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
}

/** One step of the rail: the link into a node, and the node. They wrap together. */
const RAIL_STEP_SX = { display: 'flex', gap: '10px', alignItems: 'stretch', flex: '0 0 auto' } as const;

/** The Complete node's sign-off line: "Sign-off 1/2" while waiting, "Rejected" when a rejection blocks it. */
function SignOffLine({ review, notOpen }: { review: StageReviewRail; notOpen: boolean }) {
  let color: string = changeOrderStatus.warn;
  let Icon: SvgIconComponent = PersonOutlineOutlinedIcon;
  let text: React.ReactNode = (
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
  let text: React.ReactNode = reviewCopy.rail.required(review.requirementCount);
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
 * Each node is a real `<button>` with `aria-pressed`, not a styled div —
 * `aria-pressed` and not `aria-expanded`, because selecting a stage rescopes the
 * screen rather than disclosing anything.
 */
function StageRail({
  stageStates,
  stagesDone,
  selectedStageId,
  nextStageId,
  spaceSlug,
  slug,
  completeTone,
  completeAbandoned,
  completeLabel,
  completeSelected,
  finalGates,
  sourceSummary,
  reviewRail = {},
  completeReview,
  completeNotOpen,
}: {
  stageStates: ChangeOrderStageState[];
  /** The steps the ChangeOrder has passed: stage `i` is passed when `i < stagesDone`. */
  stagesDone: number;
  selectedStageId: string | undefined;
  nextStageId: string | null;
  spaceSlug: string | undefined;
  slug: string;
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
  /** The Final sign-off's review state, for the Complete node. */
  completeReview?: StageReviewRail;
  /** The Final sign-off has no rows because Final is not open yet (PromoteResult.Complete false). */
  completeNotOpen?: boolean;
}) {
  const finalTally = tallyGates(finalGates);
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
        const dot = railDot(state, isNext, i < stagesDone, review);
        const hold = reviewHoldTone(state, isNext, review);
        let stageLabel = state.label;
        if (hold === 'held') stageLabel = review?.gateKind === 'release' ? reviewCopy.rail.releaseHeld : reviewCopy.rail.held;
        else if (hold === 'blocked') stageLabel = reviewCopy.rail.rejected;
        else if (isNext && review?.state === 'satisfied') stageLabel = reviewCopy.rail.ready;
        return (
          /* The link and the node it leads into wrap as one step, so a link is
             never left at the end of a row with its node on the next. */
          <Box data-testid="stage-rail-step" sx={RAIL_STEP_SX} key={state.stageId}>
            {/* One `StageLink` per pair, never before the first node — the
                source has no gate of its own to describe. */}
            {i > 0 && (
              <StageLink state={state} isNext={isNext} stagePassed={i < stagesDone} review={review} />
            )}
            <Box
              component={RouterLink}
              to={changeOrderPath(spaceSlug, slug, state.stageId)}
              aria-pressed={selected}
              role="button"
              sx={{
                textDecoration: 'none',
                /*
                  An anchor with no explicit colour computes the user agent's
                  default link blue — a value in no palette, contract or product.
                  Inheriting is not enough: the element itself carries the
                  computed colour even when every child overrides it.
                */
                color: changeOrderInk.default,
                fontSize: changeOrderType.size.body,
                minWidth: 150,
                textAlign: 'left',
                /*
                  ONE BORDER WIDTH, PLUS A RING. The contract has no 2px border,
                  and a selected state that thickens its own edge shifts its
                  content by a pixel. The inset ring is the contract's own
                  selection shape (`geometry.shadow`), so selecting a stage
                  changes colour and nothing else.
                */
                border: `${changeOrderShape.borderWidth}px solid ${
                  selected ? changeOrderStatus.accent : changeOrderBorder.default
                }`,
                boxShadow: selected ? changeOrderSelectedRing : 'none',
                borderRadius: `${changeOrderShape.radius.lg}px`,
                padding: '10px 12px',
                background: changeOrderSurface.page,
                display: 'block',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                {held && hold === null ? ' · held' : ''}
              </Box>
              {review !== undefined ? <StageReviewLine review={review} hold={hold} isNext={isNext} /> : null}
            </Box>
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
          <Box
            component={RouterLink}
            to={changeOrderPath(spaceSlug, slug, COMPLETE_STAGE_ID)}
            aria-pressed={completeSelected}
            role="button"
            data-testid="stage-rail-complete"
            sx={{
              textDecoration: 'none',
              color: changeOrderInk.default,
              fontSize: changeOrderType.size.body,
              minWidth: 150,
              textAlign: 'left',
              border: `${changeOrderShape.borderWidth}px solid ${
                completeSelected ? changeOrderStatus.accent : changeOrderBorder.default
              }`,
              boxShadow: completeSelected ? changeOrderSelectedRing : 'none',
              borderRadius: `${changeOrderShape.radius.lg}px`,
              padding: '10px 12px',
              background: changeOrderSurface.page,
              display: 'block',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {(() => {
                const dot = completeRailDot(completeTone, completeAbandoned);
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
              })()}
              <Box sx={{ fontSize: changeOrderType.size.prose, fontWeight: 600, color: changeOrderInk.default }}>
                {COMPLETE_STEP_LABEL}
              </Box>
            </Box>
            <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>{completeLabel}</Box>
            <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
              {changeOrderCopy.laneGateTally(finalTally.satisfied, finalTally.total)}
            </Box>
            {completeReview !== undefined ? <SignOffLine review={completeReview} notOpen={completeNotOpen === true} /> : null}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
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
  /*
   * ONE column model for the whole page, exactly as `ReleaseDiffPanel` and
   * `ComponentActivityFeed` do it: every `TreeDiffSection` on the page (the
   * source tree and every group card's tree) stays aligned down the page, and
   * dragging any one divider rebalances all of them at once.
   */
  const { columnStyle: diffColumnStyle, onDividerMouseDown: onDiffDividerMouseDown, isDragging: isDiffDragging } =
    useColumnResize();
  const diffCol1 = (diffColumnStyle as Record<string, string>)['--col1-width'];
  const diffCol2 = (diffColumnStyle as Record<string, string>)['--col2-width'];
  // `useColumnResize` rebuilds `columnStyle` as a fresh object literal on every
  // render, which would defeat `TreeDiffSection`'s memo for every unit.
  const stableDiffColumnStyle = useMemo(
    () => ({ '--col1-width': diffCol1, '--col2-width': diffCol2 }) as CSSProperties,
    [diffCol1, diffCol2],
  );
  // The same widths for the server diffs a group renders resource by resource.
  const diffColumns = useMemo<ConfigDiffColumns>(
    () => ({ columnStyle: stableDiffColumnStyle, onDividerMouseDown: onDiffDividerMouseDown, isDragging: isDiffDragging }),
    [stableDiffColumnStyle, onDiffDividerMouseDown, isDiffDragging],
  );
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
        <Box key={unit.unitId}>
          <ChangeOrderUnitHeader
            unitId={unit.unitId}
            spaceId={unit.spaceId}
            slug={unit.slug}
            resourceKind={group?.resourceKind}
            spaceName={changes.spaceNameBySpaceId.get(unit.spaceId) ?? unit.spaceId}
            // Not a promotion record — this is the change as
            // authored at the source, never something a stage wrote.
            written={false}
            // Every unit reaching `sourceUnits` was determinable
            // by construction — one that was not is dropped and
            // counted in `sourceDropped` instead, never rendered.
            undetermined={false}
            unchanged={fieldDiffs.length === 0}
            // A fan-out ChangeOrder's sources are outside the component, so
            // they open as Spaces rather than in the component view.
            spaceHref={
              detail.fanOutSource !== undefined
                ? `/spaces/${unit.spaceId}`
                : (componentSpaceDeepLink(detail.componentName, unit.spaceId) ?? undefined)
            }
            // The change leaves a source over the Links to it.
            linksHref={unitLinksHrefFor(unit, 'to')}
          />
          {linkedPaths !== undefined && fieldDiffs.length > 0 ? (
            <Box
              sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 6px' }}
              data-testid={`change-order-unit-linked-paths-${unit.unitId}`}
            >
              {changeOrderCopy.linkedPathsCaption(linkedPaths)}
            </Box>
          ) : null}
          <ChangeOrderRefusals conflicts={rowRefusals(group)} />
          {fieldDiffs.length === 0 ? (
            <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 10px' }}>
              No fields differ here.
            </Box>
          ) : group?.diff !== undefined ? (
            <ConfigDiffView diff={group.diff} columns={diffColumns} hideContext />
          ) : (
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
          )}
        </Box>
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
  /**
   * Each outcome card's representative units, split so the resources the
   * promote rewrites are read first and the ones already holding the value sit
   * behind one switch below them — the same rule, and the same helper, the "At
   * the source" list uses.
   *
   * Computed for every card at once because a hook cannot run inside the card
   * loop's `map`. Keyed by the card's own `groupKey` for the same reason its
   * disclosure state is: several cards render together.
   */
  const repUnitsByGroupKey = useMemo(() => {
    const stageId = selectedStage?.stageId ?? '';
    const byGroupKey = new Map<string, SourceUnitPartition<MergedUnit>>();
    for (const group of comparableGroups) {
      const repUnits = cardRepresentativeUnits(
        changes.units,
        group.representativeSpaceId,
        detail.skippedUnits,
      );
      byGroupKey.set(
        outcomeGroupKey(stageId, group.kind),
        partitionSourceUnitsByChange(repUnits, changes.groupsByUnitId),
      );
    }
    return byGroupKey;
  }, [
    comparableGroups,
    selectedStage?.stageId,
    changes.units,
    changes.groupsByUnitId,
    detail.skippedUnits,
  ]);

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
          <Box
            component="section"
            role="region"
            aria-label="ChangeOrder summary"
            sx={{
              /*
                CARD CHROME, MATCHING THE REFERENCE'S `.head`. Every major
                region in the design is a white card on the page's grey
                ground — `.head`, `.rail-block`, `.detail`, `.panel` all share
                one border/radius/shadow rule. Rendering flat on the page with
                a hairline divider, as this section did before, was the single
                largest structural gap against the design: right content,
                wrong container.
              */
              background: changeOrderSurface.card,
              border: `1px solid ${changeOrderBorder.default}`,
              borderRadius: `${changeOrderCardTokens.radius}px`,
              boxShadow: changeOrderCardTokens.shadow,
              /* Clips the review band's corners to the card's radius. `clip`, not
                 `hidden`: it creates no scroll container. */
              overflow: 'clip',
            }}
          >
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
              {/*
                ⚠️ THIS IS NOT THE REFERENCE'S "N variants are not in scope"
                CALLOUT, and building it as though it were would be the fake
                mapping the reviewer explicitly warned against. The two are
                different data: `skippedUnits` below names UNITS the change
                itself declined to touch inside the Spaces it DOES cover
                (`ChangeOrder.SkippedUnits`, real, wired, rendered as "Passed
                over"). The reference's callout names whole SPACES excluded
                from `InScopeSpaceIDs` entirely, each with a categorised
                reason ("created after scope", "unreachable" — mockup ~line
                4142). `InScopeSpaceIDs` is a positive list on the wire; there
                is no field anywhere in the OpenAPI surface naming a Space
                that was considered and excluded, let alone why. The excluded
                SET is derivable client-side (every Space of the component
                minus this list) but the REASON is not, and the reference's
                whole callout is built around the reason. Rendering the set
                without it would be guessing at "unreachable" vs. "created
                after scope" — exactly the invented-data failure this page's
                own header promises never to do. Left unbuilt; reported as a
                real gap rather than approximated.
              */}
              {Object.keys(detail.skippedUnits).length > 0 ? (() => {
                const skippedEntries = Object.entries(detail.skippedUnits);
                return (
                  <CollapsibleUnitGroup
                    regionLabel="Resources this change passed over"
                    label="Passed over"
                    count={<>{skippedEntries.length} {skippedEntries.length === 1 ? 'resource' : 'resources'}</>}
                    bodyId="passed-over-list"
                    expanded={skippedExpanded}
                    onToggle={() => setSkippedExpanded((prev) => !prev)}
                    sx={{ marginTop: '14px' }}
                  >
                    {/*
                      NOT AN ERROR, AND NOT WORDED AS ONE. A ChangeOrder over
                      one changed Unit passes over every other Unit in its
                      Space — that is the ordinary case, not a failure. The
                      tone here is neutral for that reason. The server gives
                      the reason as a code, worded by skippedUnitReasonText.
                    */}
                    <Box component="dl" sx={{ margin: 0, fontSize: changeOrderType.size.body }}>
                      {skippedEntries.map(([unitId, reason]) => {
                        const skippedSpaceId = changes.spaceIdByUnitId.get(unitId);
                        const skippedName = changes.slugByUnitId.get(unitId) ?? unitId;
                        return (
                          <Box key={unitId} sx={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
                            <Box
                              component="dt"
                              sx={{ margin: 0, color: changeOrderInk.default, fontFamily: 'monospace' }}
                            >
                              {/*
                                The slug, never the unit id. An id is an
                                internal identity — unique, correct and
                                meaningless to a reader. It falls back to the
                                id only when the unit is outside the scope
                                this screen fetched, where showing something
                                beats showing nothing. Linked to
                                `/units/:spaceId/:id` — same destination
                                every other unit row on this page links to
                                — only when a Space id was actually
                                resolved for it; a unit outside scope has
                                no page to send a reader to.
                              */}
                              {skippedSpaceId !== undefined ? (
                                <FactLink href={`/units/${skippedSpaceId}/${unitId}`}>{skippedName}</FactLink>
                              ) : (
                                skippedName
                              )}
                            </Box>
                            <Box component="dd" sx={{ margin: 0, color: changeOrderInk.muted }}>
                              {skippedUnitReasonText(reason)}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </CollapsibleUnitGroup>
                );
              })() : null}

              {detail.abortedReason !== '' ? (
                <Box sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted }}>
                  Aborted: {detail.abortedReason}
                </Box>
              ) : null}
            </Box>
            </Box>
          </Box>

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
              <StageRail
                stageStates={detail.stageStates}
                stagesDone={detail.stagesDone}
                selectedStageId={selectedStage?.stageId}
                nextStageId={detail.nextStageId}
                spaceSlug={detail.baseSpaceSlug}
                slug={detail.slug}
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
            {detail.sequence.problems.length > 0 ? (
              <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted, marginTop: '10px' }}>
                {detail.sequence.problems.map((p, i) => (
                  <Box key={i}>{describeSequenceProblem(p)}</Box>
                ))}
              </Box>
            ) : null}
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
                const GateStateIcon = gateState === 'open' ? LockOpenOutlinedIcon : LockOutlinedIcon;
                const gateStateTone =
                  gateState === 'open'
                    ? changeOrderStatus.success
                    : gateState === 'unknown'
                      ? changeOrderInk.muted
                      : changeOrderStatus.warn;
                return (
                  <>
                    <Box
                      component="button"
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`gate-list-${selectedStage.stageId}`}
                      onClick={() =>
                        setGateOverride((prev) => ({ ...prev, [selectedStage.stageId]: !expanded }))
                      }
                      sx={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px 12px',
                        borderRadius: `${changeOrderShape.radius.md}px`,
                        border: `1px solid ${changeOrderBorder.default}`,
                        background: changeOrderSurface.sunk,
                        marginBottom: expanded ? '8px' : 0,
                      }}
                    >
                      <GateStateIcon
                        aria-hidden="true"
                        sx={{ fontSize: 16, color: gateStateTone, flex: '0 0 auto' }}
                      />
                      <Box
                        sx={{
                          fontSize: changeOrderType.size.small,
                          fontWeight: changeOrderType.weight.semibold,
                          color: changeOrderInk.default,
                        }}
                      >
                        Gates
                      </Box>
                      <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>
                        {tally.satisfied} of {tally.total} satisfied
                      </Box>
                      <Box
                        sx={{
                          marginLeft: 'auto',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: changeOrderType.size.small,
                          fontWeight: changeOrderType.weight.semibold,
                          color: changeOrderInk.muted,
                        }}
                      >
                        {expanded ? 'Hide' : 'Show'}
                        <ExpandMoreIcon
                          aria-hidden="true"
                          sx={{
                            fontSize: 18,
                            transform: expanded ? 'rotate(180deg)' : 'none',
                            transition: 'transform .15s ease',
                          }}
                        />
                      </Box>
                    </Box>
                    {expanded ? (
                      <Box
                        id={`gate-list-${selectedStage.stageId}`}
                        sx={{
                          border: `1px solid ${changeOrderBorder.default}`,
                          borderRadius: `${changeOrderShape.radius.md}px`,
                          overflow: 'hidden',
                          marginBottom: '4px',
                        }}
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
                      </Box>
                    ) : null}
                  </>
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
                {/*
                  Reported, never folded into `same` — but as a plain note,
                  not a bar segment or a card: "we could not look" is not one
                  of the ways a promotion can come out, so it does not belong
                  in the partition that draws how it did.

                  `changeOrderInk.subtle`, not a warning tone — same call `OUTCOME_META`
                  already makes for this kind ("deliberately NOT a failure
                  tone and not a reassuring one — it is its own thing").
                  Boxed and icon-led rather than bare text so it still reads
                  as a real, considered part of the page rather than an
                  afterthought bolted above the bar — the same sunk-card
                  treatment "Gates" and "Passed over" use elsewhere on this
                  screen, so the vocabulary for "here's a note, not a metric"
                  stays consistent across the page.
                */}
                {unknownGroup !== undefined ? (
                  <Box
                    data-testid="outcome-unknown-note"
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      padding: '8px 12px',
                      marginBottom: '10px',
                      borderRadius: `${changeOrderShape.radius.md}px`,
                      border: `1px solid ${changeOrderBorder.default}`,
                      background: changeOrderSurface.sunk,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <HelpOutlineIcon aria-hidden="true" sx={{ fontSize: 16, color: changeOrderInk.subtle, flex: '0 0 auto' }} />
                      <Box component="span" sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>
                        <b style={{ color: changeOrderInk.muted }}>{unknownGroup.spaceIds.length}</b>{' '}
                        {unknownGroup.spaceIds.length === 1 ? 'variant' : 'variants'} could not be
                        established this round.
                      </Box>
                    </Box>
                    {/*
                      Named, not just counted — a reader who wants to go look
                      into why needs to know WHICH variants, not only how many.
                      Same chip primitive the group cards' own "Members" row
                      uses, so this reads as the same kind of fact everywhere
                      on the page it appears — and clickable, into the exact
                      variant on the Components graph (`componentSpaceDeepLink`)
                      rather than back into this ChangeOrder: the reader asked to
                      look at THIS Space, not to resume the ChangeOrder at it.
                      Falls back to a plain, unlinked chip when
                      there is no `appName` to build one from, same guard
                      `componentDeepLink` above uses.
                    */}
                    <Box sx={{ display: 'flex', gap: '5px', flexWrap: 'wrap', paddingLeft: '24px' }}>
                      {unknownGroup.labels.map((label, i) => {
                        const spaceId = unknownGroup.spaceIds[i];
                        const href = componentSpaceDeepLink(detail.componentName, spaceId);
                        return (
                          <Box
                            key={spaceId}
                            component={href !== null ? 'a' : 'span'}
                            href={href ?? undefined}
                            target={href !== null ? '_blank' : undefined}
                            rel={href !== null ? 'noopener noreferrer' : undefined}
                            data-testid="outcome-unknown-chip"
                            sx={{
                              height: 22,
                              padding: '0 8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              borderRadius: `${changeOrderShape.radius.pill}px`,
                              border: `1px solid ${changeOrderBorder.strong}`,
                              background: changeOrderSurface.card,
                              fontFamily: changeOrderFontMono,
                              fontSize: changeOrderType.size.small,
                              color: changeOrderInk.muted,
                              whiteSpace: 'nowrap',
                              textDecoration: href !== null ? 'underline' : 'none',
                              textDecorationColor: changeOrderBorder.strong,
                            }}
                          >
                            {label}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
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
                  <Box
                    role="group"
                    aria-label={`Outcome across ${outcome.variantCount} variants`}
                    sx={{ marginBottom: '14px' }}
                  >
                    <Box sx={{ display: 'flex', height: 10, borderRadius: `${changeOrderShape.radius.sm}px`, overflow: 'hidden', gap: '2px' }}>
                      {comparableGroups.map((group) => (
                        <Box
                          key={group.kind}
                          sx={{
                            flexGrow: group.spaceIds.length,
                            flexBasis: 0,
                            background: OUTCOME_META[group.kind].tone,
                          }}
                        />
                      ))}
                    </Box>
                    <Box sx={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {comparableGroups.map((group) => (
                        <Box key={group.kind} sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
                          <Box
                            component="span"
                            aria-hidden="true"
                            sx={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: `${changeOrderShape.radius.xs}px`,
                              background: OUTCOME_META[group.kind].tone,
                              marginRight: '6px',
                            }}
                          />
                          <b style={{ color: changeOrderInk.default }}>{group.spaceIds.length}</b>{' '}
                          {OUTCOME_META[group.kind].label}
                        </Box>
                      ))}
                    </Box>
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
                  </Box>
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
                  comparableGroups.map((group) => {
                    const members = group.spaceIds.length;
                    const groupKey = outcomeGroupKey(selectedStage.stageId, group.kind);
                    /*
                     * The card's units, already split into the ones this
                     * promote rewrites and the ones that already hold the
                     * value — see `repUnitsByGroupKey`, which does the
                     * skipped-unit filtering and the split together.
                     */
                    const { changedUnits: changedRepUnits, blockedUnits: blockedRepUnits } =
                      repUnitsByGroupKey.get(groupKey) ?? EMPTY_UNIT_PARTITION;
                    /*
                     * THE REPRESENTATIVE VARIANT'S CHANGED PATHS — what this
                     * card LISTS, not what its whole group holds.
                     *
                     * The rows below the chip are the representative's, so a
                     * group-wide total would count rows the reader cannot see.
                     * And for `differs`, whose members differ from each other by
                     * definition, no single group-wide figure is true of all of
                     * them.
                     *
                     * Unchanged resources carry no changed path, so summing the
                     * changed ones is the whole of it.
                     */
                    const repFieldCount = changedRepUnits.reduce(
                      (total, unit) =>
                        total + (changes.groupsByUnitId.get(unit.unitId)?.fieldDiffs.length ?? 0),
                      0,
                    );
                    /*
                     * What the rows call this card's Space. The `Variant` label
                     * is the Space's name inside its Component ("base",
                     * "nonprod", "prod"); the slug underneath it reads as
                     * plumbing. Resolved once here rather than per row —
                     * every row on a card shows the same Space, and the card's
                     * disclosure names itself by this too so a screen reader
                     * hears the card under the same name the rows show.
                     */
                    const repVariantLabel = cardSpaceLabel(
                      group.representativeSpaceId,
                      detail.scopedSpaces,
                      changes.spaceNameBySpaceId,
                    );
                    const groupOpen = groupsExpanded;
                    const badge = OUTCOME_BADGE[group.kind];
                    /**
                     * One unit row, rendered identically whether it sits above
                     * the disclosure or inside it: the density comes from the
                     * group being shut, not from telling the reader less about
                     * any one unit.
                     */
                    const renderRepUnit = (unit: MergedUnit) => {
                      const g = changes.groupsByUnitId.get(unit.unitId);
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
                          <ChangeOrderRefusals conflicts={rowRefusals(g)} />
                          {/*
                            The server's diff, resource by resource,
                            through `ConfigDiffView` — the Revision
                            compare drawer's view — so each document of
                            a Unit is diffed on its own and array
                            elements are matched by merge key. It is the
                            whole of what the promotion writes: nothing
                            here filters it.

                            Can genuinely be empty here — a `same`
                            group's members already hold the value
                            being promoted, so their `fieldDiffs`
                            legitimately has nothing in it. That is
                            not "Passed over"'s to say (this unit
                            was not skipped, `repUnitsByGroupKey`
                            filtered those out) — it is its own
                            honest answer, said below instead of a
                            blank tree.
                          */}
                          {fieldDiffs.length === 0 ? (
                            <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 10px' }}>
                              No fields differ here.
                            </Box>
                          ) : g?.diff !== undefined ? (
                            <ConfigDiffView diff={g.diff} columns={diffColumns} hideContext />
                          ) : (
                            <TreeDiffSection
                              entry={{ unitId: unit.unitId, fieldDiffs }}
                              allPaths={g?.allPaths}
                              keyPrefix={`change-order-group-${groupKey}`}
                              label=""
                              hideLabel
                              variant="data"
                              columnStyle={stableDiffColumnStyle}
                              onDividerMouseDown={onDiffDividerMouseDown}
                              isDragging={isDiffDragging}
                            />
                          )}
                        </Box>
                      );
                    };
                    return (
                      <Box
                        key={group.kind}
                        role="group"
                        aria-label={`${repFieldCount} changed ${repFieldCount === 1 ? 'field' : 'fields'}, ${OUTCOME_META[group.kind].label}, ${members} ${members === 1 ? 'variant' : 'variants'}`}
                        sx={{
                          /*
                            `.panel`, kind-tinted: the reference borders a
                            group card in its own outcome colour
                            (`.panel.k-differs` etc), so a divergent or
                            unknown group reads as such from its edge alone,
                            before the label is read.
                          */
                          border: `1px solid ${changeOrderKindLine[group.kind]}`,
                          borderRadius: `${changeOrderCardTokens.radius}px`,
                          background: changeOrderSurface.card,
                          marginBottom: '14px',
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          component="button"
                          type="button"
                          aria-expanded={groupOpen}
                          aria-controls={`group-body-${groupKey}`}
                          onClick={() => setGroupsExpanded((prev) => !prev)}
                          sx={{
                            all: 'unset',
                            boxSizing: 'border-box',
                            width: '100%',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            flexWrap: 'wrap',
                            padding: '10px 12px',
                            background: changeOrderSurface.sunk,
                            borderBottom: groupOpen ? `1px solid ${changeOrderBorder.default}` : 'none',
                            '&:hover': { background: changeOrderSurface.inset },
                          }}
                        >
                          {/*
                            The badge, `.grp-n` in the reference: a count at card
                            scale, in the kind's own tint, doing the job the small
                            dot plus a restated "N variants" sentence used to do
                            together. `OUTCOME_BADGE` reuses `OUTCOME_META`'s own
                            tones rather than the reference's literal per-kind
                            colours — `adds`/`unknown` stay neutral grey here for
                            the same reason `OUTCOME_META.tone` does above: this
                            page has already ruled that "could not establish" is
                            not a failure tone, and a bold colour block would
                            assert exactly the verdict that ruling refuses to make.
                          */}
                          {/*
                            THE NUMERAL CARRIES ITS OWN UNIT. A bare figure takes
                            its meaning from the words beside it, and beside
                            "Adds resources" a bare "0" reads as "no resources
                            added" — which is false, and the reverse of what the
                            card is reporting. The caption is what stops the
                            reader having to infer.
                          */}
                          <Box
                            aria-hidden="true"
                            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                          >
                            <Box
                              data-testid="outcome-group-badge"
                              sx={{
                                minWidth: 40,
                                padding: '4px 9px',
                                borderRadius: `${changeOrderShape.radius.lg}px`,
                                background: badge.bg,
                                color: badge.fg,
                                fontFamily: changeOrderFontMono,
                                fontVariantNumeric: 'tabular-nums',
                                fontSize: changeOrderType.size.cardFigure,
                                fontWeight: changeOrderType.weight.strong,
                                letterSpacing: '-.02em',
                                lineHeight: 1,
                                textAlign: 'center',
                              }}
                            >
                              {repFieldCount}
                            </Box>
                            <Box
                              data-testid="outcome-group-badge-unit"
                              sx={{
                                fontSize: changeOrderType.size.micro,
                                lineHeight: 1,
                                color: changeOrderInk.muted,
                                letterSpacing: '.02em',
                              }}
                            >
                              {repFieldCount === 1 ? 'field' : 'fields'}
                            </Box>
                          </Box>
                          {/*
                            Label and hint stack, so the hint reads as the
                            label's own explanation rather than as a second
                            heading beside it. `minWidth: 0` lets the pair shrink
                            instead of forcing the row wider than the card, and
                            `flex: 1 1 auto` keeps "Open" at the far edge until
                            the row genuinely runs out of width and wraps.
                          */}
                          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 auto', textAlign: 'left' }}>
                            <Box
                              component="h4"
                              sx={{
                                fontSize: changeOrderType.size.prose,
                                lineHeight: changeOrderType.lineHeight.heading,
                                fontWeight: changeOrderType.weight.semibold,
                                margin: 0,
                              }}
                            >
                              {OUTCOME_META[group.kind].label}
                            </Box>
                            <Box
                              sx={{
                                fontSize: changeOrderType.size.small,
                                lineHeight: changeOrderType.lineHeight.body,
                                fontWeight: changeOrderType.weight.regular,
                                color: changeOrderInk.muted,
                              }}
                            >
                              {OUTCOME_META[group.kind].hint}
                            </Box>
                          </Box>
                          <Box
                            sx={{
                              marginLeft: 'auto',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: changeOrderType.size.small,
                              fontWeight: changeOrderType.weight.semibold,
                              color: changeOrderInk.muted,
                            }}
                          >
                            {groupOpen ? 'Hide' : 'Open'}
                            <ExpandMoreIcon
                              aria-hidden="true"
                              sx={{
                                fontSize: 18,
                                transform: groupOpen ? 'rotate(180deg)' : 'none',
                                transition: 'transform .15s ease',
                              }}
                            />
                          </Box>
                        </Box>
                        {groupOpen ? (
                          <Box id={`group-body-${groupKey}`}>
                            {changedRepUnits.length + blockedRepUnits.length === 0 ? (
                              <Box sx={{ padding: '4px 0' }}>
                                <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 10px' }}>
                                  {changeOrderCopy.noResourcesYet}
                                </Box>
                              </Box>
                            ) : (
                              <>
                                {changedRepUnits.length > 0 ? (
                                  <Box sx={{ padding: '4px 0' }}>
                                    {changedRepUnits.map(renderRepUnit)}
                                  </Box>
                                ) : null}
                                {/*
                                  The resources this promote leaves alone are not
                                  listed. The card reports what the change does,
                                  and a resource it does not touch is not that.
                                  What follows is the exception: a resource the
                                  change DID try to alter and could not. It has
                                  no changed paths either, so the two are
                                  indistinguishable in the diff and could not be
                                  more different to a reader — which is why it
                                  sits apart rather than among the rows.
                                */}
                                <Box sx={{ padding: '0 12px' }}>
                                  <ChangeOrderBlockedResources
                                    units={blockedRepUnits}
                                    renderUnit={renderRepUnit}
                                  />
                                </Box>
                              </>
                            )}
                          </Box>
                        ) : null}
                      </Box>
                    );
                  })
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
