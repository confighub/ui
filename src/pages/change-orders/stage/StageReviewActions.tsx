// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The status box while a review holds the stage: what the review needs, where the
 * viewer stands, and the one or two things the viewer can do about it.
 *
 * A plain approve or reject records from the inline form, with no dialog: a
 * decision can be withdrawn, so the dialog's "last point to stop" is not needed
 * there. The dialog stays where a decision does more than one thing: changing an
 * earlier decision (it revokes, then records), several Attestation Types, or a
 * decision that counts on only some of the Units.
 *
 * Keep this box mounted while the state moves between the review kinds, so focus
 * can follow an action (Approve… after a withdrawal) instead of being dropped.
 */

import { useRef, useState, type ReactNode, type Ref } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CheckIcon from '@mui/icons-material/Check';

import { ReviewConfirmDialog, type ReviewConfirmError } from '../reviews/ReviewConfirmDialog';
import { REVIEW_PANEL_ID } from '../reviews/reviewAnchor';
import { agoText, fromText, gateThing, listText, reviewCopy, reviewFeeds, reviewTime } from '../reviews/reviewCopy';
import type { GateReviewSummary, ReviewChoice, ReviewCoverage, ReviewPerson, SubmitReviewOutcome, UseGateReviewsResult } from '../reviews/changeOrderReviewTypes';
import { InlineReviewForm } from './InlineReviewForm';
import { AskAgain, RequestReviewControl } from './RequestReviewPicker';
import { stageCardCopy, type NamedSpace } from './stageCardCopy';
import { approverNames, flowNeedsConfirmDialog, flowShowsForm } from './stageReviewModel';
import { GateReasons, ProblemList } from './StageProblem';
import { CopyText, InlineNotice, QuoteBlock, StageStatusBox, StatusActions, StatusText, type StageLinks } from './StageBoxParts';
import type { ReviewViewerFlow, StageBoxLook, StageCardState } from './stageTypes';

const copy = stageCardCopy.review;

type ReviewState = Extract<StageCardState, { kind: 'reviewNeeded' | 'reviewWaiting' | 'reviewApproved' | 'reviewRejected' }>;

type Mode = { kind: 'idle' } | { kind: 'form'; choice: ReviewChoice } | { kind: 'withdraw' };

type FocusTarget = 'approve' | 'reject' | 'review' | 'withdraw' | 'withdrawConfirm';

export interface StageReviewBoxProps {
  state: ReviewState;
  look: StageBoxLook;
  stage: { id: string; name: string };
  summary: GateReviewSummary;
  reviews: UseGateReviewsResult;
  orderSlug: string;
  now: number;
  links: StageLinks;
  nameOfSpace: (spaceId: string) => string;
  nameOfUnit: (unitId: string) => string;
  /** For the entry gate the review counts toward: the other gates still holding its stage. */
  otherGatesHolding?: string[];
  /** The Spaces a failing gate names, for its reason line. */
  gateSpaces?: (gateId: string) => NamedSpace[];
  /** Given to Approve…, so "Review now" can focus it. */
  approveRef?: Ref<HTMLButtonElement>;
  headingRef?: Ref<HTMLHeadingElement>;
  /** The page's live region. */
  announce: (text: string) => void;
  /** The author asked the rejecter to review again: the sidebar's row says so. */
  onAskedAgain?: (userId: string) => void;
  /** A decision was recorded: the page shows its toast and reads the gates again. */
  onRecorded: (outcome: Extract<SubmitReviewOutcome, { ok: true }>, summary: GateReviewSummary, result: ReviewChoice) => void;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) (ref as { current: T | null }).current = value;
}

/** "Jesper or Brian", "Ana, Tom or Lee". */
function orList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** "14 Units in 7 Spaces": the Units a decision covers where a gate needs it. */
function coverageText(summary: GateReviewSummary, flow: ReviewViewerFlow, coverageByType: Readonly<Record<string, ReviewCoverage>>): string | undefined {
  const coverages = flow.types.map((type) => coverageByType[type]).filter((c): c is ReviewCoverage => c !== undefined);
  if (coverages.length === 0) return undefined;
  const units = coverages.reduce((n, c) => n + c.covered.filter((row) => row.unchanged !== true).length, 0);
  return copy.coverageSummary(units, coverages[0]?.spaceCount ?? summary.gateSpaces.length);
}

const focusSx = { '&.Mui-focusVisible, &:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } } as const;

export function StageReviewBox(props: StageReviewBoxProps) {
  const { state, look, stage, summary, reviews, now, links, announce, onRecorded } = props;
  const flow = state.flow;
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<{ result: ReviewChoice; note: string } | null>(null);
  const [dialogError, setDialogError] = useState<ReviewConfirmError | undefined>(undefined);
  const [revokeDone, setRevokeDone] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const focusNext = useRef<FocusTarget | null>(null);

  /** A callback ref that focuses its element once, when focus was sent there. */
  const focusRef =
    <T extends HTMLElement>(target: FocusTarget, outer?: Ref<T>) =>
    (el: T | null) => {
      assignRef(outer, el);
      if (el !== null && focusNext.current === target) {
        focusNext.current = null;
        el.focus();
      }
    };
  const close = (back: FocusTarget) => {
    focusNext.current = back;
    setMode({ kind: 'idle' });
  };
  const fail = (text: string) => {
    setError(text);
    announce(text);
  };

  const primary = summary.primary;
  const rejecter = state.kind === 'reviewRejected' ? state.rejection?.rejecter : undefined;
  const youRejected = flow.kind === 'ownRejected' || rejecter?.isYou === true;
  const candidates: ReviewPerson[] = summary.whoCanStillApprove.map((w) => w.person).filter((p) => !p.isYou);
  const subjectStage = summary.attestTarget.TargetStage;
  const subject = subjectStage !== undefined && subjectStage !== stage.id ? { stageId: subjectStage, name: summary.gateStageName } : undefined;
  const feeds = reviewFeeds(summary);
  const held = listText(feeds.map(gateThing));
  const showsForm = flowShowsForm(flow) || editing;

  // ── Actions ──────────────────────────────────────────────────────────────
  const decide = async (result: ReviewChoice, note: string) => {
    setError(undefined);
    if (editing || flowNeedsConfirmDialog(flow)) {
      setDialogError(undefined);
      setPending({ result, note });
      return;
    }
    const outcome = await reviews.submit({ result, note, replaces: [] });
    if (!outcome.ok) {
      fail(outcome.stage === 'nothingRecorded' ? reviewCopy.confirm.nothingRecorded : outcome.message);
      return;
    }
    setMode({ kind: 'idle' });
    onRecorded(outcome, summary, result);
  };
  const confirmDialog = async () => {
    if (pending === null) return;
    const replaces = editing && !revokeDone ? flow.own : [];
    const outcome = await reviews.submit({ result: pending.result, note: pending.note, replaces });
    if (!outcome.ok) {
      if (outcome.stage === 'record' && replaces.length > 0) setRevokeDone(true);
      setDialogError({
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
    setMode({ kind: 'idle' });
    onRecorded(outcome, summary, result);
  };
  const withdraw = async () => {
    setError(undefined);
    const outcome = await reviews.withdraw();
    if (!outcome.ok) {
      fail(outcome.message);
      return;
    }
    close('approve');
    announce(stageCardCopy.announce.rejectionWithdrawn);
  };
  // ── Pieces ───────────────────────────────────────────────────────────────
  const approveReject = (
    <StatusActions key="actions">
      <Button
        variant="contained"
        color="primary"
        startIcon={<CheckIcon sx={{ fontSize: '18px !important' }} />}
        ref={focusRef<HTMLButtonElement>('approve', props.approveRef)}
        onClick={() => setMode({ kind: 'form', choice: 'Pass' })}
        data-testid="review-approve"
        sx={focusSx}
      >
        {copy.approve}
      </Button>
      <Button variant="text" ref={focusRef<HTMLButtonElement>('reject')} onClick={() => setMode({ kind: 'form', choice: 'Fail' })} data-testid="review-reject" sx={{ px: '10px', ...focusSx }}>
        {copy.reject}
      </Button>
      {editing ? (
        <Button variant="text" onClick={() => setEditing(false)} data-testid="review-keep" sx={{ px: '10px', ...focusSx }}>
          {reviewCopy.you.keepMine(flow.own[0]?.result ?? 'Pass')}
        </Button>
      ) : null}
    </StatusActions>
  );
  const changeButton = (
    <Button variant="text" onClick={() => setEditing(true)} data-testid="review-change" sx={{ px: '10px', ...focusSx }}>
      {copy.changeMyDecision}
    </Button>
  );

  const form =
    mode.kind === 'form' ? (
      <InlineReviewForm
        key="form"
        choice={mode.choice}
        subjectName={summary.gateStageName}
        {...(state.action === 'promote' && subject !== undefined ? { promotionInto: stage.name } : {})}
        coverageText={coverageText(summary, flow, reviews.coverageByType)}
        blockedReason={flow.nothingRecordable ? copy.nothingRecordable : undefined}
        submitting={reviews.isSubmitting && pending === null}
        error={error}
        lead={
          flow.otherRejecter !== undefined && mode.choice === 'Pass' ? (
            <InlineNotice tone="error" testId="review-rejection-stands">
              <b>{copy.rejectionStands}</b>
              {copy.rejectionStandsRest(held, flow.otherRejecter.name)}
            </InlineNotice>
          ) : undefined
        }
        onSubmit={(note) => void decide(mode.choice, note)}
        onCancel={() => close(state.kind === 'reviewRejected' && !youRejected ? 'review' : mode.choice === 'Pass' ? 'approve' : 'reject')}
      />
    ) : null;

  const beforeYouApprove =
    state.problems.length > 0 && showsForm ? (
      <InlineNotice key="before" tone="warning" testId="review-before-you-approve">
        <b>{stageCardCopy.body.beforeYouApprove}</b>
        <ProblemList problems={state.problems} nameOfSpace={props.nameOfSpace} nameOfUnit={props.nameOfUnit} links={links} />
      </InlineNotice>
    ) : null;

  const withdrawActions =
    mode.kind === 'withdraw' ? (
      <Box
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !reviews.isSubmitting) {
            event.stopPropagation();
            close('withdraw');
          }
        }}
      >
        <StatusActions>
          <Button
            variant="outlined"
            color="primary"
            ref={focusRef<HTMLButtonElement>('withdrawConfirm')}
            aria-disabled={reviews.isSubmitting ? true : undefined}
            onClick={() => !reviews.isSubmitting && void withdraw()}
            data-testid="review-withdraw-confirm"
            sx={{ bgcolor: 'background.paper', ...focusSx }}
          >
            {reviews.isSubmitting ? copy.submitting : copy.confirmWithdraw}
          </Button>
          <Button variant="text" onClick={() => !reviews.isSubmitting && close('withdraw')} sx={{ px: '10px', ...focusSx }}>
            {copy.cancel}
          </Button>
        </StatusActions>
      </Box>
    ) : (
      <StatusActions>
        <Button
          variant="outlined"
          color="inherit"
          ref={focusRef<HTMLButtonElement>('withdraw')}
          onClick={() => {
            focusNext.current = 'withdrawConfirm';
            setMode({ kind: 'withdraw' });
          }}
          data-testid="review-withdraw"
          sx={{ bgcolor: 'background.paper', ...focusSx }}
        >
          {copy.withdraw}
        </Button>
        {changeButton}
      </StatusActions>
    );

  /** The viewer's own decisions the server does not count, said after why. */
  const ownNotCounted =
    flow.ownNotCounted.length === 0 ? null : (
      <Box key="own-not-counted">
        {flow.ownNotCounted.map((line, i) => (
          <StatusText key={i} testId="review-own-not-counted">
            {line}
          </StatusText>
        ))}
      </Box>
    );

  /** "Change my decision": the decision it replaces, then Approve and Reject. */
  const own = flow.own[0];
  const changingDecision: ReactNode[] = [
    <StatusText key="change">
      {reviewCopy.you.changeLead}
      {own === undefined ? null : reviewCopy.you.changeRest(own.result, reviewTime(own.createdAt))}
    </StatusText>,
    beforeYouApprove,
    mode.kind === 'form' ? form : approveReject,
  ];

  // ── Body ─────────────────────────────────────────────────────────────────
  let headline: ReactNode;
  const body: ReactNode[] = [];

  if (state.kind === 'reviewRejected') {
    const rejection = state.rejection;
    const who = rejection === undefined ? reviewCopy.requests.someone : rejection.rejecter.isYou ? 'You' : rejection.rejecter.name;
    headline =
      state.action === 'release'
        ? `${who} rejected ${copy.rejectedRelease(stage.name)}`
        : youRejected
          ? stageCardCopy.headline.rejectedByYou
          : stageCardCopy.headline.rejectedBy(who);
    if (rejection !== undefined) {
      body.push(
        <QuoteBlock key="quote" testId="review-rejection-quote" byline={<CopyText parts={copy.quoteByline(reviewTime(rejection.createdAt), rejection.requirementName)} />}>
          {rejection.note}
        </QuoteBlock>,
        <StatusText key="clears" sx={{ mt: '10px' }}>
          {youRejected ? copy.clearsWhenYou : copy.clearsWhen(rejection.rejecter.name)}
        </StatusText>,
      );
    }
    for (const gate of state.failedGates) {
      body.push(
        <StatusText key={`gate-${gate.id}`} testId="stage-gate-reason">
          <CopyText parts={stageCardCopy.headline.gateFailed(gate.name)} />. {gate.reason}
        </StatusText>,
      );
    }
    if (editing) body.push(<StatusText key="change">{reviewCopy.you.changeLead}</StatusText>, beforeYouApprove, mode.kind === 'form' ? form : approveReject);
    else if (youRejected) body.push(<Box key="withdraw">{withdrawActions}</Box>);
    else if (flow.kind === 'author' && rejecter !== undefined) {
      body.push(
        ownNotCounted,
        <AskAgain key="ask" rejecter={rejecter} canRequest={reviews.canRequestReview} onAsk={reviews.reRequestReview} announce={announce} onAsked={props.onAskedAgain} />,
      );
    } else if (flow.kind === 'ownApproved') {
      body.push(<StatusText key="own">{copy.ownApproved(reviewTime(flow.decision.createdAt), primary?.need ?? 0)}</StatusText>, <StatusActions key="change">{changeButton}</StatusActions>);
    } else if (flowShowsForm(flow)) {
      body.push(
        beforeYouApprove,
        mode.kind === 'form' ? (
          form
        ) : (
          <StatusActions key="review">
            <Button variant="text" ref={focusRef<HTMLButtonElement>('review')} onClick={() => setMode({ kind: 'form', choice: 'Pass' })} data-testid="review-review" sx={{ px: '10px', ml: '-10px', ...focusSx }}>
              {copy.review}
            </Button>
          </StatusActions>
        ),
      );
    }
  } else if (state.kind === 'reviewApproved') {
    const h = stageCardCopy.headline;
    const first = state.failedGates.length === 1 ? state.failedGates[0] : undefined;
    const holding =
      state.wait !== undefined
        ? h.gateWaiting(state.wait.waitFor, state.wait.previousStage?.name, state.waitingGates[0]?.name ?? '')
        : first !== undefined
          ? h.gateFailed(first.name)
          : h.gatesFailed(state.failedGates.length);
    headline = <CopyText parts={h.afterApproval(holding)} codeInherit />;
    if (editing) body.push(...changingDecision);
    else if (flow.kind === 'ownApproved') {
      body.push(
        <StatusText key="flow" testId="review-own">{copy.ownApproved(reviewTime(flow.decision.createdAt), 0)}</StatusText>,
        <StatusActions key="change">{changeButton}</StatusActions>,
      );
    } else {
      const names = approverNames(summary);
      body.push(
        <StatusText key="flow" testId="review-approved-by">
          {copy.approvedBy(names.length > 0 ? names : [reviewCopy.requests.someone])}
        </StatusText>,
      );
    }
    body.push(
      <Box key="held-gates" data-testid="review-held-gates">
        <GateReasons gates={[...state.failedGates, ...state.waitingGates]} links={links} gateSpaces={props.gateSpaces} named />
      </Box>,
    );
  } else {
    headline = state.kind === 'reviewNeeded' ? stageCardCopy.headline.reviewNeeded : stageCardCopy.headline.reviewWaiting;
    if (primary !== undefined) {
      const more = summary.requirements.filter((r) => r !== primary && !r.satisfied).length;
      if (flow.kind === 'author') {
        const names = candidates.map((p) => p.name);
        const from = names.length > 0 ? orList(names) : fromText(primary.rules);
        body.push(
          <StatusText key="needs" testId="review-author">
            <CopyText parts={copy.authorNeeds(primary.name, primary.need, from)} links={links} />
            {names.length === 0 && primary.rules.fromGroups.length > 0 ? ` ${copy.authorGroupOnly}` : null}
          </StatusText>,
        );
      } else {
        const open = summary.requirements.filter((r) => !r.satisfied);
        // Several open requirements each say what they need, so the verb agrees and nothing is summed.
        const parts =
          more > 0 && open.length > 1
            ? copy.needsEach(open.map((r) => ({ name: r.name, need: r.need })), stage.name, state.action, subject)
            : copy.needs(primary.name, primary.need, stage.name, state.action, subject);
        body.push(
          <StatusText key="needs" testId="review-needs">
            <CopyText parts={parts} links={links} />
          </StatusText>,
        );
      }
    }
    const asked = summary.requestedOfViewer;
    if (asked !== undefined && !asked.reviewed && showsForm) {
      body.push(
        <StatusText key="asked" testId="review-requested-of-you">
          {copy.requestedOfYou(asked.requestedBy?.name ?? reviewCopy.requests.someone, agoText(asked.requestedAt, now))}
        </StatusText>,
      );
    }
    if (feeds.length > 1) body.push(<StatusText key="feeds" testId="review-counts-toward">{copy.countsToward(held)}</StatusText>);
    const otherGates = [...state.failedGates, ...state.waitingGates];
    if (otherGates.length > 0) {
      body.push(
        <Box key="held-gates" data-testid="review-held-gates">
          <StatusText>
            <CopyText parts={copy.alsoHeldBy(otherGates.map((gate) => gate.name), showsForm)} />
          </StatusText>
          <GateReasons gates={otherGates} links={links} gateSpaces={props.gateSpaces} named />
        </Box>,
      );
    }

    if (editing) {
      body.push(...changingDecision);
    } else {
      switch (flow.kind) {
        case 'outOfDate': {
          const line = copy.outOfDate(flow.decision.result, reviewTime(flow.decision.createdAt), flow.requirementNames);
          body.push(<StatusText key="flow" testId="review-out-of-date">{line.lead}{line.rest}</StatusText>);
          break;
        }
        case 'partial':
          if (flow.authorNote !== undefined) body.push(<StatusText key="flow" testId="review-partial">{flow.authorNote}</StatusText>);
          break;
        case 'form':
          if (flow.authorNote !== undefined) body.push(<StatusText key="flow" testId="review-author-note">{flow.authorNote}</StatusText>);
          break;
        case 'notEvaluated':
          body.push(
            <StatusText key="flow" testId="review-not-evaluated">
              {copy.notEvaluated[flow.why]}
              {flow.mayDecide ? ` ${copy.serverChecksOnSubmit}` : null}
            </StatusText>,
          );
          if (!flow.mayDecide) body.push(ownNotCounted);
          break;
        case 'notEligible':
          body.push(<StatusText key="flow" testId="review-not-eligible">{copy.notEligible}</StatusText>);
          body.push(ownNotCounted);
          if (candidates.length > 0) body.push(<StatusText key="who">{copy.whoCanApprove(listText(candidates.map((p) => p.name)))}</StatusText>);
          break;
        case 'signedOut':
          body.push(<StatusText key="flow">{copy.signedOut}</StatusText>, ownNotCounted);
          break;
        case 'countsNowhere':
          body.push(<StatusText key="flow" testId="review-would-not-count">{copy.wouldNotCount}</StatusText>, ownNotCounted);
          break;
        case 'ownApproved':
          body.push(<StatusText key="flow" testId="review-own">{copy.ownApproved(reviewTime(flow.decision.createdAt), primary?.need ?? 0)}</StatusText>, <StatusActions key="change">{changeButton}</StatusActions>);
          break;
        case 'ownRejected':
          body.push(<Box key="withdraw">{withdrawActions}</Box>);
          break;
        case 'author':
          body.push(ownNotCounted);
          body.push(<RequestReviewControl key="request" candidates={candidates} canRequest={reviews.canRequestReview} onRequest={reviews.requestReview} announce={announce} />);
          break;
      }
      if (flowShowsForm(flow)) {
        if (flow.otherRejecter !== undefined && mode.kind !== 'form') {
          body.push(
            <InlineNotice key="stands" tone="error" testId="review-rejection-stands">
              <b>{copy.rejectionStands}</b>
              {copy.rejectionStandsRest(held, flow.otherRejecter.name)}
            </InlineNotice>,
          );
        }
        body.push(beforeYouApprove, mode.kind === 'form' ? form : approveReject);
      }
    }
  }

  if (error !== undefined && mode.kind !== 'form') {
    body.push(
      <InlineNotice key="error" tone="error" testId="review-error">
        {error}
      </InlineNotice>,
    );
  }

  return (
    <>
      <StageStatusBox
        look={look}
        headline={headline}
        stateKind={state.kind}
        reviewAnchorId={REVIEW_PANEL_ID}
        headingRef={props.headingRef}
      >
        {/* Every line has its own key, so a line that arrives on a poll never remounts the form below it. */}
        {body}
      </StageStatusBox>
      {pending !== null ? (
        <ReviewConfirmDialog
          open
          result={pending.result}
          note={pending.note}
          summary={summary}
          coverageByType={reviews.coverageByType}
          orderSlug={props.orderSlug}
          replaces={editing ? flow.own : []}
          otherGatesHolding={props.otherGatesHolding}
          submitting={reviews.isSubmitting}
          error={dialogError}
          onCancel={() => {
            if (reviews.isSubmitting) return;
            setPending(null);
            setDialogError(undefined);
          }}
          onConfirm={() => void confirmDialog()}
        />
      ) : null}
    </>
  );
}
