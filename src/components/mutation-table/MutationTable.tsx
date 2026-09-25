// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell, Ellipses, StripedDataGrid } from '@/components/styled';
import { EmptyMutations } from '@/components/mutation-table/components/empty-mutations/EmptyMutations';
import { DataGridToolbar } from '@/components/unit-data-grid/components/DataGridToolbar';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import {
  ExtendedMutationRead,
  ExtendedUnitRead,
  useListExtendedMutationsQuery,
} from '@confighub/rtk-query';
import { CmpProps } from '@/types';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { GridColDef } from '@mui/x-data-grid';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

export interface IMutationsTableProps extends CmpProps {
  unitExtended: ExtendedUnitRead;
  onTabSelected: (tab: number) => void;
}

export type MutationRow = { id: string } & ExtendedMutationRead;

dayjs.extend(relativeTime);

export const MutationsTable = ({ unitExtended, onTabSelected }: IMutationsTableProps) => {
  const {
    handleColumnResize,
    applyStoredWidths,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    sortModel,
    onSortModelChange,
    filterModel,
    onFilterModelChange,
    paginationModel,
    onPaginationModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence('mutations-table', {
    sortModel: [{ field: 'mutationNum', sort: 'desc' }],
  });
  const unitId = unitExtended?.Unit?.UnitID || '';
  const spaceId = unitExtended?.Unit?.SpaceID || '';

  const { mutations = [] } = useListExtendedMutationsQuery(
    {
      spaceId,
      unitId,
      include: 'RevisionID,LinkID,TriggerID,SpaceID,UnitID',
    },
    {
      selectFromResult: ({ data }) => ({
        mutations: data?.map((mutation) => ({
          id: mutation.Mutation?.MutationID,
          ...mutation,
        })),
      }),
      skip: !spaceId || !unitId,
    },
  );

  // Memoize base columns definition
  const baseColumns: GridColDef<MutationRow>[] = useMemo(() => [
    {
      field: 'mutationNum',
      headerName: 'Num',
      flex: 0.25,
      minWidth: 100,
      valueGetter: (_, row) => row?.Mutation?.MutationNum,
      renderCell: (params) => (
        <CenteredTableCell>
          <Ellipses variant='body1'>{params.row?.Mutation?.MutationNum}</Ellipses>
        </CenteredTableCell>
      ),
    },
    {
      field: 'source',
      headerName: 'Source',
      flex: 0.7,
      minWidth: 100,
      valueGetter: (_, row) => row?.Revision?.Source,
      renderCell: (params) => (
        <CenteredTableCell>
          <Ellipses variant='body1'>{params.row?.Revision?.Source}</Ellipses>
        </CenteredTableCell>
      ),
    },
    {
      field: 'trigger',
      headerName: 'Trigger',
      flex: 0.7,
      minWidth: 100,
      valueGetter: (_, row) => row?.Trigger?.Slug,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row?.Trigger?.Slug} arrow>
            <NavLink
              to={`/triggers/${params.row?.Space?.SpaceID}/${params.row?.Trigger?.TriggerID}`}
            >
              <Ellipses variant='body1' sx={{ textDecoration: 'underline' }}>
                {params.row?.Trigger?.Slug}
              </Ellipses>
            </NavLink>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'link',
      headerName: 'Link',
      flex: 0.8,
      minWidth: 100,
      valueGetter: (_, row) => row?.Link?.Slug,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row?.Link?.Slug} arrow>
            <Ellipses
              variant='body1'
              sx={{ textDecoration: 'underline', cursor: 'pointer' }}
              onClick={() => onTabSelected(3)}
            >
              {params.row?.Link?.Slug}
            </Ellipses>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'functionName',
      headerName: 'Function Name',
      flex: 0.8,
      minWidth: 100,
      valueGetter: (_, row) => row?.Mutation?.FunctionInvocation?.FunctionName,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row?.Mutation?.FunctionInvocation?.FunctionName} arrow>
            <Ellipses variant='body1'>
              {params.row?.Mutation?.FunctionInvocation?.FunctionName}
            </Ellipses>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'arguments',
      headerName: 'Arguments',
      minWidth: 150,
      flex: 1,
      valueGetter: (_, row) => row?.Trigger?.Arguments,
      renderCell: (params) => {
        const functionArgs = params.row?.Mutation?.FunctionInvocation?.Arguments || [];
        const triggerArgs = params.row?.Trigger?.Arguments || [];

        // Use functionArgs if available, otherwise fallback to triggerArgs
        const aggregatedArguments = (functionArgs.length > 0 ? functionArgs : triggerArgs)
          .map((arg) => `${arg.ParameterName || 'arg'}=${arg.Value?.toString() || ''}`)
          .join(', '); // Aggregate arguments as a comma-separated string
        return (
          <CenteredTableCell>
            {aggregatedArguments && aggregatedArguments.length > 0 && (
              <Tooltip title={aggregatedArguments} arrow>
                <Chip
                  key={params.row.id}
                  label={aggregatedArguments} // Display the aggregated arguments
                  size='small'
                />
              </Tooltip>
            )}
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'providedPath',
      headerName: 'Provided Path',
      flex: 1,
      minWidth: 130,
      valueGetter: (_, row) => row?.Mutation?.ProvidedPath,
      renderCell: (params) => (
        <CenteredTableCell>
          <Tooltip title={params.row?.Mutation?.ProvidedPath} arrow>
            <Ellipses variant='body1'>{params.row?.Mutation?.ProvidedPath}</Ellipses>
          </Tooltip>
        </CenteredTableCell>
      ),
    },
    {
      field: 'revisionNum',
      headerName: 'Revision Num',
      flex: 0.5,
      minWidth: 80,
      valueGetter: (_, row) => row?.Mutation?.RevisionNum,
      renderCell: (params) => (
        <CenteredTableCell>
          <Ellipses variant='body1'>{params.row?.Mutation?.RevisionNum}</Ellipses>
        </CenteredTableCell>
      ),
    },
  ] as GridColDef<MutationRow>[], [onTabSelected]);

  // Apply stored widths to columns
  const columns = useMemo(
    () => applyStoredWidths(baseColumns),
    [applyStoredWidths, baseColumns]
  );

  const filteredColumns = useMemo(() => columns.filter(Boolean), [columns]);

  const Toolbar = () => (
    <DataGridToolbar hasStateChanged={hasStateChanged} onResetState={clearStoredState} />
  );

  return mutations && mutations.length > 0 ? (
    <StripedDataGrid
      rows={[...mutations]}
      // @ts-expect-error It's fine
      columns={filteredColumns}
      onColumnWidthChange={handleColumnResize}
      columnVisibilityModel={columnVisibilityModel}
      onColumnVisibilityModelChange={onColumnVisibilityModelChange}
      sortModel={sortModel}
      onSortModelChange={onSortModelChange}
      filterModel={filterModel}
      onFilterModelChange={onFilterModelChange}
      paginationModel={paginationModel}
      onPaginationModelChange={onPaginationModelChange}
      slots={{
        toolbar: Toolbar,
      }}
      getRowClassName={(params) =>
        params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd'
      }
      disableRowSelectionOnClick
      rowHeight={40}
    />
  ) : (
    <EmptyMutations />
  );
};
