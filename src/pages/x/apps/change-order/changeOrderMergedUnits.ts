// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Turn one ChangeOrder stage's `ChangeOrderChangeGroup[]` into the `MergedUnit[]` rows the
 * ChangeOrder page lists. A row names its Unit and its Space. What the change does to the
 * Unit is its group's server diff, which the page draws from the group, so a row carries no
 * upgrade or variation entry of its own.
 *
 * Pure, no React.
 *
 * THREE OUTCOMES PER GROUP, NEVER COLLAPSED:
 *   - no configuration context for the Unit -> no row, and its id is in `droppedUnitIds`.
 *   - the change could not be established   -> the row, and its id is in
 *     `undeterminedUnitIds`, so the caller renders an explicit "cannot be determined"
 *     note. Without it the row could not be told from the next state.
 *   - established                            -> the row; an empty diff on its group reads
 *     as unchanged.
 */

import type { MergedUnit } from '../componentTypes';
import type { ChangeOrderChangeGroup } from './changeOrderTypes';

export interface ChangeOrderUnitContext {
  slug: string;
  spaceId: string;
  data?: string;
  toolchainType?: string;
}

export interface ChangeOrderMergedUnitsInput {
  /** The selected stage's groups — every Space's units, not one representative (see `useChangeOrderChanges`). */
  groups: readonly ChangeOrderChangeGroup[];
  currentDataByUnitId: ReadonlyMap<string, ChangeOrderUnitContext>;
}

export interface ChangeOrderMergedUnitsResult {
  units: MergedUnit[];
  /** Unit ids carrying a written (already-promoted), not a live-pending, change (ruling 5). */
  writtenUnitIds: ReadonlySet<string>;
  /** Unit ids whose incoming change could not be established this round — render an explicit note, never nothing. */
  undeterminedUnitIds: ReadonlySet<string>;
  /**
   * Unit ids DROPPED because no configuration context could be resolved.
   *
   * ⚠️ DROPPING THEM IS CORRECT; LEAVING NO TRACE WAS THE DEFECT. Without real
   * data there is no row to render, so the unit genuinely cannot be shown —
   * but a caller counting `units.length` then describes a set the page never
   * fully saw, while reading as complete. That is the same collapse as reading
   * an unanswered unit as unchanged, one pair over: "unreadable" becoming
   * indistinguishable from "absent".
   *
   * A drop is a decision, and a decision that leaves no trace cannot be told
   * apart from never having faced it.
   */
  droppedUnitIds: ReadonlySet<string>;
}

export function buildChangeOrderMergedUnits(input: ChangeOrderMergedUnitsInput): ChangeOrderMergedUnitsResult {
  const units: MergedUnit[] = [];
  const writtenUnitIds = new Set<string>();
  const undeterminedUnitIds = new Set<string>();
  const droppedUnitIds = new Set<string>();

  for (const group of input.groups) {
    const ctx = input.currentDataByUnitId.get(group.unitId);
    if (ctx === undefined) {
      droppedUnitIds.add(group.unitId);
      continue;
    }

    if (group.written) writtenUnitIds.add(group.unitId);
    if (!group.determinable) undeterminedUnitIds.add(group.unitId);

    units.push({
      unitId: group.unitId,
      slug: ctx.slug,
      spaceId: ctx.spaceId,
      hasUpstream: false,
      toolchainType: ctx.toolchainType,
      data: ctx.data,
      /*
       * `MergedUnit.isUpgradeLoading` is named for the side pane's own builder,
       * where it means a dry run is still in flight. Nothing is loading here:
       * the group is already resolved and INDETERMINATE, and no further request
       * would settle it. Both mean "not known yet", which is why the field is
       * reused rather than widened, but do not read this as a pending request.
       */
      isUpgradeLoading: !group.determinable,
      hasAction: group.determinable,
    });
  }

  return { units, writtenUnitIds, undeterminedUnitIds, droppedUnitIds };
}
