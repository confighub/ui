// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The band at the top of the ChangeOrder summary card when the next stage is held
 * on review: who is needed, how many, since when, and whether the viewer can
 * act. One call to action.
 *
 * Tone by state: warn while waiting, success when complete, danger when a
 * rejection blocks the stage.
 */

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';

import { changeOrderFontMono, changeOrderInk, changeOrderShape, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { reviewPromoteButtonSx, reviewQuietButtonSx } from './reviewButtons';
import { agoText, durationText, epochOf, firstName, fromText, fromTitle, reviewCopy, reviewSubject, reviewTime } from './reviewCopy';
import { outOfDateDecisions } from './changeOrderReviews';
import { MonogramRow, StageText } from './reviewParts';
import { REVIEW_TONE, type ReviewTone } from './reviewButtons';
import type { PromoteReadiness, RequirementProgress, ReviewGateKind, StageReviewSummary } from './changeOrderReviewTypes';

export type ReviewBandAction = 'review' | 'panel' | 'promote' | 'release';

interface ReviewBandProps {
  summary: StageReviewSummary;
  /**
   * For an entry gate: whether the stage can be promoted. "can be promoted" is
   * said only for `ready` (M5); complete reviews with other gates holding read
   * "The reviews for X are complete".
   */
  readiness?: PromoteReadiness;
  now: number;
  /**
   * False while no card has the review's form (the change it reads has not landed):
   * the band then says so, and offers no `review` or `panel` action.
   */
  reviewable?: boolean;
  /** `review` focuses the form, `panel` only scrolls to it, `promote` goes to the Promote button. */
  onAction: (action: ReviewBandAction) => void;
  /**
   * Undefined where the stage the title names cannot be linked: the reader is on its card,
   * its change has not landed, or the subject is the ChangeOrder's own Space.
   */
  onGoToSubject?: () => void;
}

const copy = reviewCopy.band;

function Fig({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.bold, color: changeOrderInk.default }}>
      {children}
    </Box>
  );
}

function MonoName({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ fontFamily: changeOrderFontMono }}>
      {children}
    </Box>
  );
}

/** One requirement's fact in the "Reviews complete" band, with the server's count. */
function completeFact(req: RequirementProgress, first: boolean): ReactNode {
  // No server rows for the viewer: name the requirement, no count (#5788).
  if (!req.evaluated) {
    return (
      <>
        <MonoName>{req.name}</MonoName> {copy.satisfiedNoCount}
      </>
    );
  }
  if (first) {
    return (
      <>
        <Fig>{req.passes}</Fig> of <Fig>{req.rules.required}</Fig> on <MonoName>{req.name}</MonoName>
      </>
    );
  }
  return (
    <>
      <MonoName>{req.name}</MonoName> <Fig>{req.passes}</Fig> of <Fig>{req.rules.required}</Fig>
    </>
  );
}

/** "rejected the change in staging, so prod is blocked", or its release, or the sign-off. */
function blockedTitle(kind: ReviewGateKind, stage: string, subject: string, onGo: (() => void) | undefined): ReactNode {
  if (kind === 'release') return copy.blockedReleaseTitle(stage);
  if (kind === 'final') return copy.blockedFinalTitle;
  return <StageText build={(s) => copy.blockedTitle(stage, s)} stage={subject} onGo={onGo} testId="review-band-stage-link" />;
}

/** "prod needs 1 more approval of the change in staging on", for the gate's own action. */
function waitingTitle(kind: ReviewGateKind, stage: string, subject: string, need: number, onGo: (() => void) | undefined): ReactNode {
  if (need === 0) return copy.heldTitle(stage);
  if (kind === 'release') return copy.releaseWaitingTitle(stage, need);
  if (kind === 'final') return copy.finalWaitingTitle(need);
  return <StageText build={(s) => copy.waitingTitle(stage, s, need)} stage={subject} onGo={onGo} testId="review-band-stage-link" />;
}

/**
 * The complete state. Only an entry gate whose stage is `ready` on every
 * server gate says "can be promoted" and offers "Go to promote" (M5).
 */
function completeTitleAndCta(
  kind: ReviewGateKind,
  stage: string,
  readiness: PromoteReadiness | undefined,
): { title: string; cta: Cta } {
  const open: Cta = { label: copy.openReview, action: 'panel' };
  if (kind === 'release') return { title: copy.releaseCompleteTitle(stage), cta: { label: copy.goToRelease, action: 'release' } };
  if (kind === 'final') return { title: copy.finalCompleteTitle, cta: open };
  if (readiness?.kind === 'ready') return { title: copy.completeTitle(stage), cta: { label: copy.goToPromote, action: 'promote' } };
  const others = readiness?.kind === 'reviewsComplete' ? readiness.otherGatesHolding : [];
  return { title: copy.reviewsCompleteTitle(stage, others), cta: open };
}

interface Cta {
  label: string;
  action: ReviewBandAction;
}

/** "Go to promote" and "Go to release" lead to Promote and Release, so they share their purple. */
function leadsToAction(cta: Cta): boolean {
  return cta.action === 'promote' || cta.action === 'release';
}

/** What the viewer is told and offered, in the waiting state. */
function viewerLine(summary: StageReviewSummary, now: number): { you: string; cta: Cta } {
  const { eligibility, ownByType } = summary.viewer;
  // A review requested of the viewer comes first: it is the reason they are here.
  const asked = summary.requestedOfViewer;
  if (asked !== undefined && !asked.reviewed && Object.keys(ownByType).length === 0) {
    const by = asked.requestedBy?.name ?? reviewCopy.requests.someone;
    return { you: reviewCopy.requests.ofYouBand(by, agoText(asked.requestedAt, now)), cta: { label: copy.reviewNow, action: 'review' } };
  }
  if (eligibility.kind === 'author') {
    return { you: copy.youAuthor, cta: { label: copy.seeWhoCan, action: 'panel' } };
  }
  // The server does not count the viewer: say so before any decision of theirs (it does not count).
  if (eligibility.kind === 'notEligible') {
    return { you: copy.youNotListed, cta: { label: copy.seeWhoCan, action: 'panel' } };
  }
  if (outOfDateDecisions(summary).length > 0) {
    return { you: copy.youOutOfDate, cta: { label: copy.reviewNow, action: 'review' } };
  }
  const own = Object.values(ownByType)[0];
  if (own !== undefined) {
    return {
      you: own.result === 'Pass' ? copy.youApproved : copy.youRejected,
      cta: { label: copy.openReview, action: 'panel' },
    };
  }
  if (eligibility.kind === 'notEvaluated' && !eligibility.mayDecide) {
    return { you: reviewCopy.notEvaluatedShort[eligibility.why] ?? reviewCopy.notEvaluated.short, cta: { label: copy.openReview, action: 'panel' } };
  }
  if (eligibility.kind === 'signedOut') {
    return { you: copy.youSignedOut, cta: { label: copy.openReview, action: 'panel' } };
  }
  return {
    you: eligibility.kind === 'partial' ? copy.youPartial : copy.youEligible,
    cta: { label: copy.reviewNow, action: 'review' },
  };
}

export function ReviewBand({ summary, readiness, now, reviewable = true, onAction, onGoToSubject }: ReviewBandProps) {
  const primary = summary.primary;
  if (primary === undefined || summary.state === 'none') return null;

  const stage = summary.gate.stageName;
  const subject = reviewSubject(summary).name;
  const kind = summary.gate.kind;
  const rejecter = primary.rejecters[0];
  const blocked = summary.state === 'rejected' && rejecter !== undefined;
  const complete = !blocked && summary.open;

  let tone: ReviewTone = 'warn';
  let Icon = PersonOutlineOutlinedIcon;
  let kicker: string = copy.waitingKicker;
  let title: ReactNode;
  const facts: ReactNode[] = [];
  let you = '';
  let cta: Cta;

  if (blocked) {
    tone = 'bad';
    Icon = BlockIcon;
    kicker = copy.blockedKicker;
    title = (
      <>
        <b>{rejecter.name}</b>&nbsp;{blockedTitle(kind, stage, subject, onGoToSubject)}
      </>
    );
    facts.push(
      <span key="any">
        {copy.anyRejectionBlocks} <MonoName>{primary.name}</MonoName>
        {copy.whateverCount}
      </span>,
      <span key="clears">{copy.clearsWhenAny(firstName(rejecter.name))}</span>,
    );
    cta = { label: copy.readRejection, action: 'panel' };
  } else if (complete) {
    tone = 'ok';
    Icon = CheckIcon;
    kicker = copy.completeKicker;
    const done = completeTitleAndCta(kind, stage, readiness);
    title = done.title;
    summary.requirements.forEach((req, i) => {
      facts.push(
        <Box component="span" key={req.name} sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {i === 0 ? <MonogramRow passers={req.passers} /> : null}
          <span>{completeFact(req, i === 0)}</span>
        </Box>,
      );
    });
    const earliest = summary.requirements
      .map((r) => r.validUntil)
      .filter((v): v is string => v !== undefined)
      .sort()[0];
    if (earliest !== undefined) {
      facts.push(
        <span key="valid">
          {copy.validUntil} <b>{reviewTime(earliest)}</b>
        </span>,
      );
    }
    cta = done.cta;
  } else {
    title = (
      <>
        {waitingTitle(kind, stage, subject, primary.need, onGoToSubject)}&nbsp;
        <MonoName>{primary.name}</MonoName>
      </>
    );
    facts.push(
      <Box component="span" key="people" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <MonogramRow passers={primary.passers} stillNeeded={primary.evaluated ? primary.need : 0} />
        {primary.evaluated ? (
          <span>
            <Fig>{primary.passes}</Fig> of <Fig>{primary.required}</Fig> {copy.recorded}
          </span>
        ) : (
          <span>{reviewCopy.notEvaluatedShort[primary.notEvaluated ?? 'error'] ?? reviewCopy.notEvaluated.short}</span>
        )}
      </Box>,
    );
    const since = epochOf(summary.waitingSince);
    if (since !== undefined) {
      facts.push(
        <span key="since">
          {copy.waiting} <b>{durationText(now - since)}</b>
          {summary.waitingSinceSource === 'reviewRequest'
            ? reviewCopy.requests.sinceRequest(reviewTime(summary.waitingSince))
            : reviewCopy.requests.sincePromotion(reviewTime(summary.waitingSince))}
        </span>,
      );
    }
    facts.push(
      <span key="from">
        {copy.from}{' '}
        <Box component="span" title={fromTitle(primary.rules)}>
          {fromText(primary.rules)}
        </Box>
        {primary.rules.allowAuthors ? '' : copy.notAuthor}
      </span>,
    );
    const expired = summary.decisions.filter((d) => d.expired && d.countsToward.length === 0).length;
    const revoked = summary.decisions.filter((d) => d.revokedAt !== undefined && d.result === 'Fail').length;
    if (expired + revoked > 0) facts.push(<span key="void">{copy.expiredAndRevoked(expired, revoked)}</span>);
    const line = viewerLine(summary, now);
    you = line.you;
    cta = line.cta;
  }

  const noForm = !reviewable && (cta.action === 'review' || cta.action === 'panel');
  if (noForm) you = kind === 'release' ? copy.releaseNotYet(stage) : reviewCopy.entryStatus.notLanded(subject);

  const t = REVIEW_TONE[tone];
  return (
    <Box
      // A named region, not a live one: outcomes are announced by the page's one live region.
      role="region"
      aria-label={kicker}
      data-testid="review-band"
      data-review-state={summary.state}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0,1fr) auto',
        gap: '14px',
        alignItems: 'center',
        padding: '12px 20px',
        background: t.bg,
        borderBottom: `1px solid ${t.line}`,
        '@media (max-width: 860px)': {
          gridTemplateColumns: 'auto minmax(0,1fr)',
          '& [data-band-cta]': { gridColumn: '1 / -1', justifyContent: 'flex-start' },
        },
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 30,
          height: 30,
          borderRadius: `${changeOrderShape.radius.pill}px`,
          display: 'grid',
          placeItems: 'center',
          background: changeOrderSurface.card,
          color: t.fg,
          boxShadow: `inset 0 0 0 1px ${t.line}`,
        }}
      >
        <Icon sx={{ fontSize: 15 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: changeOrderType.size.prose,
            fontWeight: changeOrderType.weight.strong,
            color: changeOrderInk.default,
          }}
        >
          <Box
            component="span"
            sx={{
              fontSize: changeOrderType.size.micro,
              fontWeight: changeOrderType.weight.bold,
              letterSpacing: '.07em',
              textTransform: 'uppercase',
              color: t.fg,
            }}
          >
            {kicker}
          </Box>
          <span>{title}</span>
        </Box>
        <Box
          sx={{
            marginTop: '3px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px 18px',
            fontSize: changeOrderType.size.body,
            color: changeOrderInk.muted,
            '& b': { color: changeOrderInk.default, fontWeight: changeOrderType.weight.semibold },
          }}
        >
          {facts}
        </Box>
      </Box>
      <Box data-band-cta sx={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
        {you !== '' ? (
          <Box
            component="span"
            sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted, textAlign: 'right', maxWidth: '30ch' }}
          >
            {you}
          </Box>
        ) : null}
        {noForm ? null : (
          <Button
            size="small"
            variant={leadsToAction(cta) ? 'contained' : 'outlined'}
            disableElevation
            data-review-cta={cta.action}
            onClick={() => onAction(cta.action)}
            sx={leadsToAction(cta) ? reviewPromoteButtonSx : reviewQuietButtonSx}
          >
            {cta.label}
          </Button>
        )}
      </Box>
    </Box>
  );
}
