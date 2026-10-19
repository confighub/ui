// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the draft page works out from the data layer's answers for its own drawing: outcome
 * kinds per variant, the outlier chips' targets, a stage bar's segments. Pure.
 */

import type { ChangeOrderOutcomeKind } from '../changeOrderOutcome';
import { draftCopy } from './draftCopy';
import type { DraftOutlier } from './draftPreview';
import type { DraftPreview } from './useDraftPreview';
import type { DraftProblem } from './draftTypes';

export interface OutlierAction {
  outlier: DraftOutlier;
  kind: ChangeOrderOutcomeKind;
  /** The stage it is previewed in, by the name the path uses. `undefined` with no workflow. */
  stage: string | undefined;
}

/** The kind of outcome each in-scope variant has, from the first stage that holds it. */
export function outcomeKindBySpaceId(preview: DraftPreview): Map<string, ChangeOrderOutcomeKind> {
  const kinds = new Map<string, ChangeOrderOutcomeKind>();
  for (const stage of preview.stages) {
    for (const group of stage.outcome.groups) {
      for (const spaceId of group.spaceIds) if (!kinds.has(spaceId)) kinds.set(spaceId, group.kind);
    }
  }
  return kinds;
}

/** The outlier chips with what they act on: their outcome, and the stage that previews them. */
export function outlierActions(preview: DraftPreview): OutlierAction[] {
  const kinds = outcomeKindBySpaceId(preview);
  const stageOf = new Map<string, string>();
  for (const stage of preview.stages) for (const spaceId of stage.spaceIds) if (!stageOf.has(spaceId)) stageOf.set(spaceId, stage.stageId);
  const hasPath = preview.sequence !== undefined;
  return preview.outliers.map((outlier) => ({
    outlier,
    kind: kinds.get(outlier.spaceId) ?? 'differs',
    stage: hasPath ? stageOf.get(outlier.spaceId) : undefined,
  }));
}

/** Whether a blocker repeats the failed dry run shown beside it: the read both depend on failed. */
export const blockerRepeatsPreview = (blocker: DraftProblem | undefined, preview: DraftPreview) =>
  blocker?.code === 'read-failed' && preview.status === 'failed';

/**
 * The settled dry run in one sentence, for the live region: "Dry run: 6 of 7 same, prod-us-west
 * differs, dev on no stage". `outsideNames` are the variants in scope on no stage of the path.
 */
export function dryRunSentence(preview: DraftPreview, outsideNames: readonly string[] = []): string {
  if (preview.totals === undefined) return '';
  const kinds = outcomeKindBySpaceId(preview);
  const parts = [draftCopy.page.side.sentenceSame(preview.totals.same, preview.totals.variants)];
  for (const outlier of preview.outliers) {
    parts.push(`${outlier.name} ${draftCopy.page.side.kindWord[kinds.get(outlier.spaceId) ?? 'differs']}`);
  }
  for (const name of outsideNames) parts.push(`${name} ${draftCopy.page.outlier.outsideText}`);
  return parts.join(', ');
}

/** `9 Oct`: the day a ChangeOrder was opened, short enough for a picker's margin. */
export function dayMonth(at: string | undefined): string {
  if (at === undefined) return '';
  const time = Date.parse(at);
  if (Number.isNaN(time)) return '';
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
