// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every user-facing string on the Rollouts console.
 *
 * THE NAME IS "ROLLOUTS", DECIDED. The reference design
 * (`3-orders-console.html`) calls this surface "Change Orders" throughout its
 * own copy; the product's answer is "Rollouts", so the design's literal wording
 * is deliberately NOT carried over. If you are porting something from that
 * file, translate the noun.
 *
 * The name still lives in one place rather than being inlined, because it
 * appears in a dozen composed strings ("Search Rollouts", "No rollouts match
 * these filters") and a future rename should stay a two-line edit rather than a
 * find-and-replace that has to judge each occurrence.
 *
 * Internal naming deliberately does not track the label. Files, types and
 * functions say "rollout" throughout, matching the shipped
 * `ui/src/pages/x/apps/rollout` module they reuse — renaming the label must not
 * mean renaming the code.
 */

/** The user-facing name for one of these things. */
const featureName = 'Rollout';
/** Plural of `featureName`. Used for the page title and the nav entry. */
const featureNamePlural = 'Rollouts';

export const rolloutsConsoleCopy = {
  featureName,
  featureNamePlural,

  pageTitle: featureNamePlural,

  /**
   * The one-sentence explanation under the page title.
   *
   * NOT the reference's own paragraph, copied. The mockup's fixture sentence
   * names a "change workflow" and stage prerequisites in its own words; this
   * says the same thing in the product's — a rollout advances through stages
   * one promotion at a time, and a stage only opens once its prerequisite is
   * satisfied. Kept short deliberately: an operator reading this forty times a
   * week needs it to be skippable, not a second `states` legend in prose.
   */
  pageIntro:
    'A rollout advances a named change through its stages, one promotion at a time. ' +
    'A stage opens only once the one before it satisfies its prerequisites.',

  /** The states, in the order the design puts them: exceptions first. */
  states: {
    ready: { label: 'Ready to Promote', hint: 'waiting on you' },
    degraded: { label: 'Degraded', hint: 'live status failing' },
    blocked: { label: 'Unreleased changes', hint: 'needs a Release' },
    progressing: { label: 'Progressing', hint: 'no action needed' },
    complete: { label: 'Complete', hint: 'the workflow says done' },
    /*
     * Two claims, and only one of them was checked. The workflow is done — the
     * change reached the last stage and satisfied everything declared — but a
     * workflow declaring no final health check never asked whether the last
     * stage is healthy, so the chip does not answer it either. The hint says
     * which half is missing rather than hedging the whole verdict.
     */
    'complete-unverified': { label: 'Complete, unverified', hint: 'health not checked' },
    aborted: { label: 'Aborted', hint: 'closed, not promoted' },
    'no-workflow': { label: 'No ChangeWorkflow', hint: 'nothing governs it' },
    /*
     * The state name is `ConsoleState`'s own, deliberately. The WORDING is
     * not: `rolloutCopy.emptyNoStages` says "this rollout", which is a
     * sentence about one rollout's own page and reads as a category error
     * on a fleet-wide list. One vocabulary for the condition, one register
     * per surface.
     */
    'no-stages': { label: 'No stages', hint: 'nowhere to promote to' },
    unknown: { label: 'Not reported', hint: 'server did not answer' },
  },

  filters: {
    searchPlaceholder: `Search ${featureNamePlural}`,
    state: 'State',
    space: 'Space',
    allStates: 'All states',
    allSpaces: 'All Spaces',
    clear: 'Clear filters',
  },

  columns: {
    name: featureName,
    stages: 'Stages',
    blocker: 'Blocker',
    age: 'Age',
    state: 'State',
  },

  /** `2 of 4 done`. Stage counts, not unit counts. */
  stagesDone: (done: number, total: number) => `${done} of ${total} done`,
  nextStage: (stage: string) => `next: ${stage}`,
  noBlocker: 'No blocker.',
  /**
   * The Blocker cell for a rollout that has reached every stage but whose
   * workflow does not call it done — `final.prerequisites` is evaluated against
   * the last stage, so a released rollout can still be held by a `healthy` that
   * has not gone green. There is no next stage whose gate could be quoted, which
   * is why this states the condition rather than naming a check.
   */
  finalPrerequisitesHeld:
    "Every stage has taken the change, but the ChangeWorkflow's final prerequisites are not satisfied.",
  /**
   * The Blocker cell when the row is Degraded but the failing check cannot be
   * named — which the state derivation makes unreachable, since 'degraded' is
   * derived FROM that check failing.
   *
   * The cell used to read "No blocker." here: reassurance printed directly
   * beside a Degraded chip. Not a wrong answer so much as an answer to the
   * wrong question — the cell reports what stops the NEXT promotion, and for a
   * rollout already through its last stage the honest answer to that is
   * "nothing". The reader's question is not that one.
   *
   * The normal path does better than this string: it returns the failing
   * gate's own `reason`, which is `cub`'s wording and names the offending
   * Space ("prod-eu-west is not healthy."). This is the floor, not the target,
   * and it uses the same words as `states.degraded.hint` so the chip and the
   * cell never tell two stories.
   */
  degradedBlocker: 'Live status failing.',

  /**
   * The Blocker cell for a rollout that is unhealthy AND still promotable.
   *
   * The chip says Degraded and the button says Promote, and both are right: a
   * stage the change has reached reports a failing workload, and the stage
   * being entered declares no health prerequisite, so `cub` promotes into it.
   * Without the second clause the pair reads as a contradiction — a warning
   * beside a button that ignores it — and a reader has no way to tell which of
   * the two to believe.
   *
   * The failure comes first because it is the news. The clause after it says
   * why the promotion is still offered, in the workflow's own terms.
   */
  degradedButUngated: (reason: string, nextStage: string) =>
    `${reason} The workflow asks for no health check before ${nextStage}, so this promotion is not held.`,

  /**
   * The Blocker cell for a rollout the workflow calls done without ever asking
   * about the last stage's health.
   *
   * Nothing is blocking it, and "No blocker." is still the wrong sentence: a
   * stage's prerequisites are evaluated over the stage BEFORE it, so with no
   * `Final` health check the last stage — production, wherever there is one —
   * appears in no check at all. This cell is the only place that gap is stated.
   * It names the remedy, because the remedy is one field on the workflow.
   */
  finalHealthNotChecked:
    'Done, but unchecked: the ChangeWorkflow asks for no health check on its last stage, ' +
    'so nothing has confirmed the change is healthy there. Add Healthy to the workflow’s Final prerequisites.',

  /**
   * The Blocker cell for a rollout the workflow calls done while a stage still
   * holds a Space the change never reached.
   *
   * Reachable whenever a Space joins an earlier stage after the rollout has been
   * through it: completion is read off the LAST stage, so the chip stays
   * Complete and this stage is simply left behind. Names the stage, because the
   * reader's next move is to promote into it or to take it out of the stage.
   */
  stageLeftBehind: (stage: string) =>
    `Done, with ${stage} left behind: it holds a Space the change never reached.`,

  /**
   * The Blocker cell for a rollout with no stage sequence to travel.
   *
   * Covers both ways a rollout arrives there — Spaces with no `Stage` label,
   * and Spaces all labelled `Stage=None` — because the two are one condition
   * to the reader and naming the label state would be right in one case and
   * wrong in the other. What they share is what this says: nothing this
   * rollout targets is in a stage, so no promotion is possible.
   */
  noStagesBlocker:
    'No Space this targets is in a promotion stage, so it has nowhere to promote to. ' +
    'Set a Stage label on the Spaces it should travel through.',

  /**
   * Deliberately does NOT say "no rollouts". A failed read knows nothing about
   * how many rollouts exist, and saying otherwise turns a server problem into a
   * false statement about the fleet.
   */
  loadFailed:
    'Could not load rollouts. This says nothing about how many exist — the request did not come back.',

  /**
   * Shown when a refresh fails but we still hold a list. Says the list is old
   * rather than implying it is current, which is the whole reason for keeping
   * it on screen instead of blanking the page.
   */
  refreshFailed: 'Could not refresh. The rollouts below are from the last successful load.',

  empty: {
    none: `No ${featureNamePlural.toLowerCase()} yet.`,
    filtered: `No ${featureNamePlural.toLowerCase()} match these filters.`,
  },

  /**
   * Shown when the server did not return the derived propagation fields at all.
   * Distinct from "nothing has been promoted", which is what a naive empty
   * reading would show, and which would be a confident lie.
   */
  progressUnavailable:
    'This server did not report where these changes have reached, so stage progress is unknown.',

  /**
   * The Blocker cell for a rollout no ChangeWorkflow governs.
   *
   * Says what to do about it, because there is something: the command that
   * attaches a workflow, compressed to fit one cell. Waiting is not the answer
   * here — nothing is in flight — so this must never be confused with
   * `workflowUnavailable` below.
   */
  noWorkflow:
    'No ChangeWorkflow governs this rollout, so it has no stages. Create ChangeOrders with cub changeorder create --change-workflow <name>.',

  /**
   * The Blocker cell when a rollout names a workflow but carries no copy of its
   * rules.
   *
   * There is nothing to wait for. The rules travel with the ChangeOrder, taken
   * when it was created, so a rollout that arrived without them will not
   * acquire them later — which is why this says what is missing rather than
   * asking the reader to try again.
   */
  workflowUnavailable:
    'This rollout names a ChangeWorkflow but carries no copy of its rules, so its stages cannot be shown.',

  /**
   * The Blocker cell when the rollout's base Space carries no `Component` label.
   *
   * A stage selects within one component, and the component is the rollout's own
   * rather than anything the definition names, so without that label there is no
   * stage membership to compute. Reported rather than resolved without the term:
   * a stage resolved on `Labels.Stage` alone would pull in every other
   * component's Spaces at that stage, which reads as a much larger rollout than
   * exists. The label is what `cub variant promote` reads too, and it refuses
   * outright for the same reason.
   */
  noComponent:
    'The Space this rollout starts in has no Component label, so its ChangeWorkflow stages cannot be resolved to Spaces.',
} as const;
