// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Complete step: the ChangeWorkflow's `Final` completion checklist, drawn
 * as a step of its own.
 *
 * ⚠️ IT IS NOT A ROLLOUT STAGE, AND THAT IS THE WHOLE REASON IT NEEDED BUILDING.
 * A rollout stage's `Prerequisites` are ENTRY gates, evaluated over the
 * PREVIOUS stage — they answer "may the change move on from there". `Final`
 * (`ChangeWorkflowSpec.Final.Prerequisites`, internal/models/changeworkflow.go)
 * is evaluated over the LAST stage's OWN Spaces and answers a different
 * question: has the whole rollout landed. With no step of its own, that
 * checklist had nowhere to be seen — a rollout could sit at "every stage taken"
 * with an unsatisfied final check and the page showed no place to look.
 *
 * SYNTHETIC, LIKE THE SOURCE ROW, AND FOR THE SAME REASON. `SOURCE_STAGE_ID`
 * (`rolloutStages.ts`) gives the LEADING node an identity without inventing a
 * stage in the workflow; `COMPLETE_STAGE_ID` does the same for the TRAILING
 * one. Both are counted in `stagesDone`/`stagesTotal`, which count the steps
 * of the promotion path as it is drawn (`stagePathProgress`).
 *
 * PURE. No MUI, no JSX, no React: the tone ladder below is the whole claim this
 * step makes, and it is testable only while nothing needs a renderer to reach
 * it (`tests/rollout-complete-step.pure.spec.ts`).
 */

import { rolloutsConsoleCopy } from '../x/apps/rollout/rolloutsConsoleCopy';
import type {
  ConsoleRow,
  ConsoleStage,
  SegmentTone,
} from '../x/apps/rollout/rolloutsConsoleModel';

/**
 * The step's identity, mirroring `SOURCE_STAGE_ID`'s shape — double-underscore
 * delimited so it cannot collide with a Space's `Stage` label, which is a bare
 * word.
 */
export const COMPLETE_STAGE_ID = '__rollout_complete__';

/** What this step is called to a reader, in one place, on every surface that draws it. */
export const COMPLETE_STEP_LABEL = 'Complete';

/**
 * The id the console segment carries, which on that surface IS what it prints.
 *
 * `RolloutStageStrip` builds a segment's hover title from
 * `stageDisplayName(stage.stageId, stage.isSource)`, and that function returns a
 * non-source id VERBATIM — deliberately, since it is forbidden to infer a row's
 * kind from its name. A segment identified by `COMPLETE_STAGE_ID` therefore
 * shows `__rollout_complete__` to anyone hovering it. The word itself is the
 * only id `stageDisplayName` can render as `Complete`, so the segment carries
 * that.
 *
 * ⚠️ DISPLAY ONLY — IT REPLACES NOTHING. The step's identity is still
 * `COMPLETE_STAGE_ID`: the detail URL, its selection test
 * (`stageParam === COMPLETE_STAGE_ID`) and the rail's gate list all turn on the
 * synthetic id, which is unique by construction. This one is read by the
 * strip's `title` and its React key and nowhere else, and a stage a workflow
 * genuinely calls `Complete` prints `Complete` too — so the name a reader sees
 * is never a name that belongs to something else.
 */
export const COMPLETE_SEGMENT_STAGE_ID = COMPLETE_STEP_LABEL;

/**
 * The tones this step can take — a subset of `SegmentTone`, never a parallel
 * union. `ready` and `progressing` are deliberately absent: they describe a
 * promotion under way, and nothing is ever promoted INTO the Complete step.
 * `unverified` is absent too: a complete rollout draws every step done, and
 * its label says when the last stage's health went unchecked.
 */
export type CompleteStepTone = Extract<SegmentTone, 'restored' | 'gated' | 'done' | 'degraded' | 'blocked'>;

/** Exactly the fields the step reads — the same `Pick` shape `actionFor` uses. */
export type CompleteStepRow = Pick<ConsoleRow, 'state' | 'nextStageId' | 'restored'>;

/**
 * The step's state in words, for the tones the row state does not already name.
 *
 * `done` and `degraded` reuse `rolloutsConsoleCopy.states` rather than
 * restating it, so the step and the row's own chip cannot come to word one
 * verdict two ways.
 */
const UNREACHED_LABEL = 'Not reached yet';
const OUTSTANDING_LABEL = 'Not complete';
const RESTORED_LABEL = 'Restored';

const STEP_LABELS: Record<CompleteStepTone, string> = {
  restored: RESTORED_LABEL,
  gated: UNREACHED_LABEL,
  done: rolloutsConsoleCopy.states.complete.label,
  degraded: rolloutsConsoleCopy.states.degraded.label,
  blocked: OUTSTANDING_LABEL,
};

/**
 * What the step is called — NOT a function of the tone alone, and that is the
 * one place this step's two terminal readings are told apart.
 *
 * `restored` is reached two ways (see `completeStepTone` rung 4), because
 * `SegmentTone` has no member meaning "abandoned where it stands" and every
 * other member it does have would make a false claim: `blocked` says there is
 * work outstanding, `gated` says the step is still to come, `done` says the
 * rollout landed. A treatment can only honestly say the one thing these two
 * rollouts share — nothing here is actionable, ever — so the treatment is
 * shared and the WORDS carry the difference.
 *
 * `Aborted` is `rolloutsConsoleCopy.states.aborted.label`, the same word the
 * row's own chip uses, so the step and the chip cannot word one verdict two
 * ways.
 */
export function completeStepLabel(row: CompleteStepRow): string {
  if (isCompleteStepAbandoned(row)) return rolloutsConsoleCopy.states.aborted.label;
  // Drawn done like `complete`, so the words are what keep the caveat.
  if (completeStepTone(row) === 'done' && row.state === 'complete-unverified') {
    return rolloutsConsoleCopy.states['complete-unverified'].label;
  }
  return STEP_LABELS[completeStepTone(row)];
}

/**
 * Whether the `restored` tone is standing in for a rollout ABANDONED WHERE IT
 * STOOD rather than one actually taken back out.
 *
 * The predicate lives here, beside the ladder that creates the ambiguity, so
 * every surface drawing the shared tone asks one question and gets one answer.
 * A surface that cannot ask it can only draw what the tone literally names —
 * and an undo mark on a rollout nobody ever undid states a fact that is false:
 * an aborted rollout was left in place, with whatever it had already promoted
 * still promoted.
 */
export function isCompleteStepAbandoned(row: CompleteStepRow): boolean {
  return completeStepTone(row) === 'restored' && !row.restored;
}

/**
 * How the Complete step reads, in strict precedence order.
 *
 * 1. RESTORED FIRST. A restore leaves the promotion's own marks in place, so
 *    every reading below it still reports the change as landed — the same false
 *    green `deriveSpaceVerdict` refuses by asking about restores first. A
 *    rollout that was taken back out is not complete, whatever the
 *    row state says.
 * 2. THEN THE SERVER'S "FINISHED". `complete` / `complete-unverified` follow
 *    the ChangeOrder's own `Stage` and `State`, so the step reads done even when
 *    a stage is still named as next — a Space added to an earlier stage after
 *    the rollout finished, which the row's Blocker cell names. Both read
 *    `done`; `completeStepLabel` says which.
 * 3. THEN "HAS IT EVEN GOT HERE". `nextStageId !== null` means a stage is still
 *    ahead, so `Final` has not been evaluated against anything: the checklist is
 *    not failing, it is unasked. `gated` is the tone for a step the change has
 *    not reached — the same tone every unreached stage takes. `degraded` maps
 *    across unchanged only past this point, where it is about the last stage.
 * 4. THEN "CAN IT STILL FINISH AT ALL". `aborted` is a dead ChangeOrder — the
 *    state `deriveConsoleState` answers above every other derivation, from
 *    `AbortedReason` or from a restored stage. It has reached the last stage
 *    and will never satisfy `Final`, because nothing will ever be promoted
 *    again. Left to the catch-all it read `blocked`, which is the accent
 *    treatment for "there is something to do here" — and for a rollout nobody
 *    can act on that is simply untrue. It takes the terminal, unactionable
 *    treatment instead, and `completeStepLabel` keeps its words its own.
 * 5. EVERYTHING ELSE has reached the last stage without finishing, which is
 *    `blocked` — an outstanding thing to look at, never a quiet `done`.
 */
export function completeStepTone(row: CompleteStepRow): CompleteStepTone {
  if (row.restored) return 'restored';
  if (row.state === 'complete' || row.state === 'complete-unverified') return 'done';
  if (row.nextStageId !== null) return 'gated';
  if (row.state === 'degraded') return 'degraded';
  if (row.state === 'aborted') return 'restored';
  return 'blocked';
}

/**
 * The step as one more `ConsoleStage`, so the shared strip can draw it without
 * knowing it exists.
 *
 * `RolloutStageStrip` takes a plain `ConsoleStage[]` and reads a segment's
 * `segmentTone` and `state.label` and nothing else. Appending this is therefore
 * the entire console-side change — the strip itself is untouched.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM:
 *  - NO SPACES. `Final` quantifies over the LAST stage's Spaces. Copying those
 *    ids here would make a viewer who sits in the last stage match this segment
 *    as well as their own (`viewerPositionIn`), putting the "you are here"
 *    caret on a step nobody is ever in.
 *  - NO GATES. The final checklist is read on the detail screen, off
 *    `finalStageGates` (`RolloutDetail.finalGates`). A console row has never
 *    carried it, and half-carrying it here would be a second evaluation that
 *    can disagree with the one the detail screen shows.
 *  - NO RELEASE TARGETS. `hasReleaseTargets` asks whether a Space this step
 *    would be promoted INTO can publish a Release. Nothing is ever promoted
 *    into the Complete step, so the honest answer is `false` — and the field's
 *    only reader, `promotionFor`, looks the stage up by `nextStageId` in
 *    `row.stages`, which this step is never added to.
 *  - NO STAGE VERDICT. `RolloutStageVerdict` has no member that means "the
 *    workflow's final checklist", so `unknown` is carried as the union's own
 *    "no trustworthy answer" marker rather than borrowing a stage's verdict
 *    this step has not earned. Every surface reads `label` and `segmentTone`.
 */
export function buildCompleteConsoleStage(row: CompleteStepRow): ConsoleStage {
  const segmentTone = completeStepTone(row);
  return {
    stageId: COMPLETE_SEGMENT_STAGE_ID,
    spaceSlugs: [],
    spaceIds: [],
    state: {
      /*
        The same id the segment carries. A `ConsoleStage` built from a real
        stage holds one id in both places, and a surface that reads either one
        of them to name this step must get the same printable answer.
      */
      stageId: COMPLETE_SEGMENT_STAGE_ID,
      verdict: 'unknown',
      label: completeStepLabel(row),
      progress: '',
      promotedCount: 0,
      restoredCount: 0,
      inFlightCount: 0,
      spaceCount: 0,
      gates: [],
      gateTally: { total: 0, satisfied: 0 },
      gatesOpen: segmentTone === 'done',
    },
    gates: [],
    isSource: false,
    segmentTone,
    hasReleaseTargets: false,
  };
}
