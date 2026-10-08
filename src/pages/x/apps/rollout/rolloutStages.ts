// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Derives the rollout sequence from the ChangeWorkflow governing a ChangeOrder.
 *
 * ARRAY POSITION IS THE SEQUENCE: the stages are ordered between one another
 * and unordered within one, so there is no cycle or unreachability to detect.
 * A stage whose selector resolves to nothing shows up as
 * `stage-selects-nothing` rather than as a silently empty lane.
 */

import type { ChangeWorkflowSpec } from '@confighub/rtk-query';

import type { ExtendedSpaceRead } from '@confighub/rtk-query';
import type { RolloutSequence, RolloutSequenceProblem, RolloutStage } from './rolloutTypes';

/**
 * Identity of the synthetic row for the Space the ChangeOrder resides in.
 *
 * ⚠️ AN IDENTITY, NEVER A TEST. `ChangeWorkflowStageNameRegexp` is
 * `LabelValueRegexp`, whose permissive character class includes `_`, so the
 * server stores a stage genuinely called `__rollout_source__` without
 * complaint. Anything that asks a question by comparing a stage NAME against
 * this constant is a question a user can answer for it by naming a stage —
 * which is how naming one stage `__rollout_source__` once removed every gate
 * from the stage after it. The facts this constant used to stand in for are
 * flags on `RolloutStage` now: `isSource` and `isFirst`.
 *
 * The source row is never itself a promotion target, so it is always
 * rendered as this separate, unnumbered row rather than folded into a real
 * stage.
 */
export const SOURCE_STAGE_ID = '__rollout_source__';

/**
 * Build the rollout sequence.
 *
 * `sourceSpaceIds` are where the change was made, which always get their own
 * synthetic row at the front of the sequence, since a ChangeWorkflow's stages
 * describe promotion targets, not the entry point. For a ChangeOrder whose own
 * Space holds the change from the start (`changeOrderOwnSpaceReached`) that is
 * its own Space, the base. For a fan-out ChangeOrder it is the Spaces of the
 * Units its Links take from, outside its scope (`useFanOutSource`), and the base
 * is an ordinary target in whichever stage selects it.
 *
 * ⚠️ THE SOURCE ROW IS A SECOND VIEW OF THE BASE, NEVER A CLAIM ON IT. It is
 * drawn so the reader can see where the change came from; it does not take the
 * base Space out of the workflow. The server's promotion resolves a stage's
 * selector and filters by scope and nothing else, so a stage whose selector
 * covers the base Space
 * covers it — and that Space is then one of the Variants every entry gate to
 * the next stage quantifies over. Withholding it here made the UI decide
 * different questions from `cub` in both directions at once: a stage selecting
 * only the base looked empty, which refused a promotion `cub` performs, and a
 * base sharing its stage with a released peer vanished from the gate, which
 * offered a promotion `cub` refuses.
 *
 * `stageSpaces` is each stage's membership as `changeOrderStageMembers` gives
 * it: the stage's selector narrowed to the ChangeOrder's `InScopeSpaceIDs`,
 * the same rule the server applies. Nothing is narrowed again here.
 */
export function buildRolloutSequence(
  workflow: ChangeWorkflowSpec,
  stageSpaces: Record<string, ExtendedSpaceRead[]>,
  sourceSpaceIds: readonly string[],
  /** Whether the source is an Invocation run in each stage (`RolloutStage.runsInvocation`). */
  runsInvocation = false,
): RolloutSequence {
  const problems: RolloutSequenceProblem[] = [];
  const realStages: RolloutStage[] = [];

  /*
   * `Stages` is `json:",omitempty"` on the Go model, so the generated TS
   * declaring it required is a promise the wire does not keep. Read defensively
   * here too, at the boundary of an exported function, rather than only where
   * `changeOrderWorkflow` classifies such a copy as unresolved — this one is
   * callable with any spec, and an empty sequence is a far better answer than a
   * render-time throw.
   */
  const stageDefs = workflow.Stages ?? [];
  stageDefs.forEach((stageDef, i) => {
    const resolved = stageSpaces[stageDef.Name] ?? [];
    const spaceIds: string[] = [];
    for (const s of resolved) {
      const id = s.Space?.SpaceID;
      if (id === undefined) continue;
      spaceIds.push(id);
    }
    if (spaceIds.length === 0) {
      problems.push({ kind: 'stage-selects-nothing', stageName: stageDef.Name });
    }
    realStages.push({
      id: stageDef.Name,
      previousStageId: i === 0 ? null : workflow.Stages[i - 1].Name,
      spaceIds,
      index: i + 1,
      isSource: false,
      // Array position, not a name: the one fact about a stage's predecessor
      // that no ChangeWorkflow author can write.
      isFirst: i === 0,
      // Absent is an EMPTY gate list, never an unknown one: a stage that
      // declares no prerequisite is gated on nothing.
      prerequisites: stageDef.Prerequisites ?? [],
    });
  });

  const sourceStage: RolloutStage = {
    id: SOURCE_STAGE_ID,
    previousStageId: null,
    spaceIds: [...sourceSpaceIds],
    index: 0,
    isSource: true,
    isFirst: false,
    prerequisites: [],
    ...(runsInvocation ? { runsInvocation: true } : {}),
  };
  if (realStages.length > 0) {
    realStages[0] = { ...realStages[0], previousStageId: SOURCE_STAGE_ID };
  }

  return { stages: [sourceStage, ...realStages], problems };
}

/**
 * The UpdateTypes whose change is made in Spaces outside the rollout: each
 * in-scope Unit takes it over Links of that type into Units elsewhere, such as
 * the registry-facts Units a TransformPaths image update reads from.
 */
const FAN_OUT_UPDATE_TYPES: ReadonlySet<string> = new Set(['TransformPaths', 'Upsert', 'Insert']);

/**
 * Whether the Space a ChangeOrder resides in holds the change before anything
 * has been promoted into it — the server's `changeOrderOwnSpaceReached`.
 *
 * It does for UpgradeUnit and MergeUnits: the ChangeOrder was made in the Space
 * holding the change, which is the base its variants upgrade from. It does not
 * for Invoke, where nothing has changed anywhere until an invocation runs, nor
 * for a fan-out ChangeOrder, whose own Space takes the change over its Links
 * like any other Space in scope.
 *
 * An absent UpdateType is the server's default, UpgradeUnit.
 */
export function changeOrderOwnSpaceReached(updateType: string | null | undefined): boolean {
  if (updateType === undefined || updateType === null || updateType === '') return true;
  return updateType !== 'Invoke' && !FAN_OUT_UPDATE_TYPES.has(updateType);
}

/**
 * The Space a promotion of this ChangeOrder passes over, or `undefined` when it
 * passes over none: the ChangeOrder's own Space, when that Space already holds
 * the change.
 */
export function promotionSkippedSpaceId(
  changeOrderSpaceId: string | undefined,
  updateType: string | null | undefined,
): string | undefined {
  return changeOrderOwnSpaceReached(updateType) ? changeOrderSpaceId : undefined;
}

/**
 * The Spaces of a stage a promotion actually WRITES INTO — its membership minus
 * the Space the promotion passes over (`promotionSkippedSpaceId`).
 *
 * ⚠️ MEMBERSHIP AND THE WRITE SET ARE DIFFERENT QUESTIONS. `buildRolloutSequence`
 * does not withhold the base from a stage whose selector covers it, because
 * every entry gate to the next stage quantifies over that membership. The
 * server's promotion then skips the base when it already has the change: it is
 * where the change was made, so promoting it would ask a Space to take what it
 * originated, and releasing it would publish a Release the promotion never
 * asked for.
 *
 * When the ChangeOrder's own Space does NOT already have the change — Invoke,
 * and the fan-out UpdateTypes — the server promotes into it like any other
 * Space, and leaving it out here would leave it behind: the UI names the Spaces
 * it promotes explicitly, so a Space this drops is a Space never sent.
 *
 * The count a confirmation dialog states must come from HERE and not from the
 * stage's membership, or the dialog names a number of variants the promote will
 * not write.
 */
export function promotionTargets(
  spaceIds: readonly string[],
  skippedSpaceId: string | undefined,
): string[] {
  return spaceIds.filter((spaceId) => spaceId !== skippedSpaceId);
}

/** The stages that can actually be promoted into — everything but the source. */
export function promotableStages(sequence: RolloutSequence): RolloutStage[] {
  return sequence.stages.filter((stage) => !stage.isSource);
}

/**
 * The stage immediately ahead of this one, whose Spaces every entry gate is
 * evaluated over. `undefined` for the source row, which has nothing ahead of it.
 *
 * BY POSITION, NOT BY NAME. `stages.find((s) => s.id === stage.previousStageId)`
 * reads the same in the ordinary case and resolves to the wrong row whenever a
 * real stage is called `__rollout_source__`: `find` returns the synthetic source
 * row sitting at position 0, so the gates judge the base Space instead of the
 * stage the change actually has to come through. `index` is the position
 * `buildRolloutSequence` assigned, so this cannot be steered by a stage name.
 */
export function previousStageOf(
  sequence: RolloutSequence,
  stage: RolloutStage,
): RolloutStage | undefined {
  if (stage.index === 0) return undefined;
  return sequence.stages[stage.index - 1];
}
