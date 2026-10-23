// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type CSSProperties, type KeyboardEvent, memo, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useVirtualizer } from '@tanstack/react-virtual';

import { type DndHandler, dragItemOf, useDndHandler } from '../dnd/registry';
import { fieldById, STATUS_LABEL, type EntityRow } from '../model/fields';
import { buildGroupTree, flattenGroups, type FlatItem, type GroupNode } from '../model/grouping';
import { lensPredicate } from '../model/client-eval';
import { groupLevelFor } from '../model/sort';
import type { ColumnSourceDef, EntityKind, StatusKind } from '../model/types';
import { useExplorerContext } from '../state/context';
import { useResults } from '../state/results-context';
import { useActiveTab } from '../state/useExplorer';
import { AddColumnButton } from './AddColumnButton';
import { type CellActions, TableCellContent } from './cells/TableCellContent';
import { isPrimaryField } from './format';
import { GroupHeaderRow } from './GroupHeaderRow';
import { groupPaths, groupValueText, pathLenses } from './groups';
import { HeaderCell } from './HeaderCell';
import { labelKeysOf } from './label-keys';
import { type ExplorerColumn, MIN_COLUMN_WIDTH, useExplorerTable } from './useExplorerTable';

/**
 * The Table layout. Rows come sorted from the view's derived rows; groups come
 * from `model/grouping.ts`; headers and rows are one virtual list, so a view
 * of thousands of Units scrolls without drawing them all. Every change made
 * here (sort, group, move, hide, resize, add a column) is a reducer action,
 * so it makes a draft and is one undo step.
 */

export const HEADER_HEIGHT = 34;
export const ROW_HEIGHT = 38;
export const GROUP_ROW_HEIGHT = 36;
const ADD_COLUMN_WIDTH = 44;
const DEFAULT_WIDTH = 160;

const NOUN: Record<EntityKind, string> = { Unit: 'units', Space: 'spaces', Resource: 'resources' };

/** Shorter headers for revision columns, which read as "r18". */
const HEADER_LABEL: Record<string, string> = {
  HeadRevisionNum: 'Revision',
  'Unit.HeadRevisionNum': 'Revision',
  LastReleasedRevisionNum: 'Released',
  UpstreamRevisionNum: 'Upstream rev.',
};

function headerLabel(entity: EntityKind, name: string): string {
  const field = fieldById(entity, name);
  if (field) return HEADER_LABEL[field.id] ?? field.label;
  const last = name.split('.').pop() ?? name;
  return last.split('/')[0].replace(/([a-z])([A-Z])/g, '$1 $2');
}

interface TrackInput {
  column: ExplorerColumn;
  /** The viewer set this width (or is dragging it): it is kept exactly. */
  fixed: boolean;
  /** The field's default width: the share of free space an unfixed column takes. */
  weight: number;
}

/** The narrowest an unfixed column becomes before the table scrolls sideways. */
function minTrack(weight: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.round(weight * 0.6));
}

/**
 * The width of a column whose content has a known size (status chips,
 * numbers, times, the toolchain): it does not grow, so the spare room goes to
 * text columns (names, Spaces, Targets). Null for a text column.
 */
function contentWidth(entity: EntityKind, name: string): number | null {
  const field = fieldById(entity, name);
  if (!field) return null;
  if (field.type === 'status') return entity === 'Unit' ? 180 : 130;
  if (field.type === 'number') return 104;
  if (field.type === 'time' || field.type === 'bool') return 104;
  if (field.id === 'ToolchainType' || field.id === 'Unit.ToolchainType') return 136;
  return null;
}

/**
 * Column tracks: a width the viewer chose is kept exactly; the others share
 * the room in proportion to their default widths and shrink (with "…") down
 * to a floor, so the `+` stays in view on a narrow screen. With every width
 * fixed, the last column takes what is left.
 */
function gridTemplate(tracks: readonly TrackInput[]): { template: string; minWidth: number } {
  const anyFlexible = tracks.some((t) => !t.fixed);
  const parts = tracks.map((t, i) => {
    if (!t.fixed) return `minmax(${minTrack(t.weight)}px, ${t.weight}fr)`;
    return !anyFlexible && i === tracks.length - 1 ? `minmax(${t.column.width}px, 1fr)` : `${t.column.width}px`;
  });
  const minWidth = tracks.reduce((sum, t) => sum + (t.fixed ? t.column.width : minTrack(t.weight)), 0) + ADD_COLUMN_WIDTH;
  return { template: [...parts, `${ADD_COLUMN_WIDTH}px`].join(' '), minWidth };
}

interface RowProps {
  entity: EntityKind;
  row: EntityRow;
  rowId: string;
  columns: readonly string[];
  missingServer: boolean;
  serverColumns: ReadonlySet<string>;
  selected: boolean;
  rowIndex: number;
  actions: CellActions;
  onOpen: (row: EntityRow, event: MouseEvent | KeyboardEvent) => void;
}

const TableRow = memo(function TableRow({ entity, row, rowId, columns, missingServer, serverColumns, selected, rowIndex, actions, onOpen }: RowProps) {
  return (
    <Box
      role='row'
      tabIndex={0}
      aria-rowindex={rowIndex}
      data-selected={selected}
      data-testid='vx-row'
      data-row-id={rowId}
      onClick={(e) => onOpen(row, e)}
      onKeyDown={(e) => {
        // Enter on a control inside the row (a value, a status chip) is that control's.
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(row, e);
      }}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'var(--vx-grid)',
        height: '100%',
        borderBottom: 1,
        borderColor: 'grey.200',
        cursor: 'pointer',
        bgcolor: selected ? 'primary.light' : 'background.paper',
        '&:hover': { bgcolor: selected ? 'primary.light' : 'grey.100' },
        '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: -2 },
      }}
    >
      {columns.map((name) => {
        const primary = isPrimaryField(entity, name);
        return (
          <Box
            key={name}
            role='cell'
            data-column={name}
            sx={{
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              px: 1.5,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              typography: 'body1',
              color: primary ? 'text.primary' : 'text.secondary',
            }}
          >
            <TableCellContent
              entity={entity}
              name={name}
              row={row}
              rowId={rowId}
              primary={primary}
              serverMissing={missingServer && serverColumns.has(name)}
              actions={actions}
            />
          </Box>
        );
      })}
      <Box role='cell' />
    </Box>
  );
});

interface Props {
  selectedId: string | null;
  onOpenRow: (row: EntityRow) => void;
  onOpenHref: (row: EntityRow) => void;
}

export function ExplorerTable({ selectedId, onOpenRow, onOpenHref }: Props) {
  const { def, universe, derived } = useResults();
  const { dispatch, slots } = useExplorerContext();
  const tab = useActiveTab();
  const entity = def.entity;
  const { rows, rowId } = derived;

  // Unfixed columns are given to TanStack at the width they are drawn at, so
  // a resize starts from what the viewer sees.
  const [measured, setMeasured] = useState<Readonly<Record<string, number>>>({});
  const defaultWidth = useCallback((name: string) => fieldById(entity, name)?.width ?? DEFAULT_WIDTH, [entity]);
  // A Spaces view's Component column is left out while no Space has a Component
  // and the viewer has not sized it: an all-empty column only takes room.
  const shownColumns = useMemo(() => {
    if (entity !== 'Space') return def.columns;
    const component = fieldById('Space', 'Component');
    const empty = !!component && universe.rows.every((r) => component.value(r) === null);
    return empty ? def.columns.filter((c) => c.name !== 'Component' || c.width !== undefined) : def.columns;
  }, [entity, def.columns, universe.rows]);
  const inputs = useMemo(
    () =>
      shownColumns.map((c) => ({
        name: c.name,
        width: c.width ?? contentWidth(entity, c.name) ?? measured[c.name] ?? defaultWidth(c.name),
      })),
    [shownColumns, entity, measured, defaultWidth],
  );
  const onResizeEnd = useCallback((name: string, width: number) => dispatch({ type: 'resizeColumn', name, width }), [dispatch]);
  const table = useExplorerTable(inputs, onResizeEnd);
  const columnNames = useMemo(() => shownColumns.map((c) => c.name), [shownColumns]);
  const labelKeys = useMemo(() => labelKeysOf(entity, universe.rows), [entity, universe.rows]);
  const serverColumns = useMemo(() => new Set(universe.serverColumns), [universe.serverColumns]);

  // The definitions of this view's computed columns (as saved, or kept for a
  // group level or the sort), so a column hidden and added back keeps its source.
  const savedSources = useMemo(() => {
    const sources = new Map<string, ColumnSourceDef>();
    for (const c of tab.baseline?.columns ?? []) if (c.source) sources.set(c.name, c.source);
    for (const [name, source] of Object.entries(def.extraColumnSources ?? {})) sources.set(name, source);
    for (const c of def.columns) if (c.source) sources.set(c.name, c.source);
    return sources;
  }, [tab.baseline, def.extraColumnSources, def.columns]);
  const hiddenViewColumns = useMemo(
    () =>
      [...savedSources.keys()]
        .filter((name) => !def.columns.some((c) => c.name === name))
        .map((name) => ({ id: name, label: headerLabel(entity, name) })),
    [savedSources, def.columns, entity],
  );

  // Folded groups are kept per tab for this visit only; a group key names the
  // same group across renders (`Space=a/Target=b`).
  const [collapsedByTab, setCollapsedByTab] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  const collapsed = useMemo(() => collapsedByTab.get(tab.id) ?? new Set<string>(), [collapsedByTab, tab.id]);
  const toggleGroup = useCallback(
    (key: string) =>
      setCollapsedByTab((prev) => {
        const set = new Set(prev.get(tab.id) ?? []);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        return new Map(prev).set(tab.id, set);
      }),
    [tab.id],
  );

  const groupKey = def.groupBy.join('|');
  const tree = useMemo(() => {
    const levels = def.groupBy.map((f) => groupLevelFor(entity, f)).filter((l): l is NonNullable<typeof l> => l !== null);
    return buildGroupTree(rows, levels);
    // groupKey stands for def.groupBy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, entity, groupKey]);
  const paths = useMemo(() => groupPaths(tree), [tree]);
  const items = useMemo<FlatItem<EntityRow>[]>(() => flattenGroups(rows, tree, collapsed), [rows, tree, collapsed]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  // The drawn widths change with the window and the lens column, which React
  // does not see; a ResizeObserver is the only way to follow them.
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => {
      const next: Record<string, number> = {};
      el.querySelectorAll<HTMLElement>('[role="columnheader"][data-column]').forEach((h) => {
        next[h.dataset.column ?? ''] = Math.round(h.getBoundingClientRect().width);
      });
      setMeasured((prev) => {
        const keys = Object.keys(next);
        return keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k]) ? prev : next;
      });
    };
    const observer = new ResizeObserver(read);
    el.querySelectorAll('[role="columnheader"]').forEach((h) => observer.observe(h));
    read();
    return () => observer.disconnect();
  }, [columnNames]);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.type === 'group' ? GROUP_ROW_HEIGHT : ROW_HEIGHT),
    getItemKey: (i) => {
      const it = items[i];
      return it.type === 'group' ? `g:${it.node.key}` : `r:${rowId(it.row)}`;
    },
    overscan: 12,
  });

  const openPeekForGroup = useCallback(
    (anchorEl: HTMLElement, node: GroupNode<EntityRow>) => {
      const path = paths.get(node.key) ?? [];
      const title = path.map((s) => `${fieldById(entity, s.field)?.label ?? s.field} ${groupValueText(s.value) || 'none'}`).join(' › ');
      slots.current.openPeek({
        anchorEl,
        title,
        lenses: pathLenses(entity, path),
        groupBy: def.groupBy.slice(node.depth + 1),
        rowIds: node.rows.map(rowId),
      });
    },
    [paths, entity, slots, def.groupBy, rowId],
  );

  const actions = useMemo<CellActions>(
    () => ({
      onValue: (anchorEl, id, field, value, additive) => slots.current.openCellPopover({ entity, field, value, rowId: id, anchorEl, additive }),
      onStatus: (anchorEl, status: StatusKind) => {
        // The rows on screen with this status, so the peek's count is the one the chips add up to.
        const has = lensPredicate(entity, { id: 'peek', enabled: true, kind: 'status', status });
        slots.current.openPeek({
          anchorEl,
          title: STATUS_LABEL[status],
          lenses: [{ kind: 'status', status }],
          groupBy: def.groupBy,
          rowIds: has ? rows.filter(has).map(rowId) : undefined,
        });
      },
    }),
    [slots, entity, def.groupBy, rows, rowId],
  );

  const onOpen = useCallback(
    (row: EntityRow, e: MouseEvent | KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) onOpenHref(row);
      else onOpenRow(row);
    },
    [onOpenRow, onOpenHref],
  );

  const onFilter = useCallback(
    (field: string, anchorEl: HTMLElement | null) => slots.current.startLens({ field, anchorEl: anchorEl ?? undefined }),
    [slots],
  );
  const onGroupValue = useCallback(
    (anchorEl: HTMLElement, field: string, value: string | null, additive: boolean) =>
      slots.current.openCellPopover({ entity, field, value, rowId: '', anchorEl, additive }),
    [slots, entity],
  );

  // A header dropped on another header moves the column there. A drop on the
  // Group section is handled by its owner; this one ignores it.
  const reorder = useMemo<DndHandler>(
    () => ({
      onDragEnd: (e) => {
        const item = dragItemOf(e);
        const over = e.over?.data.current as { kind?: string; field?: string } | undefined;
        if (item?.type !== 'column-header' || over?.kind !== 'column-slot' || !over.field || over.field === item.field) return;
        const from = def.columns.findIndex((c) => c.name === item.field);
        const to = def.columns.findIndex((c) => c.name === over.field);
        if (from !== -1 && to !== -1) dispatch({ type: 'moveColumn', from, to });
      },
    }),
    [def.columns, dispatch],
  );
  useDndHandler('column-header', reorder);

  const fixedNames = useMemo(() => new Set(def.columns.filter((c) => c.width !== undefined).map((c) => c.name)), [def.columns]);
  const { template, minWidth } = gridTemplate(
    table.columns.map((column) => ({
      column,
      fixed: fixedNames.has(column.name) || column.isResizing || contentWidth(entity, column.name) !== null,
      weight: defaultWidth(column.name),
    })),
  );
  const gridStyle = { '--vx-grid': template } as CSSProperties;
  const virtualItems = virtualizer.getVirtualItems();

  let body;
  if (universe.isLoading) {
    body = (
      <Box data-testid='vx-loading-rows'>
        {Array.from({ length: 10 }, (_, i) => (
          <Box key={i} sx={{ height: ROW_HEIGHT, px: 1.5, display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'grey.200' }}>
            <Skeleton variant='text' width={`${40 + ((i * 17) % 45)}%`} />
          </Box>
        ))}
      </Box>
    );
  } else if (universe.isError) {
    body = (
      <Alert severity='error' sx={{ m: 2 }} action={<Button size='small' onClick={universe.refetch}>Retry</Button>}>
        The {NOUN[entity]} could not be loaded.
      </Alert>
    );
  } else if (items.length === 0) {
    body = (
      <Box sx={{ py: 8, textAlign: 'center' }} data-testid='vx-empty'>
        <Typography variant='h3'>No {NOUN[entity]} match</Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
          {derived.total ? 'Turn off a filter, or press ⌘Z to undo the last change.' : `There are no ${NOUN[entity]} yet.`}
        </Typography>
      </Box>
    );
  } else {
    body = (
      <Box role='rowgroup' sx={{ position: 'relative', height: virtualizer.getTotalSize() }}>
        {virtualItems.map((v) => {
          const item = items[v.index];
          return (
            <Box
              key={v.key}
              data-index={v.index}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: v.size, transform: `translateY(${v.start}px)` }}
            >
              {item.type === 'group' ? (
                <GroupHeaderRow
                  entity={entity}
                  node={item.node}
                  collapsed={collapsed.has(item.node.key)}
                  rowIndex={v.index + 2}
                  onToggle={toggleGroup}
                  onPeek={openPeekForGroup}
                  onValue={onGroupValue}
                />
              ) : (
                <TableRow
                  entity={entity}
                  row={item.row}
                  rowId={rowId(item.row)}
                  columns={columnNames}
                  missingServer={universe.rowsWithoutServerColumns.has(rowId(item.row))}
                  serverColumns={serverColumns}
                  selected={selectedId === rowId(item.row)}
                  rowIndex={v.index + 2}
                  actions={actions}
                  onOpen={onOpen}
                />
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box
      ref={scrollRef}
      role='table'
      aria-label='Results'
      aria-rowcount={items.length + 1}
      data-testid='vx-table'
      style={gridStyle}
      sx={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative', overscrollBehavior: 'contain' }}
    >
      <Box sx={{ minWidth, width: '100%' }}>
        <Box
          ref={headerRef}
          role='row'
          aria-rowindex={1}
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 3,
            display: 'grid',
            gridTemplateColumns: 'var(--vx-grid)',
            height: HEADER_HEIGHT,
            bgcolor: 'background.default',
            borderBottom: 1,
            borderColor: 'divider',
            userSelect: table.isResizing ? 'none' : undefined,
          }}
        >
          <SortableContext items={columnNames} strategy={horizontalListSortingStrategy}>
            {table.columns.map((c) => {
              const field = fieldById(entity, c.name);
              return (
                <HeaderCell
                  key={c.name}
                  entity={entity}
                  name={c.name}
                  label={headerLabel(entity, c.name)}
                  def={def}
                  visible={columnNames}
                  known={!!field}
                  filterable={!!field?.where}
                  isResizing={c.isResizing}
                  width={c.width}
                  onResizeStart={c.onResizeStart}
                  onNudge={(delta) => table.nudge(c.name, delta)}
                  onNudgeEnd={() => table.commitNudge(c.name)}
                  dispatch={dispatch}
                  onFilter={onFilter}
                />
              );
            })}
          </SortableContext>
          <Box role='columnheader' sx={{ display: 'grid', placeItems: 'center', color: 'text.disabled' }}>
            <AddColumnButton
              entity={entity}
              visible={def.columns.map((c) => c.name)}
              labelKeys={labelKeys}
              viewColumns={hiddenViewColumns}
              onAdd={(name) => {
                const source = savedSources.get(name);
                dispatch({ type: 'setColumns', columns: [...def.columns, source ? { name, source } : { name }] });
              }}
            />
          </Box>
        </Box>
        {body}
      </Box>
    </Box>
  );
}
