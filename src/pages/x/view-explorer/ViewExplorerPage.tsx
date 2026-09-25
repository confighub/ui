// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { Header } from '@/components/header/Header';
import {
  ExtendedViewRead,
  useDeleteFilterMutation,
  useDeleteViewMutation,
  useListAllViewsQuery,
} from '@confighub/rtk-query';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { ALL_GROUPS, PaneResizeHandle, getGroupByColumns } from '@/components/group-nav';

import { getAdapter } from './adapters';
import { GroupNavRow } from './cell-value';
import { measureGroupNavWidth } from './measure-group-nav';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { EntityDetailDrawer } from './components/EntityDetailDrawer/EntityDetailDrawer';
import { EntityGroupNavPanel } from './components/EntityGroupNavPanel/EntityGroupNavPanel';
import { ViewNavPanel } from './components/ViewNavPanel/ViewNavPanel';
import { ViewBuilder } from './components/ViewBuilder/ViewBuilder';
import { ViewExplorer } from './components/ViewExplorer/ViewExplorer';
import { useSystemSpace } from './hooks/useSystemSpace';
import { useTransparentFilter } from './hooks/useTransparentFilter';
import { useViewData } from './hooks/useViewData';
import { EMPTY_DRAFT, DraftView, entityTypeOfView, viewToDraft } from './types';

type PageMode = 'idle' | 'building' | 'viewing';

const PageRoot = styled(Box)({
  display: 'flex',
  flex: 1,
  width: '100%',
  overflow: 'hidden',
});

const ContentArea = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: 'hidden',
  padding: theme.spacing(3),
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'rgb(249, 250, 251)',
}));

const EmptyContent = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: theme.spacing(2),
  color: theme.palette.text.disabled,
}));

const MIN_PANE_WIDTH = 120;
const MAX_PANE_WIDTH = 600;
const DEFAULT_GROUP_PANE_WIDTH = 200;

function clampWidth(w: number): number {
  return Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, w));
}

/** Wrapper that fetches rows for the active view and renders GroupNavPanel + ViewExplorer */
function ViewingPane({
  view,
  selectedGroups,
  onSelectGroups,
  onEdit,
  onDuplicate,
  onDelete,
  onRowClick,
  groupPaneWidth,
  onGroupPaneResize,
  onMeasuredGroupWidth,
}: {
  view: ExtendedViewRead;
  selectedGroups: string[];
  onSelectGroups: (groups: string[]) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRowClick: (row: GroupNavRow, event: React.MouseEvent) => void;
  groupPaneWidth: number;
  onGroupPaneResize: (delta: number) => void;
  onMeasuredGroupWidth: (width: number) => void;
}) {
  const adapter = useMemo(() => getAdapter(entityTypeOfView(view)), [view]);
  const groupByColumns = useMemo(() => getGroupByColumns(view.View), [view.View]);
  const hasGrouping = groupByColumns.length > 0;
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const {
    groupingRows,
    displayRows,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useViewData(view, { selectedGroups, groupByColumns });

  // Measure the natural width needed for the group nav and report it up so the
  // parent can auto-fit the pane (until the user resizes manually).
  const measuredGroupWidth = useMemo(
    () => (hasGrouping ? measureGroupNavWidth(groupingRows, groupByColumns, false) : 0),
    [hasGrouping, groupingRows, groupByColumns],
  );
  const lastReportedWidthRef = useRef<number>(-1);
  if (measuredGroupWidth > 0 && measuredGroupWidth !== lastReportedWidthRef.current) {
    lastReportedWidthRef.current = measuredGroupWidth;
    onMeasuredGroupWidth(measuredGroupWidth);
  }

  return (
    <>
      {hasGrouping && (
        <>
          <EntityGroupNavPanel
            groupByColumns={groupByColumns}
            rows={groupingRows}
            selectedGroups={selectedGroups}
            onSelectGroups={onSelectGroups}
            width={groupPaneWidth}
          />
          <PaneResizeHandle onResize={onGroupPaneResize} />
        </>
      )}
      <ContentArea>
        <Stack direction='row' alignItems='center' justifyContent='space-between' mb={2}>
          <Typography variant='h6' fontWeight={600}>
            {view.View?.DisplayName ?? view.View?.Slug}
          </Typography>
          <Stack direction='row' spacing={1}>
            <Button
              size='small'
              variant='outlined'
              startIcon={<EditIcon fontSize='small' />}
              onClick={onEdit}
            >
              Edit View
            </Button>
            <Button
              size='small'
              variant='outlined'
              startIcon={<ContentCopyIcon fontSize='small' />}
              onClick={onDuplicate}
            >
              Duplicate
            </Button>
            <Button
              size='small'
              variant='outlined'
              color='error'
              startIcon={<DeleteOutlineIcon fontSize='small' />}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              Delete
            </Button>
          </Stack>
        </Stack>
        <ViewExplorer
          view={view}
          adapter={adapter}
          rows={displayRows}
          isLoading={isLoading}
          isFetching={isFetching}
          isError={isError}
          onRefetch={refetch}
          onRowClick={onRowClick}
        />
      </ContentArea>
      <DeleteConfirmDialog
        open={deleteConfirmOpen}
        viewName={view.View?.DisplayName ?? view.View?.Slug ?? 'this view'}
        onConfirm={() => { setDeleteConfirmOpen(false); onDelete(); }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
}

export default function ViewExplorerPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Row currently shown in the detail drawer. null when the drawer is closed.
  const [detailRow, setDetailRow] = useState<GroupNavRow | null>(null);

  // Restore active view from URL params, then location state as fallback
  const restoreViewId =
    searchParams.get('view') ??
    (location.state as { restoreViewId?: string } | null)?.restoreViewId ??
    null;
  const restoreGroups = searchParams.getAll('group');

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeViewId, setActiveViewId] = useState<string | null>(restoreViewId);
  const [mode, setMode] = useState<PageMode>(restoreViewId ? 'viewing' : 'idle');
  const [selectedGroups, setSelectedGroups] = useState<string[]>(restoreGroups);
  const [draft, setDraft] = useState<DraftView>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // When editing an existing view, track its IDs so we can patch
  const [editingViewId, setEditingViewId] = useState<string | undefined>(undefined);
  const [editingFilterId, setEditingFilterId] = useState<string | undefined>(undefined);
  // Fresh view data from the last save, used until the cache refetch catches up
  const [savedViewOverride, setSavedViewOverride] = useState<ExtendedViewRead | null>(null);
  // Pane widths. The group pane auto-fits its content until the user drags
  // the resize handle, after which manualGroupPaneWidth wins.
  const [viewPaneWidth, setViewPaneWidth] = useState(240);
  const [autoGroupPaneWidth, setAutoGroupPaneWidth] = useState<number | null>(null);
  const [manualGroupPaneWidth, setManualGroupPaneWidth] = useState<number | null>(null);
  const groupPaneWidth =
    manualGroupPaneWidth ?? clampWidth(autoGroupPaneWidth ?? DEFAULT_GROUP_PANE_WIDTH);
  const groupPaneWidthRef = useRef(groupPaneWidth);
  groupPaneWidthRef.current = groupPaneWidth;

  // Sync URL search params whenever view or group changes
  const updateUrlParams = useCallback(
    (viewId: string | null, groups: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (viewId) {
            next.set('view', viewId);
          } else {
            next.delete('view');
          }
          next.delete('group');
          for (const g of groups) {
            if (g && g !== ALL_GROUPS) {
              next.append('group', g);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleViewPaneResize = useCallback((delta: number) => {
    setViewPaneWidth((w) => clampWidth(w + delta));
  }, []);
  const handleGroupPaneResize = useCallback((delta: number) => {
    setManualGroupPaneWidth((w) => clampWidth((w ?? groupPaneWidthRef.current) + delta));
  }, []);
  const handleMeasuredGroupWidth = useCallback((width: number) => {
    setAutoGroupPaneWidth(width);
  }, []);

  // ── API ────────────────────────────────────────────────────────────────────
  const { data: viewsData = [], isLoading: viewsLoading } = useListAllViewsQuery(
    { include: 'FilterID' },
  );
  const { ensureSystemSpace } = useSystemSpace();
  const { saveView } = useTransparentFilter();
  const [deleteViewMutation] = useDeleteViewMutation();
  const [deleteFilterMutation] = useDeleteFilterMutation();

  // ── Derived ────────────────────────────────────────────────────────────────
  const cachedView = viewsData.find((ev) => ev.View?.ViewID === activeViewId);
  // Prefer the fresh save response over the cache until the cache catches up
  const activeExtendedView: ExtendedViewRead | undefined =
    savedViewOverride && savedViewOverride.View?.ViewID === activeViewId
      ? savedViewOverride
      : cachedView;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectView = useCallback(
    (viewId: string) => {
      setActiveViewId(viewId);
      setSelectedGroups([]);
      setSavedViewOverride(null);
      setAutoGroupPaneWidth(null);
      setManualGroupPaneWidth(null);
      setMode('viewing');
      setSaveError(null);
      setDetailRow(null);
      updateUrlParams(viewId, []);
    },
    [updateUrlParams],
  );

  const handleSelectGroups = useCallback(
    (groups: string[]) => {
      setSelectedGroups(groups);
      updateUrlParams(activeViewId, groups);
    },
    [activeViewId, updateUrlParams],
  );

  const handleNewView = useCallback(() => {
    setActiveViewId(null);
    setSelectedGroups([]);
    setSavedViewOverride(null);
    setEditingViewId(undefined);
    setEditingFilterId(undefined);
    // Seed the new draft with the Unit adapter's defaults; the ViewBuilder
    // resets columns when the user picks a different entity type.
    const defaultAdapter = getAdapter('Unit');
    setDraft({ ...EMPTY_DRAFT, columns: defaultAdapter.defaultColumns });
    setMode('building');
    setSaveError(null);
    updateUrlParams(null, []);
  }, [updateUrlParams]);

  const handleEditView = useCallback(() => {
    if (!activeExtendedView) return;
    const d = viewToDraft(activeExtendedView);
    setDraft(d);
    setEditingViewId(activeExtendedView.View?.ViewID);
    setEditingFilterId(activeExtendedView.View?.FilterID || undefined);
    setMode('building');
    setSaveError(null);
  }, [activeExtendedView]);

  const handleDuplicateView = useCallback(() => {
    if (!activeExtendedView) return;
    const d = viewToDraft(activeExtendedView);
    setDraft({ ...d, slug: '', displayName: '' });
    setActiveViewId(null);
    setEditingViewId(undefined);
    setEditingFilterId(undefined);
    setMode('building');
    setSaveError(null);
  }, [activeExtendedView]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setIsSaving(true);
    try {
      // Use the view's own space when editing, system space when creating
      const spaceId = activeExtendedView?.View?.SpaceID ?? await ensureSystemSpace();
      const result = await saveView(
        spaceId,
        draft,
        editingViewId,
        editingFilterId,
        activeExtendedView?.Filter?.SpaceID,
        activeExtendedView?.View?.SpaceID,
      );
      const newViewId = result.view.ViewID!;
      setActiveViewId(newViewId);
      setEditingViewId(newViewId);
      setEditingFilterId(result.filter.FilterID);
      // Use the fresh save response immediately so the viewing pane
      // reflects the latest columns/settings without waiting for cache refetch
      setSavedViewOverride({ View: result.view, Filter: result.filter });
      setMode('viewing');
      setSuccessMessage('View saved successfully.');
      updateUrlParams(newViewId, selectedGroups);
    } catch (err: unknown) {
      const apiErr = err as { data?: { message?: string }; message?: string };
      const msg = apiErr?.data?.message ?? apiErr?.message ?? 'Failed to save view.';
      setSaveError(typeof msg === 'string' ? msg : 'Failed to save view.');
    } finally {
      setIsSaving(false);
    }
  }, [draft, editingViewId, editingFilterId, activeExtendedView, ensureSystemSpace, saveView, updateUrlParams, selectedGroups]);

  const handleCancelEdit = useCallback(() => {
    if (activeViewId) {
      setMode('viewing');
    } else {
      setMode('idle');
    }
    setSaveError(null);
  }, [activeViewId]);

  const handleDeleteView = useCallback(async () => {
    const viewId = editingViewId || activeViewId;
    if (!viewId || !activeExtendedView?.View?.SpaceID) return;
    const viewSpaceId = activeExtendedView.View.SpaceID;
    const filterId = activeExtendedView.View.FilterID;
    const filterSpaceId = activeExtendedView.Filter?.SpaceID;
    setIsSaving(true);
    try {
      // Delete view first (it holds the FK reference to the filter)
      await deleteViewMutation({ spaceId: viewSpaceId, viewId }).unwrap();
      // Then delete the orphaned filter
      if (filterId && filterSpaceId) {
        await deleteFilterMutation({ spaceId: filterSpaceId, filterId }).unwrap();
      }
      setActiveViewId(null);
      setSelectedGroups([]);
      setSavedViewOverride(null);
      setEditingViewId(undefined);
      setEditingFilterId(undefined);
      setMode('idle');
      setSuccessMessage('View deleted.');
      updateUrlParams(null, []);
    } catch {
      setSaveError('Failed to delete view.');
    } finally {
      setIsSaving(false);
    }
  }, [editingViewId, activeViewId, activeExtendedView, deleteViewMutation, deleteFilterMutation, updateUrlParams]);

  // Row click opens the detail drawer instead of routing away. Cmd/ctrl-click
  // still escapes to the full detail page so power users can pop out.
  const handleRowClick = useCallback(
    (row: GroupNavRow, event: React.MouseEvent) => {
      if (!activeExtendedView) return;
      if (event.metaKey || event.ctrlKey) {
        const adapter = getAdapter(entityTypeOfView(activeExtendedView));
        const href = adapter.getRowHref(row);
        if (href) window.open(href, '_blank');
        return;
      }
      setDetailRow(row);
    },
    [activeExtendedView],
  );

  const handleCloseDetailDrawer = useCallback(() => setDetailRow(null), []);

  // Adapter for the currently active view, used by the detail drawer. Falls
  // back to null when no view is active so the drawer just renders nothing.
  const drawerAdapter = activeExtendedView
    ? getAdapter(entityTypeOfView(activeExtendedView))
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <Header breadCrumbs={[{ name: 'View Explorer' }]} />
    <PageRoot>
      <ViewNavPanel
        views={viewsData}
        isLoading={viewsLoading}
        activeViewId={activeViewId}
        dirtyViewId={mode === 'building' && editingViewId ? editingViewId : null}
        onSelectView={handleSelectView}
        onNewView={handleNewView}
        width={viewPaneWidth}
      />
      <PaneResizeHandle onResize={handleViewPaneResize} />

      {mode === 'building' && (
        <ContentArea sx={{ overflow: 'auto' }}>
          <ViewBuilder
            draft={draft}
            existingView={activeExtendedView ?? null}
            isSaving={isSaving}
            saveError={saveError}
            onChange={setDraft}
            onSave={handleSave}
            onCancel={handleCancelEdit}
            onDelete={editingViewId ? handleDeleteView : undefined}
          />
        </ContentArea>
      )}

      {mode === 'viewing' && activeExtendedView && (
        <ViewingPane
          key={activeExtendedView.View?.ViewID}
          view={activeExtendedView}
          selectedGroups={selectedGroups}
          onSelectGroups={handleSelectGroups}
          onEdit={handleEditView}
          onDuplicate={handleDuplicateView}
          onDelete={handleDeleteView}
          onRowClick={handleRowClick}
          groupPaneWidth={groupPaneWidth}
          onGroupPaneResize={handleGroupPaneResize}
          onMeasuredGroupWidth={handleMeasuredGroupWidth}
        />
      )}

      {mode === 'idle' && (
        <ContentArea>
          <EmptyContent>
            {viewsLoading ? (
              <>
                <CircularProgress size={28} />
                <Typography variant='body2' color='text.disabled'>
                  Loading views…
                </Typography>
              </>
            ) : (
              <>
                <Typography variant='h6' color='text.disabled'>
                  View Explorer
                </Typography>
                <Typography variant='body2' color='text.disabled'>
                  {viewsData.length > 0
                    ? 'Select a view from the panel on the left, or create a new one.'
                    : 'No views yet. Create your first view to get started.'}
                </Typography>
              </>
            )}
          </EmptyContent>
        </ContentArea>
      )}

      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
      />
      <EntityDetailDrawer
        row={detailRow}
        view={activeExtendedView ?? null}
        adapter={drawerAdapter}
        onClose={handleCloseDetailDrawer}
      />
    </PageRoot>
    </Box>
  );
}
