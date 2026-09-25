// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { Attribute } from '@/types';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { GridColDef, useGridApiRef } from '@mui/x-data-grid';

type AttributeValueRow = Attribute & { id: string };

export interface AttributeValueListTableProps {
  data: Attribute[];
}

export const AttributeValueListTable = ({ data }: AttributeValueListTableProps) => {
  const apiRef = useGridApiRef();
  const initialState = {
    pagination: {
      paginationModel: { page: 0, pageSize: 50 },
    },
    sorting: {
      sortModel: [{ field: 'resourceName', sort: 'asc' as const }],
    },
    columns: {
      columnVisibilityModel: {
        info: false,
        resourceCategory: false,
        resourceNameWithoutScope: false,
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
  } = useGridPersistence('attribute-value-table');

  // Add unique IDs to each row
  const rows: AttributeValueRow[] = useMemo(
    () =>
      data.map((item, index) => ({
        ...item,
        id: `${item.ResourceName || 'unknown'}-${item.AttributeName || 'unknown'}-${index}`,
      })),
    [data],
  );

  // Base columns
  const baseColumns: GridColDef<AttributeValueRow>[] = useMemo(
    () => [
      {
        field: 'spaceName',
        headerName: 'Space',
        flex: 0.7,
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
        flex: 0.8,
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
        field: 'resourceName',
        headerName: 'Resource Name',
        flex: 0.8,
        minWidth: 180,
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
        flex: 0.8,
        minWidth: 150,
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
        field: 'resourceType',
        headerName: 'Resource Type',
        flex: 0.7,
        minWidth: 90,
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
        field: 'attributeName',
        headerName: 'Attribute Name',
        flex: 0.8,
        minWidth: 120,
        groupable: true,
        valueGetter: (_, row) => row.AttributeName,
        renderCell: (params) => {
          return (
            <CenteredTableCell>
              <Ellipses variant='body2'>{params.value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'value',
        headerName: 'Value',
        flex: 0.9,
        minWidth: 180,
        groupable: false,
        valueGetter: (_, row) => {
          if (row.Value === null || row.Value === undefined) return 'null';
          if (typeof row.Value === 'object') return JSON.stringify(row.Value);
          return row.Value.toString();
        },
        renderCell: (params) => {
          if (params.rowNode.type === 'group') {
            return '';
          }
          const value = (() => {
            if (params.row.Value === null || params.row.Value === undefined) return 'null';
            if (typeof params.row.Value === 'object') return JSON.stringify(params.row.Value);
            return params.row.Value.toString();
          })();
          return (
            <CenteredTableCell>
              <Ellipses variant='body2'>{value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'path',
        headerName: 'Path',
        flex: 0.8,
        minWidth: 150,
        groupable: true,
        valueGetter: (_, row) => row.Path,
        renderCell: (params) => {
          // if (params.rowNode.type === 'group') {
          //   return '';
          // }
          return (
            <CenteredTableCell>
              <Ellipses variant='body2'>{params.value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'dataType',
        headerName: 'Data Type',
        flex: 0.5,
        minWidth: 100,
        groupable: true,
        valueGetter: (_, row) => row.DataType,
        renderCell: (params) => {
          return (
            <CenteredTableCell>
              <Ellipses variant='body2'>{params.value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'resourceCategory',
        headerName: 'Resource Category',
        flex: 0.5,
        minWidth: 100,
        groupable: true,
        valueGetter: (_, row) => row.ResourceCategory,
        renderCell: (params) => {
          return (
            <CenteredTableCell>
              <Ellipses variant='body2'>{params.value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'info',
        headerName: 'Info',
        flex: 1,
        minWidth: 200,
        groupable: false,
        valueGetter: (_, row) => (row.Info ? JSON.stringify(row.Info) : ''),
        renderCell: (params) => {
          if (params.rowNode.type === 'group') {
            return '';
          }
          if (!params.row.Info) return <CenteredTableCell>-</CenteredTableCell>;

          const infoString = JSON.stringify(params.row.Info, null, 2);

          return (
            <CenteredTableCell>
              <Tooltip title={<pre>{infoString}</pre>} arrow>
                <Ellipses variant='body2'>{JSON.stringify(params.row.Info)}</Ellipses>
              </Tooltip>
            </CenteredTableCell>
          );
        },
      },
    ],
    [],
  );

  // Combine all columns
  // Apply stored widths to columns
  const columns = useMemo(
    () =>
      applyStoredWidths(
        baseColumns as GridColDef<Record<string, unknown>>[],
      ) as GridColDef<AttributeValueRow>[],
    [applyStoredWidths, baseColumns],
  );

  if (!data || data.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant='body2' color='text.secondary'>
          No attribute values available
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
