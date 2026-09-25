// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Pure comparison primitives that decide whether a view tab is "dirty" relative
 * to its saved baseline.
 *
 * Two consumers share this logic:
 *
 *  1. `useViewModificationTracking` — builds a snapshot from the live UI state
 *     (URL params + filter conditions + groupBy levels) and uses these helpers
 *     to compute the active tab's dirty flags.
 *
 *  2. The view-tabs strip — reads each non-active tab's persisted draft from
 *     localStorage and uses `compareDraftToView` to decide whether to render a
 *     ModifiedDot. Without this comparison the strip would show a spurious dot
 *     whenever a "clean" draft was written during a tab-switch (drafts are
 *     written unconditionally on leave; many of those drafts match the
 *     baseline and should not light up the dot).
 *
 * Keeping both consumers behind the same predicates ensures the active-tab dot
 * and the non-active-tab dot agree about what "modified" means.
 */

import type {
  ExtendedFilterRead,
  ExtendedViewRead,
  FilterRead,
} from '@confighub/rtk-query';

import type { ViewDraft } from './view-draft-storage';
import { hydrateGroupByFromView } from './groupBy-annotation';

/**
 * Serialisable snapshot of a view tab's display state — the comparison input.
 *
 * Matches the persisted `ViewDraft` shape (minus `version`/`savedAt`) so the
 * live UI state and a stored draft can be compared by the same helpers.
 */
export interface ViewSnapshot {
  filter: {
    Where: string;
    WhereData: string;
    ResourceType: string;
  };
  /** Visible column names in display order. */
  columns: string[];
  /** Comma-joined groupBy levels (e.g. "Space,Target"). Empty string = default. */
  groupBy: string;
  sortOrder: {
    orderBy: string;
    orderByDirection: string;
  };
}

/** Which parts of the view differ from the saved baseline. */
export interface DirtyFields {
  /** Filter WHERE / WhereData / ResourceType differ from saved baseline. */
  filter: boolean;
  /** Columns, GroupBy, or sort order differ from saved baseline. */
  viewFields: boolean;
}

/** True when a filter snapshot differs from a saved filter baseline. */
export function isFilterDirty(
  snapshot: ViewSnapshot['filter'],
  baseline: { Where: string; WhereData: string; ResourceType: string },
): boolean {
  return (
    snapshot.Where !== baseline.Where ||
    snapshot.WhereData !== baseline.WhereData ||
    snapshot.ResourceType !== baseline.ResourceType
  );
}

/**
 * True when an ordered column list differs from a saved baseline.
 * JSON.stringify gives us a cheap deep-equality check on string[].
 */
export function isColumnsDirty(snapshot: string[], baseline: string[]): boolean {
  return JSON.stringify(snapshot) !== JSON.stringify(baseline);
}

/**
 * True when a groupBy value differs from a saved baseline.
 * Empty string is treated as the implicit "Space" default so a missing draft
 * groupBy and a saved 'Space' agree.
 */
export function isGroupByDirty(snapshot: string, baseline: string): boolean {
  const left = snapshot || 'Space';
  const right = baseline || 'Space';
  return left !== right;
}

/** True when a sort snapshot differs from a saved baseline. */
export function isSortDirty(
  snapshot: ViewSnapshot['sortOrder'],
  baseline: { orderBy: string; orderByDirection: string },
): boolean {
  return (
    snapshot.orderBy !== baseline.orderBy ||
    snapshot.orderByDirection !== baseline.orderByDirection
  );
}

/**
 * Build the saved-baseline snapshot for a view's filter — never returns null,
 * so callers can compare against it directly.
 */
function baselineFilterFor(filter: FilterRead | null | undefined) {
  return {
    Where: filter?.Where ?? '',
    WhereData: filter?.WhereData ?? '',
    ResourceType: filter?.ResourceType ?? '',
  };
}

/**
 * Build the saved-baseline snapshot for a view's display fields (columns,
 * groupBy, sort).  Returns the canonical defaults when the view has no
 * explicit value so callers don't have to repeat that fallback chain.
 */
function baselineViewFieldsFor(
  view: ExtendedViewRead,
  defaultColumns: string[],
) {
  const v = view.View;
  // Hydrate the full multi-level grouping from the annotation, falling back to
  // the legacy single-level GroupBy field.  Returns 'Space' (the implicit
  // default) when neither is set, matching the pre-existing baseline contract.
  const hydrated = hydrateGroupByFromView(view);
  const groupBy = hydrated.length > 0 ? hydrated.join(',') : 'Space';
  return {
    columns: (v?.Columns ?? []).length > 0
      ? (v?.Columns ?? []).map((c) => c.Name ?? '')
      : defaultColumns,
    groupBy,
    orderBy: v?.OrderBy ?? '',
    orderByDirection: v?.OrderByDirection ?? '',
  };
}

/**
 * Compare a `ViewSnapshot` to a saved baseline.
 *
 * `view === null` means the sentinel "All units" tab: there is no saved
 * baseline, so any non-default field marks the snapshot as dirty.
 *
 * `activeFilter` is consulted for the filter comparison only; columns / sort /
 * groupBy live on the View. We accept both so the active-tab path (which has
 * `activeFilter` separately) and the draft path (which embeds filter fields
 * in the draft itself) share one call site.
 */
export function compareSnapshotToView(
  snapshot: ViewSnapshot,
  view: ExtendedViewRead | null,
  activeFilter: ExtendedFilterRead | null,
  defaultColumns: string[],
): DirtyFields {
  // ── Sentinel tab — no saved baseline, dirty when any field is non-default ──
  if (!view) {
    const filterDirty = Boolean(
      snapshot.filter.Where ||
      snapshot.filter.WhereData ||
      snapshot.filter.ResourceType,
    );
    const viewFieldsDirty =
      isColumnsDirty(snapshot.columns, defaultColumns) ||
      Boolean(snapshot.groupBy && snapshot.groupBy !== 'Space') ||
      Boolean(snapshot.sortOrder.orderBy) ||
      Boolean(snapshot.sortOrder.orderByDirection);
    return { filter: filterDirty, viewFields: viewFieldsDirty };
  }

  const filterBaseline = baselineFilterFor(activeFilter?.Filter);
  const viewBaseline = baselineViewFieldsFor(view, defaultColumns);

  const filterDirty = isFilterDirty(snapshot.filter, filterBaseline);
  const columnsDirty = isColumnsDirty(snapshot.columns, viewBaseline.columns);
  const groupByDirty = isGroupByDirty(snapshot.groupBy, viewBaseline.groupBy);
  const sortDirty = isSortDirty(snapshot.sortOrder, {
    orderBy: viewBaseline.orderBy,
    orderByDirection: viewBaseline.orderByDirection,
  });

  return {
    filter: filterDirty,
    viewFields: columnsDirty || groupByDirty || sortDirty,
  };
}

/**
 * Convert a persisted `ViewDraft` into a `ViewSnapshot` for comparison.
 * Drops the `version` and `savedAt` metadata fields.
 */
export function draftToSnapshot(draft: ViewDraft): ViewSnapshot {
  return {
    filter: { ...draft.filter },
    columns: draft.columns,
    groupBy: draft.groupBy,
    sortOrder: { ...draft.sortOrder },
  };
}

/**
 * True when a persisted draft differs from the saved view baseline.
 *
 * Used at render time by the view-tabs strip to decide whether each
 * non-active tab should show a ModifiedDot. Replaces the prior
 * "tab has a draft → show dot" rule, which falsely lit the dot for clean
 * drafts written by the unconditional write-on-leave path.
 *
 * `view === null` is treated as the sentinel tab (default baseline).
 */
export function compareDraftToView(
  draft: ViewDraft,
  view: ExtendedViewRead | null,
  defaultColumns: string[],
): boolean {
  // For the draft path the filter baseline lives on `view.Filter` (not on a
  // separate ExtendedFilterRead).  Wrap it in the shape compareSnapshotToView
  // expects so both call sites share one implementation.
  const filterWrapper = view
    ? ({ Filter: view.Filter } as ExtendedFilterRead)
    : null;
  const { filter, viewFields } = compareSnapshotToView(
    draftToSnapshot(draft),
    view,
    filterWrapper,
    defaultColumns,
  );
  return filter || viewFields;
}
