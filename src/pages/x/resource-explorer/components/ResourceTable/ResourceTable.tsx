// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import Box from '@mui/material/Box';
import {
  DataGrid,
  GridColDef,
  GridEventListener,
  GridRowParams,
  GridSortModel,
} from '@mui/x-data-grid';

import { ResourceRow } from '../../hooks/useResourceRows';
import { ResourceColumn, ResourceView } from '../../types';
import { getCellValue } from '../../utils';

interface ResourceTableProps {
  view: ResourceView;
  rows: ResourceRow[];
  loading?: boolean;
  onRowClick?: (row: ResourceRow, event: React.MouseEvent) => void;
}

export function ResourceTable({ view, rows, loading, onRowClick }: ResourceTableProps) {
  // Group-by columns are surfaced in the GroupNavPanel tree; suppress them
  // from the grid so they don't take up space duplicating the navigation.
  const visibleColumns = useMemo(() => {
    const grouped = new Set(view.groupBy ?? []);
    return view.columns.filter((c) => !grouped.has(c.name));
  }, [view.columns, view.groupBy]);

  const columns = useMemo<GridColDef<GridRow>[]>(
    () => visibleColumns.map(toGridColDef),
    [visibleColumns],
  );

  const gridRows = useMemo<GridRow[]>(
    () => rows.map((r) => buildGridRow(r, visibleColumns)),
    [rows, visibleColumns],
  );

  const initialSortModel = useMemo<GridSortModel>(() => {
    if (!view.orderBy) return [];
    return [
      {
        field: view.orderBy,
        sort: view.orderByDirection === 'DESC' ? 'desc' : 'asc',
      },
    ];
  }, [view.orderBy, view.orderByDirection]);

  const rowById = useMemo(() => {
    const m = new Map<string, ResourceRow>();
    rows.forEach((r) => m.set(r.id, r));
    return m;
  }, [rows]);

  const handleRowClick: GridEventListener<'rowClick'> | undefined = useMemo(() => {
    if (!onRowClick) return undefined;
    return (params: GridRowParams<GridRow>, event: React.MouseEvent) => {
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
        initialState={{ sorting: { sortModel: initialSortModel } }}
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
        localeText={{ noRowsLabel: 'No resources match the current filter.' }}
      />
    </Box>
  );
}

interface GridRow {
  id: string;
  [field: string]: string;
}

function buildGridRow(row: ResourceRow, cols: ResourceColumn[]): GridRow {
  const out: GridRow = { id: row.id };
  for (const col of cols) {
    out[col.name] = getCellValue(row, col);
  }
  return out;
}

function toGridColDef(col: ResourceColumn): GridColDef<GridRow> {
  return {
    field: col.name,
    headerName: col.name,
    flex: 1,
    minWidth: 120,
    valueGetter: (value: string | undefined) => value ?? '',
  };
}
