// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { CreateChangeSetAccordion } from '@/components/create-changeset-accordion/CreateChangeSetAccordion';
import { ErrorList } from '@/components/error-list/ErrorList';
import {
  ALL_GROUPS,
  GroupNavPanel,
  PaneResizeHandle,
  getCellValue,
} from '@/components/group-nav';
import { useLabelKeys } from '@/components/group-nav/hooks/useLabelKeys';
import { LinkWorkflow } from '@/components/link-workflow/LinkWorkflow';
import {
  applyClientSideFilters,
  DEFAULT_TOOLCHAIN_TYPES,
  extractLabelOptions,
  extractSlugs,
  useQueryBuilder,
} from '@/components/query-builder';
import { SettingsTabs } from '@/components/settings-tabs/SettingsTabs';
import { Main, Section as SectionSlider } from '@/components/styled';
import { UnitDataGrid } from '@/components/unit-data-grid/UnitDataGrid';
import { createUnitListRow } from '@/components/unit-data-grid/utils/data-grid-helpers';
import {
  EdgeType,
  NodeDisplayType,
  UnitTreeControls,
  UnitTreeView,
} from '@/components/unit-tree-view';
import { useAdvancedSearchQueryParams } from '@/hooks/useAdvancedSearchQueryParams';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useAppDispatch } from '@/hooks/useApp';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { usePolling } from '@/hooks/usePolling';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import { AddTargetDrawer } from '@/pages/target-list/components/add-target-drawer/AddTargetDrawer';
import {
  ChangeSet,
  type ChangeSetRead,
  type ExtendedViewRead,
  ExtendedUnitRead,
  FunctionInvocationsResponse,
  FunctionSignature,
  type Invocation,
  type SpaceRead,
  type TargetRead,

  type UnitRead,
  confighubApi,
  useBulkDeleteUnitsMutation,
  useLazyGetTargetQuery,
  useLazyListAllUnitsQuery,
  useListAllTargetsQuery,
  useListAllUnitsQuery,
  useInvokeFunctionsOnOrgMutation,
  useListFunctionsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import { setFunctionInvocationResponse } from '@/state/slices/functionInvocation';
import { setSelectedUnits as setGlobalSelectedUnits } from '@/state/slices/selectedUnits';
import { Direction } from '@/types/enums';
import {
  BaseColumnKeys,
  buildIncludeParameter,
  buildSelectParameter,
  calculateColumnDelta,
  encodeColumnDelta,
  getColumnsFromDelta,
  normalizeColumnNames,
} from '@/utility/column-delta-functions';
import { hydrateGroupByFromView } from '@/components/query-builder/groupBy-annotation';
import { FILTER_URL_PARAMS, VIEW_URL_PARAMS } from '@/utility/constants/url-params';
import { Resource, convertToResourceList } from '@/utility/schema-functions';
import { cleanString } from '@/utility/string-functions';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ViewListIcon from '@mui/icons-material/ViewList';
import { styled, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import Box from '@mui/material/Box';
import isEmpty from 'lodash/isEmpty';

import { FunctionInvocationDrawer } from './components/function-invocation-drawer/FunctionInvocationDrawer';
import { GettingStarted } from './components/getting-started/GettingStarted';
import { UnitModalComposer } from './components/modals/unit-modal-composer/UnitModalComposer';
import { UnitListHeader } from './components/unit-list-header/UnitListHeader';
import { WorkBenchFloatingActions } from './components/work-bench-floating-actions/WorkBenchFloatingActions';
import { useChangeSetWorkflow } from './hooks/useChangeSetWorkflow';
import { useGroupByLevels } from './hooks/useGroupByLevels';
import { useModalState } from './hooks/useModalState';
import { CloseChangeSetModal } from './modals/CloseChangeSetModal';
import { RestoreChangesModal } from './modals/RestoreChangesModal';
import type { ModalType } from './rules';
import { ChangeSetTab } from './tabs/changeset-tab/ChangeSetTab';
import { RevisionsTab } from './tabs/revisions-tab/RevisionsTab';
import { UnitDataGridTab } from './tabs/unit-data-grid-tab';

// Constants
const BULK_ACTIONS = {
  CHANGE_SET: 'Change_Set',
  LINK: 'Link',
  ADD: 'Add',
  BULK_EDIT: 'Bulk_Edit',
  BULK_RESTORE: 'Bulk_Restore',
  UPGRADE: 'Upgrade',
  CLONE: 'Clone',
} as const;

const EMPTY_FUNCTION = {} as FunctionSignature;
const RESOURCE_TYPES_CACHE_KEY = 'confighub:resourceTypes';
/** Stable empty array used as RTK Query default to avoid fresh-ref per render. */
const EMPTY_UNITS: ExtendedUnitRead[] = [];


const Container = styled('div')`
  width: 100%;
`;

const Section = styled('section')`
  width: 100%;
`;

export const UnitListPage = () => {
  // ============================================================================
  // HOOKS & SETUP
  // ============================================================================
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { clearSearchParams, searchParams, setSearchParams } = useAdvancedSearchQueryParams();

  // Custom hooks
  const { modalState, updateModalState } = useModalState();

  // Lazy query hooks
  const [getTargetById] = useLazyGetTargetQuery();

  // Refs to access refetch functions from nested components
  const refetchViewsRef = useRef<(() => void) | null>(null);
  const refetchFiltersRef = useRef<(() => void) | null>(null);

  // ============================================================================
  // STATE - UNIT SELECTION & DISPLAY
  // ============================================================================
  const [defaultRowSelection, setDefaultRowSelection] = useState(0);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedLinkUnits, setSelectedLinkUnits] = useState<string[]>([]);

  // ============================================================================
  // STATE - MODALS & DRAWERS
  // ============================================================================
  const [modalType, setModalType] = useState<ModalType>('' as ModalType);
  // Auto-open advanced filters if URL contains filter params
  const hasUrlFilters = () => {
    return !!(
      searchParams.get(FILTER_URL_PARAMS.FILTER_ID) ||
      searchParams.get(FILTER_URL_PARAMS.SPACE_ID) ||
      searchParams.get(FILTER_URL_PARAMS.RESOURCE_TYPE) ||
      searchParams.get(FILTER_URL_PARAMS.WHERE_DATA) ||
      searchParams.get(FILTER_URL_PARAMS.WHERE)
    );
  };
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(hasUrlFilters);
  const [isTargetDrawerOpen, setIsTargetDrawerOpen] = useState(false);
  const [existingTarget, setExistingTarget] = useState<TargetRead | null>(null);
  const [isCloseChangeSetModalOpen, setIsCloseChangeSetModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);

  // ============================================================================
  // STATE - BULK ACTIONS & PROGRESS
  // ============================================================================

  // ============================================================================
  // STATE - FUNCTION INVOCATIONS
  // ============================================================================
  const selectedFunction = EMPTY_FUNCTION;
  const preInvocationUnits: ExtendedUnitRead[] = [];
  const [functionInvocationResults, setFunctionInvocationResults] = useState<
    FunctionInvocationsResponse[]
  >([]);
  const [functionInvocationError, setFunctionInvocationError] = useState<string>('');
  const [isFunctionResultsDrawerOpen, setIsFunctionResultsDrawerOpen] = useState(false);
  const [isFunctionResultsMinimized, setIsFunctionResultsMinimized] = useState(false);
  const [invocationToEdit, setInvocationToEdit] = useState<Invocation | undefined>(undefined);

  // ============================================================================
  // STATE - GROUPING & CLONING
  // ============================================================================
  const [completeUnitsForGrouping, setCompleteUnitsForGrouping] = useState<ExtendedUnitRead[]>(
    [],
  );
  const [completeUnitsForCloning, setCompleteUnitsForCloning] = useState<ExtendedUnitRead[]>(
    [],
  );

  // ============================================================================
  // STATE - ERROR MESSAGES
  // ============================================================================
  const [errorMessage, setErrorMessage] = useState<Array<string>>([]);

  // ============================================================================
  // STATE - TREE VIEW
  // ============================================================================
  const [isTreeViewMode, setIsTreeViewMode] = useState(false);
  const [treeEdgeType, setTreeEdgeType] = useState<EdgeType>('clone');
  const [treeNodeType, setTreeNodeType] = useState<NodeDisplayType>('unit');

  // ============================================================================
  // STATE - LINK WORKFLOW
  // ============================================================================
  const [isLinkWorkflowMode, setIsLinkWorkflowMode] = useState(false);
  const [linkWorkflowSourceUnits, setLinkWorkflowSourceUnits] = useState<ExtendedUnitRead[]>(
    [],
  );

  // ============================================================================
  // URL PARAMS
  // ============================================================================
  // Extract filters from URL params
  // Note: filterSpaceID is intentionally NOT used here - it's metadata about the saved filter's
  // origin space, not a filter condition. The actual space filter is included in 'where'.
  const where = searchParams.get(FILTER_URL_PARAMS.WHERE) || '';
  const whereData = searchParams.get(FILTER_URL_PARAMS.WHERE_DATA) || '';
  const resourceType = searchParams.get(FILTER_URL_PARAMS.RESOURCE_TYPE) || '';

  // Get visible columns from URL params and build select/include parameters dynamically
  const columnsParam = getColumnsFromDelta(searchParams?.get(VIEW_URL_PARAMS.COLUMNS) || '');
  const visibleColumnNames = useMemo(
    () => columnsParam.map((col) => col.Name) as BaseColumnKeys[],
    [columnsParam],
  );

  // GroupBy levels for the units query.  Read directly from `?viewGroupBy=` so
  // `selectParam`/`includeParam` can be `useMemo`s (single render).  The
  // earlier two-phase pattern (useState + render-time setState below) caused
  // every tab switch to render once with stale params before a setState
  // bumped them — that intermediate render subscribed the active query to a
  // (new-where, old-select/include) cache key that did NOT match the
  // prefetched key, costing a wasted network round-trip on every tab click.
  //
  // Falls back to ['Space'] when the URL is empty (e.g. cold load before the
  // init effect populates `?viewGroupBy`); the URL is overwritten with the
  // active view's committed groupBy on every tab switch (via
  // `syncFilterStateToUrl`), so post-switch the value is always view-correct.
  // The cache-key match with the prefetch path holds because the prefetch
  // also derives groupBy from `hydrateGroupByFromView`, which is the same
  // committed value the URL gets populated with.
  const groupByLevelsForQuery = useMemo<string[]>(() => {
    const csv = searchParams.get(VIEW_URL_PARAMS.GROUP_BY);
    if (csv) {
      const parts = csv.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) return parts;
    }
    return ['Space'];
  }, [searchParams]);

  const selectParam = useMemo(
    () => buildSelectParameter(visibleColumnNames, groupByLevelsForQuery),
    [visibleColumnNames, groupByLevelsForQuery],
  );
  const includeParam = useMemo(
    () => buildIncludeParameter(visibleColumnNames, groupByLevelsForQuery),
    [visibleColumnNames, groupByLevelsForQuery],
  );

  // Spaces query
  const { spaces = [], refetch: refetchSpaces } = useListSpacesQuery(
    {},
    {
      selectFromResult: (result) => ({
        spaces: result?.data?.map((space) => space.Space).filter(Boolean),
      }),
    },
  );

  // Transform spaces for QueryBuilder
  const queryBuilderSpaces = useMemo(
    () =>
      spaces.map((s) => ({
        id: s?.SpaceID || '',
        name: s?.DisplayName || s?.Slug || '',
        labels: s?.Labels,
      })),
    [spaces],
  );

  // API queries and mutations
  const {
    data: units = EMPTY_UNITS,
    error: unitsError,
    isSuccess: isUnitsSuccess,
    isLoading,
    refetch: refetchUnits,
  } = useListAllUnitsQuery({
    where,
    whereData,
    resourceType,
    // Include and select are dynamically computed based on visible columns
    include: includeParam,
    // This deliberately does not include Data or MutationSources. If you need them, refetch.
    select: selectParam,
  });

  // Functions query
  const { refetch: refetchFunctions } = useListFunctionsQuery(
    {
      spaceId: units[0]?.Space?.SpaceID || '',
    },
    { skip: !units[0]?.Space?.SpaceID },
  );

  // Invocations query
  // Targets query for QueryBuilder
  const { data: targetsData } = useListAllTargetsQuery({});

  // Transform targets for QueryBuilder
  const queryBuilderTargets = useMemo(
    () =>
      targetsData?.map((t) => ({
        id: t.Target?.TargetID || '',
        name: t.Target?.DisplayName || t.Target?.Slug || '',
      })) || [],
    [targetsData],
  );

  // Extract label options from units for the QueryBuilder Labels filter dropdown
  const labelOptions = useMemo(() => {
    const unitEntities = units.map((u) => u.Unit);
    return extractLabelOptions(unitEntities);
  }, [units]);

  // Fetch all unit slugs independently (unfiltered) for the Slug autocomplete
  const { data: allUnitsForSlugs = [] } = useListAllUnitsQuery({
    select: 'Slug,Space.DisplayName,Space.Slug',
    include: 'SpaceID',
  });

  const slugOptions = useMemo(
    () => extractSlugs(
      allUnitsForSlugs.map((u) => u.Unit),
      (unit) => {
        const match = allUnitsForSlugs.find((u) => u.Unit === unit);
        return match?.Space?.DisplayName || match?.Space?.Slug || '';
      },
    ),
    [allUnitsForSlugs],
  );

  // Fetch resource types by invoking get-resources with body=none across all units
  // Cached in sessionStorage to avoid re-fetching on every page navigation
  const [invokeGetResources] = useInvokeFunctionsOnOrgMutation();
  const [resourceTypes, setResourceTypes] = useState<string[]>(() => {
    try {
      const cached = sessionStorage.getItem(RESOURCE_TYPES_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    // Skip fetch if we already have cached data
    if (resourceTypes.length > 0) return;

    const fetchResourceTypes = async () => {
      const result = await invokeGetResources({
        functionInvocationsRequest: {
          FunctionInvocations: [
            {
              FunctionName: 'get-resources',
              Arguments: [{ ParameterName: 'body', Value: 'none' }],
            },
          ],
        },
      });

      if (result.error) {
        console.error('[UnitListPage] Failed to fetch resource types:', result.error);
        return;
      }

      if (result.data) {
        const allTypes = new Set<string>();
        for (const response of result.data) {
          const resourceList = convertToResourceList(
            cleanString(response?.Outputs?.['ResourceList'] || ''),
          ) as Resource[];
          for (const resource of resourceList) {
            if (resource.ResourceType) {
              allTypes.add(resource.ResourceType);
            }
          }
        }
        const sorted = [...allTypes].sort();
        setResourceTypes(sorted);
        try {
          sessionStorage.setItem(RESOURCE_TYPES_CACHE_KEY, JSON.stringify(sorted));
        } catch { /* sessionStorage full or unavailable */ }
      }
    };

    fetchResourceTypes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Use QueryBuilder hook with URL sync for saved filter/view support.
  // GroupBy is URL-first (?viewGroupBy=...), so no bridge refs are needed —
  // useQueryBuilder reads the param directly via searchParams.
  const {
    QueryBuilderElement,
    renderViewTabs,
    filters: filterConditions,
    activeView,
    allViewsForEntity,
    openTabIds,
  } = useQueryBuilder({
    entityType: 'Unit',
    spaces: queryBuilderSpaces,
    targets: queryBuilderTargets,
    toolchainTypes: DEFAULT_TOOLCHAIN_TYPES,
    slugs: slugOptions,
    resourceTypes,
    labelOptions,
    syncToUrl: true,
    showViewSelector: true,
    onSaveError: (message: string) => setErrorMessage((prev) => [...prev, message]),
  });

  // ── Eager prefetch of inactive view tabs ────────────────────────────────────
  // Each open tab's unit data is warmed into the RTK Query cache so clicking the
  // tab paints the grouped sidebar instantly (the active grid keeps its real
  // loading state — that's intentional, the user accepts it).  The active tab is
  // skipped because its query is already live above.  `force: false` ensures we
  // never re-trigger a fetch for a cache key that is already populated, so
  // background polling stays the only refresh signal.
  //
  // Arg derivation must byte-match what the active path produces post-switch,
  // otherwise the cache key won't hit and the prefetch is wasted:
  //   - filter strings come from `view.Filter` (the same Filter the URL points
  //     at after tab switch)
  //   - columns go through encode→decode so the `Columns` array shape exactly
  //     matches `getColumnsFromDelta(searchParams.get(VIEW_URL_PARAMS.COLUMNS) ?? '')`
  //   - groupBy uses `hydrateGroupByFromView`, matching the same source the
  //     active path's `?viewGroupBy=` URL param is populated from on tab switch
  useEffect(() => {
    if (!allViewsForEntity.length) return;
    const activeViewId = activeView?.View?.ViewID ?? null;
    for (const view of allViewsForEntity) {
      const viewId = view.View?.ViewID;
      if (!viewId) continue;
      if (!openTabIds.includes(viewId)) continue;
      if (viewId === activeViewId) continue;

      // Mirror the active path's column round-trip:
      //   - non-empty Columns → delta-encode + decode (so the final array
      //     matches `getColumnsFromDelta(<encoded delta>)`)
      //   - empty/undefined Columns → defaults via `getColumnsFromDelta('')`
      const savedColumnNames = normalizeColumnNames(
        (view.View?.Columns ?? [])
          .map((c) => c.Name)
          .filter(Boolean) as string[],
      );
      const encodedDelta =
        savedColumnNames.length > 0
          ? encodeColumnDelta(calculateColumnDelta(savedColumnNames))
          : '';
      const visibleColumnNames = getColumnsFromDelta(encodedDelta).map(
        (c) => c.Name,
      ) as BaseColumnKeys[];

      const groupByLevels = hydrateGroupByFromView(view);

      dispatch(
        confighubApi.util.prefetch(
          'listAllUnits',
          {
            where: view.Filter?.Where || '',
            whereData: view.Filter?.WhereData || '',
            resourceType: view.Filter?.ResourceType || '',
            include: buildIncludeParameter(visibleColumnNames, groupByLevels),
            select: buildSelectParameter(visibleColumnNames, groupByLevels),
          },
          { force: false },
        ),
      );
    }
  }, [allViewsForEntity, openTabIds, activeView, dispatch]);

  const { trackEntityCreated } = useAnalytics();

  // Apply client-side filtering for computed fields
  const filteredUnits = useMemo(() => {
    return applyClientSideFilters(units, filterConditions, createUnitListRow);
  }, [units, filterConditions]);

  // Per-label-key unit counts derived from the filtered set — fed to the
  // submenu dropdown so users see how many units have each label key.
  const labelKeyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const eu of filteredUnits) {
      for (const [key, value] of Object.entries(eu.Unit?.Labels ?? {})) {
        if (value) counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [filteredUnits]);

  const spaceLabelKeyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const eu of filteredUnits) {
      for (const [key, value] of Object.entries(eu.Space?.Labels ?? {})) {
        if (value) counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [filteredUnits]);

  // ============================================================================
  // GROUP NAV PANE — always visible. Falls back to flat grouping by Space when
  // the active view has no GroupBy configured, so the sidebar is never empty.
  // ============================================================================

  // Restore selectedGroups from `?group=` URL params on mount.
  // Multiple `group` entries describe a path through the multi-level group tree.
  const selectedGroupsFromUrl = useMemo(
    () => searchParams.getAll('group'),
    [searchParams],
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>(selectedGroupsFromUrl);

  /** Clears ?group= params from the URL without pushing a history entry. */
  const clearGroupUrlParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (next.has('group')) {
      next.delete('group');
      window.history.replaceState({}, '', `${window.location.pathname}?${next.toString()}`);
    }
  }, [searchParams]);

  // When the active view changes, reset selectedGroups + URL group params.
  // useGroupByLevels handles resetting localGroupByColumns (render-time guard).
  const lastActiveViewIdRef = useRef<string | undefined>(activeView?.View?.ViewID);
  useEffect(() => {
    const currentViewId = activeView?.View?.ViewID;
    if (lastActiveViewIdRef.current !== currentViewId) {
      lastActiveViewIdRef.current = currentViewId;
      setSelectedGroups([]);
      clearGroupUrlParams();
    }
  }, [activeView?.View?.ViewID, clearGroupUrlParams]);

  // ── Cross-tab transition flag ──────────────────────────────────────────────
  // `useDeferredValue` is React 18's purpose-built tool for "show stale-ish
  // UI while a heavy update is in flight".  When `activeViewID` changes,
  // React renders the heavy parts (data grid, expanded tree) as a
  // low-priority transition; `deferredActiveViewID` lags `activeViewID`
  // for exactly the duration of that lag.  `isTransitioning` is true
  // while they differ.
  //
  // Why not a ref + useState + useEffect chain (the obvious approach):
  // - `useEffect` runs AFTER commit, so any setState in it is necessarily
  //   one render behind — the spinner either paints late or sticks.
  //   Empirically I tried four variants (units-dep, isTransitioning-dep,
  //   rAF clear, setTimeout(0) clear).  All four either showed a spurious
  //   spinner-flash in the fast cache-hit case (A→B regression) or
  //   left the spinner stuck for >1s in the cache-miss case.
  // - `useDeferredValue` runs inside React's reconciliation, so the
  //   timing of "transition over" naturally tracks "React finished the
  //   heavy work" — no manual timer or signal-source required.
  //
  // Plumbed into `GroupNavPanel` via `isLoading || isTransitioning` so
  // any cross-tab render lag surfaces as a spinner instead of a flash
  // of the leaving tab's tree.  Cache-miss cases also still show via
  // the RTK Query `isLoading` half of the OR.
  const activeViewIdForTransition = activeView?.View?.ViewID ?? null;
  const deferredActiveViewIdForTransition = useDeferredValue(
    activeViewIdForTransition,
  );
  const isTransitioning =
    deferredActiveViewIdForTransition !== activeViewIdForTransition;

  // URL-first grouping:
  // - `localGroupByColumns` is derived from `?viewGroupBy=` in the URL,
  //   falling back to the active view's committed levels when absent.
  // - `handleEditLevels` writes `?viewGroupBy=` directly, keeping the URL
  //   live on every chip add/remove (behavior #2 from the view-tab URL brief).
  // - The view.GroupBy/Columns persistence is only written on explicit Save.
  const { localGroupByColumns, handleEditLevels } =
    useGroupByLevels({
      activeView,
      searchParams,
      setSearchParams,
      setSelectedGroups,
      clearGroupUrlParams,
    });

  // Called after a new view is created — fires analytics.
  // URL switching is handled by handleSelectSavedView (called from
  // wrappedOnViewCreated in useQueryBuilder) so we do NOT need to update
  // the URL here; doing so would use the stale mutation path.
  const handleViewCreated = useCallback(
    (view: ExtendedViewRead) => {
      const viewId = view.View?.ViewID;
      if (viewId) {
        trackEntityCreated({ entity_type: ENTITY_TYPES.VIEW, entity_id: viewId });
      }
    },
    [trackEntityCreated],
  );

  const handleSelectGroups = useCallback(
    (groups: string[]) => {
      setSelectedGroups(groups);
      // Sync to URL — replace all `group` entries with the new path.
      const next = new URLSearchParams(searchParams);
      next.delete('group');
      for (const g of groups) {
        if (g && g !== ALL_GROUPS) {
          next.append('group', g);
        }
      }
      // Use replace so back/forward isn't littered with intermediate selections.
      window.history.replaceState({}, '', `${window.location.pathname}?${next.toString()}`);
    },
    [searchParams],
  );

  // Apply group-pane filtering on top of client-side filters.
  // localGroupByColumns is always non-empty (falls back to ['Space']).
  const displayedUnits = useMemo(() => {
    if (selectedGroups.length === 0) return filteredUnits;
    let filtered = filteredUnits;
    for (let i = 0; i < selectedGroups.length && i < localGroupByColumns.length; i++) {
      const val = selectedGroups[i];
      if (val === ALL_GROUPS) break;
      const col = localGroupByColumns[i];
      filtered = filtered.filter((eu) => (getCellValue(eu, col) || '(empty)') === val);
    }
    return filtered;
  }, [filteredUnits, localGroupByColumns, selectedGroups]);

  // ============================================================================
  // SIDEBAR OPEN/WIDTH PERSISTENCE
  // ============================================================================
  // Open/closed boolean — persisted under `confighub:unitListSidebar:open`.
  // Width — persisted under `confighub:unitListSidebar:width`.
  // Default to open on first visit; subsequent visits respect prior choice.
  const SIDEBAR_OPEN_KEY = 'confighub:unitListSidebar:open';
  const SIDEBAR_WIDTH_KEY = 'confighub:unitListSidebar:width';
  const SIDEBAR_DEFAULT_WIDTH = 240;
  const SIDEBAR_MIN_WIDTH = 180;
  const SIDEBAR_MAX_WIDTH = 480;

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_OPEN_KEY);
      return raw === null ? true : (JSON.parse(raw) as boolean);
    } catch {
      return true;
    }
  });
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Width — persisted under `confighub:unitListSidebar:width`. Drag handle
  // adjusts; clamps to a sensible range on every change.
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      const parsed = raw === null ? SIDEBAR_DEFAULT_WIDTH : (JSON.parse(raw) as number);
      const w = Number.isFinite(parsed) ? parsed : SIDEBAR_DEFAULT_WIDTH;
      return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, w));
    } catch {
      return SIDEBAR_DEFAULT_WIDTH;
    }
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  // While the user is actively dragging the resize handle we bypass React
  // entirely: per-frame width updates are written to a CSS variable on the
  // wrapper element via a DOM ref, and React state + localStorage are only
  // touched when the drag ends. This avoids re-rendering the whole unit
  // list (data grid, breadcrumb, etc.) on every mousemove.
  const dragWidthRef = useRef(sidebarWidth);
  const handleSidebarResizeStart = useCallback(() => {
    dragWidthRef.current = sidebarWidthRef.current;
    const wrap = groupingWrapRef.current;
    if (wrap) {
      wrap.style.setProperty('--group-nav-width', `${sidebarWidthRef.current}px`);
      // Signal to GroupNavPanel that width transitions should be suppressed
      // for the duration of the drag — otherwise every per-frame width
      // change re-arms the 200ms ease and the pane lags the cursor.
      wrap.dataset.resizing = 'true';
    }
  }, []);
  const handleSidebarResize = useCallback((delta: number) => {
    const next = Math.max(
      SIDEBAR_MIN_WIDTH,
      Math.min(SIDEBAR_MAX_WIDTH, dragWidthRef.current + delta),
    );
    dragWidthRef.current = next;
    const wrap = groupingWrapRef.current;
    if (wrap) {
      wrap.style.setProperty('--group-nav-width', `${next}px`);
    }
  }, []);
  const handleSidebarResizeEnd = useCallback(() => {
    const wrap = groupingWrapRef.current;
    if (wrap) {
      delete wrap.dataset.resizing;
    }
    const final = dragWidthRef.current;
    setSidebarWidth(final);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, JSON.stringify(final));
    } catch {
      /* ignore */
    }
  }, []);

  // Measure the wrap's offset from viewport top so each pane fills exactly the
  // remaining height, regardless of how much chrome (filters, error bar, etc.)
  // sits above. Static calc(100vh - X) breaks when the chrome height changes.
  const groupingWrapRef = useRef<HTMLDivElement>(null);
  const [groupingPaneHeight, setGroupingPaneHeight] = useState<number>(600);
  useEffect(() => {
    const el = groupingWrapRef.current;
    if (!el) return;
    const compute = () => {
      const top = el.getBoundingClientRect().top;
      const next = Math.max(400, Math.floor(window.innerHeight - top - 16));
      setGroupingPaneHeight(next);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(document.body);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [isAdvancedFiltersOpen]);

  // ============================================================================
  // LABEL KEYS
  // ============================================================================
  const { labelKeys, spaceLabelKeys } = useLabelKeys();

  // ============================================================================
  // API MUTATIONS
  // ============================================================================
  const [
    bulkDelete,
    { data: bulkDeleteData, isSuccess: isBulkDeleteSuccess, error: bulkDeleteError },
  ] = useBulkDeleteUnitsMutation();

  // ============================================================================
  // CHANGESET WORKFLOW HOOK
  // ============================================================================
  const {
    isCreateChangesetMode,
    setIsCreateChangesetMode,
    isChangesetWorkflowMode,
    setIsChangesetWorkflowMode,
    selectedChangesetId,
    setSelectedChangesetId,
    selectedWorkflowTab,
    setSelectedWorkflowTab,
    isChangesetEditMode,
    setIsChangesetEditMode,
    setEditedChangesetSlug,
    setEditedChangesetDescription,
    refreshChangesets,
    setRefreshChangesets,

    openChangeSets,
    selectedChangeset,
    refetchChangeSets,
    onChangeSetSelected,
    handleToggleChangesetEditMode,
    handleConfirmSaveChangeset,

    changeSetError,
    setChangeSetError,
    errorFormatter,
  } = useChangeSetWorkflow({
    setSelectedUnits,
    setDefaultRowSelection,
    units,
    setErrorMessage,
  });

  const [refetchCompleteUnits] = useLazyListAllUnitsQuery();

  // ============================================================================
  // COMPUTED VALUES & DERIVED STATE
  // ============================================================================
  const selectedUnit = useMemo(
    () => units.find((unit) => unit?.Unit?.UnitID === selectedUnits[0])?.Unit,
    [units, selectedUnits],
  );

  const modalMapping = () => ({
    [BULK_ACTIONS.CHANGE_SET]: {
      type: 'changesets' as ModalType,
      setter: (open: boolean) => updateModalState({ isCreateChangesetModalOpen: open }),
    },
    [BULK_ACTIONS.LINK]: {
      type: 'link' as ModalType,
      setter: (open: boolean) => updateModalState({ isLinkToModalOpen: open }),
    },
    [BULK_ACTIONS.ADD]: {
      type: 'add' as ModalType,
      setter: (open: boolean) => updateModalState({ isAddUnitModalOpen: open }),
    },
    [BULK_ACTIONS.BULK_EDIT]: {
      type: 'bulk_edit' as ModalType,
      setter: (open: boolean) => updateModalState({ isBulkEditModalOpen: open }),
    },
    [BULK_ACTIONS.CLONE]: {
      type: 'clone' as ModalType,
      setter: (open: boolean) => updateModalState({ isCloneModalOpen: open }),
    },
    [BULK_ACTIONS.UPGRADE]: {
      type: 'upgrade' as ModalType,
      setter: (open: boolean) => updateModalState({ isUpgradeModalOpen: open }),
    },
    [BULK_ACTIONS.BULK_RESTORE]: {
      type: 'bulk_restore' as ModalType,
      setter: (open: boolean) => updateModalState({ isBulkRestoreModalOpen: open }),
    },
  });

  const unitsToEdit = () => {
    // Use complete units for operations that need full data
    if (modalType === 'bulk_edit' && completeUnitsForGrouping.length > 0) {
      return completeUnitsForGrouping
        .filter((unit) => selectedUnits.includes(unit?.Unit?.UnitID ?? ''))
        .map((unit) => unit.Unit)
        .filter(Boolean);
    } else if (modalType === 'clone' && completeUnitsForCloning.length > 0) {
      return completeUnitsForCloning
        .filter((unit) => selectedUnits.includes(unit?.Unit?.UnitID ?? ''))
        .map((unit) => unit.Unit)
        .filter(Boolean);
    }

    // Default to using the optimized units list
    return units
      .filter((unit) => selectedUnits.includes(unit?.Unit?.UnitID ?? ''))
      .map((unit) => unit.Unit)
      .filter(Boolean);
  };

  // Helper function for fetching target by ID
  const getTargetByIdAsync = useCallback(async (
    existingTarget: TargetRead,
    targetId: string,
    spaceId: string,
  ) => {
    const target = await getTargetById({
      targetId,
      spaceId,
    }).unwrap();

    if (target) {
      setExistingTarget(target.Target ?? existingTarget);
      setIsTargetDrawerOpen(true);
    }
  }, [getTargetById]);

  // ============================================================================
  // EFFECTS
  // ============================================================================
  // Refetch units when window/tab gains focus to ensure fresh data
  useEffect(() => {
    const handleFocus = () => {
      refetchUnits();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetchUnits]);

  // Mirror local selection into the global selectedUnits slice so the
  // Invoker sidebar (and anything else global) can see the current selection.
  useEffect(() => {
    const resolved = units.filter(
      (u) => u.Unit?.UnitID && selectedUnits.includes(u.Unit.UnitID),
    );
    dispatch(setGlobalSelectedUnits({ units: resolved }));
  }, [selectedUnits, units, dispatch]);
  // Clear global selection on unmount only (separate so the sync above has no
  // cleanup and avoids the [] → resolved flicker on every selection change).
  useEffect(() => {
    return () => {
      dispatch(setGlobalSelectedUnits({ units: [] }));
    };
  }, [dispatch]);

  // Poll for units every 5 seconds when tab is visible
  usePolling(refetchUnits, 5000);

  // Error handling for API errors
  useApiErrorMessage(unitsError, isUnitsSuccess, errorFormatter);
  useBulkApiErrorMessage(
    bulkDeleteError,
    isBulkDeleteSuccess,
    bulkDeleteData,
    setErrorMessage,
  );

  // Stable callback for the GettingStarted "Add" button (used in noRowsOverlay)
  const handleAddUnit = useCallback(() => {
    handleBulkActionChange(BULK_ACTIONS.ADD);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================================
  // EVENT HANDLERS - BULK ACTIONS
  // ============================================================================
  const handleBulkActionChange = async (action: string) => {
    const mappingObj = modalMapping();
    const mapping = mappingObj[action as keyof typeof mappingObj];
    if (mapping) {
      setModalType(mapping.type);

      if (mapping.type === 'changesets') {
        const selectedUnitIds = selectedUnits.map((id) => `'${id}'`).join(',');
        const workflowSourceUnits = units.filter((unit) =>
          selectedUnitIds.includes(unit?.Unit?.UnitID ?? ''),
        );
        setLinkWorkflowSourceUnits(workflowSourceUnits);
        setIsCreateChangesetMode(true);
        setIsAdvancedFiltersOpen(true);
      }

      // Handle link action - open link workflow
      if (mapping.type === 'link') {
        const selectedUnitIds = selectedUnits.map((id) => `'${id}'`).join(',');
        const workflowSourceUnits = units.filter((unit) =>
          selectedUnitIds.includes(unit?.Unit?.UnitID ?? ''),
        );
        setLinkWorkflowSourceUnits(workflowSourceUnits);
        setIsLinkWorkflowMode(true);
        setIsAdvancedFiltersOpen(true);
        return;
      }

      // Fetch complete unit data for operations that need full unit data
      if (mapping.type === 'bulk_edit' || mapping.type === 'clone') {
        const selectedUnitIds = selectedUnits.map((id) => `'${id}'`).join(',');
        const completeUnitsResult = await refetchCompleteUnits({
          where: `UnitID IN (${selectedUnitIds})`,
          include:
            'SpaceID,TargetID,HeadRevisionNum,LastReleasedRevisionNum,UnitEventID,UpstreamUnitID',
          // No select parameter - fetch all fields including Data field needed for operations
        });

        // Store complete units based on operation type
        if (mapping.type === 'bulk_edit') {
          setCompleteUnitsForGrouping(completeUnitsResult.data || []);
        } else {
          setCompleteUnitsForCloning(completeUnitsResult.data || []);
        }
      }

      mapping.setter(true);
    }
  };

  // ============================================================================
  // EVENT HANDLERS - DELETE
  // ============================================================================
  const handleSelectedUnitsDeleted = async () => {
    await bulkDelete({
      where: `UnitID IN (${selectedUnits.map((id) => `'${id}'`).join(',')})`,
    });

    updateModalState({ isDeleteModalOpen: false });
  };

  // ============================================================================
  // EVENT HANDLERS - FUNCTION INVOCATION
  // ============================================================================
  const handleFunctionInvocation = async (
    data: FunctionInvocationsResponse[],
    apiError?: string,
    preInvocationUnitsFromInvocation?: ExtendedUnitRead[],
    func?: FunctionSignature,
  ) => {
    // Refetch units to ensure we have the latest data after function execution
    await refetchUnits();

    // Use provided pre-invocation units if available (from saved invocation),
    // otherwise use the stored preInvocationUnits (from modal)
    const unitsToUse =
      preInvocationUnitsFromInvocation && preInvocationUnitsFromInvocation?.length > 0
        ? preInvocationUnitsFromInvocation
        : preInvocationUnits;

    // Store results locally to show in the function invocation tab
    setFunctionInvocationResults(data);
    setFunctionInvocationError(apiError || '');

    // Also store in Redux for the standalone function list page (if they navigate there)
    dispatch(
      setFunctionInvocationResponse({
        functions: data,
        units: unitsToUse,
        apiError,
      }),
    );

    const functionToUse =
      (isEmpty(selectedFunction) ? func : selectedFunction) || ({} as FunctionSignature);

    if (!isChangesetWorkflowMode) navigate(`/functions/${functionToUse.FunctionName}`);
    else setIsFunctionResultsDrawerOpen(true); // Switch to function invocation tab

    if (isChangesetWorkflowMode) {
      setRefreshChangesets((prev) => !prev);
    }
  };

  const handleErrorClose = () => setErrorMessage([]);

  const handleClearFunctionInvocationErrors = () => {
    setFunctionInvocationError('');
  };

  // ============================================================================
  // MODAL CLOSE HANDLERS
  // ============================================================================
  const modalCloseHandlers = useMemo(
    () => ({
      add: () => updateModalState({ isAddUnitModalOpen: false }),
      link: () => updateModalState({ isLinkToModalOpen: false }),
      invoke: () => {
        updateModalState({ isInvokeFunctionsModalOpen: false });
        setInvocationToEdit(undefined);
      },
      bulk_edit: () => updateModalState({ isBulkEditModalOpen: false }),
      clone: () => updateModalState({ isCloneModalOpen: false }),
      destroy: () => updateModalState({ isDeleteModalOpen: false }), // Handle destroy modal
      changesets: () => updateModalState({ isCreateChangesetModalOpen: false }),
      upgrade: () => updateModalState({ isUpgradeModalOpen: false }),
      bulk_restore: () => updateModalState({ isBulkRestoreModalOpen: false }),
    }),
    [updateModalState],
  );

  // ============================================================================
  // RENDER CONDITIONS & HELPERS
  // ============================================================================
  // Show the standalone GettingStarted page when there are truly no units
  // (not just filtered to zero) and the data has loaded
  const shouldShowGettingStarted = units.length === 0 && !isLoading && filterConditions.length === 0;

  const shouldShowUnitList = isChangesetWorkflowMode
    ? !selectedChangesetId // Show table only when no changeset is selected in workflow mode
    : true; // Show table if not in changeset workflow mode

  // When in changeset workflow mode we don't want to allow any additional filtering for the changeset units being worked on as this could break the flow.
  const disableFilters = isChangesetWorkflowMode && !!selectedChangesetId;

  const viewSwitcher = useMemo(
    () => (
      <ToggleButtonGroup
        value={isTreeViewMode ? 'tree' : 'list'}
        exclusive
        size='small'
        sx={{ '& .MuiToggleButton-root': { border: 'none', padding: '4px 8px' } }}
      >
        <Tooltip arrow placement='bottom' title='List View'>
          <ToggleButton
            value='list'
            onClick={() => {
              setIsTreeViewMode(false);
              setSelectedUnits([]);
              setDefaultRowSelection(0);
            }}
          >
            <ViewListIcon fontSize='small' />
          </ToggleButton>
        </Tooltip>
        <Tooltip arrow placement='bottom' title='Canvas View'>
          <ToggleButton value='tree' onClick={() => setIsTreeViewMode(true)}>
            <AccountTreeIcon fontSize='small' />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    ),
    [isTreeViewMode, setIsTreeViewMode, setSelectedUnits, setDefaultRowSelection],
  );

  const Tabs = useMemo(
    () => (
      <>
        <UnitDataGridTab
          disableToolbar={disableFilters}
          units={displayedUnits}
          isLoading={isLoading || isTransitioning}
          isVisible={shouldShowUnitList}
          defaultRowSelection={defaultRowSelection}
          onRowSelectionChange={setSelectedUnits}
          selectedUnitIds={selectedUnits}
          filterElement={QueryBuilderElement}
          customToolbarActions={viewSwitcher}
          noRowsOverlay={undefined}
          onRowItemEdit={(id) => {
            const target = displayedUnits.find((unit) => unit?.Unit?.TargetID === id)?.Target;
            if (target) {
              getTargetByIdAsync(target, id, target.SpaceID ?? '');
            }
          }}
        />
        {isChangesetWorkflowMode && selectedChangesetId && selectedWorkflowTab === 0 && (
          <ChangeSetTab
            refreshChangesets={refreshChangesets}
            changeSet={selectedChangeset}
            isVisible={isChangesetWorkflowMode && selectedWorkflowTab === 0}
            isEditMode={isChangesetEditMode}
            onSaveChanges={(slug, description) => {
              setEditedChangesetSlug(slug);
              setEditedChangesetDescription(description);
            }}
            errorMessages={changeSetError}
            selectedUnitIds={selectedUnits}
            onSelectionChange={setSelectedUnits}
          />
        )}
        {isChangesetWorkflowMode && selectedChangesetId && selectedWorkflowTab === 1 && (
          <RevisionsTab
            changeSet={selectedChangeset || ({} as ChangeSetRead)}
            isVisible={isChangesetWorkflowMode && selectedWorkflowTab === 1}
            setErrorMessage={setErrorMessage}
          />
        )}
      </>
    ),
    [
      displayedUnits,
      isLoading,
      isTransitioning,
      defaultRowSelection,
      selectedWorkflowTab,
      shouldShowUnitList,
      selectedUnits,
      isChangesetEditMode,
      changeSetError,
      refreshChangesets,
      selectedChangeset,
      isChangesetWorkflowMode,
      selectedChangesetId,
      QueryBuilderElement,
      disableFilters,
      filterConditions,
      handleAddUnit,
      getTargetByIdAsync,
      setEditedChangesetSlug,
      setEditedChangesetDescription,
    ],
  );

  return (
    <>
      <Container>
        <UnitListHeader
          handleBulkActionChange={handleBulkActionChange}
          setIsDeleteModalOpen={(open) => updateModalState({ isDeleteModalOpen: open })}
          setShowDiffOnApplyDrawer={(open) =>
            updateModalState({ showDiffOnApplyDrawer: open })
          }
          selectedUnitsIds={selectedUnits}
          selectedUnit={selectedUnit}
          onRefreshUnits={() => {
            refetchUnits();
            refetchSpaces();
            refetchFunctions();
            refetchViewsRef.current?.();
            refetchFiltersRef.current?.();
          }}
          onToggleChangesetWorkflowMode={() => {
            setIsChangesetWorkflowMode(!isChangesetWorkflowMode);
            setSelectedChangesetId(null);
            setSelectedWorkflowTab(0);
          }}
          isChangesetWorkflowMode={selectedChangeset?.ChangeSetID ? true : false}
          isLinkWorkflowMode={isLinkWorkflowMode}
          compactBottom={!isLinkWorkflowMode && !isCreateChangesetMode}
          searchBox={
            <Box sx={{ pb: isLinkWorkflowMode || isCreateChangesetMode ? 1 : 0, display: 'flex', flexDirection: 'column' }}>
              {isLinkWorkflowMode ? (
                <LinkWorkflow
                  sourceUnits={linkWorkflowSourceUnits}
                  allUnits={filteredUnits}
                  selectedTargetUnitIds={selectedLinkUnits}
                  onCancel={() => {
                    setIsLinkWorkflowMode(false);
                    setLinkWorkflowSourceUnits([]);
                    setSelectedLinkUnits([]);
                    setSelectedUnits([]);
                    setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen);
                  }}
                  onSave={() => {
                    setIsLinkWorkflowMode(false);
                    setLinkWorkflowSourceUnits([]);
                    setSelectedLinkUnits([]);
                    refetchUnits();
                    setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen);
                  }}
                />
              ) : isCreateChangesetMode ? (
                <CreateChangeSetAccordion
                  onClose={() => {
                    setIsCreateChangesetMode(false);
                    setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen);
                  }}
                  selectedUnits={filteredUnits
                    .map((unit: ExtendedUnitRead) => unit.Unit)
                    .filter((u): u is NonNullable<typeof u> => u !== undefined)}
                  onSuccess={(changesetId: string, spaceId: string) => {
                    setIsCreateChangesetMode(false);
                    setIsAdvancedFiltersOpen(false);

                    // Immediately select the changeset with minimal data
                    // The full data will be populated when refetchChangeSets completes
                    onChangeSetSelected({
                      ChangeSetID: changesetId,
                      SpaceID: spaceId,
                      Slug: '', // Will be populated by refetch
                    });

                    // Refetch to get the full changeset data and updated units
                    refetchChangeSets();
                    refetchUnits();
                  }}
                  selectedUnitIds={selectedUnits}
                />
              ) : (
                renderViewTabs({
                  spaceId: activeView?.View?.SpaceID || spaces[0]?.SpaceID || '',
                  filterId:
                    searchParams.get(VIEW_URL_PARAMS.FILTER_ID) ||
                    searchParams.get(FILTER_URL_PARAMS.FILTER_ID) ||
                    undefined,
                  localGroupByColumns,
                  onViewCreated: handleViewCreated,
                })
              )}
              {isChangesetWorkflowMode && selectedChangesetId && (
                <SettingsTabs
                  tabs={[`Change Set Details`, `Revisions`]}
                  onTabSelected={(tabIndex) => setSelectedWorkflowTab(tabIndex)}
                  defaultValue={selectedWorkflowTab}
                />
              )}
            </Box>
          }
        />
        <Main>
          <Section>
            <ErrorList errors={errorMessage} onClose={handleErrorClose} />

            {/* Sidebar is always visible — sibling to whichever main content
                is active (getting-started, tree view, link workflow, table). */}
            <SectionSlider $display={true} $direction={Direction.FadeIn} $width='100%'>
              <Box
                ref={groupingWrapRef}
                sx={{
                  display: 'flex',
                  width: '100%',
                  // Bound the row-with-sidebar to a measured height so each
                  // pane has its own scroll container. Without this the
                  // wrapper grows to the data grid's full content height
                  // and the panes share the page-level scroll.
                  height: groupingPaneHeight,
                  minHeight: 400,
                  overflow: 'hidden',
                }}
              >
                <GroupNavPanel
                  groupByColumns={localGroupByColumns}
                  items={filteredUnits}
                  selectedGroups={selectedGroups}
                  onSelectGroups={handleSelectGroups}
                  width={sidebarWidth}
                  open={sidebarOpen}
                  onToggleOpen={handleToggleSidebar}
                  onEditLevels={handleEditLevels}
                  availableLabelKeys={labelKeys}
                  availableSpaceLabelKeys={spaceLabelKeys}
                  availableLabelKeyCounts={labelKeyCounts}
                  availableSpaceLabelKeyCounts={spaceLabelKeyCounts}
                  isLoading={isLoading || isTransitioning}
                />
                {sidebarOpen && (
                  <PaneResizeHandle
                    onResizeStart={handleSidebarResizeStart}
                    onResize={handleSidebarResize}
                    onResizeEnd={handleSidebarResizeEnd}
                  />
                )}
                <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                  {shouldShowGettingStarted ? (
                    <GettingStarted
                      onAddButtonClicked={() => handleBulkActionChange(BULK_ACTIONS.ADD)}
                    />
                  ) : isTreeViewMode ? (
                    <Box sx={{ padding: '16px' }}>
                      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        {viewSwitcher}
                        {QueryBuilderElement}
                      </Box>
                      <UnitTreeControls
                        edgeType={treeEdgeType}
                        nodeType={treeNodeType}
                        onEdgeTypeChange={setTreeEdgeType}
                        onNodeTypeChange={setTreeNodeType}
                      />
                      <UnitTreeView
                        units={displayedUnits}
                        edgeType={treeEdgeType}
                        nodeType={treeNodeType}
                        isLoading={isLoading}
                      />
                    </Box>
                  ) : isLinkWorkflowMode ? (
                    <UnitDataGrid
                      key={`link-workflow`}
                      units={displayedUnits}
                      isLoading={isLoading || isTransitioning}
                      selectedUnitIds={selectedLinkUnits}
                      onRowSelectionChange={setSelectedLinkUnits}
                      onRowItemEdit={(id) => {
                        const target = displayedUnits.find(
                          (unit) => unit?.Unit?.TargetID === id,
                        )?.Target;
                        if (target) {
                          getTargetByIdAsync(target, id, target.SpaceID ?? '');
                        }
                      }}
                    />
                  ) : (
                    Tabs
                  )}
                </Box>
              </Box>
            </SectionSlider>

            {/* Floating Actions for Changeset Workflow */}
            {isChangesetWorkflowMode && (
              <WorkBenchFloatingActions
                setErrorMessage={(errorMessage: string) => setChangeSetError([errorMessage])}
                changesets={openChangeSets}
                selectedChangeset={selectedChangeset}
                onCreateChangeSet={() => handleBulkActionChange(BULK_ACTIONS.CHANGE_SET)}
                onChangesetSelect={onChangeSetSelected}
                onClose={() => {
                  setIsChangesetWorkflowMode(false);
                  setSelectedChangesetId(null);
                  setIsTreeViewMode(false);
                  setSelectedWorkflowTab(0);
                  setSelectedUnits([]);
                  setDefaultRowSelection(0);
                  setIsChangesetEditMode(false);
                  // Clear the changeset filter when closing
                  clearSearchParams();
                }}
                selectedTab={selectedWorkflowTab}
                onCloseChangeSetModalOpened={() => setIsCloseChangeSetModalOpen(true)}
                isEditMode={isChangesetEditMode}
                onToggleEditMode={handleToggleChangesetEditMode}
                onSave={handleConfirmSaveChangeset}
                onRestoreChanges={() => setIsRestoreModalOpen(true)}
                onChangesetDeleted={() => {
                  refetchChangeSets();
                  refetchUnits();
                }}
              />
            )}
          </Section>

          {/* TODO: rip all this out and replace it with something more simple */}
          <UnitModalComposer
            type={modalType}
            isOpen={{
              add: modalState.isAddUnitModalOpen,
              invoke: modalState.isInvokeFunctionsModalOpen,
              bulk_edit: modalState.isBulkEditModalOpen,
              clone: modalState.isCloneModalOpen,
              link: modalState.isLinkToModalOpen,
              changesets: modalState.isCreateChangesetModalOpen,
              upgrade: modalState.isUpgradeModalOpen,
              bulk_restore: modalState.isBulkRestoreModalOpen,
            }}
            onClose={modalCloseHandlers}
            onSubmit={{
              add: undefined,
              import: undefined,
              // @ts-expect-error TODO:
              invoke: handleFunctionInvocation,
              group: undefined,
              attributes: undefined,
              clone: undefined,
              upgrade: undefined,
            }}
            units={units.map((unit) => unit?.Unit).filter(Boolean) as UnitRead[]}
            spaces={spaces as SpaceRead[]}
            func={selectedFunction}
            unitsToEdit={unitsToEdit().filter((u): u is UnitRead => !!u)}
            defaultToolchainType={selectedUnit?.ToolchainType}
            refresh={() => {
              refetchUnits();
              if (isChangesetWorkflowMode) {
                setRefreshChangesets((prev) => {
                  return !prev;
                });
              }
            }}
            // When in changeset workflow mode, default to selected changeset for invoking functions...
            defaultChangeSetId={selectedChangeset?.ChangeSetID}
            invocationToEdit={invocationToEdit}
          />

          <ConfirmationModal
            isOpen={modalState.isDeleteModalOpen}
            onClose={() => updateModalState({ isDeleteModalOpen: false })}
            onSubmit={handleSelectedUnitsDeleted}
            modalDescriptionText='Are you sure you want to delete the selected units?'
            modalTitleText='Delete Units'
          />

          <AddTargetDrawer
            isOpen={isTargetDrawerOpen}
            onClose={() => {
              setIsTargetDrawerOpen(false);
              setExistingTarget(null);
            }}
            existingTarget={existingTarget ?? undefined}
          />

          <CloseChangeSetModal
            changeSet={selectedChangeset as ChangeSet}
            isCloseChangeSetModalOpen={isCloseChangeSetModalOpen}
            onCloseChangesetModalClosed={() => setIsCloseChangeSetModalOpen(false)}
            onCloseChangeSet={() => refetchChangeSets()}
            setErrorMessage={setErrorMessage}
            selectedUnits={units.filter(
              (unit: ExtendedUnitRead) =>
                unit?.Unit?.ChangeSetID === selectedChangeset?.ChangeSetID,
            )}
          />

          <RestoreChangesModal
            setErrorMessage={setChangeSetError}
            units={
              units
                .filter((unit) => selectedUnits.includes(unit?.Unit?.UnitID ?? ''))
                ?.map((unit) => unit?.Unit)
                .filter(Boolean) as UnitRead[]
            }
            changeSet={selectedChangeset as ChangeSet}
            changeSets={openChangeSets}
            isRestoreChangesModalOpen={isRestoreModalOpen}
            onRestoreChangesModalClosed={() => setIsRestoreModalOpen(false)}
            onRefresh={() => {
              setRefreshChangesets((prev) => {
                return !prev;
              });
              refetchUnits();
            }}
          />

          <FunctionInvocationDrawer
            isOpen={isFunctionResultsDrawerOpen}
            isMinimized={isFunctionResultsMinimized}
            functionInvocationResponse={functionInvocationResults}
            preInvocationUnits={preInvocationUnits}
            functionSignature={selectedFunction}
            apiError={functionInvocationError}
            onClose={() => {
              setIsFunctionResultsDrawerOpen(false);
              setFunctionInvocationResults([]);
              setFunctionInvocationError('');
            }}
            onMinimize={() => setIsFunctionResultsMinimized(true)}
            onMaximize={() => setIsFunctionResultsMinimized(false)}
            onClearErrors={handleClearFunctionInvocationErrors}
            onCancelAll={() => {
              // No-op for now, functions are synchronous
            }}
          />
        </Main>
      </Container>
    </>
  );
};

UnitListPage.displayName = 'UnitListPage';

export default UnitListPage;
