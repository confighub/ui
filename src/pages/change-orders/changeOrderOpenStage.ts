// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The stage the ChangeOrder page opens on when the URL names none.
 *
 * It is the first stage, in order, with work left: a stage with a release Target
 * that is promoted (in all its Spaces or in some) and not yet released, so that its
 * Release is still to do, or the next stage, the first one still holding a Space
 * the change has not reached. With neither, there is none, and the page opens on
 * Complete. A stage with no release Target is done once promoted.
 *
 * The page waits on a stage until its Release is done because the next stage's
 * entry gate needs this stage released. Opened on the next stage after Promote, the
 * reader could not promote it, and would have to go back to release this one.
 *
 * Whether a stage has a release Target is the rail's own answer
 * (`ConsoleStage.hasReleaseTargets`), so the card and the rail never disagree:
 * it reads every Space the stage selects, also when the ChangeOrder's scope is
 * unknown or a Space is labelled `Stage=none`. Whether it is released is the
 * server's record (`ReleasedSpaceIDs`), carried in the stage's verdict.
 *
 * This is the one place the rule is written (`stageHasWorkLeft`).
 * `change-order-open-stage.pure.spec.ts` and `change-order-stage-slide.spec.ts`
 * enforce it.
 */
import type { ChangeOrderStageVerdict } from '../x/apps/change-order/changeOrderTypes';

export interface OpenStageInput {
  /** The first stage the change has not reached (`detail.nextStageId`). */
  nextStageId: string | null;
  stageStates: readonly { stageId: string; verdict: ChangeOrderStageVerdict }[];
  /** Whether a stage has a release Target, as the rail draws it. */
  stageHasReleaseTargets: (stageId: string) => boolean;
}

/**
 * Whether a stage has work left: it is the next stage to promote into, or it has a
 * release Target and is promoted (in all its Spaces or in some) and not yet released.
 * The page also reads it after the reader's own action on a stage the URL names.
 */
export function stageHasWorkLeft(
  state: OpenStageInput['stageStates'][number],
  input: Omit<OpenStageInput, 'stageStates'>,
): boolean {
  return (
    state.stageId === input.nextStageId ||
    ((state.verdict === 'promoted' || state.verdict === 'in-progress') &&
      input.stageHasReleaseTargets(state.stageId))
  );
}

export function defaultOpenStageId(input: OpenStageInput): string | null {
  const open = input.stageStates.find((state) => stageHasWorkLeft(state, input));
  return open?.stageId ?? input.nextStageId;
}

/** The rail's answer per stage, from the console row's stages; a stage it does not know has none. */
export function railReleaseTargets(
  stages: readonly { stageId: string; hasReleaseTargets: boolean }[] | undefined,
): (stageId: string) => boolean {
  return (stageId) => stages?.find((s) => s.stageId === stageId)?.hasReleaseTargets === true;
}
