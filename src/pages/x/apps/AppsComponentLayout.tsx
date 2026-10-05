// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { spaceComponentSlug, useComponentSlugs } from '@/hooks/useComponentSlugs';
import {
  type ExtendedSpaceRead,
  type ExtendedTargetRead,
  type ExtendedViewRead,
} from '@confighub/rtk-query';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';
import { Group, Panel, type PanelSize, Separator, usePanelRef } from 'react-resizable-panels';

import { useGroupByLevels } from '@/pages/unit-list/hooks/useGroupByLevels';
import { readLiveSearchParams } from '@/utility/live-search-params';

import { AppNavigationTree } from './AppNavigationTree';
import { AppComponentView } from './AppComponentView';
import { ComponentOverviewMatrix } from './ComponentOverviewMatrix';
import { ComponentOverviewMatrixSkeleton } from './ComponentOverviewMatrixSkeleton';
import { LABEL_OWNER } from './componentData';
import { type ComponentDisplayMode, type SelectedApp, type ViewParamsPatch } from './appTypes';
import {
  COMPONENT_DEFAULT_LEVELS,
  buildTargetSlugById,
  deriveComponentTreePath,
  filterSpacesByGroupPath,
  getSpaceLabelKeyCounts,
  getSpaceLabelKeys,
  resolveNodeGraphTarget,
} from './componentGroupFields';

/** Stable identity so a bare `/components` render doesn't hand every
 * downstream `useMemo` a brand-new empty Set each time (components.md risk
 * 1: identity, not values — `buildGraph` and `AppComponentView` are memo'd). */
const EMPTY_SELECTION: Set<string> = new Set();

/** Same rule as `EMPTY_SELECTION`, for the comparison's extra slots. */
const EMPTY_COMPARE: string[] = [];

/** Same rule as `EMPTY_SELECTION`, for a closed graph's Space set. */
const EMPTY_SPACES: ExtendedSpaceRead[] = [];

/** Passed to `useGroupByLevels`'s `clearParamsOnEdit` — stable identity so it
 * doesn't churn `handleEditLevels`'s memoization every render. */
const CLEAR_GROUP_PARAM = ['group'];

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const DetailPanelInner = styled(Box)(({ theme }) => ({
  position: 'absolute',
  inset: 0,
  backgroundColor: theme.palette.background.default,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}));

const CollapsedSidebar = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: theme.spacing(1),
  height: '100%',
  backgroundColor: theme.palette.background.paper,
}));

const StyledSeparator = styled(Separator)(({ theme }) => ({
  width: 1,
  backgroundColor: theme.palette.divider,
  position: 'relative',
  transition: 'background-color 0.15s ease',
  '&:hover, &[data-separator-active]': {
    backgroundColor: theme.palette.primary.main,
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -3,
    right: -3,
  },
}));

interface AppsComponentLayoutProps {
  spaces: ExtendedSpaceRead[];
  targets: ExtendedTargetRead[];
  /** True while `spaces` is still the priority-scoped (single-app) set on a `?app=` deep-link,
   * before the org-wide list has resolved — lets the nav tree show a "more loading" affordance
   * instead of silently looking like the requested app is the only one that exists. */
  isLoadingFullAppList?: boolean;
  /** True while the overview matrix's KPI counts (the `summary=true` spaces query) are still
   * in flight. Only the matrix reads those fields, so the nav tree and the component graph
   * render immediately and only this pane waits — as its content-shaped skeleton. */
  isLoadingOverviewCounts?: boolean;
  /** True once the `summary=true` Spaces query has resolved at least once — gates the nav
   * tree's summary-only fields (`UpgradeNeeded`/`UnreleasedChanges`/`Gated`) the same way. */
  isSummaryLoaded?: boolean;
  /**
   * The Components page's active saved view (grouping only), or `null` on
   * the sentinel "All components" tab. Feeds `useGroupByLevels` so a saved
   * view's grouping is restored the same way the Unit list restores
   * `?viewGroupBy=`.
   */
  activeView?: ExtendedViewRead | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const AppsComponentLayout = ({
  spaces,
  targets,
  isLoadingFullAppList = false,
  isLoadingOverviewCounts = false,
  isSummaryLoaded = false,
  activeView = null,
}: AppsComponentLayoutProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const treePanelRef = usePanelRef();
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);

  /**
   * The ONE place the Components view writes to the URL. `null` deletes a
   * param, `undefined` (an omitted key) leaves it untouched, and an array
   * (only `group` uses this) replaces every entry for that key atomically —
   * the repeated-`group=` convention the Unit list also uses. Every write
   * defaults to `{ replace: true }`; pass `{ push: true }` for a real
   * navigation (opening a different Component) so Back stays a kept
   * affordance instead of spamming history for in-page gestures.
   *
   * Merges over the LIVE URL, not the updater's `prev`: React Router passes
   * the render-time params as `prev`, which can trail (or, from an
   * uncommitted render, lead) the address bar — see `readLiveSearchParams`.
   * Merging over a stale `prev` would write an outdated query string back.
   */
  const updateParams = useCallback(
    (patch: ViewParamsPatch, options?: { push?: boolean }) => {
      setSearchParams(
        () => {
          const next = readLiveSearchParams();
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) continue;
            if (value === null) {
              next.delete(key);
            } else if (Array.isArray(value)) {
              next.delete(key);
              for (const v of value) {
                if (v) next.append(key, v);
              }
            } else {
              next.set(key, value);
            }
          }
          return next;
        },
        { replace: !options?.push },
      );
    },
    [setSearchParams],
  );

  // Spaces that belong to a Component (deployment spaces, not infra spaces)
  // and whose Component's Slug has loaded. Until the Components list
  // arrives a Space has no Component name to group, open, or link by, so it
  // is left out rather than shown in a misleading `(empty)` Component
  // bucket — the same rule the overview matrix applies.
  const { slugById } = useComponentSlugs();
  const appSpaces = useMemo(
    () => spaces.filter((s) => spaceComponentSlug(s.Space, slugById) !== undefined),
    [spaces, slugById],
  );

  // selectedApp is derived from the URL so browser Back/Forward work correctly
  const selectedApp = useMemo((): SelectedApp | null => {
    const appName = searchParams.get('app');
    if (!appName) return null;
    const space = appSpaces.find((s) => spaceComponentSlug(s.Space, slugById) === appName);
    if (!space) return null;
    return { name: appName, owner: space.Space?.Labels?.[LABEL_OWNER] ?? 'Unassigned' };
  }, [searchParams, appSpaces, slugById]);

  // Get spaces for the selected component. A Component graph always shows
  // its full set of Deployments and upstream DAG — every Space in this
  // Component, not narrowed by whatever the tree happens to be grouped or
  // scrolled to.
  const selectedAppSpaces = useMemo(() => {
    if (!selectedApp) return EMPTY_SPACES;
    return appSpaces.filter((s) => spaceComponentSlug(s.Space, slugById) === selectedApp.name);
  }, [appSpaces, selectedApp, slugById]);

  // ── Grouping levels (URL-first, same architecture as the Unit list) ──────
  const setSelectedGroupsNoop = useCallback(() => {}, []);
  // A raw `window.history.replaceState` call (as `UnitListPage.tsx`'s own
  // `clearGroupUrlParams` uses) is invisible to React Router's DATA router:
  // the router keeps its own model of the URL, synced through its own
  // navigate() calls, not through listening for arbitrary history writes.
  // `handleEditLevels` below calls `setSearchParams` (a real, router-tracked
  // navigation) and then this function in the same synchronous handler — by
  // the time the router's OWN queued update for that `setSearchParams` call
  // actually applies, it starts from ITS `prev` (which never saw our raw
  // write) and writes `group` right back, silently reverting it. This is a
  // no-op here on purpose: `?group=` is instead deleted INSIDE the same
  // `setSearchParams` updater via `clearParamsOnEdit` below, which is the
  // only way to make both changes land in one router-tracked write. The Unit
  // list keeps its own (harmless-for-it) raw-write version unchanged: its
  // tree selection is separate React state, not derived from the URL, so it
  // never actually depended on that write succeeding.
  const clearGroupUrlParams = useCallback(() => {}, []);

  const { localGroupByColumns: levels, handleEditLevels } = useGroupByLevels({
    activeView,
    searchParams,
    setSearchParams,
    setSelectedGroups: setSelectedGroupsNoop,
    clearGroupUrlParams,
    fallbackLevels: COMPONENT_DEFAULT_LEVELS,
    clearParamsOnEdit: CLEAR_GROUP_PARAM,
  });

  // `?group=` is also cleared when the active saved-view tab changes, but
  // NOT here: an effect in this component reacting to `activeView` would run
  // as a setSearchParams call independent of (and racing) the one that just
  // switched the view, from `useQueryBuilder`'s own `useSearchParams()`
  // instance in `AppsComponentPage`. That's `useQueryBuilder`'s
  // `clearParamsOnViewSwitch` option — see `AppsComponentPage.tsx` — which
  // deletes `group` inside the SAME update that sets `viewID`, so both land
  // in one router-tracked write instead of two that can revert each other.

  const groupParam = useMemo(() => searchParams.getAll('group'), [searchParams]);

  const valueCtx = useMemo(
    () => ({ targetSlugById: buildTargetSlugById(targets), isSummaryLoaded, slugById }),
    [targets, isSummaryLoaded, slugById],
  );

  // The tree's highlighted path. Reconciles an open Component graph with
  // `?group=` so the tree never highlights a node that contradicts what's on
  // screen — see `deriveComponentTreePath`'s own doc comment for the exact
  // rule.
  const selectedGroups = useMemo(
    () => deriveComponentTreePath(levels, selectedApp?.name ?? null, groupParam, appSpaces, valueCtx),
    [levels, selectedApp, groupParam, appSpaces, valueCtx],
  );

  // A non-Component node graph's Space set — every Space matching the
  // node's value path. Ignored while `?app=` is set (a whole-Component
  // graph always shows that Component's full Deployment set instead).
  // Empty when `?group=` names a path with no Spaces (a renamed label, a
  // deleted Space) — `isGraphOpen` below then falls back to the overview
  // instead of showing an empty graph.
  const groupGraphSpaces = useMemo(() => {
    if (selectedApp || groupParam.length === 0) return EMPTY_SPACES;
    return filterSpacesByGroupPath(appSpaces, levels, groupParam, valueCtx);
  }, [selectedApp, groupParam, appSpaces, levels, valueCtx]);

  const isGroupGraphOpen = !selectedApp && groupGraphSpaces.length > 0;
  const isGraphOpen = selectedApp !== null || isGroupGraphOpen;

  // The open graph's Space set and identity — a whole Component (`?app=`)
  // or a node graph (`?group=`). `graphKey` replaces a single Component
  // name for `AppComponentView`'s switch-reset and `ComponentFlowGraph`'s
  // `structuralKey`, since a node graph can span several Components and
  // has no one name.
  const graphSpaces = selectedApp ? selectedAppSpaces : groupGraphSpaces;
  const graphKey = selectedApp
    ? `app:${selectedApp.name}`
    : isGroupGraphOpen
      ? `group:${groupParam.join('/')}`
      : '';

  const labelKeys = useMemo(() => getSpaceLabelKeys(appSpaces), [appSpaces]);
  const labelKeyCounts = useMemo(() => getSpaceLabelKeyCounts(appSpaces), [appSpaces]);

  // Deliberately a PUSH, not `{ replace: true }` — out of scope for the
  // replace-everywhere rule, which was answering a question about rapid
  // in-page gestures (node clicks), not switching which component app is
  // open. Selecting a different app is a real navigation; Back undoing it is
  // a kept affordance, not spam.
  //
  // Guarded on actually SWITCHING apps: a re-click of the row that's already
  // open (from the tree, or `handleNodeOpen` resolving back to the SAME
  // Component) would otherwise write the reset unconditionally, silently
  // stomping a deep-linked `?space=`/`?compare=`. Only a genuine switch to a
  // DIFFERENT app should reset them. "Already open" is read from the live URL,
  // not `selectedApp`: this handler can run from a render that has not caught
  // up with the address bar (see `readLiveSearchParams`).
  const handleAppSelect = useCallback(
    (app: SelectedApp) => {
      if (readLiveSearchParams().get('app') === app.name) return;
      // `space`/`compare`/`group` are cleared: opening a different Component
      // starts a fresh graph selection, and a `?group=` node graph is no
      // longer what's on screen. Every `view*` / `filter*` / `type` param is
      // left untouched (functional updater merge, not a param-replacing
      // plain-object `setSearchParams` call). `display` is deliberately
      // OMITTED (not reset), unlike `mode` — the Graph/Dashboard choice is
      // sticky across node clicks until the user picks Auto/Custom
      // themselves (`FlowViewControl`, which does clear it) or returns to
      // Overview (`handleOverviewSelect`, which also clears it).
      updateParams(
        { app: app.name, space: null, compare: null, group: null, graphGroup: null },
        { push: true },
      );
    },
    [updateParams],
  );

  // Any tree node click (any depth, any field) opens a graph —
  // `resolveNodeGraphTarget` decides whether that's a whole Component
  // (`?app=`: every Component-level node, and any node whose Spaces are
  // exactly one whole Component) or a narrower node graph (`?group=`).
  // Overview (`path.length === 0`) is handled by the caller directly.
  const handleNodeOpen = useCallback(
    (path: string[]) => {
      const target = resolveNodeGraphTarget(appSpaces, levels, path, valueCtx);
      if ('app' in target) {
        const ownerSpace = appSpaces.find(
          (s) => spaceComponentSlug(s.Space, slugById) === target.app,
        );
        handleAppSelect({ name: target.app, owner: ownerSpace?.Space?.Labels?.[LABEL_OWNER] ?? 'Unassigned' });
        return;
      }
      // Re-clicking the node that already drives the open group graph is a
      // no-op — matches `handleAppSelect`'s own "same app" guard above, and
      // reads the live URL for the same reason. MUI's tree calls this on a
      // re-click of the selected row, and can call it from an uncommitted
      // render (e.g. a Component graph that Back superseded before it
      // committed); a render-time `selectedApp` there would push a duplicate
      // `?group=` entry.
      const live = readLiveSearchParams();
      const liveGroup = live.getAll('group');
      if (
        !live.get('app') &&
        liveGroup.length === target.group.length &&
        liveGroup.every((v, i) => v === target.group[i])
      ) {
        return;
      }
      // `display` omitted (not reset) here too — see `handleAppSelect`'s
      // comment on why the Graph/Dashboard choice is sticky across node
      // clicks.
      updateParams(
        { app: null, space: null, compare: null, group: target.group, graphGroup: null },
        { push: true },
      );
    },
    [appSpaces, levels, valueCtx, slugById, updateParams, handleAppSelect],
  );

  // ── URL-derived view state ──────────────────────────────────────────────
  // The URL is the sole source of truth for selection (no localStorage, no
  // "this visit only" consume-and-strip). Every value below is DERIVED from
  // `searchParams` during render.

  // `display` is the opposite of `mode`: absent by default (graph), never
  // normalised/stamped onto the URL, so an existing `?app=`/`?group=` link's
  // URL is unchanged. Only `'dashboard'` means anything; any other value
  // (including garbage) reads as the graph, same as `mode`'s garbage case.
  // Named `display`, not `view`, so it isn't confused with the page's SAVED
  // views (`viewID`/`viewGroupBy`/`viewFilterID`, `type=view`).
  const displayParam = searchParams.get('display');
  const componentDisplayMode: ComponentDisplayMode = displayParam === 'dashboard' ? 'dashboard' : 'graph';

  // Read the ?space= deep-link param (set by the activity feed's full-path
  // link, a node click, or the post-create redirect).
  // Single-valued: a click always selects at most one node (see
  // `changeSelection` in `AppComponentView`), so a plain `useMemo` keyed on
  // the string itself gives the Set a STABLE identity across renders where
  // the param hasn't changed — required so `buildGraph`'s ~2s gate-status
  // poll doesn't churn `AppComponentView`'s memo comparator (components.md
  // risk 1).
  const spaceParam = searchParams.get('space');
  const selectedDeploymentIds = useMemo(
    () => (spaceParam ? new Set([spaceParam]) : EMPTY_SELECTION),
    [spaceParam],
  );

  /**
   * The deployments compared alongside the open one, in slot order.
   *
   * An ARRAY, not a Set: slot order is the comparison's own order, and slot A —
   * `spaceParam` — is the deployment the pane is open on. Derived from the
   * string so the identity stays stable while the param does not change, the
   * same rule `selectedDeploymentIds` follows.
   */
  const compareParam = searchParams.get('compare');
  // Read as is: only the graph knows the Component's label options, so it
  // resolves an unknown key to the default. Absent means Auto and stays absent.
  const graphGroupParam = searchParams.get('graphGroup');
  const compareDeploymentIds = useMemo(
    () => (compareParam ? compareParam.split(',').filter(Boolean) : EMPTY_COMPARE),
    [compareParam],
  );

  /**
   * The one write path for the view's URL params, handed down to
   * `AppComponentView` so every gesture there that needs to change more than
   * one of them atomically does so in a SINGLE `updateParams` call — one
   * history write per gesture, never several racing in the same tick.
   */
  const handleViewParamsChange = useCallback(
    (patch: ViewParamsPatch) => updateParams(patch),
    [updateParams],
  );

  const handleSelectedDeploymentIdsChange = useCallback(
    (next: Set<string>) => {
      const space = next.values().next().value ?? null;
      // Opening a different deployment starts a new comparison. Carrying the
      // old one over would carry a comparison chosen around a different open
      // deployment.
      updateParams({ space, compare: null });
    },
    [updateParams],
  );

  /**
   * The whole comparison in slot order — slot A first, which is also the
   * deployment the pane is open on.
   *
   * Written as ONE patch so slot A and the rest never disagree for a render: a
   * swap moves a deployment out of `compare` and into `space` in the same
   * history write.
   */
  const handleCompareSelectionChange = useCallback(
    (next: readonly string[]) => {
      const [first, ...rest] = next;
      if (!first) {
        updateParams({ compare: null });
        return;
      }
      updateParams({ space: first, compare: rest.length ? rest.join(',') : null });
    },
    [updateParams],
  );

  const handleClearSelection = useCallback(() => {
    updateParams({ space: null, compare: null });
  }, [updateParams]);

  // Unlike a node click, Overview DOES reset `display` — it's the one place
  // that breaks the Graph/Dashboard stickiness chain. Overview itself always
  // shows the full dashboard regardless of `display` (it doesn't read the
  // param at all), but a node clicked AFTER Overview should open its graph,
  // not carry over a choice from a now-closed, unrelated node graph.
  const handleOverviewSelect = useCallback(() => {
    updateParams({ app: null, display: null, space: null, compare: null, group: null, graphGroup: null });
  }, [updateParams]);

  const handleToggleTree = useCallback(() => {
    const panel = treePanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [treePanelRef]);

  const handleTreeResize = useCallback((_size: PanelSize, _id: string | number | undefined, prevSize: PanelSize | undefined) => {
    if (!prevSize) return; // Skip initial mount
    const panel = treePanelRef.current;
    if (!panel) return;
    setIsTreeCollapsed(panel.isCollapsed());
  }, [treePanelRef]);

  return (
    // `id` (not `data-testid`) is intentional: `Group`'s own render mirrors its
    // resolved id onto a `data-testid` attribute on the underlying div (see
    // react-resizable-panels' `Group` implementation — it spreads `...rest`
    // before setting `"data-testid":m,id:m`, so a `data-testid` prop passed
    // directly would be silently overwritten). Setting `id` is the only way
    // to land a stable `data-testid="components-layout"` on this root node.
    <Group id='components-layout' orientation='horizontal'>
      {/* Tree Navigation Panel */}
      <Panel
        panelRef={treePanelRef}
        defaultSize='20%'
        minSize='15%'
        maxSize='35%'
        collapsible
        collapsedSize='3%'
        onResize={handleTreeResize}
      >
        {isTreeCollapsed ? (
          <CollapsedSidebar>
            <Tooltip title='Expand navigation' placement='right'>
              <IconButton size='small' onClick={handleToggleTree}>
                <AccountTreeIcon fontSize='small' />
              </IconButton>
            </Tooltip>
          </CollapsedSidebar>
        ) : (
          <AppNavigationTree
            spaces={appSpaces}
            levels={levels}
            onEditLevels={handleEditLevels}
            selectedGroups={selectedGroups}
            onNodeOpen={handleNodeOpen}
            selectionCount={selectedDeploymentIds.size}
            onClearSelection={handleClearSelection}
            onOverviewSelect={handleOverviewSelect}
            isLoadingMore={isLoadingFullAppList}
            labelKeys={labelKeys}
            labelKeyCounts={labelKeyCounts}
            valueCtx={valueCtx}
          />
        )}
      </Panel>

      <StyledSeparator />

      {/* Detail Panel */}
      <Panel minSize='30%' style={{ position: 'relative' }}>
        <DetailPanelInner>
          {isGraphOpen ? (
              <AppComponentView
                spaces={graphSpaces}
                componentSpaces={appSpaces}
                graphKey={graphKey}
                targets={targets}
                selectedDeploymentIds={selectedDeploymentIds}
                onSelectedDeploymentIdsChange={handleSelectedDeploymentIdsChange}
                compareDeploymentIds={compareDeploymentIds}
                onCompareSelectionChange={handleCompareSelectionChange}
                initialFocusDeploymentId={spaceParam ?? undefined}
                displayMode={componentDisplayMode}
                groupParam={graphGroupParam}
                onViewParamsChange={handleViewParamsChange}
                onComponentSelect={handleAppSelect}
              />
          ) : isLoadingOverviewCounts ? (
            <ComponentOverviewMatrixSkeleton />
          ) : (
            <ComponentOverviewMatrix
              spaces={appSpaces}
              onComponentSelect={handleAppSelect}
            />
          )}
        </DetailPanelInner>
      </Panel>
    </Group>
  );
};
