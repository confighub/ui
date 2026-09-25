// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What ONE outcome-group card on the rollout detail page decides for itself:
 * its identity among the other cards, which units it stands for, and the name
 * its rows wear.
 *
 * ⚠️ EVERYTHING HERE IS PURE AND STAYS PURE — no React, no MUI. `RolloutsPage.tsx`
 * cannot be imported by the Playwright runner at all (MUI's directory imports
 * do not resolve as ES modules), so logic left inline in that file is logic no
 * test can reach. This module is where a card's decisions live so that the page
 * keeps only markup and the decisions are checkable.
 */

import { LABEL_VARIANT } from '../x/apps/componentData';
import type { RolloutChangeGroup, RolloutResourceConflict } from '../x/apps/rollout/rolloutTypes';
import type { RolloutOutcomeKind } from './rolloutOutcome';

/** A single outcome card's identity within the page. */
export function outcomeGroupKey(stageId: string, kind: RolloutOutcomeKind): string {
  return `${stageId}:${kind}`;
}

/** The little a card needs of a Space to name it. */
export interface CardSpaceLabelSource {
  spaceId: string;
  labels?: Record<string, string>;
}

/**
 * The units one card stands for: its representative Space's, minus the ones the
 * ChangeOrder passed over.
 *
 * A unit the ChangeOrder never touched is not a variant to review on this card —
 * it is already accounted for in "Passed over" — so it is filtered out by
 * `skippedUnits` membership, BEFORE the caller's split and never instead of it.
 *
 * ⚠️ NOT filtered by "has zero `fieldDiffs`". A `same`-kind group's whole point
 * is that its members already hold the value being promoted — every one of them
 * legitimately has zero `fieldDiffs`, for a reason with nothing to do with being
 * skipped. Filtering on emptiness emptied the `same` group's own card, which is
 * exactly the group a FULLY COMPLETE rollout's stage is in. Those units collapse
 * into the group's tail downstream; they are never dropped here.
 *
 * Incoming order is kept, because the split downstream is the only thing
 * allowed to move a unit.
 */
export function cardRepresentativeUnits<TUnit extends { unitId: string; spaceId: string }>(
  units: readonly TUnit[],
  representativeSpaceId: string,
  skippedUnits: Readonly<Record<string, string>>,
): TUnit[] {
  return units.filter(
    (unit) => unit.spaceId === representativeSpaceId && !(unit.unitId in skippedUnits),
  );
}

/**
 * The name a card's unit rows wear for their Space.
 *
 * The `Variant` label is what a Space is called inside its Component context
 * (`'base'`, `'nonprod'`, `'prod'`), which is the reading of the Space the card
 * is about — a raw slug like `base-rds-confighub-app` says far less.
 *
 * ⚠️ THE FALLBACKS ARE REQUIRED, not defensive padding. The label is optional,
 * so a Space carrying none must still name itself rather than render an empty
 * chip; a whitespace-only value is likewise unset, not a name. This is the same
 * `.trim() ||` rule the Component cards resolve their own titles by.
 */
export function cardSpaceLabel(
  spaceId: string,
  scopedSpaces: readonly CardSpaceLabelSource[] | null | undefined,
  spaceNameBySpaceId: ReadonlyMap<string, string>,
): string {
  return (
    scopedSpaces?.find((space) => space.spaceId === spaceId)?.labels?.[LABEL_VARIANT]?.trim()
    || spaceNameBySpaceId.get(spaceId)
    || spaceId
  );
}

/**
 * The refusals on one resource, when the reader is looking at its row.
 *
 * A MERGE IS REFUSED IN PARTS, NOT WHOLESALE. `Unit.Conflicts` is "the parts of
 * the last merge's patch that were not applied", so a resource can take three
 * paths and be refused two — and that resource has real field diffs, so it is
 * an ordinary changed row and never reaches the blocked block. Without this it
 * would render as though everything the change asked for had landed.
 */
export function rowRefusals(
  group: Pick<RolloutChangeGroup, 'conflicts'> | undefined,
): readonly RolloutResourceConflict[] {
  return (group?.conflicts ?? []).filter((conflict) => conflict.blocks);
}
