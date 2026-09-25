// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import Box from '@mui/material/Box';
import { DataGrid, GridColDef, GridRowParams, GridSortModel, GridEventListener } from '@mui/x-data-grid';

import { GroupNavRow, getCellValue } from '../../cell-value';
import { EntityAdapter } from '../../adapters';

/** Insert spaces before uppercase letters in PascalCase. */
function splitPascal(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * Human header for a column name, whichever dialect it was authored in:
 * "HeadRevisionNum" → "Head Revision Num", "Labels.my-key" → "my-key",
 * "Values.MemLimit/none" → "Mem Limit" (the value-recording trigger's slug;
 * the attribute suffix is an implementation detail), "Space.Slug" → "Space",
 * "Unit.Slug" → "Slug", other "Entity.Field" → "Entity Field".
 */
function formatHeaderName(col: string): string {
  if (col.startsWith('Space.Labels.')) {
    return col.slice('Space.Labels.'.length);
  }
  if (col.startsWith('Unit.Labels.')) {
    return col.slice('Unit.Labels.'.length);
  }
  if (col.startsWith('Labels.')) {
    return col.slice('Labels.'.length);
  }
  if (col.startsWith('Values.')) {
    return splitPascal(col.slice('Values.'.length).split('/')[0]);
  }
  if (col === 'Space.Slug') return 'Space';
  if (col === 'Target.Slug') return 'Target';
  if (col === 'Unit.Slug') return 'Slug';
  const entity = col.match(/^(Unit|Space|Target)\.(.+)$/);
  if (entity) {
    return `${entity[1]} ${splitPascal(entity[2])}`;
  }
  return splitPascal(col);
}

export interface EntityTableRow {
  id: string;
  [key: string]: string | undefined;
}

interface EntityTableProps {
  rows: GroupNavRow[];
  adapter: EntityAdapter;
  columnNames: string[];
  orderBy: string;
  orderByDirection: 'ASC' | 'DESC';
  loading?: boolean;
  onRowClick?: (row: GroupNavRow, event: React.MouseEvent) => void;
  /** Maps column name → full Column so structured fields (DataPath) resolve. */
}

function buildRows(
  rows: GroupNavRow[],
  adapter: EntityAdapter,
  columnNames: string[],
): EntityTableRow[] {
  return rows.map((row) => {
    const id = adapter.getRowId(row) ?? Math.random().toString();
    const out: EntityTableRow = { id };
    for (const col of columnNames) {
      out[col] = getCellValue(row, col);
    }
    return out;
  });
}

export function EntityTable({
  rows,
  adapter,
  columnNames,
  orderBy,
  orderByDirection,
  loading,
  onRowClick,
}: EntityTableProps) {
  const effectiveColumns = useMemo(
    () =>
      columnNames.length > 0
        ? columnNames
        : adapter.defaultColumns.map((c) => c.Name),
    [columnNames, adapter],
  );

  const columns = useMemo<GridColDef[]>(
    () =>
      effectiveColumns.map((col) => ({
        field: col,
        headerName: formatHeaderName(col),
        flex: 1,
        minWidth: 120,
        valueGetter: (value: string | undefined) => value ?? '',
      })),
    [effectiveColumns],
  );

  const gridRows = useMemo(
    () => buildRows(rows, adapter, effectiveColumns),
    [rows, adapter, effectiveColumns],
  );

  const initialSortModel = useMemo<GridSortModel>(() => {
    if (!orderBy) return [];
    return [{ field: orderBy, sort: orderByDirection === 'DESC' ? 'desc' : 'asc' }];
  }, [orderBy, orderByDirection]);

  const rowById = useMemo(() => {
    const m = new Map<string, GroupNavRow>();
    rows.forEach((row) => {
      const id = adapter.getRowId(row);
      if (id) m.set(id, row);
    });
    return m;
  }, [rows, adapter]);

  const handleRowClick: GridEventListener<'rowClick'> | undefined = useMemo(() => {
    if (!onRowClick) return undefined;
    return (params: GridRowParams<EntityTableRow>, event: React.MouseEvent) => {
      const row = rowById.get(params.row.id);
      if (row) onRowClick(row, event);
    };
  }, [onRowClick, rowById]);

  return (
    <Box sx={{ flex: 1, minHeight: 0 }}>
      <DataGrid
        rows={gridRows}
        columns={columns}
        loading={loading}
        initialState={{
          sorting: { sortModel: initialSortModel },
        }}
        onRowClick={handleRowClick}
        density='compact'
        disableRowSelectionOnClick
        disableColumnMenu
        hideFooter={gridRows.length <= 100}
        sx={{
          height: '100%',
          cursor: onRowClick ? 'pointer' : 'default',
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 600,
            fontSize: '0.78rem',
            letterSpacing: '0.02em',
          },
        }}
        localeText={{
          noRowsLabel: `No ${adapter.nounPlural} match the current filter.`,
        }}
      />
    </Box>
  );
}
