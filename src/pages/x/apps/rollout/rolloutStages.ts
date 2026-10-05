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
 * The source Space is never itself a promotion target, so it is always
 * rendered as this separate, unnumbered row rather than folded into a real
 * stage.
 */
export const SOURCE_STAGE_ID = '__rollout_source__';

/**
 * Build the rollout sequence.
 *
 * `sourceSpaceId` is the Space the ChangeOrder resides in. It always gets its
 * own synthetic row at the front of the sequence, since a ChangeWorkflow's
 * stages describe promotion targets, not the entry point.
 *
 * ⚠️ THE SOURCE ROW IS A SECOND VIEW OF THAT SPACE, NEVER A CLAIM ON IT. It is
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
  sourceSpaceId: string,
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
    spaceIds: [sourceSpaceId],
    index: 0,
    isSource: true,
    isFirst: false,
    prerequisites: [],
  };
  if (realStages.length > 0) {
    realStages[0] = { ...realStages[0], previousStageId: SOURCE_STAGE_ID };
  }

  return { stages: [sourceStage, ...realStages], problems };
}

/**
 * The Spaces of a stage a promotion actually WRITES INTO — its membership minus
 * the Space the ChangeOrder resides in.
 *
 * ⚠️ MEMBERSHIP AND THE WRITE SET ARE DIFFERENT QUESTIONS, and one commit
 * answering the first is what made this necessary. `buildRolloutSequence` no
 * longer withholds the base from a stage whose selector covers it, because
 * every entry gate to the next stage quantifies over that membership and
 * `stageSpaces` includes it. `cub`'s promotion loop then throws the base away
 * again, one line later:
 *
 *   if variant.SpaceID == changeOrder.SpaceID && changeOrder.UpdateType != updateTypeInvoke {
 *       tprint("Skipping %s, the space the change order was created in", variant.Slug)
 *       continue
 *   }
 *                                   — public/cmd/cub/variant_promote.go
 *
 * The base already HAS the change; it is where the change was made. Promoting
 * it asks a Space to take what it originated, and releasing it publishes a
 * Release `cub` never publishes on this path — on a base with no release target
 * that reports a failure over a promotion that in fact succeeded.
 *
 * THE UI'S PROMOTE IS ALWAYS THE LINK-FOLLOWING ONE. The CLI's skip is
 * conditional on `UpdateType != Invoke` because an Invoke ChangeOrder makes its
 * change nowhere until the invocation runs. The rollout footer performs a
 * clone-then-upgrade over Links and nothing else, so the condition is settled
 * here and the skip is unconditional; an Invoke rollout would need its own
 * action before it needed this exception.
 *
 * The count a confirmation dialog states must come from HERE and not from the
 * stage's membership, or the dialog names a number of variants the promote will
 * not write.
 */
export function promotionTargets(
  spaceIds: readonly string[],
  changeOrderSpaceId: string | undefined,
): string[] {
  return spaceIds.filter((spaceId) => spaceId !== changeOrderSpaceId);
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
