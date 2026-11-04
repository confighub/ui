// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The review's line in the Stage log, below Now: a prompt addressed to the viewer
 * when it is their turn ("Charles, your review is needed" with Approve… and
 * Reject…), else what the review waits on, with the one thing the viewer can do.
 *
 * A plain approve or reject records from the inline form, with no dialog: a
 * decision can be withdrawn, so the dialog's "last point to stop" is not needed
 * there. The dialog stays where a decision does more than one thing: changing an
 * earlier decision (it revokes, then records), several Attestation Types, or a
 * decision that counts on only some of the Units.
 *
 * Keep this line mounted while the state moves between the review kinds, so focus
 * can follow an action (Approve… after a withdrawal) instead of being dropped.
 */
import { type ReactNode, type Ref, isValidElement, useRef, useState } from 'react';

import CheckIcon from '@mui/icons-material/Check';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

import { ReviewConfirmDialog, type ReviewConfirmError } from '../reviews/ReviewConfirmDialog';
import type {
  GateReviewSummary,
  ReviewChoice,
  ReviewCoverage,
  ReviewPerson,
  SubmitReviewOutcome,
  UseGateReviewsResult,
} from '../reviews/changeOrderReviewTypes';
import {
  agoText,
  fromText,
  gateThing,
  listText,
  reviewCopy,
  reviewFeeds,
  reviewTime,
} from '../reviews/reviewCopy';
import { InlineReviewForm } from './InlineReviewForm';
import { AskAgain, RequestReviewControl } from './RequestReviewPicker';
import {
  CopyText,
  InlineNotice,
  QuoteBlock,
  type StageLinks,
  StatusActions,
  StatusText,
} from './StageBoxParts';
import { LogInfo, LogName, LogStatus, LogSub, StageLogLine } from './StageLogLine';
import { GateReasons, ProblemList } from './StageProblem';
import { type NamedSpace, stageCardCopy } from './stageCardCopy';
import { approverNames, flowNeedsConfirmDialog, flowShowsForm, namedApprovers, needOutsideHeld } from './stageReviewModel';
import type { ReviewViewerFlow, StageCardState } from './stageTypes';

const copy = stageCardCopy.review;

type ReviewState = Extract<
  StageCardState,
  { kind: 'reviewNeeded' | 'reviewWaiting' | 'reviewApproved' | 'reviewRejected' }
>;

type Mode = { kind: 'idle' } | { kind: 'form'; choice: ReviewChoice } | { kind: 'withdraw' };

type FocusTarget = 'approve' | 'reject' | 'review' | 'withdraw' | 'withdrawConfirm';

export interface StageReviewBoxProps {
  state: ReviewState;
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
  /** The page's live region. */
  announce: (text: string) => void;
  /** The author asked the rejecter to review again: the sidebar's row says so. */
  onAskedAgain?: (userId: string) => void;
  /** A decision was recorded: the page shows its toast and reads the gates again. */
  onRecorded: (
    outcome: Extract<SubmitReviewOutcome, { ok: true }>,
    summary: GateReviewSummary,
    result: ReviewChoice,
  ) => void;
  /** How the review's line of the Stage log is addressed and marked. */
  compact: StageReviewCompact;
}

export interface StageReviewCompact {
  testId: 'open-review' | 'open-release-review';
}

/** Keys of the box's lines the log already says elsewhere: what the review needs, the other gates. */
const SAID_BY_THE_LOG = new Set([
  'needs',
  'held-gates',
  'feeds',
  'actions',
  'quote',
  'clears',
  'before',
]);

/** A failing gate's reason: the log's own prerequisite line says it. */
const saidByTheLog = (key: string) => SAID_BY_THE_LOG.has(key) || key.startsWith('gate-');

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
function coverageText(
  summary: GateReviewSummary,
  flow: ReviewViewerFlow,
  coverageByType: Readonly<Record<string, ReviewCoverage>>,
): string | undefined {
  const coverages = flow.types
    .map((type) => coverageByType[type])
    .filter((c): c is ReviewCoverage => c !== undefined);
  if (coverages.length === 0) return undefined;
  const units = coverages.reduce(
    (n, c) => n + c.covered.filter((row) => row.unchanged !== true).length,
    0,
  );
  return copy.coverageSummary(units, coverages[0]?.spaceCount ?? summary.gateSpaces.length);
}

const focusSx = {
  '&.Mui-focusVisible, &:focus-visible': {
    outline: '2px solid var(--rust)',
    outlineOffset: '2px',
  },
} as const;

export function StageReviewBox(props: StageReviewBoxProps) {
  const { state, stage, summary, reviews, now, links, announce, onRecorded } = props;
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
  const candidates: ReviewPerson[] = summary.whoCanStillApprove
    .map((w) => w.person)
    .filter((p) => !p.isYou);
  const subjectStage = summary.attestTarget.TargetStage;
  const subject =
    subjectStage !== undefined && subjectStage !== stage.id
      ? { stageId: subjectStage, name: summary.gateStageName }
      : undefined;
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
      fail(
        outcome.stage === 'nothingRecorded'
          ? reviewCopy.confirm.nothingRecorded
          : outcome.message,
      );
      return;
    }
    setMode({ kind: 'idle' });
    onRecorded(outcome, summary, result);
  };
  const confirmDialog = async () => {
    if (pending === null) return;
    const replaces = editing && !revokeDone ? flow.own : [];
    const outcome = await reviews.submit({
      result: pending.result,
      note: pending.note,
      replaces,
    });
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
    <StatusActions key='actions'>
      <Button
        variant='contained'
        color='primary'
        startIcon={<CheckIcon sx={{ fontSize: '18px !important' }} />}
        ref={focusRef<HTMLButtonElement>('approve', props.approveRef)}
        onClick={() => setMode({ kind: 'form', choice: 'Pass' })}
        data-testid='review-approve'
        sx={focusSx}
      >
        {copy.approve}
      </Button>
      <Button
        variant='text'
        ref={focusRef<HTMLButtonElement>('reject')}
        onClick={() => setMode({ kind: 'form', choice: 'Fail' })}
        data-testid='review-reject'
        sx={{ px: '10px', ...focusSx }}
      >
        {copy.reject}
      </Button>
      {editing ? (
        <Button
          variant='text'
          onClick={() => setEditing(false)}
          data-testid='review-keep'
          sx={{ px: '10px', ...focusSx }}
        >
          {reviewCopy.you.keepMine(flow.own[0]?.result ?? 'Pass')}
        </Button>
      ) : null}
    </StatusActions>
  );
  const compactApproveReject = (
    <>
      <Box
        component='span'
        data-testid={
          props.compact.testId === 'open-release-review'
            ? 'act-approve-release'
            : 'act-approve'
        }
        sx={{ display: 'inline-flex' }}
      >
        <Button
          variant='contained'
          color='primary'
          ref={focusRef<HTMLButtonElement>('approve', props.approveRef)}
          onClick={() => setMode({ kind: 'form', choice: 'Pass' })}
          data-testid='review-approve'
          sx={focusSx}
        >
          {copy.approve}
        </Button>
      </Box>
      <Box
        component='span'
        data-testid={
          props.compact.testId === 'open-release-review' ? 'act-reject-release' : 'act-reject'
        }
        sx={{ display: 'inline-flex' }}
      >
        <Button
          variant='outlined'
          color='inherit'
          ref={focusRef<HTMLButtonElement>('reject')}
          onClick={() => setMode({ kind: 'form', choice: 'Fail' })}
          data-testid='review-reject'
          sx={{ bgcolor: 'background.paper', ...focusSx }}
        >
          {copy.reject}
        </Button>
      </Box>
    </>
  );
  const changeButton = (
    <Button
      variant='text'
      onClick={() => setEditing(true)}
      data-testid='review-change'
      sx={{ px: '10px', ...focusSx }}
    >
      {copy.changeMyDecision}
    </Button>
  );

  const form =
    mode.kind === 'form' ? (
      <InlineReviewForm
        key='form'
        choice={mode.choice}
        subjectName={summary.gateStageName}
        {...(state.action === 'promote' && subject !== undefined
          ? { promotionInto: stage.name }
          : {})}
        coverageText={coverageText(summary, flow, reviews.coverageByType)}
        compact
        blockedReason={flow.nothingRecordable ? copy.nothingRecordable : undefined}
        submitting={reviews.isSubmitting && pending === null}
        error={error}
        lead={
          flow.otherRejecter !== undefined && mode.choice === 'Pass' ? (
            <InlineNotice tone='error' testId='review-rejection-stands'>
              <b>{copy.rejectionStands}</b>
              {copy.rejectionStandsRest(held, flow.otherRejecter.name)}
            </InlineNotice>
          ) : undefined
        }
        onSubmit={(note) => void decide(mode.choice, note)}
        onCancel={() =>
          close(
            state.kind === 'reviewRejected' && !youRejected
              ? 'review'
              : mode.choice === 'Pass'
                ? 'approve'
                : 'reject',
          )
        }
      />
    ) : null;

  const beforeYouApprove =
    state.problems.length > 0 && showsForm ? (
      <InlineNotice key='before' tone='warning' testId='review-before-you-approve'>
        <b>{stageCardCopy.body.beforeYouApprove}</b>
        <ProblemList
          problems={state.problems}
          nameOfSpace={props.nameOfSpace}
          nameOfUnit={props.nameOfUnit}
          links={links}
        />
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
            variant='outlined'
            color='primary'
            ref={focusRef<HTMLButtonElement>('withdrawConfirm')}
            aria-disabled={reviews.isSubmitting ? true : undefined}
            onClick={() => !reviews.isSubmitting && void withdraw()}
            data-testid='review-withdraw-confirm'
            sx={{ bgcolor: 'background.paper', ...focusSx }}
          >
            {reviews.isSubmitting ? copy.submitting : copy.confirmWithdraw}
          </Button>
          <Button
            variant='text'
            onClick={() => !reviews.isSubmitting && close('withdraw')}
            sx={{ px: '10px', ...focusSx }}
          >
            {copy.cancel}
          </Button>
        </StatusActions>
      </Box>
    ) : (
      <StatusActions>
        <Button
          variant='outlined'
          color='inherit'
          ref={focusRef<HTMLButtonElement>('withdraw')}
          onClick={() => {
            focusNext.current = 'withdrawConfirm';
            setMode({ kind: 'withdraw' });
          }}
          data-testid='review-withdraw'
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
      <Box key='own-not-counted'>
        {flow.ownNotCounted.map((line, i) => (
          <StatusText key={i} testId='review-own-not-counted'>
            {line}
          </StatusText>
        ))}
      </Box>
    );

  /** "Change my decision": the decision it replaces, then Approve and Reject. */
  const own = flow.own[0];
  const changingDecision: ReactNode[] = [
    <StatusText key='change'>
      {reviewCopy.you.changeLead}
      {own === undefined
        ? null
        : reviewCopy.you.changeRest(own.result, reviewTime(own.createdAt))}
    </StatusText>,
    beforeYouApprove,
    mode.kind === 'form' ? form : approveReject,
  ];

  // ── Body ─────────────────────────────────────────────────────────────────
  const body: ReactNode[] = [];

  if (state.kind === 'reviewRejected') {
    const rejection = state.rejection;
    if (rejection !== undefined) {
      body.push(
        <QuoteBlock
          key='quote'
          testId='review-rejection-quote'
          byline={
            <CopyText
              parts={copy.quoteByline(
                reviewTime(rejection.createdAt),
                rejection.requirementName,
              )}
            />
          }
        >
          {rejection.note}
        </QuoteBlock>,
        <StatusText key='clears' sx={{ mt: '10px' }}>
          {youRejected ? copy.clearsWhenYou : copy.clearsWhen(rejection.rejecter.name)}
        </StatusText>,
      );
    }
    for (const gate of state.failedGates) {
      body.push(
        <StatusText key={`gate-${gate.id}`} testId='stage-gate-reason'>
          <CopyText parts={stageCardCopy.headline.gateFailed(gate.name)} />. {gate.reason}
        </StatusText>,
      );
    }
    if (editing)
      body.push(
        <StatusText key='change'>{reviewCopy.you.changeLead}</StatusText>,
        beforeYouApprove,
        mode.kind === 'form' ? form : approveReject,
      );
    else if (youRejected) body.push(<Box key='withdraw'>{withdrawActions}</Box>);
    else if (flow.kind === 'author' && rejecter !== undefined) {
      body.push(
        ownNotCounted,
        <AskAgain
          key='ask'
          rejecter={rejecter}
          canRequest={reviews.canRequestReview}
          onAsk={reviews.reRequestReview}
          announce={announce}
          onAsked={props.onAskedAgain}
        />,
      );
    } else if (flow.kind === 'ownApproved') {
      body.push(
        <StatusText key='own'>
          {copy.ownApproved(reviewTime(flow.decision.createdAt), primary?.need ?? 0)}
        </StatusText>,
        <StatusActions key='change'>{changeButton}</StatusActions>,
      );
    } else if (flowShowsForm(flow)) {
      body.push(
        beforeYouApprove,
        mode.kind === 'form' ? (
          form
        ) : (
          <StatusActions key='review'>
            <Button
              variant='text'
              ref={focusRef<HTMLButtonElement>('review')}
              onClick={() => setMode({ kind: 'form', choice: 'Pass' })}
              data-testid='review-review'
              sx={{ px: '10px', ml: '-10px', ...focusSx }}
            >
              {copy.review}
            </Button>
          </StatusActions>
        ),
      );
    }
  } else if (state.kind === 'reviewApproved') {
    if (editing) body.push(...changingDecision);
    else if (flow.kind === 'ownApproved') {
      body.push(
        <StatusText key='flow' testId='review-own'>
          {copy.ownApproved(reviewTime(flow.decision.createdAt), 0)}
        </StatusText>,
        <StatusActions key='change'>{changeButton}</StatusActions>,
      );
    } else {
      const names = approverNames(summary);
      body.push(
        <StatusText key='flow' testId='review-approved-by'>
          {copy.approvedBy(names.length > 0 ? names : [reviewCopy.requests.someone])}
        </StatusText>,
      );
    }
    body.push(
      <Box key='held-gates' data-testid='review-held-gates'>
        <GateReasons
          gates={[...state.failedGates, ...state.waitingGates]}
          links={links}
          gateSpaces={props.gateSpaces}
          named
        />
      </Box>,
    );
  } else {
    if (primary !== undefined) {
      const more = summary.requirements.filter((r) => r !== primary && !r.satisfied).length;
      if (flow.kind === 'author') {
        const names = candidates.map((p) => p.name);
        const from = names.length > 0 ? orList(names) : fromText(primary.rules);
        body.push(
          <StatusText key='needs' testId='review-author'>
            <CopyText
              parts={copy.authorNeeds(primary.name, primary.need, from)}
              links={links}
            />
            {names.length === 0 && primary.rules.fromGroups.length > 0
              ? ` ${copy.authorGroupOnly}`
              : null}
          </StatusText>,
        );
      } else {
        const open = summary.requirements.filter((r) => !r.satisfied);
        // Several open requirements each say what they need, so the verb agrees and nothing is summed.
        const parts =
          more > 0 && open.length > 1
            ? copy.needsEach(
                open.map((r) => ({ name: r.name, need: r.need })),
                stage.name,
                state.action,
                subject,
              )
            : copy.needs(primary.name, primary.need, stage.name, state.action, subject);
        body.push(
          <StatusText key='needs' testId='review-needs'>
            <CopyText parts={parts} links={links} />
          </StatusText>,
        );
      }
    }
    const asked = summary.requestedOfViewer;
    if (asked !== undefined && !asked.reviewed && showsForm) {
      body.push(
        <StatusText key='asked' testId='review-requested-of-you'>
          {copy.requestedOfYou(
            asked.requestedBy?.name ?? reviewCopy.requests.someone,
            agoText(asked.requestedAt, now),
          )}
        </StatusText>,
      );
    }
    if (feeds.length > 1)
      body.push(
        <StatusText key='feeds' testId='review-counts-toward'>
          {copy.countsToward(held)}
        </StatusText>,
      );
    const otherGates = [...state.failedGates, ...state.waitingGates];
    if (otherGates.length > 0) {
      body.push(
        <Box key='held-gates' data-testid='review-held-gates'>
          <StatusText>
            <CopyText
              parts={copy.alsoHeldBy(
                otherGates.map((gate) => gate.name),
                showsForm,
              )}
            />
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
          const line = copy.outOfDate(
            flow.decision.result,
            reviewTime(flow.decision.createdAt),
            flow.requirementNames,
          );
          body.push(
            <StatusText key='flow' testId='review-out-of-date'>
              {line.lead}
              {line.rest}
            </StatusText>,
          );
          break;
        }
        case 'partial':
          if (flow.authorNote !== undefined)
            body.push(
              <StatusText key='flow' testId='review-partial'>
                {flow.authorNote}
              </StatusText>,
            );
          break;
        case 'form':
          if (flow.authorNote !== undefined)
            body.push(
              <StatusText key='flow' testId='review-author-note'>
                {flow.authorNote}
              </StatusText>,
            );
          break;
        case 'notEvaluated':
          body.push(
            <StatusText key='flow' testId='review-not-evaluated'>
              {copy.notEvaluated[flow.why]}
              {flow.mayDecide ? ` ${copy.serverChecksOnSubmit}` : null}
            </StatusText>,
          );
          if (!flow.mayDecide) body.push(ownNotCounted);
          break;
        case 'notEligible':
          // "Review · Waiting for {names}" and no Approve already say it: only a decision of the viewer's that does not count is added.
          body.push(ownNotCounted);
          break;
        case 'signedOut':
          body.push(<StatusText key='flow'>{copy.signedOut}</StatusText>, ownNotCounted);
          break;
        case 'countsNowhere':
          body.push(
            <StatusText key='flow' testId='review-would-not-count'>
              {copy.wouldNotCount}
            </StatusText>,
            ownNotCounted,
          );
          break;
        case 'ownApproved': {
          // Held for a reason no approval can change: say the server's reason, not "more approvals needed".
          const held = summary.requirements.find((r) => r.heldFor !== undefined)?.heldFor;
          body.push(
            <StatusText key='flow' testId='review-own'>
              {copy.ownApproved(reviewTime(flow.decision.createdAt), primary === undefined ? 0 : needOutsideHeld(primary))}
            </StatusText>,
            ...(held === undefined
              ? []
              : [
                  <StatusText key='held' testId='review-held'>
                    {held.text}
                  </StatusText>,
                ]),
            <StatusActions key='change'>{changeButton}</StatusActions>,
          );
          break;
        }
        case 'ownRejected':
          body.push(<Box key='withdraw'>{withdrawActions}</Box>);
          break;
        case 'author':
          body.push(ownNotCounted);
          body.push(
            <RequestReviewControl
              key='request'
              candidates={candidates}
              canRequest={reviews.canRequestReview}
              onRequest={reviews.requestReview}
              announce={announce}
            />,
          );
          break;
      }
      if (flowShowsForm(flow)) {
        if (flow.otherRejecter !== undefined && mode.kind !== 'form') {
          body.push(
            <InlineNotice key='stands' tone='error' testId='review-rejection-stands'>
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
      <InlineNotice key='error' tone='error' testId='review-error'>
        {error}
      </InlineNotice>,
    );
  }

  const c = props.compact;
  const release = c.testId === 'open-release-review';
  // The approvers the review names (its users and group members), never just who already approved (H3).
  const named = namedApprovers(summary);
  const others = named.names;
  const need = primary?.need ?? 0;
  const formOpen = mode.kind === 'form';
  const prompt =
    !editing &&
    flowShowsForm(flow) &&
    (state.kind === 'reviewNeeded' || state.kind === 'reviewWaiting');
  const rest = body.filter(
    (node) => !(isValidElement(node) && saidByTheLog(String(node.key))),
  );
  const errorNotice =
    error !== undefined && !formOpen ? (
      <InlineNotice tone='error' testId='review-error'>
        {error}
      </InlineNotice>
    ) : null;
  const dialog =
    pending !== null ? (
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
    ) : null;
  // The `#review` anchor is the "Review details" row right under this line.
    const anchor = { data: { 'data-stage-state': state.kind } };
  if (prompt) {
    // What the box said about where the viewer stands (asked by whom, where a decision does not count), as sub-lines.
    const notes = rest.filter((node) => !(isValidElement(node) && (node.key === 'form' || node.key === 'stands')));
    // How far the gate is stays on the line; who else may approve is behind the (i), with the author fact.
    const sub = need > 1 ? copy.needsMore(need) : undefined;
    const alsoApprove =
      release || need > 1
        ? undefined
        : named.anyone
          ? copy.anyoneCanApproveToo
          : others.length > 0
            ? copy.canApproveToo(orList(others))
            : undefined;
    const info = [flow.authorInfo, alsoApprove].filter((part): part is string => part !== undefined).join(' ');
    return (
      <>
        <StageLogLine
          testId={c.testId}
          tone='prompt'
          glyph='›'
          {...anchor}
          actions={formOpen ? null : compactApproveReject}
          below={
            notes.length > 0 || formOpen || flow.otherRejecter !== undefined || errorNotice !== null ? (
              <>
                {notes}
                {flow.otherRejecter !== undefined && !formOpen ? (
                  <InlineNotice tone='error' testId='review-rejection-stands'>
                    <b>{copy.rejectionStands}</b>
                    {copy.rejectionStandsRest(held, flow.otherRejecter.name)}
                  </InlineNotice>
                ) : null}
                {formOpen ? <Box data-testid='ask-review'>{form}</Box> : null}
                {errorNotice}
              </>
            ) : null
          }
        >
          <LogName>{release ? copy.yourReleaseReview : copy.yourReview}</LogName>
          <LogStatus>{copy.needed}</LogStatus>
          {info !== '' ? <LogInfo text={info} label={copy.reviewInfoLabel} testId='review-info' /> : null}
          {!release && !formOpen && sub !== undefined ? <LogSub>{sub}</LogSub> : null}
        </StageLogLine>
        {dialog}
      </>
    );
  }
  let text: ReactNode;
  let actions: ReactNode = null;
  let below: ReactNode[] = rest;
  // Changing an earlier decision: Approve… and Reject… again, at the line's edge.
  if (editing && mode.kind !== 'form') actions = compactApproveReject;
  if (state.kind === 'reviewRejected') {
    const rejecterName = rejecter === undefined ? reviewCopy.requests.someone : rejecter.name;
    text = (
      <>
        <LogName>{copy.reviewAgain}</LogName>
        <LogStatus>
          {youRejected ? copy.youCanWithdraw : copy.canWithdraw(rejecterName)}
        </LogStatus>
      </>
    );
    if (!youRejected && flow.kind === 'author' && rejecter !== undefined) {
      actions = (
        <Box component='span' data-testid='act-askagain' sx={{ display: 'inline-flex' }}>
          <AskAgain
            rejecter={rejecter}
            canRequest={reviews.canRequestReview}
            onAsk={reviews.reRequestReview}
            announce={announce}
            onAsked={props.onAskedAgain}
            compact
          />
        </Box>
      );
      below = below.filter((node) => !(isValidElement(node) && node.key === 'ask'));
    }
  } else if (flow.kind === 'author' && !editing) {
    const names =
      others.length > 0
        ? orList(others)
        : primary === undefined
          ? ''
          : fromText(primary.rules);
    text = (
      <>
        <LogName>{copy.reviewName}</LogName>
        <LogStatus>{copy.waitingFor(names)}</LogStatus>
        <LogSub>{copy.youWroteIt}</LogSub>
      </>
    );
    // Request review only when someone can be asked; an empty place would be a hidden control.
    actions = !reviews.canRequestReview || candidates.length === 0 ? null : (
      <Box component='span' data-testid='act-request' sx={{ display: 'inline-flex' }}>
        <RequestReviewControl
          candidates={candidates}
          canRequest={reviews.canRequestReview}
          onRequest={reviews.requestReview}
          announce={announce}
          compact
        />
      </Box>
    );
    below = below.filter((node) => !(isValidElement(node) && node.key === 'request'));
  } else {
    text = (
      <>
        <LogName>{copy.reviewName}</LogName>
        <LogStatus>
          {copy.waitingFor(
            others.length > 0
              ? orList(others)
              : primary === undefined
                ? reviewCopy.requests.someone
                : fromText(primary.rules),
          )}
        </LogStatus>
      </>
    );
  }
  return (
    <>
      <StageLogLine
        testId={c.testId}
        tone='open'
        glyph='○'
        {...anchor}
        actions={actions}
        below={
          below.length > 0 || errorNotice !== null ? (
            <>
              {below}
              {errorNotice}
            </>
          ) : null
        }
      >
        {text}
      </StageLogLine>
      {dialog}
    </>
  );
}
