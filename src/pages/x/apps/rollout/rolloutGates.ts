// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Gates governing entry to a rollout stage.
 *
 * The server enforces them. `POST /promote` evaluates every gate of the stage
 * being entered over every Space of the stage ahead of it
 * (`evaluatePrerequisites`, internal/views/promote_gates.go), refuses with 409
 * when one does not hold, and reports every verdict, per Space and per
 * prerequisite, on a dry run as well as on a refusal. `cub variant promote`
 * prints the same messages, and rolloutCopy.ts reuses their wording.
 *
 * This module evaluates the gates it can from data the page already holds, so
 * that a list of rollouts can say which are ready without asking the server
 * about each one. The gates it cannot evaluate are reported as not evaluated,
 * and a page showing one ChangeOrder fills them in from the server's dry run
 * (`applyServerGates`). Where the two disagree, the server is right and this
 * file is wrong.
 *
 * ── A SPACE WITH NO RELEASE TARGET IS UNKNOWN, NOT EXEMPT ──────────────────
 *
 * `cub` refuses a `Healthy` promote outright when a previous-stage Space
 * carries no `ReleaseTargetID`: its health "cannot be determined". This module
 * says the same thing in its own vocabulary —
 * `evaluated: false`, which renders as not-checked — rather than granting such a Space a pass it was never tested for.
 *
 * The `Released` check is the exception: a Space with no release target can
 * never release, so it passes that check once it has taken the change.
 *
 * ⚠️ AND IT IS ASKED FIRST. `checkSpaceIsHealthy` refuses on the missing
 * `ReleaseTargetID` BEFORE it reads anything else about the Space, so no live
 * status can decide the health gate for a targetless Space. A targetless Space
 * runs no Release, so it has no live status to read: the Releases it published
 * before its Target was cleared describe nothing it is running.
 *
 * A verdict must never be reported over a filtered-down set, either. A gate that
 * drops its targetless Spaces and then reports `ok: true, evaluated: true` over
 * the remainder is reporting a verdict about nothing, and a reader cannot tell
 * it apart from a verdict about everything.
 *
 * So a targetless base Space ahead of a stage that requires `Healthy` keeps that
 * stage from reading as ready here, and the server refuses to promote into it,
 * which is what the server's verdict says once it replaces this one.
 *
 * What we do NOT do is invent gates. The design mockup showed `approval/*` and
 * `window/change-freeze` rows; neither has any backing model, so neither is
 * rendered. The renderer supports approvers and richer statuses so a real model
 * drops in later without redesign, but the product path shows only what is true.
 *
 * ── WHAT THIS FILE EVALUATES, AND WHAT IT LEAVES TO THE SERVER ───────────
 *
 * A workflow's stages gate on named prerequisites. Three of those names are
 * built in, and like every prerequisite each is a condition on every Space of
 * the previous stage. `Released` and `Healthy` are evaluated here. `Validated`
 * reads the ValidationErrors of every Revision the change order's end Tag marks
 * in those Spaces, which this page does not load.
 *
 * A workflow may also declare prerequisites of its own: custom checks, each a
 * CEL expression evaluated against the Space, the ChangeOrder and that Space's
 * Release, and Attestation requirements, which read the Attestations recorded
 * on the change's Revisions. THIS APP DOES NOT EVALUATE THEM: CEL in the
 * browser would be a second implementation of the product's gating language,
 * and the Attestations are not loaded. So `Validated` and every declared check
 * are reported by name and marked `evaluated: false` until the server's verdict
 * replaces them.
 *
 * That distinction is load-bearing. `gatesOpen` refuses an unevaluated gate, so
 * a stage is never drawn ready on a check nobody made, and `gateStateFor` draws
 * it as `unknown` rather than as `held`. But it does not stop a promotion: only
 * a gate that was evaluated and failed does (`gatesBlockPromotion`), and the
 * server decides the rest.
 */

import type {
  ChangeWorkflowAttestationPrerequisite,
  ChangeWorkflowPrerequisite,
  PromoteGateResult,
} from '@confighub/rtk-query';

import { BUILT_IN_PREREQUISITES, classifyPrerequisite } from './changeOrderWorkflow';
import { previousStageDisplayName, rolloutCopy } from './rolloutCopy';
import type {
  RolloutGate,
  RolloutGateTally,
  RolloutProgress,
  RolloutStage,
} from './rolloutTypes';
import type { RunningRelease } from '../liveStatus';

/** What a gate needs to know about one Space of the previous stage. */
export interface RolloutGateSpaceInput {
  spaceId: string;
  /**
   * Whether this Space's own data has arrived yet: the Space, and for a Space
   * with a release Target, its Releases.
   *
   * Separate from `release` being null, and the distinction is load-bearing.
   * A Space that has loaded and runs no Release genuinely has none — that is a
   * real, blocking answer. A Space whose data has not arrived tells us
   * nothing, and reporting it as "no release" is a confident refusal built on
   * data we have not read. It renders a stage as Gated, with a reason naming a
   * raw Space id, until the fetch lands.
   */
  loaded: boolean;
  /** Variant name if the Space has one, else its slug — what `cub` calls the Variant. */
  variantName: string;
  /**
   * The Release the Space is running — its latest published Release for its
   * release Target — with its live status, or null when it runs none.
   */
  release: RunningRelease | null;
  /**
   * Space.ReleaseTargetID. A Space without one "releases nothing, ever … so
   * having taken the change is the whole of what it can be asked for"
   * (the `Released` check in `evaluatePrerequisites`). Such a Space must never
   * show an unsatisfied release gate.
   */
  releaseTargetId?: string;
}

export interface RolloutGateContext {
  /** The stage being promoted INTO. */
  stage: RolloutStage;
  /** Spaces of `stage.previousStageId`. Empty when that stage has no Spaces. */
  previousStageSpaces: RolloutGateSpaceInput[];
  progress: RolloutProgress;
  componentName: string;
  changeOrderSlug: string;
  /**
   * The checks the governing workflow declared beyond the built-in ones, so a
   * name a stage gates on can be told apart from one nothing declares. Absent
   * is a workflow that declared none, which is the common case.
   */
  customPrerequisites?: readonly ChangeWorkflowPrerequisite[];
  /** The Attestation requirements the governing workflow declared, likewise. */
  attestationPrerequisites?: readonly ChangeWorkflowAttestationPrerequisite[];
}

/**
 * Build the gates for one stage.
 *
 * ── THE FIRST STAGE IS UNGATED ────────────────────────────────────────────
 *
 * `validateStageEntryGates` returns nil the moment `previousStage == nil`, and
 * the model says why: a Stage's prerequisites "are evaluated over every Space of
 * the Stage ahead of this one … The first Stage's are therefore never
 * evaluated" (internal/models/changeworkflow.go). Nothing precedes the first
 * Stage but the base Space the change was authored in, which holds the change by
 * definition and is not a rollout target.
 *
 * `buildRolloutSequence` gives the first real stage the synthetic source row as
 * its predecessor, so BOTH shapes mean "nothing precedes this" and both return
 * no gates. Judging the base instead would hold every first promotion behind a
 * gate the CLI never applies, and a refusal issued routinely is a refusal
 * nobody reads when it finally matters.
 *
 * ⚠️ WHICH STAGE IS FIRST IS READ OFF `isFirst`, NEVER OFF A NAME. The stage
 * names in a ChangeWorkflow are user data and the server accepts
 * `__rollout_source__` among them, so `previousStageId === SOURCE_STAGE_ID` let
 * a workflow author hand the stage after it an empty gate list, which draws it
 * as ready to promote whatever the server would say.
 *
 * Returns an empty list in both cases. No prerequisite means no gate, not an
 * unsatisfied one.
 *
 * `promoted` is mandatory whenever a previous stage is named at all — the
 * previous stage has to be there AND to have taken the change, regardless of
 * which optional checks the ChangeWorkflow declared. Everything else the stage
 * names is classified: `Released` and `Healthy` are evaluated here, `Validated`
 * and a check the workflow declared are reported as not evaluated, and a name
 * nothing accounts for is reported as unrecognised.
 *
 * Each gate carries the prerequisite name the server reports it under, which is
 * what `applyServerGates` matches the server's verdicts by.
 *
 * ⚠️ EVERY ONE OF THEM IS A MEMBER OF THIS ONE ARRAY. A custom prerequisite
 * routed to some separate informational list would leave a stage gating only on
 * CEL with `gates = []` — and an empty gate list is `gatesOpen` true and
 * `gateStateFor(0, 0)` 'none': an open padlock on a stage nothing has checked.
 * That is "unknown renders as pass" by omission, and it is the worst outcome
 * available here. A gate that has not been evaluated belongs in the same array
 * as one that has, carrying `evaluated: false`.
 */
export function buildGatesForStage(context: RolloutGateContext): RolloutGate[] {
  const { stage } = context;

  if (stage.isSource) return [];
  if (stage.previousStageId === null) return [];
  if (stage.isFirst) return [];

  return [
    { ...promotedGate(context), prerequisite: PROMOTED_PREREQUISITE },
    ...stage.prerequisites.map((name) => ({ ...evaluatePrerequisite(name, context), prerequisite: name })),
  ];
}

/**
 * What the server reports the mandatory gate under: every Space of the previous
 * stage has taken the change (`promotePrerequisitePromoted`).
 */
const PROMOTED_PREREQUISITE = 'Promoted';

/**
 * One named prerequisite, evaluated as far as this page can.
 *
 * The four answers are different things and must stay so:
 *
 *  - `Released` and `Healthy` are evaluated here, and report pass or fail;
 *  - `Validated` reads Revisions this page does not load, and reports neither;
 *  - a declared check (a CEL expression or an Attestation requirement) cannot be
 *    evaluated here, and reports neither — `evaluated: false`, which is the
 *    truth about it until the server's verdict replaces it;
 *  - an UNRECOGNISED name is a failure, because the server refuses the
 *    promotion outright on one.
 */
export function evaluatePrerequisite(name: string, context: RolloutGateContext): RolloutGate {
  const classified = classifyPrerequisite(name, context.customPrerequisites, context.attestationPrerequisites);
  // The stage whose Spaces the check is a condition on, which is what the
  // sentences about checks this page cannot make name.
  const evaluatedStage = previousStageDisplayName(context.stage) ?? '';
  switch (classified.kind) {
    case 'built-in':
      if (classified.name === BUILT_IN_PREREQUISITES.released) return releasedGate(context);
      if (classified.name === BUILT_IN_PREREQUISITES.healthy) return liveStatusGate(context);
      return validatedGate(evaluatedStage);
    case 'custom':
      return customPrerequisiteGate(
        evaluatedStage,
        classified.name,
        classified.description,
      );
    case 'attestation':
      return attestationPrerequisiteGate(
        evaluatedStage,
        classified.name,
        classified.description,
      );
    case 'unrecognised':
      return unrecognisedPrerequisiteGate(context.stage.id, classified.name);
  }
}

/**
 * Whether a prerequisite is one only the server evaluates: `Validated`, or a
 * check the workflow declared. A stage naming one is a stage whose gates a page
 * asks the server about (`useServerStageGates`).
 */
export function onlyTheServerEvaluates(
  name: string,
  customPrerequisites: readonly ChangeWorkflowPrerequisite[] | undefined,
  attestationPrerequisites: readonly ChangeWorkflowAttestationPrerequisite[] | undefined,
): boolean {
  const classified = classifyPrerequisite(name, customPrerequisites, attestationPrerequisites);
  switch (classified.kind) {
    case 'built-in':
      return classified.name === BUILT_IN_PREREQUISITES.validated;
    case 'custom':
    case 'attestation':
      return true;
    case 'unrecognised':
      return false;
  }
}

/**
 * The built-in `Validated` check, which this page does not evaluate.
 *
 * The server answers it from the ValidationErrors on each Revision the change
 * order's end Tag marks in the previous stage. Reading those here would mean
 * listing Revisions for every Space of that stage, so the gate is reported as
 * not evaluated until the server's verdict replaces it.
 */
function validatedGate(evaluatedStage: string): RolloutGate {
  return {
    id: 'validated',
    name: rolloutCopy.gateNames.validated,
    ok: false,
    evaluated: false,
    reason: rolloutCopy.gateReasons.validated(evaluatedStage),
  };
}

/**
 * A check the workflow declared, which this page cannot evaluate.
 *
 * Custom prerequisites are CEL expressions, evaluated against the Space, the
 * ChangeOrder and that Space's Release. `ui/` has no CEL evaluator and no CEL
 * dependency, and adding one would be a second implementation of the product's
 * gating language rather than a port of it. So the gate is reported by name,
 * with the author's own description, and never as a verdict of this page's.
 */
function customPrerequisiteGate(
  evaluatedStage: string,
  name: string,
  description: string | undefined,
): RolloutGate {
  return {
    id: `custom-prerequisite:${name}`,
    name: rolloutCopy.gateNames.customPrerequisite(name),
    ok: false,
    evaluated: false,
    reason: rolloutCopy.gateReasons.customPrerequisite(evaluatedStage, name, description),
    description,
  };
}

/**
 * An Attestation requirement the workflow declared, which this page cannot
 * evaluate: it counts the Attestations recorded on the change's Revisions, by
 * whom and how recently, and none of that is loaded here.
 */
function attestationPrerequisiteGate(
  evaluatedStage: string,
  name: string,
  description: string | undefined,
): RolloutGate {
  return {
    id: `attestation-prerequisite:${name}`,
    name: rolloutCopy.gateNames.attestationPrerequisite(name),
    ok: false,
    evaluated: false,
    reason: rolloutCopy.gateReasons.attestationPrerequisite(evaluatedStage, name, description),
    description,
  };
}

/**
 * A name neither a built-in nor a declared check accounts for.
 *
 * The server fails the promotion outright on this — "unrecognized prerequisite
 * for Stage '%s': '%s'" — so it is EVALUATED and FAILED here, not merely
 * unknown.
 */
function unrecognisedPrerequisiteGate(stageId: string, name: string): RolloutGate {
  return {
    id: `unrecognized-prerequisite:${name}`,
    name: rolloutCopy.gateNames.unrecognizedPrerequisite,
    ok: false,
    evaluated: true,
    reason: rolloutCopy.gateReasons.unrecognizedPrerequisite(stageId, name),
  };
}

/**
 * The mandatory gate: the previous stage exists, and every Space in it has
 * TAKEN the change being promoted.
 *
 * Two checks, because `cub` makes two, and both run whatever the stage
 * declares. `validateStageEntryGates` first refuses a previous stage nobody is
 * in — "unable to promote to stage '%s', its previous stage '%s' selects no
 * Space" — and then runs the taken-the-change check `evaluatePrerequisites`
 * opens with for EVERY Space of it, unconditionally, before the switch over the
 * stage's own
 * prerequisites: "a Stage cannot be entered from a Stage the change has not
 * reached. The prerequisites are checks on top of that."
 *
 * So a stage declaring no prerequisites at all is still held until the change
 * has actually arrived in the stage ahead of it. Checking only that the
 * previous stage EXISTS would leave such a stage with nothing blocking it, and
 * a Promote the CLI would refuse offered as enabled.
 */
function promotedGate(context: RolloutGateContext): RolloutGate {
  const { stage, previousStageSpaces, progress, changeOrderSlug } = context;
  // Guaranteed non-null: buildGatesForStage returns early otherwise.
  const previousStageId = stage.previousStageId as string;

  if (previousStageSpaces.length === 0) {
    return {
      id: rolloutCopy.gateNames.promoted,
      name: rolloutCopy.gateNames.promoted,
      ok: false,
      evaluated: true,
      reason: rolloutCopy.gateReasons.cubPreviousStageSelectsNothing(stage.id, previousStageId),
    };
  }

  // Where the ChangeOrder has got to is the whole of what this check reads, so
  // without it there is no honest verdict to give: claiming the change has not
  // arrived would refuse a promote that may well be allowed, and claiming it
  // has would wave through one that is not. Same reasoning `releasedGate`
  // applies to the same missing data.
  if (progress.availability === 'unavailable') {
    return {
      id: rolloutCopy.gateNames.promoted,
      name: rolloutCopy.gateNames.promoted,
      ok: false,
      evaluated: false,
      reason: rolloutCopy.gateReasons.unknownProgress,
    };
  }

  for (const space of previousStageSpaces) {
    if (!progress.resolvedSpaceIds.has(space.spaceId)) {
      return {
        id: rolloutCopy.gateNames.promoted,
        name: rolloutCopy.gateNames.promoted,
        ok: false,
        evaluated: true,
        reason: rolloutCopy.gateReasons.cubNotTaken(space.variantName, changeOrderSlug),
      };
    }
  }

  return {
    id: rolloutCopy.gateNames.promoted,
    name: rolloutCopy.gateNames.promoted,
    ok: true,
    evaluated: true,
    reason: rolloutCopy.gateReasons.stagePromotedReason(previousStageId, previousStageSpaces.length),
  };
}

/**
 * `checkSpaceIsHealthy`, per Space of the previous stage, in its order:
 * release target present, then the change taken, then a published Release
 * carrying it, then the live status of the Release the Space is running —
 * reported, Synced, no operation running or failed, Healthy. Reported for the
 * first Space that fails.
 *
 * ⚠️ THE STATUS READ IS THE RUNNING RELEASE'S, NEVER AN OLDER ONE'S. A
 * Release's live status is about that Release. When the newest Release has not
 * been reported on yet, the Space has not been shown healthy, however green the
 * Release before it was: that one is a configuration the Space is no longer
 * running.
 *
 * ⚠️ THE RELEASE TARGET IS ASKED FIRST. `checkSpaceIsHealthy` refuses a
 * targetless Variant before it reads any Release, so a targetless Space reads
 * as not evaluated rather than as failed. Both hold the stage; only one of
 * them is a verdict the server reaches.
 *
 * "A published Release carries the change" is read off `ChangeOrder.Releases`,
 * the entry the server's own gate reads, never off `ReleasedSpaceIDs`: a Space
 * stays released after the Release that released it is withdrawn, and then no
 * published Release carries the change there.
 */
function liveStatusGate(context: RolloutGateContext): RolloutGate {
  const { stage, previousStageSpaces, progress, changeOrderSlug } = context;
  // Guaranteed non-null: buildGatesForStage returns early otherwise.
  const previousStageId = stage.previousStageId as string;

  // Cannot judge a previous stage that is not there at all — same precondition
  // the mandatory `promoted` gate checks, applied here too since this gate
  // reads the same `previousStageSpaces`.
  if (previousStageSpaces.length === 0) {
    return notEvaluated(rolloutCopy.gateNames.healthy, rolloutCopy.gateNames.healthy, previousStageId);
  }

  // Cannot judge what we have not read. Asked before the per-Space loop so an
  // unread Space is told "still reading" rather than "no release target": it
  // carries neither field, and only one of those two sentences is true of it.
  if (anyUnread(previousStageSpaces)) {
    return {
      id: rolloutCopy.gateNames.healthy,
      name: rolloutCopy.gateNames.healthy,
      ok: false,
      evaluated: false,
      reason: rolloutCopy.gateReasons.liveStatusLoading(previousStageId),
    };
  }

  // Whether a Space has taken the change is read off progress, and this gate
  // asks that below. Without progress there is no verdict to give — the same
  // refusal `promotedGate` and `releasedGate` give to the same missing data.
  if (progress.availability === 'unavailable') {
    return {
      id: rolloutCopy.gateNames.healthy,
      name: rolloutCopy.gateNames.healthy,
      ok: false,
      evaluated: false,
      reason: rolloutCopy.gateReasons.unknownProgress,
    };
  }

  for (const space of previousStageSpaces) {
    if (space.releaseTargetId === undefined) {
      return {
        id: rolloutCopy.gateNames.healthy,
        name: rolloutCopy.gateNames.healthy,
        ok: false,
        evaluated: false,
        reason: rolloutCopy.gateReasons.liveStatusTargetless(space.variantName),
      };
    }
    /*
     * The taken-the-change check `evaluatePrerequisites` opens with, which runs
     * over every Space of the previous stage before any prerequisite of the
     * stage being entered.
     * Without it this gate reports `Healthy ✓ satisfied` over a Space that never
     * took the change — a green tick about a workload running something else.
     *
     * ⚠️ NOT EVALUATED, NEVER FAILED, AND THE DIFFERENCE IS THE WHOLE POINT.
     * A STAGE THE CHANGE HAS NOT ENTERED IS NOT EVIDENCE OF ANYTHING: such a
     * Space is running somebody else's configuration, so nothing about its
     * health has been established either way. `cub` agrees literally — it stops
     * at the promoted check and never reaches `checkSpaceIsHealthy` for that
     * Space, so there is no health verdict of its own to report.
     *
     * Reported as a failure instead, this became a verdict the console files
     * under the previous stage and reads as "this rollout is unhealthy": every
     * three-or-more-stage rollout mid-flight — where the stage after next is
     * always quantified over a stage that has not taken the change yet — read
     * `degraded` and lost its Promote button in the ordinary ready case. An
     * unevaluated gate withholds the tick just as effectively and claims
     * nothing about the workload.
     *
     * Asked AFTER the release target, because that is where `cub` stops first:
     * a targetless Space is "health cannot be determined" whatever else is true
     * of it.
     */
    if (!progress.resolvedSpaceIds.has(space.spaceId)) {
      return {
        id: rolloutCopy.gateNames.healthy,
        name: rolloutCopy.gateNames.healthy,
        ok: false,
        evaluated: false,
        reason: rolloutCopy.gateReasons.cubNotTaken(space.variantName, changeOrderSlug),
      };
    }
    const { release } = space;
    if (!progress.carryingReleases.has(space.spaceId) || release === null) {
      return unsatisfiedLiveStatus(
        rolloutCopy.gateReasons.cubNoReleaseCarrying(space.variantName, changeOrderSlug),
      );
    }
    const failure = liveStatusFailure(space.variantName, release);
    if (failure !== null) return unsatisfiedLiveStatus(failure);
  }
  return {
    id: rolloutCopy.gateNames.healthy,
    name: rolloutCopy.gateNames.healthy,
    ok: true,
    evaluated: true,
    reason: rolloutCopy.gateReasons.liveStatusGreen(previousStageId),
  };
}

/**
 * Whether every Space this gate was asked about has actually been read.
 *
 * ⚠️ ASKED ABOUT, NOT PARTITIONED DOWN TO. The guard runs over the whole
 * previous stage, before any per-Space sorting by `releaseTargetId` — because
 * `releaseTargetId` is itself a field off the Space read. An unread Space
 * carries `undefined` there, so it is shaped exactly like a targetless one.
 * Both hold their gate, but for different reasons and with different remedies:
 * one clears itself when the read lands, the other needs a human. Saying the
 * wrong one sends the reader to wait for something that will never arrive.
 */
function anyUnread(spaces: readonly RolloutGateSpaceInput[]): boolean {
  return spaces.some((space) => !space.loaded);
}

/**
 * Why the live status of the Release a Space is running does not show it
 * deployed, or null when it does. The server's order and terms: a Release not
 * reported on yet is a verdict, not an unknown, since the Space has a Target
 * and the Release is published; an operation that has not finished, or failed,
 * is not a deployment; and an absent operation is fine, since not every
 * reporter runs one.
 */
export function liveStatusFailure(variantName: string, release: RunningRelease): string | null {
  const status = release.liveStatus;
  const releaseNum = release.releaseNum;
  if (status === null) return rolloutCopy.gateReasons.cubLiveStatusMissing(variantName, releaseNum);
  if (status.Sync !== 'Synced') {
    return rolloutCopy.gateReasons.cubNotSynced(variantName, releaseNum, status.Sync ?? '');
  }
  if (status.Operation === 'Running') return rolloutCopy.gateReasons.cubStillDeploying(variantName, releaseNum);
  if (status.Operation === 'Failed') return rolloutCopy.gateReasons.cubDeployFailed(variantName, releaseNum);
  if (status.Health !== 'Healthy') {
    return rolloutCopy.gateReasons.cubNotHealthy(variantName, releaseNum, status.Health ?? '');
  }
  return null;
}

function unsatisfiedLiveStatus(reason: string): RolloutGate {
  return {
    id: rolloutCopy.gateNames.healthy,
    name: rolloutCopy.gateNames.healthy,
    ok: false,
    evaluated: true,
    reason,
  };
}

/**
 * The `Released` check in `evaluatePrerequisites`, per Space of the previous
 * stage.
 *
 * Each Space is asked, in `cub`'s order, to have TAKEN the change and then to
 * have RELEASED it. A Space with no release target can never release, so it
 * passes once it has taken the change.
 *
 * The "has taken" test below is ALSO the mandatory `promoted` gate's, and it is
 * repeated here rather than assumed. Every gate of a stage is evaluated on its
 * own, in full, whatever the others returned — nothing skips this one when
 * `promoted` fails — so dropping it would have this gate report "has taken the
 * change but has not released it" about a Space that has not taken it.
 */
function releasedGate(context: RolloutGateContext): RolloutGate {
  const { stage, previousStageSpaces, progress, changeOrderSlug } = context;
  // Guaranteed non-null: buildGatesForStage returns early otherwise.
  const previousStageId = stage.previousStageId as string;

  // Cannot judge a previous stage that is not there at all — same precondition
  // the mandatory `promoted` gate checks, applied here too since this gate
  // reads the same `previousStageSpaces`.
  if (previousStageSpaces.length === 0) {
    return notEvaluated(rolloutCopy.gateNames.released, rolloutCopy.gateNames.released, previousStageId);
  }

  // Cannot be judged at all when the server did not report where the
  // ChangeOrder has got to: absent progress is not the same as no progress,
  // and guessing would mean refusing a promote that is in fact allowed (or
  // worse, allowing one that is not). "Not evaluated" is the only honest
  // answer.
  if (progress.availability === 'unavailable') {
    return {
      id: rolloutCopy.gateNames.released,
      name: rolloutCopy.gateNames.released,
      ok: false,
      evaluated: false,
      reason: rolloutCopy.gateReasons.unknownProgress,
    };
  }

  // Same guard, same reason as `liveStatusGate`: an unread Space carries no
  // `releaseTargetId`, so without this it would be reported as targetless.
  if (anyUnread(previousStageSpaces)) {
    return {
      id: rolloutCopy.gateNames.released,
      name: rolloutCopy.gateNames.released,
      ok: false,
      evaluated: false,
      reason: rolloutCopy.gateReasons.releasedLoading(previousStageId),
    };
  }

  let anyTargetless = false;
  for (const space of previousStageSpaces) {
    if (!progress.resolvedSpaceIds.has(space.spaceId)) {
      return unsatisfiedReleased(
        rolloutCopy.gateReasons.cubNotTaken(space.variantName, changeOrderSlug),
      );
    }
    // A Space with no release target can never release, so taking the change
    // is all this check can ask of it.
    if (space.releaseTargetId === undefined) {
      anyTargetless = true;
      continue;
    }
    if (!progress.releasedSpaceIds.has(space.spaceId)) {
      return unsatisfiedReleased(
        rolloutCopy.gateReasons.cubTakenNotReleased(space.variantName, changeOrderSlug),
      );
    }
  }
  return {
    id: rolloutCopy.gateNames.released,
    name: rolloutCopy.gateNames.released,
    ok: true,
    evaluated: true,
    reason: anyTargetless
      ? rolloutCopy.gateReasons.releasedTargetless(previousStageId)
      : rolloutCopy.gateReasons.upstreamStageReleased(previousStageId),
  };
}

function unsatisfiedReleased(reason: string): RolloutGate {
  return {
    id: rolloutCopy.gateNames.released,
    name: rolloutCopy.gateNames.released,
    ok: false,
    evaluated: true,
    reason,
  };
}

/** A gate whose precondition failed, so it genuinely has not been assessed. */
function notEvaluated(id: string, name: string, previousStageId: string): RolloutGate {
  return {
    id,
    name,
    ok: false,
    evaluated: false,
    reason: rolloutCopy.gateReasons.notEvaluated(previousStageId),
  };
}

/**
 * A stage's gates, with the server's verdicts in place of the ones this page
 * could not reach.
 *
 * `serverGates` is what a dry run of promoting into the stage reported: one
 * result per Space of the previous stage and per prerequisite. Only a gate this
 * page left unevaluated takes the server's answer. One it evaluated stays live
 * with the data it was evaluated from, which is refreshed more often than a dry
 * run is.
 *
 * ⚠️ A PASS NEEDS EVERY SPACE. The server stops at `Promoted` for a Space the
 * change has not reached and evaluates nothing else there, so a prerequisite
 * with no failures can still be unanswered for some Spaces. It is satisfied
 * only when every Space the server reported on satisfied it, and otherwise
 * stays not evaluated. Any failure is a failure, in the server's own words,
 * followed by the author's description of a declared check.
 */
export function applyServerGates(
  gates: RolloutGate[],
  serverGates: readonly PromoteGateResult[] | undefined,
  stage: Pick<RolloutStage, 'previousStageId' | 'isFirst'>,
): RolloutGate[] {
  if (serverGates === undefined || serverGates.length === 0) return gates;
  const reportedSpaces = new Set(serverGates.map((result) => result.SpaceID ?? ''));
  return gates.map((gate) => {
    if (gate.evaluated || gate.prerequisite === undefined) return gate;
    const results = serverGates.filter((result) => result.Prerequisite === gate.prerequisite);
    const failures = results.filter((result) => result.Satisfied !== true);
    if (failures.length > 0) {
      const messages = [
        ...new Set(failures.map((result) => result.Message ?? '').filter((message) => message !== '')),
      ];
      if (messages.length === 0) messages.push(rolloutCopy.promoteHeld.generic);
      if (gate.description !== undefined && gate.description !== '') messages.push(gate.description);
      return { ...gate, ok: false, evaluated: true, reason: messages.join(' ') };
    }
    const satisfiedSpaces = new Set(results.map((result) => result.SpaceID ?? ''));
    if (results.length === 0 || [...reportedSpaces].some((spaceId) => !satisfiedSpaces.has(spaceId))) {
      return gate;
    }
    return {
      ...gate,
      ok: true,
      evaluated: true,
      reason: rolloutCopy.gateReasons.satisfiedOnServer(previousStageDisplayName(stage) ?? ''),
    };
  });
}

/**
 * Count satisfied gates.
 *
 * A gate that has not been evaluated counts as NOT satisfied — it is not a pass.
 * The tally drives both the connector pill and the collapsed step summary, so
 * they cannot disagree about how many gates hold a stage.
 */
export function tallyGates(gates: RolloutGate[]): RolloutGateTally {
  let satisfied = 0;
  for (const gate of gates) {
    if (gate.evaluated && gate.ok) satisfied += 1;
  }
  return { total: gates.length, satisfied };
}

/**
 * How a stage's gates draw: the padlock states every gate surface shares.
 *
 * FOUR, NOT THREE, AND THE FOURTH IS THE POINT. A check that failed and a check
 * nobody made are different claims, and a stage gating on a CEL expression this
 * app cannot evaluate is in the second case for every one of its gates. Drawing
 * that as `held` asserts a refusal nobody issued; drawing it as `open` asserts a
 * pass nobody granted.
 *
 *  - `none`    — no prerequisite at all. Words, no padlock: there is no lock to
 *                draw, and an open one would claim a check that passed rather
 *                than one that never applied.
 *  - `open`    — every gate evaluated, every one satisfied.
 *  - `held`    — at least one gate evaluated and FAILED. A definite refusal
 *                outranks an unknown, so this wins over `unknown` when both are
 *                present: the stage is held whatever else is unresolved.
 *  - `unknown` — nothing failed, but something was never checked. Not clear to
 *                promote, and not refused either.
 */
export type RolloutGateState = 'held' | 'open' | 'none' | 'unknown';

/**
 * The one place this rule is decided, so the surfaces that draw a padlock
 * cannot drift apart on it.
 *
 * TAKES THE GATES, NOT A TALLY. Two integers cannot tell a failure from an
 * unmade check — neither increments `satisfied` — so a summariser given only
 * `satisfied` and `total` has to call both of them the same thing. That is
 * precisely the distinction this state exists to carry, so the gates come in
 * whole.
 */
export function gateStateFor(gates: readonly RolloutGate[]): RolloutGateState {
  if (gates.length === 0) return 'none';
  if (gates.some((gate) => gate.evaluated && !gate.ok)) return 'held';
  if (gates.some((gate) => !gate.evaluated)) return 'unknown';
  return 'open';
}

/**
 * What is holding a stage, split by whether anybody actually checked.
 *
 * `blockingGates` returns failures and unmade checks mixed, in declared order,
 * so quoting `[0]` quotes whichever happens to come first. A CEL custom listed
 * ahead of a failing `Released` makes the screen say "not checked" while the
 * real, known cause goes unmentioned — so the reader acts on a cause that was
 * never the cause.
 *
 * So: both lists, both counts, and a reason drawn from the FAILURES when there
 * are any. A check that failed is the more specific answer, and the more useful
 * one; an unmade check is only the whole story when nothing failed.
 */
export interface BlockingGateReport {
  /** Evaluated and failed: a check was made and the answer was no. */
  failed: RolloutGate[];
  /** Never evaluated: no answer either way. */
  notEvaluated: RolloutGate[];
  /** The gate whose reason best explains the hold, or `undefined` when nothing holds it. */
  principal: RolloutGate | undefined;
}

export function partitionBlockingGates(gates: readonly RolloutGate[]): BlockingGateReport {
  const failed: RolloutGate[] = [];
  const notEvaluated: RolloutGate[] = [];
  for (const gate of gates) {
    if (gate.evaluated && gate.ok) continue;
    (gate.evaluated ? failed : notEvaluated).push(gate);
  }
  return { failed, notEvaluated, principal: failed[0] ?? notEvaluated[0] };
}

/**
 * True when every gate was evaluated and holds. A stage with no gates is open —
 * no declared prerequisite means nothing to wait for. A gate nobody evaluated
 * keeps a stage from reading as ready, though it does not stop a promotion
 * (`gatesBlockPromotion`).
 */
export function gatesOpen(gates: RolloutGate[]): boolean {
  return gates.every((gate) => gate.evaluated && gate.ok);
}

/** Gates actively holding the stage, for the footer's "N gates hold it" clause. */
export function blockingGateCount(gates: RolloutGate[]): number {
  return blockingGates(gates).length;
}

/**
 * The gates actually holding a stage back.
 *
 * Returned in full rather than counted, so a caller can say WHY a stage is
 * blocked in the gate's own words instead of guessing at the cause. Guessing is
 * how the footer came to tell people to "promote dev first" when dev had already
 * been promoted and the real blocker was an unhealthy Space.
 */
export function blockingGates(gates: RolloutGate[]): RolloutGate[] {
  return gates.filter((gate) => !(gate.evaluated && gate.ok));
}
