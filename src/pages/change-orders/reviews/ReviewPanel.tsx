// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The review panel beside the selected stage: the score, the viewer's own
 * review (eligibility, decision form, coverage), progress per requirement, and
 * every decision recorded.
 *
 * The panel owns the decide → confirm → record flow. A decision is recorded
 * only from the confirm dialog. "Change my decision" revokes the viewer's live
 * decision (one record per Space) and records the new one; the two steps are
 * not atomic, and the dialog says what happened when one of them fails.
 */

import { useRef, useState, type ReactNode, type Ref } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import InsertLinkIcon from '@mui/icons-material/InsertLink';

import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderShape, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { reviewTextButtonSx } from './reviewButtons';
import { agoText, authorInText, entryText, decisionTypes, durationText, epochOf, fromText, groupLabel, placesText, reviewCopy, reviewTime } from './reviewCopy';
import { ReviewConfirmDialog, type ReviewConfirmError } from './ReviewConfirmDialog';
import { ReviewCoverageList } from './ReviewCoverageList';
import { ReviewDecisionForm } from './ReviewDecisionForm';
import { ReviewDecisionList } from './ReviewDecisionList';
import { ReviewRequirementList } from './ReviewRequirementList';
import { ReviewRequestsSection } from './ReviewRequestsSection';
import { reviewInitials } from './changeOrderReviews';
import { Monogram, Pips, SectionLabel } from './reviewParts';
import type {
  ReviewChoice,
  ReviewCoverage,
  ReviewPerson,
  StageReviewSummary,
  SubmitReviewOutcome,
  UseGateReviewsResult,
} from './changeOrderReviewTypes';

/** The element the band and the gate list scroll to. */
export const REVIEW_PANEL_ID = 'review';

interface ReviewPanelProps {
  reviews: UseGateReviewsResult;
  summary: StageReviewSummary;
  /** For an entry gate: the other gates still holding the stage (see `ReviewConfirmDialog`). */
  otherGatesHolding?: string[];
  orderSlug: string;
  /** The viewer's display name, for "Priya Nair, you can review". */
  viewerName?: string;
  viewerInitials?: string;
  now: number;
  /** Given to the Approve button, so "Review now" can focus it. */
  approveRef?: Ref<HTMLButtonElement>;
  /** A decision was recorded. The page shows the toast and refreshes. */
  onRecorded: (outcome: Extract<SubmitReviewOutcome, { ok: true }>, summary: StageReviewSummary, result: ReviewChoice) => void;
  /** A short message for the page's toast ("Link copied"). */
  onNotice: (message: string) => void;
}

const sectionSx = {
  padding: '14px 18px',
  borderBottom: `1px solid ${changeOrderBorder.default}`,
  '&:last-of-type': { borderBottom: 0 },
} as const;

const txtSx = {
  fontSize: changeOrderType.size.body,
  color: changeOrderInk.muted,
  lineHeight: changeOrderType.lineHeight.body,
  '& b': { color: changeOrderInk.default, fontWeight: changeOrderType.weight.semibold },
} as const;

function MonoText({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ fontFamily: changeOrderFontMono }}>
      {children}
    </Box>
  );
}

function YouLine({ initials, tone, children }: { initials: string; tone: 'ok' | 'bad' | 'idle'; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
      <Monogram initials={initials} tone={tone} size={28} />
      <Box sx={txtSx}>{children}</Box>
    </Box>
  );
}

function Score({ summary, now }: { summary: StageReviewSummary; now: number }) {
  const primary = summary.primary;
  if (primary === undefined) return null;
  const rejecter = primary.rejecters[0];
  const rejectedBy = rejecter === undefined ? undefined : summary.decisions.find((d) => d.live && d.result === 'Fail' && d.person.userId === rejecter.userId);
  let big: ReactNode = (
    <Box sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.cardFigure, fontWeight: changeOrderType.weight.bold, letterSpacing: '-.035em', lineHeight: 1, color: primary.satisfied ? changeOrderStatus.success : changeOrderInk.default }}>
      {primary.passes}
      <Box component="span" sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.subtle, fontWeight: changeOrderType.weight.medium, letterSpacing: 0, marginLeft: '4px' }}>
        of {primary.required}
      </Box>
    </Box>
  );
  let meta: ReactNode = null;
  const since = epochOf(summary.waitingSince);
  if (since !== undefined) {
    meta = (
      <>
        {reviewCopy.panel.waiting} <b>{durationText(now - since)}</b>
        <br />
        {/* A real request time when there is one; else the last promotion, said as such. */}
        {summary.waitingSinceSource === 'reviewRequest'
          ? reviewCopy.panel.sinceRequest(reviewTime(summary.waitingSince))
          : reviewCopy.panel.sincePromotion(reviewTime(summary.waitingSince))}
      </>
    );
  }
  if (primary.rejected) {
    big = (
      <Box sx={{ color: changeOrderStatus.danger, fontSize: changeOrderType.size.heading, fontWeight: changeOrderType.weight.strong, lineHeight: 1 }}>
        {reviewCopy.panel.rejected}
      </Box>
    );
    meta =
      rejecter === undefined ? null : (
        <>
          {reviewCopy.panel.rejected} <b>{agoText(rejectedBy?.createdAt, now)}</b>
          <br />
          by {rejecter.name}
        </>
      );
  } else if (primary.satisfied) {
    meta = (
      <>
        {reviewCopy.panel.satisfied}
        {primary.validUntil !== undefined ? (
          <>
            <br />
            <b>{reviewCopy.panel.validUntil(reviewTime(primary.validUntil))}</b>
          </>
        ) : null}
      </>
    );
  }
  // No server rows for the viewer: no count and no pips (#5788). The final step says when it opens.
  if (!primary.evaluated) {
    return (
      <Box data-testid="review-score-not-evaluated" sx={{ marginTop: '10px', fontSize: changeOrderType.size.body, color: changeOrderInk.muted, lineHeight: 1.45 }}>
        {reviewCopy.notEvaluated[primary.notEvaluated ?? 'error']}
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
      {big}
      <Pips passes={Math.min(primary.passes, primary.required)} required={primary.required} rejected={primary.rejected} />
      <Box
        sx={{
          marginLeft: 'auto',
          textAlign: 'right',
          fontSize: changeOrderType.size.small,
          color: changeOrderInk.subtle,
          lineHeight: 1.35,
          '& b': { color: changeOrderInk.muted, fontWeight: changeOrderType.weight.semibold, fontFamily: changeOrderFontMono },
        }}
      >
        {meta}
      </Box>
    </Box>
  );
}

/** Who can still approve: named people with their decision, or a sentence when only groups are named. */
function WhoCan({ summary, now }: { summary: StageReviewSummary; now: number }) {
  const primary = summary.primary;
  if (primary === undefined) return null;
  const groupsById = new Map(primary.rules.fromGroups.map((g) => [g.groupId, g]));
  const rows: { person: ReviewPerson; status: string; ok: boolean; via?: string }[] = summary.whoCanStillApprove.map(
    ({ person, decision, viaGroupId }) => {
      const group = viaGroupId === undefined ? undefined : groupsById.get(viaGroupId);
      const via = group === undefined ? undefined : reviewCopy.author.viaGroup(groupLabel(group));
      if (decision === undefined) return { person, status: reviewCopy.author.notReviewed, ok: false, via };
      const ago = agoText(decision.createdAt, now);
      return {
        person,
        status: decision.result === 'Pass' ? reviewCopy.author.approvedAgo(ago) : reviewCopy.author.rejectedAgo(ago),
        ok: decision.result === 'Pass',
        via,
      };
    },
  );
  const { fromUsers, fromGroups } = primary.rules;
  let note: string | null = null;
  if (fromUsers.length === 0 && fromGroups.length === 0) note = reviewCopy.author.anyoneWithApprove;
  // Members are read per group (M4). Only a group with no readable members keeps the old sentence.
  else if (rows.length === 0 && fromGroups.length > 0 && fromGroups.every((g) => g.memberUserIds.length === 0)) {
    note = reviewCopy.author.groupOnly;
  }
  return (
    <>
      {rows.length > 0 ? (
        <Box sx={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }} data-testid="review-who-can">
          {rows.map((row) => (
            <Box key={row.person.userId} sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: changeOrderType.size.body }}>
              <Monogram initials={row.person.initials} tone={row.ok ? 'ok' : 'idle'} />
              {row.person.name}
              {row.via !== undefined ? (
                <Box component="span" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
                  {row.via}
                </Box>
              ) : null}
              <Box
                component="span"
                sx={{
                  marginLeft: 'auto',
                  fontSize: changeOrderType.size.small,
                  color: row.ok ? changeOrderStatus.success : changeOrderInk.subtle,
                  fontWeight: row.ok ? changeOrderType.weight.semibold : undefined,
                }}
              >
                {row.status}
              </Box>
            </Box>
          ))}
        </Box>
      ) : null}
      {note !== null ? (
        <Box component="p" sx={{ ...txtSx, margin: '8px 0 0', fontSize: changeOrderType.size.small }}>
          {note}
        </Box>
      ) : null}
    </>
  );
}

/**
 * "rrv-dev (1 of 2 Revisions)" from the server's Caller on the primary
 * requirement (#5788), else the Space names the eligibility gives.
 */
function callerAuthorText(summary: StageReviewSummary, spaces: readonly string[]): string {
  const viewer = summary.primary?.viewer;
  if (viewer !== undefined && (viewer.kind === 'author' || viewer.kind === 'partial') && viewer.authorIn.length > 0) {
    return authorInText(viewer.authorIn);
  }
  return placesText(spaces);
}

export function ReviewPanel({
  reviews,
  summary,
  otherGatesHolding,
  orderSlug,
  viewerName,
  viewerInitials,
  now,
  approveRef,
  onRecorded,
  onNotice,
}: ReviewPanelProps) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<{ result: ReviewChoice; note: string } | null>(null);
  const [error, setError] = useState<ReviewConfirmError | undefined>(undefined);
  /** Set once the revoke step of a replace succeeded, so a retry only records. */
  const [revokeDone, setRevokeDone] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const submitRef = useRef<HTMLButtonElement>(null);

  const { eligibility, ownByType } = summary.viewer;
  const owns = Object.values(ownByType);
  const primary = summary.primary;
  const stage = summary.gate.stageName;
  const types = decisionTypes(summary);
  const coverages = types.map((type) => reviews.coverageByType[type]).filter((c): c is ReviewCoverage => c !== undefined);
  const replaces = editing && !revokeDone ? owns : [];
  const someone = owns[0]?.person;
  const name = viewerName ?? someone?.name ?? 'You';
  const initials = viewerInitials ?? someone?.initials ?? (viewerName === undefined ? '' : reviewInitials(viewerName));
  /** Every requirement of the Type allows authors: a Revision the viewer wrote still counts (AllowAuthors). */
  const authorsCountFor = (type: string) => {
    const ofType = summary.requirements.filter((r) => r.rules.type === type);
    return ofType.length > 0 && ofType.every((r) => r.rules.allowAuthors);
  };
  /** Revisions where a decision from the viewer counts, over every Type. */
  const countingRevisions =
    coverages.length === 0
      ? undefined
      : coverages.reduce((n, c) => n + c.covered.filter((row) => authorsCountFor(c.type) || !row.authored).length, 0);
  /** The viewer wrote a gate Revision: the server's Caller, or the attest dry run's `Authored`. */
  const viewerWrote =
    summary.requirements.some((r) => r.perSpace.some((space) => (space.caller?.authoredRevisions ?? 0) > 0)) ||
    coverages.some((c) => c.covered.some((row) => row.authored));
  /**
   * The viewer's own decisions the server does not count (Caller.Counts false):
   * shown after the not-eligible or author copy, each with the server's reason.
   */
  const ownNotCounted = (
    <>
      {owns.map((own) => {
        const line = reviewCopy.you.ownNotCounted(own.result, reviewTime(own.createdAt));
        const reasons = Object.entries(own.byRequirement)
          .filter(([, entry]) => entry.countedOn === 0 || entry.reason !== undefined)
          .map(([requirement, entry]) => ({
            requirement,
            text: entryText(entry, own, summary.requirements.find((r) => r.name === requirement)?.rules).text,
          }));
        return (
          <Box key={own.id} sx={{ marginTop: '10px' }} data-testid="review-own-not-counted" data-own-type={own.type}>
            <YouLine initials={own.person.initials} tone="idle">
              <b>{line.lead}</b>
              {owns.length > 1 ? ` (${own.type})` : ''}
              {line.rest}
              {reasons.map((r) => (
                <Box component="span" key={r.requirement} sx={{ display: 'block', marginTop: '4px' }}>
                  <MonoText>{r.requirement}</MonoText>: {r.text}
                </Box>
              ))}
            </YouLine>
          </Box>
        );
      })}
    </>
  );
  // M6: nothing would be recorded in any Space, so there is nothing to submit.
  const nothingRecordable = coverages.length === types.length && coverages.length > 0 && coverages.every((c) => !c.recordable);

  const coverageList = (
    <>
      {types.length === 0 ? (
        <ReviewCoverageList coverage={undefined} loading={reviews.coverageLoading} author={eligibility.kind === 'author'} authorsCount={types.length > 0 && types.every(authorsCountFor)} />
      ) : (
        types.map((type) => (
          <ReviewCoverageList
            key={type}
            coverage={reviews.coverageByType[type]}
            loading={reviews.coverageLoading}
            author={eligibility.kind === 'author'}
            authorsCount={authorsCountFor(type)}
            showType={types.length > 1}
          />
        ))
      )}
    </>
  );

  const closeDialog = () => {
    if (reviews.isSubmitting) return;
    setPending(null);
    setError(undefined);
  };

  const confirm = async () => {
    if (pending === null) return;
    setError(undefined);
    const outcome = await reviews.submit({ result: pending.result, note: pending.note, replaces });
    if (!outcome.ok) {
      if (outcome.stage === 'record' && replaces.length > 0) setRevokeDone(true);
      setError({
        stage: outcome.stage,
        message: outcome.message,
        revokedSpaceSlugs: outcome.revokedSpaceSlugs,
        recordedTypes: outcome.recordedTypes,
        spaceErrors: outcome.spaceErrors,
      });
      return;
    }
    const result = pending.result;
    setPending(null);
    setEditing(false);
    setRevokeDone(false);
    setFormKey((k) => k + 1);
    onRecorded(outcome, summary, result);
  };

  const copyLink = () => {
    const url = `${window.location.href.split('#')[0]}#${REVIEW_PANEL_ID}`;
    navigator.clipboard
      .writeText(url)
      .then(() => onNotice(reviewCopy.author.copied))
      .catch(() => onNotice(reviewCopy.author.copyFailed));
  };

  let you: ReactNode;
  if (eligibility.kind === 'author') {
    you = (
      <>
        <Box
          data-testid="review-author"
          sx={{
            border: `1px solid ${changeOrderBorder.strong}`,
            borderRadius: `${changeOrderShape.radius.md}px`,
            background: changeOrderSurface.sunk,
            padding: '11px 12px',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: changeOrderType.size.prose, fontWeight: changeOrderType.weight.strong }}>
            <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 15, color: changeOrderInk.subtle }} />
            {reviewCopy.author.title}
          </Box>
          <Box component="p" sx={{ ...txtSx, margin: '6px 0 0', lineHeight: 1.5 }}>
            {reviewCopy.caller.author(callerAuthorText(summary, eligibility.authorIn))}
            {primary !== undefined ? (
              <>
                {' '}
                <MonoText>{primary.name}</MonoText>
                {reviewCopy.author.authorRule}
              </>
            ) : null}
          </Box>
          {primary !== undefined && primary.need > 0 ? (
            <Box component="p" sx={{ ...txtSx, margin: '6px 0 0' }}>
              {reviewCopy.author.needFrom(primary.need)} {fromText(primary.rules)}:
            </Box>
          ) : null}
          <WhoCan summary={summary} now={now} />
        </Box>
        {ownNotCounted}
        {coverageList}
      </>
    );
  } else if (eligibility.kind === 'signedOut') {
    you = <Box sx={txtSx}>{reviewCopy.you.signedOut}</Box>;
  } else if (eligibility.kind === 'notEligible') {
    // The server does not count the viewer: say so first, then any decision of theirs, as not counted.
    you = (
      <>
        <Box sx={{ ...txtSx, fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default }}>{reviewCopy.you.notListedTitle}</Box>
        <Box component="p" data-testid="review-not-eligible" sx={{ ...txtSx, margin: '6px 0 0' }}>
          {reviewCopy.caller.notEligible}
        </Box>
        {ownNotCounted}
        <WhoCan summary={summary} now={now} />
      </>
    );
  } else if (eligibility.kind === 'notEvaluated' && !eligibility.mayDecide && owns.length === 0) {
    // No server rows and no way to decide: say why; the decisions below still show who decided.
    you = (
      <Box component="p" data-testid="review-not-evaluated" sx={{ ...txtSx, margin: 0 }}>
        {reviewCopy.notEvaluated[eligibility.why]}
      </Box>
    );
  } else if (owns.length > 0 && !editing) {
    // One line per Type the viewer decided (S1).
    you = (
      <>
        {owns.map((own) => {
          const revisions = reviewCopy.decision.revisions(own.spaceSlugs.length);
          const until = Object.values(own.byRequirement)
            .map((entry) => entry.validUntil)
            .filter((v): v is string => v !== undefined)
            .sort()[0];
          const line =
            own.result === 'Pass'
              ? reviewCopy.you.approved(reviewTime(own.createdAt), revisions, until === undefined ? undefined : reviewTime(until))
              : reviewCopy.you.rejected(reviewTime(own.createdAt), revisions);
          return (
            <Box key={own.id} sx={{ '& + &': { marginTop: '8px' } }} data-own-type={own.type}>
              <YouLine initials={own.person.initials} tone={own.result === 'Pass' ? 'ok' : 'bad'}>
                <b>{line.lead}</b>
                {owns.length > 1 ? ` (${own.type})` : ''}
                {line.rest}
              </YouLine>
            </Box>
          );
        })}
        <Box sx={{ marginTop: '8px', marginLeft: '38px', display: 'flex', gap: '12px' }}>
          <Box component="button" type="button" sx={reviewTextButtonSx} onClick={() => setEditing(true)} data-testid="review-change">
            {reviewCopy.you.changeMyDecision}
          </Box>
        </Box>
      </>
    );
  } else {
    const otherRejecter = summary.requirements
      .filter((r) => !r.rules.ignoreFail)
      .flatMap((r) => r.rejecters)
      .find((p) => !p.isYou);
    const first = owns[0];
    let lead: ReactNode;
    if (editing && first !== undefined) {
      lead = (
        <YouLine initials={first.person.initials} tone={first.result === 'Pass' ? 'ok' : 'bad'}>
          <b>{reviewCopy.you.changeLead}</b>
          {reviewCopy.you.changeRest(first.result, reviewTime(first.createdAt))}
        </YouLine>
      );
    } else if (eligibility.kind === 'partial') {
      // M3: the viewer counts on some gate Revisions and wrote the others. Never hide the form.
      lead = (
        <YouLine initials={initials} tone="idle">
          <b>{name}</b>
          {reviewCopy.you.partialLead(eligibility.requirementNames)}
          <Box component="span" data-testid="review-partial" sx={{ display: 'block', marginTop: '4px' }}>
            {reviewCopy.caller.author(callerAuthorText(summary, eligibility.authorIn))}
          </Box>
        </YouLine>
      );
    } else if (eligibility.kind === 'notEvaluated') {
      // No server rows, but the viewer may decide: the server checks eligibility on submit.
      lead = (
        <YouLine initials={initials} tone="idle">
          <b>{name}</b>
          {reviewCopy.you.partialLead(eligibility.requirementNames)}
          <Box component="span" data-testid="review-not-evaluated" sx={{ display: 'block', marginTop: '4px' }}>
            {reviewCopy.notEvaluated[eligibility.why]} {reviewCopy.you.serverChecksOnSubmit}
          </Box>
        </YouLine>
      );
    } else {
      const names = eligibility.kind === 'counts' ? eligibility.requirementNames : [];
      lead = (
        <YouLine initials={initials} tone="idle">
          <b>{name}</b>
          {viewerWrote ? reviewCopy.you.eligibleAuthorLead(names) : reviewCopy.you.eligibleLead(names)}
        </YouLine>
      );
    }
    you = (
      <>
        {lead}
        {otherRejecter !== undefined ? (
          <Box
            data-testid="review-rejection-stands"
            sx={{
              marginTop: '10px',
              padding: '8px 10px',
              borderRadius: `${changeOrderShape.radius.md}px`,
              background: changeOrderStatus.dangerSoft,
              border: `1px solid ${changeOrderStatus.dangerLine}`,
              fontSize: changeOrderType.size.small,
              lineHeight: 1.45,
              '& b': { color: changeOrderStatus.danger },
            }}
          >
            <b>{reviewCopy.you.rejectionStands}</b>
            {reviewCopy.you.rejectionStandsRest(stage, otherRejecter.name)}
          </Box>
        ) : null}
        <ReviewDecisionForm
          key={formKey}
          stageName={stage}
          revisionCount={countingRevisions}
          coverage={coverageList}
          blockedReason={nothingRecordable ? reviewCopy.coverage.nothingRecordable : undefined}
          approveRef={approveRef}
          submitRef={submitRef}
          cancelLabel={editing && first !== undefined ? reviewCopy.you.keepMine(first.result) : undefined}
          onCancel={editing ? () => setEditing(false) : undefined}
          onSubmit={(values) => {
            setError(undefined);
            setPending(values);
          }}
        />
      </>
    );
  }

  return (
    <Box
      component="aside"
      id={REVIEW_PANEL_ID}
      aria-label={reviewCopy.gate.regionLabel[summary.gate.kind](stage)}
      data-gate-kind={summary.gate.kind}
      data-testid="review-panel"
      data-review-state={summary.state}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        // "Review now" scrolls here: keep the panel's top clear of the page's sticky header.
        scrollMarginTop: '16px',
        '@media (max-width: 1179.98px)': {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          '& [data-rv-wide]': { gridColumn: '1 / -1' },
          '& [data-rv-reqs]': { borderRight: `1px solid ${changeOrderBorder.default}`, borderBottom: 0 },
        },
        '@media (max-width: 860px)': {
          display: 'flex',
          '& [data-rv-reqs]': { borderRight: 0, borderBottom: `1px solid ${changeOrderBorder.default}` },
        },
      }}
    >
      <Box data-rv-wide data-testid="review-panel-header" sx={{ ...sectionSx, background: changeOrderSurface.sunk }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Box component="h3" sx={{ margin: 0, fontSize: changeOrderType.size.lead, fontWeight: changeOrderType.weight.strong }}>
            {reviewCopy.gate.heading[summary.gate.kind]}
          </Box>
          {primary !== undefined ? (
            <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.body, fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.muted }}>
              {primary.name}
            </Box>
          ) : null}
          {/* A link to this review, in every state: the author sends it to someone who can approve. */}
          <Tooltip title={reviewCopy.author.copyLink} placement="left">
            <IconButton
              size="small"
              aria-label={reviewCopy.author.copyLink}
              onClick={copyLink}
              data-testid="review-copy-link"
              sx={{
                marginLeft: 'auto',
                color: changeOrderInk.subtle,
                borderRadius: `${changeOrderShape.radius.md}px`,
                '&:hover': { color: changeOrderInk.default, backgroundColor: changeOrderSurface.inset },
                '&:focus-visible': { outline: `2px solid ${changeOrderStatus.accent}`, outlineOffset: 2 },
              }}
            >
              <InsertLinkIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Score summary={summary} now={now} />
        {reviews.error !== undefined ? (
          <Alert severity="warning" sx={{ marginTop: '10px' }}>
            {reviews.error === 'truncated' ? reviewCopy.panel.truncated : reviewCopy.panel.loadError}
          </Alert>
        ) : null}
      </Box>

      <Box data-rv-wide data-testid="review-you" sx={sectionSx}>
        <SectionLabel>{reviewCopy.panel.yourReview}</SectionLabel>
        {summary.requestedOfViewer !== undefined && !summary.requestedOfViewer.reviewed ? (
          <Box
            data-testid="review-requested-of-you"
            sx={{
              marginBottom: '10px',
              padding: '8px 10px',
              borderRadius: `${changeOrderShape.radius.md}px`,
              background: changeOrderStatus.warnSoft,
              border: `1px solid ${changeOrderStatus.warnLine}`,
              fontSize: changeOrderType.size.small,
              lineHeight: 1.45,
            }}
          >
            {reviewCopy.requests.ofYouPanel(
              summary.requestedOfViewer.requestedBy?.name ?? reviewCopy.requests.someone,
              agoText(summary.requestedOfViewer.requestedAt, now),
            )}
          </Box>
        ) : null}
        {reviews.isLoading ? <Skeleton variant="rounded" height={120} /> : you}
      </Box>

      {summary.requests.length > 0 || reviews.canRequestReview ? (
        <Box data-rv-wide sx={sectionSx}>
          <ReviewRequestsSection
            summary={summary}
            canRequest={reviews.canRequestReview}
            now={now}
            onRequest={reviews.requestReview}
            onWithdraw={reviews.withdrawReviewRequest}
            onNotice={onNotice}
          />
        </Box>
      ) : null}

      <Box data-rv-reqs sx={sectionSx}>
        <SectionLabel>{reviewCopy.panel.requirementsFor[summary.gate.kind](stage)}</SectionLabel>
        <ReviewRequirementList requirements={summary.requirements} />
      </Box>

      <Box sx={sectionSx}>
        <SectionLabel right={reviewCopy.panel.recorded(summary.decisions.length)}>{reviewCopy.panel.decisions}</SectionLabel>
        <ReviewDecisionList decisions={summary.decisions} requirements={summary.requirements} now={now} />
      </Box>

      {pending !== null ? (
        <ReviewConfirmDialog
          open
          result={pending.result}
          note={pending.note}
          summary={summary}
          coverageByType={reviews.coverageByType}
          orderSlug={orderSlug}
          replaces={editing ? owns : []}
          otherGatesHolding={otherGatesHolding}
          submitting={reviews.isSubmitting}
          error={error}
          onCancel={closeDialog}
          onConfirm={() => {
            void confirm();
          }}
        />
      ) : null}
    </Box>
  );
}
