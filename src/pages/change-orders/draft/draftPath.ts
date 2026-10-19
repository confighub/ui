// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The promotion path of a draft, as the rail and the stage card read it: which node is
 * selected, what each node shows, and which stage holds a variant.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */

import type { ChangeWorkflowSpec } from '@confighub/rtk-query';

import type { ChangeOrderSequence } from '../../x/apps/change-order/changeOrderTypes';
import { COMPLETE_STAGE_ID } from '../changeOrderCompleteStep';
import type { ChangeOrderOutcomeGroup } from '../changeOrderOutcome';
import { outcomeSegments, type OutcomeBarSegment } from '../components/outcomeMeta';
import { draftFinalGates, draftGatesForStage } from './draftGates';
import type { DraftStagePreview } from './draftPreview';

/** What the rail draws for one node. */
export interface DraftRailStage {
  stageId: string;
  isSource: boolean;
  variantCount: number;
  /** Absent until the preview resolves: the node then draws no bar. */
  segments?: OutcomeBarSegment[];
  gateCount: number;
}

/** The outcome groups a bar and the cards draw: every group but `unknown`, which is a note. */
export function comparableGroupsOf(groups: readonly ChangeOrderOutcomeGroup[]): ChangeOrderOutcomeGroup[] {
  return groups.filter((group) => group.kind !== 'unknown');
}

/**
 * The rail's nodes, source first, from the sequence the preview built. A stage's bar is its
 * outcome's segments once `stages` (the resolved preview) holds it; `unknown` is drawn too, in
 * its own neutral tone, since a node has no note to say it in.
 */
export function draftRailStages(input: {
  sequence: ChangeOrderSequence;
  spec: ChangeWorkflowSpec;
  stages: readonly DraftStagePreview[];
  resolved: boolean;
  base: string;
}): DraftRailStage[] {
  const { sequence, spec, stages, resolved, base } = input;
  const previewById = new Map(stages.map((stage) => [stage.stageId, stage]));
  return sequence.stages.map((stage) => {
    if (stage.isSource) return { stageId: stage.id, isSource: true, variantCount: 0, gateCount: 0 };
    const preview = previewById.get(stage.id);
    return {
      stageId: stage.id,
      isSource: false,
      variantCount: stage.spaceIds.length,
      segments: resolved && preview !== undefined ? outcomeSegments(preview.outcome.groups) : undefined,
      gateCount: draftGatesForStage(spec, stage.id, base).length,
    };
  });
}

/** The Complete node's gate count: the workflow's Final prerequisites. */
export function draftCompleteGateCount(spec: ChangeWorkflowSpec, base: string): number {
  return draftFinalGates(spec, base).length;
}

/**
 * The node the stage card shows. The URL's choice when it names a node of this path;
 * otherwise the first stage where some variant does not take the change the same way as the
 * rest, since that is the stage worth reading first, else the last stage.
 *
 * Until the preview resolves, the last stage: nothing says yet where a variant differs.
 */
export function resolveDraftStageId(input: {
  requested: string | undefined;
  sequence: ChangeOrderSequence;
  stages: readonly DraftStagePreview[];
  hasComplete: boolean;
}): string | undefined {
  const { requested, sequence, stages, hasComplete } = input;
  if (requested !== undefined) {
    if (requested === COMPLETE_STAGE_ID && hasComplete) return requested;
    if (sequence.stages.some((stage) => stage.id === requested)) return requested;
  }
  const real = sequence.stages.filter((stage) => !stage.isSource);
  const firstOutlier = real.find((stage) =>
    stages.find((preview) => preview.stageId === stage.id)?.outcome.groups.some((group) => group.kind !== 'same'),
  );
  return (firstOutlier ?? real[real.length - 1])?.id;
}

/** The first stage of the path holding `spaceId`: where an outlier's "Show" takes the reader. */
export function draftStageOfSpace(sequence: ChangeOrderSequence | undefined, spaceId: string): string | undefined {
  return sequence?.stages.find((stage) => !stage.isSource && stage.spaceIds.includes(spaceId))?.id;
}

/**
 * How many of the waiting changes the draft carries, for the source node: the cards inside the
 * end, wholly or in part. `undefined` while any card's place is not established, rather than a
 * count that might be wrong.
 */
export function draftCarriedCardCount(cards: readonly { inclusion: string }[]): number | undefined {
  if (cards.some((card) => card.inclusion === 'unknown')) return undefined;
  return cards.filter((card) => card.inclusion === 'all' || card.inclusion === 'some').length;
}

/** `spaceIds` in the scope's order (stage, then as the scope lists them); any the scope does not list, last. */
export function inScopeOrder(spaceIds: readonly string[], inScopeSpaceIds: readonly string[]): string[] {
  const position = new Map(inScopeSpaceIds.map((spaceId, index) => [spaceId, index]));
  return [...spaceIds].sort((a, b) => (position.get(a) ?? inScopeSpaceIds.length) - (position.get(b) ?? inScopeSpaceIds.length));
}

