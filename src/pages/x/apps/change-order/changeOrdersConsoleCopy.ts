// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every user-facing string on the ChangeOrders console.
 *
 * THE NAME IS "ChangeOrder", THE SAME WORD THE CLI, THE API AND THE DATA MODEL
 * USE. A ChangeOrder in motion is not a separate thing and gets no name of its
 * own, here or in code: files, types and functions say "ChangeOrder" as well.
 * The reference design (`3-orders-console.html`) writes "Change Orders"; the
 * product writes the entity's name as one word, so translate the noun when
 * porting from that file.
 *
 * The name still lives in one place rather than being inlined, because it
 * appears in a dozen composed strings ("Search ChangeOrders", "No ChangeOrders
 * match these filters").
 */

/** The user-facing name for one of these things. */
const featureName = 'ChangeOrder';
/** Plural of `featureName`. Used for the page title and the nav entry. */
const featureNamePlural = 'ChangeOrders';

export const changeOrdersConsoleCopy = {
  featureName,
  featureNamePlural,

  pageTitle: featureNamePlural,

  /**
   * The one-sentence explanation under the page title.
   *
   * NOT the reference's own paragraph, copied. The mockup's fixture sentence
   * names a "change workflow" and stage prerequisites in its own words; this
   * says the same thing in the product's — a ChangeOrder advances through stages
   * one promotion at a time, and a stage only opens once its prerequisite is
   * satisfied. Kept short deliberately: an operator reading this forty times a
   * week needs it to be skippable, not a second `states` legend in prose.
   */
  pageIntro:
    'A ChangeOrder advances a named change through its stages, one promotion at a time. ' +
    'A stage opens only once the one before it satisfies its prerequisites.',

  /** The states, in the order the design puts them: exceptions first. */
  states: {
    ready: { label: 'Ready to Promote', hint: 'waiting on you' },
    degraded: { label: 'Degraded', hint: 'live status failing' },
    blocked: { label: 'Unreleased changes', hint: 'needs a Release' },
    held: { label: 'Held', hint: 'a prerequisite is not met' },
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
     * not: `changeOrderCopy.emptyNoStages` says "this ChangeOrder", which is a
     * sentence about one ChangeOrder's own page and reads as a category error
     * on a fleet-wide list. One vocabulary for the condition, one register
     * per surface.
     */
    'no-stages': { label: 'No stages', hint: 'nowhere to promote to' },
    unknown: { label: 'Not reported', hint: 'server did not answer' },
  },

  /** The summary cards above the list, one per `ConsoleGroup`, in card order. */
  groups: {
    'needs-you': { label: 'Needs you', hint: 'ready to promote' },
    stuck: { label: 'Stuck', hint: 'needs a fix to move' },
    'in-progress': { label: 'In progress', hint: 'no action needed' },
    finished: { label: 'Finished', hint: 'complete or aborted' },
  },

  filters: {
    searchPlaceholder: `Search ${featureNamePlural}`,
    state: 'State',
    space: 'Space',
    component: 'Component',
    /** The State filter's value when nothing is selected: every row shows. */
    allStates: 'All',
    /** The State filter's heading for the states no summary card counts. */
    otherStates: 'Other',
    /** The tail of the State filter's value once more than two states are named. */
    moreStates: (n: number) => `+${n}`,
    allSpaces: 'All Spaces',
    allComponents: 'All Components',
    clear: 'Clear filters',
  },

  columns: {
    name: featureName,
    component: 'Component',
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
   * The Blocker cell for a ChangeOrder that has reached every stage but whose
   * workflow does not call it done — `final.prerequisites` is evaluated against
   * the last stage, so a released ChangeOrder can still be held by a `healthy` that
   * has not gone green. There is no next stage whose gate could be quoted, which
   * is why this states the condition rather than naming a check.
   */
  finalPrerequisitesHeld:
    "Every stage has taken the change, but the ChangeWorkflow's final prerequisites are not satisfied.",
  /**
   * The Blocker cell for a ChangeOrder the server reports `Resolved`: every Space
   * in scope has taken the change, and not every one has released it.
   */
  notReleasedEverywhere: 'Every stage has taken the change, but not every Space has released it.',
  /**
   * The Blocker cell for a ChangeOrder with every stage done that the server does
   * not call finished, when a Space it is headed for is in none of its stages.
   */
  inScopeSpaceNotInStage: 'Not every in-scope Space is in a stage yet.',
  /**
   * The Blocker cell when the row is Degraded but the failing check cannot be
   * named — which the state derivation makes unreachable, since 'degraded' is
   * derived FROM that check failing.
   *
   * The cell used to read "No blocker." here: reassurance printed directly
   * beside a Degraded chip. Not a wrong answer so much as an answer to the
   * wrong question — the cell reports what stops the NEXT promotion, and for a
   * ChangeOrder already through its last stage the honest answer to that is
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
   * The Blocker cell for a ChangeOrder that is unhealthy AND still promotable.
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
   * The Blocker cell for a ChangeOrder the workflow calls done without ever asking
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
   * The Blocker cell for a ChangeOrder the workflow calls done while a stage still
   * holds a Space the change never reached.
   *
   * Reachable whenever a Space joins an earlier stage after the ChangeOrder has been
   * through it: completion is read off the LAST stage, so the chip stays
   * Complete and this stage is simply left behind. Names the stage, because the
   * reader's next move is to promote into it or to take it out of the stage.
   */
  stageLeftBehind: (stage: string) =>
    `Done, with ${stage} left behind: it holds a Space the change never reached.`,

  /**
   * The Blocker cell for a ChangeOrder with no stage sequence to travel.
   *
   * Covers both ways a ChangeOrder arrives there — Spaces with no `Stage` label,
   * and Spaces all labelled `Stage=None` — because the two are one condition
   * to the reader and naming the label state would be right in one case and
   * wrong in the other. What they share is what this says: nothing this
   * ChangeOrder targets is in a stage, so no promotion is possible.
   */
  noStagesBlocker:
    'No Space this targets is in a promotion stage, so it has nowhere to promote to. ' +
    'Set a Stage label on the Spaces it should travel through.',

  /**
   * Deliberately does NOT say "no ChangeOrders". A failed read knows nothing about
   * how many ChangeOrders exist, and saying otherwise turns a server problem into a
   * false statement about the fleet.
   */
  loadFailed:
    'Could not load ChangeOrders. This says nothing about how many exist — the request did not come back.',

  /**
   * Shown when a refresh fails but we still hold a list. Says the list is old
   * rather than implying it is current, which is the whole reason for keeping
   * it on screen instead of blanking the page.
   */
  refreshFailed: 'Could not refresh. The ChangeOrders below are from the last successful load.',

  empty: {
    none: `No ${featureNamePlural} yet.`,
    filtered: `No ${featureNamePlural} match these filters.`,
  },

  /**
   * Shown when the server did not return the derived propagation fields at all.
   * Distinct from "nothing has been promoted", which is what a naive empty
   * reading would show, and which would be a confident lie.
   */
  progressUnavailable:
    'This server did not report where these changes have reached, so stage progress is unknown.',

  /**
   * The Blocker cell for a ChangeOrder no ChangeWorkflow governs.
   *
   * Says what to do about it, because there is something: the command that
   * attaches a workflow, compressed to fit one cell. Waiting is not the answer
   * here — nothing is in flight — so this must never be confused with
   * `workflowUnavailable` below.
   */
  noWorkflow:
    'No ChangeWorkflow governs this ChangeOrder, so it has no stages. Create ChangeOrders with cub changeorder create --change-workflow <name>.',

  /**
   * The Blocker cell when a ChangeOrder names a workflow but carries no copy of its
   * rules.
   *
   * There is nothing to wait for. The rules travel with the ChangeOrder, taken
   * when it was created, so a ChangeOrder that arrived without them will not
   * acquire them later — which is why this says what is missing rather than
   * asking the reader to try again.
   */
  workflowUnavailable:
    'This ChangeOrder names a ChangeWorkflow but carries no copy of its rules, so its stages cannot be shown.',

} as const;
