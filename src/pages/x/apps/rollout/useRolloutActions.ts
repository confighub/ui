// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Promote and Release, for one whole stage at a time.
 *
 * A PROMOTE IS ONE CALL. `POST /api/promote` selects the downstream variant
 * Spaces, orders them so a Space is promoted after any selected Space it takes
 * from, and decides per resource whether to upgrade, mark, empty, revive,
 * clone or invoke it — putting clones in the variant's own namespace and
 * reconciling each variant's links at every depth, however far down the chain
 * it sits. Promoting again changes nothing, so a promote that fails part-way
 * is finished by running it again rather than by a second, narrower call.
 *
 * A RESOLVED PROMISE IS NOT A SUCCESS. Three things arrive that way:
 *
 *  - 207 Multi-Status, carrying per-Space, per-resource and per-link `Error`
 *    fields that `.unwrap()` passes through happily. Every one is read; see
 *    `summarisePromote`.
 *  - 200 having written nothing, because every variant already had the change.
 *    Announcing that as "Promoted" tells somebody their change shipped when no
 *    Space was touched.
 *  - 200 on a dry run, which is the same shape with nothing written. That is
 *    what the confirmation dialog previews, and its `Plan` is sent back as
 *    `ExpectedPlan` so a preview that has gone stale fails with 412 instead of
 *    quietly promoting something the reader never saw.
 *
 * THE GATES ARE THE SERVER'S ANSWER, NOT THIS FILE'S. A held stage is refused
 * with 409 and a body naming every gate evaluated. `promoteRefusal` below stays
 * as the affordance — it is what lets a surface say "held" without asking — but
 * the refusal that counts is the one that comes back.
 *
 * PUBLISHING IS NOT PART OF A PROMOTE. `release` stays a separate fan-out over
 * `/release/publish`, because the promote API does not publish.
 */

import { useCallback, useRef, useState } from 'react';

import {
  usePromoteMutation,
  usePublishReleaseMutation,
  type PromoteResult,
} from '@confighub/rtk-query';

import { gatesBlockPromotion } from './rolloutFooterModel';
import { rolloutCopy } from './rolloutCopy';
import { describeRequestError } from './rolloutAbort';

/** Outcome of one stage-level action, for the pane to report. */
export interface RolloutActionResult {
  ok: boolean;
  /** Message to show. Empty when everything succeeded. */
  message: string;
  /**
   * True when the action had nothing to act on and so did nothing.
   *
   * SUCCEEDING AND HAVING ACTED ARE DIFFERENT THINGS. A promote with no target
   * Spaces, one reached before the ChangeOrder is known, or one whose variants
   * all hold the change already cannot fail — but it also wrote nothing, and a
   * caller that reports it as a completed promotion tells somebody their change
   * shipped when it did not.
   */
  didNothing?: boolean;
}

const OK: RolloutActionResult = { ok: true, message: '' };
const NOTHING_TO_DO: RolloutActionResult = { ok: true, message: '', didNothing: true };

/**
 * Whether this promote has anything to act on at all.
 *
 * Separate from the gate refusal: this is not a decision about whether the
 * promote is ALLOWED, it is the observation that there is nothing for it to do.
 * Both stop the promote, and they must not be reported the same way.
 *
 * It is also what keeps an empty selector off the wire. `/promote` treats an
 * empty selection as an error — "Stage 'staging' selects no Space" is almost
 * always a mistyped selector — so asking it to promote nothing would report a
 * server error over a question with a perfectly ordinary answer.
 */
export function promoteHasNothingToDo(
  changeOrderId: string | undefined,
  baseSpaceId: string | undefined,
  spaceIds: readonly string[],
): boolean {
  return changeOrderId === undefined || baseSpaceId === undefined || spaceIds.length === 0;
}

/**
 * Publishing races the trigger evaluator: a promote re-queues that Space's
 * ApplyGate triggers, so a publish issued immediately afterwards is refused
 * with 422 while they re-evaluate. That is the gates working, not a failure, so
 * "Promote and release" waits for it — but ONLY for that specific refusal, so a
 * genuine error still surfaces at once instead of being swallowed by a blanket
 * retry.
 */
const GATE_REEVALUATION_MARKER = 'outstanding ValidationErrors';
const GATE_WAIT_TIMEOUT_MS = 30_000;
const GATE_WAIT_POLL_MS = 1_500;

/** Does this error say "the gates are still being evaluated"? */
function isGateReevaluation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status = (error as { status?: number }).status;
  if (status !== 422) return false;
  // Match on the message too: 422 alone is not specific enough to justify
  // waiting, and waiting through the wrong 422 would hide a real refusal.
  const data = (error as { data?: unknown }).data;
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  return text.includes(GATE_REEVALUATION_MARKER);
}

/** The HTTP status of a rejected request, when it carries one. */
export function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * The `PromoteResult` a refused request carries in its body.
 *
 * A 409 is not a bare status: it holds every gate the server evaluated, which
 * is the whole reason the refusal is structured rather than a sentence.
 */
export function promoteResultOf(error: unknown): PromoteResult | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return undefined;
  return data as PromoteResult;
}

/** One failed item's sentence, or `null` when the item did not fail. */
function itemFailure(name: string | undefined, message: string | undefined): string | null {
  if (typeof message !== 'string' || message.length === 0) return null;
  return rolloutCopy.itemFailure(
    name !== undefined && name.length > 0 ? name : rolloutCopy.unnamedResource,
    message,
  );
}

/**
 * Unit actions that write. `Unchanged` and `Skip` do not.
 *
 * Needed because a Space's own `Action` is what the server PLANNED, decided
 * before anything ran — per-Unit errors are filled into the rendered result
 * afterwards. So `Promote` means "this Space was going to be written to", not
 * "this Space was written to", and the difference is a whole variant.
 */
const WRITING_UNIT_ACTIONS: ReadonlySet<string> = new Set([
  'Upgrade',
  'Mark',
  'Empty',
  'Revive',
  'Clone',
  'Invoke',
]);

/** The only Link action that writes. `Unchanged`, `Skip` and `Orphaned` do not. */
const WRITING_LINK_ACTION = 'Create';

/** What one promote response says happened, item by item. */
export interface PromoteSummary {
  /** One sentence per failed Space, resource or link, in the order reported. */
  failures: string[];
  /** Spaces the promotion actually wrote something into. */
  writtenSpaceCount: number;
  /**
   * A Space is outside the change order's scope, so no run reaches it.
   *
   * WHICH DECIDES WHETHER RETRYING IS ADVICE OR NOISE. A write that failed, or
   * a Space blocked behind one, is finished by running the promotion again; a
   * Space the change order is not headed for is passed over by every run, and
   * the same advice is then an instruction that cannot work.
   */
  outOfScopeSpace: boolean;
  /**
   * Spaces a dry run actually previewed.
   *
   * NOT every Space the response mentions. A Space the server could not plan
   * has no preview to show, and counting it says the confirmation covered
   * ground it never saw.
   */
  reachedSpaceCount: number;
}

/**
 * Read a promote response item by item.
 *
 * THIS IS WHAT 207 NEEDS AND `.unwrap()` DOES NOT DO. A promotion whose Space
 * writes all succeeded and whose resource writes did not resolves as a success
 * and reads as done; the per-item `Error` fields are the only place that shows
 * otherwise. Every level carries one — the Space, each resource, each link —
 * and all three are walked, because a link that failed to land is a
 * relationship the variant is missing however well its resources arrived.
 *
 * ⚠️ A SPACE THAT WAS PASSED OVER CARRIES NO `Error`, AND IS THE WHOLE POINT.
 * `Skipped` and `Blocked` set only a `Reason`, so a walker reading `Error`
 * alone sees nothing and the promotion reads as clean. A stage of three
 * variants where the ChangeOrder covers one answers 200 with one `Promote` and
 * two `Skipped` — and announcing that as "Promoted" tells somebody their change
 * reached three places when it reached one.
 *
 * TWO OF THOSE ARE HARMLESS, AND BOTH ARE TOLD APART STRUCTURALLY RATHER THAN
 * BY READING THE SERVER'S PROSE:
 *
 *  - The ChangeOrder's OWN Space is skipped because the change was authored
 *    there; it is recognised by its id, not by its sentence.
 *  - A dry run BLOCKS a Space whose upstream the same request would promote
 *    first, because it cannot preview against a state that does not exist yet.
 *    An apply blocks for a different reason — the upstream's promotion did not
 *    complete — and that one is a real gap in what landed.
 *
 * Everything else that was passed over is reported in the SERVER's own words,
 * which name the remedy ("add the space to its InScopeSpaceIDs first"). A
 * paraphrase would drop that.
 *
 * `writtenSpaceCount` is what tells the two true sentences apart: with a Space
 * written, "nothing was changed" is false; with none, the partial-failure copy
 * is.
 */
export function summarisePromote(
  result: PromoteResult | undefined,
  /**
   * The ChangeOrder's own Space, the one skip that means nothing is wrong.
   * Absent, every skip is reported — the loud answer, which is the right
   * default when the benign case cannot be recognised.
   */
  baseSpaceId: string | undefined,
): PromoteSummary {
  const failures: string[] = [];
  let writtenSpaceCount = 0;
  let reachedSpaceCount = 0;
  let outOfScopeSpace = false;

  for (const space of result?.Spaces ?? []) {
    /*
     * ⚠️ BLOCKED AND FAILED SPACES WERE NOT PREVIEWED, AND COUNTING THEM IS HOW
     * A CONFIRMATION COMES TO OVERCLAIM.
     *
     * A dry run blocks every Space that takes from another Space of the same
     * promotion, because it cannot plan against a state that does not exist
     * yet — which is the shape of every chained rollout, not an edge case. The
     * server returns those Spaces with a reason and no plan, so counting them
     * as reached makes the dialog state a coverage nothing looked at.
     */
    if (space.Action !== 'Blocked' && space.Action !== 'Failed') reachedSpaceCount += 1;
    const spaceName = space.SpaceSlug ?? rolloutCopy.unnamedSpace;

    const spaceFailure =
      itemFailure(spaceName, space.Error?.Message) ??
      (reportsReason(space, result?.DryRun === true, baseSpaceId)
        ? itemFailure(spaceName, space.Reason)
        : null);
    if (spaceFailure !== null) {
      failures.push(spaceFailure);
      // Asked separately, and of a different question. See `outOfScope`.
      if (outOfScope(space, baseSpaceId)) outOfScopeSpace = true;
    }

    let wrote = false;
    for (const unit of space.Units ?? []) {
      const failure = itemFailure(unit.Slug, unit.Error?.Message);
      if (failure !== null) failures.push(failure);
      else if (WRITING_UNIT_ACTIONS.has(unit.Action ?? '')) wrote = true;
    }
    for (const link of space.Links ?? []) {
      const failure = itemFailure(link.Slug ?? link.FromUnitSlug, link.Error?.Message);
      if (failure !== null) failures.push(failure);
      else if (link.Action === WRITING_LINK_ACTION) wrote = true;
    }

    // Planned AND landed. A Space whose every write failed took none of the
    // change, and saying it "took the change" would be the opposite of true.
    if (space.Action === 'Promote' && wrote) writtenSpaceCount += 1;
  }

  return { failures, writtenSpaceCount, reachedSpaceCount, outOfScopeSpace };
}

/**
 * Does this Space's own `Reason` need to reach the reader?
 *
 * ⚠️ ONE OF TWO QUESTIONS ABOUT A SPACE THAT DID NOT TAKE THE CHANGE, AND THEY
 * ARE NOT THE SAME QUESTION. This one decides whether the reader HEARS about
 * it. `outOfScope` decides whether they are told trying again would help. They
 * agree for exactly one action, and a single predicate answering both is how
 * they came to be conflated.
 */
function reportsReason(
  space: NonNullable<PromoteResult['Spaces']>[number],
  dryRun: boolean,
  baseSpaceId: string | undefined,
): boolean {
  switch (space.Action) {
    case 'Failed':
      return true;
    case 'Skipped':
      // Every skip but the ChangeOrder's own Space is a variant that asked for
      // the change and did not get it.
      return space.SpaceID === undefined || space.SpaceID !== baseSpaceId;
    case 'Blocked':
      // On a dry run this is a preview that could not be taken, not a variant
      // that missed out; on an apply it is a variant left behind.
      return !dryRun;
    default:
      return false;
  }
}

/**
 * Would every run pass this Space over in the same way?
 *
 * ONLY A SPACE THE CHANGE ORDER IS NOT HEADED FOR. Its membership has to
 * change before any promotion can reach it, so advice to try again is advice
 * that cannot work.
 *
 * `Failed` and `Blocked` are NOT this, and the difference is the whole point.
 * A Space that failed was being acted on and stopped — a merge conflict, a
 * transient refusal — and a later run can get past it. A Space blocked on an
 * apply was blocked BECAUSE its upstream failed this time round; fix that and
 * it proceeds, which is the ordinary cascade rather than an edge case. Telling
 * either of them that running again changes nothing denies the remedy that
 * actually works.
 */
function outOfScope(
  space: NonNullable<PromoteResult['Spaces']>[number],
  baseSpaceId: string | undefined,
): boolean {
  if (space.Action !== 'Skipped') return false;
  return space.SpaceID === undefined || space.SpaceID !== baseSpaceId;
}

/**
 * Every gate the server says does not hold, as one sentence, or `null`.
 *
 * ALL OF THEM, not the first. A stage held by three things is held by three
 * things, and naming one sends a reader off to fix a third of the problem. The
 * server evaluates the lot for exactly this reason.
 */
export function promoteGatesHolding(result: PromoteResult | undefined): string | null {
  const holding: string[] = [];
  for (const stage of result?.Stages ?? []) {
    for (const gate of stage.Gates ?? []) {
      if (gate.Satisfied === true) continue;
      const message = gate.Message;
      holding.push(
        typeof message === 'string' && message.length > 0
          ? message
          : rolloutCopy.promoteHeld.generic,
      );
    }
  }
  return holding.length === 0 ? null : holding.join(' ');
}

/**
 * What the caller must say about the stage it is promoting into.
 *
 * `failedGateCount` is the stage's own count of gates that were evaluated and
 * failed at the moment of the click — `partitionBlockingGates(stage.gates)
 * .failed.length` — not a page-wide figure. It is required so that promoting is
 * impossible without answering "is anything holding this?". A gate nobody
 * evaluated is not counted: the server evaluates it when asked.
 */
export interface PromoteRequest {
  failedGateCount: number;
}

/**
 * Why this promote must not proceed, or `null` when it may.
 *
 * THE AFFORDANCE, NOT THE ENFORCEMENT. The server refuses a held stage with
 * 409 whatever this says, so this rule exists to let a surface decline before
 * asking rather than to be the thing that stops the write. It takes no argument
 * that makes a held stage promotable, for the same reason the server takes
 * none: there is no such argument.
 */
export function promoteRefusal(request: PromoteRequest): string | null {
  return gatesBlockPromotion(request.failedGateCount) ? rolloutCopy.promoteHeld.refused : null;
}

/**
 * The whole of what `promote` decides before it asks the server: the result to
 * return instead of promoting, or `null` to go ahead.
 *
 * BOTH REFUSALS LIVE HERE, and they are different refusals. "Nothing to act on"
 * is an observation, reported as a success that DID NOTHING; a held gate is a
 * decision, reported as a failure with a reason. Collapsing either into a plain
 * `ok` tells a caller a promotion happened when none did.
 *
 * Extracted whole so the wiring is the tested thing rather than the branch that
 * reads it: an announcement is chosen from this result, and a result that lost
 * `didNothing` on the way out would announce a promotion nothing performed.
 */
export function promotePrecheck(
  changeOrderId: string | undefined,
  baseSpaceId: string | undefined,
  spaceIds: readonly string[],
  request: PromoteRequest,
): RolloutActionResult | null {
  if (promoteHasNothingToDo(changeOrderId, baseSpaceId, spaceIds)) return NOTHING_TO_DO;
  const refusal = promoteRefusal(request);
  return refusal === null ? null : { ok: false, message: refusal };
}

/**
 * What to tell the reader once a promote has settled.
 *
 * SUCCEEDED AND ACTED ARE DIFFERENT THINGS, and this is the one place that
 * distinction reaches a screen. `didNothing` is asked FIRST, before `ok`,
 * because a promote that had nothing to act on is a success — announcing it as
 * "Promoted" tells somebody their change shipped when nothing was written.
 */
export function promoteAnnouncement(stageId: string, result: RolloutActionResult): string {
  if (result.didNothing === true) return rolloutCopy.nothingToPromote(stageId);
  if (result.ok) return rolloutCopy.promotedTo(stageId);
  return result.message;
}

/**
 * What a dry run found, for the confirmation dialog to state before anybody
 * commits to writing.
 */
export interface PromotePreview {
  /** A dry run is in flight. */
  loading: boolean;
  /**
   * Variants the dry run reported on. Fewer than the stage's targets means the
   * dialog must not state a total as though the preview were complete.
   */
  reachedSpaceCount: number;
  /** Every gate the server says holds this stage, or `null` when none does. */
  gatesHolding: string | null;
  /** Anything other than a gate that stopped the preview, or `null`. */
  error: string | null;
}

const NO_PREVIEW: PromotePreview = {
  loading: false,
  reachedSpaceCount: 0,
  gatesHolding: null,
  error: null,
};

export interface UseRolloutActionsArgs {
  changeOrderId: string | undefined;
  /**
   * The Space the ChangeOrder lives in.
   *
   * A rollout that does not yet know its base has not loaded, and promoting it
   * would ask the server to act on half a rollout — so it is the precheck's
   * second question. It is also the one Space a promotion skips on purpose,
   * which is how `summarisePromote` tells that skip from a variant that missed
   * the change.
   */
  baseSpaceId: string | undefined;
  /** Called after any action settles, so the caller can refetch. */
  onSettled?: () => void;
}

export interface RolloutActions {
  /**
   * Spaces with one of THIS BROWSER's WRITES in flight right now.
   *
   * CLIENT-LOCAL OPTIMISTIC STATE, and that is the whole of it. It exists
   * between this user's click and their response landing, and nothing else ever
   * populates it. A dry run is deliberately absent: nothing is being written,
   * so showing those Spaces in flight would report work that is not happening.
   * Consequences worth knowing before building on it:
   *
   *  - A second person watching the same rollout sees nothing here. They see
   *    promoted or not-promoted, which is the truth of what the product does.
   *  - There is no server-side promotion-in-progress signal to derive one from.
   *    A promote completes inside its own request — `ActionType` covers Apply,
   *    InvokeFunctions, ListFunctions and Cancel, but not upgrade — so no
   *    `UnitAction` is produced and there is nothing to poll.
   *  - The design mockup's opening state, a Space shown in flight on load with
   *    nobody having clicked anything, is therefore not reachable. Its "40s"
   *    spinner and argo chips describe the DELIVERY phase, not a promote.
   *
   * A server-derived in-progress signal is a backend follow-up, raised with the
   * user and out of scope here. Do NOT fake this state to make it demonstrable:
   * proving the UI can render a state the product cannot enter is anti-evidence,
   * and such a fixture would keep passing after the day someone made it real.
   */
  inFlightSpaceIds: ReadonlySet<string>;
  busy: boolean;
  lastResult: RolloutActionResult | null;
  clearResult: () => void;
  /**
   * `request` states the gate situation, and stating it is NOT OPTIONAL.
   *
   * The affordance lives here rather than only in the button that opens the
   * dialog, so a surface that forgot the check declines before asking instead
   * of sending a request the server will refuse anyway. Making the gate count a
   * required argument means a new caller cannot fail to think about it; the
   * compiler asks.
   */
  promote: (spaceIds: string[], request: PromoteRequest) => Promise<RolloutActionResult>;
  /**
   * Plan the promote without writing anything, so a confirmation can state what
   * it is about to do.
   *
   * The plan it returns is held and sent back with the promote as
   * `ExpectedPlan`: what was previewed is what gets written, or nothing is.
   *
   * `request` states the gate situation for the same reason `promote` does: a
   * stage held by a gate that failed is not previewed at all. Its gates are
   * what its dialog reports, so there is nothing for a dry run to add. A stage
   * whose gates are only unevaluated is previewed, and the server's verdict on
   * them comes back with the preview.
   */
  preview: (spaceIds: string[], request: PromoteRequest) => Promise<void>;
  promotePreview: PromotePreview;
  clearPreview: () => void;
  release: (spaceIds: string[]) => Promise<RolloutActionResult>;
  promoteAndRelease: (spaceIds: string[], request: PromoteRequest) => Promise<RolloutActionResult>;
}

export function useRolloutActions(args: UseRolloutActionsArgs): RolloutActions {
  const { changeOrderId, baseSpaceId, onSettled } = args;

  const [runPromote] = usePromoteMutation();
  const [publishRelease] = usePublishReleaseMutation();

  /**
   * The plan a dry run returned, with the selector it was planned for.
   *
   * A ref, not state: it is written by one click and read by the next, and a
   * render on it would tell nobody anything. The selector travels with it
   * because a plan is only the plan for the Spaces it was planned over —
   * sending it back for a different selection would ask the server to confirm a
   * preview nobody saw.
   */
  const plannedRef = useRef<{ selector: string; plan: string } | null>(null);
  const [inFlightSpaceIds, setInFlightSpaceIds] = useState<ReadonlySet<string>>(() => new Set());
  const [lastResult, setLastResult] = useState<RolloutActionResult | null>(null);
  const [promotePreview, setPromotePreview] = useState<PromotePreview>(NO_PREVIEW);

  const clearResult = useCallback(() => setLastResult(null), []);
  const clearPreview = useCallback(() => {
    plannedRef.current = null;
    setPromotePreview(NO_PREVIEW);
  }, []);

  /**
   * The stage's Spaces as a `WhereSpace` expression.
   *
   * Naming the Spaces rather than the stage: the caller has already decided
   * which of the stage's Spaces this action writes into — `promotionTargets`
   * drops the Space the promotion passes over — and a `TargetStage` would hand that
   * decision back to the server and undo it. The stage's gates are evaluated
   * either way, since they are evaluated over the stage before it.
   */
  const whereSpace = useCallback(
    (spaceIds: readonly string[]) =>
      /*
       * SORTED, so the same set of Spaces always produces the same expression.
       * `IN` is set membership and order means nothing to the server — but it
       * means everything to the comparison below that decides whether the plan
       * a preview returned still describes what is about to be written. Left
       * in the caller's order, a stage whose Spaces re-derive in a different
       * order between opening the dialog and confirming it would quietly drop
       * the guard rather than trip it.
       */
      `SpaceID IN (${[...spaceIds].sort().map((id) => `'${id}'`).join(', ')})`,
    [],
  );

  const preview = useCallback(
    async (spaceIds: string[], request: PromoteRequest): Promise<void> => {
      plannedRef.current = null;
      /*
       * NOTHING PREVIEWED, AND NOTHING SAID. Both halves of the precheck stop
       * here, and neither writes a word into the preview — because the caller
       * already has a better one to show.
       *
       * A held stage's dialog reports the page's own gate reading, which names
       * how many checks failed, how many were never made, and the principal
       * cause. This hook's refusal is one flat sentence. Putting it in
       * `gatesHolding` would SHADOW the richer reading (the page reads
       * `gatesHolding ?? its own`), and putting it in `error` would replace the
       * dialog's whole body and take the hold notice with it. Leaving both null
       * is what lets the caller say the better thing.
       *
       * An empty selection stops here too, and must: `/promote` treats one as
       * an error, so previewing it would answer a perfectly ordinary question
       * with a server failure.
       */
      if (promotePrecheck(changeOrderId, baseSpaceId, spaceIds, request) !== null) {
        setPromotePreview(NO_PREVIEW);
        return;
      }

      const selector = whereSpace(spaceIds);
      setPromotePreview({ ...NO_PREVIEW, loading: true });
      try {
        const result = await runPromote({
          dryRun: true,
          promoteRequest: { ChangeOrderID: changeOrderId, WhereSpace: selector },
        }).unwrap();

        const plan = result.Plan;
        if (typeof plan === 'string' && plan.length > 0) plannedRef.current = { selector, plan };

        const summary = summarisePromote(result, baseSpaceId);
        setPromotePreview({
          loading: false,
          reachedSpaceCount: summary.reachedSpaceCount,
          gatesHolding: promoteGatesHolding(result),
          error: summary.failures.length > 0 ? summary.failures.join('; ') : null,
        });
      } catch (error) {
        /*
         * A refusal is an ANSWER, not a broken preview: 409 carries the gates
         * in its body, and a dry run is refused by exactly what an apply would
         * be refused by. Anything else is a failure to ask, and says so.
         */
        const body = statusOf(error) === 409 ? promoteResultOf(error) : undefined;
        const gatesHolding = promoteGatesHolding(body);
        setPromotePreview({
          loading: false,
          reachedSpaceCount: summarisePromote(body, baseSpaceId).reachedSpaceCount,
          gatesHolding,
          error: gatesHolding === null ? describeRequestError(error) : null,
        });
      }
    },
    [changeOrderId, baseSpaceId, runPromote, whereSpace],
  );

  const promote = useCallback(
    async (spaceIds: string[], request: PromoteRequest): Promise<RolloutActionResult> => {
      const stopNow = promotePrecheck(changeOrderId, baseSpaceId, spaceIds, request);
      if (stopNow !== null) {
        // A refusal is a verdict the footer keeps showing; having had nothing
        // to do is not one, and recording it would clear a banner still
        // describing the last thing that actually ran.
        if (stopNow.didNothing !== true) setLastResult(stopNow);
        return stopNow;
      }
      setInFlightSpaceIds(new Set(spaceIds));

      const selector = whereSpace(spaceIds);
      const planned = plannedRef.current;
      try {
        /*
         * A PREVIEW OF DIFFERENT SPACES IS A STALE PREVIEW, AND IT REFUSES.
         *
         * The plan digest describes the Spaces it was planned over, so sending
         * it for a different set would ask the server to confirm something
         * nobody previewed. Dropping it instead would promote with no guard at
         * all — the failure this whole path exists to prevent, arrived at
         * silently. A surface that never previewed has nothing to be stale, and
         * proceeds.
         */
        if (planned !== null && planned.selector !== selector) {
          const stale: RolloutActionResult = { ok: false, message: rolloutCopy.promotePlanStale };
          setLastResult(stale);
          return stale;
        }

        const result = await runPromote({
          promoteRequest: {
            ChangeOrderID: changeOrderId,
            WhereSpace: selector,
            // Apply exactly what was previewed. Without this a plan that moved
            // between the preview and the click — a resource added upstream, a
            // gate that stopped holding — is promoted silently, and the dialog's
            // sentence described something else.
            ...(planned !== null ? { ExpectedPlan: planned.plan } : {}),
          },
        }).unwrap();

        const summary = summarisePromote(result, baseSpaceId);
        if (summary.failures.length > 0) {
          const reason = summary.failures.join('; ');
          /*
           * Whether anything LANDED decides which of two true sentences this
           * is. With a Space promoted, "nothing was changed" is false; with
           * none, the partial-failure copy is.
           */
          const landed = rolloutCopy.spaceCount(summary.writtenSpaceCount);
          const failure: RolloutActionResult = {
            ok: false,
            message:
              summary.writtenSpaceCount === 0
                ? rolloutCopy.promoteRequestFailed(reason, spaceIds.length)
                : // A Space outside the change order's scope is passed over
                  // again by every run, so only the other shape may retry.
                  summary.outOfScopeSpace
                  ? rolloutCopy.promotePassedOver(landed, reason)
                  : rolloutCopy.promotePartial(landed, reason),
          };
          setLastResult(failure);
          return failure;
        }

        setLastResult(null);
        // Every variant already had the change, so the promotion succeeded and
        // wrote nothing. Saying "Promoted" here would report a write.
        if (summary.writtenSpaceCount === 0) return NOTHING_TO_DO;
        return OK;
      } catch (error) {
        const status = statusOf(error);
        const gatesHolding = status === 409 ? promoteGatesHolding(promoteResultOf(error)) : null;
        const failure: RolloutActionResult = {
          ok: false,
          message:
            gatesHolding !== null
              ? rolloutCopy.promoteRefused(gatesHolding)
              : status === 412
                ? rolloutCopy.promotePlanStale
                : rolloutCopy.promoteRequestFailed(describeRequestError(error), spaceIds.length),
        };
        setLastResult(failure);
        return failure;
      } finally {
        // The plan is spent either way: it was applied, or it was rejected as
        // no longer current. Keeping it would send a stale digest next time.
        plannedRef.current = null;
        setPromotePreview(NO_PREVIEW);
        setInFlightSpaceIds(new Set());
        onSettled?.();
      }
    },
    [changeOrderId, baseSpaceId, runPromote, whereSpace, onSettled],
  );

  /** Publish one Space, waiting out a gate re-evaluation but nothing else. */
  const publishOne = useCallback(
    async (spaceId: string, deadline: number): Promise<void> => {
      for (;;) {
        try {
          // Naming the ChangeOrder is what makes the server advance its Stage in
          // the same transaction. Without it the Release lands, State reads
          // Released, and Stage stays on the last stage it was promoted into.
          // No TagID: that would change which Revision is bundled.
          await publishRelease({
            spaceId,
            releasePublishRequest: { ChangeOrderID: changeOrderId },
          }).unwrap();
          return;
        } catch (error) {
          if (!isGateReevaluation(error) || Date.now() > deadline) throw error;
          await new Promise((resolve) => setTimeout(resolve, GATE_WAIT_POLL_MS));
        }
      }
    },
    [publishRelease, changeOrderId],
  );

  const release = useCallback(
    async (spaceIds: string[]): Promise<RolloutActionResult> => {
      if (spaceIds.length === 0) return OK;
      setInFlightSpaceIds(new Set(spaceIds));
      const deadline = Date.now() + GATE_WAIT_TIMEOUT_MS;

      try {
        // Fan out. One Space failing must not stop its siblings.
        const settled = await Promise.allSettled(
          spaceIds.map((spaceId) => publishOne(spaceId, deadline)),
        );
        const failedCount = settled.filter((s) => s.status === 'rejected').length;
        if (failedCount > 0) {
          const result = {
            ok: false,
            message: rolloutCopy.releaseFailed(
              `${failedCount} of ${spaceIds.length} ${spaceIds.length === 1 ? 'Space' : 'Spaces'}`,
            ),
          };
          setLastResult(result);
          return result;
        }
        setLastResult(null);
        return OK;
      } finally {
        setInFlightSpaceIds(new Set());
        onSettled?.();
      }
    },
    [publishOne, onSettled],
  );

  const promoteAndRelease = useCallback(
    async (spaceIds: string[], request: PromoteRequest): Promise<RolloutActionResult> => {
      const promoted = await promote(spaceIds, request);
      // Do not release what did not promote — that would publish the old state
      // and call it done.
      if (!promoted.ok) return promoted;
      return release(spaceIds);
    },
    [promote, release],
  );

  return {
    inFlightSpaceIds,
    busy: inFlightSpaceIds.size > 0 || promotePreview.loading,
    lastResult,
    clearResult,
    promote,
    preview,
    promotePreview,
    clearPreview,
    release,
    promoteAndRelease,
  };
}
