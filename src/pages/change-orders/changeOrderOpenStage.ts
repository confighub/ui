// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The stage the ChangeOrder page opens on when the URL names none.
 *
 * It is the next stage, the first one still holding a Space the change has not
 * reached. Once every stage has the change there is none, but a stage that is
 * promoted and not yet released still has its Release to do: the page opens on
 * it, not on Complete. A stage with no release Target is done once promoted.
 *
 * Whether a stage has a release Target is the rail's own answer
 * (`ConsoleStage.hasReleaseTargets`), so the card and the rail never disagree:
 * it reads every Space the stage selects, also when the ChangeOrder's scope is
 * unknown or a Space is labelled `Stage=none`. Whether it is released is the
 * server's record (`ReleasedSpaceIDs`), carried in the stage's verdict.
 */
import type { ChangeOrderStageVerdict } from '../x/apps/change-order/changeOrderTypes';

export interface OpenStageInput {
  /** The first stage the change has not reached (`detail.nextStageId`). */
  nextStageId: string | null;
  stageStates: readonly { stageId: string; verdict: ChangeOrderStageVerdict }[];
  /** Whether a stage has a release Target, as the rail draws it. */
  stageHasReleaseTargets: (stageId: string) => boolean;
}

export function defaultOpenStageId(input: OpenStageInput): string | null {
  if (input.nextStageId !== null) return input.nextStageId;
  const unreleased = input.stageStates.find(
    (state) => state.verdict === 'promoted' && input.stageHasReleaseTargets(state.stageId),
  );
  return unreleased?.stageId ?? null;
}

/** The rail's answer per stage, from the console row's stages; a stage it does not know has none. */
export function railReleaseTargets(
  stages: readonly { stageId: string; hasReleaseTargets: boolean }[] | undefined,
): (stageId: string) => boolean {
  return (stageId) => stages?.find((s) => s.stageId === stageId)?.hasReleaseTargets === true;
}
