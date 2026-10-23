// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * useReleaseDiff -- what one comparison of a Space's release history changed, Unit by Unit.
 *
 * A comparison runs from a Release, or from nothing, to a Release or to each Unit's head:
 *   unreleased changes    the current Release -> head
 *   one Release           the Release before it (nothing, for the oldest) -> the Release
 *   a span                its older Release -> its newer Release, or head
 * The server diffs every Unit of it in one read (`releaseDiffApi`), matching resources by
 * identity and list elements by merge key, so a path two resources of one Unit share is
 * two changes, as it is in every other diff the UI shows.
 *
 * `ComponentSidePane` holds the unreleased instance: it feeds the footer's Release count and
 * the pane's default selection, and `ReleasesPane` shows it when nothing else is selected.
 * `ReleasesPane` reads every other comparison it shows through its own instance.
 */
import { useMemo } from 'react';

import type { ConfigDiff, UnitDiff } from '@confighub/rtk-query';

import { summarizeConfigDiff } from '@/components/config-diff/configDiffTree';

import { RELEASE_DIFF_HEAD, useGetReleaseDiffQuery } from './releaseDiffApi';

export { RELEASE_DIFF_HEAD };

/** One Unit's part in a comparison. */
export interface ReleaseUnitDiff {
  /** The resources the comparison changed, with the unchanged paths around the changes when read with context. */
  diff: ConfigDiff;
  /** One per changed path, and one for a resource added or deleted whole. */
  changes: number;
  /** The From side had no Revision of the Unit: it is new in the comparison, and every resource reads as added. */
  added: boolean;
}

export interface ReleaseDiffSummary {
  /**
   * The Units on the To side of the comparison, keyed by UnitID. A Unit the To Release did not
   * bundle is not part of what it holds, and is absent.
   */
  resultsByUnit: Map<string, ReleaseUnitDiff>;
  /** Changes over every Unit. */
  totalChanges: number;
  /** Units with at least one change. */
  changedUnits: number;
  /** A Unit's diff could not be read, so the totals would understate the comparison. */
  failed: boolean;
}

export interface ReleaseDiff extends ReleaseDiffSummary {
  /** Every Unit's diff has been read. Always false for a comparison with no Units. */
  allResolved: boolean;
  /** The comparison cannot be shown: the read, or a Unit's part of it, failed. */
  unavailable: boolean;
}

const EMPTY_DIFF: ConfigDiff = { Resources: [] };

/** A comparison's read, as one summary per Unit and totals over all of them. */
export function summarizeReleaseDiff(rows: readonly UnitDiff[] | undefined): ReleaseDiffSummary {
  const resultsByUnit = new Map<string, ReleaseUnitDiff>();
  let totalChanges = 0;
  let changedUnits = 0;
  let failed = false;
  for (const row of rows ?? []) {
    if (!row.UnitID) continue;
    if (row.Error) {
      failed = true;
      continue;
    }
    if (!row.ToRevisionNum) continue;
    const diff = row.Diff ?? EMPTY_DIFF;
    const changes = summarizeConfigDiff(diff).total;
    resultsByUnit.set(row.UnitID, { diff, changes, added: !row.FromRevisionNum });
    totalChanges += changes;
    if (changes > 0) changedUnits += 1;
  }
  return { resultsByUnit, totalChanges, changedUnits, failed };
}

const NOT_READ: ReleaseDiff = {
  resultsByUnit: new Map(),
  totalChanges: 0,
  changedUnits: 0,
  failed: false,
  allResolved: false,
  unavailable: false,
};

/**
 * The comparison of `unitIds` from `fromReleaseId` (undefined: from nothing) to `to`, a
 * ReleaseID or RELEASE_DIFF_HEAD. Nothing is read while `to` is undefined or there are no
 * Units; the result then reads as not resolved.
 */
export function useReleaseDiff(
  unitIds: readonly string[],
  fromReleaseId: string | undefined,
  to: string | undefined,
  { context = false }: { context?: boolean } = {},
): ReleaseDiff {
  const sortedIds = useMemo(() => [...new Set(unitIds)].sort(), [unitIds]);
  const skip = to === undefined || sortedIds.length === 0;
  // currentData, not data: a comparison the reader moved away from must not stand in for
  // the one now asked about while it loads.
  const { currentData, isError } = useGetReleaseDiffQuery(
    { unitIds: sortedIds, fromReleaseId, to: to ?? RELEASE_DIFF_HEAD, context },
    { skip },
  );
  return useMemo((): ReleaseDiff => {
    if (skip) return NOT_READ;
    if (isError) return { ...NOT_READ, unavailable: true };
    if (currentData === undefined) return NOT_READ;
    const summary = summarizeReleaseDiff(currentData);
    return { ...summary, allResolved: true, unavailable: summary.failed };
  }, [skip, isError, currentData]);
}
