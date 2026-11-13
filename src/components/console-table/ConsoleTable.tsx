// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The list consoles' table: the column head, the rows on one CSS grid, and the
 * loading, empty and footer states, with headers that sort.
 *
 * The console passes the rows it matched, already in its own default order.
 * With no sort chosen the rows keep that order; a sort reorders them, and rows
 * that tie keep it too. Clicking a header cycles ascending, descending, then
 * back to the console's order.
 */

import { Fragment, createContext, memo, useContext, useMemo, type ReactNode, type Ref } from 'react';

import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';

import { useTable } from '@tanstack/react-table';

import { ConsoleList, ConsoleLoading } from '@/pages/change-orders/components/ConsoleParts';
import { ABOVE_ROW_LINK_SX, R_MICRO, consoleTokens as T } from '@/pages/change-orders/consoleStyle';

import { consoleTableFeatures, isSortableColumn, toColumnDefs, type ConsoleSorting, type ConsoleTableColumn } from './consoleTableColumns';

export type { ConsoleSortValue, ConsoleSorting, ConsoleTableColumn } from './consoleTableColumns';

/** `data-*` attributes and a test id for a row. */
export type ConsoleRowAttributes = Record<`data-${string}`, string | undefined>;

const HEAD_TEXT_SX = {
  fontSize: 11.5,
  lineHeight: T.lh,
  fontWeight: 700,
  letterSpacing: '.02em',
  textTransform: 'none',
  color: T.ink3,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

const ROW_SX = {
  position: 'relative',
  paddingTop: '11px',
  paddingBottom: '11px',
  borderBottom: `1px solid ${T.line}`,
  textAlign: 'left',
  transition: 'background .1s ease',
  '&:hover': { background: T.surfaceSunk },
  '&:last-of-type': { borderBottom: 'none' },
} as const;

/** Rows a console lets the reader check, to act on them together. */
export interface ConsoleSelection<T> {
  /** The checked rows, by `getRowId`. */
  selectedIds: ReadonlySet<string>;
  onChange: (selectedIds: Set<string>) => void;
  /** The row's checkbox's accessible name, as "Select ChangeSet web". */
  rowLabel: (row: T) => string;
}

interface SelectionContextValue {
  selectedIds: ReadonlySet<string>;
  toggle: (id: string, checked: boolean) => void;
}

// The table hands each row its selection through context, so a console's own rows (`renderRow`)
// get their checkbox from `ConsoleTableRow` without passing anything down.
const SelectionContext = createContext<SelectionContextValue | null>(null);
const RowContext = createContext<{ id: string; label: string } | null>(null);

/** The checkbox column, in the head and in each row, ahead of the console's own grid. */
const SELECT_GRID_SX = { display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', alignItems: 'center' } as const;
const CHECKBOX_SX = { padding: 0, marginLeft: '12px', '& .MuiSvgIcon-root': { fontSize: 18 } } as const;

export interface ConsoleTableRowProps {
  /** The table's grid, so the row's cells sit under its column heads. */
  grid: SxProps<Theme>;
  attributes?: ConsoleRowAttributes;
  rowRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * One row. A console that draws its own rows (`renderRow`) builds them on this,
 * so every console's rows look the same.
 *
 * The row is not a link, because it can hold controls of its own. To open a row,
 * a cell puts the link on the row's name with `ROW_LINK_SX`: the link's ::after
 * covers the row, which is `position: relative`.
 */
export function ConsoleTableRow({ grid, attributes, rowRef, children }: ConsoleTableRowProps) {
  const selection = useContext(SelectionContext);
  const row = useContext(RowContext);
  if (selection === null || row === null) {
    return (
      <Box ref={rowRef} {...attributes} sx={{ ...(grid as object), ...ROW_SX }}>
        {children}
      </Box>
    );
  }
  const checked = selection.selectedIds.has(row.id);
  return (
    <Box ref={rowRef} {...attributes} data-selected={checked ? 'true' : undefined} sx={{ ...SELECT_GRID_SX, ...ROW_SX }}>
      {/* Above the row's link, which covers the row, so checking the row does not open it. */}
      <Box sx={ABOVE_ROW_LINK_SX}>
        <Checkbox
          size="small"
          checked={checked}
          onChange={(event) => selection.toggle(row.id, event.target.checked)}
          inputProps={{ 'aria-label': row.label }}
          sx={CHECKBOX_SX}
        />
      </Box>
      <Box sx={grid}>{children}</Box>
    </Box>
  );
}

interface DefaultRowProps<T> {
  row: T;
  columns: readonly ConsoleTableColumn<T>[];
  grid: SxProps<Theme>;
  rowAttributes?: (row: T) => ConsoleRowAttributes;
}

function DefaultRowInner<T>({ row, columns, grid, rowAttributes }: DefaultRowProps<T>) {
  return (
    <ConsoleTableRow grid={grid} attributes={rowAttributes?.(row)}>
      {columns.map((column) => (
        <Box key={column.id} sx={{ minWidth: 0, ...(column.sx as object), ...(column.cellSx as object) }}>
          {column.cell?.(row)}
        </Box>
      ))}
    </ConsoleTableRow>
  );
}
const DefaultRow = memo(DefaultRowInner) as typeof DefaultRowInner;

const SORT_ICON_SX = { fontSize: 13, flex: 'none' } as const;

function SortHead({
  label,
  sorted,
  onToggle,
  sx,
}: {
  label: string;
  sorted: false | 'asc' | 'desc';
  onToggle: () => void;
  sx?: SxProps<Theme>;
}) {
  const right = (sx as { textAlign?: string } | undefined)?.textAlign === 'right';
  const Icon = sorted === 'desc' ? ArrowDownwardIcon : ArrowUpwardIcon;
  return (
    <Box
      role="columnheader"
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
      // A flex box, not a line box: an inline button on a line box sits off the row's centre by the line's descent.
      sx={{ minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: right ? 'flex-end' : 'flex-start', ...(sx as object) }}
    >
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        sx={{
          all: 'unset',
          boxSizing: 'border-box',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          maxWidth: '100%',
          flexDirection: right ? 'row-reverse' : 'row',
          cursor: 'pointer',
          ...HEAD_TEXT_SX,
          color: sorted === false ? T.ink3 : T.ink,
          '&:hover': { color: T.ink },
          '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 2, borderRadius: R_MICRO },
          // The arrow shows only once there is a sort or a pointer or focus on the head: a column of idle arrows is noise.
          '& .console-sort-icon': { visibility: sorted === false ? 'hidden' : 'visible' },
          '&:hover .console-sort-icon, &:focus-visible .console-sort-icon': { visibility: 'visible' },
        }}
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </Box>
        <Icon aria-hidden="true" className="console-sort-icon" sx={SORT_ICON_SX} />
      </Box>
    </Box>
  );
}

export interface ConsoleTableProps<T> {
  /** The list region's accessible name. */
  label: string;
  /** The rows the console matched, in its default order. */
  data: readonly T[];
  /** Keep this array stable (module scope or `useMemo`); a new one rebuilds the table's columns. */
  columns: readonly ConsoleTableColumn<T>[];
  /** The CSS grid shared by the head and every row: `gridTemplateColumns`, gaps and `@media` breakpoints. */
  grid: SxProps<Theme>;
  getRowId: (row: T) => string;
  /** The sort the table opens with. Empty, the default, is the console's own order. */
  initialSorting?: ConsoleSorting;
  isLoading?: boolean;
  loadingTestId?: string;
  /** Shown when there is no row and nothing is loading, such as a `ConsoleEmpty`. */
  empty: ReactNode;
  /** Under the rows, when there are rows, such as a `ConsoleFooter`. */
  footer?: ReactNode;
  /** A test id and `data-*` attributes for the row. */
  rowAttributes?: (row: T) => ConsoleRowAttributes;
  /**
   * Draws a row in place of the cells of `columns`, for rows with state or reads of
   * their own. Build it on `ConsoleTableRow` with the same `grid`. The cells must be
   * in the order of `columns`.
   */
  renderRow?: (row: T) => ReactNode;
  /** Gives each row a checkbox, and the head one that checks every row shown. */
  selection?: ConsoleSelection<T>;
}

export function ConsoleTable<T extends object>({
  label,
  data,
  columns,
  grid,
  getRowId,
  initialSorting,
  isLoading = false,
  loadingTestId,
  empty,
  footer,
  rowAttributes,
  renderRow,
  selection,
}: ConsoleTableProps<T>) {
  const columnDefs = useMemo(() => toColumnDefs(columns), [columns]);
  const table = useTable({
    features: consoleTableFeatures,
    columns: columnDefs,
    data,
    getRowId: (row) => getRowId(row),
    initialState: { sorting: initialSorting ?? [] },
    enableMultiSort: false,
  });
  const rows = table.getRowModel().rows;

  const selectedIds = selection?.selectedIds;
  const onSelectionChange = selection?.onChange;
  const selectionContext = useMemo<SelectionContextValue | null>(
    () =>
      selectedIds !== undefined && onSelectionChange !== undefined
        ? {
            selectedIds,
            toggle: (id, checked) => {
              const next = new Set(selectedIds);
              if (checked) next.add(id);
              else next.delete(id);
              onSelectionChange(next);
            },
          }
        : null,
    [selectedIds, onSelectionChange],
  );
  const shownIds = rows.map((row) => row.id);
  const shownChecked = selectedIds === undefined ? 0 : shownIds.filter((id) => selectedIds.has(id)).length;

  let body: ReactNode;
  if (isLoading) body = <ConsoleLoading testId={loadingTestId} />;
  else if (rows.length === 0) body = empty;
  else
    body = (
      <>
        {rows.map((row) => (
          <RowContext.Provider key={row.id} value={selection ? { id: row.id, label: selection.rowLabel(row.original) } : null}>
            {renderRow !== undefined ? (
              <Fragment>{renderRow(row.original)}</Fragment>
            ) : (
              <DefaultRow row={row.original} columns={columns} grid={grid} rowAttributes={rowAttributes} />
            )}
          </RowContext.Provider>
        ))}
        {footer}
      </>
    );

  const heads = columns.map((column) => {
    const tableColumn = table.getColumn(column.id);
    if (tableColumn === undefined || !isSortableColumn(column)) {
      return (
        <Typography key={column.id} role="columnheader" component="span" sx={{ ...HEAD_TEXT_SX, ...(column.sx as object) }}>
          {column.header}
        </Typography>
      );
    }
    return (
      <SortHead
        key={column.id}
        label={column.header}
        sorted={tableColumn.getIsSorted()}
        onToggle={() => tableColumn.toggleSorting()}
        sx={column.sx}
      />
    );
  });

  const headSx = { height: 33, borderBottom: `1px solid ${T.line}`, background: T.surfaceSunk };
  return (
    <SelectionContext.Provider value={selectionContext}>
      <ConsoleList label={label}>
        {selection ? (
          <Box role="row" sx={{ ...SELECT_GRID_SX, ...headSx }}>
            <Box>
              <Checkbox
                size="small"
                checked={shownIds.length > 0 && shownChecked === shownIds.length}
                indeterminate={shownChecked > 0 && shownChecked < shownIds.length}
                disabled={shownIds.length === 0}
                onChange={(event) => {
                  const next = new Set(selection.selectedIds);
                  for (const id of shownIds) {
                    if (event.target.checked) next.add(id);
                    else next.delete(id);
                  }
                  selection.onChange(next);
                }}
                inputProps={{ 'aria-label': `Select every ${label} row shown` }}
                sx={CHECKBOX_SX}
              />
            </Box>
            <Box sx={{ ...(grid as object), height: '100%' }}>{heads}</Box>
          </Box>
        ) : (
          <Box role="row" sx={{ ...(grid as object), ...headSx }}>
            {heads}
          </Box>
        )}
        {body}
      </ConsoleList>
    </SelectionContext.Provider>
  );
}
