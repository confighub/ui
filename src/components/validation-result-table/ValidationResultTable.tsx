// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { CmpProps } from '@/types';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { GridColDef, GridRowSelectionModel, useGridApiRef } from '@mui/x-data-grid';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

export type ValidationResultRows = {
  id: string;
  name: string | React.ReactNode;
  isSuccess: boolean;
  validationResult: string;
  validationErrors: Record<string, boolean>;
  labels: Record<string, string>;
  lastChangeDescription: string;
  headRevision: number;
  lastReleasedRevision: number;
  spaceName: string;
  /** SpaceID for linking to unit details page */
  spaceId?: string;
};

export interface ValidationResultTableProps extends CmpProps {
  rows: Array<ValidationResultRows> | undefined;
  /** Callback fired when row selection changes, receives array of selected unit IDs */
  onSelectionChange?: (selectedUnitIds: string[]) => void;
  /** Unit IDs to be pre-selected when the component mounts */
  defaultSelectedUnitIds?: string[];
}

export const ValidationResultTable = (props: ValidationResultTableProps) => {
  const { rows = [], onSelectionChange, defaultSelectedUnitIds = [] } = props;
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>(
    () => defaultSelectedUnitIds,
  );

  const handleRowSelectionModelChange = useCallback(
    (newSelectionModel: GridRowSelectionModel) => {
      setRowSelectionModel(newSelectionModel);
      if (onSelectionChange) {
        // GridRowSelectionModel is an array of row IDs (which are unit IDs)
        const selectedIds = newSelectionModel.map((id) => String(id));
        onSelectionChange(selectedIds);
      }
    },
    [onSelectionChange],
  );

  const apiRef = useGridApiRef();
  const initialState = {
    pagination: {
      paginationModel: { page: 0, pageSize: 50 },
    },
    sorting: {
      sortModel: [{ field: 'name', sort: 'asc' as const }],
    },
  };

  const {
    handleColumnResize,
    applyStoredWidths,
    onSortModelChange,
    onColumnVisibilityModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence('validation-result-table');

  dayjs.extend(relativeTime);
  const baseColumns: GridColDef<ValidationResultRows>[] = (
    [
      {
        field: 'spaceName',
        headerName: 'Space',
        flex: 0.7,
        minWidth: 150,
        groupable: true,
        valueGetter: (_, row) => row.spaceName,
        renderCell: (params) => (
          <CenteredTableCell>
            <Ellipses variant='body1'>{params.value}</Ellipses>
          </CenteredTableCell>
        ),
      },
      {
        field: 'name',
        headerName: 'Unit Name',
        flex: 1,
        minWidth: 130,
        groupable: true,
        valueGetter: (_, row) =>
          typeof row.name === 'string' ? row.name : String(row.name || ''),
        renderCell: (params) => {
          return (
            <CenteredTableCell>
              <Tooltip title={<>{params.row?.id}</>} arrow>
                <span>
                  <NavLink to={`/units/${params.row?.spaceId}/${params.row.id}`}>
                    <Ellipses
                      variant='body1'
                      sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      {params.value}
                    </Ellipses>
                  </NavLink>
                </span>
              </Tooltip>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'validationResult',
        headerName: 'Result',
        flex: 1.5,
        minWidth: 200,
        groupable: true,
        valueGetter: (_, row) => {
          try {
            const result = JSON.parse(row.validationResult || '[{ Passed: false }]')?.[0]
              ?.Passed;
            return result ? 'Passed' : 'Failed';
          } catch {
            return 'Failed';
          }
        },
        renderCell: (params) => {
          // For group rows, show the group value directly
          if (params.rowNode.type === 'group') {
            return (
              <CenteredTableCell>
                <Typography variant='body1' fontWeight='medium'>
                  {params.value}
                </Typography>
              </CenteredTableCell>
            );
          }

          // For regular rows, show "Passed: true/false"
          // const passed = (() => {
          //   try {
          //     return JSON.parse(params.row.validationResult || '[{ Passed: false }]')?.[0]
          //       ?.Passed;
          //   } catch {
          //     return false;
          //   }
          // })();
          return (
            <CenteredTableCell>
              <Typography variant='body1'>{`${params.value}`}</Typography>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'validationErrors',
        headerName: 'Validation Errors',
        flex: 2,
        minWidth: 200,
        groupable: false,
        valueGetter: (_, row) => Object.entries(row.validationErrors || {}).length,
        renderCell: (params) => (
          <CenteredTableCell sx={{ justifyContent: 'center' }}>
            <Tooltip
              title={Object.entries(params.row.validationErrors || {})
                .map(([key]) => key)
                .join(', ')}
              arrow
            >
              {Object.entries(params.row.validationErrors || {}).length !== 0 ? (
                <Chip color='error' label={Object.entries(params.row.validationErrors).length} />
              ) : (
                <></>
              )}
            </Tooltip>
          </CenteredTableCell>
        ),
      },
      {
        field: 'lastChangeDescription',
        headerName: 'Last Change Description',
        minWidth: 100,
        flex: 1.5,
        groupable: true,
        valueGetter: (_, row) => row.lastChangeDescription || '',
        renderCell: (params) => (
          <CenteredTableCell>
            <Ellipses variant='body1'>{params.value}</Ellipses>
          </CenteredTableCell>
        ),
      },
      {
        field: 'headRevision',
        headerName: 'Head Revision',
        minWidth: 100,
        flex: 1,
        groupable: false,
        valueGetter: (_, row) => row.headRevision ?? 0,
        renderCell: (params) => (
          <CenteredTableCell>
            <Tooltip
              title={`You have ${(params.value ?? 0) - (params.row?.lastReleasedRevision ?? 0)} unreleased revisions.`}
              placement='top'
            >
              <Typography variant='body1'>{params.value}</Typography>
            </Tooltip>
          </CenteredTableCell>
        ),
      },
      {
        field: 'lastReleasedRevision',
        headerName: 'Last Released Revision',
        minWidth: 100,
        flex: 1,
        groupable: false,
        valueGetter: (_, row) => row.lastReleasedRevision ?? 0,
        renderCell: (params) => (
          <CenteredTableCell>
            <Tooltip
              title={`You have ${(params.row?.headRevision ?? 0) - (params.value ?? 0)} unreleased revisions.`}
              placement='top'
            >
              <Typography variant='body1'>{params.value}</Typography>
            </Tooltip>
          </CenteredTableCell>
        ),
      },
    ] as GridColDef<ValidationResultRows>[]
  ).filter(Boolean);

  // Combine all columns
  // Apply stored widths to columns
  const columns = useMemo(
    () =>
      applyStoredWidths(
        baseColumns as GridColDef<Record<string, unknown>>[],
      ) as GridColDef<ValidationResultRows>[],
    [applyStoredWidths, baseColumns],
  );

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
      checkboxSelection={!!onSelectionChange}
      rowSelectionModel={rowSelectionModel}
      onRowSelectionModelChange={handleRowSelectionModelChange}
      disableRowSelectionOnClick
    />
  );
};
