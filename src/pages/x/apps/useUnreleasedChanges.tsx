// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * useUnreleasedChanges (task #69)
 *
 * Shared "changed since a release" diff resolution for a set of
 * release-target-scoped units. `ComponentSidePane` calls this hook ONCE for
 * the footer Release button's count (head-scoped, unconditional) and again
 * for the diff viewport (retargetable — see "Selectable baseline" below),
 * rather than each consumer fetching independently.
 *
 * === Mechanism ===
 * For one side of a comparison (a Release, or "head"), this needs the
 * revision each in-scope unit was at. `Revision.Releases` (a
 * `map[ReleaseID]string`) is the precise signal, and it IS server-side
 * where-filterable via `?` containment: `RevisionQueryableAttributeProps`
 * registers it as `DataTypeUUIDStringMap` (internal/models/revision.go:397),
 * `?` is an allowed operator for that datatype
 * (internal/views/filter_parser.go:809-823), and the OpenAPI spec documents
 * it alongside the identical `Tags ? '<tag-id>'` form. Confirmed live against
 * the running backend by `testReleaseRevisionQuery` in
 * test/scripts/test-setup.sh (`--where "Releases ? '$rid1'"`, asserted).
 *
 * That means ONE org-wide query — `useListAllRevisionsQuery` (`GET
 * /revision`, already used the same way at ComponentActivityFeed.tsx:855)
 * with `where: "SpaceID = '<space>' AND Releases ? '<release>'"` — returns
 * exactly the set of revisions bundled into that release, ONE per unit,
 * complete with `Data` if selected. No per-unit fan-out, no two-stage
 * fetch: a release with N units costs ONE request regardless of N or of
 * how many revisions exist in that unit's history. Compare this to the
 * PRE-EXISTING per-unit `RevisionNum,Releases` list this replaced: that
 * queried EVERY revision of every in-scope unit on every tab open (no
 * `Releases ? id` filter, no bound), which is also a server-side cost — each
 * returned row runs an individual permission check
 * (internal/views/list.go:295-305).
 *
 * === Resolving "unreleased changes" (default) vs "what a release introduced" (historical) ===
 * A comparison has an OLD side and a NEW side:
 *   default:     old = revision bundled into the LATEST release; new = head
 *                (already in `units[].data` — no fetch for this side)
 *   historical:  old = revision bundled into the release BEFORE the selected
 *                one; new = revision bundled into the SELECTED release
 * So at most ONE query resolves the old side and at most ONE resolves the
 * new side — two requests total for a historical selection, one for the
 * default state (head never needs a query). A unit missing from the new
 * side's result was not bundled into that release at all and must not
 * render; a unit whose revision number is IDENTICAL on both sides did not
 * change in it and renders no diff.
 *
 * === Selectable baseline (design C) ===
 * The optional `baseline` argument generalises the comparison to the single
 * rule the Releases tab follows: the viewport shows what the selected point
 * INTRODUCED, relative to the point before it. With no `baseline`, the
 * selected point is head — byte-identical to the original behaviour. With a
 * `baseline`, the selected point is a past Release; its predecessor is
 * always STRUCTURAL (the release before it in history), never picked by the
 * user — the line that keeps this a single selection, not a compare-picker.
 *
 * `ComponentSidePane` calls this hook TWICE — once with no baseline (feeds
 * the footer Release button's count, unconditionally head-scoped) and once
 * with the selected baseline (feeds the viewport). These are two INDEPENDENT
 * hook instances with no shared mutable state: selecting a historical
 * release cannot retarget the footer's count, because the footer's instance
 * never receives the `baseline` argument at all. Consequence: while a
 * historical release is selected, BOTH instances are live (the footer still
 * needs its head-scoped totals), so the historical selection's 1-2 requests
 * are on top of the default instance's request, not instead of it.
 */
import { useMemo } from 'react';

import { useListAllRevisionsQuery } from '@confighub/rtk-query';

import type { FieldDiff } from './componentTypes';
import { buildPaths, computeFieldDiffs, countLogicalChanges } from './entryBuilders';
import { useRevisionDataMap } from '@/hooks/useUnitData';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Which two points the viewport is comparing, when it is NOT showing
 * "unreleased changes". Both sides are Release IDs. The "before" side is
 * undefined for the OLDEST release, which has no predecessor.
 */
export interface ReleaseBaseline {
  /** The Release whose introduced changes are being shown — the "after" side. */
  afterReleaseId: string;
  /** The Release immediately preceding `afterReleaseId` in history — the "before" side. */
  beforeReleaseId: string | undefined;
}

export interface UnreleasedUnitDiffResult {
  /** Still resolving (the old-side and/or new-side revision query). */
  isLoading: boolean;
  /** No revision of this unit was ever bundled into the old-side release — every new-side field reads as new. */
  neverReleased: boolean;
  fieldDiffs: FieldDiff[];
  /** The old side's paths — see the module doc for why this must be the OLD side, not the new side's. */
  allPaths: { path: string; value: string }[];
  /**
   * The OLD side's raw unit Data (undefined when `neverReleased`). This is
   * what the diff viewport must render as "current" — see the module doc's
   * "Selectable baseline" section: the comparison is always OLD → NEW, and
   * NEW already lives in `units[].data`/the release's own fetched revision.
   * Feeding the tree the unit's live HEAD data instead of this would make
   * "current" and "incoming" the same value on the new-side field (both
   * head), which is exactly the bug this field exists to prevent — the
   * inline diff would always compare a value against itself and never show
   * a change.
   */
  oldData: string | undefined;
  /** The resolved NEW-side revision's RevisionNum (or, in default mode, the old side's — see call sites), when found. */
  matchedRevisionNum: number | undefined;
}

export interface UseUnreleasedChangesResult {
  /** Per-unit resolved result, keyed by unitId. Absent = not yet resolved (still loading). */
  resultsByUnit: Map<string, UnreleasedUnitDiffResult>;
  /** True once EVERY unit in the input list has a resolved (non-loading) entry. False for an empty unit list. */
  allResolved: boolean;
  /**
   * Total CHANGED FIELDS across every unit, using the SAME logical-change
   * counting granularity `totalUpgradableFields` uses for Upgrade
   * (countLogicalChanges — a wholly-added/removed array element counts as
   * ONE, not one per leaf). Always 0 until `allResolved`.
   */
  totalChangedFields: number;
}

interface RevisionSideRow {
  unitId: string;
  revisionNum: number;
  data: string | undefined;
}

function indexByUnitId(rows: RevisionSideRow[] | undefined): Map<string, RevisionSideRow> {
  const map = new Map<string, RevisionSideRow>();
  for (const r of rows ?? []) map.set(r.unitId, r);
  return map;
}

// Data is not a selectable field any more; it is read from the revision-data endpoint.
const SIDE_SELECT_FIELDS = 'RevisionID,RevisionNum,UnitID';

/**
 * One side of a comparison: every unit's revision that was bundled into
 * `releaseId`, in ONE request — see module doc's "Mechanism" section.
 * `enabled` additionally gates the request (skip when nothing needs it,
 * e.g. the baseline-scoped instance while nothing is selected).
 */
function useRevisionSide(
  spaceId: string,
  releaseId: string | undefined,
  enabled: boolean,
): { rowsByUnit: Map<string, RevisionSideRow>; resolved: boolean } {
  const where = enabled && releaseId
    ? `SpaceID = '${spaceId}' AND Releases ? '${releaseId}'`
    : undefined;
  // Configuration is not on the Revision; every Revision this side lists is fetched at once.
  const { data, isFetching } = useListAllRevisionsQuery(
    { where, select: SIDE_SELECT_FIELDS },
    { skip: !where },
  );
  const { dataFor, ready: dataReady } = useRevisionDataMap(
    (data ?? []).map((r) => r.Revision?.RevisionID),
  );

  const rows = useMemo((): RevisionSideRow[] | undefined => {
    if (!data) return data;
    const out: RevisionSideRow[] = [];
    for (const r of data) {
      const unitId = r.Revision?.UnitID;
      const revisionNum = r.Revision?.RevisionNum;
      if (unitId == null || revisionNum == null) continue;
      out.push({ unitId, revisionNum, data: dataFor(r.Revision?.RevisionID) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dataFor]);

  const rowsByUnit = useMemo(() => indexByUnitId(rows), [rows]);
  // The configuration arrives in a second request. Until it does, every head field diffs as
  // changed, which would move the pane's default selection before the count has settled.
  const resolved = !where || (!isFetching && data !== undefined && dataReady);
  return { rowsByUnit, resolved };
}

/**
 * Resolves a "changed since a release" (or "changed in a release") diff for
 * a set of release-target-scoped units.
 *
 * Pass an EMPTY `units` array to skip all fetching entirely (e.g. when the
 * Releases tab isn't active, or — for the baseline-scoped instance — nothing
 * is selected) — the hook itself is always safe to call unconditionally
 * (rules of hooks), the caller controls cost via what it passes as `units`.
 */
export function useUnreleasedChanges(
  units: { unitId: string; slug: string; spaceId: string; data?: string }[],
  latestReleaseId: string | undefined,
  spaceId: string,
  baseline?: ReleaseBaseline,
): UseUnreleasedChangesResult {
  const historical = baseline != null;
  const hasUnits = units.length > 0;

  const oldReleaseId = historical ? baseline.beforeReleaseId : latestReleaseId;
  const oldSide = useRevisionSide(spaceId, oldReleaseId, hasUnits);

  // In default mode the "new" side is head, already in `units[].data` — no
  // query for this side at all.
  const newSide = useRevisionSide(spaceId, historical ? baseline.afterReleaseId : undefined, hasUnits && historical);

  const bothSidesResolved = oldSide.resolved && newSide.resolved;

  const resultsByUnit = useMemo(() => {
    const map = new Map<string, UnreleasedUnitDiffResult>();
    if (!bothSidesResolved) return map; // empty = every unit still reads as loading
    for (const u of units) {
      const oldRow = oldSide.rowsByUnit.get(u.unitId);
      const newRow = historical ? newSide.rowsByUnit.get(u.unitId) : undefined;

      // Not bundled into the selected release at all — contributed nothing
      // to it, so it must not render (and must NOT be diffed against its
      // predecessor, which would read as a wholesale removal).
      if (historical && !newRow) continue;

      // Same revision either side of the selected release — did not change
      // in it. Most units don't change in most releases.
      if (historical && oldRow && newRow && oldRow.revisionNum === newRow.revisionNum) {
        map.set(u.unitId, { isLoading: false, neverReleased: false, fieldDiffs: [], allPaths: [], oldData: oldRow.data, matchedRevisionNum: newRow.revisionNum });
        continue;
      }

      // No "old" side: never bundled into the predecessor. In default mode
      // that means never released at all; in historical mode it means the
      // unit was ADDED in the selected release. Either way every field
      // reads as new (parseUnitData returns an empty map for undefined
      // input — see configParser.ts).
      const neverReleased = !oldRow;
      const oldData = neverReleased ? undefined : oldRow?.data;
      const newData = historical ? newRow?.data : u.data;

      map.set(u.unitId, {
        isLoading: false,
        neverReleased,
        fieldDiffs: computeFieldDiffs(oldData, newData),
        allPaths: buildPaths(oldData),
        oldData,
        matchedRevisionNum: historical ? newRow?.revisionNum : oldRow?.revisionNum,
      });
    }
    return map;
  }, [bothSidesResolved, units, oldSide.rowsByUnit, newSide.rowsByUnit, historical]);

  const allResolved = hasUnits && bothSidesResolved;

  const totalChangedFields = useMemo(() => {
    if (!allResolved) return 0;
    let total = 0;
    for (const u of units) {
      const r = resultsByUnit.get(u.unitId);
      if (!r) continue;
      total += countLogicalChanges(r.fieldDiffs.map((d) => d.path));
    }
    return total;
  }, [allResolved, units, resultsByUnit]);

  return { resultsByUnit, allResolved, totalChangedFields };
}
