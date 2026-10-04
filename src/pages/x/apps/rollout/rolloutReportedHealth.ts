// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a stage's Spaces REPORT about themselves, which is not what a gate says
 * about them.
 *
 * ── TWO QUESTIONS, AND THEY HAVE DIFFERENT CORRECT ANSWERS ────────────────
 *
 * A rollout stage is asked two things about one and the same Space:
 *
 *  Q1 MAY THIS PROMOTION PROCEED? `cub`'s question, answered by `rolloutGates.ts`
 *     and by nothing else. Some Spaces cannot be health-checked at all — a
 *     Space with no `ReleaseTargetID`, or one that has not taken the change —
 *     so the answer is "not evaluated", and an unknown holds the stage.
 *
 *  Q2 IS THIS STAGE'S WORKLOAD HEALTHY RIGHT NOW? The console's question,
 *     answered here. A live status reporting OutOfSync, Failed or Degraded is
 *     evidence of a problem whatever a gate concluded, because it is written by
 *     whatever watches the live cluster and is about the workload, not about
 *     the promotion.
 *
 * Where a gate is not evaluated over a Space reporting Degraded, the two
 * answers are "cannot be determined" and "failing". Both are right. One value
 * cannot carry both, and while one did, the console read the gate's
 * `evaluated: false` as "no problem found", drew the stage as `done`, called
 * the rollout Complete and withdrew Abort from a rollout that was actively
 * failing.
 *
 * So the display channel carries its own answer, in its own type. The gate
 * verdict is unchanged and stays `cub`'s.
 *
 * ── THE TYPES CANNOT BE SUBSTITUTED FOR ONE ANOTHER ───────────────────────
 *
 * `StageHealthReport` has no `ok` and no `evaluated`; `RolloutGate` has no
 * `channel` and no `reported`. `ReportedHealthChannel` and `GateVerdictChannel`
 * below hold that apart at compile time, and both are used in signatures so a
 * merge of the two shapes breaks the build rather than the console.
 *
 * ── AND A SPACE THE CHANGE HAS NOT ENTERED IS NOT EVIDENCE ────────────────
 *
 * Q2 is asked of a workload, so it may only be asked where this rollout's
 * configuration is the one running. `ReportedHealthSpaceInput.taken` carries
 * that fact and `reportedHealthOf` skips every Space without it — the same rule
 * the gate channel keeps by refusing to reach a health verdict about a Space
 * that never took the change.
 *
 * ── WHERE A REPORT REACHES, AND WHERE IT DOES NOT ─────────────────────────
 *
 * A report is never a promotion verdict. It reaches no gate: `gatesOpen`,
 * `blockingGates` and `buildGatesForStage` never read this channel, so a stage
 * held by the gate channel stays held and a green report opens nothing.
 *
 * ⚠️ AND IT REACHES NO ACTION EITHER. THE DISPLAY INFORMS; THE GATE DECIDES.
 * A report is an observation about a workload, not a rule about a promotion, so
 * it may not withdraw an action the gate permits. A workflow that declares no
 * health prerequisite is promoted by `cub` over a Degraded previous stage —
 * there is nothing to check — and a UI that refused it would be refusing a
 * correct action, which teaches an operator to distrust every refusal after it.
 * `ConsoleRow.gateState` carries the row's answer from the gate channel alone
 * and `actionFor` reads only that.
 *
 * The three consumers this channel reaches, and no others:
 *
 *   `deriveConsoleState` — 'degraded' outranks the completion reading, so a
 *                          failing workload is shown rather than hidden.
 *   `deriveBlocker`      — the same read, so the sentence and the state agree.
 *   `segmentToneFor`     — `done` is never drawn over a Space reporting that it
 *                          is not healthy.
 *
 * All three are what the row SAYS. `taken` below is what keeps even that
 * honest: only a Space actually running THIS change is evidence, and the
 * ChangeOrder's own Space never is (`reportedSpaceInput`).
 */

import type { LiveStatus } from '../liveStatus';
import { rolloutCopy } from './rolloutCopy';
import type { RolloutGate } from './rolloutTypes';

/**
 * What the report needs to know about one Space of the stage.
 *
 * The same FACTS the gate channel reads — a Space has one live status, not one
 * per reader. What differs is the question asked of them, which is why the
 * answer has its own type and this does not.
 */
export interface ReportedHealthSpaceInput {
  /** Whether this Space's own data has arrived. An unread Space reports nothing. */
  loaded: boolean;
  /** Variant name if the Space has one, else its slug — what `cub` calls the Variant. */
  variantName: string;
  /**
   * The live status of the Release the Space is running, or null when it runs
   * none or its deploying tool has not reported on it yet.
   */
  liveStatus: LiveStatus | null;
  /**
   * Whether this Space is running the change being rolled out — `hasTakenChange`
   * over the ChangeOrder's own progress, never a guess from the stage verdict,
   * and never true of the ChangeOrder's own Space, which no promotion judges
   * (`reportedSpaceInput`).
   *
   * ⚠️ THE ONE FACT THAT MAKES A LIVE STATUS EVIDENCE. A Space that has not
   * taken the change is running somebody else's configuration, so its live
   * status is about that configuration and about nothing this rollout did. The
   * gate channel already refuses to judge such a Space; this channel has to
   * refuse to REPORT on it, or a Space added to an earlier stage long after a
   * release lands turns an unrelated outage into this rollout's failure.
   */
  taken: boolean;
}

/**
 * What the stage's Spaces say about themselves.
 *
 *  - `failing`    — a Space was read and its status is not green. Evidence.
 *  - `healthy`    — every Space was read and every one is green.
 *  - `unreported` — nothing was read, or something was read and reports no
 *                   live status at all. NOT a failure: "the workload is
 *                   failing" and "nobody said" are different claims, and only
 *                   the gate channel turns the second into a refusal.
 */
export type ReportedHealthVerdict = 'failing' | 'healthy' | 'unreported';

export interface StageHealthReport {
  /**
   * Which channel this answer belongs to. Named rather than implied so a reader
   * at a call site can see that this is a report about a workload and not a
   * verdict about a promotion.
   */
  readonly channel: 'reported-health';
  readonly reported: ReportedHealthVerdict;
  /** Names the Space and what it reports. Empty unless `reported` is `failing`. */
  readonly reason: string;
}

/**
 * The fields that make a value readable as a gate verdict. A report carrying
 * either one can be read with `evaluated && !ok`, which is the whole of the
 * failure this separation exists to prevent.
 */
type VerdictFields = 'ok' | 'evaluated';

/** The fields that make a value readable as a reported status. */
type ReportFields = 'channel' | 'reported';

/**
 * Resolves to `never` the moment `T` carries ANY of the other channel's
 * defining fields. Both aliases below are used in signatures, so a re-merge
 * fails the build at the definition rather than surfacing as a stage drawn
 * green while it burns.
 *
 * ⚠️ A PARTIAL RE-MERGE IS THE ONE THAT ACTUALLY HAPPENS, and a full-structural
 * test does not catch it. The previous guard asked whether `StageHealthReport`
 * was ASSIGNABLE to `RolloutGate`; putting `ok` and `evaluated` back onto the
 * report and rewriting the display test as `report.evaluated && !report.ok`
 * left it still missing `id` and `name`, so it was still not assignable, the
 * guard stayed quiet and the build stayed green. Nobody re-merges these two by
 * writing out the whole of the other type. They re-merge them two fields at a
 * time, and those two fields are the dangerous ones.
 *
 * ⚠️ THE FORBIDDEN SETS ARE WRITTEN OUT, NEVER DERIVED FROM THE OTHER TYPE.
 * `Exclude<keyof RolloutGate, keyof StageHealthReport>` reads like the same
 * thing and is self-erasing: the instant the report gains `ok`, `ok` leaves
 * that set, and the guard stops biting at precisely the moment it should fire.
 */
export type MustNotCarry<T, Forbidden extends string> =
  Extract<keyof T, Forbidden> extends never ? T : never;

/**
 * Every field that makes a value readable as a HEALTH answer, of either
 * channel. What the ACTION path must not be able to carry — see
 * `GateChannelState` in `rolloutsConsoleModel.ts`.
 */
export type HealthAnswerFields = VerdictFields | Extract<ReportFields, 'reported'>;

/** A reported status. Never a gate verdict. */
export type ReportedHealthChannel = MustNotCarry<StageHealthReport, VerdictFields>;

/** A gate verdict. Never a reported status. */
export type GateVerdictChannel = MustNotCarry<RolloutGate, ReportFields>;

const UNREPORTED: ReportedHealthChannel = { channel: 'reported-health', reported: 'unreported', reason: '' };

/**
 * Why this Space's reported status is not green, or null when it is.
 *
 * The axes are read in the order `checkSpaceIsHealthy` reads them, so the
 * console names the same axis the CLI would name about the same status.
 * The WORDING is deliberately not the CLI's: `cub` states a verdict it reached
 * ("is not synced"), and this states what a Space reported ("reports it is not
 * synced"). A reader must be able to tell a refusal from an observation.
 */
function failureOf(space: ReportedHealthSpaceInput): string | null {
  const status = space.liveStatus;
  if (status === null) return null;
  if (status.Sync !== 'Synced') return rolloutCopy.reportedStatus.notSynced(space.variantName);
  if (status.Operation === 'Running') return rolloutCopy.reportedStatus.stillDeploying(space.variantName);
  if (status.Operation === 'Failed') return rolloutCopy.reportedStatus.notSucceeded(space.variantName);
  if (status.Health !== 'Healthy') return rolloutCopy.reportedStatus.notHealthy(space.variantName);
  return null;
}

/**
 * The stage's reported health: the whole stage is only as healthy as its worst
 * Space, and a failure that WAS read is never withheld because a sibling Space
 * has not loaded. Withholding it would hide the one thing this channel exists
 * to surface.
 *
 * `healthy` is the strict answer: every Space read, every Space green, and
 * every Space actually running this change. One unread, silent or un-taken
 * Space is enough to fall back to `unreported`, because a stage cannot be
 * called healthy on behalf of a Space nobody heard from — or one that is not
 * running what this rollout is carrying.
 */
export function reportedHealthOf(
  spaces: readonly ReportedHealthSpaceInput[],
): ReportedHealthChannel {
  if (spaces.length === 0) return UNREPORTED;

  let everySpaceGreen = true;
  for (const space of spaces) {
    /*
     * A STAGE THE CHANGE HAS NOT ENTERED IS NOT EVIDENCE OF ANYTHING. Read
     * before the live status, because the live status is exactly what must not
     * be consulted here: it describes a workload running a different change. Such
     * a Space is neither a failure nor a pass, which is why it also forfeits the
     * strict `healthy` answer below — a stage cannot be called healthy on behalf
     * of a Space that is not running this change.
     */
    if (!space.taken) {
      everySpaceGreen = false;
      continue;
    }
    if (!space.loaded || space.liveStatus === null) {
      everySpaceGreen = false;
      continue;
    }
    const failure = failureOf(space);
    if (failure !== null) return { channel: 'reported-health', reported: 'failing', reason: failure };
  }
  return everySpaceGreen
    ? { channel: 'reported-health', reported: 'healthy', reason: '' }
    : UNREPORTED;
}
