// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Stage log: what already happened in a stage, in the order it happened,
 * above a Now bar, and what still has to happen below it.
 *
 * Every line is read from what the page already has: the stage's card state,
 * its prerequisites and their server verdicts, the review it hosts, and the
 * ChangeOrder's records (`history.entries`). Nothing is counted again here that
 * the server counts; the counts come in with the input.
 *
 * Time order: each history line sorts by its time. A prerequisite line carries
 * the time the page last read the prerequisites (`gateCheckedAt`), the one time
 * the server allows for it. An abort, a restore and missing progress have no time
 * in the API, so they sort last with an empty time gutter. The arrival is first.
 *
 * Pure: no React and no MUI (see `stageTypes.ts`).
 */
import { stageReleaseSpaceIds } from '../../x/apps/change-order/changeOrdersConsoleModel';
import type { NamedSpace } from './stageCardCopy';
import type { PropagationProblem, StageCardState, StageFailure } from './stageTypes';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** One prerequisite of the stage, as its line shows it. */
export interface StageLogGate {
  id: string;
  name: string;
  /** Evaluated and satisfied. */
  passed: boolean;
  /** The server evaluated it (a false verdict on something that is there). */
  evaluated: boolean;
  /**
   * It has not passed YET: the stage before has not taken or released the change,
   * or its health has not reported. Not a failure, so never the red band.
   */
  waiting: boolean;
  /** It waits only on the stage before taking or releasing the change (H2): Promote then waits for that stage. */
  onStageBefore?: boolean;
  /** What the workflow says it needs, in its author's words. */
  description?: string;
  /** Why it holds, in the server's or the CLI's words: said when there is no description. */
  reason?: string;
  /** The Spaces the server named for a failure. */
  failedIn: readonly NamedSpace[];
}

/** A person as a line names them. */
export interface StageLogPerson {
  name: string;
  isYou: boolean;
}

/**
 * The amber line's problems. While a review, a prerequisite or the server holds
 * the stage, the server plans nothing, so "can't tell" about the Spaces it did
 * not plan would only repeat the line that says why. A stage promoted, released or
 * restored has nothing left to plan either: the dry run passes those Spaces over,
 * which says nothing about what they took.
 */
export function warnProblemsOf(
  state: StageCardState,
  dryRunHeld: boolean,
  problems: readonly PropagationProblem[] = [],
) {
  const review =
    state.kind === 'reviewNeeded' ||
    state.kind === 'reviewWaiting' ||
    state.kind === 'reviewRejected' ||
    state.kind === 'reviewApproved';
  const all =
    state.kind === 'problem' || state.kind === 'restored' || review
      ? state.problems
      : state.kind === 'promoted' || state.kind === 'released'
        ? state.took
        : state.kind === 'inProgress'
          ? problems
          : [];
  const nothingToPlan =
    state.kind === 'promoted' || state.kind === 'released' || state.kind === 'restored';
  const holds =
    dryRunHeld ||
    review ||
    nothingToPlan ||
    state.kind === 'gateFailed' ||
    state.kind === 'serverHeld';
  return holds ? all.filter((p) => !(p.kind === 'unknown' && p.cause === 'unplanned')) : all;
}

/**
 * How many Targets ran the stage's release: of the stage's Spaces a release publishes (those with
 * a release Target, less the one the promotion passes over), those the ChangeOrder reports
 * released. One Release in the stage is not all of them. `undefined` without progress from the
 * server: there is nothing to count, and the line keeps the Target count.
 */
export function releaseRanCount(
  stageSpaceIds: readonly string[],
  skippedSpaceId: string | undefined,
  releaseTargetOf: (spaceId: string) => string | undefined,
  progress: { availability: string; releasedSpaceIds: ReadonlySet<string> },
): number | undefined {
  if (progress.availability !== 'available') return undefined;
  return stageReleaseSpaceIds(stageSpaceIds, skippedSpaceId, releaseTargetOf).filter((id) =>
    progress.releasedSpaceIds.has(id),
  ).length;
}

/** A gate line's second line: its author's description first; the server's reason only when there is none. */
export function gateDetail(gate: Pick<StageLogGate, 'description' | 'reason'>): string | undefined {
  return gate.description ?? gate.reason;
}

/** A person as a line names them: "you" for the viewer, else their display name. */
export function personName(person: StageLogPerson, you = 'you'): string {
  return person.isYou ? you : person.name;
}

export interface StageLogApproval {
  /** Epoch ms. */
  at?: number;
  person: StageLogPerson;
  note?: string;
  /** The requirement's name, for a release review ("· release-ok"). */
  requirement?: string;
}

export interface StageLogInput {
  state: StageCardState;
  stage: { id: string; name: string };
  previousStage?: { stageId: string; name: string };
  /** The Space a source stage was made in. */
  sourceSpace?: NamedSpace;
  /** When the change arrived, and who promoted it into the stage before. */
  arrival?: { at: number; person?: StageLogPerson };
  /** The Spaces the stage's actions write into. */
  spaceCount: number;
  /** The release line's count, as the server's release read gives it. */
  targetCount: number;
  stageHasTargets: boolean;
  gates: readonly StageLogGate[];
  /** The prerequisite read itself was refused (403): no prerequisite was checked. */
  gatesUnread: boolean;
  gateCheckedAt?: number;
  approvals: readonly StageLogApproval[];
  /** Approvals the hosted review needs in all; "· 1 of 2" only when more than one. */
  approvalsRequired: number;
  /** The release review's approvals, written in once given. */
  releaseApprovals: readonly StageLogApproval[];
  /** The release prerequisites still open, by name (`release-ok`). */
  releaseReviewOpen: readonly string[];
  promoted?: { at: number; person: StageLogPerson };
  /**
   * The newest Release in the stage, and how many of its Targets ran it: the stage's Spaces with a
   * Target that the ChangeOrder reports released. Without the count, every Target is taken to have.
   */
  released?: { at: number; person: StageLogPerson; ranCount?: number };
  /** A failed promotion that a later promotion fixed: kept, quiet. */
  fixedFailure?: StageFailure;
  /** Who made the action that failed (the failure record's UserID). */
  failurePerson?: StageLogPerson;
  /** The quiet dry run could not answer (5xx). */
  dryRunUnavailable: boolean;
  /** The quiet dry run is in flight and has not answered for this state yet. */
  dryRunRunning: boolean;
  /** This card is writing its action. */
  busy: { method: 'promote' | 'release' } | null;
  /**
   * How the change reaches each Space differently, for the amber line. Without
   * Spaces the server refused to plan while it holds the stage: the red line
   * already says why, and "can't tell" would only repeat it.
   */
  problems: readonly PropagationProblem[];
  /** Epoch ms of the page's clock, for a line that happens now (the error). */
  now?: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** How a line is drawn. `bad` is the full-width red band; `badQuiet` a failure a retry fixed. */
export type StageLogTone =
  | 'arrive'
  | 'ok'
  /** Done and quiet: a passed prerequisite, an approval. */
  | 'okDone'
  | 'done'
  | 'bad'
  | 'badQuiet'
  | 'warn'
  | 'restore'
  | 'aborted'
  | 'unknown'
  | 'unread'
  | 'open'
  | 'locked'
  | 'prompt'
  | 'busy'
  /** A quiet row that belongs to the line above it: "Review details". */
  | 'detail'
  /** A line still being read: a grey dot and a bar, centred. */
  | 'skeleton';

export type StageLogGlyph =
  | '+'
  | '✓'
  | '✕'
  | '▲'
  | '○'
  | '›'
  | '…'
  | '↺'
  | '■'
  | '?'
  | '–'
  | '⋯'
  | '↗'
  | '';

export type StageLogMeta =
  | { kind: 'auto' }
  | { kind: 'person'; person: StageLogPerson }
  | { kind: 'none' };

/**
 * The release requirements that hold Release, by name. Fail closed: after the
 * promote, a requirement holds Release until the server says otherwise, so a
 * release check that has not answered yet (`notReached`) or could not be read
 * (`error`) keeps Release locked. Only a satisfied requirement, nothing new to
 * release (`unchanged`), or a check the viewer may not run (`noPermission`, the
 * server decides on submit) lets it go. Before the promote every unmet one is
 * named as what Release will wait for.
 */
export function releaseReviewHolds(
  requirements: readonly { name: string; satisfied: boolean; evaluated: boolean; notEvaluated?: string }[],
  promoted: boolean,
): string[] {
  return requirements
    .filter((r) => {
      if (r.satisfied) return false;
      if (!promoted || r.evaluated) return true;
      return r.notEvaluated !== 'unchanged' && r.notEvaluated !== 'noPermission';
    })
    .map((r) => r.name);
}

/** What a history line says. The component words it (`stageLogCopy`). */
export type StageLogBody =
  | { kind: 'arrival'; from?: { stageId: string; name: string }; spaceCount?: number }
  | { kind: 'source'; space?: NamedSpace; invocation: boolean }
  | { kind: 'gate'; gate: StageLogGate }
  | { kind: 'gateUnread'; gate: StageLogGate }
  | { kind: 'gateWaiting'; gate: StageLogGate }
  | { kind: 'approval'; approval: StageLogApproval; index: number; required: number }
  | { kind: 'rejected' }
  | { kind: 'promoteFailed'; failure: StageFailure }
  | { kind: 'promoted'; spaceCount: number }
  | { kind: 'released'; targetCount: number; ranCount: number }
  | { kind: 'restored' }
  | { kind: 'restoreReleased'; targetCount: number }
  | { kind: 'aborted'; reason: string }
  | { kind: 'unknown' }
  | { kind: 'held'; text: string }
  | { kind: 'warn'; problems: readonly PropagationProblem[] }
  | { kind: 'error' }
  | { kind: 'empty' };

export interface StageLogLine {
  /** The line's `data-testid`, the design's id. */
  testId: string;
  /** Epoch ms; absent for a line the API gives no time. */
  at?: number;
  tone: StageLogTone;
  glyph: StageLogGlyph;
  body: StageLogBody;
  meta: StageLogMeta;
  /** The DOM id the red or amber pill scrolls to. */
  anchor?: string;
}

/** What a line below Now is waiting for. */
export type StageLogWait =
  | { kind: 'gate'; name: string }
  | { kind: 'review' }
  | { kind: 'promote' }
  | { kind: 'releaseReview'; name: string }
  /** The stage before has not taken (or released) the change yet. Its name links to it. */
  | { kind: 'stage'; stageId: string; name: string };

export type StageLogOpen =
  /** The review the card hosts: the review box draws it, in its compact form. */
  | { kind: 'review'; testId: 'open-review' | 'open-release-review' }
  /** A prerequisite that only waits: it has not happened yet, so it sits below Now, above the promote it holds (H4). */
  | { kind: 'line'; testId: string; line: StageLogLine }
  | {
      kind: 'promote';
      testId: 'open-promote';
      /** `retry`: after a failed promotion. */
      verb: 'promote' | 'retry';
      /** Writes this many Spaces; absent when progress is unknown. */
      spaceCount?: number;
      locked?:
        | { why: 'waits'; waits: readonly StageLogWait[] }
        | { why: 'noPermission' }
        | { why: 'held' };
      busy: boolean;
      /** The change reaches some Space differently: "Promote anyway…". */
      anyway: boolean;
    }
  | {
      kind: 'release';
      testId: 'open-release';
      targetCount: number;
      locked?: { after: boolean; waits: readonly StageLogWait[] };
      busy: boolean;
      /** A release that failed in some Space: "Release again" publishes those Spaces only. */
      retry: boolean;
    };

/** The line under the log, after Now. */
export type StageLogEnd =
  | { kind: 'next' }
  | { kind: 'nothingLeft' }
  | { kind: 'noTargets' }
  | { kind: 'source' };

export interface StageLogView {
  history: StageLogLine[];
  open: StageLogOpen[];
  /** Skeleton lines below Now while the stage is read. */
  loading: boolean;
  end?: StageLogEnd;
  /** The change card has nothing to show: the stage selects no Space. */
  hideChangeCard: boolean;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const REVIEW_KINDS = new Set([
  'reviewNeeded',
  'reviewWaiting',
  'reviewApproved',
  'reviewRejected',
]);

function isReviewKind(
  state: StageCardState,
): state is Extract<
  StageCardState,
  { kind: 'reviewNeeded' | 'reviewWaiting' | 'reviewApproved' | 'reviewRejected' }
> {
  return REVIEW_KINDS.has(state.kind);
}

/** The failure the stage shows now: its own, or one a held or refused stage carries as a second block. */
function failureOf(state: StageCardState): StageFailure | undefined {
  if (state.kind === 'failed') return state.failure;
  if (
    state.kind === 'serverHeld' ||
    state.kind === 'noPermission' ||
    state.kind === 'dryRunRefused'
  )
    return state.failure;
  return undefined;
}

function arrivalLine(input: StageLogInput, progressUnknown: boolean): StageLogLine {
  const { state, arrival } = input;
  const meta: StageLogMeta =
    arrival?.person === undefined
      ? { kind: 'none' }
      : { kind: 'person', person: arrival.person };
  if (state.kind === 'source' || state.kind === 'invocationSource') {
    return {
      testId: 'log-arrival',
      ...(arrival === undefined ? {} : { at: arrival.at }),
      tone: 'arrive',
      glyph: '+',
      body: {
        kind: 'source',
        ...(input.sourceSpace === undefined ? {} : { space: input.sourceSpace }),
        invocation: state.kind === 'invocationSource',
      },
      meta,
    };
  }
  return {
    testId: 'log-arrival',
    ...(arrival === undefined ? {} : { at: arrival.at }),
    tone: 'arrive',
    glyph: '+',
    body: {
      kind: 'arrival',
      ...(input.previousStage === undefined ? {} : { from: input.previousStage }),
      ...(progressUnknown || input.spaceCount === 0 ? {} : { spaceCount: input.spaceCount }),
    },
    meta,
  };
}

function gateLines(input: StageLogInput): StageLogLine[] {
  const at = input.gateCheckedAt;
  return input.gates.map((gate, i) => {
    const testId = `log-gate-${i + 1}`;
    if (input.gatesUnread || !gate.evaluated) {
      return {
        testId,
        tone: 'unread',
        glyph: '–',
        body: { kind: 'gateUnread', gate },
        meta: { kind: 'none' },
      };
    }
    // Not happened yet: no time and nobody did it (H2).
    if (gate.waiting && !gate.passed)
      return {
        testId,
        tone: 'open',
        glyph: '○',
        body: { kind: 'gateWaiting', gate },
        meta: { kind: 'none' },
      };
    if (gate.passed) {
      return {
        testId,
        ...(at === undefined ? {} : { at }),
        tone: 'okDone',
        glyph: '✓',
        body: { kind: 'gate', gate },
        meta: { kind: 'auto' },
      };
    }
    return {
      testId,
      ...(at === undefined ? {} : { at }),
      tone: 'bad',
      glyph: '✕',
      body: { kind: 'gate', gate },
      meta: { kind: 'auto' },
      anchor: `stage-log-fail-${gate.id}`,
    };
  });
}

/** Lines with a time first, in time order; lines without one after, in the order given. */
function byTime(lines: StageLogLine[]): StageLogLine[] {
  const timed = lines.filter((l) => l.at !== undefined);
  const untimed = lines.filter((l) => l.at === undefined);
  return [
    ...timed
      .map((l, i) => ({ l, i }))
      .sort((a, b) => (a.l.at ?? 0) - (b.l.at ?? 0) || a.i - b.i)
      .map(({ l }) => l),
    ...untimed,
  ];
}

/**
 * The stage's log. The first state of `deriveStageCardState` decides the open
 * lines; the history is whatever the records say happened, whichever state wins.
 */
export function deriveStageLog(input: StageLogInput): StageLogView {
  const { state } = input;
  const progressUnknown = state.kind === 'progressUnknown';
  const arrival = arrivalLine(input, progressUnknown);
  const empty: Omit<StageLogView, 'history'> = {
    open: [],
    loading: false,
    hideChangeCard: false,
  };

  if (state.kind === 'source' || state.kind === 'invocationSource') {
    return { ...empty, history: [arrival], end: { kind: 'source' } };
  }
  if (
    state.kind === 'loading' ||
    (input.dryRunRunning && !input.dryRunUnavailable && input.busy === null)
  ) {
    return { ...empty, history: [arrival], loading: true };
  }
  if (state.kind === 'noSpaces') {
    return {
      ...empty,
      history: [
        arrival,
        {
          testId: 'log-empty',
          ...(arrival.at === undefined ? {} : { at: arrival.at }),
          tone: 'done',
          glyph: '○',
          body: { kind: 'empty' },
          meta: { kind: 'none' },
        },
      ],
      hideChangeCard: true,
    };
  }
  if (input.dryRunUnavailable && state.kind !== 'failed') {
    return {
      ...empty,
      history: [
        arrival,
        {
          testId: 'log-error',
          ...(input.now === undefined ? {} : { at: input.now }),
          tone: 'bad',
          glyph: '✕',
          body: { kind: 'error' },
          meta: { kind: 'none' },
          anchor: 'stage-log-error',
        },
      ],
    };
  }

  // ── What happened ─────────────────────────────────────────────────────────
  const lines: StageLogLine[] = [];
  const gateAt = input.gateCheckedAt;
  const warnProblems = input.problems;
  if (warnProblems.length > 0) {
    lines.push({
      testId: 'log-warn',
      ...(gateAt === undefined ? {} : { at: gateAt }),
      tone: 'warn',
      glyph: '▲',
      body: { kind: 'warn', problems: warnProblems },
      meta: { kind: 'auto' },
      anchor: 'stage-log-warn',
    });
  }
  const prerequisites = gateLines(input);
  // A prerequisite that only waits has not happened: it goes below Now, with what still has to happen (H4).
  const waitingLines = prerequisites.filter((l) => l.body.kind === 'gateWaiting');
  lines.push(...prerequisites.filter((l) => l.body.kind !== 'gateWaiting'));
  if (state.kind === 'serverHeld' || state.kind === 'dryRunRefused') {
    lines.push({
      testId: 'log-held',
      ...(gateAt === undefined ? {} : { at: gateAt }),
      tone: 'bad',
      glyph: '✕',
      body: { kind: 'held', text: state.kind === 'serverHeld' ? state.text : state.reason },
      meta: { kind: 'auto' },
      anchor: 'stage-log-held',
    });
  }
  const required = input.approvalsRequired;
  input.approvals.forEach((approval, i) => {
    lines.push({
      testId: `log-approval-${i + 1}`,
      ...(approval.at === undefined ? {} : { at: approval.at }),
      tone: 'okDone',
      glyph: '✓',
      body: { kind: 'approval', approval, index: i + 1, required },
      meta: { kind: 'none' },
    });
  });
  input.releaseApprovals.forEach((approval, i) => {
    lines.push({
      testId: `log-release-approval-${i + 1}`,
      ...(approval.at === undefined ? {} : { at: approval.at }),
      tone: 'okDone',
      glyph: '✓',
      body: { kind: 'approval', approval, index: i + 1, required: 1 },
      meta: { kind: 'none' },
    });
  });
  if (state.kind === 'reviewRejected') {
    const at =
      state.rejection?.createdAt === undefined
        ? undefined
        : Date.parse(state.rejection.createdAt);
    lines.push({
      testId: 'log-rejected',
      ...(at === undefined || Number.isNaN(at) ? {} : { at }),
      tone: 'bad',
      glyph: '✕',
      body: { kind: 'rejected' },
      meta: { kind: 'none' },
      anchor: 'stage-log-rejected',
    });
  }
  const failure = failureOf(state) ?? input.fixedFailure;
  if (failure !== undefined) {
    lines.push({
      testId: 'log-promote-failed',
      ...(failure.at === undefined ? {} : { at: failure.at }),
      tone: failureOf(state) === undefined ? 'badQuiet' : 'bad',
      glyph: '✕',
      body: { kind: 'promoteFailed', failure },
      meta:
        input.failurePerson === undefined
          ? { kind: 'none' }
          : { kind: 'person', person: input.failurePerson },
      anchor: 'stage-log-promote-failed',
    });
  }
  if (input.promoted !== undefined) {
    lines.push({
      testId: 'log-promoted',
      at: input.promoted.at,
      tone: 'ok',
      glyph: '✓',
      body: { kind: 'promoted', spaceCount: input.spaceCount },
      meta: { kind: 'person', person: input.promoted.person },
    });
  }
  /*
   * A release records its Releases Space by Space, so the first one is there while the rest still
   * run: the line waits for the release to finish. A release that no Target ran is not one that
   * happened; the failure line says so instead.
   */
  const ranCount = input.released?.ranCount ?? input.targetCount;
  if (
    input.released !== undefined &&
    input.busy?.method !== 'release' &&
    (ranCount > 0 || input.targetCount === 0)
  ) {
    lines.push({
      testId: 'log-released',
      at: input.released.at,
      tone: 'ok',
      glyph: '✓',
      body: { kind: 'released', targetCount: input.targetCount, ranCount },
      meta: { kind: 'person', person: input.released.person },
    });
  }
  // No time and no person in the API: these sort last, with an empty gutter. The abort comes first:
  // the server restores only an aborted ChangeOrder.
  const abortedReason =
    state.kind === 'aborted' ? state.reason : state.kind === 'restored' ? state.abortedReason : undefined;
  if (abortedReason !== undefined) {
    lines.push({
      testId: 'log-aborted',
      tone: 'aborted',
      glyph: '■',
      body: { kind: 'aborted', reason: abortedReason },
      meta: { kind: 'none' },
    });
  }
  if (state.kind === 'restored') {
    lines.push({
      testId: 'log-restored',
      tone: 'restore',
      glyph: '↺',
      body: { kind: 'restored' },
      meta: { kind: 'none' },
    });
    if (state.verdict === 'restore-released') {
      lines.push({
        testId: 'log-restore-released',
        tone: 'restore',
        glyph: '✓',
        body: { kind: 'restoreReleased', targetCount: input.targetCount },
        meta: { kind: 'none' },
      });
    }
  }
  if (progressUnknown) {
    lines.push({
      testId: 'log-unknown',
      tone: 'unknown',
      glyph: '?',
      body: { kind: 'unknown' },
      meta: { kind: 'none' },
    });
  }
  const history = [arrival, ...byTime(lines)];

  // ── Done: nothing below Now ───────────────────────────────────────────────
  if (state.kind === 'aborted') return { ...empty, history };
  if (state.kind === 'restored' && state.verdict === 'restore-released')
    return { ...empty, history, end: { kind: 'nothingLeft' } };
  // The server refuses to promote a restored ChangeOrder: a restore needs an abort, and an aborted one is not promoted again.
  if (state.kind === 'restored') return { ...empty, history };
  if (state.kind === 'released') return { ...empty, history, end: { kind: 'next' } };
  if (state.kind === 'promotedNoTargets')
    return { ...empty, history, end: { kind: 'noTargets' } };

  // ── What still has to happen ──────────────────────────────────────────────
  const open: StageLogOpen[] = [];
  const reviewAction = isReviewKind(state) ? state.action : undefined;
  const reviewOpen = isReviewKind(state) && state.kind !== 'reviewApproved';
  const releaseFailed = state.kind === 'failed' && state.failure.action === 'release';
  const promotedHere =
    input.promoted !== undefined &&
    (state.kind !== 'failed' || releaseFailed);

  if (reviewOpen && reviewAction === 'promote')
    open.push({ kind: 'review', testId: 'open-review' });

  if (!promotedHere) {
    const failedGates = input.gatesUnread
      ? []
      : input.gates.filter((g) => g.evaluated && !g.passed && !g.waiting);
    const waits: StageLogWait[] = [
      ...failedGates.map((g): StageLogWait => ({ kind: 'gate', name: g.name })),
      // The stage before has not taken or released the change (the built-in `promoted` gate is not a log line, so the state says it).
      ...(state.kind === 'gateWaiting' &&
      state.waitFor !== 'healthy' &&
      input.previousStage !== undefined
        ? [{ kind: 'stage', stageId: input.previousStage.stageId, name: input.previousStage.name } as const]
        : []),
      // A gate that waits on the stage before taking or releasing the change makes Promote wait for that stage (H2).
      ...input.gates
        .filter((g) => g.waiting && !g.passed)
        .map(
          (g): StageLogWait =>
            g.onStageBefore === true && input.previousStage !== undefined
              ? { kind: 'stage', stageId: input.previousStage.stageId, name: input.previousStage.name }
              : { kind: 'gate', name: g.name },
        ),
      ...(reviewOpen && reviewAction === 'promote' ? [{ kind: 'review' } as const] : []),
    ];
    const unique = waits.filter(
      (w, i) =>
        w.kind === 'review' ||
        waits.findIndex(
          (o) => o.kind === w.kind && 'name' in o && 'name' in w && o.name === w.name,
        ) === i,
    );
    const locked =
      state.kind === 'noPermission'
        ? ({ why: 'noPermission' } as const)
        : state.kind === 'serverHeld' || state.kind === 'dryRunRefused'
          ? ({ why: 'held' } as const)
          : unique.length > 0
            ? ({ why: 'waits', waits: unique } as const)
            : undefined;
    for (const line of waitingLines) open.push({ kind: 'line', testId: line.testId, line });
    open.push({
      kind: 'promote',
      testId: 'open-promote',
      verb: state.kind === 'failed' ? 'retry' : 'promote',
      ...(progressUnknown ? {} : { spaceCount: input.spaceCount }),
      ...(locked === undefined ? {} : { locked }),
      busy: input.busy?.method === 'promote' || state.kind === 'working',
      anyway: state.kind === 'problem' || (state.kind === 'inProgress' && input.problems.length > 0),
    });
  }

  if (reviewOpen && reviewAction === 'release')
    open.push({ kind: 'review', testId: 'open-release-review' });

  if (input.stageHasTargets) {
    const releaseWaits: StageLogWait[] = [
      ...(promotedHere ? [] : [{ kind: 'promote' } as const]),
      ...input.releaseReviewOpen.map(
        (name): StageLogWait => ({ kind: 'releaseReview', name }),
      ),
    ];
    const blocked = state.kind === 'noPermission' || state.kind === 'serverHeld';
    open.push({
      kind: 'release',
      testId: 'open-release',
      targetCount: input.targetCount,
      ...(releaseWaits.length > 0 ||
      blocked ||
      (releaseFailed && state.kind === 'failed' && !state.canRetry)
        ? { locked: { after: !promotedHere, waits: releaseWaits } }
        : {}),
      busy: input.busy?.method === 'release',
      retry: releaseFailed,
    });
  }
  return { ...empty, history, open };
}

// ---------------------------------------------------------------------------
// The pill
// ---------------------------------------------------------------------------

export type StageLogPillTone = 'neutral' | 'success' | 'warning' | 'error';

export interface StageLogPillView {
  tone: StageLogPillTone;
  label: string;
  /** The DOM id of the red or amber line the pill scrolls to. */
  target?: string;
}

export interface StageLogPillInput {
  view: StageLogView;
  state: StageCardState;
  stageName: string;
  /** The warning line's title, when the stage has one. */
  warningTitle?: string;
  /** The rejecter, as the pill names them. */
  rejecterName?: string;
  /** Who can still approve, for "Waiting on {names}". */
  waitingOn: readonly string[];
  /** A review prompt is addressed to the viewer. */
  viewerPrompted: boolean;
  busy: boolean;
}

function orList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/**
 * The one status pill, in this order: loading, done and quiet states, then a
 * red failure, then a write in flight, then an amber warning, then "Your turn",
 * else what the stage waits on.
 */
export function stageLogPill(input: StageLogPillInput): StageLogPillView {
  const { view, state, stageName } = input;
  if (view.loading) return { tone: 'neutral', label: 'Checking…' };
  const errorLine = view.history.find((l) => l.body.kind === 'error');
  if (errorLine !== undefined)
    return { tone: 'error', label: `Can't check ${stageName}`, target: errorLine.anchor };
  if (state.kind === 'noSpaces') return { tone: 'neutral', label: 'Nothing to promote' };
  if (state.kind === 'source') return { tone: 'neutral', label: 'Made here' };
  if (state.kind === 'invocationSource') return { tone: 'neutral', label: 'Defined here' };
  if (state.kind === 'aborted') return { tone: 'neutral', label: 'Aborted' };
  if (state.kind === 'restored' && state.verdict === 'restore-released')
    return { tone: 'neutral', label: 'Restored and released' };
  if (state.kind === 'released') return { tone: 'success', label: `Released to ${stageName}` };
  if (state.kind === 'promotedNoTargets')
    return { tone: 'success', label: `Promoted to ${stageName}` };

  const bad = view.history.filter((l) => l.tone === 'bad');
  if (bad.length > 0) {
    const gates = bad.filter((l) => l.body.kind === 'gate');
    if (gates.length > 1) {
      const rest = bad.length - gates.length;
      return {
        tone: 'error',
        label: `${gates.length} gates failed${rest > 0 ? ` · +${rest}` : ''}`,
        target: gates[0]?.anchor,
      };
    }
    const last = bad[bad.length - 1];
    const body = last?.body;
    const label =
      body?.kind === 'rejected'
        ? `Rejected by ${input.rejecterName ?? 'someone'}`
        : body?.kind === 'promoteFailed'
          ? body.failure.action === 'release'
            ? 'Release failed'
            : 'Promote failed'
          : body?.kind === 'held'
            ? `${stageName} is held`
            : body?.kind === 'gate'
              ? `${body.gate.name} failed`
              : `Can't check ${stageName}`;
    return {
      tone: 'error',
      label: `${label}${bad.length > 1 ? ` · +${bad.length - 1}` : ''}`,
      target: last?.anchor,
    };
  }
  if (input.busy || state.kind === 'working') return { tone: 'neutral', label: 'Working…' };
  const warn = view.history.find((l) => l.tone === 'warn');
  if (warn !== undefined && input.warningTitle !== undefined)
    return { tone: 'warning', label: input.warningTitle, target: warn.anchor };
  if (state.kind === 'noPermission') return { tone: 'neutral', label: 'No permission' };
  if (state.kind === 'restored') return { tone: 'neutral', label: 'Restored' };
  if (state.kind === 'progressUnknown')
    return { tone: 'neutral', label: 'Progress unavailable' };
  const promptOpen = view.open.some(
    (o) => (o.kind === 'promote' || o.kind === 'release') && o.locked === undefined,
  );
  if (promptOpen || input.viewerPrompted) return { tone: 'neutral', label: 'Your turn' };
  // What the stage waits on: the prerequisites that have not passed yet, else who can still approve.
  const promoteWaits = view.open.flatMap((o) =>
    o.kind === 'promote' && o.locked?.why === 'waits' ? o.locked.waits : [],
  );
  const promoteWaitNames = promoteWaits.flatMap((w) =>
    w.kind === 'stage' || w.kind === 'gate' ? [w.name] : [],
  );
  // An open review comes before the other gates; an approved one no longer holds, so what Promote waits on is named.
  const reviewHolds = promoteWaits.some((w) => w.kind === 'review');
  const waitingOn =
    !reviewHolds && promoteWaitNames.length > 0
      ? promoteWaitNames
      : input.waitingOn.length > 0
        ? input.waitingOn
        : // A release review is waited on only once the promote is done; before it, it is "not reached yet".
          view.open.flatMap((o) =>
            o.kind === 'release' && o.locked !== undefined && !o.locked.after
              ? o.locked.waits.flatMap((w) => (w.kind === 'releaseReview' ? [w.name] : []))
              : [],
          );
  return {
    tone: 'neutral',
    label: waitingOn.length > 0 ? `Waiting on ${orList(waitingOn)}` : 'Waiting on review',
  };
}
