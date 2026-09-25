// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Turns a ChangeOrder's reported progress into per-Space and per-stage verdicts.
 *
 * All progress comes from four fields on the ChangeOrder — `ResolvedSpaceIDs`
 * (Spaces that have taken the change), `ReleasedSpaceIDs` (Spaces that have
 * released it), and `RestoredSpaceIDs` / `ReleasedRestoredSpaceIDs` (Spaces it
 * has since been taken back out of, and where that undoing has been released).
 * They are derived server-side when the ChangeOrder is read; there is no status
 * enum, no per-resource breakdown, and no progress endpoint. Per Space is the
 * whole of the granularity available.
 *
 * Read `deriveProgress` before using anything else here. It exists because those
 * two fields can be MISSING from a perfectly successful 200, and mistaking that
 * for "nothing has happened yet" is the single easiest way to make this view lie.
 */

import type { ChangeWorkflowSpec } from '@confighub/rtk-query';
import { rolloutCopy } from './rolloutCopy';
import {
  buildGatesForStage,
  gatesOpen as areGatesOpen,
  partitionBlockingGates,
  tallyGates,
} from './rolloutGates';
import type { RolloutGateSpaceInput } from './rolloutGates';
import { promotableStages } from './rolloutStages';
import type {
  RolloutGate,
  RolloutProgress,
  RolloutSequence,
  RolloutSpaceState,
  RolloutSpaceVerdict,
  RolloutStage,
  RolloutStageState,
  RolloutStageVerdict,
} from './rolloutTypes';

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/** What `deriveProgress` needs off the ChangeOrder. */
export interface RolloutProgressInput {
  /** ChangeOrder.SpaceID — the Space it resides in, i.e. the base. */
  changeOrderSpaceId: string | undefined;
  /** ChangeOrderRead.ResolvedSpaceIDs, exactly as it arrived. `undefined` matters. */
  resolvedSpaceIds: string[] | undefined;
  /** ChangeOrderRead.ReleasedSpaceIDs, exactly as it arrived. */
  releasedSpaceIds: string[] | undefined;
  /** ChangeOrderRead.RestoredSpaceIDs. Absent is ordinary — see `deriveProgress`. */
  restoredSpaceIds: string[] | undefined;
  /** ChangeOrderRead.ReleasedRestoredSpaceIDs. Absent is ordinary too. */
  releasedRestoredSpaceIds: string[] | undefined;
}

/**
 * Decide whether the ChangeOrder's progress can be trusted, and if so, index it.
 *
 * WHY THIS IS NOT JUST `new Set(resolvedSpaceIds ?? [])`
 * -----------------------------------------------------
 * `setChangeOrderPropagation` derives these two fields when a ChangeOrder is
 * read, and it deliberately swallows any failure to do so — "a failure to derive
 * them is not a failure to read the ChangeOrder". A server that cannot answer
 * therefore returns **200 with the fields absent**. Nothing fails loudly.
 *
 * `undefined` and `[]` are also indistinguishable on the wire, because the Go
 * fields are `omitempty`.
 *
 * So a naive `?? []` renders a rollout that has never moved: every stage waiting,
 * every count zero, entirely plausible, and possibly completely wrong. The user
 * would be looking at a promotion that has already reached production and being
 * told nothing has been promoted.
 *
 * The discriminator is that `ResolvedSpaceIDs` contains the Spaces that have
 * taken the change "plus the Space it resides in" — so the ChangeOrder's own
 * Space is ALWAYS a member of a genuine answer. It can never legitimately be
 * empty, and it can never legitimately omit the base. If either holds, the
 * derivation did not run, and the honest report is "unavailable".
 *
 * One check covers three separate ways of being silently wrong: a server that
 * predates the feature, a derivation failure in production, and reading the
 * unwrapped POST shape where the wrapped GET shape was expected (which yields
 * `undefined` for every ChangeOrder).
 */
export function deriveProgress(input: RolloutProgressInput): RolloutProgress {
  const { changeOrderSpaceId, resolvedSpaceIds, releasedSpaceIds, restoredSpaceIds, releasedRestoredSpaceIds } =
    input;

  if (resolvedSpaceIds === undefined || resolvedSpaceIds.length === 0) {
    return unavailableProgress();
  }
  // The base must be in there. If it is not, we are not looking at a real answer.
  if (changeOrderSpaceId !== undefined && !resolvedSpaceIds.includes(changeOrderSpaceId)) {
    return unavailableProgress();
  }

  return {
    availability: 'available',
    resolvedSpaceIds: new Set(resolvedSpaceIds),
    // Absent Released IS legitimate once Resolved is trustworthy — it simply
    // means nothing has been released yet.
    releasedSpaceIds: new Set(releasedSpaceIds ?? []),
    /*
     * The restore fields carry no base-Space invariant to check them against,
     * and they need none: a ChangeOrder that has never been restored has no
     * restore Tag to read and so reports nothing here, which is the ordinary
     * case rather than a derivation failure. Empty means "nothing has been
     * taken back out", full stop.
     */
    restoredSpaceIds: new Set(restoredSpaceIds ?? []),
    releasedRestoredSpaceIds: new Set(releasedRestoredSpaceIds ?? []),
  };
}

function unavailableProgress(): RolloutProgress {
  return {
    availability: 'unavailable',
    resolvedSpaceIds: EMPTY_SET,
    releasedSpaceIds: EMPTY_SET,
    restoredSpaceIds: EMPTY_SET,
    releasedRestoredSpaceIds: EMPTY_SET,
  };
}

/**
 * Whether a Space has taken the change.
 *
 * The base is excluded from every count elsewhere, but it HAS taken the change
 * by definition — it is where the change was made — so it reports true here.
 */
export function hasTakenChange(progress: RolloutProgress, spaceId: string): boolean {
  return progress.resolvedSpaceIds.has(spaceId);
}

export function hasReleasedChange(progress: RolloutProgress, spaceId: string): boolean {
  return progress.releasedSpaceIds.has(spaceId);
}

/**
 * Whether the change has been taken back out of a Space.
 *
 * A restore leaves the end Tag exactly where the promotion put it, so a
 * restored Space answers true to both of the two above as well. Anything
 * deciding what a Space reads as has to ask this FIRST — which is the order
 * `changeOrderState` uses server-side, where `undone` is settled before
 * released or resolved are considered at all.
 */
export function hasRestoredChange(progress: RolloutProgress, spaceId: string): boolean {
  return progress.restoredSpaceIds.has(spaceId);
}

export function hasReleasedRestoredChange(progress: RolloutProgress, spaceId: string): boolean {
  return progress.releasedRestoredSpaceIds.has(spaceId);
}

export interface RolloutSpaceStateInput {
  spaceId: string;
  stage: RolloutStage;
  progress: RolloutProgress;
  /** Spaces with one of OUR promotes in flight. There is no backend in-flight state. */
  inFlightSpaceIds: ReadonlySet<string>;
  /** Whether the stage's gates are open, for the waiting-vs-gated distinction. */
  stageGatesOpen: boolean;
  /** Previous stage's name, for the "Waiting on X" strip. */
  previousStageId: string | null;
}

function deriveSpaceVerdict(input: RolloutSpaceStateInput): RolloutSpaceVerdict {
  const { spaceId, stage, progress, inFlightSpaceIds, stageGatesOpen } = input;
  if (stage.isSource) return 'source';
  // Our own in-flight promote outranks reported progress: the request is newer
  // than anything the last poll can have seen.
  if (inFlightSpaceIds.has(spaceId)) return 'promoting';
  if (progress.availability === 'unavailable') return 'unknown';
  // Restored outranks released and promoted, because a restored Space is still
  // a member of both of those sets and reading either one first would report a
  // change that has been taken back out as one that landed.
  if (hasReleasedRestoredChange(progress, spaceId)) return 'restore-released';
  if (hasRestoredChange(progress, spaceId)) return 'restored';
  if (hasReleasedChange(progress, spaceId)) return 'released';
  if (hasTakenChange(progress, spaceId)) return 'promoted';
  return stageGatesOpen ? 'waiting' : 'gated';
}

function spaceStripFor(verdict: RolloutSpaceVerdict, previousStageId: string | null): string {
  switch (verdict) {
    case 'source':
      return rolloutCopy.spaceStrip.source;
    case 'unknown':
      return rolloutCopy.spaceStrip.unknown;
    case 'promoting':
      return rolloutCopy.spaceStrip.promoting;
    case 'released':
      return rolloutCopy.spaceStrip.released;
    case 'promoted':
      return rolloutCopy.spaceStrip.promoted;
    case 'restored':
      return rolloutCopy.spaceStrip.restored;
    case 'restore-released':
      return rolloutCopy.spaceStrip['restore-released'];
    case 'gated':
      return rolloutCopy.spaceStrip.gated(previousStageId ?? '');
    case 'waiting':
    default:
      return rolloutCopy.spaceStrip.waiting;
  }
}

/** Where one Space has got to, and the one-line strip that says so. */
export function deriveSpaceState(input: RolloutSpaceStateInput): RolloutSpaceState {
  const { spaceId, previousStageId } = input;
  const verdict = deriveSpaceVerdict(input);

  return {
    spaceId,
    verdict,
    strip: spaceStripFor(verdict, previousStageId),
    /*
     * Left empty for now, on purpose.
     *
     * This carried the stage's labels for a gated Space, which turned out to be
     * both duplication — the lane head directly above already prints them — and
     * actively harmful: the extra text won the card's limited width and
     * truncated the strip's own sentence to "W…", so the one thing the strip
     * exists to say was the thing that got dropped. A trailing detail has to
     * earn its width against the sentence beside it.
     */
    detail: '',
  };
}

export interface RolloutStageStateInput {
  stage: RolloutStage;
  gates: RolloutGate[];
  progress: RolloutProgress;
  inFlightSpaceIds: ReadonlySet<string>;
}

/** Aggregate one stage from its Spaces. */
export function deriveStageState(input: RolloutStageStateInput): RolloutStageState {
  const { stage, gates, progress, inFlightSpaceIds } = input;

  const gateTally = tallyGates(gates);
  const open = areGatesOpen(gates);

  let promotedCount = 0;
  let releasedCount = 0;
  let restoredCount = 0;
  let releasedRestoredCount = 0;
  let inFlightCount = 0;
  for (const spaceId of stage.spaceIds) {
    if (inFlightSpaceIds.has(spaceId)) inFlightCount += 1;
    if (hasReleasedRestoredChange(progress, spaceId)) releasedRestoredCount += 1;
    /*
     * A restored Space counts ONLY as restored. It is still a member of the
     * resolved and released sets — a restore adds a Revision rather than
     * retracting a Tag — so counting it in either would mean a stage the change
     * has been taken back out of reports "N of N promoted" and offers Release.
     * Both are claims about a change that is no longer there.
     */
    if (hasRestoredChange(progress, spaceId)) {
      restoredCount += 1;
      continue;
    }
    if (hasTakenChange(progress, spaceId)) promotedCount += 1;
    if (hasReleasedChange(progress, spaceId)) releasedCount += 1;
  }
  const spaceCount = stage.spaceIds.length;

  const verdict: RolloutStageVerdict = ((): RolloutStageVerdict => {
    if (stage.isSource) return 'source';
    if (inFlightCount > 0) return 'in-progress';
    if (progress.availability === 'unavailable') return 'unknown';
    // Same precedence as the per-Space ladder, for the same reason.
    if (spaceCount > 0 && releasedRestoredCount === spaceCount) return 'restore-released';
    if (spaceCount > 0 && restoredCount === spaceCount) return 'restored';
    if (spaceCount > 0 && releasedCount === spaceCount) return 'released';
    if (spaceCount > 0 && promotedCount === spaceCount) return 'promoted';
    // Part-way through: some Spaces have it, some do not. Distinct from both
    // "not started" and "done", and the count in `progress` says how far. A
    // part-restored stage lands here too, since "waiting" would say nothing has
    // happened in a stage the change reached and was then pulled out of.
    if (promotedCount > 0 || restoredCount > 0) return 'in-progress';
    return open ? 'waiting' : 'gated';
  })();

  return {
    stageId: stage.id,
    verdict,
    label: rolloutCopy.stageVerdict[verdict],
    progress:
      verdict === 'source'
        ? rolloutCopy.sourceProgress
        : verdict === 'unknown'
          ? rolloutCopy.progressUnavailable
          : rolloutCopy.stageProgress(promotedCount, spaceCount, inFlightCount),
    promotedCount,
    restoredCount,
    inFlightCount,
    spaceCount,
    gates,
    gateTally,
    gatesOpen: open,
  };
}

/**
 * How many stages are fully promoted, for the "N of M stages promoted" strip.
 *
 * The source row is not a stage and is never counted — it holds the change by
 * definition, and counting it would report a rollout as one stage further along
 * than it is. This is the same base-Space trap `deriveProgress` guards.
 */
export function countPromotedStages(stageStates: RolloutStageState[]): number {
  let count = 0;
  for (const state of stageStates) {
    if (state.verdict === 'source' || state.verdict === 'unknown') continue;
    if (state.spaceCount > 0 && state.promotedCount === state.spaceCount) count += 1;
  }
  return count;
}

/**
 * How many stages the change CAN reach, for the "N of M stages" strip.
 *
 * ⚠️ NOT `promotableStages(sequence).length`, AND THE DIFFERENCE IS A TOTAL A
 * ROLLOUT CANNOT REACH. `buildRolloutSequence` pushes one entry per stage a
 * ChangeWorkflow DECLARES, whether or not its `whereSpace` selected any Space
 * (`rolloutStages.ts`), so a stage nothing is labelled for sits in the sequence
 * with `spaceCount === 0`. `countPromotedStages` can never count such a stage —
 * there is nothing in it to have taken the change — so a rollout that has
 * reached everywhere it can still reads "1 of 2" for ever, beside a caption
 * saying every stage has taken the change.
 *
 * DROPPED FROM THE TOTAL RATHER THAN COUNTED AS DONE, because a stage no Space
 * is in is not a destination the change arrived at: calling it done claims a
 * promotion that never happened, while leaving it out states the honest number
 * of places this rollout has to go. It is the same reading `deriveConsoleState`'s
 * `no-stages` already takes of an empty stage.
 *
 * SEPARATE FROM `promotableStages`, deliberately. That predicate answers "is
 * this the source row", and `finalStageGates` takes the LAST stage from it — a
 * workflow's declared last stage, empty or not. Narrowing it would silently
 * change which stage `Final` is checked over; this counts, and nothing else.
 */
export function countReachableStages(stageStates: readonly RolloutStageState[]): number {
  let count = 0;
  for (const state of stageStates) {
    if (state.verdict === 'source') continue;
    if (state.spaceCount === 0) continue;
    count += 1;
  }
  return count;
}

/** The collapsed step summary: state, progress, and gates, on one line. */
export function summariseStage(state: RolloutStageState): string {
  const parts: string[] = [state.label];
  if (state.progress.length > 0) parts.push(state.progress);
  if (state.gateTally.total > 0) {
    parts.push(rolloutCopy.gateSummary(state.gateTally.satisfied, state.gateTally.total));
    /*
     * Name the cause, not just the count — and say which KIND of cause it is.
     * A gate that failed and a gate nobody evaluated are different claims, and
     * they arrive mixed in declared order, so the first blocking entry is
     * whichever the workflow happened to list first. The reason is drawn from
     * the failures when there are any, because a check that failed is the more
     * specific answer; both counts are stated either way. Every reason is
     * `cub`-verbatim, so this composes existing sentences rather than
     * deriving or re-wording one.
     */
    const report = partitionBlockingGates(state.gates);
    if (report.principal !== undefined) {
      parts.push(
        rolloutCopy.blockedBy(
          report.failed.length,
          report.notEvaluated.length,
          report.principal.reason,
        ),
      );
    }
  }
  return parts.join(' · ');
}

export interface RolloutCompletionInput {
  /** The governing workflow, for its `Final.Prerequisites`. */
  workflow: ChangeWorkflowSpec;
  sequence: RolloutSequence;
  progress: RolloutProgress;
  /**
   * What the gates need to know about one Space of the last stage. Supplied by
   * the caller because live status and release target come from a Space read
   * this module never makes.
   */
  gateSpaceInput: (spaceId: string) => RolloutGateSpaceInput;
  componentName: string;
  changeOrderSlug: string;
}

/**
 * `Final.Prerequisites` evaluated over the last stage's own Spaces, or `null`
 * when the workflow declares no stage to be last.
 *
 * ⚠️ THE LAST STAGE IS ITS OWN GATE SUBJECT, AND IT SAYS SO. Every other gate
 * in this app quantifies over the PREVIOUS stage's Spaces, and
 * `buildGatesForStage` reads `previousStageId` both to word its reasons and to
 * decide that a stage with nothing before it is ungated. `Final` is the one
 * check with no hop behind it: it asks the last stage about itself. Naming the
 * stage as its own predecessor is what makes that literally true of the context
 * handed over, and it is the reason a single-stage workflow's `Final` is still
 * evaluated — left pointing at the synthetic source row, it would be dropped as
 * a first stage's gates are.
 *
 * Whether the rollout is complete is `ChangeOrder.Stage`, which the server
 * records. These gates are what a caller reads to say WHICH final check held —
 * or which one nobody made.
 */
export function finalStageGates(input: RolloutCompletionInput): RolloutGate[] | null {
  const { workflow, sequence, progress, gateSpaceInput, componentName, changeOrderSlug } = input;

  const promotable = promotableStages(sequence);
  const lastStage = promotable[promotable.length - 1];
  if (lastStage === undefined) return null;

  return buildGatesForStage({
    stage: {
      ...lastStage,
      previousStageId: lastStage.id,
      // `Final` has a real subject — the last stage itself — so it is never the
      // ungated first-stage case, whatever position that stage occupies. Left
      // inherited, a one-stage workflow's `Final` is dropped as a first stage's
      // gates are, and the only check over production disappears.
      isFirst: false,
      prerequisites: workflow.Final?.Prerequisites ?? [],
    },
    previousStageSpaces: lastStage.spaceIds.map((spaceId) => gateSpaceInput(spaceId)),
    progress,
    componentName,
    changeOrderSlug,
    customPrerequisites: workflow.CustomPrerequisites,
  });
}

/**
 * The position in `sequence.stages` of the stage after the one the server has
 * recorded in `ChangeOrder.Stage`, or `-1` when there is none: the change order
 * is `Completed`, or has reached the last stage.
 *
 * An empty `Stage` has not reached the first stage, so the first stage is next.
 * A `Stage` naming no stage of the workflow has no next stage.
 *
 * ⚠️ THE POSITION IS THE IDENTITY. Stage names come from the ChangeWorkflow and
 * are user data, so a caller lining the next stage up against a per-stage array
 * must do it by position. `sequence.stages` is the source row followed by the
 * workflow's stages in declared order, so a workflow stage at index `i` is at
 * position `i + 1`.
 */
export function nextStageIndexFromChangeOrderStage(
  sequence: RolloutSequence,
  stage: string | undefined,
): number {
  if (stage === 'Completed') return -1;
  const promotable = promotableStages(sequence);
  const reached = stage === undefined || stage === '' ? -1 : promotable.findIndex((s) => s.id === stage);
  if ((stage ?? '') !== '' && reached === -1) return -1;
  const next = promotable[reached + 1];
  return next === undefined ? -1 : sequence.stages.indexOf(next);
}
