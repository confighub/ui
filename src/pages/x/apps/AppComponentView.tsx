// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';

import {
  type ExtendedReleaseRead,
  type ExtendedSpaceRead,
  type ExtendedTargetRead,
  type ExtendedUnitRead,
  type ListAllReleasesApiArg,
  type ListAllUnitsApiArg,
  type MutationConflict,
  type ResourceProtection,
  type TargetRead,
  type UnitCreateOrUpdateResponseRead,
  useBulkPatchUnitsMutation,
  useLazyGetUnitQuery,
  useListAllReleasesQuery,
  useListAllUnitsQuery,
  useSetUnitProtectionMutation,
  useUpdateUnitMutation,
} from '@confighub/rtk-query';
import type { UnitMetaPatch } from './unit-details/types';
import { getApiErrorMessage } from '@/utility/error-functions';
import { useAppDispatch } from '@/hooks/useApp';
import { spaceComponentSlug, useComponentSlugs } from '@/hooks/useComponentSlugs';
import { setSelectedUnits } from '@/state/slices/selectedUnits';
import Box from '@mui/material/Box';
import Slide from '@mui/material/Slide';
import { styled } from '@mui/material/styles';

import { ComponentFlowGraph } from './flow-graph/ComponentFlowGraph';
import { FlowViewControl, type FlowViewControlValue } from './flow-graph/FlowViewControl';
import type { ComponentDisplayMode, SelectedApp, ViewParamsPatch } from './appTypes';
import { ComponentOverviewMatrix } from './ComponentOverviewMatrix';
import type { NodeUnitSummary } from './flow-graph/DeploymentFlowNode';
import { componentTheme } from './componentTheme';
import { ComponentFlowGraphSkeleton } from './ComponentFlowGraphSkeleton';
import { ComponentSidePane } from './ComponentSidePane';
import type { StagedCommitPayload } from './ComponentValuesSection';
import { useRevisionDataMap, useUnitDataMap, useUploadUnitData } from '@/hooks/useUnitData';
import { buildAllApplyEntries, buildUpgradeEntries, buildVariationEntries } from './entryBuilders';
import { type SetValueResult } from './configParser';
import { arrowKey, buildComponentData } from './componentData';
import { batchIds } from './componentGroupFields';
import { useBatchedQuery } from './useBatchedQuery';
import { isYamlToolchain, useSetAttributesMutation } from './useSetAttributesMutation';
import { type OverallPhase, useCreateVariantMutation } from './useCreateVariantMutation';
import type { ComposerSubmitValues } from './flow-graph/ComposerNode';
import { getSiblingVariantNames, sanitizeVariantSlug } from './variantValidation';
import { RELEASE_FRESH_SETTLE_MS, useFreshSignal } from './useFreshSignal';
import { useReleaseActions } from './useReleaseActions';

// ============================================================================
// TYPES
// ============================================================================

interface AppComponentViewProps {
  /** The open node graph's Space set — every Deployment under the clicked
   * tree node, descendants included. May span more than one Component. */
  spaces: ExtendedSpaceRead[];
  /**
   * Every Space on the page that belongs to a Component — the variant composer's
   * sibling-name check needs a Component's full Deployment list, which can
   * include Deployments the current node graph excludes (e.g. grouped by
   * Variant, so a sibling variant sits in a different bucket / a different
   * node graph entirely).
   */
  componentSpaces: ExtendedSpaceRead[];
  targets: ExtendedTargetRead[];
  /**
   * Identity of the open node graph, replacing a single Component name for
   * the switch-reset effect and `ComponentFlowGraph`'s `structuralKey` — a
   * mixed-Component node graph has no one Component name. Built by
   * `AppsComponentLayout` from whichever URL form is active (`?app=<name>`
   * or `?group=<path>`).
   */
  graphKey: string;
  /** Controlled selection state (lifted to parent for tree nav) */
  selectedDeploymentIds?: Set<string>;
  onSelectedDeploymentIdsChange?: (ids: Set<string>) => void;
  /**
   * The deployments compared ALONGSIDE the open one, in slot order — slots B
   * onwards, since slot A is always `selectedDeploymentIds`' single member.
   * Controlled by `AppsComponentLayout` from `?compare=`.
   */
  compareDeploymentIds?: readonly string[];
  /** The WHOLE comparison in slot order, the open deployment first. Written as one patch. */
  onCompareSelectionChange?: (next: readonly string[]) => void;
  /**
   * When set, the view pans to this deployment node after the initial
   * graph fit-to-view completes. Intended for the ?space= deep-link
   * from the activity feed. Captured at mount time via a ref — mount-only
   * and unaffected by the URL continuing to carry `?space=` afterward
   * (unlike before, the param is no longer stripped, but a later in-app
   * click still shouldn't re-pan the graph).
   */
  initialFocusDeploymentId?: string;
  /**
   * Whether this node graph shows the flow canvas or the Dashboard — CONTROLLED
   * by `AppsComponentLayout`, derived from `?display=`.
   */
  displayMode: ComponentDisplayMode;
  /**
   * The ONE write path for the view's URL params. Built on
   * `AppsComponentLayout`'s `updateParams`, so every gesture here that needs
   * to change more than one of them atomically does so in a single URL write.
   */
  onViewParamsChange: (patch: ViewParamsPatch) => void;
  /** Fires when a Dashboard tile is clicked — opens that Component's own graph, same as the Overview root's tiles. */
  onComponentSelect: (app: SelectedApp) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SIDE_PANE_WIDTH = 650;


/** Stable empty units list, so the `?? []` fallback keeps one identity. */
const EMPTY_UNITS: ExtendedUnitRead[] = [];

/** Stable empty ID batch, so a graph with no Spaces yet doesn't churn `whereClause`'s memo. */
const EMPTY_STRING_ARRAY: string[] = [];

// Configuration is not a selectable field any more -- it is read from the data
// endpoints -- so this asks only for the metadata, plus the Revision ids the data
// and mutation-source reads are keyed by. Shared by every units-fetching batch
// (the primary SpaceID batch, extra SpaceID batches, and the upstream-outside-set
// UnitID lookup) so they all narrow the payload identically.
const UNITS_QUERY_SELECT =
  'UnitID,Slug,SpaceID,TargetID,UpstreamUnitID,UpstreamRevisionNum,HeadRevisionNum,LastReleasedRevisionNum,ValidationErrors,ToolchainType,DataHash,DataSize,'
  + 'HeadRevision.RevisionID,HeadRevision.CreatedAt,HeadRevision.Description,LastReleasedRevision.RevisionID';
const UNITS_QUERY_INCLUDE = 'SpaceID,TargetID,UpstreamUnitID,HeadRevisionNum,LastReleasedRevisionNum';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  background: componentTheme.bgSubtle,
  position: 'relative',
});

const GraphPane = styled(Box)({
  display: 'flex',
  flexDirection: 'row',
  flex: '1 1 0',
  minHeight: 0,
  overflow: 'hidden',
});

const GraphArea = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 0',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  position: 'relative',
});

const LoadingContainer = styled(Box)({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
  width: '100%',
});



// ============================================================================
// COMPONENT
// ============================================================================

export const AppComponentView = memo(({ spaces, componentSpaces, targets, graphKey, selectedDeploymentIds: controlledSelectedIds, onSelectedDeploymentIdsChange, compareDeploymentIds: controlledCompareIds, onCompareSelectionChange, initialFocusDeploymentId, displayMode, onViewParamsChange, onComponentSelect }: AppComponentViewProps) => {
  // ── State ──
  const EMPTY_SET = useMemo(() => new Set<string>(), []);
  const selectedDeploymentIds = controlledSelectedIds ?? EMPTY_SET;
  const EMPTY_COMPARE = useMemo<readonly string[]>(() => [], []);
  const compareDeploymentIds = controlledCompareIds ?? EMPTY_COMPARE;
  /**
   * The slot letter each compared deployment wears in the graph.
   *
   * Built from the WHOLE comparison — the open deployment is slot A — so a node
   * and its column in the pane always carry the same letter. Empty while
   * nothing extra is being compared, so the graph stays exactly as it ships.
   */
  const compareLetterById = useMemo(() => {
    const letters = new Map<string, string>();
    if (compareDeploymentIds.length === 0) return letters;
    const openId = selectedDeploymentIds.values().next().value as string | undefined;
    const order = openId ? [openId, ...compareDeploymentIds] : [...compareDeploymentIds];
    order.forEach((id, index) => letters.set(id, String.fromCharCode(65 + index)));
    return letters;
  }, [compareDeploymentIds, selectedDeploymentIds]);
  const dispatch = useAppDispatch();
  const [sidePaneWidth, setSidePaneWidth] = useState(DEFAULT_SIDE_PANE_WIDTH);
  const [isSidePaneResizing, setIsSidePaneResizing] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState<{ deploymentId: string } | undefined>();
  // A status-chip peek requested opening a deployment's side pane on a specific
  // tab (Stale → config, Unreleased/Gated → releases). The monotonic nonce lets
  // the side pane honor a repeat request even when the node is already selected.
  // `releaseNum`, set only by the release-stamp peek, asks the Releases tab to
  // scroll to and highlight that specific release rather than just land on the
  // tab and leave the user to find it.
  const [tabFocus, setTabFocus] = useState<{
    id: string;
    tab: 'config' | 'releases';
    nonce: number;
    releaseNum?: number;
  } | null>(null);
  const handleFocusDeployment = useCallback((deploymentId: string) => {
    setFocusTrigger({ deploymentId });
  }, []);
  // ── Inline variant composer ──
  // Which deployment the composer is anchored to as parent, or null when
  // closed. At most one open at a time. Re-keys the three in-flight guards
  // CreateVariantPane's createVariantUpstreamId/createVariantPhaseRef used
  // to drive (handleDeploymentToggle, handleOpenTab, the Escape effect,
  // below) — they still block navigation/dismissal while a mutation is
  // in-flight, just against this state instead. `overallPhase === 'inFlight'`
  // (Phase 2's coarse aggregate over perSpaceStatus) is the direct successor
  // of Phase 1's `phase === 'cloning' || phase === 'namespacing'`.
  const [composerParentId, setComposerParentId] = useState<string | null>(null);
  const composerVariant = useCreateVariantMutation();
  const composerPhaseRef = useRef<OverallPhase>('idle');
  composerPhaseRef.current = composerVariant.overallPhase;
  const graphPaneRef = useRef<HTMLDivElement>(null);

  // `displayMode` is a CONTROLLED prop — the URL (via AppsComponentLayout) is
  // the sole source of truth, no localStorage fallback. `FlowViewControl`'s
  // two segments each map to one write: Dashboard sets `display`; Graph
  // clears it — that's the only way back to the canvas once Dashboard is open.
  const handleFlowViewControlChange = useCallback(
    (next: FlowViewControlValue) => {
      onViewParamsChange({ display: next === 'dashboard' ? 'dashboard' : null });
    },
    [onViewParamsChange],
  );

  // Detect a node-graph switch (the graph's structure changes and the flow
  // graph re-fits to view). On that render the side pane must vanish *instantly*
  // with no Slide exit transition: an animating, still-on-screen pane steals
  // layout width, so fit-to-view would measure a too-small viewport and leave
  // the new graph mis-zoomed. A plain close/deselect (same graph) keeps the
  // normal animated exit. `graphKey` (not a Component name — a node graph can
  // span several Components) is what identifies "the same graph" here; we
  // compare against the previous one during render (ahead of the graph's
  // fit-to-view effects) so the pane is already zero-width when fit-to-view
  // runs. The ref is updated in a post-commit effect, not during render:
  // under StrictMode render runs twice, and mutating the ref in render would
  // make the second pass read the new value and compute isGraphSwitch=false,
  // animating the pane anyway. Updating post-commit keeps both render passes
  // reading the still-old value, so isGraphSwitch is correct in dev and prod.
  const prevGraphKeyRef = useRef(graphKey);
  const isGraphSwitch = prevGraphKeyRef.current !== graphKey;

  useEffect(() => {
    prevGraphKeyRef.current = graphKey;
    // Clear per-graph dry-run state on a graph switch so stale data from the
    // previous graph never leaks into the new one. Both accumulate across
    // switches (unit IDs don't collide, but memory grows unboundedly in long
    // sessions).
    setDryRunData(new Map());
    fetchedDryRunIds.current = new Set();
    // Close any open variant composer when switching graphs.
    setComposerParentId(null);
  }, [graphKey, isGraphSwitch]);

  const selectedSpaceUrl = useMemo(() => {
    const selectedId = selectedDeploymentIds.values().next().value;
    if (!selectedId) return undefined;
    return `/spaces/${selectedId}`;
  }, [selectedDeploymentIds]);

  // ── Data fetching ──
  // Sort + dedupe so the cache key depends only on the SET of SpaceIDs, not the
  // order they arrive in. The org-wide spaces query (which backfills the
  // priority-scoped one on `?app=` deep-links) has no ORDER BY, so the same
  // app's spaces can return in a different order; an unsorted `where` string
  // would change the units query cache key and flash the graph back to a spinner.
  const spaceIds = useMemo(
    () => Array.from(new Set(spaces.map((s) => s.Space?.SpaceID).filter(Boolean))).sort() as string[],
    [spaces],
  );

  // A node graph (any tree node, not just a whole Component) can hold more
  // Spaces than fit in one GET query string (`internal`'s 8192-byte limit,
  // ~39 bytes per quoted UUID). Split into ID_BATCH_SIZE-sized batches; the
  // FIRST batch stays a normal, cache-backed, polling `useListAllUnitsQuery`
  // call — for the common case (one batch) this is the ONLY units query a
  // single-Component graph ever issues. Batches beyond the first (a node
  // graph over ID_BATCH_SIZE Spaces — rare) are each their own subscribed
  // query too, via `useBatchedQuery` below.
  const spaceIdBatches = useMemo(() => batchIds(spaceIds), [spaceIds]);
  const primarySpaceIdBatch = spaceIdBatches[0] ?? EMPTY_STRING_ARRAY;

  const whereClause = useMemo(
    () =>
      primarySpaceIdBatch.length > 0
        ? `SpaceID IN (${primarySpaceIdBatch.map((id) => `'${id}'`).join(',')})`
        : '',
    [primarySpaceIdBatch],
  );

  // Use currentData (not data) so that switching components doesn't briefly
  // render the new spaces against stale units from the previous component.
  // currentData resets to undefined when query args change; data keeps the
  // last successful response across arg changes.
  //
  // The server returns full Unit, HeadRevision, LastReleasedRevision, UpstreamUnit, and
  // UnitStatus bodies by default — tens of MB on a busy org. Narrow with
  // select+include to only the fields this page actually reads. HeadRevisionNum and
  // LastReleasedRevisionNum stay in include because the Unapplied diff in the side
  // pane needs the HeadRevision / LastReleasedRevision they expand to, and the dotted
  // select sub-fields scope those expansions to the ids and labels
  // buildAllApplyEntries / the Unapplied diff in entryBuilders.ts consume. The
  // configuration and its mutation sources are read separately, from the data and
  // mutation-source endpoints, keyed by the Revision ids selected here.
  const hasPendingGatesRef = useRef(false);
  const [upgradingDeploymentIds, setUpgradingDeploymentIds] = useState<Set<string>>(() => new Set());
  // Per in-flight staged-commit (handleCommitStaged): unitId → the HeadRevisionNum
  // it had immediately before the commit. The settle-detector effect further down
  // watches for the refetched unit to show a HIGHER HeadRevisionNum than this
  // baseline before dropping its Space out
  // of upgradingDeploymentIds — so upgradingDeploymentIds (and therefore the
  // pollingInterval below, and the isUpgrading-gated button/loading state) keeps
  // covering the post-commit /unit refetch instead of clearing the instant the
  // PATCH promise resolves, which races ahead of the invalidated refetch landing.
  const upgradeSettleTargetsRef = useRef<Map<string, { spaceId: string; preCommitHead: number }>>(new Map());

  const {
    currentData: currentAllUnits,
    isLoading: unitsInitialLoading,
    isFetching: unitsFetching,
    isError: unitsError,
    error: unitsQueryError,
  } = useListAllUnitsQuery(
    {
      where: whereClause,
      select: UNITS_QUERY_SELECT,
      include: UNITS_QUERY_INCLUDE,
    },
    {
      skip: primarySpaceIdBatch.length === 0,
      pollingInterval: (hasPendingGatesRef.current || upgradingDeploymentIds.size > 0) ? 2000 : 0,
      // No refetchOnFocus: this query can return tens of MB for large units, so
      // re-fetching (and re-parsing / re-walking) the whole payload on every
      // window-focus change is a major dev-time stall and a wasteful refresh in
      // prod. Genuinely-needed refreshes (pending gates / settling upgrade
      // commits) are covered by the conditional pollingInterval above.
    },
  );

  // Batches beyond the first (a node graph over ID_BATCH_SIZE Spaces — rare):
  // each a REAL subscribed useListAllUnitsQuery call (via useBatchedQuery),
  // not an imperative one-shot fetch into local state — so a mutation
  // elsewhere that invalidates the Unit tag refreshes these too, and the
  // same 2s gate/upgrade poll as the primary batch reaches them. `resetKey:
  // graphKey` drops accumulated rows on a graph switch so the previous
  // graph's Spaces 51+ don't linger while the new graph's batches load.
  const unitsPollingInterval = (hasPendingGatesRef.current || upgradingDeploymentIds.size > 0) ? 2000 : 0;
  const extraSpaceIdBatchArgs = useMemo(
    () =>
      spaceIdBatches.slice(1).map(
        (batch): ListAllUnitsApiArg => ({
          where: `SpaceID IN (${batch.map((id) => `'${id}'`).join(',')})`,
          select: UNITS_QUERY_SELECT,
          include: UNITS_QUERY_INCLUDE,
        }),
      ),
    [spaceIdBatches],
  );
  const {
    data: extraBatchUnits,
    isLoading: extraBatchesLoading,
    isError: extraBatchesError,
    errors: extraBatchesErrors,
    subscriptions: extraUnitsSubscriptions,
  } = useBatchedQuery<ListAllUnitsApiArg, ExtendedUnitRead>(extraSpaceIdBatchArgs, useListAllUnitsQuery, {
    pollingInterval: unitsPollingInterval,
    resetKey: graphKey,
  });

  /**
   * Memoised so the `?? []` fallback does not hand every downstream `useMemo` a
   * brand-new array identity on each render — the project's standard fix for
   * `react-hooks/exhaustive-deps` on a `data ?? []` expression. Without it, four
   * separate memos over this list recompute every render even when the units
   * have not changed.
   */
  const allUnits = useMemo(
    () => (extraBatchUnits.length > 0 ? [...(currentAllUnits ?? EMPTY_UNITS), ...extraBatchUnits] : (currentAllUnits ?? EMPTY_UNITS)),
    [currentAllUnits, extraBatchUnits],
  );

  // Configuration is read from the data endpoints, in one request for everything on screen,
  // and handed to the entry builders as accessors. The Revisions are the head and
  // last-applied of each Unit, which is what the Unapplied diff compares.
  // `isFetching` is the ONLY honest source of "still loading" for a unit's
  // configuration. Without it a consumer has to infer waiting from an empty
  // string, which is also what a unit with no configuration returns — so an
  // empty unit waits forever.
  const { dataFor: unitDataFor, isFetching: isUnitDataFetching } = useUnitDataMap(
    allUnits.map((u) => u.Unit?.UnitID),
  );
  const { dataFor: revisionDataFor } = useRevisionDataMap(
    allUnits.flatMap((u) => [u.HeadRevision?.RevisionID, u.LastReleasedRevision?.RevisionID]),
  );
  const dataAccessors = useMemo(
    () => ({ unitData: unitDataFor, revisionData: revisionDataFor }),
    [unitDataFor, revisionDataFor],
  );
  // Drives a subtle in-place "refreshing" indicator in the side pane for
  // post-mutation invalidation / settle-window polling refetches. Whenever
  // this component reaches the side-pane render path below, unitsLoading is
  // already false (the `if (unitsLoading) return <spinner>` further down
  // covers the initial-load case), so unitsFetching alone means "background
  // refetch" by the time it's read here.
  const unitsBackgroundRefreshing = unitsFetching;

  const [bulkPatch] = useBulkPatchUnitsMutation();
  const [dryRunPatch] = useBulkPatchUnitsMutation();
  const [updateUnit] = useUpdateUnitMutation();
  const [uploadUnitData] = useUploadUnitData();
  const [getUnit] = useLazyGetUnitQuery();
  const [setUnitProtection] = useSetUnitProtectionMutation();

  // ── Success feedback (per-deployment) ──
  const [deploymentSuccessMessages, setDeploymentSuccessMessages] = useState<Map<string, string>>(() => new Map());
  const successTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const flashSuccess = useCallback((deploymentIds: Set<string>, msg: string) => {
    setDeploymentSuccessMessages((prev) => {
      const next = new Map(prev);
      for (const id of deploymentIds) next.set(id, msg);
      return next;
    });
    for (const id of deploymentIds) {
      const existing = successTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      successTimersRef.current.set(id, setTimeout(() => {
        setDeploymentSuccessMessages((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        successTimersRef.current.delete(id);
      }, RELEASE_FRESH_SETTLE_MS));
      // ^ Generic timing for ALL success flashes (Apply/Upgrade/Release/
      // Withdraw), but pinned to RELEASE_FRESH_SETTLE_MS specifically
      // because the DAG node's ReleaseChip "fresh" tint (DeploymentFlowNode)
      // derives its own settle timing from THIS message clearing — the two
      // must share one value so a publish's chip and status-pill highlights
      // settle in sync (see useFreshSignal.ts).
    }
  }, []);

  useEffect(() => () => {
    for (const timer of successTimersRef.current.values()) clearTimeout(timer);
  }, []);

  // ── Error handling ──
  // Per-deployment error map: persists errors even when the deployment is deselected
  const [deploymentErrors, setDeploymentErrors] = useState<Map<string, { title: string; detail: string; timestamp: Date }>>(
    () => new Map(),
  );

  // Record the same error against every deployment in `deploymentIds` (e.g. all
  // deployments affected by a failed upgrade/apply). useState setters are stable,
  // so this callback is stable and safe to list in dependency arrays.
  const setErrorsForDeployments = useCallback(
    (deploymentIds: Iterable<string>, entry: { title: string; detail: string; timestamp: Date }) => {
      setDeploymentErrors((prev) => {
        const next = new Map(prev);
        for (const id of deploymentIds) next.set(id, entry);
        return next;
      });
    },
    [],
  );

  // Derive errorDeploymentIds from the map — persists regardless of selection
  const errorDeploymentIds = useMemo(() => new Set(deploymentErrors.keys()), [deploymentErrors]);

  // Derive sidePaneError from the currently selected deployment's error
  const sidePaneError = useMemo(() => {
    for (const id of selectedDeploymentIds) {
      const err = deploymentErrors.get(id);
      if (err) return err;
    }
    return null;
  }, [selectedDeploymentIds, deploymentErrors]);

  // Derive sidePaneSuccessMessage from the currently selected deployment
  const sidePaneSuccessMessage = useMemo(() => {
    for (const id of selectedDeploymentIds) {
      const msg = deploymentSuccessMessages.get(id);
      if (msg) return msg;
    }
    return null;
  }, [selectedDeploymentIds, deploymentSuccessMessages]);

  // ── Derived data ──
  // A node graph can hold a downstream Space without its upstream in the set
  // (e.g. grouped by Variant, or a Component whose base lives in another
  // Component) — without this lookup that Unit reads as "not upgradable" and
  // its upgrade diff is empty: a WRONG answer, not a missing one. Collect
  // UpstreamUnitIDs not already present, batch-fetch them, and merge into
  // `unitById` ONLY (never into `allUnits`): they supply the upstream
  // HEAD/revision ids `buildUpgradeEntries` needs, but create no graph node
  // and no edge — the downstream node just becomes a root (no incoming arrow).
  const missingUpstreamIds = useMemo(() => {
    const knownIds = new Set(allUnits.map((u) => u.Unit?.UnitID).filter(Boolean) as string[]);
    const missing = new Set<string>();
    for (const u of allUnits) {
      const upstreamId = u.Unit?.UpstreamUnitID;
      if (upstreamId && !knownIds.has(upstreamId)) missing.add(upstreamId);
    }
    return Array.from(missing).sort();
  }, [allUnits]);

  // Each batch is a REAL subscribed useListAllUnitsQuery call (same reasoning
  // as the extra Space-ID batches above): a mutation elsewhere that
  // invalidates the Unit tag must refresh an upstream-only lookup too, and a
  // failed batch must be visible, not silently read as "not upgradable"
  // with no explanation.
  const upstreamIdBatchArgs = useMemo(
    () =>
      batchIds(missingUpstreamIds).map(
        (batch): ListAllUnitsApiArg => ({
          where: `UnitID IN (${batch.map((id) => `'${id}'`).join(',')})`,
          select: UNITS_QUERY_SELECT,
          include: UNITS_QUERY_INCLUDE,
        }),
      ),
    [missingUpstreamIds],
  );
  const {
    data: upstreamOnlyUnits,
    isLoading: upstreamBatchesLoading,
    isError: upstreamBatchesError,
    errors: upstreamBatchesErrors,
    subscriptions: upstreamUnitsSubscriptions,
  } = useBatchedQuery<ListAllUnitsApiArg, ExtendedUnitRead>(upstreamIdBatchArgs, useListAllUnitsQuery, {
    pollingInterval: unitsPollingInterval,
    resetKey: graphKey,
  });

  // Waits for every batch (primary, extra Space-ID, and upstream-outside-set)
  // to settle before the graph paints — a partial paint would show correct
  // Spaces 1-50 next to Spaces 51+ (or an upstream lookup) that haven't
  // resolved yet, and settle at an inconsistent moment per batch.
  const unitsLoading =
    spaceIds.length > 0 &&
    (unitsInitialLoading ||
      (currentAllUnits === undefined && unitsFetching) ||
      extraBatchesLoading ||
      upstreamBatchesLoading);

  const unitById = useMemo(() => {
    const m = new Map<string, ExtendedUnitRead>();
    for (const u of allUnits) {
      const uid = u.Unit?.UnitID;
      if (uid) m.set(uid, u);
    }
    for (const u of upstreamOnlyUnits) {
      const uid = u.Unit?.UnitID;
      if (uid && !m.has(uid)) m.set(uid, u);
    }
    return m;
  }, [allUnits, upstreamOnlyUnits]);

  // Poll while any unit has gates still being evaluated by the resolve queue
  const computedHasPendingGates = useMemo(
    () => allUnits.some((u) => {
      const gates = u.Unit?.ValidationErrors;
      return !!gates && 'awaiting/triggers' in gates;
    }),
    [allUnits],
  );
  hasPendingGatesRef.current = computedHasPendingGates;

  // Map deployment ID (== SpaceID) → sorted list of units with link info (for side pane display)
  const unitsByDeployment = useMemo(() => {
    const m = new Map<string, { slug: string; spaceId: string; unitId: string; hasUpstream: boolean; toolchainType?: string; data?: string; validationErrors?: { [key: string]: boolean }; targetId?: string }[]>();
    for (const u of allUnits) {
      const sid = u.Unit?.SpaceID;
      const slug = u.Unit?.Slug;
      const unitId = u.Unit?.UnitID;
      if (!sid || !slug || !unitId) continue;
      const toolchainType = u.Unit?.ToolchainType;
      const data = unitDataFor(u.Unit?.UnitID);
      const validationErrors = u.Unit?.ValidationErrors as { [key: string]: boolean } | undefined;
      // TargetID scopes a unit to the Space's Release target set (task #60:
      // release_core.go only bundles Units whose TargetID equals the Space's
      // ReleaseTargetID — this is the same filter the "Unreleased changes"
      // section uses to decide which units to diff against the last release).
      const targetId = u.Unit?.TargetID;
      const item = {
        slug, spaceId: sid, unitId,
        hasUpstream: !!u.Unit?.UpstreamUnitID,
        ...(toolchainType ? { toolchainType } : {}),
        ...(data ? { data } : {}),
        ...(validationErrors ? { validationErrors } : {}),
        ...(targetId ? { targetId } : {}),
      };
      const list = m.get(sid);
      if (list) list.push(item);
      else m.set(sid, [item]);
    }
    for (const list of m.values()) list.sort((a, b) => a.slug.localeCompare(b.slug));
    return m;
  // unitDataFor as well as allUnits: the configuration comes from its own query now, and
  // it resolves after the unit list does. Depending only on allUnits pins this to the
  // first pass, when every unit's data is still undefined, and no later arrival brings
  // it back -- the side pane just reads "No configuration data" forever.
  }, [allUnits, unitDataFor]);

  // Cross-store sync: propagate the currently-selected deployment's units into Redux
  // so the global InvokerSidebar (which reads Redux selectedUnits) reflects this view's
  // node selection. useEffect is appropriate here — it explicitly coordinates two
  // separate state systems (local controlled selection ↔ Redux), and the cleanup
  // ensures the invoker context clears when the user navigates away or deselects.
  useEffect(() => {
    if (selectedDeploymentIds.size === 0) {
      dispatch(setSelectedUnits({ units: [] }));
      return;
    }
    const resolvedUnits: ExtendedUnitRead[] = [];
    for (const deploymentId of selectedDeploymentIds) {
      for (const u of (unitsByDeployment.get(deploymentId) ?? [])) {
        const full = unitById.get(u.unitId);
        if (full) resolvedUnits.push(full);
      }
    }
    dispatch(setSelectedUnits({ units: resolvedUnits }));
    return () => { dispatch(setSelectedUnits({ units: [] })); };
  }, [selectedDeploymentIds, unitsByDeployment, unitById, dispatch]);

  // ── Dry-run for accurate merge preview ──
  const [dryRunData, setDryRunData] = useState<Map<string, string>>(() => new Map());
  const [dryRunConflicts, setDryRunConflicts] = useState<Map<string, MutationConflict[]>>(() => new Map());
  const [dryRunPendingIds, setDryRunPendingIds] = useState<Set<string>>(() => new Set());
  const fetchedDryRunIds = useRef<Set<string>>(new Set());

  // Compute per-deployment unit summaries for node display
  const unitSummariesByDeployment = useMemo(() => {
    const m = new Map<string, NodeUnitSummary[]>();
    for (const u of allUnits) {
      const unit = u.Unit;
      const sid = unit?.SpaceID;
      const slug = unit?.Slug;
      if (!sid || !slug || !unit) continue;

      const upstreamId = unit.UpstreamUnitID;
      const upstream = upstreamId ? unitById.get(upstreamId) : undefined;
      const upgrading = upstream
        ? (unit.UpstreamRevisionNum ?? 0) < (upstream.Unit?.HeadRevisionNum ?? 0)
        : false;

      const head = unit.HeadRevisionNum ?? 0;
      const applied = unit.LastReleasedRevisionNum ?? 0;
      const gates = unit.ValidationErrors;
      const hasGates = !!gates && Object.keys(gates).length > 0;
      const unapplied = head > 0 && applied < head;
      // Units with no target can't be applied (e.g. units in bases)
      const applyStatus: NodeUnitSummary['applyStatus'] = !unit.TargetID
        ? null
        : unapplied
          ? hasGates ? 'gated' : 'pending'
          : null;

      const list = m.get(sid);
      if (list) list.push({ slug, upgrading, applyStatus });
      else m.set(sid, [{ slug, upgrading, applyStatus }]);
    }
    for (const list of m.values()) list.sort((a, b) => a.slug.localeCompare(b.slug));
    return m;
  }, [allUnits, unitById]);

  // Find upgradeable unit IDs scoped to the selected deployment(s)
  const upgradeableUnitIds = useMemo(() => {
    if (selectedDeploymentIds.size === 0) return [];
    const ids: string[] = [];
    for (const u of allUnits) {
      const unit = u.Unit;
      if (!unit?.UnitID || !unit.UpstreamUnitID) continue;
      if (!unit.SpaceID || !selectedDeploymentIds.has(unit.SpaceID)) continue;
      const upstream = unitById.get(unit.UpstreamUnitID);
      if (!upstream) continue;
      const upstreamRevNum = unit.UpstreamRevisionNum ?? 0;
      const upstreamHead = upstream.Unit?.HeadRevisionNum ?? 0;
      if (upstreamRevNum < upstreamHead) ids.push(unit.UnitID);
    }
    return ids;
  }, [allUnits, unitById, selectedDeploymentIds]);

  // Capture selectedDeploymentIds in a ref so the dry-run effect can reference it
  // without re-triggering on every selection change.
  const selectedDeploymentIdsRef = useRef(selectedDeploymentIds);
  selectedDeploymentIdsRef.current = selectedDeploymentIds;

  // Fetch dry-run: loading skeletons on first fetch per unit, silent refresh after
  useEffect(() => {
    if (upgradeableUnitIds.length === 0) return;

    const newIds = upgradeableUnitIds.filter((id) => !fetchedDryRunIds.current.has(id));
    const showLoading = newIds.length > 0;

    if (showLoading) {
      for (const id of newIds) fetchedDryRunIds.current.add(id);
      setDryRunPendingIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.add(id);
        return next;
      });
    }

    // `where` is a URL query param even on this PATCH endpoint (the
    // generated client puts it in `params`, not the body), so a wide graph
    // can overflow the same 8192-byte limit as any GET — split into batches
    // and merge. Each batch is an independent, self-contained dry run (one
    // unit's upgrade preview never depends on another's), so `Promise.allSettled`
    // applies every batch that succeeds even if a sibling batch fails.
    Promise.allSettled(
      batchIds(upgradeableUnitIds).map((batch) =>
        dryRunPatch({
          upgrade: true,
          dryRun: true,
          where: `UnitID IN (${batch.map((id) => `'${id}'`).join(',')})`,
          // A dry run stores nothing, so the configuration it would produce comes back on the
          // response only when asked for. It is what this preview diffs against.
          include: 'ConfigData',
          // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
          body: JSON.stringify({}),
        }).unwrap(),
      ),
    ).then((settled) => {
      const results: UnitCreateOrUpdateResponseRead[] = [];
      let anyFailed = false;
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          results.push(...outcome.value);
        } else {
          anyFailed = true;
        }
      }
      if (results.length > 0) {
        setDryRunData((prev) => {
          const next = new Map(prev);
          for (const r of results) {
            const uid = r.Unit?.UnitID;
            const data = r.ConfigData;
            if (uid && data) next.set(uid, data);
          }
          return next;
        });
        setDryRunConflicts((prev) => {
          const next = new Map(prev);
          for (const r of results) {
            const uid = r.Unit?.UnitID;
            if (uid && r.Conflicts && r.Conflicts.length > 0) next.set(uid, r.Conflicts);
          }
          return next;
        });
      }
      if (anyFailed) {
        const failedReason = settled.find(
          (o): o is PromiseRejectedResult => o.status === 'rejected',
        )?.reason;
        console.warn('Dry-run upgrade preview failed:', failedReason);
        const detail = getApiErrorMessage(failedReason);
        const entry = { title: 'Upgrade preview failed', detail, timestamp: new Date() };
        setErrorsForDeployments(selectedDeploymentIdsRef.current, entry);
      }
      if (showLoading) {
        setDryRunPendingIds((prev) => {
          const next = new Set(prev);
          for (const id of newIds) next.delete(id);
          return next;
        });
      }
    });
  }, [upgradeableUnitIds, dryRunPatch, setErrorsForDeployments]);

  const isDryRunLoading = dryRunPendingIds.size > 0;

  // Per-node "dry run settled" signal: true when the selected node has no
  // upgradable units, or when every upgradable unit has been fetched and is no
  // longer pending. Reading fetchedDryRunIds.current during render is safe: the
  // ref is populated synchronously (before the awaited dry-run call) in the same
  // block that sets dryRunPendingIds, and the settled false->true transition
  // always coincides with a dryRunPendingIds state change that re-renders.
  const dryRunSettled =
    upgradeableUnitIds.length === 0 ||
    upgradeableUnitIds.every((id) => fetchedDryRunIds.current.has(id) && !dryRunPendingIds.has(id));

  // Build target name map (Labels.DisplayName ?? Slug) for displaying target
  // labels above deployment nodes.
  const targetNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of targets) {
      const tid = t.Target?.TargetID;
      if (tid) m.set(tid, t.Target?.Labels?.DisplayName || t.Target?.Slug || tid);
    }
    return m;
  }, [targets]);

  // Build target annotation map so component cards can surface external deep
  // links from `URL-*` annotations (e.g. URL-TargetUI).
  const targetAnnotationsById = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const t of targets) {
      const tid = t.Target?.TargetID;
      const annotations = t.Target?.Annotations;
      if (tid && annotations) m.set(tid, annotations);
    }
    return m;
  }, [targets]);

  const { deployments, stages } = useMemo(
    () =>
      buildComponentData(
        spaces,
        allUnits,
        unitById,
        targetNameById,
        targetAnnotationsById,
      ),
    [spaces, allUnits, unitById, targetNameById, targetAnnotationsById],
  );

  // Map deployment ID → display name, used by entry builders.
  const deploymentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of deployments) m.set(d.deploymentId, d.displayName);
    return m;
  }, [deployments]);

  // ── Release (publish/withdraw) ──
  // Single-select id (deploymentId == SpaceID), same pattern as selectedSpaceUrl above.
  const selectedDeploymentId: string | undefined = selectedDeploymentIds.values().next().value;
  const selectedDeployment = useMemo(
    () => (selectedDeploymentId ? deployments.find((d) => d.deploymentId === selectedDeploymentId) : undefined),
    [selectedDeploymentId, deployments],
  );

  const handleReleaseError = useCallback(
    (entry: { title: string; detail: string; timestamp: Date }) => {
      if (!selectedDeploymentId) return;
      setErrorsForDeployments(new Set([selectedDeploymentId]), entry);
    },
    [selectedDeploymentId, setErrorsForDeployments],
  );

  const handleReleaseSuccess = useCallback(
    (message: string) => {
      if (!selectedDeploymentId) return;
      flashSuccess(new Set([selectedDeploymentId]), message);
    },
    [selectedDeploymentId, flashSuccess],
  );

  // Bundled into ONE object (not flat props) — passed to the side pane as a
  // single `release` prop (it's a shallow-compare memo()). See useReleaseActions.ts.
  const releaseActions = useReleaseActions({
    spaceId: selectedDeploymentId,
    releaseTargetId: selectedDeployment?.releaseTargetId,
    onError: handleReleaseError,
    onSuccess: handleReleaseSuccess,
  });

  const releasingDeploymentIds = useMemo(
    () => (releaseActions.isReleasing && selectedDeploymentId ? new Set([selectedDeploymentId]) : EMPTY_SET),
    [releaseActions.isReleasing, selectedDeploymentId, EMPTY_SET],
  );

  // ── Per-node release chip (U5a) — the DAG's "graph-forward" signature move ──
  // Cross-space: unlike useReleaseActions' history query (selected Space
  // only), every release-enabled node's header chip needs ITS OWN latest
  // release, so this queries the cross-space release endpoint narrowed to
  // just the release-enabled Space IDs and just the fields the chip renders.
  const releaseEnabledSpaceIds = useMemo(
    () => deployments.filter((d) => d.releaseTargetId).map((d) => d.deploymentId),
    [deployments],
  );
  // Stable primitive key: `deployments` is rebuilt on every allUnits poll
  // tick, but the SET of release-enabled Space IDs rarely changes — this
  // keeps the query-arg object below from getting a new reference (and
  // refiring) on every poll.
  const releaseEnabledSpaceIdsKey = useMemo(
    () => releaseEnabledSpaceIds.slice().sort().join(','),
    [releaseEnabledSpaceIds],
  );
  // A whole-org node can have more release-enabled Spaces than fit in one
  // GET query string, same reasoning as the units batching above — split
  // and merge rather than risk a silently-truncated `where` clause.
  const releaseSpaceIdBatchArgs = useMemo(
    () =>
      batchIds(releaseEnabledSpaceIdsKey ? releaseEnabledSpaceIdsKey.split(',') : []).map(
        (batch): ListAllReleasesApiArg => ({
          // Published = true excludes withdrawn Releases — Withdraw only clears
          // this flag, it doesn't delete the row (internal/core/release_core.go
          // Withdraw vs Delete). Without this filter a withdrawn Release could
          // still read as "latest" on the node's rel-N chip even though the
          // pane's own release history (useReleaseActions.ts, same filter)
          // correctly no longer shows it as active.
          where: `SpaceID IN (${batch.map((id) => `'${id}'`).join(',')}) AND Published = true`,
          select: 'ReleaseID,ReleaseNum,SpaceID,CreatedAt',
        }),
      ),
    [releaseEnabledSpaceIdsKey],
  );
  const { data: allReleasesData, subscriptions: releaseSubscriptions } = useBatchedQuery<
    ListAllReleasesApiArg,
    ExtendedReleaseRead
  >(releaseSpaceIdBatchArgs, useListAllReleasesQuery, { resetKey: graphKey });
  const latestReleaseBySpaceId = useMemo(() => {
    const m = new Map<string, { num: number; createdAt?: string }>();
    for (const r of allReleasesData ?? []) {
      const sid = r.Release?.SpaceID;
      const num = r.Release?.ReleaseNum;
      if (!sid || num == null) continue;
      const existing = m.get(sid);
      if (!existing || num > existing.num) {
        m.set(sid, { num, createdAt: r.Release?.CreatedAt });
      }
    }
    return m;
  }, [allReleasesData]);

  // Edge pulse toward the next stage, fired once when the selected node's
  // release list gets a genuinely NEW (recently-created) latest entry — see
  // useFreshSignal for why this is not simply "latestRelease changed."
  const isReleaseJustPublished = useFreshSignal(
    releaseActions.latestRelease?.Release?.ReleaseID,
    releaseActions.latestRelease?.Release?.CreatedAt,
    2000,
  );
  const releasePulseSourceId = isReleaseJustPublished ? (selectedDeploymentId ?? null) : null;

  // One-shot pan to the initial focus deployment once the graph nodes exist
  // (triggered by the ?space= deep-link from the activity feed). Gating on
  // deployments.length > 0 ensures ComponentFlowGraph's focusTrigger effect
  // finds the node in nodesRef — on a cold cache the units API may not have
  // returned by 350ms, so a mount-only timer fires into an empty graph and
  // the focusTrigger effect silently no-ops (its deps don't include nodes,
  // so it never re-runs when nodes later populate). The ref captures the prop
  // at mount time so re-renders after the parent strips ?space= do not matter.
  // The once-guard (initialFocusFiredRef) ensures it fires exactly once even
  // though the effect re-runs as deployments.length changes.
  const initialFocusDeploymentIdRef = useRef(initialFocusDeploymentId);
  const initialFocusFiredRef = useRef(false);
  useEffect(() => {
    if (initialFocusFiredRef.current) return;
    const focusId = initialFocusDeploymentIdRef.current;
    if (!focusId || deployments.length === 0) return;
    initialFocusFiredRef.current = true;
    const timer = setTimeout(() => {
      setFocusTrigger({ deploymentId: focusId });
    }, 350);
    return () => clearTimeout(timer);
  }, [deployments.length]);

  // ── Variant composer derived data ──
  const flatTargets = useMemo<TargetRead[]>(
    () => targets.flatMap((t) => (t.Target ? [t.Target] : [])),
    [targets],
  );

  // A mixed-Component node graph has no one Component, so "create variant"
  // derives its target Component from the PARENT node the composer is
  // anchored to, not from the whole graph. Sibling names come from EVERY
  // page Space of that Component (`componentSpaces`, unfiltered), not from
  // `spaces` (the current node graph) — a sibling variant can sit in a
  // different bucket, or a different node graph entirely, when grouped by
  // something other than Component.
  const { slugById } = useComponentSlugs();
  const composerParentComponent = useMemo(() => {
    if (!composerParentId) return null;
    const parentSpace = spaces.find((s) => s.Space?.SpaceID === composerParentId);
    return spaceComponentSlug(parentSpace?.Space, slugById) ?? null;
  }, [composerParentId, spaces, slugById]);

  const siblingVariantNames = useMemo(() => {
    if (!composerParentComponent) return EMPTY_STRING_ARRAY;
    return getSiblingVariantNames(
      componentSpaces.filter((s) => spaceComponentSlug(s.Space, slugById) === composerParentComponent),
    );
  }, [composerParentComponent, componentSpaces, slugById]);

  const componentSlug = useMemo(
    () => sanitizeVariantSlug(composerParentComponent ?? ''),
    [composerParentComponent],
  );

  // Compute upstream info for the composer's current parent. Unlike the old
  // pane, the composer is a ReactFlow node that unmounts the instant
  // composerParentId clears (no exit animation to keep stale data alive
  // for), so this doesn't need the old "stable ref" treatment.
  const composerUpstreamInfo = useMemo(() => {
    if (!composerParentId) return null;
    const deployment = deployments.find((d) => d.deploymentId === composerParentId);
    if (!deployment) return null;
    const units = unitsByDeployment.get(composerParentId) ?? [];
    const hasK8sUnits = units.some((u) => isYamlToolchain(u.toolchainType));
    return {
      spaceId: composerParentId,
      slug: deployment.slug,
      displayName: deployment.displayName,
      hasK8sUnits,
      // Step 2's per-space completeness check (useCreateVariantMutation.ts,
      // §4 of the plan) compares each destination's successful-unit count
      // against this — the count of source units Step 2's `where` will
      // actually match. All destination spaces clone from this SAME
      // upstream space, so it's one number, not per-space.
      unitCount: units.length,
    };
  }, [composerParentId, deployments, unitsByDeployment]);

  // Compute upgrade entries for all selected deployments
  const upgradeEntries = useMemo(() => {
    if (selectedDeploymentIds.size === 0) return [];

    const activeUpgrades = new Set<string>();
    for (const did of selectedDeploymentIds) {
      const d = deployments.find((d) => d.deploymentId === did);
      if (d?.parentDeploymentId) {
        activeUpgrades.add(arrowKey(d.parentDeploymentId, did));
      }
    }

    return buildUpgradeEntries(activeUpgrades, allUnits, unitById, deploymentNameById, dryRunData, dryRunConflicts, dataAccessors)
      .filter((e) => !dryRunPendingIds.has(e.unitId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeploymentIds, deployments, allUnits, unitById, deploymentNameById, dryRunData, dryRunConflicts, dryRunPendingIds, dataAccessors]);

  // Compute all apply entries including gated (for side pane display)
  const allApplyEntries = useMemo(() => {
    if (selectedDeploymentIds.size === 0) return [];
    return buildAllApplyEntries(allUnits, Array.from(selectedDeploymentIds), deploymentNameById, dataAccessors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeploymentIds, allUnits, deploymentNameById, dataAccessors]);

  // Compute variation entries (environment differences between upstream and downstream)
  const variationEntries = useMemo(() => {
    if (selectedDeploymentIds.size === 0) return [];
    return buildVariationEntries(Array.from(selectedDeploymentIds), allUnits, unitById, deploymentNameById, dryRunData, dataAccessors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeploymentIds, allUnits, unitById, deploymentNameById, dryRunData, dataAccessors]);

  // ── Handlers ──

  // Latest-value ref for the Space settings sheet's dirty state, reported up
  // from ComponentSidePane (ComponentSidePane.tsx's onSettingsDirtyChange).
  // A ref, not state: this is read only inside the click handlers below, at
  // the moment of the click, and doesn't need to trigger a re-render of its
  // own — mirrors selectedDeploymentIdsRef's existing pattern just above.
  //
  // WHY THIS LIVES HERE, NOT JUST IN ComponentSidePane: switching nodes,
  // closing the pane, or opening the inline composer all change
  // `selectedDeploymentIds`, which changes the settings sheet's `key` prop
  // one level down — React unmounts the OLD sheet as part of the SAME
  // commit that applies the new selection, before any effect inside
  // ComponentSidePane could react. The only place that can actually BLOCK
  // the change is here, where the selection change originates. (The cog's
  // own toggle is a same-component synchronous handler and guards itself
  // directly inside ComponentSidePane; every other route funnels through
  // changeSelection below.)
  const isSpaceSettingsDirtyRef = useRef(false);
  const handleSettingsDirtyChange = useCallback((dirty: boolean) => {
    isSpaceSettingsDirtyRef.current = dirty;
  }, []);

  /**
   * Every call site that changes `selectedDeploymentIds` must go through
   * this — never call `onSelectedDeploymentIdsChange` directly — so a
   * dirty Space settings sheet is never silently discarded by a node switch
   * or a pane close. Confirming here means "yes, discard it"; the ref is
   * cleared immediately so a second guarded call in the same tick (there
   * isn't one today, but the invariant should hold regardless) can't
   * re-prompt for a sheet that already agreed to close.
   */
  const changeSelection = useCallback(
    (next: Set<string>) => {
      if (isSpaceSettingsDirtyRef.current) {
        if (!window.confirm('Discard unsaved Space settings changes?')) return;
        isSpaceSettingsDirtyRef.current = false;
      }
      onSelectedDeploymentIdsChange?.(next);
    },
    [onSelectedDeploymentIdsChange],
  );

  const handleDeploymentToggle = useCallback((deploymentId: string) => {
    if (composerParentId != null) {
      // If a variant clone is in-flight, ignore navigation.
      const phase = composerPhaseRef.current;
      if (phase === 'inFlight') return;
      // Otherwise close the composer and show the clicked node's info.
      setComposerParentId(null);
      changeSelection(new Set([deploymentId]));
      return;
    }
    if (selectedDeploymentIds.has(deploymentId)) {
      changeSelection(new Set());
    } else {
      changeSelection(new Set([deploymentId]));
    }
  }, [composerParentId, selectedDeploymentIds, changeSelection]);

  /**
   * Shift- or modifier-click on a node: add it to, or take it out of, the
   * comparison the side pane is showing.
   *
   * This is the second way in. The first is the dashed square in the selector
   * row; this one exists because the graph is where the user is already looking
   * when they decide two deployments are worth reading side by side.
   *
   * Clicking the deployment the pane is ALREADY open on does nothing: slot A is
   * the pane's own deployment and is not a slot the user gives away by accident.
   */
  const handleDeploymentCompareToggle = useCallback(
    (deploymentId: string) => {
      const openId = selectedDeploymentIds.values().next().value as string | undefined;
      if (!openId) {
        // Nothing is open yet, so there is no deployment to compare against.
        // Open the node instead of silently doing nothing.
        changeSelection(new Set([deploymentId]));
        return;
      }
      if (deploymentId === openId) return;
      const next = compareDeploymentIds.includes(deploymentId)
        ? compareDeploymentIds.filter((id) => id !== deploymentId)
        : [...compareDeploymentIds, deploymentId];
      onCompareSelectionChange?.([openId, ...next]);
    },
    [selectedDeploymentIds, compareDeploymentIds, onCompareSelectionChange, changeSelection],
  );

  // Non-toggling "open this deployment on this tab", used by the status-chip
  // peeks. Unlike handleDeploymentToggle, re-invoking on the already-open node
  // never closes it — it just (re)focuses the requested tab via the nonce.
  const handleOpenTab = useCallback(
    (deploymentId: string, tab: 'config' | 'releases', releaseNum?: number) => {
      if (composerParentId != null) {
        const phase = composerPhaseRef.current;
        if (phase === 'inFlight') return;
        setComposerParentId(null);
      }
      changeSelection(new Set([deploymentId]));
      setTabFocus((prev) => ({ id: deploymentId, tab, nonce: (prev?.nonce ?? 0) + 1, releaseNum }));
    },
    [composerParentId, changeSelection],
  );

  const handleClose = useCallback(() => {
    changeSelection(new Set());
  }, [changeSelection]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (composerParentId != null) {
        // Phase is read from a stable ref — no need to list it in deps.
        const phase = composerPhaseRef.current;
        if (phase === 'inFlight') {
          // Dismissal locked while a step is in-flight.
          return;
        }
        // Composer unlocked: close it; preserve the upstream selection.
        setComposerParentId(null);
      } else if (selectedDeploymentIds.size > 0) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    composerParentId,
    selectedDeploymentIds,
    handleClose,
  ]);

  // Commit ONE unit's STAGED upgrade batch in a single network call (true-staging).
  // - 'upgrade-all'  → wholesale `upgrade: true` mutation for the unit
  // - 'patch-data'   → ONE data upload with the section-merged configuration
  // Returns true on success so the section can clear its staged set.
  //
  // upgradingDeploymentIds is populated here but — on SUCCESS — deliberately NOT
  // cleared here. Clearing it synchronously (the old behavior) raced ahead of the
  // `invalidatesTags:['Unit']` refetch that bulkPatch triggers: the button/graph
  // would drop back to "idle" before the graph/panel had actually re-rendered with
  // the new data. Instead the settle-detector effect further down clears it once
  // the refetched data shows this commit actually landed (see
  // upgradeSettleTargetsRef, populated below). On FAILURE there's nothing to
  // settle, so it's cleared immediately here instead.
  const handleCommitStaged = useCallback(
    async (unitId: string, spaceId: string, payload: StagedCommitPayload): Promise<boolean> => {
      const preCommitHead = unitById.get(unitId)?.Unit?.HeadRevisionNum ?? 0;
      upgradeSettleTargetsRef.current.set(unitId, { spaceId, preCommitHead });
      setUpgradingDeploymentIds((prev) => new Set([...prev, spaceId]));
      try {
        if (payload.kind === 'upgrade-all') {
          await bulkPatch({
            where: `UnitID='${unitId}'`,
            upgrade: true,
            // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
            body: JSON.stringify({}),
          }).unwrap();
        } else {
          // Configuration goes to the Unit's data endpoint. A Unit body has nowhere to put
          // one, so a PATCH carrying Data would report success and write nothing.
          await uploadUnitData({ spaceId, unitId, body: payload.data }).unwrap();
        }
        setDeploymentErrors((prev) => {
          if (!prev.has(spaceId)) return prev;
          const next = new Map(prev);
          next.delete(spaceId);
          return next;
        });
        // Force a fresh dry run for EVERY currently-upgradeable unit, not just this
        // one. This commit can change data that a SIBLING unit's own dry-run merge
        // preview was computed against (e.g. this unit is itself the upstream of
        // another selected unit), and a wholesale upgrade can also change which
        // paths this same unit still has upgradable. Narrowly clearing only
        // `unitId`'s cache entry (the previous behavior) left every OTHER unit's
        // now-stale merge preview cached indefinitely: the dry-run effect only
        // re-issues `dryRunPatch` when `upgradeableUnitIds` gets a new array
        // reference, which doesn't by itself invalidate cached preview CONTENT for
        // ids it already had. A full reset makes every currently-upgradeable id
        // "new" again so the next dry-run effect run recomputes all of them.
        fetchedDryRunIds.current.clear();
        setDryRunData(new Map());
        setDryRunConflicts(new Map());
        flashSuccess(new Set([spaceId]), 'Upgraded');
        return true;
      } catch (err: unknown) {
        upgradeSettleTargetsRef.current.delete(unitId);
        setUpgradingDeploymentIds((prev) => {
          if (!prev.has(spaceId)) return prev;
          const next = new Set(prev);
          next.delete(spaceId);
          return next;
        });
        const detail = getApiErrorMessage(err);
        setErrorsForDeployments(new Set([spaceId]), { title: 'Upgrade failed', detail, timestamp: new Date() });
        return false;
      }
    },
    [bulkPatch, uploadUnitData, flashSuccess, setErrorsForDeployments, unitById],
  );

  // Commit ONE unit's STAGED PROTECTION batch via the dedicated SetUnitProtection
  // endpoint — a SEPARATE revision from handleCommitStaged above (see
  // ComponentValuesSection's commit-signal effect: protection commits FIRST,
  // and never rolled back if a subsequent value write fails). Returns true on
  // success so the section can clear its staged protection set.
  // `invalidatesTags: ['Unit']` on the mutation (confighubapi.gen.ts) means a
  // success here already triggers a refetch of every unit query with that
  // tag, including the lazily-fetched MutationSources query in
  // ComponentSidePane — no manual cache-poking needed here.
  const handleCommitProtection = useCallback(
    async (unitId: string, spaceId: string, protection: ResourceProtection[]): Promise<boolean> => {
      try {
        await setUnitProtection({
          spaceId,
          unitId,
          unitProtectionRequest: { ResourceProtection: protection },
        }).unwrap();
        setDeploymentErrors((prev) => {
          if (!prev.has(spaceId)) return prev;
          const next = new Map(prev);
          next.delete(spaceId);
          return next;
        });
        return true;
      } catch (err: unknown) {
        const detail = getApiErrorMessage(err);
        setErrorsForDeployments(new Set([spaceId]), { title: 'Could not save protection change', detail, timestamp: new Date() });
        return false;
      }
    },
    [setUnitProtection, setErrorsForDeployments],
  );

  // Clear upgradingDeploymentIds once each pending commit's unit shows a newer
  // HeadRevisionNum than it had at commit-time (upgradeSettleTargetsRef, set in
  // handleCommitStaged).
  useEffect(() => {
    if (upgradeSettleTargetsRef.current.size === 0) return;
    const settledSpaceIds = new Set<string>();
    for (const [uid, target] of upgradeSettleTargetsRef.current) {
      const head = unitById.get(uid)?.Unit?.HeadRevisionNum ?? 0;
      if (head > target.preCommitHead) {
        upgradeSettleTargetsRef.current.delete(uid);
        settledSpaceIds.add(target.spaceId);
      }
    }
    if (settledSpaceIds.size === 0) return;
    setUpgradingDeploymentIds((prev) => {
      // A Space can have more than one unit committing at once — only drop it
      // once no remaining pending target still points at it.
      const stillPending = new Set(Array.from(upgradeSettleTargetsRef.current.values(), (v) => v.spaceId));
      let changed = false;
      const next = new Set(prev);
      for (const sid of settledSpaceIds) {
        if (!stillPending.has(sid) && next.delete(sid)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [unitById]);

  // Timeout: clear upgradingDeploymentIds after 30 seconds. This deliberately
  // does NOT surface an error — a commit whose resulting Data
  // happens to be byte-identical to the pre-commit Data can be a genuine no-op
  // that never bumps HeadRevisionNum, which would otherwise leave the settle
  // detector waiting on a revision bump that's never coming and polling the
  // ~14MB units query indefinitely. Silently stopping the settle-wait after 30s
  // is the safety net; the graph/panel are already showing correct data in that
  // no-op case, so there's nothing to warn about.
  const upgradeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (upgradingDeploymentIds.size === 0) {
      if (upgradeTimeoutRef.current) {
        clearTimeout(upgradeTimeoutRef.current);
        upgradeTimeoutRef.current = null;
      }
      return;
    }
    const timedOutSpaceIds = new Set(upgradingDeploymentIds);
    upgradeTimeoutRef.current = setTimeout(() => {
      upgradeTimeoutRef.current = null;
      for (const [uid, target] of upgradeSettleTargetsRef.current) {
        if (timedOutSpaceIds.has(target.spaceId)) upgradeSettleTargetsRef.current.delete(uid);
      }
      setUpgradingDeploymentIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const sid of timedOutSpaceIds) next.delete(sid);
        return next.size === prev.size ? prev : next;
      });
    }, 30_000);
    return () => {
      if (upgradeTimeoutRef.current) {
        clearTimeout(upgradeTimeoutRef.current);
        upgradeTimeoutRef.current = null;
      }
    };
  }, [upgradingDeploymentIds]);

  // Only show upgrade spinner when the *selected* deployment is upgrading
  const isUpgrading = useMemo(() => {
    for (const sid of selectedDeploymentIds) {
      if (upgradingDeploymentIds.has(sid)) return true;
    }
    return false;
  }, [selectedDeploymentIds, upgradingDeploymentIds]);

  // ── Callbacks for side pane ──
  const handleResizeStart = useCallback(() => setIsSidePaneResizing(true), []);
  const handleResizeEnd = useCallback(() => setIsSidePaneResizing(false), []);
  // ── Inline variant composer handlers ──
  // Opens (or retargets) the composer. Ignored while a mutation is in-flight
  // for whatever parent is currently open — same guard shape as
  // handleDeploymentToggle/handleOpenTab above. Switching to a different
  // parent while idle resets the hook so the new composer starts clean.
  const handleComposerOpen = useCallback(
    (deploymentId: string) => {
      const phase = composerPhaseRef.current;
      if (composerParentId != null && phase === 'inFlight') return;
      if (composerParentId !== deploymentId) composerVariant.reset();
      setComposerParentId(deploymentId);
      // The composer is a peer of the side pane, not a replacement for it —
      // close any open side pane so it doesn't sit there showing an
      // unrelated (or stale) deployment's details while the composer is up.
      // Routed through changeSelection, not called directly, so opening the
      // composer on a dirty Space settings sheet prompts instead of silently
      // discarding the draft.
      changeSelection(new Set());
    },
    [composerParentId, composerVariant, changeSelection],
  );

  const handleComposerClose = useCallback(() => {
    const phase = composerPhaseRef.current;
    if (phase === 'inFlight') return;
    setComposerParentId(null);
    composerVariant.reset();
  }, [composerVariant]);

  const handleComposerSubmit = useCallback(
    (values: ComposerSubmitValues) => {
      if (!composerUpstreamInfo) return;
      composerVariant.submit({
        upstreamSpaceId: composerUpstreamInfo.spaceId,
        upstreamUnitWhere: `SpaceID='${composerUpstreamInfo.spaceId}'`,
        variantNames: values.variantNames,
        targetId: values.targetId,
        namespace: values.namespace,
        hasK8sUnits: composerUpstreamInfo.hasK8sUnits,
        expectedUnitCount: composerUpstreamInfo.unitCount,
      });
    },
    [composerUpstreamInfo, composerVariant],
  );

  // A fully successful create needs nothing further from the composer — the
  // new node(s) appear via the hook's own invalidateTags, same as any other
  // added node — so close it the moment EVERY requested name reaches
  // 'success'. `overallPhase === 'partialFailure'` covers any mix where at
  // least one name didn't make it (collision, unit-clone failure, namespace
  // failure) — that deliberately does NOT auto-close: the user needs to see
  // which one(s) and retry/dismiss.
  const composerOverallPhase = composerVariant.overallPhase;
  const composerReset = composerVariant.reset;
  const composerPerSpaceStatus = composerVariant.perSpaceStatus;
  useEffect(() => {
    if (composerOverallPhase === 'success') {
      // Focus the first created variant once it exists. Set BEFORE
      // composerReset() clears perSpaceStatus, and BEFORE the new Space has
      // even round-tripped back through the deployments query — passing a
      // not-yet-existing target down is what lets ComponentFlowGraph's own
      // structural-change effect see it coming and suppress the generic
      // fit-to-everything for that arrival instead of fighting this pan.
      const firstSpaceId = [...composerPerSpaceStatus.values()].find((s) => s.spaceId)?.spaceId;
      setComposerParentId(null);
      composerReset();
      if (firstSpaceId) setFocusTrigger({ deploymentId: firstSpaceId });
    }
  }, [composerOverallPhase, composerReset, composerPerSpaceStatus]);
  const handleClearError = useCallback(() => {
    setDeploymentErrors((prev) => {
      const next = new Map(prev);
      for (const id of selectedDeploymentIds) next.delete(id);
      return next;
    });
  }, [selectedDeploymentIds]);

  // Persist a computed field mutation: record a per-deployment error if the
  // mutation couldn't be applied or the write fails, otherwise PUT the configuration
  // to the unit's data endpoint. `errorTitle` distinguishes a value update from a revert.
  const applyFieldPatch = useCallback(async (unitId: string, spaceId: string, result: SetValueResult, errorTitle: string) => {
    const recordError = (detail: string) => setDeploymentErrors((prev) => {
      const next = new Map(prev);
      next.set(spaceId, { title: errorTitle, detail, timestamp: new Date() });
      return next;
    });
    if (!result.ok) {
      recordError(result.message);
      return;
    }
    try {
      await uploadUnitData({ spaceId, unitId, body: result.data }).unwrap();
    } catch (err: unknown) {
      recordError(getApiErrorMessage(err));
      throw err;
    }
  }, [uploadUnitData]);

  const handleSaveData = useCallback(async (unitId: string, spaceId: string, newEncodedData: string) => {
    await applyFieldPatch(unitId, spaceId, { ok: true as const, data: newEncodedData }, 'Save failed');
  }, [applyFieldPatch]);

  // Persist a unit's Labels/Annotations from the inline unit details pane. Uses
  // useUpdateUnitMutation with the full Unit body + Version (the canonical
  // metadata edit path, as on the unit dashboard) so the supplied maps fully
  // REPLACE the stored ones — this supports removing keys, which a JSON
  // merge-patch on the map would not. The full body comes from the cached
  // getUnit response (already fetched by the details pane).
  const handleUpdateUnitMeta = useCallback(
    async (unitId: string, spaceId: string, patch: UnitMetaPatch): Promise<boolean> => {
      try {
        const extended = await getUnit({ spaceId, unitId }).unwrap();
        const currentUnit = extended.Unit;
        if (!currentUnit) throw new Error('Unit not found');
        await updateUnit({
          spaceId,
          unitId,
          unit: {
            ...currentUnit,
            ...(patch.Labels !== undefined ? { Labels: patch.Labels } : {}),
            ...(patch.Annotations !== undefined ? { Annotations: patch.Annotations } : {}),
          },
        }).unwrap();
        setDeploymentErrors((prev) => {
          if (!prev.has(spaceId)) return prev;
          const next = new Map(prev);
          next.delete(spaceId);
          return next;
        });
        flashSuccess(new Set([spaceId]), 'Updated');
        return true;
      } catch (err: unknown) {
        const detail = getApiErrorMessage(err);
        setErrorsForDeployments(new Set([spaceId]), { title: 'Update failed', detail, timestamp: new Date() });
        return false;
      }
    },
    [getUnit, updateUnit, flashSuccess, setErrorsForDeployments],
  );

  const recordFieldError = useCallback((spaceId: string, title: string, detail: string) => {
    setDeploymentErrors((prev) => {
      const next = new Map(prev);
      next.set(spaceId, { title, detail, timestamp: new Date() });
      return next;
    });
  }, []);

  // Wire set-attributes server-side field mutation with optimistic overlay.
  const { fieldOverlay, handleSetFieldValue, handleDeleteFieldValue } = useSetAttributesMutation({
    allUnits,
    unitById,
    applyFieldPatch,
    recordFieldError,
  });


  // ── Dashboard view ──
  // Renders before the Units error/loading gates below: the Dashboard is the
  // overview (KPI header, matrix, activity feed) scoped to this node's own
  // `spaces` — the same component the Overview root renders, with a narrower
  // Space set — and needs none of this view's own Units batches to do it.
  // `FlowViewControl` stays mounted here too (not just in the graph branch
  // further down) so Graph stays clickable to leave the Dashboard.
  if (displayMode === 'dashboard') {
    return (
      <Container>
        <FlowViewControl value="dashboard" onChange={handleFlowViewControlChange} />
        <ComponentOverviewMatrix spaces={spaces} onComponentSelect={onComponentSelect} />
      </Container>
    );
  }

  // Mounted in every branch below (error, loading, success) so the batch
  // subscriptions stay alive regardless of which one renders — an extra or
  // upstream batch erroring or still loading must not unmount and lose its
  // own subscription's cache/poll just because the PRIMARY batch's state
  // happens to gate a different branch this render.
  const batchSubscriptions = (
    <>
      {extraUnitsSubscriptions}
      {upstreamUnitsSubscriptions}
      {releaseSubscriptions}
    </>
  );

  // ── Error state ──
  if (unitsError || extraBatchesError || upstreamBatchesError) {
    const firstError = unitsQueryError ?? extraBatchesErrors[0] ?? upstreamBatchesErrors[0];
    return (
      <>
        {batchSubscriptions}
        <LoadingContainer>
          <Alert severity="error">
            {getApiErrorMessage(firstError) || 'Failed to load units. Please try again.'}
          </Alert>
        </LoadingContainer>
      </>
    );
  }

  // ── Loading state ──
  // Content-shaped graph placeholder. Only the initial load reaches here
  // (`unitsLoading` is isLoading / first-fetch, never a background refetch), so
  // the skeleton cannot flash over an already-painted graph. No side-pane
  // placeholder: the pane only mounts after a node is selected, and its Slide
  // is driven by `prevGraphKeyRef` — nothing here participates in that path.
  if (unitsLoading) {
    return (
      <>
        {batchSubscriptions}
        <Container>
          <GraphPane>
            <GraphArea>
              <ComponentFlowGraphSkeleton />
            </GraphArea>
          </GraphPane>
        </Container>
      </>
    );
  }

  return (
    <>
      {batchSubscriptions}
      <Container>
      <GraphPane ref={graphPaneRef}>
        <GraphArea>
          {/* Inside the canvas column, not over the whole view: the side pane
              sits to the right of it, and a control floated over the full
              width would cover the pane header's buttons (the settings cog). */}
          <FlowViewControl value="graph" onChange={handleFlowViewControlChange} />
          <ComponentFlowGraph
            deployments={deployments}
            stages={stages}
            selectedDeploymentIds={selectedDeploymentIds}
            compareLetterById={compareLetterById}
            onDeploymentCompareToggle={handleDeploymentCompareToggle}
            onDeploymentToggle={handleDeploymentToggle}
            onOpenTab={handleOpenTab}
            graphKey={graphKey}
            errorDeploymentIds={errorDeploymentIds}
            unitSummariesByDeployment={unitSummariesByDeployment}
            upgradingDeploymentIds={upgradingDeploymentIds}
            deploymentSuccessMessages={deploymentSuccessMessages}
            latestReleaseBySpaceId={latestReleaseBySpaceId}
            releasingDeploymentIds={releasingDeploymentIds}
            releasePulseSourceId={releasePulseSourceId}
            focusTrigger={focusTrigger}
            suppressStructuralFitView={composerParentId != null || composerOverallPhase === 'inFlight'}
            composerParentId={composerParentId}
            onComposerOpen={handleComposerOpen}
            composerData={
              composerUpstreamInfo
                ? {
                    parentSlug: composerUpstreamInfo.slug,
                    componentSlug,
                    siblingVariantNames,
                    targets: flatTargets,
                    hasK8sUnits: composerUpstreamInfo.hasK8sUnits,
                    overallPhase: composerVariant.overallPhase,
                    perSpaceStatus: composerVariant.perSpaceStatus,
                    onSubmit: handleComposerSubmit,
                    onCancel: handleComposerClose,
                    onRetryNamespace: composerVariant.retryNamespace,
                  }
                : undefined
            }
          />
        </GraphArea>

        {/*
          Right-pane slot: the composer now renders inline on the canvas
          (ComponentFlowGraph, above) rather than docked here — this slot is
          just the (retained) ComponentSidePane.
        */}
        <Box
          sx={{
            position: 'relative',
            flexShrink: 0,
            alignSelf: 'stretch',
            width: selectedDeploymentIds.size > 0 ? sidePaneWidth : 0,
          }}
        >
          <Slide
            direction="left"
            in={selectedDeploymentIds.size > 0}
            mountOnEnter
            unmountOnExit
            // On an app/deployment switch, exit instantly (timeout 0) so the pane
            // is gone before the new graph runs fit-to-view; otherwise animate.
            timeout={isGraphSwitch ? 0 : undefined}
          >
            <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
              <ComponentSidePane
                upgradeEntries={upgradeEntries}
                allApplyEntries={allApplyEntries}
                variationEntries={variationEntries}
                deployments={deployments}
                targets={targets}
                unitsByDeployment={unitsByDeployment}
                selectedDeploymentIds={selectedDeploymentIds}
                compareDeploymentIds={compareDeploymentIds}
                onCompareSelectionChange={onCompareSelectionChange}
                isUnitDataFetching={isUnitDataFetching}
                tabFocus={tabFocus}
                width={sidePaneWidth}
                defaultWidth={DEFAULT_SIDE_PANE_WIDTH}
                onWidthChange={setSidePaneWidth}
                layoutRef={graphPaneRef}
                isUpgrading={isUpgrading}
                isDryRunLoading={isDryRunLoading}
                isRefreshing={unitsBackgroundRefreshing}
                hasUpgradableUnits={upgradeableUnitIds.length > 0}
                dryRunSettled={dryRunSettled}
                dryRunPendingIds={dryRunPendingIds}
                isResizing={isSidePaneResizing}
                onResizeStart={handleResizeStart}
                onResizeEnd={handleResizeEnd}
                error={sidePaneError}
                onClearError={handleClearError}
                successMessage={sidePaneSuccessMessage}
                filterUrl={selectedSpaceUrl}
                onClose={handleClose}
                onCreateVariant={handleComposerOpen}
                fieldOverlay={fieldOverlay}
                onSetFieldValue={handleSetFieldValue}
                onDeleteFieldValue={handleDeleteFieldValue}
                onSaveData={handleSaveData}
                onCommitStaged={handleCommitStaged}
                onCommitProtection={handleCommitProtection}
                onUpdateUnitMeta={handleUpdateUnitMeta}
                onFocusDeployment={handleFocusDeployment}
                onSettingsDirtyChange={handleSettingsDirtyChange}
                release={releaseActions}
              />
            </div>
          </Slide>
        </Box>
      </GraphPane>
    </Container>
    </>
  );
});

AppComponentView.displayName = 'AppComponentView';
