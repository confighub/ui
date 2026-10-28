// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The status box for every calm state: the one place the stage's state is said,
 * and where its one action sits. Reviews, held stages, propagation problems and
 * failures have boxes of their own (`StageReviewActions`, `StageProblem`); the
 * parts every box is built from are in `StageBoxParts`.
 *
 * Outcomes are announced through the page's live region, never from here.
 */

import type { ReactNode, Ref } from 'react';

import { MergeButton, type MergeControl } from './MergeButton';
import {
  CopyText,
  DryRunCheck,
  DryRunLineView,
  GoToNext,
  StageSourceLine,
  StageStatusBox,
  StatusActions,
  StatusText,
  type NextStep,
  type StageLinks,
} from './StageBoxParts';
import { FailureDetails, GateReasons, ProblemList } from './StageProblem';
import { stageCardCopy, type NamedSpace } from './stageCardCopy';
import { acknowledgementText, problemSpaceIds } from './stagePropagation';
import type { DryRunLine, StageBoxLook, StageByline, StageCardState } from './stageTypes';

export type { MergeControl } from './MergeButton';
export type { NextStep, StageLinks } from './StageBoxParts';

export interface StageStateBoxProps {
  state: StageCardState;
  look: StageBoxLook;
  stage: { id: string; name: string };
  next: NextStep | null;
  links: StageLinks;
  nameOfSpace: (spaceId: string) => string;
  bylines: { promoted?: StageByline; released?: StageByline };
  now: number;
  /** The quiet dry run's line (`dryRunLine`). */
  dryRun: DryRunLine;
  /** The release line on a promoted stage (`releaseLine`). */
  releaseText?: string;
  /** `stage.progress`, for "Promoted in {p} of {n} Spaces". */
  progress?: { promoted: number; total: number };
  merge?: MergeControl;
  /** Runs the dry run again: offered beside the line when it failed or could not answer. */
  onCheckAgain?: () => void;
  /** For a restored stage whose change reaches some Space differently. */
  nameOfUnit?: (unitId: string) => string;
  /** When the waiting gates were last read. */
  gateCheckedAt?: number;
  /** The Spaces a gate's server rows name, for "in [space]". */
  gateSpaces?: (gateId: string) => NamedSpace[];
  headingRef?: Ref<HTMLHeadingElement>;
}

function Byline({ byline, now }: { byline: StageByline | undefined; now: number }) {
  if (byline === undefined) return null;
  return <StatusText testId="stage-byline">{stageCardCopy.byline(byline.name, byline.isYou, byline.at, now)}</StatusText>;
}

/**
 * The box for every calm state: not a review, a held stage, a propagation
 * problem or a failure. Done states say so and offer nothing; a disabled button
 * would need a reason, and the box already is the reason.
 */
export function StageStateBox(props: StageStateBoxProps) {
  const { state, look, stage, next, links, bylines, now, dryRun, merge, headingRef } = props;
  const h = stageCardCopy.headline;
  const b = stageCardCopy.body;
  const box = (headline: ReactNode, body: ReactNode, glyph?: 'clock') => (
    <StageStatusBox look={look} headline={headline} stateKind={state.kind} headingRef={headingRef} glyph={glyph}>
      {body}
    </StageStatusBox>
  );
  const failure = (f: Parameters<typeof FailureDetails>[0]['failure'] | undefined) =>
    f === undefined ? null : <FailureDetails failure={f} links={links} nameOfSpace={props.nameOfSpace} second />;
  const button = merge !== undefined && merge.methods.length > 0 ? <MergeButton stageId={stage.id} stageName={stage.name} {...merge} /> : null;
  const goTo = next !== null ? <StatusActions><GoToNext next={next} /></StatusActions> : null;

  switch (state.kind) {
    case 'source':
    case 'invocationSource':
      return <StageSourceLine invocation={state.kind === 'invocationSource'} next={next} />;
    case 'aborted':
      return box(h.aborted, <StatusText>{state.reason}</StatusText>);
    case 'loading':
      // Said quietly: the stage's Spaces are still being read, and nothing else can be said yet.
      return box(h.loading, null);
    case 'noSpaces':
      return box(h.noSpaces, <StatusText>{b.noSpaces}</StatusText>);
    case 'gateWaiting': {
      // Not a failure: the gate has not passed YET. Calm, with a way to the stage it waits for.
      const prev = state.previousStage;
      return box(
        <CopyText parts={h.gateWaiting(state.waitFor, prev?.name, state.gates[0]?.name ?? '')} codeInherit />,
        <>
          <GateReasons gates={state.gates} links={links} gateSpaces={props.gateSpaces} />
          {props.gateCheckedAt !== undefined ? <StatusText>{b.gateWait(props.gateCheckedAt)}</StatusText> : null}
          {prev !== undefined && state.waitFor !== 'healthy' ? (
            <StatusActions>
              <GoToNext next={{ name: prev.name, href: links.resolvers.hrefForStage(prev.stageId) }} label={b.goToPrevious(prev.name)} testId="stage-go-previous" />
            </StatusActions>
          ) : null}
        </>,
        'clock',
      );
    }
    case 'working':
      return box(h.working(stage.name), null);
    case 'noPermission':
      return box(h.noPermission(stage.name), <><StatusText>{b.noPermission}</StatusText>{failure(state.failure)}</>);
    case 'dryRunRefused':
      return box(h.dryRunRefused, <><StatusText testId="stage-refusal">{state.reason}</StatusText>{failure(state.failure)}</>);
    case 'released': {
      const took = state.took;
      return box(
        h.released(stage.name),
        <>
          <Byline byline={bylines.released} now={now} />
          {took.length > 0 ? (
            <StatusText testId="stage-took">
              <CopyText parts={[{ kind: 'link', text: b.tookDifferent(problemSpaceIds(took).length), ref: { to: 'diff' } }]} links={links} />
            </StatusText>
          ) : null}
          {goTo}
        </>,
      );
    }
    case 'promotedNoTargets':
      return box(h.promotedNoTargets(stage.name), <><StatusText>{b.promotedNoTargets(stage.name)}</StatusText>{goTo}</>);
    case 'promoted': {
      const differs = state.took.filter((p) => p.kind === 'differs');
      return box(
        h.promoted,
        <>
          <Byline byline={bylines.promoted} now={now} />
          {props.releaseText !== undefined ? (
            <DryRunLineView line={{ mode: 'done', text: props.releaseText, icon: 'none' }}>
              {differs.map((p, i) =>
                p.kind === 'differs' ? (
                  <span key={i}>
                    {' '}
                    <CopyText parts={stageCardCopy.dryRun.releaseDiffers({ spaceId: p.spaceId, name: props.nameOfSpace(p.spaceId) }, p.path, p.from, p.to)} links={links} />
                  </span>
                ) : null,
              )}
            </DryRunLineView>
          ) : null}
          {button}
        </>,
      );
    }
    case 'restored':
    case 'inProgress':
    case 'progressUnknown': {
      const [headline, sentence] =
        state.kind === 'restored'
          ? [state.verdict === 'restored' ? h.restored : h.restoreReleased, b.restored(stage.name)]
          : state.kind === 'inProgress' && props.progress !== undefined
            ? [h.inProgress(props.progress.promoted, props.progress.total), b.inProgress]
            : [h.progressUnknown, b.progressUnknown];
      // A restored stage whose change reaches some Space differently says so, and asks for the same acknowledgement.
      const problems = state.kind === 'restored' ? state.problems : [];
      return box(
        headline,
        <>
          <StatusText>{sentence}</StatusText>
          {problems.length > 0 ? (
            <ProblemList problems={problems} nameOfSpace={props.nameOfSpace} nameOfUnit={props.nameOfUnit ?? ((id) => id)} links={links} />
          ) : null}
          <DryRunCheck line={dryRun} onCheckAgain={props.onCheckAgain} />
          {merge !== undefined && merge.methods.length > 0 ? (
            <MergeButton
              stageId={stage.id}
              stageName={stage.name}
              {...merge}
              {...(problems.length > 0 ? { anyway: true, ack: acknowledgementText(problems, props.nameOfSpace) } : {})}
            />
          ) : null}
        </>,
      );
    }
    case 'ready':
      return box(
        state.approvedByYou ? h.readyAfterApproval : h.ready,
        <>
          <DryRunCheck line={dryRun} onCheckAgain={props.onCheckAgain} />
          {button}
        </>,
      );
    default:
      // Review states, held stages, problems and failures have boxes of their own.
      return null;
  }
}
