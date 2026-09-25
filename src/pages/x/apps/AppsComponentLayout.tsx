// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { spaceComponentSlug, useComponentSlugs } from '@/hooks/useComponentSlugs';
import {
  type ExtendedSpaceRead,
  type ExtendedTargetRead,
} from '@confighub/rtk-query';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';
import { Group, Panel, type PanelSize, Separator, usePanelRef } from 'react-resizable-panels';

import { AppNavigationTree } from './AppNavigationTree';
import { AppComponentView } from './AppComponentView';
import { ComponentOverviewMatrix } from './ComponentOverviewMatrix';
import { ComponentOverviewMatrixSkeleton } from './ComponentOverviewMatrixSkeleton';
import { LABEL_OWNER } from './componentData';
import { type SelectedApp, type ViewParamsPatch } from './appTypes';

/** Stable identity so a bare `/components` render doesn't hand every
 * downstream `useMemo` a brand-new empty Set each time (components.md risk
 * 1: identity, not values — `buildGraph` and `AppComponentView` are memo'd). */
const EMPTY_SELECTION: Set<string> = new Set();

/** Same rule as `EMPTY_SELECTION`, for the comparison's extra slots. */
const EMPTY_COMPARE: string[] = [];

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
}

// ============================================================================
// COMPONENT
// ============================================================================

export const AppsComponentLayout = ({
  spaces,
  targets,
  isLoadingFullAppList = false,
  isLoadingOverviewCounts = false,
}: AppsComponentLayoutProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const treePanelRef = usePanelRef();
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);

  /**
   * The ONE place the Components view writes to the URL. `null` deletes a
   * param, `undefined` (an omitted key) leaves it untouched. Every write is
   * `{ replace: true }` — the whole view collapses to zero pushed history
   * entries beyond the initial navigation, so gestures never spam Back.
   */
  const updateParams = useCallback(
    (patch: ViewParamsPatch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) continue;
            if (value === null) {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Filter spaces that belong to a Component (deployment spaces, not infra spaces)
  const appSpaces = useMemo(
    () => spaces.filter((s) => s.Space?.ComponentID),
    [spaces],
  );
  const { slugById } = useComponentSlugs();

  // selectedApp is derived from the URL so browser Back/Forward work correctly
  const selectedApp = useMemo((): SelectedApp | null => {
    const appName = searchParams.get('app');
    if (!appName) return null;
    const space = appSpaces.find((s) => spaceComponentSlug(s.Space, slugById) === appName);
    if (!space) return null;
    return { name: appName, owner: space.Space?.Labels?.[LABEL_OWNER] ?? 'Unassigned' };
  }, [searchParams, appSpaces, slugById]);

  // Get spaces for the selected component
  const selectedAppSpaces = useMemo(() => {
    if (!selectedApp) return [];
    return appSpaces.filter((s) => spaceComponentSlug(s.Space, slugById) === selectedApp.name);
  }, [appSpaces, selectedApp, slugById]);

  // ── URL-derived view state ──────────────────────────────────────────────
  // The URL is the sole source of truth for selection (no localStorage, no
  // "this visit only" consume-and-strip). Every value below is DERIVED from
  // `searchParams` during render.

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
  const compareDeploymentIds = useMemo(
    () => (compareParam ? compareParam.split(',').filter(Boolean) : EMPTY_COMPARE),
    [compareParam],
  );

  // Deliberately a PUSH, not `{ replace: true }` — out of scope for the
  // replace-everywhere rule, which was answering a question about rapid
  // in-page gestures (node clicks), not switching which component app is
  // open. Selecting a different app is a real navigation; Back undoing it is
  // a kept affordance, not spam.
  //
  // Guarded on actually SWITCHING apps: `AppNavigationTree`'s tree-view
  // selection can re-fire this for the app that's ALREADY selected (e.g. a
  // deep link's `navigateAndSelectApp`-style re-click of its own already-
  // selected row, or a re-sync of the tree's controlled `selectedItems` after
  // an unrelated re-render). Writing the whole query unconditionally would
  // silently stomp a deep-linked `?space=`/`?compare=` the instant the same
  // app's row was clicked again. Only a genuine switch to a DIFFERENT app
  // should reset them.
  const handleAppSelect = useCallback(
    (app: SelectedApp) => {
      if (selectedApp?.name === app.name) return;
      setSearchParams({ app: app.name });
    },
    [selectedApp, setSearchParams],
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

  const handleOverviewSelect = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

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
            selectedApp={selectedApp}
            onAppSelect={handleAppSelect}
            selectionCount={selectedDeploymentIds.size}
            onClearSelection={handleClearSelection}
            isOverviewSelected={selectedApp === null}
            onOverviewSelect={handleOverviewSelect}
            isLoadingMore={isLoadingFullAppList}
          />
        )}
      </Panel>

      <StyledSeparator />

      {/* Detail Panel */}
      <Panel minSize='30%' style={{ position: 'relative' }}>
        <DetailPanelInner>
          {selectedApp ? (
              <AppComponentView
                spaces={selectedAppSpaces}
                targets={targets}
                selectedDeploymentIds={selectedDeploymentIds}
                onSelectedDeploymentIdsChange={handleSelectedDeploymentIdsChange}
                compareDeploymentIds={compareDeploymentIds}
                onCompareSelectionChange={handleCompareSelectionChange}
                initialFocusDeploymentId={spaceParam ?? undefined}
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
