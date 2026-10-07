// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One ChangeOrder plus the org's Spaces, reduced to a console row.
 *
 * Pure. No hooks, no queries — everything here is a function of its arguments,
 * so the whole table is derivable from two org-wide reads
 * (`docs/specs/rollouts-page-plan.md` §1.3).
 *
 * REUSES THE SHIPPED ROLLOUT MODULE RATHER THAN RE-DERIVING. Stage sequencing,
 * gate evaluation and stage state already exist in `../x/apps/rollout` and are
 * the same logic the per-component view runs. Duplicating them here would mean
 * two implementations that can disagree about whether a promotion is allowed,
 * which is exactly the failure the CLI-verbatim gate wording exists to prevent.
 *
 * TWO DECISIONS THAT DEPART FROM THE REFERENCE DESIGN, both because the design
 * assumes something the data model does not provide:
 *
 *  1. STAGES ARE PER-ROLLOUT, NOT A FIXED GLOBAL FOUR. `3-orders-console.html`
 *     hardcodes `base / dev / staging / prod` as four segments on every row.
 *     A rollout's stages are whatever its own governing ChangeWorkflow Unit
 *     declares, in the order that definition declares them, so two rollouts can
 *     legitimately have different stages and different counts. The strip
 *     therefore renders each rollout's own sequence at whatever length that is.
 *
 *  2. STAGE MEMBERSHIP IS THE WORKFLOW'S AND THE CHANGEORDER'S ANSWER, NOT
 *     THIS FILE'S. Each stage's `whereSpace` is resolved server-side
 *     (`useDistinctStageSpaces`) and narrowed to the ChangeOrder's
 *     `InScopeSpaceIDs` (`changeOrderStageMembers`), as the server's promote
 *     does, and this file only reads the result.
 *     `allSpaces` is a DISPLAY index — slug, live status, release target — never
 *     a membership test. A rollout whose ChangeWorkflow cannot be resolved is
 *     reported as such rather than given a sequence assembled from labels,
 *     which is how unrelated rollouts used to end up gating against each other.
 */

import type { ChangeOrderRelease, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';

import { ROUTE_COMPONENTS } from '../appTypes';
import type { RunningRelease } from '../liveStatus';
import { changeOrderStageMembers, stageWhereSpace, type ChangeOrderWorkflow } from './changeOrderWorkflow';
import { rolloutCopy } from './rolloutCopy';
import { applyServerGates, buildGatesForStage, gatesOpen } from './rolloutGates';
import type { ServerGatesByStage } from './useServerStageGates';
import type { RolloutGateSpaceInput } from './rolloutGates';
import { reportedHealthOf } from './rolloutReportedHealth';
import { rollbackScope } from './rolloutRollback';
import type {
  GateVerdictChannel,
  HealthAnswerFields,
  MustNotCarry,
  ReportedHealthChannel,
  ReportedHealthSpaceInput,
} from './rolloutReportedHealth';
import { buildRolloutSequence, previousStageOf, promotionTargets } from './rolloutStages';
import {
  deriveProgress,
  deriveStageState,
  finalStageGates,
  hasTakenChange,
  nextStageIndexFromChangeOrderStage,
  nextStageIndexFromProgress,
} from './rolloutState';
import type { RolloutCompletionInput } from './rolloutState';
import type { RolloutGate, RolloutProgress, RolloutStage, RolloutStageState } from './rolloutTypes';
import { rolloutsConsoleCopy } from './rolloutsConsoleCopy';

/**
 * The console states: five live ones, one terminal-by-user-action, two honest
 * "there is nothing to promote" ones, and a last one for "the server did not
 * say".
 *
 * `no-workflow` and `no-stages` are deliberately distinct. `no-workflow` means
 * no ChangeWorkflow governs this ChangeOrder at all — `stagelessRow` returns it
 * before `deriveConsoleState` below is ever called. `no-stages` means a
 * ChangeWorkflow WAS resolved but its declared stages resolve to zero
 * promotable ones — `deriveConsoleState`'s own `promotable.length === 0` case.
 * Collapsing the two into 'complete' is the bug this state exists to prevent:
 * a rollout that never had anywhere to go read identically to one that
 * finished, and only the second is actually true.
 */
export type ConsoleState =
  | 'ready'
  | 'degraded'
  | 'blocked'
  /**
   * The stage being entered is held by a gate that is not a Release: a custom
   * or unrecognised prerequisite, an unevaluated check, or a previous stage
   * that selects no Space. Apart from `blocked` so that "needs a Release" is
   * said only when a Release is what is missing.
   */
  | 'held'
  | 'progressing'
  | 'complete'
  /**
   * The workflow is done and nobody checked the last stage's health. `Final` is
   * optional and declaring none is not a health verdict, so the rollout is
   * finished in exactly the sense `cub changeorder get` means and unverified in
   * the sense a reader looking at production means.
   */
  | 'complete-unverified'
  | 'aborted'
  | 'no-workflow'
  | 'no-stages'
  | 'unknown';

/**
 * The row's state as the GATE channel alone reaches it — `cub`'s question,
 * answered by `rolloutGates.ts` and by nothing else.
 *
 * ⚠️ THE DISPLAY INFORMS, THE GATE DECIDES. `ConsoleRow.state` is a DISPLAY
 * answer: `deriveConsoleState` lets a stage's reported live status outrank the
 * gates, so a rollout whose previous stage reports Degraded reads 'degraded'
 * however open its gates are. That is right for a chip and wrong for a button.
 * A workflow declaring no health prerequisite is promoted by `cub` over a
 * Degraded previous stage — there is nothing to check — so a UI reading the
 * display answer withdrew Promote from a correct action. Over-strictness is a
 * real defect here: a UI that refuses correct actions teaches operators to
 * distrust it.
 *
 * SO THE ACTION READS THIS INSTEAD, and it is an object rather than a bare
 * `ConsoleState` for one reason: `actionFor(row.state)` then does not compile.
 * The mistake this type exists to stop is a string being taken from the
 * display answer and handed to the action path, and two identical string
 * unions cannot stop it. `MustNotCarry` is the second half — a future edit that
 * puts a health answer's own fields on this object makes the alias `never` and
 * every construction of it fails to build.
 */
export type GateChannelState = MustNotCarry<
  {
    /** Which channel decided this, visible at every call site. */
    readonly channel: 'gate-verdict';
    readonly state: ConsoleState;
  },
  HealthAnswerFields
>;

export interface ConsoleSpace {
  spaceId: string;
  slug: string;
  displayName?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  releaseTargetId?: string;
  /**
   * The Release the Space is running, with its live status: `null` when it
   * runs none, `undefined` while its Releases have not been read. A Space with
   * no release Target runs none, and needs no read to say so.
   */
  release?: RunningRelease | null;
  /** The Component the Space's ComponentID names. */
  component?: ComponentRead;
}

/**
 * Whether everything the gates read about a Space has arrived: the Space, and
 * for one with a release Target, which Release it is running.
 */
export function consoleSpaceLoaded(space: ConsoleSpace | undefined): boolean {
  if (space === undefined) return false;
  return space.releaseTargetId === undefined || space.release !== undefined;
}

export interface ConsoleChangeOrder {
  changeOrderId: string;
  slug: string;
  displayName?: string;
  spaceId?: string;
  spaceSlug?: string;
  createdAt?: string;
  /** Exactly as it arrived. `undefined` is meaningful — see `deriveProgress`. */
  resolvedSpaceIds?: string[];
  releasedSpaceIds?: string[];
  /**
   * Where the change has since been taken back out, and where that undoing has
   * been released. Read BEFORE the two above wherever a Space or stage is
   * given a verdict — a restore leaves both of those marks in place.
   */
  restoredSpaceIds?: string[];
  releasedRestoredSpaceIds?: string[];
  /** ChangeOrder.Releases: the published Release that released the change in each Space. */
  releases?: ChangeOrderRelease[];
  /**
   * Where this ChangeOrder is headed, which is the third term of stage
   * membership — see `buildRolloutSequence`. Not part of progress: it is what
   * progress is measured against.
   */
  inScopeSpaceIds?: string[];
  /** The ChangeOrder's own annotations, passed through whole. */
  annotations?: Record<string, string>;
  /**
   * What the ChangeOrder says about the workflow governing it, read off its
   * own frozen copy (`changeOrderWorkflow`). Carried on the row rather than
   * resolved per row: the copy arrives with the order, so there is nothing to
   * fetch and nothing to deduplicate across rows.
   */
  governing: ChangeOrderWorkflow;
  /** Non-empty IS the aborted state — mirrors `ChangeOrder.AbortedReason` verbatim. */
  abortedReason?: string;
  /**
   * `ChangeOrder.Stage` — the last stage the server has recorded the change as
   * reaching, or `Completed`. Absent until the first stage is reached.
   */
  stage?: string;
  /**
   * `ChangeOrder.State`, verbatim: New, InProgress, Resolved, Released,
   * Restored, RestoreReleased or Aborted. The server derives it on each read
   * from where the change has been taken and released, so it is current even
   * when `stage` lags behind.
   */
  state?: string;
  /**
   * `ChangeOrder.RestoreTagID` — the Tag marking the Revisions that undid this
   * change. Empty until something has been restored, and it is the server's own
   * test for the one thing an abort cannot be taken back from
   * (`validateChangeOrderFields`). See `rolloutIntents`.
   */
  restoreTagId?: string;
  /**
   * `ChangeOrder.StartTagID` — the Tag marking each Unit's Revision as it stood
   * BEFORE the change. It is what says which Units of a Space this rollout
   * covers, and so what a rollback restores there (`demoteMarkedUnits`,
   * public/cmd/cub/variant_demote.go). Carried on the row because the rollback
   * is issued from surfaces that hold a row and no ChangeOrder.
   */
  startTagId?: string;
}

/**
 * The strip segment's visual treatment, one step finer than `state.verdict`.
 *
 * Computed with the exact same gate reads as `deriveConsoleState` (below), so
 * a segment can never show "ready" on a stage the row itself calls "blocked"
 * — the self-contradiction a past regression already introduced once at the
 * row level (see `deriveConsoleState`'s comment on ordering).
 */
export type SegmentTone =
  | 'done'
  | 'ready'
  | 'progressing'
  | 'degraded'
  | 'blocked'
  | 'gated'
  /**
   * The change landed here and nothing checked whether it is healthy. Only ever
   * the last stage: every earlier one was vouched for by the promotion out of
   * it. Distinct from `done`, which claims a green workload, and from
   * `degraded`, which claims a failing one. Never on a complete rollout, which
   * draws every step done and says "Complete, unverified" in words instead.
   */
  | 'unverified'
  /** The change reached this stage and was taken back out of it again. */
  | 'restored';

export interface ConsoleStage {
  stageId: string;
  /** The Space slugs this stage resolves to. */
  spaceSlugs: string[];
  /** The SpaceIDs this stage resolves to — `viewerPositionIn`'s membership test. */
  spaceIds: string[];
  state: RolloutStageState;
  gates: RolloutGate[];
  isSource: boolean;
  segmentTone: SegmentTone;
  /**
   * Whether ANY Space this stage would be promoted INTO can publish a Release
   * at all, i.e. carries a `ReleaseTargetID`.
   *
   * It decides whether "Promote and release" is a second real path or the same
   * action with a step that always no-ops. `rolloutGates.ts`'s `releasedGate`
   * reads this exact field for the same reason on the PREVIOUS stage's side of
   * a gate check; this asks it of the stage being promoted into.
   *
   * Measured over `promotionTargets`, not over stage membership: the
   * ChangeOrder's own Space is skipped by the promote, so a base Space with a
   * Target would otherwise promise a release into somewhere nothing is written.
   */
  hasReleaseTargets: boolean;
}

export interface ConsoleRow {
  changeOrderId: string;
  slug: string;
  /**
   * The workflow this rollout was created under, or `undefined` when nothing
   * governs it. Provenance rather than a reference — no foreign key backs it —
   * so it is what rollouts are grouped by, and a name for it is looked up
   * separately and may not be there (`useChangeWorkflowNames`).
   */
  changeWorkflowId?: string;
  spaceId?: string;
  spaceSlug?: string;
  createdAt?: string;
  /**
   * The base Space's `Component` label, i.e. the app this rollout belongs to
   * in the per-component view. `undefined` when the base Space carries no
   * such label — a fleet-wide rollout is not required to have one, and there
   * is then no per-component page to link to.
   */
  appName?: string;

  state: ConsoleState;
  /**
   * The same reading with the reported-health channel withheld — what the GATE
   * channel alone says, and the only thing `actionFor` is allowed to read. See
   * `GateChannelState`.
   */
  gateState: GateChannelState;
  /** One short sentence naming what is holding this up, or that nothing is. */
  blocker: string;
  /** '' when not aborted; non-empty IS the aborted state. Normalized from `ConsoleChangeOrder.abortedReason`. */
  abortedReason: string;
  stages: ConsoleStage[];
  /**
   * The steps of the promotion path the rollout has passed. Steps are counted
   * in path order, so step `i` (a stage, or the Complete step at
   * `stages.length`) is passed exactly when `i < stagesDone`. See
   * `stagePathProgress`.
   */
  stagesDone: number;
  /** Every step of the promotion path: the source, each declared stage, and Complete. */
  stagesTotal: number;
  nextStageId: string | null;
  /** True when the server did not return the derived propagation fields. */
  progressUnavailable: boolean;
  /** The derived progress this row was built from — lets a viewer ask about one Space. */
  progress: RolloutProgress;
  /**
   * The server's completion reading, carried apart from `state`: `Stage` is
   * `Completed`, or `State` is Released or RestoreReleased — the finished
   * readings of `IsFinished` (internal/models/changeorder.go) other than
   * Aborted, which `abortedReason` carries.
   */
  workflowComplete: boolean;
  /**
   * Something has been taken back out of this rollout — `RestoreTagID` is set.
   * The one state an abort cannot be reversed from, and therefore the only
   * thing both of `rolloutIntents`' answers bar.
   */
  restored: boolean;
  /** `ChangeOrder.StartTagID`, passed through — see `ConsoleChangeOrder`. */
  startTagId?: string;
}

/**
 * What the reader can do to this row.
 *
 * These three labels are contracted: `control-inventory` asserts
 * `button::Promote`, `button::Open` and `button::Resolve` by
 * `role::accessible name`. They are capitalised because that is the contracted
 * name — the user's ruling bans `text-transform: uppercase`, not the initial
 * capital of a control's own label.
 *
 * ⚠️ READS `gateState`, NEVER `state`. What a reader may DO follows the gates
 * and only the gates; what the row SAYS may additionally follow the reported
 * live status. So a row can legitimately show a Degraded chip, name the
 * unhealthy Space in its Blocker cell, and still offer Promote — because the
 * workflow declared no health prerequisite there and `cub` promotes it. The
 * blocker sentence says so in words (`degradedButUngated`). Withdrawing the
 * action instead would be the page refusing a correct promotion.
 *
 * `Promote` is offered ONLY on a gate reading of `ready`. Every other reading
 * has something to resolve first, and a Promote button on a gate-blocked row is
 * an invitation to an action the gates will refuse — which teaches the reader
 * to distrust the button rather than to read the row.
 *
 * Lives beside the row derivation rather than in the console component: what a
 * row offers has to follow from what the row says, and the two drifting apart
 * is how a finished-looking row came to offer nothing over a Space that never
 * took the change.
 */
export function actionFor(
  row: Pick<ConsoleRow, 'gateState' | 'nextStageId'>,
): { label: 'Promote' | 'Resolve' | 'Open'; primary: boolean } {
  const state = row.gateState.state;
  if (state === 'ready') return { label: 'Promote', primary: true };
  if (state === 'blocked' || state === 'held' || state === 'degraded' || state === 'no-stages') {
    return { label: 'Resolve', primary: false };
  }
  /*
   * Finished, and a stage still names a Space the change never reached — the
   * shape a Space added to an earlier stage after the rollout ran produces. The
   * chip stays `cub`'s answer; the OFFER follows the row's own strip, which is
   * showing that stage as unfinished. `Open` would be the row saying there is
   * nothing to do beside its own evidence that there is.
   *
   * ⚠️ DECLARED DIVERGENCE FROM `cub`, AND THE ONLY ONE. The server's promotion
   * refuses this outright: `refuseCompletedWorkflow` is checked before any stage
   * is chosen, and the answer is "has completed ChangeWorkflow '%s', so there is
   * nothing left to promote" (internal/views/promote_gates.go). This page
   * offers `Resolve` and performs the clone+upgrade itself.
   *
   * Deliberate. Completion is read off the LAST stage, so a Space added to an
   * earlier stage afterwards leaves a real Space running the old configuration
   * with no way to reach it: the CLI's refusal is about the workflow being
   * finished, not about that Space being fine. The UI can name the stage that
   * was left behind, so it offers the repair rather than the refusal.
   *
   * It is a divergence all the same, and it stays a declared one. Everything
   * else here is a port — if the CLI ever offers this repair, this comment goes
   * and the two agree again; if this behaviour is ever challenged, it is the
   * CLI's refusal that has to be argued with, not this comment.
   */
  if ((state === 'complete' || state === 'complete-unverified') && row.nextStageId !== null) {
    return { label: 'Resolve', primary: false };
  }
  return { label: 'Open', primary: false };
}

/**
 * What promoting THIS row would do, or `null` when there is nothing to promote.
 *
 * ONE DERIVATION FOR EVERY SURFACE THAT PROMOTES FROM A ROW. The detail page
 * asks the same four questions of a stage it holds in full — which Spaces the
 * write lands in, what holds it, whether "and release" is a real second path —
 * and a console row holds every fact needed to answer them without a second
 * fetch. Deriving them at the call site instead is how one screen came to offer
 * an action another refuses over the same ChangeOrder.
 *
 * `null` for a rollout with nowhere to go: no next stage, or a next stage the
 * sequence no longer carries. Not an empty target list, which is a DIFFERENT
 * answer — a stage whose only Space is the ChangeOrder's own is a promote with
 * nothing to write, and `promotePrecheck` reports that as having done nothing
 * rather than as a success.
 */
export interface RolloutPromotion {
  stageId: string;
  /** The Spaces the promote WRITES INTO — stage membership minus the ChangeOrder's own Space. */
  spaceIds: string[];
  /** The stage's entry gates, for the caller to partition and quote. */
  gates: RolloutGate[];
  /** Whether "Promote and release" is a real second path here — see `ConsoleStage`. */
  canRelease: boolean;
}

export function promotionFor(
  row: Pick<ConsoleRow, 'stages' | 'nextStageId' | 'spaceId'>,
): RolloutPromotion | null {
  if (row.nextStageId === null) return null;
  const stage = row.stages.find((candidate) => candidate.stageId === row.nextStageId);
  if (stage === undefined) return null;
  return {
    stageId: stage.stageId,
    spaceIds: promotionTargets(stage.spaceIds, row.spaceId),
    gates: stage.gates,
    canRelease: stage.hasReleaseTargets,
  };
}

/**
 * What a reader may do to end this rollout.
 *
 * ONE FUNCTION, BECAUSE THE ANSWER IS A RULE AND NOT A CHIP COLOUR. Every
 * surface that offers to end a rollout reads this and only this, so none can
 * gate its own control independently and offer what another has withdrawn.
 *
 * TWO INTENTS, AND THEY ARE NOT THE SAME ACTION.
 *
 *  - `abort` — set `AbortedReason` and stop there. A decision; it moves nothing.
 *    Barred only by the rollout already being aborted (there is nothing to decide
 *    twice) and by a restore.
 *  - `rollBack` — abort, then take the change back out of every Space that took
 *    it. Offered on an ALREADY-ABORTED rollout, because that is the CLI's own
 *    order of operations: `cub variant demote` REQUIRES an `AbortedReason` and
 *    refuses without one. Withdrawing it there would make "Abort" a trap that
 *    locks the reader out of the rollback.
 *
 * THE RESTORED BAR, WHICH IS BOTH INTENTS'. Setting `AbortedReason` is
 * otherwise reversible — clearing it "is what puts it back on its way, so it is
 * writable at almost any point in a ChangeOrder's life"
 * (`validateChangeOrderFields`, internal/views/changeorder.go) — and the server
 * refuses the clearing in exactly one case, a ChangeOrder something has been
 * restored of, which is `RestoreTagID != uuid.Nil`. Read from the Tag rather
 * than from `RestoredSpaceIDs`, which is a projection of it: the server's own
 * test is on the Tag.
 *
 * ⚠️ COMPLETION IS NOT A BAR. The server permits abort in every state
 * including Released (`internal/models/changeorder.go`), and the CLI demotes
 * a finished rollout as readily as an in-flight one — demote touches only the
 * Spaces carrying the start tag, so a half-promoted rollout rolls back
 * exactly the Spaces that took it. Rolling back a finished release is the
 * designed case for these controls, not an edge case: without it, undoing a
 * landed release would have no entry point in the UI at all.
 *
 * ⚠️ `rollBack` ALSO REQUIRES A KNOWN SCOPE. Which Spaces to restore is
 * `ResolvedSpaceIDs` minus `RestoredSpaceIDs`, and the server answers 200 with
 * those fields ABSENT when it could not derive them (`RolloutProgressAvailability`).
 * A rollback run over a set derived from silence would restore nothing and say
 * it had rolled the change back — so an unavailable scope withdraws the
 * destructive control and leaves "Abort", which needs no scope.
 */
export interface RolloutIntents {
  rollBack: boolean;
  abort: boolean;
}

export function rolloutIntents(
  row: Pick<ConsoleRow, 'abortedReason' | 'restored' | 'progress'>,
): RolloutIntents {
  if (row.restored) return { rollBack: false, abort: false };
  return {
    rollBack: rollbackScope(row.progress).kind === 'spaces',
    abort: row.abortedReason === '',
  };
}

/**
 * "Abort" alone, named for the surfaces and tests that ask only about it. A
 * projection of `rolloutIntents`, never a second copy of the rule.
 */
export function canAbortRollout(
  row: Pick<ConsoleRow, 'abortedReason' | 'restored' | 'progress'>,
): boolean {
  return rolloutIntents(row).abort;
}

/**
 * The component this rollout belongs to: the `Component` label of the Space the
 * ChangeOrder lives in — its base. `undefined` when that Space carries no such
 * label or is not in the index, which a fleet-wide rollout is not required to
 * have.
 *
 * Display only: the row's `appName` and its deep link. It plays no part in
 * which Spaces a stage selects — that is the stage's selector and the
 * ChangeOrder's `InScopeSpaceIDs` — so a rollout whose base has no Component
 * still has stages.
 */
export function orderComponent(
  order: Pick<ConsoleChangeOrder, 'spaceId'>,
  bySpaceId: ReadonlyMap<string, ConsoleSpace>,
): ComponentRead | undefined {
  if (order.spaceId === undefined) return undefined;
  return bySpaceId.get(order.spaceId)?.component;
}

/**
 * What the gates need to know about one Space of the previous stage.
 *
 * Takes the Space ID and, separately, whatever the display index holds for it —
 * which may be nothing. Stage membership comes from the workflow's own
 * server-side `whereSpace` query, so it can name a Space the caller's list does
 * not cover (the component tab passes one component's Spaces, not the org's).
 * Dropping such a Space would shrink the previous stage and fail the mandatory
 * `promoted` gate with "selects no Space", which is not true. `loaded: false`
 * is the state `rolloutGates.ts` provides for exactly this: judged as unread,
 * not as absent.
 */
function gateSpaceInput(spaceId: string, space: ConsoleSpace | undefined): RolloutGateSpaceInput {
  return {
    spaceId,
    loaded: consoleSpaceLoaded(space),
    variantName: space?.displayName ?? space?.slug ?? spaceId,
    release: space?.release ?? null,
    releaseTargetId: space?.releaseTargetId,
  };
}

/**
 * Which stages this row's state may be derived from, as ARRAY POSITIONS.
 *
 * ONLY THE STAGES THE CHANGE HAS REACHED, PLUS THE ONE IT IS TRYING TO ENTER.
 * This is not a refinement, it is a correctness fix: every stage beyond the
 * next one fails its `check/released` gate *by definition*, because its
 * upstream has not been promoted yet. That is the normal mid-rollout condition,
 * not an exception. Scanning the whole sequence for that gate therefore
 * reported almost every multi-stage rollout as "Unreleased changes", and made
 * "Ready to Promote" reachable only when the next stage happened to be the
 * last one.
 *
 * `deriveBlocker` reads the same set, deliberately. When it did not, a row
 * could render "No blocker." and "Unreleased changes" side by side — the two
 * functions disagreeing in the same sentence.
 */
function relevantStageIndices(
  stageStates: readonly RolloutStageState[],
  nextStageIndex: number,
): number[] {
  const indices = new Set(reachedStageIndices(stageStates));
  if (nextStageIndex !== -1) indices.add(nextStageIndex);
  return [...indices].sort((a, b) => a - b);
}

/**
 * The positions of the stages the change is actually IN — where a live workload
 * is running this change and its reported status is therefore about this
 * rollout.
 *
 * A stage the change has NOT reached is deliberately absent. Its workload is
 * running somebody else's change, and a red one there says nothing about this
 * rollout — it would turn every row queued behind an unrelated outage into a
 * failure of its own. `in-progress` is admitted because the change IS in such a
 * stage; which of its Spaces have taken it is settled per Space, by
 * `reportedHealthOf`, not by admitting or excluding the whole stage.
 *
 * ⚠️ THE SOURCE ROW IS NOT ONE OF THEM. The base holds the change, but `cub`
 * never evaluates it for any stage — `validateStageEntryGates` quantifies over
 * a previous STAGE, and the base is not one. Admitting it let the base Space's
 * own live status withdraw Promote at every stage of every rollout: a degraded
 * base with dev promoted and prod ready read `degraded`, offering Resolve
 * instead of the promotion the CLI would have allowed. A gate that refuses
 * correct actions daily is a gate operators learn to disbelieve without reading.
 * The base's own segment still draws what the base reports — that is the
 * display channel doing its job — but the ROW's verdict is about promotion, and
 * promotion never asks the base.
 */
function reachedStageIndices(stages: readonly RolloutStageState[]): number[] {
  const indices: number[] = [];
  stages.forEach((stage, i) => {
    if (
      stage.verdict === 'promoted' ||
      stage.verdict === 'released' ||
      stage.verdict === 'in-progress'
    ) {
      indices.push(i);
    }
  });
  return indices;
}

const gateFailing = (gates: RolloutGate[], id: string) =>
  gates.some((g) => g.id === id && g.evaluated && !g.ok);

/**
 * The failing health gate on a stage the change has REACHED, or null — the one
 * derivation of "this rollout is unhealthy".
 *
 * ⚠️ THE GATE IS IDENTIFIED BY `rolloutCopy.gateNames`, NEVER BY A LITERAL.
 * These are plain string comparisons against a `string`-typed `gate.id`, so a
 * renamed gate id costs no compile error and simply stops matching — every
 * degraded and blocked rollout on the page silently reads as healthier than it
 * is, which is the worst possible direction for this particular mistake.
 *
 * Extracted so the row's state and the row's blocker text are the SAME read
 * rather than two scans that can drift apart: that is the fault
 * `relevantStages` above already records once, where a row rendered
 * "No blocker." beside "Unreleased changes". Both callers pass identical
 * arguments and the `promotable` filter lives in here, so there is no shape
 * left for them to disagree on.
 *
 * IT READS THE ATTRIBUTION MAP, NEVER `stage.gates`. A stage's own gates are
 * built from the stage BEFORE it, so a health verdict found there is about the
 * predecessor. Scanning `stage.gates` therefore asked "is the stage behind this
 * one unhealthy" while the answer was filed under this one — which is how a row
 * came to read `blocked` on a final prerequisite while the strip drew the very
 * stage those prerequisites are about as `done`. `healthByStage` files each
 * verdict under the stage whose Spaces produced it, so both read the same
 * answer about the same stage.
 */
function failingLiveStatusGate(
  stageStates: readonly RolloutStageState[],
  nextStageIndex: number,
  healthByStageIndex: readonly (GateVerdictChannel | undefined)[],
): GateVerdictChannel | null {
  for (const i of relevantStageIndices(stageStates, nextStageIndex)) {
    const gate = healthByStageIndex[i];
    if (gate !== undefined && gate.evaluated && !gate.ok) return gate;
  }
  return null;
}

/**
 * The reported status of a stage the change has REACHED, when it is failing.
 *
 * THE SECOND CHANNEL, AND THE WHOLE REASON THERE ARE TWO. `failingLiveStatusGate`
 * above answers "did a check `cub` makes come back no", and it cannot answer
 * anything about a Space `cub` refuses to check at all: a Space whose gate is
 * `evaluated: false` there can still be reporting Degraded.
 *
 * This reads the live status itself, per stage, and is never consulted about
 * whether a promotion may proceed — see `rolloutReportedHealth.ts`.
 */
function failingReportedHealth(
  stageStates: readonly RolloutStageState[],
  reportedByStageIndex: readonly ReportedHealthChannel[],
): ReportedHealthChannel | null {
  for (const i of reachedStageIndices(stageStates)) {
    const report = reportedByStageIndex[i];
    if (report !== undefined && report.reported === 'failing') return report;
  }
  return null;
}

/**
 * The one sentence explaining an unhealthy rollout, or null when none is.
 *
 * BOTH CHANNELS, ONE ANSWER, ONE READ. The row's state and the row's blocker
 * text are taken from this same function for the same reason they already share
 * `failingLiveStatusGate`: two scans drift, and a row that drifted once printed
 * "No blocker." beside "Unreleased changes".
 *
 * The gate verdict is quoted first where there is one. It is the more specific
 * answer — `cub` reached it, and the reader will meet the same wording if they
 * run the CLI — and the reported status is the whole story only when no check
 * could be made.
 */
function degradedReason(
  stageStates: readonly RolloutStageState[],
  nextStageIndex: number,
  healthByStageIndex: readonly (GateVerdictChannel | undefined)[],
  reportedByStageIndex: readonly ReportedHealthChannel[],
): string | null {
  const gate = failingLiveStatusGate(stageStates, nextStageIndex, healthByStageIndex);
  if (gate !== null) return gate.reason;
  return failingReportedHealth(stageStates, reportedByStageIndex)?.reason ?? null;
}

/**
 * What the report needs to know about one Space, which is what the gates need
 * plus the one fact that decides whether its live status is evidence at all.
 */
function reportedSpaceInput(
  spaceId: string,
  space: ConsoleSpace | undefined,
  progress: RolloutProgress,
  baseSpaceId: string | undefined,
): ReportedHealthSpaceInput {
  return {
    loaded: consoleSpaceLoaded(space),
    variantName: space?.displayName ?? space?.slug ?? spaceId,
    liveStatus: space?.release?.liveStatus ?? null,
    /*
     * ⚠️ THE CHANGEORDER'S OWN SPACE IS NEVER EVIDENCE, IN ANY STAGE.
     *
     * `hasTakenChange` answers true for the base by definition — it is where
     * the change was made — but a promotion never asks the base anything.
     * `cub`'s loop skips it outright (`variant.SpaceID == changeOrder.SpaceID
     * … continue`, public/cmd/cub/variant_promote.go), so no verdict it
     * reaches is ever about the base's workload.
     *
     * `reachedStageIndices` already keeps the SOURCE row out of this channel's
     * reach by verdict. That guard does nothing once a real stage's selector
     * covers the base — the ordinary `whole-component` shape, where the base is
     * a member of a real, reached stage — and the base's own live status then
     * travels `failingReportedHealth` → `degradedReason` →
     * `deriveConsoleState` → `actionFor` and withdraws Promote from a promotion
     * `cub` performs.
     *
     * Otherwise the shipped predicate, never a re-derivation from the stage
     * verdict: a stage is `in-progress` precisely when some of its Spaces have
     * taken the change and some have not, so the whole stage cannot answer this.
     */
    taken: spaceId !== baseSpaceId && hasTakenChange(progress, spaceId),
  };
}

/**
 * Each stage's reported status, BY ARRAY POSITION — one entry per stage of the
 * sequence, in sequence order.
 *
 * Unlike `healthByStage` below there is no hop to account for: a stage's Spaces
 * report on that stage and on nothing else. That is exactly why this channel
 * covers the last stage and the source stage as readily as any other, where the
 * gate channel can only ever speak about the stage behind the one being entered.
 *
 * ⚠️ POSITION, NEVER `stage.id`. Stage names are the ChangeWorkflow author's to
 * choose and `__rollout_source__` is one the server accepts, so a map keyed by
 * name let a declared stage overwrite the synthetic source row's entry — the
 * same sentinel collision `previousStageOf` and `isFirst` already key by index
 * to avoid, re-opened in this channel. With it, an unreached stage's Degraded
 * report was read as the base's and withdrew Promote from a healthy rollout,
 * and the base's own failure was overwritten and drawn green.
 */
function reportedHealthByStage(
  stages: readonly RolloutStage[],
  bySpaceId: ReadonlyMap<string, ConsoleSpace>,
  progress: RolloutProgress,
  baseSpaceId: string | undefined,
): ReportedHealthChannel[] {
  // The same per-Space facts the gates read. One Space has one live status;
  // what differs between the channels is the question asked of it.
  //
  // ⚠️ THE BASE IS WITHHELD FROM REAL STAGES AND FROM THOSE ONLY. Its own
  // segment is the one place its report is the subject rather than evidence —
  // a statement about the Space the change was authored in, which is what the
  // display channel exists to make — and `reachedStageIndices` already keeps
  // the source row out of the row's verdict. Inside a real stage the same
  // status IS read as evidence about a promotion, and that is the reach
  // `reportedSpaceInput` refuses.
  return stages.map((stage) =>
    reportedHealthOf(
      stage.spaceIds.map((id) =>
        reportedSpaceInput(id, bySpaceId.get(id), progress, stage.isSource ? undefined : baseSpaceId),
      ),
    ),
  );
}

/**
 * Each health verdict, filed under the stage it is ABOUT.
 *
 * ⚠️ A STAGE'S GATES ARE NOT ABOUT THAT STAGE. Every entry gate quantifies over
 * the Spaces of the stage AHEAD of the one being entered, so the `check/healthy`
 * sitting in `prod`'s gates reports on `staging`. Anything drawing `prod` from
 * `prod.gates` draws the wrong workload's health, and the row and its own strip
 * then contradict each other on screen.
 *
 * `Final` is the one verdict with no hop behind it: it is evaluated over the
 * last stage's own Spaces, so it is filed under that stage. Without it the last
 * stage — production, in every workflow that has one — appears in no gate at
 * all, which is exactly the hole `deriveConsoleState` refuses to paper over.
 *
 * A stage absent from the map has not been health-checked by anything the
 * workflow declared. That is a third answer, distinct from pass and from fail,
 * and callers must keep it distinct: `undefined` is not a pass.
 */
function healthByStage(
  stages: readonly RolloutStage[],
  stageStates: readonly RolloutStageState[],
  finalGates: readonly RolloutGate[] | null,
): (GateVerdictChannel | undefined)[] {
  const byStageIndex: (GateVerdictChannel | undefined)[] = stages.map(() => undefined);
  stages.forEach((stage, i) => {
    // The source row is nobody's subject and carries no gates of its own. Every
    // other stage's gates are about the row one position behind it — the same
    // hop `previousStageOf` makes, made the same way, by position.
    if (stage.isSource) return;
    const gate = stageStates[i].gates.find((g) => g.id === rolloutCopy.gateNames.healthy);
    if (gate !== undefined) byStageIndex[i - 1] = gate;
  });

  const lastStageIndex = lastPromotableStageIndex(stages);
  const finalHealth = finalGates?.find((g) => g.id === rolloutCopy.gateNames.healthy);
  if (lastStageIndex !== -1 && finalHealth !== undefined) byStageIndex[lastStageIndex] = finalHealth;
  return byStageIndex;
}

/**
 * The position of the stage `Final` is evaluated over, or `-1` when there is
 * none.
 *
 * ⚠️ A POSITION, NOT A NAME, AND FOR THE USUAL REASON. `stage.id === lastStageId`
 * is true of the synthetic source row the moment a declared stage is called
 * `__rollout_source__`, which drew the base as the unverified last stage of a
 * workflow it is not even part of.
 */
function lastPromotableStageIndex(stages: readonly { isSource: boolean }[]): number {
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    if (!stages[i].isSource) return i;
  }
  return -1;
}

/**
 * Whether the last stage's own health was actually checked and passed.
 *
 * `Final` is optional, and the server treats an absent one as declaring
 * nothing: `evaluatePrerequisites` over an empty list passes, so
 * `advanceChangeOrderStages` records such a rollout `Completed`
 * (internal/views/changeorder_stage.go). The row reads that, deliberately —
 * inventing a `Healthy` the workflow never declared would be this app writing
 * gating policy of its own.
 *
 * What it must not do is inherit that silence as reassurance. Every other
 * `Healthy` gate reports on the PREVIOUS stage, so with no `Final` the last
 * stage's health is in no gate anywhere: a production reporting
 * OutOfSync/Failed/Degraded satisfied every check there was, and the row said
 * so. Complete is still the honest verdict on the workflow; "and it is healthy"
 * is not, and the two are reported apart.
 */
function finalStageHealthVerified(
  lastStageIndex: number,
  healthByStageIndex: readonly (GateVerdictChannel | undefined)[],
): boolean {
  if (lastStageIndex === -1) return false;
  const gate = healthByStageIndex[lastStageIndex];
  return gate !== undefined && gate.evaluated && gate.ok;
}

/**
 * How far along its promotion path a rollout is, counted over the steps the
 * path draws: the source, every stage the ChangeWorkflow declares, and the
 * trailing Complete step.
 *
 * EVERY DRAWN STEP IS COUNTED, a stage that selects no Space included. The
 * list strip, the detail rail and the detail pips all draw one mark per step,
 * so a total over fewer steps reads as a bar that cannot fill.
 *
 * Done is the steps before the next stage: the rollout has passed them,
 * empty ones included. With no next stage, every stage is done and the
 * Complete step waits for the server to call the rollout finished. A complete
 * row has passed everything. A row with nowhere to promote has passed only
 * the source, where the change was made.
 */
export function stagePathProgress(
  stageCount: number,
  nextStageIndex: number,
  state: ConsoleState,
): { done: number; total: number } {
  const total = stageCount + 1;
  if (state === 'complete' || state === 'complete-unverified') return { done: total, total };
  if (state === 'no-stages') return { done: Math.min(stageCount, 1), total };
  return { done: nextStageIndex === -1 ? stageCount : nextStageIndex, total };
}

/**
 * Whether the row has a promotion path to draw and count. A row whose stages
 * cannot be shown — no workflow, no copy of its rules, or no component — has
 * none: every surface withholds the rail, the pips and "N of M" for it and
 * shows the row's Blocker instead, so no surface draws a path the row does
 * not count.
 */
export function hasPromotionPath(row: Pick<ConsoleRow, 'stages'>): boolean {
  return row.stages.length > 0;
}

/**
 * One stage's strip segment, read with the same gate checks `deriveConsoleState`
 * uses for the row as a whole — never a separate, looser read that could put a
 * segment and its own row's state at odds.
 */
function segmentToneFor(
  stage: RolloutStageState,
  isNextStage: boolean,
  health: GateVerdictChannel | undefined,
  isLastStage: boolean,
  reported: ReportedHealthChannel,
  /** Whether the rollout has passed this stage, by `stagePathProgress`. */
  passed: boolean,
  /** Whether the row reads complete, which passes every stage. */
  complete: boolean,
): SegmentTone {
  // Ahead of every other read, and never left to the catch-all below: a stage
  // the change has been taken back out of would otherwise fall through to
  // 'gated' and read as one still waiting its turn.
  if (stage.verdict === 'restored' || stage.verdict === 'restore-released') return 'restored';
  /*
   * A complete rollout draws every stage done, so the pips agree with its
   * "N of N". A failing workload still shows on its own stage. Health that
   * nothing checked is said by the row's "Complete, unverified" label and its
   * Blocker cell, not by a hollow pip on a rollout the server calls finished.
   */
  if (complete) {
    if (health !== undefined && health.evaluated && !health.ok) return 'degraded';
    if (reported.reported === 'failing') return 'degraded';
    return 'done';
  }
  if (stage.verdict === 'source' || stage.verdict === 'promoted' || stage.verdict === 'released') {
    // A promoted stage can still be unhealthy where it landed, and `health` is
    // the verdict over THIS stage's Spaces rather than the one its own gates
    // hold about the stage behind it.
    if (health !== undefined && health.evaluated && !health.ok) return 'degraded';
    /*
     * ⚠️ AND THE SPACES' OWN REPORT, WHICH THE VERDICT ABOVE CANNOT CARRY.
     * `evaluated && !ok` is false for a Space `cub` declines to judge, so a
     * targetless Space reporting Degraded passed that test and fell through to
     * `done` — the tone whose own definition claims a green workload. `done` is
     * never drawn over a Space that reports it is not healthy, target or no
     * target.
     */
    if (reported.reported === 'failing') return 'degraded';
    /*
     * Green is a claim, and on the last stage nothing else backs it. A middle
     * stage that the rollout has already moved past has been vouched for by the
     * promotion out of it — the next stage's own entry gates ran over these
     * Spaces. The last stage has no promotion after it, so if nothing checked
     * its health, `done` would be the page asserting a state it never read.
     */
    if (isLastStage && (health === undefined || !health.evaluated)) return 'unverified';
    return 'done';
  }
  // A stage that selects no Space has nothing to promote, so once the rollout
  // is past it, it is done: it counts toward "N of M", and is drawn that way.
  if (passed && stage.spaceCount === 0) return 'done';
  if (stage.verdict === 'in-progress') return 'progressing';
  if (isNextStage) {
    if (gateFailing(stage.gates, rolloutCopy.gateNames.released)) return 'blocked';
    if (gatesOpen(stage.gates)) return 'ready';
  }
  return 'gated';
}

/**
 * The row's single state, from the shipped gate and stage derivations.
 *
 * Order is the design's: a row is labelled by the stage it is trying to enter,
 * except that a live status failure in a stage it has already reached outranks
 * that — a degraded prod is the thing to look at even while dev is promoting.
 *
 * `abortedReason` is checked FIRST — matching `internal/models/changeorder.go`,
 * where `AbortedReason` overrides every other derivation of a ChangeOrder's
 * state. Setting it is a decision someone made, and it stands regardless of
 * what the propagation graph does or does not report.
 *
 * THE SERVER'S "FINISHED" COMES NEXT, above every other reading. `complete` is
 * `Stage = Completed` or `State` Released / RestoreReleased, the readings
 * `cub changeorder get` prints, and the page says what the CLI says. A failing
 * workload on a finished rollout is still shown, on its stage's segment and in
 * the Blocker cell, but it does not turn the chip away from Complete.
 *
 * ⚠️ CALLED TWICE PER ROW, AND `unhealthy` IS THE ONLY DIFFERENCE. The display
 * answer counts both health channels; the gate answer (`GateChannelState`,
 * which is what `actionFor` reads) counts the gate channel alone, so a reported
 * failure can colour a chip without withdrawing a promotion `cub` performs. One
 * function rather than two, so the two answers can never differ in their
 * ORDERING — only in that one input.
 */
function deriveConsoleState(
  stageStates: RolloutStageState[],
  nextStageIndex: number,
  lastStageIndex: number,
  progressUnavailable: boolean,
  abortedReason: string,
  complete: boolean,
  /** `ChangeOrder.State`, verbatim, or `undefined` when the server sent none. */
  serverState: string | undefined,
  /** `Final.Prerequisites` over the last stage, or `null` when there is no last stage. */
  finalGates: RolloutGate[] | null,
  healthByStageIndex: readonly (GateVerdictChannel | undefined)[],
  /** Whether a stage the change has REACHED is unhealthy, by the caller's channels. */
  unhealthy: boolean,
): ConsoleState {
  if (abortedReason !== '') return 'aborted';

  /*
   * A restored stage says the same thing `abortedReason` does, and says it from
   * the propagation graph rather than from a field a caller's read may have
   * narrowed away. Restoring is only permitted on a ChangeOrder somebody has
   * already given up on, so the two can never disagree; what differs is whether
   * the reason was fetched. Without this, an undone rollout falls through and is
   * reported by the gates on stages it no longer occupies. Above `complete`,
   * so a State of RestoreReleased cannot read as a finished rollout.
   */
  if (stageStates.some((s) => s.verdict === 'restored' || s.verdict === 'restore-released')) {
    return 'aborted';
  }

  // Complete says the WORKFLOW is done, which is `cub`'s reading. Whether the
  // last stage is healthy is a second question, and a workflow declaring no
  // final health check never asked it — so the answer is withheld rather than
  // assumed. See `finalStageHealthVerified`.
  const completeState = (): ConsoleState =>
    finalStageHealthVerified(lastStageIndex, healthByStageIndex) ? 'complete' : 'complete-unverified';
  if (complete) return completeState();

  if (progressUnavailable) return 'unknown';

  const promotable = stageStates.filter((s) => s.verdict !== 'source');
  /*
   * A resolved ChangeWorkflow whose declared stages name zero promotable
   * Spaces is not "complete" — it never had anywhere to go. Reporting the
   * honest "nowhere to promote to" as "every stage has taken the change" is
   * the exact wrong-in-the-direction-a-reader-acts-on failure this state
   * exists to prevent — see the type's own comment.
   *
   * ⚠️ `promotable.length === 0` ALONE DOES NOT DETECT THIS. `buildRolloutSequence`
   * pushes one `RolloutStage` per stage the workflow DECLARES, whether or not
   * its `whereSpace` actually selected anything — an unmatched stage becomes a
   * `stage-selects-nothing` problem, not a missing entry (`rolloutStages.ts`).
   * So a workflow with three declared stages and zero Spaces carrying any of
   * their labels still yields three non-source `stageStates`, each with
   * `spaceCount === 0`: `promotable.length` is 3, not 0, and this check never
   * fired for the exact case it names. Checked here instead: no promotable
   * stage actually selected a Space, so there is genuinely nowhere to go.
   */
  if (promotable.every((s) => s.spaceCount === 0)) return 'no-stages';

  const next = nextStageIndex === -1 ? undefined : stageStates[nextStageIndex];

  // A workload that is unhealthy where the change already landed.
  //
  // ⚠️ AND IT ASKS BOTH CHANNELS. A gate verdict alone cannot report a Space
  // `cub` declines to judge, so a targetless Space reporting Degraded would
  // otherwise read as healthy while its workload was failing.
  if (unhealthy) return 'degraded';

  // Only the stage being entered can be "held on a Release". Any stage after it
  // is simply not its turn yet.
  if (next !== undefined && gateFailing(next.gates, rolloutCopy.gateNames.released)) return 'blocked';

  if (promotable.some((s) => s.verdict === 'in-progress')) return 'progressing';
  if (next !== undefined && gatesOpen(next.gates)) return 'ready';

  // Held by a gate on the stage being entered that is not a Release — the
  // Release case returned above. The Blocker cell quotes that gate's own
  // reason, so the reader is told which check holds it.
  if (next !== undefined) return 'held';

  /*
   * Every stage has taken the change and the server has not called it finished.
   * "Needs a Release" is said only when it is true: the server reports the
   * change taken everywhere and not yet released, or the final checklist holds
   * on a Release.
   */
  if (serverState === 'Resolved' || gateFailing(finalGates ?? [], rolloutCopy.gateNames.released)) {
    return 'blocked';
  }
  // Inferred only when the server sent no State. A State that is not finished
  // is the server's answer, and an in-scope Space no stage selects is invisible
  // to the stages read here.
  const finalOpen = finalGates === null || gatesOpen(finalGates);
  if (serverState === undefined && finalOpen) return completeState();

  // A final prerequisite that is not a Release holds it, as one on a stage
  // being entered does.
  if (!finalOpen) return 'held';

  // Not finished, and no check this page can read holds it.
  return 'progressing';
}

function deriveBlocker(
  state: ConsoleState,
  gateState: GateChannelState,
  stageStates: RolloutStageState[],
  nextStageIndex: number,
  nextStageId: string | null,
  abortedReason: string,
  finalGates: RolloutGate[] | null,
  healthByStageIndex: readonly (GateVerdictChannel | undefined)[],
  reportedByStageIndex: readonly ReportedHealthChannel[],
  /** Whether a Space this ChangeOrder is headed for is in none of its stages. */
  inScopeOutsideStages: boolean,
): string {
  // The most useful single sentence about an abandoned rollout is the reason
  // someone gave for abandoning it — not a claim about stages or gates, which
  // stopped being the point the moment this was set.
  if (state === 'aborted') return abortedReason;
  if (state === 'unknown') return rolloutsConsoleCopy.progressUnavailable;
  /*
   * ⚠️ COMPLETE DOES NOT MEAN EVERY SPACE TOOK THE CHANGE, and when it does not,
   * saying so is the whole job of this cell. `cub` reads completion off the LAST
   * stage, so a Space added to an earlier stage after the rollout finished
   * leaves the chip reading Complete — correctly — while the strip names that
   * stage as next, counts it unfinished and draws it as still moving. "No
   * blocker." beside all three is the row contradicting itself, and it leaves
   * the Space that never took the change with nothing said about it.
   *
   * Above the two completion answers below, because it is true of both.
   */
  if ((state === 'complete' || state === 'complete-unverified') && nextStageId !== null) {
    return rolloutsConsoleCopy.stageLeftBehind(nextStageId);
  }
  if (state === 'complete' || state === 'complete-unverified') {
    // The chip follows the server's "finished", so a workload failing where the
    // change landed is said here or nowhere on the row.
    const failing = degradedReason(stageStates, nextStageIndex, healthByStageIndex, reportedByStageIndex);
    if (failing !== null) return failing;
  }
  if (state === 'complete') return rolloutsConsoleCopy.noBlocker;
  // Not "No blocker." — nothing is holding this rollout up, but the cell is the
  // only place the reader is told that its last stage's health went unchecked.
  if (state === 'complete-unverified') return rolloutsConsoleCopy.finalHealthNotChecked;
  /*
   * Without this check, 'no-stages' falls through to the `next === undefined`
   * case below (there IS no next stage) and reports "No blocker." — which is
   * the opposite of true. A rollout with nowhere to promote has a blocker: it
   * has nowhere to promote to.
   */
  if (state === 'no-stages') return rolloutsConsoleCopy.noStagesBlocker;

  /*
   * MUST STAY ABOVE THE `next` LOOKUP BELOW, for two separate reasons.
   *
   * A fully-promoted degraded rollout has no next stage, so it fell through to
   * `next === undefined` and rendered "No blocker." beside a Degraded chip.
   *
   * And a degraded rollout that DOES still have a next stage would otherwise
   * report that stage's first failing gate — naming a gate on a stage the
   * change has not reached, while the chip names a failure in one it has. Same
   * contradiction, different sentence.
   */
  if (state === 'degraded') {
    // The same read `deriveConsoleState` reached this state by, so the sentence
    // names the failure the chip is about. Where `cub` reached the verdict it is
    // the CLI's own wording, for the same purpose the `blocking.reason` below
    // serves: the console and `cub` must not tell a user two different stories
    // about one failure. Either way it names the Space, which is what the
    // reader needs.
    const reason =
      degradedReason(stageStates, nextStageIndex, healthByStageIndex, reportedByStageIndex)
      ?? rolloutsConsoleCopy.degradedBlocker;
    /*
     * ⚠️ A DEGRADED CHIP BESIDE AN OFFERED PROMOTE IS NOT A CONTRADICTION, AND
     * THE CELL IS WHERE IT STOPS LOOKING LIKE ONE. The gates are open, so `cub`
     * performs this promotion and the button stays (see `actionFor`); the chip
     * and this sentence are the reader's warning that a stage the change has
     * reached is unhealthy. Left at the bare reason, the row reads as a refusal
     * that did not happen. Said plainly, it reads as what it is: a workflow that
     * asks no health question here.
     */
    if (gateState.state === 'ready' && nextStageId !== null) {
      return rolloutsConsoleCopy.degradedButUngated(reason, nextStageId);
    }
    return reason;
  }

  const next = nextStageIndex === -1 ? undefined : stageStates[nextStageIndex];
  /*
   * No stage left to enter, yet not complete. There is no next stage to read a
   * gate off, and "No blocker." beside a chip that says the rollout is held
   * would be the same answer-to-the-wrong-question `degradedBlocker` exists to
   * avoid. Blocked here is either the final checklist holding on a Release or
   * the server reporting the change taken everywhere but not yet released
   * everywhere; the sentence says which. Held is a final prerequisite that is
   * not a Release. Progressing names nothing the final checklist does not say.
   */
  if (next === undefined) {
    if (state === 'blocked' && !gateFailing(finalGates ?? [], rolloutCopy.gateNames.released)) {
      return rolloutsConsoleCopy.notReleasedEverywhere;
    }
    if (state === 'blocked' || state === 'held') return rolloutsConsoleCopy.finalPrerequisitesHeld;
    if (state === 'progressing' && inScopeOutsideStages) return rolloutsConsoleCopy.inScopeSpaceNotInStage;
    return rolloutsConsoleCopy.noBlocker;
  }

  // The FIRST unsatisfied gate is the true root cause: gates are pushed in
  // dependency order, so any later failure is a knock-on of this one. Its
  // `reason` is the CLI's own wording, so the console and `cub` cannot tell a
  // user two different stories.
  const blocking = next.gates.find((g) => g.evaluated && !g.ok);
  if (blocking !== undefined) return blocking.reason;

  const notEvaluated = next.gates.find((g) => !g.evaluated);
  if (notEvaluated !== undefined) return notEvaluated.reason;

  return rolloutsConsoleCopy.noBlocker;
}

/**
 * A row for a rollout whose stages cannot be shown, in the one shape the three
 * such cases share.
 *
 * Aborted overrides the given state, always: a reader who gave up on a rollout
 * does not also need to be told its ChangeWorkflow could not be read —
 * "Aborted" is the whole and correct answer either way. `deriveConsoleState`
 * makes the same call on the populated path, for the same reason.
 */
/** The workflow a row is grouped and labelled by, whether or not it resolved. */
function governingWorkflowId(order: ConsoleChangeOrder): string | undefined {
  return order.governing.state === 'ungoverned' ? undefined : order.governing.changeWorkflowId;
}

function stagelessRow(
  order: ConsoleChangeOrder,
  bySpaceId: ReadonlyMap<string, ConsoleSpace>,
  state: ConsoleState,
  blocker: string,
): ConsoleRow {
  const abortedReason = order.abortedReason ?? '';
  return {
    changeOrderId: order.changeOrderId,
    slug: order.slug,
    changeWorkflowId: governingWorkflowId(order),
    spaceId: order.spaceId,
    spaceSlug: order.spaceSlug,
    createdAt: order.createdAt,
    appName: orderComponent(order, bySpaceId)?.Slug,
    state: abortedReason !== '' ? 'aborted' : state,
    /*
     * The same answer, and it is the gate channel's by construction: no stage
     * sequence means no live status was read for any stage, so there is no
     * health answer here to hold apart from the gates'.
     */
    gateState: { channel: 'gate-verdict', state: abortedReason !== '' ? 'aborted' : state },
    blocker: abortedReason !== '' ? abortedReason : blocker,
    abortedReason,
    stages: [],
    stagesDone: 0,
    stagesTotal: 0,
    nextStageId: null,
    progressUnavailable: true,
    progress: deriveProgress({
      changeOrderSpaceId: undefined,
      resolvedSpaceIds: undefined,
      releasedSpaceIds: undefined,
      restoredSpaceIds: undefined,
      releasedRestoredSpaceIds: undefined,
      releases: undefined,
    }),
    // No stages to read completion off. Not finished is the honest answer, and
    // the one that leaves the way out of the rollout offered.
    workflowComplete: false,
    restored: (order.restoreTagId ?? '') !== '',
    startTagId: order.startTagId,
  };
}

/**
 * One row.
 *
 * The governing workflow rides on the order itself, so a row is built from one
 * argument and a shared index. `stageSpacesByClause` holds every clause any row
 * on the page resolved, keyed by the clause that was SENT and not yet narrowed
 * to any ChangeOrder: two rollouts sharing a workflow ask the same question of
 * a stage, and differ only in the Spaces each is headed for.
 */
export function buildConsoleRow(
  order: ConsoleChangeOrder,
  allSpaces: ConsoleSpace[],
  stageSpacesByClause: Record<string, ExtendedSpaceRead[]>,
  /**
   * The server's verdicts on the stages' gates, by stage name, where a page
   * showing this one rollout asked for them (`useServerStageGates`). The list
   * of rollouts has none, and reads the gates it cannot evaluate as not
   * evaluated.
   */
  serverGatesByStage?: ServerGatesByStage,
): ConsoleRow {
  const abortedReason = order.abortedReason ?? '';

  // Display only. Which Spaces are IN a stage is the workflow's answer, resolved
  // server-side; this map supplies the slug, live status and release target of
  // the ones it names.
  const bySpaceId = new Map(allSpaces.map((s) => [s.spaceId, s]));

  // Nothing governs this rollout. A stage sequence assembled anyway would be
  // this file's invention, not the workflow's.
  if (order.governing.state === 'ungoverned') {
    return stagelessRow(order, bySpaceId, 'no-workflow', rolloutsConsoleCopy.noWorkflow);
  }

  // A workflow is named and its rules did not come with the order. Nothing can
  // be drawn from that, and waiting will not produce them: the copy is not
  // fetched, it arrives with the order or not at all.
  if (order.governing.state === 'unresolved') {
    return stagelessRow(order, bySpaceId, 'unknown', rolloutsConsoleCopy.workflowUnavailable);
  }
  const workflow = order.governing.workflow;

  // The stage-space map is keyed by the clause sent so two rows can share one
  // request and two stages named `prod` cannot collide; `buildRolloutSequence`
  // wants stage names. Re-keyed here, per row, where the workflow makes the
  // stage names unambiguous. The clause map is shared by every row on the page,
  // so the Spaces this ChangeOrder is headed for are applied here rather than
  // to the query.
  const stageSpacesByStageName: Record<string, ExtendedSpaceRead[]> = {};
  for (const stage of workflow.Stages) {
    stageSpacesByStageName[stage.Name] = changeOrderStageMembers(
      stage,
      stageSpacesByClause[stageWhereSpace(stage)],
      order.inScopeSpaceIds,
    );
  }
  const sequence = buildRolloutSequence(workflow, stageSpacesByStageName, order.spaceId ?? '');
  // The server counts these toward `State` and no stage can promote into them,
  // so a rollout can have every stage done and still not be finished.
  const stagedSpaceIds = new Set(sequence.stages.flatMap((stage) => stage.spaceIds));
  const inScopeOutsideStages = (order.inScopeSpaceIds ?? []).some(
    (spaceId) => spaceId !== order.spaceId && !stagedSpaceIds.has(spaceId),
  );

  const progress = deriveProgress({
    changeOrderSpaceId: order.spaceId,
    resolvedSpaceIds: order.resolvedSpaceIds,
    releasedSpaceIds: order.releasedSpaceIds,
    restoredSpaceIds: order.restoredSpaceIds,
    releasedRestoredSpaceIds: order.releasedRestoredSpaceIds,
    releases: order.releases,
  });
  const progressUnavailable = progress.availability === 'unavailable';

  const stageStates: RolloutStageState[] = sequence.stages.map((stage) => {
    const previousStageSpaces = (previousStageOf(sequence, stage)?.spaceIds ?? []).map((id) =>
      gateSpaceInput(id, bySpaceId.get(id)),
    );

    const gates = applyServerGates(
      buildGatesForStage({
        stage,
        previousStageSpaces,
        progress,
        // The gate wording names the thing being promoted. Fleet-wide there is no
        // single component, so the rollout's own Space is the honest stand-in.
        componentName: order.spaceSlug ?? '',
        changeOrderSlug: order.slug,
        customPrerequisites: workflow.CustomPrerequisites,
        attestationPrerequisites: workflow.AttestationPrerequisites,
      }),
      serverGatesByStage?.[stage.id],
      stage,
    );

    return deriveStageState({ stage, gates, progress, inFlightSpaceIds: EMPTY_SET });
  });

  // Position first: everything per-stage below is read off an array, and a stage
  // name is the ChangeWorkflow author's to choose. `nextStageId` is what the
  // copy and the deep link print.
  //
  // The next stage is the first one still holding a Space the change has not
  // reached, which also names a stage left behind on a finished rollout.
  // `ChangeOrder.Stage` is read only when progress is not reported, because the
  // server advances it only on a promotion or Release that names the order.
  const workflowComplete =
    order.stage === 'Completed' || order.state === 'Released' || order.state === 'RestoreReleased';
  const nextStageIndex = progressUnavailable
    ? nextStageIndexFromChangeOrderStage(sequence, order.stage)
    : nextStageIndexFromProgress(stageStates);
  const nextStageId = nextStageIndex === -1 ? null : stageStates[nextStageIndex].stageId;

  const completion: RolloutCompletionInput = {
    workflow,
    sequence,
    progress,
    gateSpaceInput: (spaceId) => gateSpaceInput(spaceId, bySpaceId.get(spaceId)),
    componentName: order.spaceSlug ?? '',
    changeOrderSlug: order.slug,
  };
  // The same gates the completion verdict was taken from, so the row cannot
  // report one `Final` answer in its chip and a different one in its strip.
  const finalGates = finalStageGates(completion);
  const healthByStageIndex = healthByStage(sequence.stages, stageStates, finalGates);
  // The display channel, derived once for the row and read by its state, its
  // blocker and every segment — the three surfaces that must never disagree
  // about whether a stage's workload is healthy.
  const reportedByStageIndex = reportedHealthByStage(sequence.stages, bySpaceId, progress, order.spaceId);
  const lastStageIndex = lastPromotableStageIndex(sequence.stages);


  /*
   * TWO READINGS OF ONE ROW, AND WHICH ONE A SURFACE MAY USE.
   *
   * `state` is what the row SAYS: both health channels count, so a stage the
   * change reached and that reports a failing workload colours the chip, writes
   * the Blocker sentence and tones its segment.
   *
   * `gateState` is what the row PERMITS: the gate channel alone — `cub`'s own
   * question. A reported failure is an observation about a workload, not a rule
   * about a promotion, and a workflow declaring no health prerequisite is
   * promoted by `cub` over a Degraded previous stage. Only `actionFor` reads
   * this, and the type stops it reading the other (`GateChannelState`).
   */
  const state = deriveConsoleState(
    stageStates,
    nextStageIndex,
    lastStageIndex,
    progressUnavailable,
    abortedReason,
    workflowComplete,
    order.state,
    finalGates,
    healthByStageIndex,
    degradedReason(stageStates, nextStageIndex, healthByStageIndex, reportedByStageIndex) !== null,
  );
  const gateState: GateChannelState = {
    channel: 'gate-verdict',
    state: deriveConsoleState(
      stageStates,
      nextStageIndex,
      lastStageIndex,
      progressUnavailable,
      abortedReason,
      workflowComplete,
      order.state,
      finalGates,
      healthByStageIndex,
      failingLiveStatusGate(stageStates, nextStageIndex, healthByStageIndex) !== null,
    ),
  };

  const path = stagePathProgress(sequence.stages.length, nextStageIndex, state);
  const complete = state === 'complete' || state === 'complete-unverified';
  const stages: ConsoleStage[] = sequence.stages.map((stage, i) => ({
    stageId: stage.id,
    hasReleaseTargets: promotionTargets(stage.spaceIds, order.spaceId).some(
      (id) => bySpaceId.get(id)?.releaseTargetId !== undefined,
    ),
    spaceSlugs: stage.spaceIds
      .map((id) => bySpaceId.get(id)?.slug)
      .filter((slug): slug is string => slug !== undefined),
    spaceIds: stage.spaceIds,
    state: stageStates[i],
    gates: stageStates[i].gates,
    isSource: stage.isSource,
    segmentTone: segmentToneFor(
      stageStates[i],
      i === nextStageIndex,
      healthByStageIndex[i],
      i === lastStageIndex,
      reportedByStageIndex[i] ?? NOTHING_REPORTED,
      i < path.done,
      complete,
    ),
  }));

  return {
    changeOrderId: order.changeOrderId,
    slug: order.slug,
    changeWorkflowId: governingWorkflowId(order),
    spaceId: order.spaceId,
    spaceSlug: order.spaceSlug,
    createdAt: order.createdAt,
    appName: orderComponent(order, bySpaceId)?.Slug,
    state,
    gateState,
    blocker: deriveBlocker(
      state,
      gateState,
      stageStates,
      nextStageIndex,
      nextStageId,
      abortedReason,
      finalGates,
      healthByStageIndex,
      reportedByStageIndex,
      inScopeOutsideStages,
    ),
    abortedReason,
    stages,
    stagesDone: path.done,
    stagesTotal: path.total,
    nextStageId,
    progressUnavailable,
    progress,
    workflowComplete,
    restored: (order.restoreTagId ?? '') !== '',
    startTagId: order.startTagId,
  };
}

/**
 * Where the given Space sits in this row, or `null` when it is not in the
 * sequence at all — no stage of the governing ChangeWorkflow selects it, or
 * there is no governing workflow to ask (`stages` is empty then).
 *
 * Reads `hasTakenChange` — the shipped predicate — rather than re-deriving
 * "has this Space taken the change" from the stage verdict, so this can never
 * disagree with the strip about the same Space.
 *
 * ⚠️ A REAL STAGE BEFORE THE SYNTHETIC SOURCE ROW. The ChangeOrder's own Space
 * sits in two rows of the sequence whenever a stage's selector covers it, and
 * the source row is at position 0, so a plain ordered search always returns the
 * synthetic row. That row has a SYNTHETIC id, no gate and no lane of its own: a
 * caller handed it names `__rollout_source__` to the reader, reports "where
 * this change starts" for a Space the workflow has a real stage for, and
 * highlights nothing the reader can see. The real stage is the answer whenever
 * there is one; the source row is the fallback, not the first hit.
 */
export function viewerPositionIn(
  row: Pick<ConsoleRow, 'stages' | 'nextStageId' | 'progress'>,
  spaceId: string,
): { stageIndex: number; stageId: string; isSource: boolean; isNext: boolean; taken: boolean } | null {
  const inStage = (s: ConsoleStage) => s.spaceIds.includes(spaceId);
  const real = row.stages.findIndex((s) => !s.isSource && inStage(s));
  const stageIndex = real !== -1 ? real : row.stages.findIndex(inStage);
  if (stageIndex === -1) return null;
  const stage = row.stages[stageIndex];
  return {
    stageIndex,
    stageId: stage.stageId,
    isSource: stage.isSource,
    isNext: stage.stageId === row.nextStageId,
    taken: hasTakenChange(row.progress, spaceId),
  };
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * What a stage nothing was read for reports: nothing. A stage absent from the
 * map is not a green one, and a tone read off `undefined` would be exactly the
 * "unknown renders as pass" this channel was added to stop.
 */
const NOTHING_REPORTED: ReportedHealthChannel = {
  channel: 'reported-health',
  reported: 'unreported',
  reason: '',
};


/**
 * The deep link to one Space in the Component graph. `AppsComponentLayout`
 * reads this as `?app=&space=`, the same shape its own post-create
 * redirect and the activity feed's full-path link already use for "select this
 * node".
 */
export function componentSpaceDeepLink(appName: string | undefined, spaceId: string): string | null {
  if (appName === undefined) return null;
  const params = new URLSearchParams({ app: appName, space: spaceId });
  return `${ROUTE_COMPONENTS}?${params.toString()}`;
}
