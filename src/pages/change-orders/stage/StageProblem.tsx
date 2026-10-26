// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The loud boxes: a change that reaches some Space differently, a stage a gate
 * holds, and a promotion or release that failed.
 *
 * A difference in how the change propagates is a big deal, so it gets the
 * loudest card on the page and the action becomes "…anyway", outlined rather than
 * filled, with a box to tick before the confirm will go. Each item names the
 * Space and links to the field, so the reader can check the difference before
 * writing it.
 */

import type { Ref } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { listText } from '../reviews/reviewCopy';
import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import { PROBLEM_ITEM_LIMIT, stageCardCopy, type NamedSpace } from './stageCardCopy';
import { acknowledgementText, problemItems, problemSegments, propagationHeadline } from './stagePropagation';
import { MergeButton, type MergeControl } from './MergeButton';
import { CopyText, DryRunCheck, DryRunLineView, StageStatusBox, StatusActions, StatusText, type StageLinks } from './StageBoxParts';
import type { ChangeOrderGate } from '../../x/apps/change-order/changeOrderTypes';
import type { DryRunLine, PropagationProblem, StageBoxLook, StageCardState, StageFailure } from './stageTypes';

const copy = stageCardCopy.problem;

const listSx = {
  listStyle: 'none',
  m: '8px 0 0',
  p: 0,
  display: 'grid',
  gap: '8px',
  maxWidth: '76ch',
  typography: 'body2',
  color: 'inherit',
} as const;

export interface ProblemListProps {
  problems: readonly PropagationProblem[];
  nameOfSpace: (spaceId: string) => string;
  nameOfUnit: (unitId: string) => string;
  links: StageLinks;
  limit?: number;
}

/** The problem items, worst first, at most `limit`; the rest are in the diff. */
export function ProblemList({ problems, nameOfSpace, nameOfUnit, links, limit = PROBLEM_ITEM_LIMIT }: ProblemListProps) {
  const { shown, more } = problemItems(problems, limit);
  const kinds = new Set(problems.map((p) => p.kind));
  const spaceOf = (spaceId: string): NamedSpace => ({ spaceId, name: nameOfSpace(spaceId) });
  return (
    <Box component="ul" sx={listSx} data-testid="stage-problem" data-problem-kind={kinds.size === 1 ? problems[0]?.kind : 'mixed'}>
      {shown.map((problem, i) => (
        <li key={i} data-problem={problem.kind}>
          <CopyText parts={problemSegments(problem, spaceOf, nameOfUnit)} links={links} />
        </li>
      ))}
      {more > 0 ? (
        <li>
          <CopyText parts={[{ kind: 'link', text: copy.andMore(more), ref: { to: 'diff' } }]} links={links} />
        </li>
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// A propagation problem
// ---------------------------------------------------------------------------

export interface StageProblemBoxProps {
  problems: readonly PropagationProblem[];
  /** The stage's Spaces, for "Can't tell what changes in {n} of {N} Spaces". */
  spaceCount: number;
  look: StageBoxLook;
  stage: { id: string; name: string };
  links: StageLinks;
  nameOfSpace: (spaceId: string) => string;
  nameOfUnit: (unitId: string) => string;
  dryRun: DryRunLine;
  /** The promote buttons; the box makes them "…anyway" and asks for the acknowledgement. */
  merge?: MergeControl;
  /** Runs the dry run again: offered beside the line when it failed or could not answer. */
  onCheckAgain?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function StageProblemBox({ problems, spaceCount, look, stage, links, nameOfSpace, nameOfUnit, dryRun, merge, onCheckAgain, headingRef }: StageProblemBoxProps) {
  return (
    <StageStatusBox look={look} headline={propagationHeadline(problems, spaceCount)} stateKind="problem" headingRef={headingRef}>
      <ProblemList problems={problems} nameOfSpace={nameOfSpace} nameOfUnit={nameOfUnit} links={links} />
      <DryRunCheck line={dryRun} onCheckAgain={onCheckAgain} />
      {merge !== undefined && merge.methods.length > 0 ? (
        <MergeButton stageId={stage.id} stageName={stage.name} {...merge} anyway ack={acknowledgementText(problems, nameOfSpace)} />
      ) : null}
    </StageStatusBox>
  );
}

// ---------------------------------------------------------------------------
// A stage held by a gate
// ---------------------------------------------------------------------------

export interface StageHeldBoxProps {
  state: Extract<StageCardState, { kind: 'gateFailed' | 'serverHeld' }>;
  look: StageBoxLook;
  stage: { id: string; name: string };
  links: StageLinks;
  nameOfSpace?: (spaceId: string) => string;
  /** When the gates were last read. */
  gateCheckedAt?: number;
  /** The Spaces a gate's server rows name, for "in [space]". */
  gateSpaces?: (gateId: string) => NamedSpace[];
  headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * Each gate's reason, and the Spaces its server rows name as links. The gate's
 * name leads when there is more than one, or when `named` asks for it.
 */
export function GateReasons({ gates, links, gateSpaces, named = false }: { gates: readonly ChangeOrderGate[]; links: StageLinks; gateSpaces?: (gateId: string) => NamedSpace[]; named?: boolean }) {
  const b = stageCardCopy.body;
  return (
    <>
      {gates.map((gate) => {
        const spaces = gateSpaces?.(gate.id) ?? [];
        return (
          <StatusText key={gate.id} testId="stage-gate-reason">
            {named || gates.length > 1 ? (
              <>
                <CopyText parts={[{ kind: 'code', text: gate.name }]} />
                {': '}
              </>
            ) : null}
            <CopyText parts={b.gateReasonIn(gate.reason, spaces)} links={links} />
          </StatusText>
        );
      })}
    </>
  );
}

/**
 * A gate that ran and failed on something that is there, or the server holding
 * the stage at its gates. No button: the stage cannot be promoted until the gate
 * passes, and the box says which gate and why instead of showing a disabled
 * control. Gates that only wait are listed after the failures, by name.
 */
export function StageHeldBox({ state, look, stage, links, nameOfSpace, gateCheckedAt, gateSpaces, headingRef }: StageHeldBoxProps) {
  const h = stageCardCopy.headline;
  const b = stageCardCopy.body;
  if (state.kind === 'serverHeld') {
    return (
      <StageStatusBox look={look} headline={h.serverHeld(stage.name)} stateKind={state.kind} headingRef={headingRef}>
        <StatusText held>{state.text}</StatusText>
        {state.failure !== undefined ? <FailureDetails failure={state.failure} links={links} nameOfSpace={nameOfSpace ?? ((id) => id)} second /> : null}
      </StageStatusBox>
    );
  }
  const only = state.gates.length === 1 ? state.gates[0] : undefined;
  return (
    <StageStatusBox
      look={look}
      headline={<CopyText parts={only !== undefined ? h.gateFailed(only.name) : h.gatesFailed(state.gates.length)} codeInherit />}
      stateKind={state.kind}
      headingRef={headingRef}
    >
      <GateReasons gates={state.gates} links={links} gateSpaces={gateSpaces} />
      {state.waiting.length > 0 ? <GateReasons gates={state.waiting} links={links} gateSpaces={gateSpaces} named /> : null}
      <StatusText>{b.gateWait(gateCheckedAt, state.gates.length + state.waiting.length)}</StatusText>
    </StageStatusBox>
  );
}

// ---------------------------------------------------------------------------
// A failed promotion or release
// ---------------------------------------------------------------------------

/** "Server message": the whole answer, closed until asked for. */
function ServerMessage({ message }: { message: string }) {
  if (message.trim() === '') return null;
  return (
    <Box
      component="details"
      sx={{
        mt: '8px',
        '& > summary': {
          listStyle: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          height: 26,
          p: '0 8px 0 10px',
          ml: '-10px',
          borderRadius: 'var(--r-sm)',
          fontSize: '11.5px',
          fontWeight: 600,
          color: 'text.secondary',
          '&::-webkit-details-marker': { display: 'none' },
          '&:hover': { bgcolor: 'var(--bg-hover)' },
          '& svg': { transition: 'transform .15s', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } },
        },
        '&[open] > summary svg': { transform: 'rotate(180deg)' },
      }}
    >
      <summary>
        {stageCardCopy.body.serverMessage}
        <ExpandMoreIcon aria-hidden sx={{ fontSize: 16 }} />
      </summary>
      <Box
        sx={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11.5px',
          lineHeight: 1.6,
          bgcolor: 'var(--bg)',
          border: '1px solid var(--bd1)',
          borderRadius: 'var(--r-sm)',
          p: '10px 16px',
          mt: '4px',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          color: 'text.primary',
        }}
      >
        {message}
      </Box>
    </Box>
  );
}

/**
 * Why retrying a passed-over Space cannot help: the last sentence of the
 * ChangeOrder copy for that shape, so the two surfaces say it the same way.
 */
function passedOverAdvice(): string {
  const sentences = changeOrderCopy.promotePassedOver('', '').split(/(?<=\.)\s+/);
  return sentences[sentences.length - 1] ?? '';
}

/**
 * What a failed promotion or release left: the other Spaces, one item per failed
 * Space (or "the dry run passes now"), and the server's whole message. Also the
 * second block of a box whose stage is now held, so the failure is not lost.
 */
export function FailureDetails({ failure, links, nameOfSpace, passes = false, second = false }: { failure: StageFailure; links: StageLinks; nameOfSpace: (spaceId: string) => string; passes?: boolean; second?: boolean }) {
  const b = stageCardCopy.body;
  const h = stageCardCopy.headline;
  const release = failure.action === 'release';
  const failed = failure.failedSpaces.length;
  // As a second block, under another state's headline, the failure names itself.
  const lead = !second ? undefined : release ? h.releaseFailed(failed, failure.spaceCount) : h.promoteFailed(failed, failure.spaceCount);
  const failedNames = listText(failure.failedSpaces.map((s) => (s.spaceId === '' ? s.slug : nameOfSpace(s.spaceId))));
  const rest = release ? b.releaseFailedRest(failure.landedCount) : b.failedRest(failure.landedCount, failure.spaceCount, failedNames);
  const items = failure.failedSpaces.flatMap((space) => {
    const named: NamedSpace = { spaceId: space.spaceId, name: space.spaceId === '' ? space.slug : nameOfSpace(space.spaceId) };
    const key = space.spaceId === '' ? space.slug : space.spaceId;
    if (passes && !release) return [<li key={key}><CopyText parts={copy.passesNow(named)} links={links} /></li>];
    if (space.items.length === 0) return [<li key={key}><CopyText parts={copy.failedItem(named, {}, '').slice(0, 1)} links={links} /></li>];
    return space.items.map((item, ii) => (
      <li key={`${key}-${ii}`}>
        <CopyText parts={copy.failedItem(named, { unitId: item.unitId, name: item.unitSlug }, item.message)} links={links} />
      </li>
    ));
  });
  return (
    <Box data-testid="change-order-foot-error" data-failure-source={failure.source} data-out-of-scope={failure.outOfScope ? 'true' : undefined} sx={lead === undefined ? undefined : { mt: '12px' }}>
      {lead !== undefined ? <StatusText sx={{ fontWeight: 600, color: 'text.primary' }}>{lead}</StatusText> : null}
      <StatusText>{rest}</StatusText>
      {items.length > 0 ? <Box component="ul" sx={listSx}>{items}</Box> : null}
      <ServerMessage message={failure.message} />
      {failure.outOfScope ? <StatusText testId="stage-passed-over">{passedOverAdvice()}</StatusText> : null}
    </Box>
  );
}

export interface StageFailureBoxProps {
  failure: StageFailure;
  /** The state's `canRetry`: the dry run says a retry can run now. */
  canRetry?: boolean;
  look: StageBoxLook;
  stage: { id: string; name: string };
  links: StageLinks;
  nameOfSpace: (spaceId: string) => string;
  /** The quiet dry run over the failed Spaces: it decides whether Retry is offered, and how. */
  dryRun: DryRunLine;
  onCheckAgain?: () => void;
  /** The retry (or "release again"); absent when retrying cannot help. */
  merge?: MergeControl;
  headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * A promotion that stopped part way, or a release that did not reach every Space.
 * Retry is never locked by a broken check: when the dry run cannot answer, the
 * retry is still there, outlined, as "…anyway".
 */
export function StageFailureBox({ failure, canRetry = true, look, stage, links, nameOfSpace, dryRun, onCheckAgain, merge, headingRef }: StageFailureBoxProps) {
  const h = stageCardCopy.headline;
  const m = stageCardCopy.merge;
  const release = failure.action === 'release';
  const failed = failure.failedSpaces.length;
  const headline = release ? h.releaseFailed(failed, failure.spaceCount) : h.promoteFailed(failed, failure.spaceCount);
  const failedNames = listText(failure.failedSpaces.map((s) => (s.spaceId === '' ? s.slug : nameOfSpace(s.spaceId))));
  const withRelease = merge?.methods.some((o) => o.method === 'pr' && !o.disabled) ?? false;
  const retryMethod = release ? 'r' : (merge?.defaultMethod ?? merge?.methods.find((o) => !o.disabled)?.method);
  const retryable = canRetry && !failure.outOfScope && merge !== undefined && merge.methods.length > 0;

  const button = (anyway: boolean, main: string) =>
    merge === undefined ? null : (
      <MergeButton
        stageId={stage.id}
        stageName={stage.name}
        {...merge}
        // A retry does one thing, so it is one button.
        methods={
          release
            ? [{ method: 'r', label: m.item.r.label, description: m.item.r.description(stage.name), disabled: false }]
            : merge.methods.filter((o) => o.method === retryMethod)
        }
        defaultMethod={retryMethod}
        anyway={anyway}
        retry
        labels={release ? { main: m.releaseAgain, short: m.releaseAgain } : { main, short: main, confirm: m.retryConfirm(withRelease) }}
        confirmNote={merge.confirmNote ?? (release ? undefined : m.retryWrites(failedNames, failure.spaceCount, withRelease))}
      />
    );

  // The dry run decides what a retry can do; a release failure needs none.
  let check = null;
  let action = null;
  if (release) {
    if (retryable) action = button(false, m.releaseAgain);
  } else if (!failure.outOfScope) {
    if (dryRun.mode === 'fails') {
      check = <DryRunLineView line={dryRun} />;
      if (onCheckAgain !== undefined) {
        action = (
          <StatusActions>
            <Button variant="outlined" color="inherit" onClick={onCheckAgain} data-testid="stage-check-again" sx={{ bgcolor: 'background.paper' }}>
              {m.checkAgain}
            </Button>
          </StatusActions>
        );
      }
    } else if (dryRun.mode === 'running') {
      check = <DryRunLineView line={{ mode: 'running', text: stageCardCopy.dryRun.checking(failedNames), icon: 'none' }} />;
    } else if (dryRun.mode === 'unavailable') {
      check = <DryRunLineView line={{ mode: 'unavailable', text: stageCardCopy.dryRun.didNotFinish, icon: 'warn' }} />;
      if (retryable) action = button(true, m.retryAnyway(withRelease));
    } else if (retryable && (dryRun.mode === 'done' || dryRun.mode === 'idle')) {
      action = button(false, m.retry(stage.name, withRelease));
    }
  }

  return (
    <StageStatusBox look={look} headline={headline} stateKind="failed" headingRef={headingRef}>
      <FailureDetails failure={failure} links={links} nameOfSpace={nameOfSpace} passes={dryRun.mode === 'done' && !release} />
      {check}
      {action}
    </StageStatusBox>
  );
}
