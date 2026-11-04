// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Stage log: one Paper with what already happened in the stage, a Now bar,
 * and what still has to happen, each open line holding its own button.
 *
 * The lines are derived by `stageLogModel.ts` from what the card's model and the
 * page already read; this file words them and places the controls. The review
 * line is the review box itself in its compact form, and the promote and release
 * lines hold `MergeButton`, so the actions behave exactly as before.
 *
 * The log adds no live region: outcomes go through the page's `announce`.
 */
import { type ReactNode, type RefObject, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import { alpha } from '@mui/material/styles';

import { clockTime } from '../changeOrderHistory';
import { COMPLETE_STAGE_ID, COMPLETE_STEP_LABEL } from '../changeOrderCompleteStep';
import type { GateReviewSummary } from '../reviews/changeOrderReviewTypes';
import { REVIEW_PANEL_ID } from '../reviews/reviewAnchor';
import { listText } from '../reviews/reviewCopy';
import { MergeButton } from './MergeButton';
import { CopyText } from './StageBoxParts';
import {
  AutoBadge,
  LockedButton,
  LogDim,
  LogInfo,
  LogName,
  LogStatus,
  LogSub,
  StageLogLine,
} from './StageLogLine';
import { ProblemList } from './StageProblem';
import { StageReviewBox } from './StageReviewActions';
import { StageReviewDetails } from './StageReviewDetails';
import { stageCardCopy } from './stageCardCopy';
import { listSegments, spaceLink } from './stageCopyParts';
import {
  type StageLogLine as LogLine,
  type StageLogOpen,
  type StageLogView,
  type StageLogWait,
  gateDetail,
  personName,
} from './stageLogModel';
import { valuePillSx } from './stageLogStyles';
import { acknowledgementSegments, propagationHeadline } from './stagePropagation';
import type { StageCardModel } from './useStageCardModel';

const copy = stageCardCopy.log;

/** At most this many Spaces in a failed prerequisite's sentence, then "and N more". */
const SPACES_SHOWN = 3;

function andList(parts: readonly ReactNode[]): ReactNode {
  if (parts.length <= 1) return parts[0] ?? null;
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 ? (i === parts.length - 1 ? ' and ' : ', ') : null}
      {part}
    </span>
  ));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const logLinkSx = {
  color: 'inherit',
  textDecoration: 'underline',
  textDecorationColor: 'var(--t4)',
  textUnderlineOffset: '3px',
  '&:hover': { textDecorationColor: 'currentColor' },
} as const;

function StageLink({
  stageId,
  name,
  model,
}: {
  stageId: string;
  name: string;
  model: StageCardModel;
}) {
  return (
    <Link
      component={RouterLink}
      to={model.links.resolvers.hrefForStage(stageId)}
      sx={logLinkSx}
    >
      {name}
    </Link>
  );
}

function Meta({ line }: { line: LogLine }) {
  if (line.meta.kind === 'auto') return <AutoBadge />;
  if (line.meta.kind === 'person') return <>{personName(line.meta.person)}</>;
  return null;
}

/** What a locked line waits for, by name: gates by name, counted from `gatesCountFrom` on. */
function waitParts(waits: readonly StageLogWait[], model: StageCardModel): ReactNode[] {
  const gateCount = waits.filter((w) => w.kind === 'gate').length;
  const counted = gateCount >= copy.gatesCountFrom;
  let gateSaid = false;
  return waits.flatMap((w, i) => {
    if (w.kind === 'review') return [<span key={i}>{copy.review}</span>];
    if (w.kind === 'releaseReview') return [<span key={i}>{copy.releaseReview}</span>];
    if (w.kind === 'promote') return [<span key={i}>{copy.thePromote}</span>];
    if (w.kind === 'gate' && counted) {
      if (gateSaid) return [];
      gateSaid = true;
      return [<span key={i}>{copy.gatesCount(gateCount)}</span>];
    }
    if (w.kind === 'stage') return [<StageLink key={i} stageId={w.stageId} name={w.name} model={model} />];
    return [<span key={i}>{w.name}</span>];
  });
}

/** The words of a locked line after its name: "Waiting for …" or "After …". */
function waitStatus(waits: readonly StageLogWait[], model: StageCardModel, after = false): ReactNode {
  // Two release reviews of one Stage read as one.
  const unique = waits.filter(
    (w, i) =>
      w.kind !== 'releaseReview' || waits.findIndex((o) => o.kind === 'releaseReview') === i,
  );
  return (
    <LogStatus>
      {after ? copy.after : copy.waitsFor}
      {andList(waitParts(unique, model))}
    </LogStatus>
  );
}

interface LineTextProps {
  line: LogLine;
  model: StageCardModel;
  dryRunStatus?: number;
}

/** The words of one history line, as a check row: the name first, then its status, the detail below. */
function LineText({ line, model, dryRunStatus }: LineTextProps) {
  const { body } = line;
  const stage = model.stage.name;
  const links = model.links;
  switch (body.kind) {
    case 'arrival':
      return (
        <>
          <LogName>
            {copy.arrivedFrom}
            {body.from !== undefined ? (
              <StageLink stageId={body.from.stageId} name={body.from.name} model={model} />
            ) : null}
          </LogName>
          {body.spaceCount !== undefined ? (
            <LogStatus>{copy.spaces(body.spaceCount)}</LogStatus>
          ) : null}
        </>
      );
    case 'source':
      return (
        <>
          <LogName>{body.invocation ? copy.definedHere : copy.madeHere}</LogName>
          {body.space !== undefined ? (
            <LogStatus>
              <CopyText parts={[spaceLink(body.space)]} links={links} />
            </LogStatus>
          ) : null}
        </>
      );
    case 'gate': {
      const { gate } = body;
      if (gate.passed) {
        return (
          <>
            <LogName>{gate.name}</LogName>
            <LogStatus>{copy.passed}</LogStatus>
            {gate.description !== undefined ? <LogDim>— {gate.description}</LogDim> : null}
          </>
        );
      }
      const shown = gate.failedIn.slice(0, SPACES_SHOWN);
      const more = gate.failedIn.length - shown.length;
      return (
        <>
          <LogName>{gate.name}</LogName>
          <LogStatus>
            {shown.length > 0 ? copy.failedIn : copy.failed}
            {shown.length > 0 ? (
              <CopyText
                parts={
                  more > 0
                    ? [
                        ...shown.flatMap((s, i) => [
                          ...(i > 0 ? [{ kind: 'text' as const, text: ', ' }] : []),
                          spaceLink(s),
                        ]),
                        {
                          kind: 'text',
                          text: ` ${stageCardCopy.problem.andMore(more).replace(' in the diff', '')}`,
                        },
                      ]
                    : listSegments(shown.map((s) => [spaceLink(s)]))
                }
                links={links}
              />
            ) : null}
          </LogStatus>
          {gate.description !== undefined ? (
            <LogSub>{copy.needs(gate.description)}</LogSub>
          ) : gate.reason !== undefined ? (
            <LogSub>{gate.reason}</LogSub>
          ) : null}
        </>
      );
    }
    case 'gateWaiting':
      return (
        <>
          <LogName>{body.gate.name}</LogName>
          <LogStatus>{copy.notYet}</LogStatus>
          {gateDetail(body.gate) !== undefined ? (
            <LogSub>{gateDetail(body.gate)}</LogSub>
          ) : null}
        </>
      );
    case 'gateUnread':
      return (
        <>
          <LogName>{body.gate.name}</LogName>
          <LogStatus>{copy.notChecked}</LogStatus>
          {body.gate.description !== undefined ? (
            <LogDim>— {body.gate.description}</LogDim>
          ) : body.gate.reason !== undefined ? (
            <LogSub>{body.gate.reason}</LogSub>
          ) : null}
        </>
      );
    case 'approval': {
      const { approval } = body;
      return (
        <>
          <LogName>{personName(approval.person, 'You')}</LogName>
          <LogStatus>
            {approval.requirement !== undefined ? copy.approvedRelease : copy.approved}
          </LogStatus>
          {approval.requirement === undefined && body.required > 1 ? (
            <LogDim>{copy.ofCount(body.index, body.required)}</LogDim>
          ) : null}
          {approval.note !== undefined ? <LogSub>{copy.quoted(approval.note)}</LogSub> : null}
        </>
      );
    }
    case 'rejected': {
      const rejection =
        model.state.kind === 'reviewRejected' ? model.state.rejection : undefined;
      return (
        <>
          <LogName>
            {rejection === undefined
              ? ''
              : rejection.rejecter.isYou
                ? 'You'
                : rejection.rejecter.name}
          </LogName>
          <LogStatus>{copy.rejected}</LogStatus>
          {rejection !== undefined && rejection.note.trim() !== '' ? (
            <LogSub testId='review-rejection-quote'>{copy.quoted(rejection.note)}</LogSub>
          ) : null}
        </>
      );
    }
    case 'promoteFailed': {
      const { failure } = body;
      return (
        <>
          <LogName>{copy.actionTo(failure.action === 'release', stage)}</LogName>
          <LogStatus>
            {copy.failedInOf(failure.failedSpaces.length, failure.spaceCount)}
          </LogStatus>
          <Box
            component='span'
            data-testid='change-order-foot-error'
            data-failure-source={failure.source}
            sx={{ display: 'block' }}
          >
            {failure.failedSpaces.flatMap((space) => {
              const named = {
                spaceId: space.spaceId,
                name: space.spaceId === '' ? space.slug : model.nameOfSpace(space.spaceId),
              };
              const items = space.items.length === 0 ? [{ message: '' }] : space.items;
              return items.map((item, i) => (
                <LogSub key={`${named.name}-${i}`}>
                  {/* Said once: a server sentence that names the Space keeps its words, with the names as links. */}
                  <CopyText
                    parts={stageCardCopy.problem.failedMessage(
                      named,
                      {
                        ...('unitId' in item && item.unitId !== undefined
                          ? { unitId: item.unitId }
                          : {}),
                        ...('unitSlug' in item && item.unitSlug !== undefined
                          ? { name: item.unitSlug }
                          : {}),
                      },
                      item.message,
                    )}
                    links={links}
                  />
                </LogSub>
              ));
            })}
            {/* The server's whole answer, when it says more than the items above ("partly failed … Promote again to finish."). */}
            {/* A recorded failure's message is built from these items (stageFailure), so only a session's server answer adds to them. */}
            {failure.source === 'session' &&
            failure.message.trim() !== '' &&
            !failure.failedSpaces.some((f) =>
              f.items.some((item) => item.message === failure.message),
            ) ? (
              <LogSub testId='stage-failure-message'>{failure.message}</LogSub>
            ) : null}
          </Box>
        </>
      );
    }
    case 'promoted':
      return (
        <>
          <LogName>{copy.promotedTo(stage)}</LogName>
          {body.spaceCount > 0 ? <LogStatus>{copy.spaces(body.spaceCount)}</LogStatus> : null}
        </>
      );
    case 'released':
      return (
        <>
          <LogName>{copy.releasedTo(stage)}</LogName>
          {body.targetCount > 0 ? (
            <LogStatus>{copy.targetsRanIt(body.targetCount)}</LogStatus>
          ) : null}
        </>
      );
    case 'restored':
      return (
        <>
          <LogName>{copy.restored}</LogName>
          <LogStatus>{copy.takenBackOut(stage)}</LogStatus>
        </>
      );
    case 'restoreReleased':
      return (
        <>
          <LogName>{copy.restoreReleased}</LogName>
          {body.targetCount > 0 ? (
            <LogStatus>{copy.targetsRunThem(body.targetCount)}</LogStatus>
          ) : null}
        </>
      );
    case 'aborted':
      return (
        <>
          <LogName>{copy.aborted}</LogName>
          <LogStatus>{copy.abortedText}</LogStatus>
          {body.reason.trim() !== '' ? <LogSub>{copy.quoted(body.reason)}</LogSub> : null}
        </>
      );
    case 'unknown':
      return (
        <>
          <LogName>{copy.progressUnavailable}</LogName>
          <LogStatus>{copy.progressUnavailableWhy}</LogStatus>
        </>
      );
    case 'held':
      return (
        <>
          <LogName>{copy.held(stage)}</LogName>
          <LogSub testId='stage-held-text'>
            <span data-held='true'>{body.text}</span>
          </LogSub>
        </>
      );
    case 'warn': {
      // Compared and found to hold it already, or taken already while the stage is not promoted as a whole.
      const hasItIds = [
        ...new Set([
          ...[...model.marks.entries()]
            .filter(([, mark]) => mark.kind === 'hasIt')
            .map(([id]) => id),
          ...model.takenSpaceIds,
        ]),
      ];
      const hasIt = hasItIds.map((spaceId) => ({ spaceId, name: model.nameOfSpace(spaceId) }));
      return (
        <>
          <LogName>{propagationHeadline(body.problems, model.spaceCount)}</LogName>
          <Box
            component='span'
            sx={{
              display: 'block',
              mt: '2px',
              color: 'text.secondary',
              '& ul': { m: 0, gap: 0, fontSize: '12.5px', maxWidth: 'none' },
              '& li': { display: 'block' },
            }}
          >
            <ProblemList
              problems={body.problems}
              nameOfSpace={model.nameOfSpace}
              nameOfUnit={model.nameOfUnit}
              links={links}
              limit={SPACES_SHOWN}
            />
          </Box>
          {hasIt.length > 0 ? (
            <LogSub>
              <CopyText parts={listSegments(hasIt.map((s) => [spaceLink(s)]))} links={links} />
              {copy.hasTheChange(hasIt.length)}
            </LogSub>
          ) : null}
        </>
      );
    }
    case 'error':
      return (
        <>
          <LogName>{copy.cantCheck(stage)}</LogName>
          <LogSub>{copy.serverAnswered(dryRunStatus)}</LogSub>
        </>
      );
    case 'empty':
      return (
        <>
          <LogName>{copy.noSpaceHere(stage)}</LogName>
          <LogSub>{copy.nothingToPromote}</LogSub>
        </>
      );
  }
}

function TryAgain({ onClick }: { onClick: () => void }) {
  return (
    <Box component='span' data-testid='act-tryagain' sx={{ display: 'inline-flex' }}>
      <Button
        variant='outlined'
        onClick={onClick}
        data-testid='stage-check-again'
        sx={{
          bgcolor: 'transparent',
          color: 'error.contrastText',
          borderColor: (t) => alpha(t.palette.error.contrastText, 0.75),
          '&:hover': {
            bgcolor: (t) => alpha(t.palette.error.contrastText, 0.12),
            borderColor: 'error.contrastText',
          },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'error.contrastText',
            outlineOffset: '2px',
          },
        }}
      >
        {copy.tryAgain}
      </Button>
    </Box>
  );
}

export interface StageLogProps {
  view: StageLogView;
  model: StageCardModel;
  /** The stage's entry and release reviews, both listed in Review details. */
  entryReview?: GateReviewSummary;
  releaseReview?: GateReviewSummary;
  /** The page's toast. */
  onNotice: (message: string) => void;
  orderSlug: string;
  now: number;
  approveRef: RefObject<HTMLButtonElement>;
  announce: (text: string) => void;
}

/**
 * "Review details ⌄" right under the review line: closed by default, it opens the
 * review's coverage, requests, requirements and decisions inline. It is the
 * `#review` anchor that "Review now" and a copied review link land on.
 */
function ReviewDetailsRow({
  model,
  now,
  onNotice,
  entryReview,
  releaseReview,
  releaseNotReached,
}: {
  model: StageCardModel;
  now: number;
  onNotice: (message: string) => void;
  entryReview: GateReviewSummary | undefined;
  releaseReview: GateReviewSummary | undefined;
  releaseNotReached: boolean;
}) {
  const [open, setOpen] = useState(false);
  const summary = model.review.summary;
  if (summary === undefined) return null;
  const { state } = model;
  const flow =
    state.kind === 'reviewNeeded' ||
    state.kind === 'reviewWaiting' ||
    state.kind === 'reviewRejected' ||
    state.kind === 'reviewApproved'
      ? state.flow
      : undefined;
  return (
    <StageLogLine
      testId='review-details-row'
      tone='detail'
      glyph=''
      anchor={REVIEW_PANEL_ID}
      meta={null}
    >
      <Button
        variant='text'
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid='review-details-toggle'
        endIcon={
          <ExpandMoreIcon
            sx={{
              fontSize: '14px !important',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform .15s',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        }
        sx={{
          height: 'auto',
          minWidth: 0,
          p: 0,
          font: '500 12.5px var(--font-sans)',
          color: 'text.secondary',
          verticalAlign: 'baseline',
          '& .MuiButton-endIcon': { ml: '2px', mr: 0 },
          '&:hover': { bgcolor: 'transparent', color: 'text.primary' },
          '&:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' },
        }}
      >
        {copy.reviewDetails}
      </Button>
      {open ? (
        <StageReviewDetails
          summary={summary}
          entrySummary={entryReview}
          releaseSummary={releaseReview}
          releaseNotReached={releaseNotReached}
          reviews={model.review.reviews}
          flow={flow}
          stageName={model.stage.name}
          now={now}
          links={model.links}
          onNotice={onNotice}
        />
      ) : null}
    </StageLogLine>
  );
}

function OpenLine({
  open,
  model,
  orderSlug,
  now,
  approveRef,
  announce,
}: { open: StageLogOpen } & Omit<StageLogProps, 'view' | 'onNotice'>) {
  const [confirming, setConfirming] = useState(false);
  const stage = model.stage.name;
  const { state, merge } = model;

  if (open.kind === 'review') {
    if (
      state.kind !== 'reviewNeeded' &&
      state.kind !== 'reviewWaiting' &&
      state.kind !== 'reviewRejected' &&
      state.kind !== 'reviewApproved'
    )
      return null;
    const summary = model.review.summary;
    if (summary === undefined) return null;
    return (
      <StageReviewBox
        state={state}
        stage={model.stage}
        summary={summary}
        reviews={model.review.reviews}
        orderSlug={orderSlug}
        now={now}
        links={model.links}
        nameOfSpace={model.nameOfSpace}
        nameOfUnit={model.nameOfUnit}
        otherGatesHolding={model.review.otherGatesHolding}
        gateSpaces={model.gateSpaces}
        approveRef={approveRef}
        announce={announce}
        onRecorded={model.review.onRecorded}
        compact={{ testId: open.testId }}
      />
    );
  }

  if (open.kind === 'line') {
    const { line } = open;
    return (
      <StageLogLine
        testId={line.testId}
        tone={line.tone}
        glyph={line.glyph}
        {...(line.at === undefined ? {} : { at: line.at })}
        meta={<Meta line={line} />}
      >
        <LineText line={line} model={model} />
      </StageLogLine>
    );
  }
  const textId = `${open.testId}-text-${model.stage.id}`;
  if (open.kind === 'promote') {
    if (open.busy) {
      return (
        <StageLogLine testId={open.testId} tone='busy' glyph='…'>
          <LogName>{copy.promoting(stage)}</LogName>
        </StageLogLine>
      );
    }
    const label = open.verb === 'retry' ? copy.retryTo(stage) : copy.promoteTo(stage);
    const promoteMerge = merge !== undefined && state.kind !== 'promoted' ? merge : undefined;
    const failure = state.kind === 'failed' ? state.failure : undefined;
    const failedNames =
      failure === undefined
        ? ''
        : listText(
            failure.failedSpaces.map((f) =>
              f.spaceId === '' ? f.slug : model.nameOfSpace(f.spaceId),
            ),
          );
    // A retry asks the dry run first: while it fails, Check again; while it runs, it says so.
    if (
      failure !== undefined &&
      (model.dryRunLine.mode === 'fails' || model.dryRunLine.mode === 'running')
    ) {
      const running = model.dryRunLine.mode === 'running';
      return (
        <StageLogLine
          testId={open.testId}
          tone='open'
          glyph={running ? '…' : '○'}
          textId={textId}
          actions={
            running ? null : (
              <Button
                variant='outlined'
                color='inherit'
                onClick={() => void model.recheck()}
                data-testid='stage-check-again'
                sx={{ bgcolor: 'background.paper' }}
              >
                {stageCardCopy.merge.checkAgain}
              </Button>
            )
          }
        >
          <LogName>{label}</LogName>
          <LogStatus>
            {running ? stageCardCopy.dryRun.checking(failedNames) : model.dryRunLine.text}
          </LogStatus>
        </StageLogLine>
      );
    }
    // A retry that cannot help (the Space is passed over every time) is not offered at all.
    if (
      failure !== undefined &&
      (failure.outOfScope || (state.kind === 'failed' && !state.canRetry))
    ) {
      return (
        <StageLogLine testId={open.testId} tone='open' glyph='○' textId={textId}>
          <LogName>{label}</LogName>
          <LogStatus>
            {failure.outOfScope
              ? copy.retryCannotHelp
              : (model.dryRunLine.text ?? copy.retryCannotHelp)}
          </LogStatus>
        </StageLogLine>
      );
    }
    if (open.locked !== undefined || promoteMerge === undefined) {
      const why =
        open.locked === undefined
          ? model.dryRunLine.text
          : open.locked.why === 'noPermission'
            ? copy.cantPromoteInto(stage)
            : open.locked.why === 'held'
              ? copy.waitsForServer(stage)
              : null;
      return (
        <StageLogLine
          testId={open.testId}
          tone='locked'
          glyph='○'
          textId={textId}
          actions={
            <LockedButton
              label={open.verb === 'retry' ? copy.retry : copy.promote}
              testId='act-promote'
              describedBy={textId}
            />
          }
        >
          <LogName>{label}</LogName>
          {open.locked?.why === 'waits' ? (
            waitStatus(open.locked.waits, model)
          ) : why !== null ? (
            <LogStatus>{why}</LogStatus>
          ) : null}
        </StageLogLine>
      );
    }
    const unchecked = failure !== undefined && model.dryRunLine.mode === 'unavailable';
    const methods = promoteMerge.methods.filter((m) => m.method === 'p');
    const problems =
      state.kind === 'problem' || state.kind === 'restored'
        ? state.problems
        : state.kind === 'inProgress'
          ? model.problems
          : [];
    const anyway = (open.anyway && problems.length > 0) || unchecked;
    const retryLabel = unchecked ? stageCardCopy.merge.retryAnyway(false) : copy.retry;
    const asking = anyway && confirming && failure === undefined;
    const turn =
      open.verb === 'retry' || open.spaceCount === undefined || open.spaceCount === 0
        ? copy.yourTurn
        : copy.yourTurnSpaces(open.spaceCount);
    return (
      <StageLogLine
        testId={open.testId}
        tone='prompt'
        glyph='›'
        textId={textId}
        grid={
          <MergeButton
            stageId={model.stage.id}
            stageName={stage}
            {...promoteMerge}
            methods={methods.length > 0 ? methods : promoteMerge.methods}
            defaultMethod='p'
            layout='log'
            actTestId={anyway ? 'act-anyway' : 'act-promote'}
            onConfirmingChange={setConfirming}
            retry={open.verb === 'retry'}
            {...(anyway && !unchecked
              ? {
                  anyway: true,
                  ack: (
                    <Box component='span' sx={{ '& code': valuePillSx }}>
                      <CopyText parts={acknowledgementSegments(problems, model.nameOfSpace)} />
                    </Box>
                  ),
                }
              : unchecked
                ? { anyway: true }
                : {})}
            {...(failure !== undefined
              ? {
                  confirmNote:
                    promoteMerge.confirmNote ??
                    stageCardCopy.merge.retryWrites(failedNames, failure.spaceCount, false),
                }
              : {})}
            labels={
              open.verb === 'retry'
                ? {
                    main: retryLabel,
                    short: retryLabel,
                    confirm: stageCardCopy.merge.retryConfirm(false),
                  }
                : {
                    main: anyway ? copy.promoteAnyway : copy.promote,
                    short: anyway ? copy.promoteAnyway : copy.promote,
                    ...(anyway ? { confirm: copy.confirmAnyway } : {}),
                  }
            }
          />
        }
      >
        <LogName>{asking ? copy.promoteAnywayTo(stage) : label}</LogName>
        <LogStatus>
          {asking ? propagationHeadline(problems, model.spaceCount) : turn}
        </LogStatus>
        {/* A preview that could not reach every Space says so, calmly: the commonest topology must not alarm. */}
        {model.dryRunLine.fidelity === 'coverage-incomplete' &&
        model.dryRunLine.text !== null ? (
          <Box
            component='span'
            data-part='q'
            data-testid='stage-dry-run'
            data-fidelity='coverage-incomplete'
            sx={{
              display: 'block',
              typography: 'body2',
              fontSize: '12.5px',
              color: 'text.secondary',
              mt: '2px',
            }}
          >
            {model.dryRunLine.text}
          </Box>
        ) : null}
      </StageLogLine>
    );
  }

  // Release
  if (open.busy) {
    return (
      <StageLogLine testId={open.testId} tone='busy' glyph='…'>
        <LogName>{copy.releasing(stage)}</LogName>
      </StageLogLine>
    );
  }
  const releaseMerge =
    merge !== undefined && (state.kind === 'promoted' || open.retry) ? merge : undefined;
  const releaseFailure = open.retry && state.kind === 'failed' ? state.failure : undefined;
  if (open.locked !== undefined || releaseMerge === undefined) {
    const waits = open.locked?.waits ?? [];
    return (
      <StageLogLine
        testId={open.testId}
        tone='locked'
        glyph='○'
        textId={textId}
        actions={
          <LockedButton label={copy.release} testId='act-release' describedBy={textId} />
        }
      >
        <LogName>{copy.releaseTo(stage)}</LogName>
        {waits.length > 0 ? (
          waitStatus(waits, model, open.locked?.after === true)
        ) : state.kind === 'noPermission' ? (
          <LogStatus>{copy.cantPromoteInto(stage)}</LogStatus>
        ) : state.kind === 'serverHeld' ? (
          <LogStatus>{copy.waitsForServer(stage)}</LogStatus>
        ) : null}
      </StageLogLine>
    );
  }
  return (
    <StageLogLine
      testId={open.testId}
      tone='prompt'
      glyph='›'
      textId={textId}
      grid={
        <MergeButton
          stageId={model.stage.id}
          stageName={stage}
          {...releaseMerge}
          layout='log'
          actTestId='act-release'
          {...(releaseFailure === undefined
            ? { labels: { main: copy.release, short: copy.release } }
            : {
                // A retry does one thing: publish the Spaces that failed, again.
                methods: [
                  {
                    method: 'r',
                    label: stageCardCopy.merge.item.r.label,
                    description: stageCardCopy.merge.item.r.description(stage),
                    disabled: false,
                  },
                ],
                defaultMethod: 'r',
                retry: true,
                labels: {
                  main: stageCardCopy.merge.releaseAgain,
                  short: stageCardCopy.merge.releaseAgain,
                },
              })}
        />
      }
    >
      <LogName>
        {releaseFailure === undefined ? copy.releaseTo(stage) : copy.releaseAgainTo(stage)}
      </LogName>
      <LogStatus>{copy.yourTurn}</LogStatus>
      {releaseFailure !== undefined ? (
        <LogSub>
          {listText(
            releaseFailure.failedSpaces.map((f) =>
              f.spaceId === '' ? f.slug : model.nameOfSpace(f.spaceId),
            ),
          )}
        </LogSub>
      ) : open.targetCount > 0 ? (
        <LogInfo
          text={copy.targetsRunEarlier(open.targetCount)}
          label={copy.releaseInfoLabel}
          testId='release-info'
        />
      ) : null}
    </StageLogLine>
  );
}

const SKELETON_WIDTHS = ['38%', '26%', '32%'];

export function StageLog(props: StageLogProps) {
  const { view, model } = props;
  // "Review details" goes right under the review line: the open review line below Now, else the
  // last approval or rejection above it, else the end of the history. None while there is nothing to review.
  const detailsShown =
    model.review.summary !== undefined &&
    !view.loading &&
    !view.hideChangeCard &&
    view.history.every((l) => l.body.kind !== 'error' && l.body.kind !== 'source');
  // Under the open review line, the promotion's or the release's (H7).
  const reviewOpenIndex = view.open.findIndex((o) => o.kind === 'review');
  let historyDetailsAfter = -1;
  if (detailsShown && reviewOpenIndex < 0) {
    view.history.forEach((line, i) => {
      if (/^log-(release-)?(approval|rejected)/.test(line.testId))
        historyDetailsAfter = i;
    });
    if (historyDetailsAfter < 0) historyDetailsAfter = view.history.length - 1;
  }
  // The release review is not reached until the promote is done.
  const releaseNotReached = view.open.some((o) => o.kind === 'promote');
  const detailsRow = (
    <ReviewDetailsRow
      key='review-details-row'
      model={model}
      now={props.now}
      onNotice={props.onNotice}
      entryReview={props.entryReview}
      releaseReview={props.releaseReview}
      releaseNotReached={releaseNotReached}
    />
  );
  const hasOpen = view.loading || view.open.length > 0;
  const next = model.next;
  const goNext =
    next === null ? null : next.name === null ? (
      <>
        {copy.next}
        <StageLink stageId={COMPLETE_STAGE_ID} name={COMPLETE_STEP_LABEL} model={model} />
        {copy.nextEnd}
      </>
    ) : (
      <Link
        component={RouterLink}
        to={next.href}
        data-testid='next-link'
        sx={{ ...logLinkSx, color: 'text.primary', textDecorationColor: 'var(--t3)' }}
      >
        {copy.goTo(next.name)}
      </Link>
    );
  const lead =
    view.end === undefined
      ? null
      : view.end.kind === 'nothingLeft' || view.end.kind === 'next'
        ? copy.nothingLeft(model.stage.name)
        : view.end.kind === 'noTargets'
          ? copy.noTargets(model.stage.name)
          : copy.startsHere;
  const end =
    lead === null ? null : (
      <>
        {lead}
        {view.end?.kind !== 'nothingLeft' && goNext !== null ? <> {goNext}</> : null}
      </>
    );

  return (
    <Box data-testid='stage-status' data-stage-state={model.state.kind}>
      <Paper
        component='section'
        elevation={2}
        aria-label={copy.regionLabel(model.stage.name)}
        data-testid='stage-log'
        sx={{
          overflow: 'hidden',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--bd0)',
        }}
      >
        <Box
          component='ol'
          data-testid='log-history'
          sx={{ listStyle: 'none', m: 0, py: '6px', px: 0 }}
        >
          {view.history.flatMap((line, i) => [
              <StageLogLine
                key={line.testId}
                testId={line.testId}
                tone={line.tone}
                glyph={line.glyph}
                {...(line.at === undefined ? {} : { at: line.at })}
                {...(line.anchor === undefined ? {} : { anchor: line.anchor })}
                meta={<Meta line={line} />}
                {...(line.body.kind === 'error'
                  ? { actions: <TryAgain onClick={() => void model.recheck()} /> }
                  : {})}
              >
                <LineText
                  line={line}
                  model={model}
                  {...(model.dryRunStatus === undefined
                    ? {}
                    : { dryRunStatus: model.dryRunStatus })}
                />
              </StageLogLine>,
            ...(i === historyDetailsAfter ? [detailsRow] : []),
          ])}
        </Box>
        <Box
          data-testid='log-now'
          sx={{
            display: 'grid',
            gridTemplateColumns: '52px minmax(0, 1fr)',
            columnGap: '12px',
            alignItems: 'center',
            px: '18px',
            py: '8px',
            bgcolor: 'background.default',
            borderTop: '1px solid var(--bd0)',
            borderBottom: '1px solid var(--bd1)',
            font: '600 11.5px/1 var(--font-sans)',
            color: 'text.secondary',
            '@media (max-width: 759.98px)': {
              gridTemplateColumns: '44px minmax(0, 1fr)',
              px: '12px',
            },
          }}
        >
          <Box
            component='span'
            sx={{
              textAlign: 'right',
              font: '500 12px var(--font-mono)',
              color: 'text.primary',
            }}
          >
            {clockTime(props.now)}
          </Box>
          <span>{hasOpen ? copy.nowStill : copy.now}</span>
        </Box>
        {view.loading ? (
          <Box
            component='ol'
            data-testid='log-open'
            sx={{ listStyle: 'none', m: 0, py: '6px', px: 0 }}
          >
            {SKELETON_WIDTHS.map((width, i) => (
              <StageLogLine
                key={width}
                testId={`log-skeleton-${i + 1}`}
                tone='skeleton'
                glyph=''
                glyphNode={
                  <Skeleton
                    variant='circular'
                    animation={false}
                    sx={{ width: 12, height: 12, mx: 'auto', bgcolor: 'var(--bg-hover)' }}
                  />
                }
                meta={null}
              >
                <Skeleton
                  variant='rounded'
                  animation={false}
                  sx={{
                    display: 'block',
                    width,
                    height: 10,
                    borderRadius: 'var(--r-pill)',
                    bgcolor: 'var(--bg-hover)',
                  }}
                />
              </StageLogLine>
            ))}
          </Box>
        ) : view.open.length > 0 ? (
          <Box
            component='ol'
            data-testid='log-open'
            sx={{ listStyle: 'none', m: 0, py: '6px', px: 0 }}
          >
            {view.open.flatMap((open, i) => [
              <OpenLine key={open.testId} open={open} {...props} />,
              ...(detailsShown && i === reviewOpenIndex ? [detailsRow] : []),
            ])}
          </Box>
        ) : null}
        {end !== null ? (
          <Box
            data-testid='log-end'
            sx={{
              p: '10px 18px 14px 100px',
              font: '400 13px var(--font-sans)',
              color: 'text.secondary',
              '@media (max-width: 759.98px)': { pl: '12px' },
            }}
          >
            {end}
          </Box>
        ) : null}
      </Paper>
    </Box>
  );
}
