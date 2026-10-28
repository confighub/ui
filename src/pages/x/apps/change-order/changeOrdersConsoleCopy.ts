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

  /** The states, in the order the design puts them: exceptions first. */
  states: {
    ready: { label: 'Ready to Promote' },
    degraded: { label: 'Degraded' },
    blocked: { label: 'Unreleased changes' },
    held: { label: 'Held' },
    progressing: { label: 'Progressing' },
    complete: { label: 'Complete' },
    'complete-unverified': { label: 'Complete, unverified' },
    aborted: { label: 'Aborted' },
    'no-workflow': { label: 'No ChangeWorkflow' },
    /*
     * The state name is `ConsoleState`'s own, deliberately. The WORDING is
     * not: `changeOrderCopy.emptyNoStages` says "this ChangeOrder", which is a
     * sentence about one ChangeOrder's own page and reads as a category error
     * on a fleet-wide list. One vocabulary for the condition, one register
     * per surface.
     */
    'no-stages': { label: 'No stages' },
    unknown: { label: 'Not reported' },
  },

  /** The summary cards above the list, one per `ConsoleGroup`, in card order. The label is enough: no hint line. */
  groups: {
    'needs-you': { label: 'Needs you' },
    stuck: { label: 'Stuck' },
    'in-progress': { label: 'In progress' },
    finished: { label: 'Finished' },
  },

  filters: {
    searchPlaceholder: `Search ${featureNamePlural}`,
    state: 'State',
    space: 'Space',
    component: 'Component',
    updateType: 'Update type',
    createdFrom: 'Created from',
    createdTo: 'to',
    /** The State filter's value when nothing is selected: every row shows. */
    allStates: 'All',
    /** The State filter's heading for the states no summary card counts. */
    otherStates: 'Other',
    /** The tail of the State filter's value once more than two states are named. */
    moreStates: (n: number) => `+${n}`,
    allSpaces: 'All Spaces',
    allComponents: 'All Components',
    allUpdateTypes: 'All update types',
    clear: 'Clear filters',
  },

  columns: {
    name: featureName,
    component: 'Component',
    imageChange: 'Image change',
    stages: 'Stages',
    blocker: 'Blocker',
    createdBy: 'Created by',
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
  finalPrerequisitesHeld: 'Final prerequisites are not satisfied.',
  /**
   * The Blocker cell for a ChangeOrder the server reports `Resolved`: every Space
   * in scope has taken the change, and not every one has released it.
   */
  notReleasedEverywhere: 'Not released in every Space.',
  /**
   * The Blocker cell for a ChangeOrder with every stage done that the server does
   * not call finished, when a Space it is headed for is in none of its stages.
   */
  inScopeSpaceNotInStage: 'A Space in scope is in no stage.',
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
   * and it stays short so the chip and the cell never tell two stories.
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
   * why the promotion is still offered.
   */
  degradedButUngated: (reason: string, nextStage: string) => `${reason} Not held: no health check before ${nextStage}.`,

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
  finalHealthNotChecked: 'Done, health not checked. Add Healthy to the workflow’s Final prerequisites.',

  /**
   * The Blocker cell for a ChangeOrder the workflow calls done while a stage still
   * holds a Space the change never reached.
   *
   * Reachable whenever a Space joins an earlier stage after the ChangeOrder has been
   * through it: completion is read off the LAST stage, so the chip stays
   * Complete and this stage is simply left behind. Names the stage, because the
   * reader's next move is to promote into it or to take it out of the stage.
   */
  stageLeftBehind: (stage: string) => `${stage} has a Space the change never reached.`,

  /**
   * The Blocker cell for a ChangeOrder with no stage sequence to travel.
   *
   * Covers both ways a ChangeOrder arrives there — Spaces with no `Stage` label,
   * and Spaces all labelled `Stage=None` — because the two are one condition
   * to the reader and naming the label state would be right in one case and
   * wrong in the other. What they share is what this says: nothing this
   * ChangeOrder targets is in a stage, so no promotion is possible.
   */
  noStagesBlocker: 'No target Space is in a stage. Set a Stage label on them.',

  /**
   * Deliberately does NOT say "no ChangeOrders". A failed read knows nothing about
   * how many ChangeOrders exist, and saying otherwise turns a server problem into a
   * false statement about the fleet.
   */
  loadFailed: 'Could not load ChangeOrders.',

  /**
   * Shown when a refresh fails but we still hold a list. Says the list is old
   * rather than implying it is current, which is the whole reason for keeping
   * it on screen instead of blanking the page.
   */
  refreshFailed: 'Could not refresh. Showing the last loaded list.',

  empty: {
    none: `No ${featureNamePlural}`,
    filtered: 'No matches',
  },

  /**
   * Shown when the server did not return the derived propagation fields at all.
   * Distinct from "nothing has been promoted", which is what a naive empty
   * reading would show, and which would be a confident lie.
   */
  progressUnavailable: 'The server did not report stage progress.',

  /**
   * The Blocker cell for a ChangeOrder no ChangeWorkflow governs.
   *
   * Says what to do about it, because there is something: the command that
   * attaches a workflow, compressed to fit one cell. Waiting is not the answer
   * here — nothing is in flight — so this must never be confused with
   * `workflowUnavailable` below.
   */
  noWorkflow: 'No ChangeWorkflow, so no stages. Use cub changeorder create --change-workflow <name>.',

  /**
   * The Blocker cell when a ChangeOrder names a workflow but carries no copy of its
   * rules.
   *
   * There is nothing to wait for. The rules travel with the ChangeOrder, taken
   * when it was created, so a ChangeOrder that arrived without them will not
   * acquire them later — which is why this says what is missing rather than
   * asking the reader to try again.
   */
  workflowUnavailable: 'Its ChangeWorkflow rules are missing, so stages cannot be shown.',

} as const;
