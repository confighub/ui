// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every user-visible string the rollout views print.
 *
 * Centralised for three reasons, all of them enforcement rather than tidiness:
 *
 * 1. **No "unit" / "units", anywhere.** A rollout talks about Spaces,
 *    components, resources, paths and releases. "Unit" is our word, not the
 *    user's, and the design brief bans it outright from this view. A Playwright
 *    invariant asserts it never appears; keeping the strings in one file is what
 *    makes that assertion meaningful rather than a spot-check.
 *
 * 2. **Gate reasons must match `cub` verbatim.** The gate wording below is
 *    copied from `validateStageEntryGates` (public/cmd/cub/variant_promote.go),
 *    which is the only other implementation of this sequence. If the two drift,
 *    a user who runs `cub variant promote` after being refused by this UI gets
 *    a different story about the same refusal. Change these only alongside that
 *    file.
 *
 * 3. **We never print a label key that does not exist.** The design mockup's
 *    lane heads read `stage=X  next_stage=Y`. There is no label key to be
 *    faithful to any more: order now comes from the workflow's declared
 *    `spec.stages` sequence, not an inferred label pointer. We print the
 *    stage's own name and, for its gate reason, the previous stage's name.
 *    See `laneLabels` below.
 */

/**
 * What to print as a stage's name, anywhere a stage is named to a person.
 *
 * The synthetic source row has a SYNTHETIC id (`SOURCE_STAGE_ID`), which makes
 * a good identity and an impossible label: printed verbatim it puts
 * `__rollout_source__` in front of a reader. This says "source" instead.
 *
 * ⚠️ THE CALLER SAYS WHICH ROW IT HOLDS; THIS DOES NOT GUESS FROM THE NAME.
 * The server accepts a stage genuinely called `__rollout_source__`, so a name
 * test here renamed that stage to "source" on screen — a row labelled as
 * something the workflow never called it. Every caller already has the fact:
 * `RolloutStage.isSource`, `ConsoleStage.isSource`, or a stage state's
 * `verdict === 'source'`.
 *
 * Lives here, in one place, because it is needed by the console, the detail
 * screen and the stage strip. Three copies of "what do we call the source row"
 * is the drift the rest of this module exists to prevent.
 */
export function stageDisplayName(stageId: string, isSource: boolean): string {
  return isSource ? 'source' : stageId;
}

/**
 * What to print for the row a stage is entered FROM, or null when nothing is
 * ahead of it.
 *
 * The first stage's predecessor is the synthetic source row, so its
 * `previousStageId` holds `SOURCE_STAGE_ID` — printed verbatim it puts
 * `__rollout_source__` in a lane head, the one thing `stageDisplayName` exists
 * to prevent. Which stage is first is `isFirst`, the position the sequence
 * builder recorded, so a stage a workflow genuinely calls `__rollout_source__`
 * still prints its own name wherever it is not the first one.
 */
export function previousStageDisplayName(stage: {
  previousStageId: string | null;
  isFirst: boolean;
}): string | null {
  if (stage.previousStageId === null) return null;
  return stageDisplayName(stage.previousStageId, stage.isFirst);
}
/** Terminology fixed by the design brief. Used exactly, nowhere paraphrased. */
export const ROLLOUT_TERMS = {
  gated: 'Gated',
} as const;

export const rolloutCopy = {
  // ── Empty states. Honest, and each says what to do about it. ──
  emptyNoStages: {
    title: 'No stage of this rollout selects any Space',
    body: 'Every stage of the governing ChangeWorkflow resolved to zero Spaces. Check the WhereSpace expression on each stage of the workflow.',
  },
  // ── Progress ──
  /**
   * A ChangeOrder whose interval is empty carries no change at all, so nothing
   * will ever move through the stages.
   *
   * Its progress count is 0 of N, which is arithmetically right and reads as "a
   * rollout waiting to start". It is not waiting — there is nothing to promote.
   * So the headline says that instead, and the body says how it happens, because
   * the fix is upstream of this view.
   */
  carriesNothing: {
    title: 'This ChangeOrder carries no change',
    body: 'No revision belongs to its interval, so there is nothing for the stages below to promote and nothing will move. This usually means the ChangeSet was not opened before the change was made, or the ChangeOrder was cut over a Space that holds no resources.',
    progressLabel: 'Carries no change',
  },

  /**
   * Shown INSTEAD of a count when the server could not derive the ChangeOrder's
   * progress. Never say "0 of 3 promoted" in that case: the payload for "could
   * not derive" and for "nothing promoted yet" is identical apart from the
   * missing base Space, and guessing wrong tells the user a rollout has not
   * moved when it may well have. See RolloutProgressAvailability.
   */
  progressUnavailable: 'Rollout progress is unavailable',
  progressUnavailableDetail:
    'The server did not report where this ChangeOrder has got to, so the stages below cannot be shown as promoted or not. This does not mean nothing has been promoted.',
  stagesPromoted: (done: number, total: number) => `${done} of ${total} stages promoted`,

  // ── Lane heads. No label keys — see the file header, point 3. ──
  /** Lane head subtitle: the stage's name and, when it has one, the stage
   * ahead of it in the workflow's declared order. No label keys to print --
   * the order is the workflow's `Stages` array position, not an inferred
   * pointer. */
  laneLabels: (stage: string, previousStage: string | null) =>
    previousStage ? `${stage} ← ${previousStage}` : stage,
  /** Neutral forward-direction copy, for where the sequence has to be said in words. */
  nextStage: (stage: string) => `next: ${stage}`,

  /**
   * The lane head's third line: the two numbers that decide whether you need to
   * open the stage at all. Both already live on `RolloutStageState`, so this
   * composes them rather than deriving anything.
   *
   * Says nothing at all when progress is unavailable except so — a promoted
   * count we cannot back up is exactly the claim `RolloutProgressAvailability`
   * exists to refuse.
   */
  lanePromoted: (promoted: number, total: number) => `${promoted} of ${total} promoted`,
  /**
   * The gate tally beside the lane head's padlock. Short because the glyph
   * already says what is being counted, where the old prose had to.
   *
   * Deliberately silent on WHY the remainder is unsatisfied. `tallyGates`
   * cannot tell an unevaluated gate from a failed one — neither increments
   * `satisfied` — so this must never be rendered as "1 failed" or "2 blocking".
   * A closed padlock is the right shape for exactly that reason: it says held,
   * not judged. Same discipline as `gateSummary`.
   */
  laneGateTally: (satisfied: number, total: number) => `${satisfied}/${total}`,
  /**
   * A stage with no previous stage has no gate to hold it, which
   * `validateStageEntryGates` treats as "no prerequisite". Said in
   * words with no padlock: there is no lock to draw open or closed, and drawing
   * an open one would assert a check that was passed rather than never applied.
   */
  laneNoGate: 'no gate holds it',
  /** The lane's own word for a stage whose gates nobody could evaluate. */
  laneGatesUnknown: 'not checked',
  /** Accessible name for the lane head, which is a control now, not a caption. */
  laneHeadLabel: (stage: string) => `Select stage ${stage}`,

  // ── Stage and Space verdicts ──
  stageVerdict: {
    source: 'Change landed',
    gated: ROLLOUT_TERMS.gated,
    waiting: 'Ready to promote',
    'in-progress': 'In progress',
    promoted: 'Promoted, not released',
    released: 'Promoted and released',
    restored: 'Restored, not released',
    'restore-released': 'Restored and released',
    unknown: 'Progress unavailable',
  },
  laneVerdict: {
    source: 'source',
    gated: ROLLOUT_TERMS.gated,
    waiting: 'Ready',
    'in-progress': 'Promoting',
    promoted: 'Promoted',
    released: 'Promoted',
    // The pill has room for one word, and the word that matters is that the
    // change is no longer there. Whether the undoing has been released is the
    // stage's own sentence to make, not the pill's.
    restored: 'Restored',
    'restore-released': 'Restored',
    unknown: 'Unknown',
  },
  spaceStrip: {
    source: 'Change enters here',
    gated: (previousStage: string) => `Waiting on ${previousStage}`,
    waiting: 'Ready to promote',
    promoting: 'Promoting',
    promoted: 'Promoted, not released',
    released: 'Promoted and released',
    restored: 'Restored, not released',
    'restore-released': 'Restored and released',
    unknown: 'Progress unavailable',
  },

  /**
   * "N of M spaces promoted", plus an in-flight clause when one of our own
   * promotes is running. Singular/plural handled so the summary never reads
   * "1 spaces".
   */
  stageProgress: (promoted: number, total: number, inFlight: number) => {
    const spaces = total === 1 ? 'space' : 'spaces';
    const base = `${promoted} of ${total} ${spaces} promoted`;
    return inFlight > 0 ? `${base} · ${inFlight} in flight` : base;
  },
  gateSummary: (satisfied: number, total: number) => `gates: ${satisfied} of ${total} satisfied`,
  /**
   * Names the blocking gate's own reason in the one-glance summary line (D8,
   * U10). Composes an existing, `cub`-verbatim reason string — never re-derives
   * or re-words one. With no accordion and no footer reason left (D7b, D7c),
   * this line is the only remaining route to "why", so it must say more than
   * the bare gate count.
   */
  blockedByReason: (reason: string) => `blocked: ${reason}`,
  /**
   * What is holding the stage, stated as BOTH counts before the reason.
   *
   * A failed check and an unmade one are different claims, and the summary has
   * to carry both or it misreports one as the other. The reason quoted belongs
   * to whichever gate best explains the hold — a failure when there is one —
   * so the sentence never names a cause that is merely unknown while a known
   * one sits behind it.
   */
  blockedBy: (failed: number, notEvaluated: number, reason: string) => {
    if (failed > 0 && notEvaluated > 0) {
      return `blocked: ${reason} (${failed} failed, ${notEvaluated} not checked)`;
    }
    if (failed > 0) {
      return failed === 1 ? `blocked: ${reason}` : `blocked: ${reason} (${failed} failed)`;
    }
    return notEvaluated === 1
      ? `not checked: ${reason}`
      : `not checked: ${reason} (${notEvaluated} not checked)`;
  },

  // ── Gates ────────────────────────────────────────────────────────────────
  gateNames: {
    promoted: 'check/promoted',
    healthy: 'check/healthy',
    released: 'check/released',
    validated: 'check/validated',
    unrecognizedPrerequisite: 'check/unrecognized-prerequisite',
    /**
     * Named after the check the workflow declared, so a reader can match the
     * row to the line in the workflow rather than to a generic label.
     */
    customPrerequisite: (name: string) => `check/${name}`,
  },
  gateTag: {
    satisfied: 'satisfied',
    unsatisfied: 'unsatisfied',
    notEvaluated: 'not evaluated',
  },

  /**
   * What a Space REPORTS about itself, as opposed to what a gate decides about
   * it. A separate section because the two answer different questions and a
   * reader has to be able to tell them apart on screen: `cub` states a verdict
   * it reached ("myapp-dev is not synced."), and these state an observation
   * carried by the live status of the Release the Space is running
   * ("myapp-dev reports it is not synced."). They are NOT CLI wording and must
   * never be used for a gate.
   */
  reportedStatus: {
    notSynced: (variant: string) => `${variant} reports it is not synced.`,
    stillDeploying: (variant: string) => `${variant} reports its deployment is still running.`,
    notSucceeded: (variant: string) => `${variant} reports its deployment did not succeed.`,
    notHealthy: (variant: string) => `${variant} reports it is not healthy.`,
  },

  /**
   * Gate reasons.
   *
   * The `cub*` entries are the CLI's own wording, reused verbatim so a user
   * refused by this UI and a user refused by `cub variant promote` are told the
   * same thing. Do not "improve" them in isolation.
   */
  gateReasons: {
    /** `cub`: "unable to promote to stage '%s', its previous stage '%s' selects no Space" */
    cubPreviousStageSelectsNothing: (currentStage: string, previousStage: string) =>
      `Stage '${previousStage}' selects no Space, so promotion to '${currentStage}' cannot be evaluated.`,
    stagePromotedReason: (previousStage: string, count: number) =>
      `${previousStage} is the previous stage and has ${count} ${count === 1 ? 'Space' : 'Spaces'}.`,

    /** `cub`: "Variant '%s' has not published a release carrying change order '%s'" */
    cubNoReleaseCarrying: (variant: string, changeOrder: string) =>
      `${variant} has not published a release carrying '${changeOrder}'.`,
    /** `cub`: "Variant '%s' has no live status for release %d yet" */
    cubLiveStatusMissing: (variant: string, releaseNum: number) =>
      `${variant} has no live status for release ${releaseNum} yet.`,
    /** `cub`: "Variant '%s' release %d is not synced (%s)" */
    cubNotSynced: (variant: string, releaseNum: number, sync: string) =>
      `${variant} release ${releaseNum} is not synced (${sync}).`,
    /** `cub`: "Variant '%s' release %d is still being deployed" */
    cubStillDeploying: (variant: string, releaseNum: number) =>
      `${variant} release ${releaseNum} is still being deployed.`,
    /** `cub`: "Variant '%s' release %d failed to deploy" */
    cubDeployFailed: (variant: string, releaseNum: number) =>
      `${variant} release ${releaseNum} failed to deploy.`,
    /** `cub`: "Variant '%s' release %d is not healthy (%s)" */
    cubNotHealthy: (variant: string, releaseNum: number, health: string) =>
      `${variant} release ${releaseNum} is not healthy (${health}).`,
    liveStatusGreen: (previousStage: string) =>
      `Every Space of ${previousStage} is synced, healthy and deployed.`,
    /**
     * `cub`: "Variant '%s' has no ReleaseTargetID, so its health cannot be
     * determined". Not a pass and not a failure — the check could not be made,
     * and saying otherwise would grant a verdict nothing earned.
     */
    liveStatusTargetless: (variant: string) =>
      `Not evaluated. ${variant} has no release target, so its health cannot be determined.`,
    /**
     * The previous stage's Spaces, or their Releases, have not loaded yet.
     * Distinct from their live status being absent — one is "we have not
     * looked", the other is "we looked and nothing is reported" — and only the
     * second is a reason to hold a stage.
     */
    liveStatusLoading: (previousStage: string) =>
      `Not evaluated yet. Still reading the live status of ${previousStage}.`,

    /** `cub`: "Variant '%s' has not taken change order '%s'" */
    cubNotTaken: (variant: string, changeOrder: string) =>
      `${variant} has not taken '${changeOrder}'.`,
    /** `cub`: "Variant '%s' has taken change order '%s' but has not released it" */
    cubTakenNotReleased: (variant: string, changeOrder: string) =>
      `${variant} has taken '${changeOrder}' but has not released it.`,
    upstreamStageReleased: (previousStage: string) =>
      `${previousStage} has taken and released this change.`,
    /**
     * A Space with no release target can never release anything, so having
     * taken the change is all the `Released` check can ask of it.
     */
    releasedTargetless: (previousStage: string) =>
      `${previousStage} has taken this change; its Spaces without a release target have nothing to release.`,

    /**
     * Shown for a gate that has not been assessed because an earlier one in the
     * sequence has not been satisfied. This is the true state — the check has
     * genuinely not run — so it is neither a pass nor a failure.
     */
    notEvaluated: (previousStage: string) =>
      `Not evaluated. ${previousStage} has to be released first.`,
    /**
     * Shown when progress could not be derived at all. A gate that depends on
     * where the change has got to cannot be honestly judged in that case.
     */
    unknownProgress: 'Not evaluated. Rollout progress is unavailable.',
    /**
     * A Space of the previous stage has not been read, so whether it released
     * the change is unknown. Unknown is not exemption: an unread Space carries
     * no `ReleaseTargetID` either, and reading that absence as "releases
     * nothing, ever" would excuse it from the very check it has not had.
     */
    releasedLoading: (previousStage: string) =>
      `Not evaluated. Still reading the Spaces in '${previousStage}'.`,
    /*
     * A workflow naming a prerequisite this build does not implement. `cub`
     * refuses the promotion outright on this, so the honest surface is an
     * unsatisfied gate rather than silence: ignoring it would make this page
     * permit what the CLI refuses.
     */
    unrecognizedPrerequisite: (stageName: string, prerequisite: string) =>
      `Stage '${stageName}' declares prerequisite '${prerequisite}', which this page does not implement. Promotion is refused.`,
    /*
     * A check the workflow declared, written as a CEL expression. This page has
     * no CEL evaluator, so the true state is that the check has not been made —
     * said plainly, and never dressed as a verdict. The author's own
     * description is the most useful thing available about what it wants.
     */
    validated: (stageName: string) =>
      `Stage '${stageName}' requires that the change has no ValidationErrors in the stage ahead. This page cannot check it; \`cub variant promote --dry-run\` does.`,
    customPrerequisite: (stageName: string, prerequisite: string, description?: string) =>
      description !== undefined && description !== ''
        ? `Stage '${stageName}' gates on '${prerequisite}': ${description} This page cannot check it; \`cub variant promote\` does.`
        : `Stage '${stageName}' gates on '${prerequisite}', a check this page cannot make. \`cub variant promote\` does.`,
  },

  /**
   * Two sentences, because two different things have no gates and calling both
   * "the base" describes the wrong one.
   *
   * The base has none because it is where the change is made — nothing gates
   * entry to it. A STAGE has none when it has no previous stage, which
   * `validateStageEntryGates` treats as "no prerequisite, so no gate".
   * The verdict is identical; the reason is not, and a reader told that dev is
   * the base has been told something false about their own sequence.
   */
  noGates: {
    base: 'No gate applies to the base.',
    stage: (stage: string) => `No gate applies to ${stage}. It has no previous stage.`,
  },

  // ── Stage detail ──
  detailHeadGates: 'Gates on this stage',
  loadingValues: 'Working out what this ChangeOrder changes here…',
  /**
   * The per-unit marker for a resource this ChangeOrder does not touch (restored
   * after the pane rebuild — predecessor's `RolloutChangeTree.tsx`). Only shown
   * in the "All" view; "Incoming" filters an untouched resource out entirely,
   * so there is nothing here to mark there.
   */
  unchangedMarker: 'Unchanged',

  /**
   * The per-row marker that replaced the deleted tense header (D7, ruling 5).
   * `writtenMarker` reads as history — a record of what a promotion already
   * wrote, not something pending — and is never shown for a unit whose change
   * is still a live dry-run preview. `undeterminedMarker` is the honest
   * opposite of both: rule 16's first-fetch-failure gap, where the row cannot
   * yet say anything at all.
   */
  writtenMarker: 'Written',
  undeterminedMarker: 'Cannot be determined yet',
  /**
   * The base is not promoted into — the change is MADE there — so its step
   * shows where the change came from rather than a promoted count. Saying
   * "1 of 1 space promoted" would describe a promotion that never happened.
   */
  sourceProgress: 'The change starts here',
  /**
   * A stage whose selector matched no Space. Nothing can be promoted into it,
   * so neither a verdict like "Ready to promote" nor a "0 of 0" count is true.
   */
  stageHasNoSpaces: 'No Spaces in this stage',
  /**
   * A stage whose Spaces hold no resources yet. This is normal before the first
   * promote: the resources the change adds are cloned into the Space by the
   * promote itself, so there is genuinely nothing to diff against yet. Distinct
   * from `loadingValues` — both produce an empty unit list, and only
   * `stageSettled` at the call site tells them apart.
   */
  noResourcesYet:
    'These Spaces hold no resources for this ChangeOrder yet. The promote brings them in.',
  /**
   * The stage-first pane: stage header, variant roster, and the variant matrix.
   *
   * EVERY STRING HERE OBEYS THE FILE HEADER'S FIRST RULE — no "unit"/"units".
   * The matrix's own subject is a RESOURCE, its columns are VARIANTS, and the
   * things a promote writes into are SPACES. A Playwright invariant asserts the
   * banned word never reaches the pane, and the matrix is the largest block of
   * new copy this view has taken since it shipped.
   */
  stageOverview: {
    variantsHead: 'Variants in this stage',
    promotesHead: 'What this promotes here',
    /** Section-head count for a stage every Space of which contributed. */
    resourceFieldCount: (resources: number, fields: number) =>
      `${resources} ${resources === 1 ? 'resource' : 'resources'} · ${fields} ${fields === 1 ? 'field' : 'fields'}`,
    /**
     * Section-head count for a PART-POPULATED stage, where the resource count
     * is a floor rather than the stage's total.
     *
     * A mid-sequence promote failure leaves some Spaces populated and some not,
     * and the groups then cover only part of the stage. Presenting the count
     * bare would describe the whole stage using one Space's contents, so the
     * clause naming how many Spaces it came from is not decoration.
     */
    resourceCountPartial: (resources: number, contributing: number, total: number) =>
      `${resources} ${resources === 1 ? 'resource' : 'resources'}, from ${contributing} of ${total} Spaces`,
    /** Names the Spaces the count did NOT come from, so the floor is legible. */
    partialNote: (emptySpaces: string[], resources: number, populated: string) =>
      `${emptySpaces.join(' and ')} hold no resources for this ChangeOrder yet, so ${resources} is what this stage promotes into ${populated}, not the whole stage's total.`,

    // ── The matrix ──
    matrixResourceHead: 'resource',
    matrixFieldsHead: 'fields',
    /** Accessible label for one cell. A glyph in a grid has no context alone. */
    cellLabel: (resource: string, variant: string, meaning: string) =>
      `${resource} in ${variant}: ${meaning}`,
    cellMeaning: {
      same: 'takes it verbatim',
      differs: 'differs here',
      new: 'new here',
      unknown: 'cannot be determined yet',
    },
    cellTitle: {
      same: 'Takes the stage change verbatim.',
      differs: (variant: string) => `Differs here. Open ${variant}.`,
      new: 'Not here yet. The promote brings it in.',
      unknown: 'Could not be established this round. Not the same as unchanged.',
    },

    /**
     * The common case: nothing differs, so the grid is replaced by one line and
     * gives its pixels back to the diff. The matrix is never rendered when it
     * has nothing to report.
     */
    allSame: (variants: number) => `All ${variants} variants take the same change.`,
    showPerVariant: 'Show per variant',
    hidePerVariant: 'Hide per variant',

    /**
     * Past 8 columns the grid stops being readable, so only the divergent
     * resources are listed. Never a silent truncation: the line says how many
     * resources are not shown.
     */
    divergentOnly: (divergent: number, total: number) =>
      `${divergent} of ${total} ${total === 1 ? 'resource differs' : 'resources differ'} across these variants. The grid is replaced by this list because the stage has more than 8 Spaces.`,
    divergentIn: (variants: string[]) => `differs in ${variants.join(', ')}`,

    // ── The scope line above the diff ──
    /**
     * The diff below is ONE variant's, and the pane says which. Never implicit:
     * without this line the reader has no way to know the tree stopped being
     * the whole stage's.
     */
    diffScope: (variant: string, differing: number) =>
      differing === 0
        ? `Diff shown for ${variant}. No variant differs.`
        : `Diff shown for ${variant}. ${differing} ${differing === 1 ? 'variant differs' : 'variants differ'}.`,
    diffScopeOnlyPopulated: (variant: string) =>
      `Diff shown for ${variant}, the only populated variant.`,
    /** The per-resource marker in the stage tree: where the claim stops being universal. */
    differsIn: (variants: string[]) => `differs in ${variants.join(', ')}`,
    /** The same marker in the variant tree, which can name what it differs FROM. */
    differsFrom: (variant: string) => `differs from ${variant}`,
    /** The roster row's flag, and the node card strip's. */
    differsFlag: (count: number) => `${count} differs`,

    // ── Stages with nothing to compare ──
    sourceNoMatrix:
      'No matrix: the base is where the change was made, so there is no incoming change to compare across variants.',
    /**
     * Progress unavailable. The roster STAYS — which Spaces are in a stage is a
     * label fact and remains true when progress does not — but every claim
     * about position is replaced, and no matrix is drawn, since a diff measured
     * against unknown progress is not meaningful.
     */
    progressUnavailableVariants:
      'The server did not report where this ChangeOrder has got to, so the variants below cannot be shown as promoted or not. This does not mean nothing has been promoted.',
    /** Per-row replacement for a verdict sentence we cannot back up. */
    variantProgressUnavailable: 'Progress unavailable',
    /** A Space of the stage that holds no resources for this ChangeOrder yet. */
    variantNotPopulated: 'Not here yet',
    /**
     * The same fact, said in full once the reader has opened that variant.
     *
     * Deliberately the same claim as `noResourcesYet`, narrowed to one Space:
     * a part-populated stage is not an error and this is not an error message —
     * the promote is what brings the resources in.
     */
    variantNoResources: (variant: string) =>
      `${variant} holds no resources for this ChangeOrder yet. The promote brings them in.`,
  },


  // ── Pane header ──
  changeOrderBadge: 'ChangeOrder',
  /**
   * The actor clause is omitted entirely when it cannot be resolved — never a
   * placeholder such as "by unknown". `ChangeOrderRead` carries no creator
   * field; the actor is derived from the Revision the start Tag marks.
   */
  createdBy: (when: string, actor: string | null) =>
    actor ? `Created ${when} by ${actor}` : `Created ${when}`,
  lastActivity: (when: string) => `Last activity ${when}`,

  // ── Footer actions ──
  actions: {
    promote: 'Promote',
    promoteAndRelease: 'Promote and release',
    release: 'Release',
    viewRelease: (name: string) => `View release ${name}`,
  },

  // ── Failures ─────────────────────────────────────────────────────────────
  /**
   * A 207, where some of what the promotion writes landed and some did not.
   *
   * ⚠️ SAYS TO RUN IT AGAIN ONLY BECAUSE THAT REALLY DOES FINISH IT. A promote
   * decides per resource what each variant still needs, so a second run
   * repeats nothing that already arrived and completes what did not. That is
   * true of a write that failed, and NOT true of a Space the promotion passed
   * over — see `promotePassedOver`, which is the other shape and gets the
   * other advice.
   */
  promotePartial: (spaces: string, reason: string) =>
    `Promote partly failed. ${spaces} took the change, and the rest did not land (${reason}). Run the promote again to finish it — it repeats nothing that already arrived.`,
  /**
   * Some Spaces took the change and others were passed over entirely.
   *
   * ⚠️ THE ONE THING THIS MUST NOT SAY IS "TRY AGAIN". A Space outside the
   * change order's scope is skipped by every run, so a retry does exactly what
   * the last one did — and advice that provably cannot work is worse than no
   * advice, because it spends the reader's attention and their trust.
   *
   * The remedy is already in the server's own sentence, quoted whole in
   * `reason` ("add the space to its InScopeSpaceIDs first"). This wrapper says
   * what landed and what did not, and then gets out of the way rather than
   * talking over the one useful instruction on the screen.
   */
  promotePassedOver: (spaces: string, reason: string) =>
    `Promote incomplete. ${spaces} took the change, and these were passed over — ${reason}. Running the promote again passes them over in the same way, so the reason above is what has to change first.`,
  /**
   * The server refused the promote at its gates. Nothing was written.
   *
   * The reasons are the server's own, and every gate it found holding is named
   * rather than the first — a stage held by three things is held by three
   * things.
   */
  promoteRefused: (reasons: string) => `Promote refused. ${reasons} Nothing was changed.`,
  /**
   * What the confirmation previewed is no longer what would be written, so
   * nothing was.
   *
   * Refusing is the point. The alternative is promoting something other than
   * what the reader was shown and told they were confirming.
   */
  promotePlanStale:
    'Promote stopped: this rollout changed while the confirmation was open, so what was previewed is no longer what would be written. Nothing was changed. Close this and promote again to see the current plan.',
  /** One failed item of a promote response: which item, and the server's reason. */
  itemFailure: (resource: string, reason: string) => `${resource}: ${reason}`,
  /** Stands in when a failed item carries no slug to name it by. */
  unnamedResource: 'a resource',
  /** Stands in when a failed Space carries no slug to name it by. */
  unnamedSpace: 'a Space',
  /**
   * How far a dry run got, stated where it did not reach every variant.
   *
   * ⚠️ THIS IS ORDINARY, AND THE WORDING HAS TO CARRY THAT. A variant that
   * takes from another variant of the same promotion cannot be previewed until
   * that one has been promoted — which is the shape of every chained rollout,
   * not a fault. The sentence exists so the count beside it is not read as a
   * complete picture; it is not a warning, and dressed as one it would fire on
   * the most ordinary promotion there is and teach a reader to ignore it.
   *
   * Anything genuinely wrong with a preview is reported as a failure and
   * replaces this whole panel, so nothing alarming ever reaches this sentence.
   */
  previewReach: (previewed: number, total: number) => {
    const rest = total - previewed;
    return rest === 1
      ? `Previewed ${previewed} of ${total}. The other takes from a variant earlier in this promotion, so what it receives cannot be shown until that one is promoted.`
      : `Previewed ${previewed} of ${total}. The other ${rest} take from variants earlier in this promotion, so what they receive cannot be shown until those are promoted.`;
  },
  /** How a count of Spaces is named in a failure sentence. */
  spaceCount: (count: number) => (count === 1 ? 'This Space' : `${count} Spaces`),
  /** A failure before any item was attempted — the server's own words, not a code. */
  promoteRequestFailed: (reason: string, spaceCount: number) =>
    `Promote failed: ${reason}. ${spaceCount === 1 ? 'The Space was' : 'The Spaces were'} not changed.`,
  releaseFailed: (spaces: string) => `Release failed for ${spaces}.`,
  partialFailure: (ok: number, failed: number) =>
    `${ok} succeeded, ${failed} failed. See the Spaces named below.`,

  // Setting AbortedReason is the whole of abort: no rollback, no
  // reconciliation stops (docs/design/change-workflows.md line ~347).
  abort: {
    idle: 'No active rollout',
    link: 'Abort rollout…',
    aborted: 'Aborted',
    /** The side pane's banner head. Sentence case, like every other head in that pane. */
    bannerTitle: 'Rollout aborted',
    /**
     * Why Promote and Release are inert. Carried as a TOOLTIP on the buttons,
     * never as the footer's `error` prop — that prop is a failed action's own
     * message, and this is a steady state.
     */
    actionsBlocked: 'This rollout was aborted.',
    dialogTitle: 'Abort rollout',
    dialogBodyBefore: 'This marks ',
    dialogBodyAfter: ' and records your reason against it. Nothing is rolled back and no reconciliation stops.',
    dialogBodyPromoted: (stages: number) =>
      stages === 0
        ? 'No stage has been promoted, and none will be.'
        : stages === 1
          ? 'The 1 stage already promoted stays promoted.'
          : `The ${stages} stages already promoted stay promoted.`,
    reasonLabel: 'Reason',
    reasonPlaceholder: 'Why this rollout is being abandoned',
    reasonHelp: 'Recorded on the ChangeOrder and cannot be edited afterwards.',
    reasonCount: (used: number) => `${used} / 1024`,
    cancel: 'Cancel',
    /** Dismisses a dialog that has already done its work — no longer a cancellation. */
    close: 'Close',
    confirm: 'Abort rollout',
    errorRequired: 'A reason is required.',
    errorTooLong: 'A reason must be 1024 characters or fewer.',
    errorEdgeSpace: 'Remove the space at the start or the end.',
    errorIllegalCharBefore: 'Remove the ',
    errorIllegalCharAfter: ' character. Quotes, backslashes and line breaks cannot be recorded.',
    failed: (reason: string) => `Abort failed: ${reason}. The ChangeOrder was not changed.`,
    notReady: 'Abort failed: this ChangeOrder is not loaded yet. Reload and try again.',
  },
  /**
   * Two ways to end a rollout.
   *
   * "Abort" sets `AbortedReason` and stops there. "Roll back" does that and
   * then takes the change back out of every Space that took it, which is the
   * undo the CLI has always had (`cub variant demote`).
   *
   * "Abort" alone once misled readers who expected a landed release to come
   * back out. That is why "Roll back" sits beside it, and why the dialog
   * spells out what stays behind before the reader commits.
   */
  endRollout: {
    /** Primary and destructive: abort, then restore every Space that took the change. */
    rollBackLabel: 'Roll back',
    /** Secondary: abort alone. What already landed stays landed. */
    abortLabel: 'Abort',
    rollBackTitle: 'Roll back this rollout',
    abortTitle: 'Abort this rollout',
    rollBackLead: 'Takes the change back out of every Space that has taken it, and stops it reaching the rest.',
    abortLead: 'Stops the change reaching any further Space. What already landed stays exactly as it is.',

    /**
     * THE CONSEQUENCES GO IN THE DIALOG, NOT IN A TOOLTIP. Every one of these
     * is irreversible or easy to assume the opposite of, and the moment to say
     * so is before the reader commits.
     */
    consequencesTitle: 'Before you confirm',
    rollBackConsequences: [
      'This rollout can never be promoted again. Only a new change order can re-apply the change.',
      'Changes made to these components after this rollout are dropped. Nothing replays them.',
      'Nothing reaches a cluster until a release is published. This screen does not publish.',
    ],
    abortConsequences: [
      'Spaces that already took the change keep it. Roll back is what takes it back out.',
      'Nothing is written and nothing reaches a cluster.',
      'This decision can be reversed until something is rolled back. After that it is permanent.',
    ],

    /** The scope, named before the reader confirms rather than reported after. */
    spacesTitleRollBack: (count: number) =>
      count === 1 ? 'The change is taken back out of 1 Space' : `The change is taken back out of ${count} Spaces`,
    spacesTitleAbort: (count: number) =>
      count === 1 ? 'The change stays in 1 Space' : `The change stays in ${count} Spaces`,
    spacesNote: 'Spaces already rolled back are not listed: the change is no longer in them.',
    /** No Space is left to restore — every one that took the change has been rolled back. */
    scopeNone: 'Every Space that took this change has already been rolled back.',
    /**
     * The server did not derive the propagation fields, so which Spaces hold
     * the change is unknown. Rolling back over a guess is the one thing worse
     * than not offering it.
     */
    scopeUnavailable:
      'Which Spaces hold this change could not be determined, so it cannot be rolled back from here.',

    rollBackConfirm: 'Roll back',
    abortConfirm: 'Abort',
    retry: 'Retry the Spaces that failed',

    /** Per-Space progress, read off each leg's own answer rather than the HTTP status. */
    phaseRunning: 'Restoring…',
    phaseDone: (units: number) => (units === 1 ? '1 resource restored' : `${units} resources restored`),
    phaseSkipped: 'Nothing to restore',
    phasePending: 'Waiting',

    rollBackAbortLegFailed: (reason: string) => `Nothing was rolled back: ${reason}. The rollout is unchanged.`,
    /** Every Space succeeded. */
    succeeded: (count: number) =>
      count === 1 ? 'Rolled back in 1 Space.' : `Rolled back in ${count} Spaces.`,
    /** Announced after an abort-only. The dialog closes, so this is the only report of it. */
    abortAnnouncement: 'This rollout will not be promoted any further.',
    /**
     * ⚠️ THE SENTENCE THIS WHOLE FEATURE EXISTS TO BE ABLE TO SAY. Once any
     * Space has been restored the abort cannot be cleared, so a rollback that
     * failed part way leaves the rollout in a state no UI action returns it
     * from.
     */
    strandedAdvice:
      'This rollout is now aborted and partly rolled back. It cannot be made promotable again — only a new change order can re-apply the change. Retry the Spaces below, or finish them with `cub variant demote`.',
    /** Nothing was restored, but the abort did land. */
    abortedNotRolledBackAdvice:
      'This rollout is aborted and nothing was rolled back. It can still be put back on its way by clearing the reason.',
  },
  /** Announced when a promote succeeded and wrote something. */
  promotedTo: (stageId: string) => `Promoted to ${stageId}.`,
  /**
   * Announced when a promote succeeded and wrote NOTHING. Deliberately not the
   * same sentence: telling a reader their change shipped when no Space was
   * touched is the failure `didNothing` exists to prevent.
   */
  nothingToPromote: (stageId: string) => `Nothing to promote to ${stageId}.`,
  /**
   * A gate that is holding a stage, said where somebody asked to promote it.
   *
   * THESE STRINGS NAME A HOLD; THEY OFFER NOTHING TO DO ABOUT IT. A held stage
   * is promoted when its gates open and not before, which is the rule `cub
   * variant promote` applies too. Copy that hints at a way past would be
   * describing a route this product does not have.
   */
  promoteHeld: {
    /**
     * Stated when a gate holds the stage but names no reason of its own, so a
     * summary always has a cause to quote.
     */
    generic: 'A gate is holding this stage.',
    /**
     * The refusal `useRolloutActions` itself issues, reached by any caller that
     * asked to promote a held stage — the backstop speaking, since no surface
     * offers the action while a gate holds it.
     */
    refused: 'A gate is holding this stage, so it was not promoted.',
    /** In the promote dialog, below what is holding the stage. */
    dialogExplainer:
      'The stage can be promoted once its gates open. There is nothing to confirm until then.',
  },

} as const;
