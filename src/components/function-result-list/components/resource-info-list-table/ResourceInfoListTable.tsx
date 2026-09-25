// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { GridColDef, useGridApiRef } from '@mui/x-data-grid';

export interface ResourceInfo {
  ResourceCategory: string;
  ResourceName: string;
  ResourceNameWithoutScope: string;
  ResourceType: string;
  UnitName?: string;
  SpaceName?: string;
}

type ResourceInfoRow = ResourceInfo & { id: string };

export interface ResourceInfoListTableProps {
  data: ResourceInfo[];
}

export const ResourceInfoListTable = ({ data }: ResourceInfoListTableProps) => {
  const apiRef = useGridApiRef();
  const initialState = {
    pagination: {
      paginationModel: { page: 0, pageSize: 50 },
    },
    sorting: {
      sortModel: [{ field: 'name', sort: 'asc' as const }],
    },
    columns: {
      columnVisibilityModel: {
        resourceCategory: false,
        dataType: false,
      },
    },
  };

  const {
    handleColumnResize,
    applyStoredWidths,
    onSortModelChange,
    onColumnVisibilityModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence('resource-info-list-table');

  const rows: ResourceInfoRow[] = useMemo(
    () =>
      data.map((item, index) => ({
        ...item,
        id: `${item.ResourceName || 'unknown'}-${index}`,
      })),
    [data],
  );

  const baseColumns: GridColDef<ResourceInfoRow>[] = useMemo(
    () => [
      {
        field: 'spaceName',
        headerName: 'Space',
        flex: 0.9,
        minWidth: 150,
        groupable: true,
        valueGetter: (_, row) => row.SpaceName,
        renderCell: (params) => (
          <CenteredTableCell>
            <Ellipses variant='body2'>{params.value}</Ellipses>
          </CenteredTableCell>
        ),
      },
      {
        field: 'unitName',
        headerName: 'Unit Name',
        flex: 1,
        minWidth: 180,
        groupable: true,
        valueGetter: (_, row) => row.UnitName,
        renderCell: (params) => (
          <CenteredTableCell>
            <Ellipses variant='body2'>{params.value}</Ellipses>
          </CenteredTableCell>
        ),
      },
      {
        field: 'name',
        headerName: 'Resource Name',
        flex: 1.2,
        minWidth: 200,
        groupable: true,
        valueGetter: (_, row) => row.ResourceName,
        renderCell: (params) => {
          return (
            <CenteredTableCell>
              <Ellipses variant='body2'>{params.value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'resourceNameWithoutScope',
        headerName: 'Resource Name Without Scope',
        flex: 1.2,
        minWidth: 200,
        groupable: true,
        valueGetter: (_, row) => row.ResourceNameWithoutScope,
        renderCell: (params) => {
          return (
            <CenteredTableCell>
              <Ellipses variant='body2'>{params.value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'type',
        headerName: 'Type',
        flex: 0.8,
        minWidth: 150,
        groupable: true,
        valueGetter: (_, row) => row.ResourceType,
        renderCell: (params) => {
          return (
            <CenteredTableCell>
              <Ellipses variant='body2'>{params.value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'category',
        headerName: 'Category',
        flex: 0.6,
        minWidth: 100,
        groupable: true,
        valueGetter: (_, row) => row.ResourceCategory,
        renderCell: (params) => {
          return (
            <CenteredTableCell>
              <Ellipses variant='caption'>{params.value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
    ],
    [],
  );

  // Apply stored widths to columns
  const columns = useMemo(
    () =>
      applyStoredWidths(
        baseColumns as GridColDef<Record<string, unknown>>[],
      ) as GridColDef<ResourceInfoRow>[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseColumns],
  );

  if (!data || data.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant='body2' color='text.secondary'>
          No resource information available
        </Typography>
      </Box>
    );
  }

  return (
    <EntityDataGrid
      apiRef={apiRef}
      rows={rows}
      columns={columns}
      initialState={initialState}
      disableAggregation
      onColumnVisibilityModelChange={onColumnVisibilityModelChange}
      onSortModelChange={onSortModelChange}
      onColumnWidthChange={handleColumnResize}
      onClearState={clearStoredState}
      hasStateChanged={hasStateChanged}
    />
  );
};
