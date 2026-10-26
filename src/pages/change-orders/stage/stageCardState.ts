// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which state the selected stage's status box is in, and what follows from it:
 * the promote buttons' methods, the tile, a failed promotion, and the bylines.
 *
 * The state is said once, in the status box. Everything here reads data the page
 * already has; nothing guesses.
 */

import type { RunningRelease } from '../../x/apps/liveStatus';
import type { GateReviewSummary } from '../reviews/changeOrderReviewTypes';
import type { ChangeOrderGate, ChangeOrderStageVerdict } from '../../x/apps/change-order/changeOrderTypes';
import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import { partitionBlockingGates } from '../../x/apps/change-order/changeOrderGates';
import { BUILT_IN_PREREQUISITES } from '../../x/apps/change-order/changeOrderWorkflow';
import { stageChangeLanded } from '../reviews/stageReviewInputs';
import { stageCardCopy } from './stageCardCopy';
import { flowIsNeeded, rejection } from './stageReviewModel';

export { retryTargets, stageBylines, stageFailure, type SessionResult, type StageFailureInput } from './stageFailure';
import type {
  MergeMethod,
  MergeMethodOption,
  PropagationProblem,
  ReviewViewerFlow,
  StageBoxLook,
  StageCardState,
  StageCardStateKind,
  StageDryRunView,
  StageFailure,
  StageGateWait,
} from './stageTypes';

// ---------------------------------------------------------------------------
// The state
// ---------------------------------------------------------------------------

/** A review this card hosts, with where the viewer stands on it. */
export interface HostedReview {
  summary: GateReviewSummary;
  flow: ReviewViewerFlow;
}

/** The stage before this one, for telling a gate that waits from one that failed. */
export interface PreviousStageInput {
  stageId: string;
  name: string;
  verdict: ChangeOrderStageVerdict;
  /** Its Releases have not all reported healthy yet, and none has failed (`healthPending`). */
  healthPending: boolean;
}

export interface StageCardStateInput {
  stageId: string;
  verdict: ChangeOrderStageVerdict;
  isSource: boolean;
  /** An Invoke ChangeOrder's source, which writes nothing itself. */
  invocationSource: boolean;
  abortedReason: string;
  /** Every Space the stage selects. */
  spaceIds: readonly string[];
  /** False while the stage's Spaces are still being read. Absent: read. */
  membershipLoaded?: boolean;
  /**
   * False until the first answer about this stage's gates is in: the server's, or
   * the page's own evaluation where that decides. Before it, an unevaluated gate
   * means "not asked yet", not "the server decides", so nothing can be offered.
   * Absent: answered.
   */
  gatesAnswered?: boolean;
  /** The Spaces its actions write into (`promotionTargets`). */
  targets: readonly string[];
  stageHasTargets: boolean;
  gates: readonly ChangeOrderGate[];
  /** The stage before this one. Absent for the first stage. */
  previousStage?: PreviousStageInput;
  /** This browser's writes in flight. */
  inFlightSpaceIds: ReadonlySet<string>;
  failure: StageFailure | null;
  /** The release review this card hosts while the stage is promoted. */
  releaseReview?: HostedReview;
  /** The review of this stage's entry gate, when this card hosts it. */
  entryReview?: HostedReview;
  dryRun: StageDryRunView;
  /** The server gate read's refusal status for this stage (403: no permission). */
  serverGateRefusal?: number;
  problems: readonly PropagationProblem[];
  /** The viewer has just approved, and the gate is open. */
  approvedByYou?: boolean;
}

/** A gate the card's review rows stand for, so it is not counted twice as a failing gate. */
function isReviewGate(gate: ChangeOrderGate, summary: GateReviewSummary | undefined): boolean {
  if (gate.id.startsWith('attestation-prerequisite:')) return true;
  return summary?.requirements.some((r) => gate.prerequisite === r.name) ?? false;
}

/** Release requirements the server evaluated and that are not satisfied: Release is held, as Promote is on a 409. */
function releaseHeld(summary: GateReviewSummary): boolean {
  return summary.requirements.some((r) => r.gate.kind === 'release' && r.evaluated && !r.satisfied);
}

function releaseRejected(summary: GateReviewSummary): boolean {
  return summary.requirements.some((r) => r.gate.kind === 'release' && r.rejected && !r.rules.ignoreFail);
}

const gateNames = changeOrderCopy.gateNames;
/** Verdicts of a stage before that has not finished taking the change, but will once someone promotes it. */
const NOT_YET_PROMOTED: ReadonlySet<ChangeOrderStageVerdict> = new Set(['gated', 'waiting', 'in-progress']);

/**
 * What a gate that has not passed is waiting for, or `undefined` when it failed.
 *
 * A gate WAITS when what it checks has simply not happened yet: the stage before
 * has not taken or released the change, its health has not reported, or a review
 * of a change that has not landed. That is the ordinary state of every stage ahead
 * of the change, so it is said calmly. A gate FAILS when its condition was checked
 * against something that is there and came out false, and only that is red.
 */
export function gateWaitsFor(gate: ChangeOrderGate, previous: PreviousStageInput | undefined): StageGateWait['waitFor'] | undefined {
  if (previous === undefined) return undefined;
  const prerequisite = gate.prerequisite ?? '';
  if (prerequisite === 'Promoted' || gate.id === gateNames.promoted) {
    return NOT_YET_PROMOTED.has(previous.verdict) ? 'promoted' : undefined;
  }
  if (prerequisite === BUILT_IN_PREREQUISITES.released || gate.id === gateNames.released) {
    if (NOT_YET_PROMOTED.has(previous.verdict)) return 'promoted';
    return previous.verdict === 'promoted' ? 'released' : undefined;
  }
  if (prerequisite === BUILT_IN_PREREQUISITES.healthy || gate.id === gateNames.healthy) {
    if (NOT_YET_PROMOTED.has(previous.verdict)) return 'promoted';
    if (previous.verdict === 'promoted') return 'released';
    return previous.healthPending ? 'healthy' : undefined;
  }
  if (gate.id.startsWith('attestation-prerequisite:')) {
    return stageChangeLanded(previous.verdict) ? undefined : 'promoted';
  }
  return undefined;
}

const WAIT_ORDER: StageGateWait['waitFor'][] = ['promoted', 'released', 'healthy'];

/** The failing gates split into those that failed and those that only wait. */
export function splitHeldGates(
  gates: readonly ChangeOrderGate[],
  previous: PreviousStageInput | undefined,
): { failed: ChangeOrderGate[]; waiting: ChangeOrderGate[]; waitFor?: StageGateWait['waitFor'] } {
  const failed: ChangeOrderGate[] = [];
  const waiting: ChangeOrderGate[] = [];
  const reasons = new Set<StageGateWait['waitFor']>();
  for (const gate of gates) {
    const why = gateWaitsFor(gate, previous);
    if (why === undefined) failed.push(gate);
    else {
      waiting.push(gate);
      reasons.add(why);
    }
  }
  const waitFor = WAIT_ORDER.find((w) => reasons.has(w));
  return { failed, waiting, ...(waitFor === undefined ? {} : { waitFor }) };
}

/**
 * Whether the change has reached the stage before, so this stage's preview says
 * anything: that stage is promoted or released. Decided from that stage's own
 * progress, whatever gates this stage declares. The first stage reads the
 * ChangeOrder's own Space, which always has the change.
 */
export function previousHasChange(previousVerdict: ChangeOrderStageVerdict | undefined): boolean {
  return previousVerdict === undefined || previousVerdict === 'source' || previousVerdict === 'promoted' || previousVerdict === 'released';
}

/** True when the dry run's verdict, not a failure, is what the box must say. */
function dryRunOverrides(input: StageCardStateInput): boolean {
  const mode = input.dryRun.mode;
  return mode === 'held' || mode === 'noPermission' || mode === 'refused' || input.serverGateRefusal === 403;
}

/**
 * The status box's state. The first rule that applies wins: a source; an
 * aborted ChangeOrder; Spaces or the first gate answer still loading; a stage with no Spaces; this
 * browser writing; a failure on this stage, unless the dry run now says the
 * server holds, refuses or forbids the promote; released; promoted with no
 * Targets; promoted, where a release review that holds comes before Release;
 * the entry review rejected; a gate that failed; a gate that only waits; the
 * entry review not open; the server holding it (409); no permission (403); the
 * dry run refused; and then, for a stage that may be promoted: restored, a
 * propagation problem, in progress, progress unknown, or ready.
 *
 * Gates nobody evaluated do not hold a stage: the server decides, and its
 * verdict comes back with the quiet dry run.
 */
export function deriveStageCardState(input: StageCardStateInput): StageCardState {
  if (input.isSource) return { kind: input.invocationSource ? 'invocationSource' : 'source' };
  if (input.abortedReason !== '') return { kind: 'aborted', reason: input.abortedReason };
  if (input.membershipLoaded === false || input.gatesAnswered === false) return { kind: 'loading' };
  if (input.spaceIds.length === 0) return { kind: 'noSpaces' };
  if (input.targets.some((id) => input.inFlightSpaceIds.has(id))) return { kind: 'working' };
  const failure = input.failure;
  // A promote failure gives way to what the server says now; one that passed a Space over cannot be fixed by it.
  const failureGivesWay = failure !== null && failure.action === 'promote' && !failure.outOfScope && dryRunOverrides(input);
  if (failure !== null && !failureGivesWay) return { kind: 'failed', failure, canRetry: canRetry(failure, input.dryRun) };
  if (input.verdict === 'released') return { kind: 'released', took: input.problems };
  if (input.verdict === 'promoted' && !input.stageHasTargets) return { kind: 'promotedNoTargets' };

  if (input.verdict === 'promoted') {
    const review = input.releaseReview;
    if (review !== undefined && releaseHeld(review.summary)) {
      const base = { action: 'release' as const, gateKey: review.summary.gate.key, flow: review.flow, problems: input.problems };
      if (releaseRejected(review.summary)) return { kind: 'reviewRejected', rejection: rejection(review.summary), failedGates: [], ...base };
      return { kind: flowIsNeeded(review.flow) ? 'reviewNeeded' : 'reviewWaiting', ...base };
    }
    return { kind: 'promoted', took: input.problems };
  }

  const entry = input.entryReview;
  const blocked = partitionBlockingGates(input.gates).failed;
  // A review this card hosts is said by its own state; a review gate hosted elsewhere is a gate like any other.
  const otherBlocked = entry === undefined ? blocked : blocked.filter((g) => !isReviewGate(g, entry.summary));
  const held = splitHeldGates(otherBlocked, input.previousStage);
  const gateState = (): StageCardState | undefined => {
    if (held.failed.length > 0) return { kind: 'gateFailed', gates: held.failed, waiting: held.waiting };
    if (held.waiting.length > 0 && held.waitFor !== undefined) {
      const previous = input.previousStage;
      return {
        kind: 'gateWaiting',
        gates: held.waiting,
        waitFor: held.waitFor,
        ...(previous === undefined ? {} : { previousStage: { stageId: previous.stageId, name: previous.name } }),
      };
    }
    return undefined;
  };
  if (entry !== undefined) {
    const base = { action: 'promote' as const, gateKey: entry.summary.gate.key, flow: entry.flow, problems: input.problems };
    if (entry.summary.state === 'rejected') {
      return { kind: 'reviewRejected', rejection: rejection(entry.summary), failedGates: held.failed, ...base };
    }
    const byGate = gateState();
    if (byGate !== undefined) return byGate;
    if (!entry.summary.open && entry.summary.requirements.length > 0) {
      return { kind: flowIsNeeded(entry.flow) ? 'reviewNeeded' : 'reviewWaiting', ...base };
    }
  } else {
    const byGate = gateState();
    if (byGate !== undefined) return byGate;
  }

  const dryRun = input.dryRun;
  const carried = failureGivesWay && failure !== null ? { failure } : {};
  if (dryRun.mode === 'held') return { kind: 'serverHeld', text: dryRun.gatesHolding ?? '', ...carried };
  if (dryRun.mode === 'noPermission' || input.serverGateRefusal === 403) return { kind: 'noPermission', ...carried };
  if (dryRun.mode === 'refused') return { kind: 'dryRunRefused', reason: dryRun.refusal ?? '', ...carried };
  if (input.verdict === 'restored' || input.verdict === 'restore-released') {
    return { kind: 'restored', verdict: input.verdict, problems: input.problems };
  }
  if (input.problems.length > 0) return { kind: 'problem', problems: input.problems };
  if (input.verdict === 'in-progress') return { kind: 'inProgress' };
  if (input.verdict === 'unknown') return { kind: 'progressUnknown' };
  return { kind: 'ready', approvedByYou: input.approvedByYou === true };
}

/**
 * Whether Retry can be offered. A release is retried without a promote dry run.
 * A promote is retried once the dry run has passed, or could not answer (the
 * confirm then asks for the acknowledgement); while it runs, fails, or the server
 * refuses, a Retry would do nothing.
 */
function canRetry(failure: StageFailure, dryRun: StageDryRunView): boolean {
  if (failure.outOfScope) return false;
  if (failure.action === 'release') return true;
  return dryRun.mode === 'done' || dryRun.mode === 'unavailable';
}

/** The review states, which host review actions in the box. */
export function isReviewState(kind: StageCardStateKind): boolean {
  return kind === 'reviewNeeded' || kind === 'reviewWaiting' || kind === 'reviewRejected';
}

/**
 * States in which the quiet dry run runs: the ones that offer Promote, and the
 * ones the dry run itself decided, so a changed answer can move the card on. Not
 * while a review or a gate holds the stage, since a held stage is not previewed,
 * and not for a failed release, which a promote plan says nothing about.
 */
export function dryRunWanted(state: StageCardState | StageCardStateKind): boolean {
  const kind = typeof state === 'string' ? state : state.kind;
  if (typeof state !== 'string' && state.kind === 'failed' && state.failure.action === 'release') return false;
  switch (kind) {
    case 'ready':
    case 'problem':
    case 'inProgress':
    case 'progressUnknown':
    case 'restored':
    case 'failed':
    case 'serverHeld':
    case 'noPermission':
    case 'dryRunRefused':
      return true;
    default:
      return false;
  }
}

/** The tile and colour of each state. Problems get a solid tile; everything else stays calm. */
export function stageBoxLook(state: StageCardState): StageBoxLook {
  switch (state.kind) {
    case 'ready':
    case 'released':
    case 'promotedNoTargets':
      return { tone: 'success', tile: 'calm', icon: 'check' };
    case 'reviewNeeded':
    case 'reviewWaiting':
      return { tone: 'neutral', tile: 'calm', icon: 'person' };
    case 'reviewRejected':
    case 'failed':
    case 'gateFailed':
    case 'serverHeld':
      return { tone: 'error', tile: 'solid', icon: 'error' };
    case 'problem':
      return { tone: 'warning', tile: 'solid', icon: 'warning' };
    case 'promoted':
      return { tone: 'neutral', tile: 'calm', icon: 'upload' };
    case 'restored':
      return { tone: 'neutral', tile: 'calm', icon: 'undo' };
    case 'working':
    case 'inProgress':
      return { tone: 'neutral', tile: 'calm', icon: 'progress' };
    case 'aborted':
    case 'noPermission':
    case 'dryRunRefused':
      return { tone: 'neutral', tile: 'calm', icon: 'block' };
    case 'loading':
    case 'noSpaces':
    case 'progressUnknown':
    case 'gateWaiting':
      return { tone: 'neutral', tile: 'calm', icon: 'help' };
    case 'source':
    case 'invocationSource':
      return { tone: 'neutral', tile: 'calm', icon: 'check' };
  }
}

// ---------------------------------------------------------------------------
// The promote buttons
// ---------------------------------------------------------------------------

const PROMOTING_STATES: ReadonlySet<StageCardStateKind> = new Set(['ready', 'problem', 'inProgress', 'progressUnknown', 'restored', 'failed']);

/**
 * What the buttons offer: the first is the main button, the rest sit beside it.
 *
 * A promoted stage has one action left, Release, so it is one button and never
 * a re-promote. A stage with no Target is never released, so it offers
 * Promote alone. Done and held states offer nothing: the box says why instead of
 * showing a disabled button.
 */
export function methodsFor(state: StageCardState, stageHasTargets: boolean, stageName: string): MergeMethodOption[] {
  const item = stageCardCopy.merge.item;
  if (state.kind === 'promoted') {
    return [{ method: 'r', label: item.r.label, description: item.r.description(stageName), disabled: false }];
  }
  if (!PROMOTING_STATES.has(state.kind)) return [];
  if (state.kind === 'failed' && !state.canRetry) return [];
  if (!stageHasTargets) return [{ method: 'p', label: item.p.label, description: item.p.description(stageName), disabled: false }];
  return [
    { method: 'pr', label: item.pr.label, description: item.pr.description(stageName), disabled: false },
    { method: 'p', label: item.p.label, description: item.p.description(stageName), disabled: false },
  ];
}

/** The method the button starts on: the first it offers that can be chosen. */
export function defaultMethod(options: readonly MergeMethodOption[]): MergeMethod | undefined {
  return options.find((o) => !o.disabled)?.method;
}

/**
 * Whether the health of the stage before has simply not reported yet: some
 * Release has no live status, is not in sync, or is still deploying, and none has
 * failed or reported unhealthy. Undefined entries (Releases not read yet) count as
 * not reported.
 */
export function healthPending(releases: readonly (RunningRelease | null | undefined)[]): boolean {
  let pending = false;
  for (const release of releases) {
    if (release === null) continue;
    const status = release?.liveStatus;
    if (status === undefined || status === null) {
      pending = true;
      continue;
    }
    if (status.Operation === 'Failed') return false;
    if (status.Sync !== 'Synced' || status.Operation === 'Running') {
      pending = true;
      continue;
    }
    if (status.Health === 'Progressing') pending = true;
    else if (status.Health !== 'Healthy') return false;
  }
  return pending;
}
