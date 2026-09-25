// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  ExtendedViewRead,
  ViewRead,
  usePatchViewMutation,
} from '@confighub/rtk-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import AddIcon from '@mui/icons-material/Add';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { SortableViewNavItem } from './SortableViewNavItem';

const VIEW_ORDER_ANNOTATION = 'confighub.com/view-order';

interface ViewNavPanelProps {
  views: ExtendedViewRead[];
  isLoading: boolean;
  activeViewId: string | null;
  dirtyViewId: string | null;
  onSelectView: (viewId: string) => void;
  onNewView: () => void;
  width?: number;
}

const Panel = styled(Box)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  borderRight: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
}));

const PanelHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(1.5, 1.5, 1),
}));

const PanelBody = styled(Box)(() => ({
  flex: 1,
  overflowY: 'auto',
  padding: '4px 8px',
}));

const EmptyState = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(4, 2),
  color: theme.palette.text.disabled,
  gap: theme.spacing(1),
}));

/** Parse the ordering annotation, defaulting to Infinity so unordered views sink to the bottom. */
function getViewOrder(ev: ExtendedViewRead): number {
  const raw = ev.View?.Annotations?.[VIEW_ORDER_ANNOTATION];
  if (raw == null) return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Infinity;
}

/** Sort views by their order annotation, falling back to DisplayName/Slug for ties. */
function sortViews(views: ExtendedViewRead[]): ExtendedViewRead[] {
  return [...views].sort((a, b) => {
    const orderDiff = getViewOrder(a) - getViewOrder(b);
    if (orderDiff !== 0) return orderDiff;
    const nameA = (a.View?.DisplayName ?? a.View?.Slug ?? '').toLowerCase();
    const nameB = (b.View?.DisplayName ?? b.View?.Slug ?? '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export function ViewNavPanel({
  views,
  isLoading,
  activeViewId,
  dirtyViewId,
  onSelectView,
  onNewView,
  width = 240,
}: ViewNavPanelProps) {
  const [patchView] = usePatchViewMutation();
  const [isSaving, setIsSaving] = useState(false);

  // Optimistic local ordering: override the server order until the cache catches up
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);
  const prevViewIdsRef = useRef<string>('');

  const serverSorted = useMemo(() => sortViews(views), [views]);

  // When the server data changes (cache invalidation after patches), clear the optimistic override
  const serverViewIds = useMemo(
    () => serverSorted.map((ev) => ev.View?.ViewID).filter(Boolean).join(','),
    [serverSorted],
  );
  if (serverViewIds !== prevViewIdsRef.current) {
    prevViewIdsRef.current = serverViewIds;
    if (optimisticOrder !== null) {
      setOptimisticOrder(null);
    }
  }

  // Use optimistic order if present, otherwise server order
  const sortedViews = useMemo(() => {
    if (!optimisticOrder) return serverSorted;
    const byId = new Map(serverSorted.map((ev) => [ev.View?.ViewID, ev]));
    const ordered: ExtendedViewRead[] = [];
    for (const id of optimisticOrder) {
      const ev = byId.get(id);
      if (ev) ordered.push(ev);
    }
    // Append any views not in the optimistic list (e.g. newly created)
    for (const ev of serverSorted) {
      if (!optimisticOrder.includes(ev.View?.ViewID ?? '')) {
        ordered.push(ev);
      }
    }
    return ordered;
  }, [optimisticOrder, serverSorted]);

  const viewIds = useMemo(
    () => sortedViews.map((ev) => ev.View?.ViewID).filter(Boolean) as string[],
    [sortedViews],
  );

  // Require a small drag distance before activating so clicks still work
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = viewIds.indexOf(active.id as string);
      const newIndex = viewIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(sortedViews, oldIndex, newIndex);
      const reorderedIds = reordered.map((ev) => ev.View?.ViewID).filter(Boolean) as string[];

      // Apply optimistic reorder immediately
      setOptimisticOrder(reorderedIds);

      // Persist new ordering for each view that changed position
      setIsSaving(true);
      try {
        const promises = reordered.map((ev, idx) => {
          const view = ev.View;
          if (!view?.ViewID || !view.SpaceID) return null;
          const currentOrder = getViewOrder(ev);
          if (currentOrder === idx) return null; // No change
          return patchView({
            spaceId: view.SpaceID,
            viewId: view.ViewID,
            body: {
              Annotations: { [VIEW_ORDER_ANNOTATION]: String(idx) },
            },
          }).unwrap();
        });
        await Promise.all(promises.filter(Boolean));
      } catch {
        // On failure, clear optimistic state to revert to server order
        setOptimisticOrder(null);
      } finally {
        setIsSaving(false);
      }
    },
    [sortedViews, viewIds, patchView],
  );

  return (
    <Panel sx={{ width, minWidth: width }}>
      <PanelHeader>
        <Typography variant='subtitle2' fontWeight={600} color='text.secondary'>
          VIEWS
        </Typography>
        <Button
          size='small'
          variant='text'
          startIcon={<AddIcon fontSize='small' />}
          onClick={onNewView}
          sx={{ textTransform: 'none', minWidth: 0, px: 1 }}
        >
          New
        </Button>
      </PanelHeader>
      <Divider />
      <PanelBody>
        {isLoading ? (
          <Box display='flex' justifyContent='center' pt={3}>
            <CircularProgress size={24} />
          </Box>
        ) : views.length === 0 ? (
          <EmptyState>
            <TableChartOutlinedIcon sx={{ fontSize: 36 }} />
            <Typography variant='caption' align='center'>
              No views yet.
              <br />
              Click &ldquo;New&rdquo; to create one.
            </Typography>
          </EmptyState>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={viewIds} strategy={verticalListSortingStrategy}>
              <List dense disablePadding sx={{ opacity: isSaving ? 0.6 : 1 }}>
                {sortedViews.map((ev) => {
                  const v = ev.View as ViewRead;
                  if (!v?.ViewID) return null;
                  return (
                    <SortableViewNavItem
                      key={v.ViewID}
                      view={v}
                      isActive={activeViewId === v.ViewID}
                      isDirty={dirtyViewId === v.ViewID}
                      onClick={onSelectView}
                    />
                  );
                })}
              </List>
            </SortableContext>
          </DndContext>
        )}
      </PanelBody>
    </Panel>
  );
}
