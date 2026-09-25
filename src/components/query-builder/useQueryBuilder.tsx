// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  type Column,
  type ExtendedFilterRead,
  type ExtendedViewRead,
  type FilterRead,
  type ViewRead,
  useCreateFilterMutation,
  useListAllFiltersQuery,
  useListAllViewsQuery,
  usePatchFilterMutation,
  usePatchViewMutation,
} from '@confighub/rtk-query';
import {
  DEFAULT_UNIT_COLUMNS,
  calculateColumnDelta,
  encodeColumnDelta,
  getColumnsFromDelta,
  normalizeColumnNames,
} from '@/utility/column-delta-functions';
import { FILTER_URL_PARAMS, VIEW_URL_PARAMS } from '@/utility/constants/url-params';

import { QueryBuilder as QueryBuilderComponent } from './QueryBuilder';
import { ViewTabs, SENTINEL_TAB_ID, slugify } from './ViewTabs';
import { clearFilterStateFromUrl, syncFilterStateToUrl } from './url-sync';
import { computeNeedsGroupBySync } from './groupBy-url-sync';
import {
  buildGroupByAnnotationValue,
  hydrateGroupByFromView,
  mergeGroupByAnnotation,
} from './groupBy-annotation';
import { generateFilterId, getAvailableFieldsForEntity } from './operators';
import type { EntityType, FilterCondition, LabelOptions } from './types';
import { deleteViewDraft, readViewDraft, scanDraftedTabIds, writeViewDraft } from './view-draft-storage';
import type { ViewDraft } from './view-draft-storage';
import { compareDraftToView } from './view-comparison';
import { useViewModificationTracking } from './useViewModificationTracking';
import { buildWhereClauses, expandSavedFilterToConditions, parseWhereClausesToFilters } from './utils';

// Module-level constants for stable default references
// These prevent unstable references when options props are undefined
const EMPTY_NAMED_ENTITY_ARRAY: Array<{ id: string; name: string }> = [];
const EMPTY_SLUG_OPTIONS: Array<{ slug: string; spaceName: string }> = [];
const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_FILTER_CONDITIONS: FilterCondition[] = [];
const EMPTY_LABEL_OPTIONS: LabelOptions = { keys: [], valuesByKey: {}, countByKey: {}, countByKeyValue: {} };

/** Returns the localStorage key for persisting the open tabs list, namespaced by entity type. */
const openTabsKey = (entityType: string) =>
  `confighub:${entityType.toLowerCase()}:openViewTabs`;

/**
 * Returns true when a view is an initiative-owned view (flagged by
 * `Labels.initiative === 'true'`).  Initiative views are created and managed
 * from the Initiatives page — they should never appear in the unit-list tab
 * strip or the "+" tab-manager dropdown.
 */
export const isInitiativeView = (view: ExtendedViewRead): boolean =>
  view.View?.Labels?.['initiative'] === 'true';

/**
 * Pure predicate — returns true when a keydown event should trigger the Cmd/Ctrl+S save action.
 * Extracted for testability: no saved-view tab active (sentinel) → false; input focused → false.
 *
 * @param e - The keyboard event to evaluate.
 * @param activeView - The currently active saved view, or null for the sentinel tab.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldTriggerCmdS(e: KeyboardEvent, activeView: ExtendedViewRead | null): boolean {
  // macOS: metaKey; Windows/Linux: ctrlKey
  if (!(e.metaKey || e.ctrlKey) || e.key !== 's') return false;
  // Don't intercept when the user is editing text
  const target = e.target as HTMLElement;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  ) return false;
  // Only fire on a saved view tab — sentinel tab excluded
  if (!activeView) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Exported pure helpers (used by handleSave; exported for test coverage)
// ---------------------------------------------------------------------------

/**
 * Determine the final Columns payload for a view PATCH from a URL delta param.
 *
 * When a delta param is present it represents the user's explicit column
 * selection; otherwise we fall back to DEFAULT_UNIT_COLUMNS so the saved list
 * matches the default grid state.  GroupBy levels are intentionally never
 * injected here — GroupBy is sidebar-only since the view-tabs refactor.
 *
 * @param columnsDeltaParam - The `viewColumns` URL param value (or null).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function buildSaveColumns(columnsDeltaParam: string | null): Column[] {
  if (columnsDeltaParam) return getColumnsFromDelta(columnsDeltaParam);
  return DEFAULT_UNIT_COLUMNS.map((col) => ({ Name: col }));
}

/**
 * Determine the final GroupBy payload for a view PATCH from the local
 * groupBy columns array.
 *
 * Only the first level is persisted to the `GroupBy` field on the server;
 * multi-level grouping is an in-memory UI concept stored in the same field as
 * a comma-separated string (e.g. `"Space,Target"`).
 *
 * @param localGroupByColumns - The current groupBy levels (first element wins).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function buildSaveGroupBy(localGroupByColumns: string[]): string | null {
  return localGroupByColumns[0] ?? null;
}

/**
 * Options for the useQueryBuilder hook
 */
export interface UseQueryBuilderOptions {
  /** Entity type being filtered (Unit, Space, Target, etc.) */
  entityType: EntityType;
  /** Available spaces for the space filter */
  spaces?: Array<{ id: string; name: string; labels?: Record<string, string> }>;
  /** Available targets for the target filter */
  targets?: Array<{ id: string; name: string }>;
  /** Available toolchain types */
  toolchainTypes?: string[];
  /** Available bridge workers for the bridgeWorker filter */
  bridgeWorkers?: Array<{ id: string; name: string }>;
  /** Available slugs for the slug autocomplete, with space grouping */
  slugs?: Array<{ slug: string; spaceName: string }>;
  /** Available resource types for the resource type filter */
  resourceTypes?: string[];
  /** Available label keys and values for the labels filter */
  labelOptions?: LabelOptions;
  /** Locked filters that are always shown and cannot be removed */
  lockedFilters?: FilterCondition[];
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Whether to sync filters to URL (default: false) */
  syncToUrl?: boolean;
  /** Whether to render the views tab strip via `renderViewTabs` (default: false; only applies when syncToUrl is true) */
  showViewSelector?: boolean;
  /** Callback when a URL-referenced filter/view fails to load (for displaying errors to user) */
  onUrlLoadError?: (message: string) => void;
  /** Initial filter conditions to pre-populate (ignored when syncToUrl restores from URL) */
  initialFilters?: FilterCondition[];
  /**
   * Called when the unified Save fails so UnitListPage can surface the error.
   */
  onSaveError?: (message: string) => void;
}

/**
 * Render-prop options for the Views tabs strip.
 *
 * The page owns the save / share modals (e.g. `SaveViewModal`), so the strip
 * delegates to callbacks supplied here. This keeps the strip component a pure
 * presentational element that does not import page-specific dialogs.
 */
export interface ViewTabsRenderOptions {
  /** Called after a new view is created so the parent can switch to it. */
  onViewCreated?: (view: ExtendedViewRead) => void;
  /** Space ID for create/patch mutations. */
  spaceId?: string;
  /** Current filter ID pre-populated into new views. */
  filterId?: string;
  /** Live groupBy columns (overrides the URL's groupBy param when saving). */
  localGroupByColumns?: string[];
}

/**
 * Result returned by the useQueryBuilder hook
 */
export interface UseQueryBuilderResult {
  /** Pre-configured QueryBuilder component (filter button + filter rows, no view selector) */
  QueryBuilderElement: React.ReactElement;
  /**
   * Build the Views-as-tabs strip; pass page-owned save / new-view handlers in.
   *
   * Pages can render the returned element wherever they want the strip to sit
   * (the typical placement is between the page-tool row and the query builder).
   */
  renderViewTabs: (options?: ViewTabsRenderOptions) => React.ReactElement | null;

  /** WHERE clause for API queries */
  whereClause: string;
  /** WHERE_DATA clause for API queries */
  whereDataClause: string;
  /** Resource type clause for API queries */
  resourceTypeClause: string;

  /** Current filter conditions (for client-side filtering) */
  filters: FilterCondition[];
  /** Update filter conditions */
  setFilters: (filters: FilterCondition[]) => void;
  /** Clear all filters */
  clearFilters: () => void;

  /** Currently active saved filter (only when syncToUrl: true) */
  activeFilter: ExtendedFilterRead | null;
  /** Currently active saved view (only when syncToUrl: true) */
  activeView: ExtendedViewRead | null;
  /**
   * Immediately apply a PATCH response to the active view, so callers don't
   * have to wait for an RTK Query cache-invalidation refetch to see the updated
   * view state (e.g. after saving grouping changes).
   */
  refreshActiveView: (updated: ViewRead) => void;
  /** Whether the active view (or sentinel state) has been modified from the saved baseline */
  isViewModified: boolean;
  /**
   * All saved views for this entity, alphabetised and with initiative views
   * filtered out.  Exposed so callers can drive features that need the full
   * view list — e.g. prefetching inactive open tabs' unit data.
   */
  allViewsForEntity: ExtendedViewRead[];
  /**
   * Tab IDs currently pinned in the strip (sentinel + saved view IDs).
   * Exposed for the same reason as `allViewsForEntity` — primarily for
   * features that key off "which tabs are open".
   */
  openTabIds: string[];
}

/**
 * Hook to manage QueryBuilder state, URL sync, and saved filter/view handling.
 *
 * This hook encapsulates all QueryBuilder logic so pages don't need to manage
 * filter state, URL sync, or saved filter/view selection manually.
 *
 * @example
 * // Simple usage (no URL sync)
 * const { QueryBuilderElement, whereClause, clearFilters } = useQueryBuilder({
 *   entityType: 'Space',
 *   labelOptions,
 *   disabled: isFetching,
 * });
 *
 * @example
 * // With URL sync and saved filter support
 * const { QueryBuilderElement, whereClause, filters, activeFilter } = useQueryBuilder({
 *   entityType: 'Unit',
 *   spaces,
 *   targets,
 *   syncToUrl: true,
 * });
 */
export const useQueryBuilder = (options: UseQueryBuilderOptions): UseQueryBuilderResult => {
  // Use module-level constants for stable default references
  // This prevents QueryBuilderElement useMemo from re-running when props are undefined
  const {
    entityType,
    spaces = EMPTY_NAMED_ENTITY_ARRAY,
    targets = EMPTY_NAMED_ENTITY_ARRAY,
    toolchainTypes,
    bridgeWorkers = EMPTY_NAMED_ENTITY_ARRAY,
    slugs = EMPTY_SLUG_OPTIONS,
    resourceTypes = EMPTY_STRING_ARRAY,
    labelOptions = EMPTY_LABEL_OPTIONS,
    lockedFilters = EMPTY_FILTER_CONDITIONS,
    disabled = false,
    syncToUrl = false,
    showViewSelector = false,
    onUrlLoadError,
    initialFilters,
    onSaveError,
  } = options;

  // Get available fields for this entity type — used to disambiguate API field names
  // that map to multiple filter fields (e.g., TargetID → 'target' vs 'targetId')
  const availableFields = useMemo(() => getAvailableFieldsForEntity(entityType), [entityType]);

  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state
  const [filters, setFiltersInternal] = useState<FilterCondition[]>(() => initialFilters ?? []);

  // Active saved filter/view state (only used when syncToUrl: true)
  const [activeFilter, setActiveFilter] = useState<ExtendedFilterRead | null>(null);
  const [activeView, setActiveView] = useState<ExtendedViewRead | null>(null);

  // Track modifications to the full view (filter + view fields).
  // groupBy is read from the `viewGroupBy` URL param inside useViewModificationTracking,
  // matching the URL-first architecture used by columns, sort, and filter conditions.
  const { isViewModified, dirtyFields } = useViewModificationTracking(
    activeView,
    activeFilter,
    filters,
    searchParams,
  );

  // ─── Per-tab draft state ──────────────────────────────────────────────────
  // Lazily initialised by scanning localStorage for any existing drafts matching
  // the currently open tab IDs.
  const [draftedTabIds, setDraftedTabIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(openTabsKey(entityType));
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw) as { version?: number; viewIds?: unknown };
      if (parsed.version === 1 && Array.isArray(parsed.viewIds)) {
        return scanDraftedTabIds(parsed.viewIds as string[], entityType);
      }
      return new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const [isSavingView, setIsSavingView] = useState(false);

  // Ref for imperatively opening the "Create new view" popover in ViewTabs.
  // ViewTabs registers a function here on mount via onRegisterOpenNewView.
  const openNewViewRef = useRef<(() => void) | null>(null);
  const handleRegisterOpenNewView = useCallback((fn: () => void) => {
    openNewViewRef.current = fn;
  }, []);

  // RTK mutations for the unified Save handler
  const [patchFilter] = usePatchFilterMutation();
  const [patchViewMutation] = usePatchViewMutation();
  // Auto-mint a Filter when the user creates a new view without one
  // selected — keeps the New View flow one click, not two entities.
  const [createFilter] = useCreateFilterMutation();

  // ─── URL state-machine refs ──────────────────────────────────────────────
  //
  // These four refs coordinate the two-phase URL synchronisation lifecycle.
  // Mishandling them is the #1 source of "filter resets itself" / "view not
  // remembered" bugs — read the invariants before touching any of them.
  //
  //  hasInitializedFromUrl
  //    ● false on mount; set to true once the init effect successfully commits
  //      all state derived from the URL (filter conditions + active view).
  //    ● Reset to false when the URL change is *external* (nav-click, back/
  //      forward) so the init effect re-runs for the new URL state.
  //    ● Guards: the URL-change detection effect ignores changes while false
  //      (init still in flight); the init effect itself is a no-op while true.
  //
  //  prevSearchParamsRef
  //    ● Mirrors the last *committed* search-params string.
  //    ● Used by the URL-change detection effect to distinguish external changes
  //      (user navigation) from internal ones (our own setSearchParams calls).
  //    ● Set to null on mount; the first run of the detection effect sets it
  //      to the current params without triggering re-initialisation.
  //
  //  isInternalUrlChangeRef  (counter, not boolean)
  //    ● Incremented (+1) every time we call setSearchParams for an *internal*
  //      reason (applying a filter, syncing view params, opening a tab, etc.).
  //    ● Decremented (−1) once per searchParams update in the change-detection
  //      effect so each internal change is masked exactly once.
  //    ● A counter beats a boolean when two rapid setSearchParams calls happen
  //      before the effect fires — each call is independently masked.
  //
  //  isWaitingForInitData  (derived, not a ref)
  //    ● True when syncToUrl is on, init hasn't run yet, AND the RTK Query data
  //      the init effect needs (filter list, view list) isn't loaded yet.
  //    ● Blocks the init effect until all required data is available, preventing
  //      partial initialisation from a stale empty array.
  //
  // Transition diagram (syncToUrl = true):
  //
  //   mount
  //     │ prevSearchParamsRef = null
  //     │ hasInitializedFromUrl = false
  //     │ isInternalUrlChangeRef = 0
  //     ▼
  //   Data loads (RTK Query)
  //     │ isWaitingForInitData flips to false
  //     ▼
  //   Init effect runs → commits state from URL
  //     │ hasInitializedFromUrl = true
  //     │ prevSearchParamsRef = current params
  //     ▼
  //   User / code calls setSearchParams (internal)
  //     │ isInternalUrlChangeRef++
  //     ▼
  //   Change-detection effect fires
  //     │ isInternalUrlChangeRef > 0 → decrement, skip re-init
  //     ▼
  //   External navigation (nav-click / back/forward)
  //     │ hasInitializedFromUrl = false  ← reset triggers re-init
  //     │ prevSearchParamsRef updated
  //     ▼  (back to "Init effect runs")
  //
  const hasInitializedFromUrl = useRef(false);

  // Track previous search params to detect external URL resets (e.g., clicking nav menu)
  const prevSearchParamsRef = useRef<string | null>(null);

  // Counter of pending internal URL changes.  Each place that calls setSearchParams
  // for an internal reason increments this; the URL-change detection effect decrements
  // it once per searchParams update.  Using a counter (vs. boolean) means two rapid
  // internal setSearchParams calls are each correctly masked, even if the effect fires
  // once per call.
  const isInternalUrlChangeRef = useRef(0);

  // Get filterID and viewID from URL params (for fetching saved filter/view)
  const filterIdParam = syncToUrl ? searchParams.get(FILTER_URL_PARAMS.FILTER_ID) || '' : '';
  const viewIdParam = syncToUrl ? searchParams.get(VIEW_URL_PARAMS.VIEW_ID) || '' : '';

  // Detect external URL changes (e.g., clicking nav menu, browser back/forward)
  // This runs after initialization and checks if URL params have changed externally
  useEffect(() => {
    if (!syncToUrl) return;

    const currentParams = searchParams.toString();

    // Skip the first run (initialization) - we need a previous value to compare against
    if (prevSearchParamsRef.current === null) {
      prevSearchParamsRef.current = currentParams;
      return;
    }

    // Skip if params haven't changed
    if (prevSearchParamsRef.current === currentParams) {
      return;
    }

    // Skip if this is an internal URL change (user modified filters via UI).
    // Decrement the counter — one pending internal change consumed per effect run.
    if (isInternalUrlChangeRef.current > 0) {
      isInternalUrlChangeRef.current--;
      prevSearchParamsRef.current = currentParams;
      return;
    }

    // Extract filter-related params for comparison
    const getFilterParams = (params: URLSearchParams) => ({
      where: params.get(FILTER_URL_PARAMS.WHERE) || '',
      whereData: params.get(FILTER_URL_PARAMS.WHERE_DATA) || '',
      spaceId: params.get(FILTER_URL_PARAMS.SPACE_ID) || '',
      resourceType: params.get(FILTER_URL_PARAMS.RESOURCE_TYPE) || '',
      filterId: params.get(FILTER_URL_PARAMS.FILTER_ID) || '',
      viewId: params.get(VIEW_URL_PARAMS.VIEW_ID) || '',
      type: params.get(VIEW_URL_PARAMS.TYPE) || '',
    });

    const prevParams = new URLSearchParams(prevSearchParamsRef.current);
    const prevFilterParams = getFilterParams(prevParams);
    const currentFilterParams = getFilterParams(searchParams);

    // Check if any filter-related params have changed
    const hasFilterParamsChanged =
      prevFilterParams.where !== currentFilterParams.where ||
      prevFilterParams.whereData !== currentFilterParams.whereData ||
      prevFilterParams.spaceId !== currentFilterParams.spaceId ||
      prevFilterParams.resourceType !== currentFilterParams.resourceType ||
      prevFilterParams.filterId !== currentFilterParams.filterId ||
      prevFilterParams.viewId !== currentFilterParams.viewId ||
      prevFilterParams.type !== currentFilterParams.type;

    if (hasFilterParamsChanged) {
      // Reset initialization flag so the initialization effect will re-run
      // This handles browser back/forward navigation and external URL changes
      hasInitializedFromUrl.current = false;

      // Check if current URL has no filter params at all - clear state immediately
      // This handles the case of navigating back to a URL with no filters
      const currentHasFilterParams =
        currentFilterParams.where ||
        currentFilterParams.whereData ||
        currentFilterParams.filterId ||
        currentFilterParams.viewId;

      if (!currentHasFilterParams) {
        setFiltersInternal([]);
        setActiveFilter(null);
        setActiveView(null);
      }
    }

    // Update ref for next comparison
    prevSearchParamsRef.current = currentParams;
  }, [syncToUrl, searchParams]);

  // Escape filterIdParam and viewIdParam for use in WHERE clause (prevent SQL injection)
  const escapedFilterIdParam = filterIdParam.replace(/'/g, "''");
  const escapedViewIdParam = viewIdParam.replace(/'/g, "''");

  // Fetch saved filter by ID if present in URL
  const {
    data: savedFiltersData,
    isLoading: isFilterLoading,
    isError: isFilterFetchError,
    error: filterFetchError,
  } = useListAllFiltersQuery(
    { where: `FilterID = '${escapedFilterIdParam}'` },
    { skip: !filterIdParam }
  );

  // Fetch saved view by ID if present in URL
  const {
    data: savedViewsData,
    isLoading: isViewLoading,
    isError: isViewFetchError,
    error: viewFetchError,
  } = useListAllViewsQuery(
    { where: `ViewID = '${escapedViewIdParam}'`, include: 'FilterID' },
    { skip: !viewIdParam }
  );

  // Fetch ALL views for the tab strip. RTK Query deduplicates the network
  // request with the per-ID query above.
  const { data: allViewsData = [] } = useListAllViewsQuery({ include: 'FilterID' });

  // Derive all views for this entity, sorted alphabetically and with
  // initiative views removed (they live on the Initiatives page).
  const allViewsForEntity = useMemo(
    () =>
      allViewsData
        .filter((v) => v.Filter?.From === entityType)
        .filter((v) => !isInitiativeView(v))
        .sort((a, b) =>
          (a.View?.DisplayName ?? '').localeCompare(b.View?.DisplayName ?? ''),
        ),
    [allViewsData, entityType],
  );

  // ─── Open-tabs state ───────────────────────────────────────────────────────
  // Lazily initialised from localStorage. Falls back to [SENTINEL_TAB_ID]
  // (only the sentinel visible) when the key is absent or the data is corrupt.
  const [openTabIds, setOpenTabIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(openTabsKey(entityType));
      if (!raw) return [SENTINEL_TAB_ID];
      const parsed = JSON.parse(raw) as { version?: number; viewIds?: unknown };
      if (parsed.version === 1 && Array.isArray(parsed.viewIds)) {
        return parsed.viewIds as string[];
      }
      return [SENTINEL_TAB_ID];
    } catch {
      return [SENTINEL_TAB_ID];
    }
  });

  /** Set the open tab list AND persist it to localStorage in one call. */
  const persistOpenTabIds = useCallback((ids: string[]) => {
    setOpenTabIds(ids);
    try {
      localStorage.setItem(openTabsKey(entityType), JSON.stringify({ version: 1, viewIds: ids }));
    } catch { /* ignore — storage full or unavailable */ }
  }, []);

  // Silently drop persisted IDs that no longer exist or are no longer valid.
  // Initiative views and deleted views are both quietly removed from openTabIds.
  //
  // `entityType` is included in deps to satisfy react-hooks/exhaustive-deps
  // and to match the dep shape of the sibling mount-time GC effect below
  // (which also keys its localStorage I/O on entityType).  entityType is a
  // stable prop per hook instance in practice, so this never triggers an
  // unintended re-run.
  useEffect(() => {
    if (!allViewsData.length) return;
    // Valid candidates = sentinel + selectable views (entity-filtered, initiative-excluded)
    const validViewIds = new Set(allViewsForEntity.map((v) => v.View?.ViewID ?? ''));
    validViewIds.add(SENTINEL_TAB_ID);
    setOpenTabIds((prev) => {
      const filtered = prev.filter((id) => validViewIds.has(id));
      if (filtered.length === prev.length) return prev;
      try {
        localStorage.setItem(openTabsKey(entityType), JSON.stringify({ version: 1, viewIds: filtered }));
      } catch { /* ignore */ }
      return filtered;
    });
  }, [allViewsData, allViewsForEntity, entityType]);

  // Derive whether we're waiting for async data needed for initialization
  // This prevents race conditions where the effect runs before data is available
  const isWaitingForInitData = syncToUrl && !hasInitializedFromUrl.current && (
    (viewIdParam && isViewLoading) ||
    (filterIdParam && !viewIdParam && isFilterLoading)
  );

  // Initialize filters from URL params on mount (only when syncToUrl is enabled)
  //
  // RACE CONDITION MITIGATION:
  // This effect depends on async data (savedFiltersData, savedViewsData) which may arrive
  // at different times. We use isWaitingForInitData to prevent the effect from running
  // prematurely. The key invariants are:
  // 1. If viewIdParam is set, we MUST wait for savedViewsData before initializing
  // 2. If filterIdParam is set (without viewIdParam), we MUST wait for savedFiltersData
  // 3. State updates (setFiltersInternal, setActiveFilter, setActiveView) are batched by React 18+
  // 4. hasInitializedFromUrl.current is set ONLY after all state is committed
  useEffect(() => {
    if (!syncToUrl || hasInitializedFromUrl.current) return;

    // Wait for async data before attempting initialization
    // This prevents partial initialization when data arrives out of order
    if (isWaitingForInitData) return;

    const whereParam = searchParams.get(FILTER_URL_PARAMS.WHERE) || '';
    const whereDataParam = searchParams.get(FILTER_URL_PARAMS.WHERE_DATA) || '';
    const spaceIdParam = searchParams.get(FILTER_URL_PARAMS.SPACE_ID) || '';
    const resourceTypeParam = searchParams.get(FILTER_URL_PARAMS.RESOURCE_TYPE) || '';
    const typeParam = searchParams.get(VIEW_URL_PARAMS.TYPE) || '';

    // If viewID is present (or type=view), prioritize loading the view
    // Views contain filters, so we handle viewID before filterID
    if (viewIdParam || typeParam === 'view') {
      // Handle API error when fetching saved view
      if (isViewFetchError) {
        console.error('[QueryBuilder] Error fetching saved view:', viewFetchError);
        // Notify user of the error
        onUrlLoadError?.('The saved view in your URL could not be loaded. It may have been deleted or you may not have access.');
        // Clear the invalid view ID from URL and continue without it
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete(VIEW_URL_PARAMS.VIEW_ID);
        newSearchParams.delete(VIEW_URL_PARAMS.TYPE);
        setSearchParams(newSearchParams);
        hasInitializedFromUrl.current = true;
        return;
      }

      // Data should be available now (isWaitingForInitData check above ensures this)
      // but we still guard against edge cases
      if (!savedViewsData) {
        return;
      }

      // Handle "view not found" case - view ID in URL but no matching view
      if (savedViewsData.length === 0) {
        console.warn(`[QueryBuilder] Saved view not found: ${viewIdParam}`);
        // Notify user of the error
        onUrlLoadError?.('The saved view referenced in this URL no longer exists.');
        // Clear the invalid view ID from URL and continue without it
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete(VIEW_URL_PARAMS.VIEW_ID);
        newSearchParams.delete(VIEW_URL_PARAMS.TYPE);
        setSearchParams(newSearchParams);
        hasInitializedFromUrl.current = true;
        return;
      }

      // Found the saved view - apply it
      const extendedView = savedViewsData[0];
      const filter = extendedView.Filter;
      const view = extendedView.View;

      // Set active view reference
      setActiveView(extendedView);

      if (filter) {
        // Construct an ExtendedFilterRead from the view's filter data
        const extendedFilter: ExtendedFilterRead = {
          Filter: filter,
          Space: extendedView.Space,
          Organization: extendedView.Organization,
        };
        setActiveFilter(extendedFilter);

        // Expand saved filter to conditions using shared utility
        const newFilters = expandSavedFilterToConditions(
          filter,
          spaces,
          generateFilterId,
          availableFields
        );
        setFiltersInternal(newFilters);
      }

      // Sync view-specific params (columns, orderBy, groupBy) to URL if not already present
      // This ensures the grid receives the view's configuration even when loading from a
      // URL that only has the viewID (e.g., a shared link with just ?viewID=xxx)
      const columnsParam = searchParams.get(VIEW_URL_PARAMS.COLUMNS);
      const orderByParam = searchParams.get(VIEW_URL_PARAMS.ORDER_BY);
      const groupByParam = searchParams.get(VIEW_URL_PARAMS.GROUP_BY);

      // Sync view-specific params: set from view data when absent, update when stale,
      // and DELETE when the view has no value (prevents previous-view params persisting).
      const needsColumnSync = !columnsParam && view?.Columns && view.Columns.length > 0;
      const needsOrderBySync = !orderByParam && view?.OrderBy;
      // Hydrate the FULL multi-level grouping (annotation, else legacy GroupBy)
      // so the URL sync carries every level on initial load from a bare deep-link.
      const hydratedGroupByLevels = hydrateGroupByFromView(extendedView);
      const hydratedGroupBy = hydratedGroupByLevels.length > 0
        ? hydratedGroupByLevels.join(',')
        : '';
      // Compare both directions: add missing GROUP_BY *and* delete stale GROUP_BY
      // when the view has no GroupBy. Without the delete branch, navigating from a
      // view with GroupBy to one without leaves the stale `viewGroupBy` in the URL.
      const needsGroupBySync = computeNeedsGroupBySync(groupByParam, hydratedGroupBy);

      if (needsColumnSync || needsOrderBySync || needsGroupBySync) {
        setSearchParams((prevParams) => {
          const newParams = new URLSearchParams(prevParams);

          if (needsColumnSync && view?.Columns) {
            const columnNames = normalizeColumnNames(view.Columns.map((col) => col.Name).filter(Boolean) as string[]);
            const delta = calculateColumnDelta(columnNames);
            const encodedDelta = encodeColumnDelta(delta);
            if (encodedDelta) {
              newParams.set(VIEW_URL_PARAMS.COLUMNS, encodedDelta);
            }
          }

          if (needsOrderBySync && view?.OrderBy) {
            newParams.set(VIEW_URL_PARAMS.ORDER_BY, view.OrderBy);
            if (view?.OrderByDirection) {
              newParams.set(VIEW_URL_PARAMS.ORDER_BY_DIRECTION, view.OrderByDirection);
            }
          }

          if (needsGroupBySync) {
            if (hydratedGroupBy) {
              newParams.set(VIEW_URL_PARAMS.GROUP_BY, hydratedGroupBy);
            } else {
              // View has no GroupBy — remove any stale param left by the previous view.
              newParams.delete(VIEW_URL_PARAMS.GROUP_BY);
            }
          }

          return newParams;
        });
      }

      // Auto-pin: if the URL references a view not yet in the open-tabs list,
      // add it so the tab is immediately visible (e.g. following a shared link).
      const viewIdToPin = extendedView.View?.ViewID;
      if (viewIdToPin) {
        setOpenTabIds((prev) => {
          if (prev.includes(viewIdToPin)) return prev;
          const next = [...prev, viewIdToPin];
          try {
            localStorage.setItem(openTabsKey(entityType), JSON.stringify({ version: 1, viewIds: next }));
          } catch { /* ignore */ }
          return next;
        });

        // Restore any unsaved draft for this view (e.g. after a page refresh).
        // rehydrateArrivingDraft is a no-op when no draft exists, so this is
        // safe to call unconditionally.  Calling it here means that after a
        // hard refresh on a view tab that has unsaved edits, those edits are
        // immediately restored — filter conditions, columns, sort, and groupBy.
        rehydrateArrivingDraft(viewIdToPin);
      }

      hasInitializedFromUrl.current = true;
      return;
    }

    // If filterID is present (and not a view), wait for the saved filter to be fetched
    if (filterIdParam) {
      // Handle API error when fetching saved filter
      if (isFilterFetchError) {
        console.error('[QueryBuilder] Error fetching saved filter:', filterFetchError);
        // Notify user of the error
        onUrlLoadError?.('The saved filter in your URL could not be loaded. It may have been deleted or you may not have access.');
        // Clear the invalid filter ID from URL and continue without it
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete(FILTER_URL_PARAMS.FILTER_ID);
        setSearchParams(newSearchParams);
        hasInitializedFromUrl.current = true;
        return;
      }

      // Data should be available now (isWaitingForInitData check above ensures this)
      // but we still guard against edge cases
      if (!savedFiltersData) {
        return;
      }

      // Handle "filter not found" case - filter ID in URL but no matching filter
      if (savedFiltersData.length === 0) {
        console.warn(`[QueryBuilder] Saved filter not found: ${filterIdParam}`);
        // Notify user of the error
        onUrlLoadError?.('The saved filter referenced in this URL no longer exists.');
        // Clear the invalid filter ID from URL and continue without it
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete(FILTER_URL_PARAMS.FILTER_ID);
        setSearchParams(newSearchParams);
        hasInitializedFromUrl.current = true;
        return;
      }

      // Found the saved filter - apply it with the savedFilter block
      const extendedFilter = savedFiltersData[0];
      const filter = extendedFilter.Filter;
      if (filter) {
        // Set active filter reference
        setActiveFilter(extendedFilter);

        // Expand saved filter to conditions using shared utility
        const newFilters = expandSavedFilterToConditions(
          filter,
          spaces,
          generateFilterId,
          availableFields
        );
        setFiltersInternal(newFilters);
        hasInitializedFromUrl.current = true;
        return;
      }
    }

    // No filterID or viewID - just parse the raw URL params
    // Clear any active filter/view since we're now using raw params
    setActiveFilter(null);
    setActiveView(null);

    // Only initialize if there are URL params to parse
    if (!whereParam && !whereDataParam && !spaceIdParam && !resourceTypeParam) {
      setFiltersInternal([]);
      hasInitializedFromUrl.current = true;
      return;
    }

    // Parse URL params into filter conditions
    const parsedFilters = parseWhereClausesToFilters(
      whereParam,
      whereDataParam,
      spaceIdParam,
      spaces,
      generateFilterId,
      availableFields
    );

    // Add resourceType filter if present
    if (resourceTypeParam) {
      parsedFilters.push({
        id: generateFilterId(),
        field: 'resourceType',
        operator: 'equals',
        value: resourceTypeParam,
      });
    }

    if (parsedFilters.length > 0) {
      setFiltersInternal(parsedFilters);
    }

    hasInitializedFromUrl.current = true;
  }, [syncToUrl, searchParams, setSearchParams, spaces, filterIdParam, savedFiltersData, isFilterFetchError, filterFetchError, viewIdParam, savedViewsData, isViewFetchError, viewFetchError, isWaitingForInitData, onUrlLoadError, availableFields]);

  // Build WHERE clauses from filters
  const { where: whereClause, whereData: whereDataClause, resourceType: resourceTypeClause } = useMemo(
    () => buildWhereClauses(filters),
    [filters]
  );

  // Sync filters to URL (when enabled)
  // Uses the centralized URL manager for consistency
  // When preserveViewReference is true, keeps existing viewId/filterId in URL (for filter modifications)
  // When false or undefined, clears them (for new filter/view selections)
  const syncFiltersToUrl = useCallback(
    (newFilters: FilterCondition[], options?: {
      savedFilterId?: string;
      savedSpaceId?: string;
      viewId?: string;
      preserveViewReference?: boolean;
    }) => {
      if (!syncToUrl) return;

      // Mark this as an internal URL change so the external change detection effect
      // doesn't re-initialize from URL (which would undo the user's filter changes)
      isInternalUrlChangeRef.current++;

      const { where, whereData, resourceType } = buildWhereClauses(newFilters);

      // When preserving view reference, read current values from URL
      // This keeps the view/filter ID in the URL when modifying individual filters
      let filterId = options?.savedFilterId;
      let spaceId = options?.savedSpaceId;
      let viewId = options?.viewId;
      // When both IDs are present, 'view' takes precedence over 'filter'.
      let type: 'filter' | 'view' | undefined = viewId ? 'view' : (filterId ? 'filter' : undefined);

      // View-specific display params (columns, sorting, grouping)
      let columns: string | undefined;
      let orderBy: string | undefined;
      let orderByDirection: string | undefined;
      let groupBy: string | undefined;

      if (options?.preserveViewReference) {
        // Preserve existing URL params for view/filter reference and display settings
        const currentFilterId = searchParams.get(FILTER_URL_PARAMS.FILTER_ID) || undefined;
        const currentSpaceId = searchParams.get(FILTER_URL_PARAMS.SPACE_ID) || undefined;
        const currentViewId = searchParams.get(VIEW_URL_PARAMS.VIEW_ID) || undefined;
        const currentType = searchParams.get(VIEW_URL_PARAMS.TYPE) as 'filter' | 'view' | undefined;

        filterId = filterId ?? currentFilterId;
        spaceId = spaceId ?? currentSpaceId;
        viewId = viewId ?? currentViewId;
        type = type ?? currentType;

        // Also preserve view-specific display params
        columns = searchParams.get(VIEW_URL_PARAMS.COLUMNS) || undefined;
        orderBy = searchParams.get(VIEW_URL_PARAMS.ORDER_BY) || undefined;
        orderByDirection = searchParams.get(VIEW_URL_PARAMS.ORDER_BY_DIRECTION) || undefined;
        groupBy = searchParams.get(VIEW_URL_PARAMS.GROUP_BY) || undefined;
      }

      syncFilterStateToUrl({
        where: where || undefined,
        whereData: whereData || undefined,
        resourceType: resourceType || undefined,
        filterId,
        spaceId,
        viewId,
        type,
        columns,
        orderBy,
        orderByDirection,
        groupBy,
      }, setSearchParams);
    },
    [syncToUrl, setSearchParams, searchParams]
  );

  // Set filters (with optional URL sync)
  // Preserves the active view/filter reference in URL - removing individual filters
  // should mark as "modified" but not disassociate from the view entirely
  const setFilters = useCallback(
    (newFilters: FilterCondition[]) => {
      setFiltersInternal(newFilters);
      syncFiltersToUrl(newFilters, { preserveViewReference: true });
    },
    [syncFiltersToUrl]
  );

  // Clear all filters (resets to initialFilters if provided)
  const clearFilters = useCallback(() => {
    setFiltersInternal(initialFilters ?? []);
    setActiveFilter(null);
    setActiveView(null);

    if (syncToUrl) {
      // Mark as internal change to prevent re-initialization
      isInternalUrlChangeRef.current++;
      clearFilterStateFromUrl(setSearchParams);
    }
  }, [syncToUrl, setSearchParams, initialFilters]);

  // Shared helper to apply a filter (used by both saved filter and view selection)
  // This ensures consistent behavior regardless of how a filter is selected
  const applyFilter = useCallback(
    (
      extendedFilter: ExtendedFilterRead,
      options?: {
        viewId?: string;
        setAsActiveView?: ExtendedViewRead;
        // View-specific display params
        columns?: string;
        orderBy?: string;
        orderByDirection?: string;
        groupBy?: string;
      }
    ) => {
      const filter = extendedFilter.Filter;
      if (!filter) return;

      // Set active filter/view references
      // When applying from a view, we still track the filter as activeFilter
      // but also set activeView so the ViewTabs strip can highlight the active tab.
      setActiveFilter(extendedFilter);
      setActiveView(options?.setAsActiveView ?? null);

      // Expand saved filter to conditions using shared utility
      const newFilters = expandSavedFilterToConditions(
        filter,
        spaces,
        generateFilterId,
        availableFields
      );
      setFiltersInternal(newFilters);

      // Sync to URL if enabled using centralized URL manager
      // Note: We intentionally do NOT include spaceId (FromSpaceID) in URL params.
      // FromSpaceID is metadata about where the saved filter was created, not a filter condition.
      // Including it would cause UnitListPage to add an extra SpaceID IN (...) clause.
      if (syncToUrl) {
        // Mark as internal change to prevent re-initialization
        isInternalUrlChangeRef.current++;
        syncFilterStateToUrl({
          where: filter.Where || undefined,
          whereData: filter.WhereData || undefined,
          resourceType: filter.ResourceType || undefined,
          filterId: filter.FilterID || undefined,
          viewId: options?.viewId,
          type: options?.viewId ? 'view' : 'filter',
          // View-specific display params (only set when applying a view)
          columns: options?.columns,
          orderBy: options?.orderBy,
          orderByDirection: options?.orderByDirection,
          groupBy: options?.groupBy,
        }, setSearchParams);
      }
    },
    [spaces, syncToUrl, setSearchParams, availableFields]
  );


  // ─── Draft serialize/rehydrate helpers ────────────────────────────────────
  //
  // ⚠ INVARIANT: every `writeViewDraft` / `deleteViewDraft` call in this hook
  // MUST go through `serializeLeavingDraft` (writes) or the corresponding
  // explicit-delete branches in `handleSave` / `handleRevert` / `handleCloseTab`
  // (deletes).  Each of those sites also updates `draftedTabIds` in the same
  // step.  `modifiedTabIds` is memoised on `draftedTabIds`, so any write that
  // skips the Set update silently keeps a stale dot on screen.  If you add a
  // new call site, pair the localStorage mutation with `setDraftedTabIds` —
  // do not split the two operations across separate effects.
  //
  // Both handleSelectSavedView (plain click / FieldDropdown) and
  // handleRemoveActiveView (sentinel selection) call these so tab-strip click
  // and plain click behave symmetrically with handleOpenTab.
  //
  // The on-leave path is conditional:
  //   * isViewModified === true  → writeViewDraft (preserve pending edits)
  //   * isViewModified === false → deleteViewDraft (drop any stale draft)
  // This keeps localStorage in lockstep with the saved baseline so the
  // comparison-based dot in modifiedTabIds and the active-tab dot from
  // useViewModificationTracking can never disagree about a tab's dirtiness.
  //
  // The mid-transition guard (urlViewId ≠ activeView.ViewID) is respected: in
  // the interleaved render where setSearchParams hasn't caught up with
  // setActiveView yet, isViewModified is masked to false.  Writing or
  // deleting based on that transient state would discard pending edits, so
  // we short-circuit when the guard would fire.  The previous (pre-transition)
  // call already persisted the correct draft for this tab.

  /**
   * Persist or evict the leaving tab's draft based on the current dirty
   * signal.  Idempotent.  Allocates a fresh `draftedTabIds` Set whenever it
   * mutates membership so memoized `modifiedTabIds` consumers re-run.
   */
  const serializeLeavingDraft = useCallback(() => {
    const leavingId = activeView?.View?.ViewID ?? SENTINEL_TAB_ID;

    // Mid-transition guard — see comment block above.  Only applies on a
    // view tab; the sentinel has no ViewID to mismatch against.
    const urlViewId = searchParams.get(VIEW_URL_PARAMS.VIEW_ID) ?? '';
    const activeViewId = activeView?.View?.ViewID ?? '';
    if (activeView && urlViewId !== activeViewId) return;

    if (isViewModified) {
      const { where: w, whereData: wd, resourceType: rt } = buildWhereClauses(filters);
      const columnsDeltaParam = searchParams.get(VIEW_URL_PARAMS.COLUMNS);
      const columns = columnsDeltaParam
        ? getColumnsFromDelta(columnsDeltaParam).map((c) => c.Name ?? '')
        : DEFAULT_UNIT_COLUMNS;
      const draft: ViewDraft = {
        version: 1,
        savedAt: new Date().toISOString(),
        filter: { Where: w, WhereData: wd, ResourceType: rt },
        columns,
        // GroupBy is URL-first: every chip edit writes `?viewGroupBy=` via
        // useGroupByLevels.handleEditLevels, so the URL is always the live truth.
        groupBy: searchParams.get(VIEW_URL_PARAMS.GROUP_BY) ?? '',
        sortOrder: {
          orderBy: searchParams.get(VIEW_URL_PARAMS.ORDER_BY) ?? '',
          orderByDirection: searchParams.get(VIEW_URL_PARAMS.ORDER_BY_DIRECTION) ?? '',
        },
      };
      writeViewDraft(leavingId, draft, entityType);
      setDraftedTabIds((prev) => new Set([...prev, leavingId]));
    } else {
      // Clean — drop any stale draft so the tab is truly clean.  Counter-
      // symmetric to the write above: drafts only exist when there are
      // real unsaved edits.
      deleteViewDraft(leavingId, entityType);
      setDraftedTabIds((prev) => {
        if (!prev.has(leavingId)) return prev;
        const n = new Set(prev);
        n.delete(leavingId);
        return n;
      });
    }
  }, [activeView, filters, searchParams, entityType, isViewModified]);

  // ─── Persist active-tab draft on refresh / unload ─────────────────────────
  //
  // The tab-switch handlers (handleSelectSavedView, handleRemoveActiveView,
  // handleOpenTab) all call `serializeLeavingDraft` on transition, which keeps
  // *non-active* tabs' drafts in localStorage.  But the active tab's draft is
  // never written unless the user switches away — so a plain page refresh,
  // a crash, a force-quit, or OS bfcache eviction would otherwise discard
  // pending edits.
  //
  // This effect closes that gap with two safety nets:
  //   1. A ~400ms debounced auto-save while `isViewModified` is true.  This
  //      catches everything that doesn't fire a normal unload event.
  //   2. A synchronous `pagehide` listener that flushes the draft on the way
  //      out.  `pagehide` is preferred over `beforeunload` because it fires
  //      reliably for bfcache (back/forward cache) entry on desktop and
  //      mobile Safari, where `beforeunload` is unreliable or ignored.
  //
  // `serializeLeavingDraft` already implements the conditional write/delete
  // behaviour (writes when dirty, deletes when clean), so both call sites
  // here can invoke it unconditionally.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    if (isViewModified) {
      debounceTimer = setTimeout(() => {
        serializeLeavingDraft();
      }, 400);
    }

    const handlePageHide = () => {
      serializeLeavingDraft();
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [serializeLeavingDraft, isViewModified]);

  /**
   * Read the draft for `tabId` and apply it on top of the currently-navigated
   * view state.  No-op when no draft exists, so callers can invoke this
   * unconditionally after navigation completes.
   */
  const rehydrateArrivingDraft = useCallback(
    (tabId: string) => {
      const draft = readViewDraft(tabId, entityType);
      // No draft → nothing to restore.  The arriving tab's `?viewGroupBy=` was
      // already written to the URL by `handleSelectSavedView` (via
      // `syncFilterStateToUrl`), and `useGroupByLevels` derives
      // `localGroupByColumns` directly from the URL, so the sidebar already
      // reflects the new tab without any extra preload step.
      if (!draft) return;

      // Restore filter conditions
      const parsedFilters = parseWhereClausesToFilters(
        draft.filter.Where,
        draft.filter.WhereData,
        '',
        spaces,
        generateFilterId,
        availableFields,
      );
      if (draft.filter.ResourceType) {
        parsedFilters.push({
          id: generateFilterId(),
          field: 'resourceType',
          operator: 'equals',
          value: draft.filter.ResourceType,
        });
      }
      setFiltersInternal(parsedFilters);

      // Restore full URL view state — columns, sort, groupBy, and filter conditions.
      //
      // Writing filter conditions to URL (filterWhere/filterWhereData) means a
      // hard refresh on any tab also restores the draft filter text correctly:
      // the URL is the live display state, so whatever is in the URL at refresh
      // time is what the user sees after reload.
      //
      // NOTE: For non-sentinel tabs we also explicitly set viewID / type to
      // guard against React Router's setSearchParams batching behaviour.
      // When multiple setSearchParams functional-update calls happen in the same
      // render batch (e.g. syncFilterStateToUrl followed by this call), each
      // updater receives the SAME `prev` value (the pre-batch URL), so the second
      // call would otherwise overwrite the viewID that the first call set.
      // Re-stating viewID here makes this call self-consistent regardless of order.
      if (syncToUrl) {
        isInternalUrlChangeRef.current++;
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          // For saved-view tabs: always lock in the correct viewID / type so this
          // call is independent of any preceding setSearchParams call in the same batch.
          if (tabId !== SENTINEL_TAB_ID) {
            next.set(VIEW_URL_PARAMS.VIEW_ID, tabId);
            next.set(VIEW_URL_PARAMS.TYPE, 'view');
          }
          // Columns
          if (draft.columns.length > 0) {
            const delta = calculateColumnDelta(draft.columns);
            const encoded = encodeColumnDelta(delta);
            if (encoded) next.set(VIEW_URL_PARAMS.COLUMNS, encoded);
            else next.delete(VIEW_URL_PARAMS.COLUMNS);
          }
          // Sort
          if (draft.sortOrder.orderBy) next.set(VIEW_URL_PARAMS.ORDER_BY, draft.sortOrder.orderBy);
          else next.delete(VIEW_URL_PARAMS.ORDER_BY);
          if (draft.sortOrder.orderByDirection) next.set(VIEW_URL_PARAMS.ORDER_BY_DIRECTION, draft.sortOrder.orderByDirection);
          else next.delete(VIEW_URL_PARAMS.ORDER_BY_DIRECTION);
          // GroupBy
          if (draft.groupBy) next.set(VIEW_URL_PARAMS.GROUP_BY, draft.groupBy);
          else next.delete(VIEW_URL_PARAMS.GROUP_BY);
          // Filter conditions — write to URL so refresh restores the draft
          if (draft.filter.Where) next.set(FILTER_URL_PARAMS.WHERE, draft.filter.Where);
          else next.delete(FILTER_URL_PARAMS.WHERE);
          if (draft.filter.WhereData) next.set(FILTER_URL_PARAMS.WHERE_DATA, draft.filter.WhereData);
          else next.delete(FILTER_URL_PARAMS.WHERE_DATA);
          if (draft.filter.ResourceType) next.set(FILTER_URL_PARAMS.RESOURCE_TYPE, draft.filter.ResourceType);
          else next.delete(FILTER_URL_PARAMS.RESOURCE_TYPE);
          return next;
        });
      }

      // GroupBy was already written to the URL inside the setSearchParams call
      // above (URL-first architecture); `useGroupByLevels` reads it from the URL.
    },
    [entityType, spaces, availableFields, syncToUrl, setSearchParams],
  );

  // Handle saved view selection (from ViewTabs or FieldDropdown).
  //
  // Symmetric with handleOpenTab: serializes the leaving tab's draft, applies
  // the new view, then rehydrates from the arriving tab's draft if one exists.
  // This lets a plain click (FieldDropdown, or any other call site that hits
  // handleSelectSavedView directly) preserve unsaved edits the same way the
  // tab-strip click does.
  const handleSelectSavedView = useCallback(
    (extendedView: ExtendedViewRead) => {
      // ── 1. Serialize leaving tab ──────────────────────────────────────────
      serializeLeavingDraft();

      // ── 2. Navigate to the new view ───────────────────────────────────────
      // Compute committed groupBy once — used for URL write and for draft fallback.
      const committedGroupByLevels = hydrateGroupByFromView(extendedView);
      const committedGroupByParam = committedGroupByLevels.length > 0
        ? committedGroupByLevels.join(',')
        : undefined;

      if (!extendedView.Filter) {
        // View has no filter - clear filter state but preserve view identity in URL
        setFiltersInternal([]);
        setActiveFilter(null);
        setActiveView(extendedView);
        if (syncToUrl) {
          // Mark as internal change to prevent re-initialization
          isInternalUrlChangeRef.current++;
          // Build columns param for this view (same logic as the with-filter path)
          const filterlessView = extendedView.View;
          let filterlessColumnsParam: string | undefined;
          if (filterlessView?.Columns && filterlessView.Columns.length > 0) {
            const columnNames = normalizeColumnNames(filterlessView.Columns.map((col) => col.Name).filter(Boolean) as string[]);
            const delta = calculateColumnDelta(columnNames);
            const encodedDelta = encodeColumnDelta(delta);
            filterlessColumnsParam = encodedDelta || undefined;
          }
          // Use syncFilterStateToUrl so VIEW_ID/TYPE are preserved in the URL.
          // All filter params (Where, WhereData, etc.) are omitted → deleted.
          syncFilterStateToUrl({
            viewId: extendedView.View?.ViewID,
            type: 'view',
            columns: filterlessColumnsParam,
            orderBy: filterlessView?.OrderBy || undefined,
            orderByDirection: filterlessView?.OrderByDirection || undefined,
            groupBy: committedGroupByParam,
          }, setSearchParams);
        }
      } else {
        // Construct an ExtendedFilterRead from the view's filter data
        // This allows us to use the same code path as direct filter selection
        const extendedFilter: ExtendedFilterRead = {
          Filter: extendedView.Filter,
          Space: extendedView.Space,
          Organization: extendedView.Organization,
          // FromSpace would need a separate lookup, but it's not critical for the UI
        };

        // Build view-specific params for URL
        const view = extendedView.View;
        let columnsParam: string | undefined;
        if (view?.Columns && view.Columns.length > 0) {
          const columnNames = normalizeColumnNames(view.Columns.map((col) => col.Name).filter(Boolean) as string[]);
          const delta = calculateColumnDelta(columnNames);
          const encodedDelta = encodeColumnDelta(delta);
          columnsParam = encodedDelta || undefined;
        }

        applyFilter(extendedFilter, {
          viewId: extendedView.View?.ViewID,
          setAsActiveView: extendedView,
          // View-specific display params
          columns: columnsParam,
          orderBy: view?.OrderBy || undefined,
          orderByDirection: view?.OrderByDirection || undefined,
          groupBy: committedGroupByParam,
        });
      }

      // ── 3. Rehydrate arriving tab ─────────────────────────────────────────
      // The arriving tab's `?viewGroupBy=` is already in the URL (written by the
      // syncFilterStateToUrl / applyFilter calls above), so the sidebar updates
      // on every tab switch via the URL → useGroupByLevels reader chain.
      const arrivingId = extendedView.View?.ViewID;
      if (arrivingId) rehydrateArrivingDraft(arrivingId);
    },
    [applyFilter, syncToUrl, setSearchParams, serializeLeavingDraft, rehydrateArrivingDraft],
  );

  // Handle removing active view (sentinel selection or kebab "Remove from view").
  //
  // Symmetric counterpart to handleSelectSavedView for the sentinel tab:
  // serialize the leaving view's draft, clear back to default state, then
  // rehydrate the sentinel's draft if one was previously persisted.
  const handleRemoveActiveView = useCallback(() => {
    serializeLeavingDraft();
    clearFilters(); // clearFilters already calls setActiveView(null) at line 718
    rehydrateArrivingDraft(SENTINEL_TAB_ID);
  }, [clearFilters, serializeLeavingDraft, rehydrateArrivingDraft]);

  // ─── Tab open / close ──────────────────────────────────────────────────────

  /**
   * Pin a view as a tab and activate it.
   *
   * Pure navigation: draft serialization/rehydration is owned by
   * handleSelectSavedView and handleRemoveActiveView, which this delegates to.
   * That keeps tab-strip clicks symmetric with plain-clicks from FieldDropdown
   * or any other caller of handleSelectSavedView.
   */
  const handleOpenTab = useCallback(
    (tabId: string) => {
      if (!openTabIds.includes(tabId)) {
        persistOpenTabIds([...openTabIds, tabId]);
      }
      if (tabId === SENTINEL_TAB_ID) {
        handleRemoveActiveView();
      } else {
        const view = allViewsForEntity.find((v) => v.View?.ViewID === tabId);
        if (view) handleSelectSavedView(view);
      }
    },
    [
      openTabIds,
      persistOpenTabIds,
      allViewsForEntity,
      handleRemoveActiveView,
      handleSelectSavedView,
    ],
  );

  /**
   * Unpin a tab.  When the closed tab was active, activates an adjacent tab
   * (prefer left, then right) or falls back to the sentinel / empty state.
   * Also discards any persisted draft for the closed tab so localStorage stays clean.
   */
  const handleCloseTab = useCallback(
    (tabId: string) => {
      const idx = openTabIds.indexOf(tabId);
      const next = openTabIds.filter((id) => id !== tabId);
      persistOpenTabIds(next);

      // Only change the active content when we're closing the currently active tab
      const isClosingActive =
        tabId === SENTINEL_TAB_ID
          ? activeView === null           // sentinel is active when no view is selected
          : activeView?.View?.ViewID === tabId;

      if (isClosingActive) {
        // Prefer the tab to the left; fall back to the tab that slides into this
        // position (was to the right); fall back to sentinel / empty state.
        const fallback = next[idx - 1] ?? next[idx] ?? null;

        if (fallback === null || fallback === SENTINEL_TAB_ID) {
          handleRemoveActiveView();
        } else {
          const view = allViewsForEntity.find((v) => v.View?.ViewID === fallback);
          if (view) {
            handleSelectSavedView(view);
          } else {
            handleRemoveActiveView();
          }
        }
      }

      // Discard the draft for this tab AFTER navigation.  Navigation calls
      // handleSelectSavedView / handleRemoveActiveView, which serialize the
      // *leaving* tab's draft as part of the symmetric tab-switch flow.
      // Deleting first would let that serialize step revive the very draft we
      // intended to discard.  Sentinel never carries a draft, so it's skipped.
      if (tabId !== SENTINEL_TAB_ID) {
        deleteViewDraft(tabId, entityType);
        setDraftedTabIds((prev) => {
          if (!prev.has(tabId)) return prev;
          const n = new Set(prev);
          n.delete(tabId);
          return n;
        });
      }
    },
    [openTabIds, persistOpenTabIds, activeView, allViewsForEntity, handleSelectSavedView, handleRemoveActiveView, entityType],
  );

  /** Persist a drag-reordered tab sequence. The full new openTabIds array is
   *  received from ViewTabs (sentinel already repositioned at index 0 if open). */
  const handleReorderTabs = useCallback(
    (newTabIds: string[]) => {
      persistOpenTabIds(newTabIds);
    },
    [persistOpenTabIds],
  );

  // Immediately apply a PATCH response to the active view without waiting for refetch.
  const refreshActiveView = useCallback((updated: ViewRead) => {
    setActiveView((prev) => (prev ? { ...prev, View: updated } : null));
  }, []);

  // ─── Unified Save handler ─────────────────────────────────────────────────

  /**
   * Save the current view state. When on the sentinel tab, opens the "Create
   * new view" popover instead. No-op when nothing is dirty.
   */
  const handleSave = useCallback(async () => {
    // Sentinel tab → open "Create new view" popover
    if (!activeView) {
      openNewViewRef.current?.();
      return;
    }
    if (!isViewModified || isSavingView) return;

    const viewId = activeView.View?.ViewID ?? '';
    // Prefer the expanded Space object when present (fully-loaded view); fall
    // back to View.SpaceID which is always present on the ViewRead scalar.
    // ExtendedViewRead.Space is absent when the API response did not expand it
    // (e.g. right after creating a new view the initialisation path uses
    // include:'FilterID' only, leaving Space undefined).
    const spaceId = activeView.Space?.SpaceID ?? activeView.View?.SpaceID ?? '';
    const view = activeView.View;

    // Build the calls list, tracking which promise belongs to which domain so
    // we don't rely on fragile index arithmetic after Promise.all resolves.
    let filterCallPromise: Promise<FilterRead> | null = null;
    let viewCallPromise: Promise<ViewRead> | null = null;

    if (dirtyFields.filter) {
      if (!activeFilter?.Filter?.FilterID) {
        console.error('Invariant: saved view has no filter — cannot save filter changes');
        onSaveError?.('Internal error: view has no filter.');
        return;
      }
      const { where, whereData, resourceType } = buildWhereClauses(filters);
      // Same fallback chain for the filter PATCH: expanded Space first, then the
      // scalar SpaceID on the FilterRead, then the view's spaceId.
      const filterSpaceId = activeFilter.Space?.SpaceID ?? activeFilter.Filter?.SpaceID ?? spaceId;
      filterCallPromise = patchFilter({
        filterId: activeFilter.Filter.FilterID,
        spaceId: filterSpaceId,
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify({
          Version: activeFilter.Filter.Version,
          // Use null (not undefined) so PATCH explicitly clears the field when empty.
          // JSON.stringify omits undefined, leaving the backend field unchanged.
          Where: where || null,
          WhereData: whereData || null,
          ResourceType: resourceType || null,
        }),
      }).unwrap() as Promise<FilterRead>;
    }

    if (dirtyFields.viewFields && view?.ViewID) {
      // Build columns from URL params.  GroupBy is now sidebar-only (GroupNavPanel) —
      // we no longer inject GroupBy levels into the Columns list.
      const columnsDeltaParam = searchParams.get(VIEW_URL_PARAMS.COLUMNS);
      const finalColumns = buildSaveColumns(columnsDeltaParam);
      // Grouping is persisted only via the annotation.  We do NOT write
      // View.GroupBy because the backend validates it against the view's
      // Columns set, which rejects dotted dynamic columns like
      // `Labels.AppOwner`.  Legacy single-level views written before this
      // change still resolve correctly via the GroupBy fallback in
      // hydrateGroupByFromView.
      //
      // Read groupBy from the URL (the live source of truth) so the saved
      // annotation reflects the user's current chips even when the bridge
      // ref pattern is no longer in play.
      const groupByParam = searchParams.get(VIEW_URL_PARAMS.GROUP_BY) ?? '';
      const groupByLevels = groupByParam
        ? groupByParam.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const annotationValue = buildGroupByAnnotationValue(groupByLevels);
      const mergedAnnotations = mergeGroupByAnnotation(
        view.Annotations,
        annotationValue,
      );

      const orderBy = searchParams.get(VIEW_URL_PARAMS.ORDER_BY) ?? undefined;
      const orderByDirection = (searchParams.get(VIEW_URL_PARAMS.ORDER_BY_DIRECTION) as 'ASC' | 'DESC') ?? undefined;

      viewCallPromise = patchViewMutation({
        spaceId,
        viewId: view.ViewID,
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify({
          Version: view.Version,
          Annotations: mergedAnnotations,
          Columns: finalColumns,
          OrderBy: orderBy,
          OrderByDirection: orderByDirection,
        }),
      }).unwrap() as Promise<ViewRead>;
    }

    if (!filterCallPromise && !viewCallPromise) return;

    setIsSavingView(true);
    try {
      const [updatedFilter, updatedView] = await Promise.all([
        filterCallPromise ?? Promise.resolve(null),
        viewCallPromise  ?? Promise.resolve(null),
      ]);
      // Apply patchFilter result to activeFilter state (skip refetch latency)
      if (updatedFilter) {
        setActiveFilter((prev) => (prev ? { ...prev, Filter: updatedFilter } : null));
      }
      // Apply patchView result to activeView state
      if (updatedView) {
        setActiveView((prev) => (prev ? { ...prev, View: updatedView } : null));
      }
      deleteViewDraft(viewId, entityType);
      setDraftedTabIds((prev) => {
        const n = new Set(prev);
        n.delete(viewId);
        return n;
      });
    } catch {
      onSaveError?.('Failed to save view. Changes preserved — try again.');
    } finally {
      setIsSavingView(false);
    }
  }, [
    activeView,
    activeFilter,
    isViewModified,
    isSavingView,
    dirtyFields,
    filters,
    searchParams,
    patchFilter,
    patchViewMutation,
    onSaveError,
  ]);

  // ─── Unified Revert handler ───────────────────────────────────────────────

  /**
   * Revert the current view to its saved baseline.
   * Sentinel tab: clears URL state and resets filters.
   * View tab: restores filter conditions + URL view params + groupBy.
   */
  const handleRevert = useCallback(() => {
    if (!activeView) {
      // Sentinel: clear URL back to empty
      if (syncToUrl) {
        isInternalUrlChangeRef.current++;
        clearFilterStateFromUrl(setSearchParams);
      }
      setFiltersInternal([]);
      return;
    }

    const viewId = activeView.View?.ViewID ?? '';

    // Restore filter conditions from activeFilter
    if (activeFilter?.Filter) {
      const originalConditions = expandSavedFilterToConditions(
        activeFilter.Filter,
        spaces,
        generateFilterId,
        availableFields,
      );
      setFiltersInternal(originalConditions);
      if (syncToUrl) {
        isInternalUrlChangeRef.current++;
        syncFiltersToUrl(originalConditions, { preserveViewReference: true });
      }
    }

    // Restore URL view params (columns, sort, groupBy) from the saved view.
    // groupBy must be restored here so that buildLiveSnapshot (which reads from URL)
    // sees the committed value immediately after revert, without an extra render.
    if (syncToUrl) {
      const committedGroupByLevels = hydrateGroupByFromView(activeView);
      const committedGroupByParam = committedGroupByLevels.length > 0
        ? committedGroupByLevels.join(',')
        : undefined;

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const view = activeView.View;

        // Restore column order
        if (view?.Columns && view.Columns.length > 0) {
          const columnNames = normalizeColumnNames(view.Columns.map((col) => col.Name).filter(Boolean) as string[]);
          const delta = calculateColumnDelta(columnNames);
          const encoded = encodeColumnDelta(delta);
          if (encoded) next.set(VIEW_URL_PARAMS.COLUMNS, encoded);
          else next.delete(VIEW_URL_PARAMS.COLUMNS);
        } else {
          next.delete(VIEW_URL_PARAMS.COLUMNS);
        }

        // Restore sort
        if (view?.OrderBy) next.set(VIEW_URL_PARAMS.ORDER_BY, view.OrderBy);
        else next.delete(VIEW_URL_PARAMS.ORDER_BY);

        if (view?.OrderByDirection) next.set(VIEW_URL_PARAMS.ORDER_BY_DIRECTION, view.OrderByDirection);
        else next.delete(VIEW_URL_PARAMS.ORDER_BY_DIRECTION);

        // Restore groupBy to committed value so dirty detection is accurate immediately.
        if (committedGroupByParam) next.set(VIEW_URL_PARAMS.GROUP_BY, committedGroupByParam);
        else next.delete(VIEW_URL_PARAMS.GROUP_BY);

        return next;
      });
    }

    // GroupBy was reset to committed via the setSearchParams call above
    // (URL-first architecture); `useGroupByLevels` derives `localGroupByColumns`
    // directly from the URL, so the sidebar updates automatically.

    // Clear the draft
    deleteViewDraft(viewId, entityType);
    setDraftedTabIds((prev) => {
      const n = new Set(prev);
      n.delete(viewId);
      return n;
    });
  }, [
    activeView,
    activeFilter,
    syncToUrl,
    setSearchParams,
    spaces,
    availableFields,
    syncFiltersToUrl,
  ]);

  // ─── Cmd/Ctrl+S keyboard shortcut ────────────────────────────────────────

  /**
   * Global Cmd/Ctrl+S handler — triggers Save only when on a saved view tab
   * (sentinel excluded). Guarded behind showViewSelector to prevent firing in
   * contexts that don't render the view strip.
   */
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (!showViewSelector) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!shouldTriggerCmdS(e, activeView)) return;
      e.preventDefault();
      void handleSaveRef.current();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showViewSelector, activeView]);

  // ─── Per-tab dot derivation ───────────────────────────────────────────────
  //
  // Replaces the prior `draftedTabIds`-as-source-of-truth rule.  A non-active
  // tab's dot reflects whether its persisted draft actually differs from
  // the saved view baseline, computed via the same comparison primitives
  // useViewModificationTracking uses for the active tab.
  //
  // After the conditional write/delete refactor of serializeLeavingDraft,
  // drafts only exist when there are real unsaved edits, so in the steady
  // state this set tracks `draftedTabIds` exactly.  The comparison still
  // runs because it is also the GC predicate used by the mount-time pass
  // below, and it is defence-in-depth against any future code path that
  // writes a clean draft.
  //
  // We iterate `draftedTabIds` (not openTabIds) because tabs without a draft
  // are trivially un-modified — no localStorage read needed.  Whenever a
  // draft is written or deleted, `draftedTabIds` is reset to a new Set
  // instance (see serializeLeavingDraft / handleSave / handleRevert /
  // handleCloseTab), which invalidates this memo even when the membership
  // stays the same but the draft *content* changed.
  const modifiedTabIds = useMemo(() => {
    const result = new Set<string>();
    for (const id of draftedTabIds) {
      const draft = readViewDraft(id, entityType);
      if (!draft) continue;
      // Sentinel uses the implicit null baseline; saved views use their entry
      // from allViewsForEntity.  A draft that references a view that has since
      // been deleted is treated as un-modified (the tab itself is filtered
      // out of openTabIds by the cleanup effect, so it won't render anyway).
      const view = id === SENTINEL_TAB_ID
        ? null
        : allViewsForEntity.find((v) => v.View?.ViewID === id) ?? null;
      if (id !== SENTINEL_TAB_ID && !view) continue;
      if (compareDraftToView(draft, view, DEFAULT_UNIT_COLUMNS)) result.add(id);
    }
    return result;
  }, [draftedTabIds, allViewsForEntity, entityType]);

  // ─── One-shot draft GC at mount ───────────────────────────────────────────
  //
  // `scanDraftedTabIds` seeds `draftedTabIds` from any `viewDraft:<id>` keys
  // that survived from a prior session.  Some of those are stale — e.g.
  // pre-fix sessions wrote drafts unconditionally on every tab-leave, so a
  // user who never edited a view can still come back to clean drafts in
  // localStorage.  We delete any drafted-but-not-modified entries the first
  // time the view list is available, so the tab strip and localStorage agree.
  //
  // Runs at most once per mount, gated by `hasRunDraftGC.current`.  Waits
  // until the view list has loaded so we never delete a draft we couldn't
  // compare against (no view = no baseline).
  const hasRunDraftGC = useRef(false);
  useEffect(() => {
    if (hasRunDraftGC.current) return;
    if (!syncToUrl) return;
    // Wait for the views list to settle.  When there are no drafts at all
    // there's nothing to GC, but we still mark the pass done so we don't
    // re-check on every allViewsData change.
    if (allViewsData.length === 0 && draftedTabIds.size === 0) {
      hasRunDraftGC.current = true;
      return;
    }
    if (draftedTabIds.size > 0 && allViewsData.length === 0) {
      // Views still loading; wait for the next tick.
      return;
    }
    hasRunDraftGC.current = true;

    const stale: string[] = [];
    for (const id of draftedTabIds) {
      const draft = readViewDraft(id, entityType);
      if (!draft) {
        // Set claimed this id had a draft but localStorage disagrees —
        // remove from the set so future scans are accurate.
        stale.push(id);
        continue;
      }
      const view = id === SENTINEL_TAB_ID
        ? null
        : allViewsForEntity.find((v) => v.View?.ViewID === id) ?? null;
      // View deleted server-side?  Drop the orphan draft.
      if (id !== SENTINEL_TAB_ID && !view) {
        deleteViewDraft(id, entityType);
        stale.push(id);
        continue;
      }
      if (!compareDraftToView(draft, view, DEFAULT_UNIT_COLUMNS)) {
        // Draft matches baseline — clean cruft from a prior session.
        deleteViewDraft(id, entityType);
        stale.push(id);
      }
    }
    if (stale.length > 0) {
      setDraftedTabIds((prev) => {
        const n = new Set(prev);
        for (const id of stale) n.delete(id);
        return n;
      });
    }
  }, [allViewsData, allViewsForEntity, draftedTabIds, entityType, syncToUrl]);

  // Mint a Filter from the current in-memory filter conditions so a brand-new
  // view can own its own filter even when the user has nothing selected yet.
  // Returns null when creation fails; ViewTabs surfaces that as an error.
  const createFilterForView = useCallback(
    async (displayName: string, targetSpaceId: string): Promise<FilterRead | null> => {
      if (!targetSpaceId) return null;
      const { where, whereData, resourceType } = buildWhereClauses(filters);
      try {
        const result = await createFilter({
          spaceId: targetSpaceId,
          filter: {
            From: entityType,
            Slug: slugify(displayName),
            DisplayName: displayName,
            Where: where || undefined,
            WhereData: whereData || undefined,
            ResourceType: resourceType || undefined,
          },
        }).unwrap();
        return result;
      } catch {
        return null;
      }
    },
    [filters, entityType, createFilter],
  );

  // Build the Views-as-tabs strip. Returned as a render-prop so callers can
  // supply page-owned save / new-view handlers without us depending on page modals.
  const renderViewTabs = useCallback(
    (renderOptions?: ViewTabsRenderOptions) => {
      if (!showViewSelector) return null;

      // Wrap onViewCreated so newly created views are automatically pinned as
      // tabs and immediately activated via handleSelectSavedView.
      //
      // This replaces the old "set viewSaved=true in URL → re-init" flow with
      // the same direct tab-switch path used by normal tab clicks.  The URL is
      // written atomically by handleSelectSavedView (via syncFilterStateToUrl)
      // rather than by three stale updateSearchParam calls in UnitListPage.
      const wrappedOnViewCreated = (view: ExtendedViewRead) => {
        const newId = view.View?.ViewID;
        if (newId) {
          setOpenTabIds((prev) => {
            if (prev.includes(newId)) return prev;
            const next = [...prev, newId];
            try {
              localStorage.setItem(openTabsKey(entityType), JSON.stringify({ version: 1, viewIds: next }));
            } catch { /* ignore */ }
            return next;
          });
          // Auto-switch to the new tab immediately.
          handleSelectSavedView(view);
        }
        renderOptions?.onViewCreated?.(view);
      };

      return (
        <ViewTabs
          activeView={activeView ?? null}
          isModified={isViewModified}
          modifiedTabIds={modifiedTabIds}
          onSelectView={handleSelectSavedView}
          onClearView={handleRemoveActiveView}
          entityType={entityType}
          disabled={disabled}
          spaceId={renderOptions?.spaceId}
          filterId={renderOptions?.filterId}
          localGroupByColumns={renderOptions?.localGroupByColumns}
          onViewCreated={wrappedOnViewCreated}
          openTabIds={openTabIds}
          allViews={allViewsForEntity}
          onOpenTab={handleOpenTab}
          onCloseTab={handleCloseTab}
          onReorderTabs={handleReorderTabs}
          onRegisterOpenNewView={handleRegisterOpenNewView}
          onSave={activeView ? handleSave : undefined}
          onRevert={activeView ? handleRevert : undefined}
          onCreateFilterForNewView={createFilterForView}
        />
      );
    },
    [
      showViewSelector,
      activeView,
      isViewModified,
      modifiedTabIds,
      handleSelectSavedView,
      handleRemoveActiveView,
      entityType,
      disabled,
      openTabIds,
      allViewsForEntity,
      handleOpenTab,
      handleCloseTab,
      handleReorderTabs,
      handleRegisterOpenNewView,
      handleSave,
      handleRevert,
      createFilterForView,
    ],
  );

  // Create the QueryBuilder element (filter button + rows only, no view selector)
  // Note: Module-level constants are used for default arrays/objects to ensure stable references.
  // Callers passing explicit arrays should still memoize them with useMemo.
  const QueryBuilderElement = useMemo(
    () => (
      <QueryBuilderComponent
        filters={filters}
        onFiltersChange={setFilters}
        lockedFilters={lockedFilters}
        entityType={entityType}
        spaces={spaces}
        targets={targets}
        toolchainTypes={toolchainTypes}
        bridgeWorkers={bridgeWorkers}
        slugs={slugs}
        resourceTypes={resourceTypes}
        labelOptions={labelOptions}
        disabled={disabled}
      />
    ),
    [
      filters,
      setFilters,
      lockedFilters,
      entityType,
      spaces,
      targets,
      toolchainTypes,
      bridgeWorkers,
      slugs,
      resourceTypes,
      labelOptions,
      disabled,
    ]
  );

  return {
    QueryBuilderElement,
    renderViewTabs,
    whereClause,
    whereDataClause,
    resourceTypeClause,
    filters,
    setFilters,
    clearFilters,
    activeFilter,
    activeView,
    refreshActiveView,
    isViewModified,
    allViewsForEntity,
    openTabIds,
  };
};
