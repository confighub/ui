// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import { DataGridToolbar } from '@/components/unit-data-grid/components/DataGridToolbar';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { UnitEventRead } from '@confighub/rtk-query';
import { useListUnitEventsQuery } from '@confighub/rtk-query';

import { StripedDataGrid } from '../../../../components/styled';
import { EmptyEvents } from '../empty-events/EmptyEvents';
import { createUnitEventTableColumns, type UnitEventRow } from './unit-event-columns';

export interface IUnitEventsProps {
  unitId: string;
  spaceId: string;
}

// Re-export for external use
export type { UnitEventRow };

export const UnitEventsTable = ({ unitId = '', spaceId = '' }: IUnitEventsProps) => {
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
  } = useGridPersistence('unit-events-table', {
    sortModel: [{ field: 'unitEventNum', sort: 'desc' }],
    columnVisibility: {
      unitEventNum: true,
      actionType: true,
      revisionNum: true,
      status: true,
      message: true,
      startedAt: true,
      terminatedAt: true,
      createdAt: false,
    } as Record<string, boolean>,
  });
  const { data: actions = [] } = useListUnitEventsQuery({
    spaceId,
    unitId,
  });

  const actionRows: UnitEventRow[] = actions?.map((event: UnitEventRead) => ({
    id: event.UnitEventID || '',
    unitEventNum: event.UnitEventNum ?? null,
    actionType: event.Action || '',
    status: event.Status || '',
    message: event.Message || '',
    createdAt: event.CreatedAt || '',
    startedAt: event.StartedAt || null,
    terminatedAt: event.TerminatedAt || null,
    revisionNum: event.RevisionNum || null,
  }));

  // Memoize base columns definition
  const baseColumns = useMemo(() => createUnitEventTableColumns(), []);

  // Apply stored widths to columns
  const columns = useMemo(
    () => applyStoredWidths(baseColumns),
    [applyStoredWidths, baseColumns]
  );

  const filteredColumns = useMemo(() => columns.filter(Boolean), [columns]);

  const Toolbar = () => (
    <DataGridToolbar hasStateChanged={hasStateChanged} onResetState={clearStoredState} />
  );

  return actionRows?.length > 0 ? (
    <StripedDataGrid
      sx={{
        '& .MuiDataGrid-row': {
          cursor: 'pointer',
        },
      }}
      rows={[...actionRows]}
      // @ts-expect-error MUI styled() loses generic type parameter
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
        ...DATE_TIME_GRID_SLOTS,
        toolbar: Toolbar,
      }}
      getRowClassName={(params) =>
        params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd'
      }
      disableRowSelectionOnClick
      pageSizeOptions={[25, 50, 100]}
      rowHeight={40}
    />
  ) : (
    <EmptyEvents />
  );
};
