// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a rail node says of its stage, apart from how it is drawn: whether a
 * review holds it, whether its gates only wait, and the label under its name.
 * The words agree with the stage card's status box.
 *
 * Pure: no React and no MUI. The browser-free specs import it directly, and an
 * MUI icon import does not resolve in that runner.
 */

import { partitionBlockingGates } from '../../x/apps/change-order/changeOrderGates';
import type { ChangeOrderStageState } from '../../x/apps/change-order/changeOrderTypes';
import type { RunningRelease } from '../../x/apps/liveStatus';
import type { StageReviewRail } from '../reviews/changeOrderReviewTypes';
import { reviewCopy } from '../reviews/reviewCopy';
import { previousStageOf } from '../stage/stageCardParts';
import { splitHeldGates, type PreviousStageInput } from '../stage/stageCardState';
import { stageCardCopy } from '../stage/stageCardCopy';
import { segmentsText } from '../stage/stageCopyParts';

/**
 * Whether a stage is held on review: it is the next stage, it has not taken
 * the change, and its review requirements are waiting (`held`) or rejected
 * (`blocked`). `null` for a stage with no reviews, or one not held by them.
 */
export function reviewHoldTone(
  state: ChangeOrderStageState,
  isNext: boolean,
  review: StageReviewRail | undefined,
): 'held' | 'blocked' | null {
  if (review === undefined || state.verdict === 'source') return null;
  // An entry review holds the next stage; a release review holds a promoted stage's release.
  if (review.gateKind === 'release' ? state.verdict !== 'promoted' : !isNext) return null;
  if (review.state === 'rejected') return 'blocked';
  if (review.state === 'pending' || review.state === 'partial') return 'held';
  return null;
}

/**
 * "Waiting on check/healthy" for a gated stage whose holding gates all only wait,
 * in the words of its card's box (`gateWaitsFor`). `undefined` when a gate
 * failed, or when no gate holds the stage. Only a failed gate is drawn red.
 */
export function railGateWait(state: ChangeOrderStageState, previous: PreviousStageInput | undefined): string | undefined {
  if (state.verdict !== 'gated') return undefined;
  const held = splitHeldGates(partitionBlockingGates(state.gates).failed, previous);
  const first = held.waiting[0];
  if (held.failed.length > 0 || first === undefined || held.waitFor === undefined) return undefined;
  return segmentsText(stageCardCopy.headline.gateWaiting(held.waitFor, previous?.name, first.name));
}

/** What `railGateWaits` reads of the ChangeOrder: its stages, as they stand, and the Releases of their Spaces. */
export interface RailGateWaitsInput {
  sequence: { stages: readonly { id: string; isSource: boolean; spaceIds: string[]; previousStageId: string | null }[] };
  stageStates: readonly ChangeOrderStageState[];
  scopedSpaces: readonly { spaceId: string; release?: RunningRelease | null }[] | null;
}

/** `railGateWait` for every stage, by stage id. A stage that does not only wait has no entry. */
export function railGateWaits(detail: RailGateWaitsInput): Record<string, string> {
  const waits: Record<string, string> = {};
  for (const state of detail.stageStates) {
    if (state.verdict !== 'gated') continue;
    const sequenceStage = detail.sequence.stages.find((s) => s.id === state.stageId);
    if (sequenceStage === undefined) continue;
    const wait = railGateWait(state, previousStageOf(sequenceStage, detail).previousStage);
    if (wait !== undefined) waits[state.stageId] = wait;
  }
  return waits;
}

/**
 * The label under a rail node's name. A review that holds the stage comes first,
 * as on its card; then gates that only wait; "Ready to promote" only when the
 * review is satisfied and no gate failed.
 */
export function railStageLabel(
  state: ChangeOrderStageState,
  isNext: boolean,
  review: StageReviewRail | undefined,
  gateWait: string | undefined,
): string {
  const hold = reviewHoldTone(state, isNext, review);
  if (hold === 'held') return review?.gateKind === 'release' ? reviewCopy.rail.releaseHeld : reviewCopy.rail.held;
  if (hold === 'blocked') return reviewCopy.rail.rejected;
  if (gateWait !== undefined) return gateWait;
  if (isNext && review?.state === 'satisfied' && partitionBlockingGates(state.gates).failed.length === 0) return reviewCopy.rail.ready;
  return state.label;
}
