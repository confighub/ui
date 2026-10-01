// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Header } from '@/components/header/Header';
import { QueryErrorState } from '@/components/query-error-state/QueryErrorState';
import { useQueryBuilder } from '@/components/query-builder';
import { useListAllTargetsQuery } from '@confighub/rtk-query';
import RefreshIcon from '@mui/icons-material/Cached';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';

import { AppsComponentLayout } from './AppsComponentLayout';
import { AppsComponentPageSkeleton } from './AppsComponentPageSkeleton';
import { LABEL_OWNER } from './componentData';
import {
  COMPONENT_DEFAULT_LEVELS,
  COMPONENTS_VIEW_KIND,
} from './componentGroupFields';
import { CreateComponentPane } from './CreateComponentPane';
import { useComponentSpaces } from './useComponentSpaces';

// Stable module-level reference so `useQueryBuilder`'s option doesn't churn
// its callback memoization with a fresh array literal every render.
const CLEAR_PARAMS_ON_VIEW_SWITCH = ['group'];

const Container = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
});

const PageContent = styled(Box)({
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
});

// The same Views-as-tabs strip the Unit list renders — full width, above
// both the nav tree and the detail panel, so switching a saved Components
// view affects the whole page at once. No filter row: a Components view
// holds grouping only — every Space is already a Component Deployment here,
// so a generic metadata filter doesn't answer a question this page's users
// actually have; narrowing happens by clicking the tree instead.
const TabsRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const LoadingContainer = styled(Box)({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
  width: '100%',
});

export const AppsComponentPage = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const appParam = searchParams.get('app');
  const hasApp = !!appParam;

  // Spaces load as a scoped deep-link query + a cheap live poll + a slow
  // summary poll. See `useComponentSpaces` for the split and why.
  const {
    spaces,
    isSpacesLoaded,
    isSummaryLoaded,
    isLoadingFullAppList,
    isSpacesError,
    isSummaryError,
    spacesError,
    failedSpacesQuery,
    retrySpaces,
  } = useComponentSpaces(appParam);

  const [createOpen, setCreateOpen] = useState(false);

  // The page's Spaces that belong to a Component. Needed here so a saved
  // view can be assigned an owning Space (`viewSpaceId` below); unlike
  // `AppsComponentLayout`'s `appSpaces` it needs no Component name.
  const appSpaces = useMemo(
    () => spaces.filter((s) => s.Space?.ComponentID),
    [spaces],
  );

  // Distinct non-empty Owner labels among component (deployment) spaces —
  // mirrors the population AppNavigationTree groups by.
  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const s of spaces) {
      if (!s.Space?.ComponentID) continue;
      const owner = s.Space?.Labels?.[LABEL_OWNER]?.trim();
      if (owner) set.add(owner);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [spaces]);

  const existingSpaceSlugs = useMemo(
    () => spaces.map((s) => s.Space?.Slug).filter((slug): slug is string => !!slug),
    [spaces],
  );

  // ── Saved views (grouping only) ──────────────────────────────────────────
  // `viewKind: COMPONENTS_VIEW_KIND` namespaces these views (and their
  // localStorage tabs) away from any generic Space view — see
  // `useQueryBuilder`'s `viewKind` option. `defaultColumns: []` because a
  // Space view has no column-picker concept here (grouping only), so
  // dirty-tracking's baseline must not compare against the Unit list's
  // default columns. `createFilterForView` (below `renderViewTabs`) still
  // mints a Filter for every new view — the View API requires a FilterID —
  // but with no filter UI to populate conditions from, it's always an empty
  // `From: 'Space'` Filter; that's a valid, no-op filter, not an error case.
  const { renderViewTabs, activeView } = useQueryBuilder({
    entityType: 'Space',
    viewKind: COMPONENTS_VIEW_KIND,
    syncToUrl: true,
    showViewSelector: true,
    defaultColumns: [],
    // A stale `?group=` from the PREVIOUS view's levels can reference values
    // that mean nothing under the new view's grouping (e.g. an Owner value
    // where the new view groups by Variant), narrowing the overview to
    // nothing — the tree's selection is derived purely from the URL, with no
    // React-state backstop. Deleted here (inside this hook's own view-switch
    // write) rather than from a separate effect in `AppsComponentLayout`
    // reacting to `activeView`, which raced this same write and could revert
    // it — see `clearParamsOnViewSwitch`'s doc comment.
    clearParamsOnViewSwitch: CLEAR_PARAMS_ON_VIEW_SWITCH,
  });

  // Every View needs an owning Space, but a Components view's grouping
  // isn't about any one Space, so there's no natural owner to pick. The
  // active view keeps whatever Space it was created under; a brand-new view
  // is assigned the first Space in a Component the query returns,
  // matching `UnitListPage.tsx`'s own `activeView?.View?.SpaceID ||
  // spaces[0]?.SpaceID || ''` so the two entity types behave the same way.
  const viewSpaceId = activeView?.View?.SpaceID || appSpaces[0]?.Space?.SpaceID || '';

  // Targets are only read by the component graph (`AppComponentView`), never by
  // the overview matrix, so this runs in parallel but does NOT gate first paint.
  // It stays unskipped so the cache is warm when a component is opened.
  const { data: targetsData, refetch: refetchTargets } = useListAllTargetsQuery({});
  const targets = useMemo(() => targetsData ?? [], [targetsData]);

  // Same scope as the other list pages' refresh button: the queries this
  // page itself owns (spaces, targets), not the graph's own unit/dry-run
  // data further down — that already has its own background polling.
  const handleRefresh = useCallback(() => {
    retrySpaces();
    refetchTargets();
  }, [retrySpaces, refetchTargets]);

  // Paint as soon as ANY space list resolves. Targets and the summary counts
  // backfill into their own consumers without re-gating the whole page.
  if (!isSpacesLoaded) {
    if (isSpacesError) {
      return (
        <LoadingContainer>
          <QueryErrorState
            error={spacesError}
            onRetry={retrySpaces}
            context='components'
            endpoint='GET /space'
            failedQuery={failedSpacesQuery}
          />
        </LoadingContainer>
      );
    }
    // Content-shaped placeholder for the split panel the page is about to
    // render, so first paint swaps shapes rather than replacing a blank page.
    return (
      <Container>
        <Header breadCrumbs={[{ name: 'Components' }]} />
        <PageContent>
          <AppsComponentPageSkeleton variant={hasApp ? 'graph' : 'overview'} />
        </PageContent>
      </Container>
    );
  }

  return (
    <Container>
      <Header
        breadCrumbs={[{ name: 'Components' }]}
        addButtonText='New component'
        onAddButtonClick={() => setCreateOpen(true)}
        actions={
          <Tooltip arrow placement='bottom' title='Refresh components'>
            <IconButton
              size='small'
              data-testid='refresh-button'
              onClick={handleRefresh}
              sx={{
                color: 'primary.main',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        }
      />
      <TabsRow>
        {renderViewTabs({
          spaceId: viewSpaceId,
          sentinelLabel: 'All components',
          defaultGroupBy: COMPONENT_DEFAULT_LEVELS.join(','),
          defaultColumns: [],
        })}
      </TabsRow>
      <PageContent>
        <AppsComponentLayout
          spaces={spaces}
          targets={targets}
          isLoadingFullAppList={isLoadingFullAppList}
          // The overview matrix reads summary-only counts. Show its skeleton
          // until they arrive rather than a matrix full of misleading zeros.
          // On summary failure, fall through and render what we have.
          isLoadingOverviewCounts={!isSummaryLoaded && !isSummaryError}
          isSummaryLoaded={isSummaryLoaded}
          activeView={activeView}
        />
      </PageContent>
      <CreateComponentPane
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(componentName) => {
          setCreateOpen(false);
          // Opening the just-created component reads exactly like clicking
          // any other component tile, and a real (pushed) navigation so Back
          // returns to the overview instead of undoing an in-page gesture.
          // A functional-updater merge, not a plain-object `setSearchParams`
          // call — the latter replaces the WHOLE query string, which would
          // drop `view*`/`filter*`/`type` and silently lose the active
          // saved view and filter on every "New component" click. `display`
          // is left untouched too, same as a real node click
          // (`AppsComponentLayout.handleAppSelect`) — the Graph/Dashboard
          // choice is sticky across opening a new Component.
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('app', componentName);
            next.delete('space');
            next.delete('compare');
            next.delete('group');
            return next;
          });
        }}
        owners={owners}
        existingSpaceSlugs={existingSpaceSlugs}
      />
    </Container>
  );
});

AppsComponentPage.displayName = 'AppsComponentPage';

export default AppsComponentPage;
