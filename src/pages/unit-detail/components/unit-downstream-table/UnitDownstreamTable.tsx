// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { CenteredTableCell, Ellipses, StripedDataGrid } from '@/components/styled';
import { DataGridToolbar } from '@/components/unit-data-grid/components/DataGridToolbar';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { EmptyDownstream } from '@/pages/unit-detail/components/empty-downstream/EmptyDownstream';
import { UnitRead } from '@confighub/rtk-query';
import { useListAllUnitsQuery } from '@confighub/rtk-query';
import { CmpProps } from '@/types';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { GridColDef } from '@mui/x-data-grid';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

export type UnitDownStreamRow = {
  unit: UnitRead;
  id: string;
  upstreamRevisionNum: number;
  spaceSlug: string;
  unitSlug: string;
  lastReleasedRevisionNum: number;
  // TODO:  Action for viewing downstream unit
};

// Define all possible column fields for type safety
type UnitDownstreamColumnFields = 'unitSlug' | 'spaceSlug' | 'upgradeNeeded' | 'upstreamRevisionNum' | 'lastReleasedRevisionNum';

// Create a type that requires all columns to be specified
type UnitDownstreamColumnVisibility = Record<UnitDownstreamColumnFields, boolean>;

// UpstreamUnit.HeadRevisionNum  > unit.UpstreamRevisionNum
export interface UnitDownStreamTableProps extends CmpProps {
  currentUnit: UnitRead;
  onUnitNavigation: (unit: UnitRead) => void;
  onCloneClick?: () => void;
}

export const UnitDownstreamTable = ({
  currentUnit,
  onUnitNavigation,
  onCloneClick,
}: UnitDownStreamTableProps) => {
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
  } = useGridPersistence('unit-downstream-table', {
    sortModel: [{ field: 'number', sort: 'desc' }],
    columnVisibility: {
      unitSlug: true,
      spaceSlug: true,
      upgradeNeeded: true,
      upstreamRevisionNum: true,
      lastReleasedRevisionNum: true,
    } satisfies UnitDownstreamColumnVisibility,
  });
  dayjs.extend(relativeTime);

  const { data: downstreamUnits = [] } = useListAllUnitsQuery({
    include: 'SpaceID',
    where: `UpstreamUnitID = '${currentUnit?.UnitID}'`,
  }, { skip: !currentUnit?.UnitID });

  const rows: UnitDownStreamRow[] = downstreamUnits.map((extUnit) => ({
    unit: extUnit.Unit ?? ({} as UnitRead),
    id: extUnit.Unit?.UnitID ?? '',
    upstreamRevisionNum: extUnit.Unit?.UpstreamRevisionNum ?? 0,
    spaceSlug: extUnit.Space?.Slug ?? extUnit.Unit?.SpaceID ?? '', //spaceID better than empty
    unitSlug: extUnit.Unit?.Slug ?? '',
    lastReleasedRevisionNum: extUnit.Unit?.LastReleasedRevisionNum ?? 0,
  }));

  // Memoize base columns definition
  const baseColumns: GridColDef<UnitDownStreamRow>[] = useMemo(() => [
    {
      field: 'unitSlug',
      headerName: 'Name',
      minWidth: 300,
      flex: 1,
      renderCell: (params) => (
        <CenteredTableCell>
          <Ellipses
            onClick={() => onUnitNavigation(params.row.unit)}
            variant='body1'
            sx={{ textDecoration: 'underline', cursor: 'pointer' }}
          >
            {params.row.unitSlug}
          </Ellipses>
        </CenteredTableCell>
      ),
    },
    {
      field: 'spaceSlug',
      headerName: 'Space Name',
      minWidth: 300,
      flex: 1,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body1'>{params.row.spaceSlug}</Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'upgradeNeeded',
      headerName: 'Upgrade Needed',
      minWidth: 200,
      flex: 1,
      renderCell: (params) => (
        <CenteredTableCell>
          {(currentUnit?.HeadRevisionNum ?? 0) > params.row.upstreamRevisionNum && (
            <Chip label='Yes' color='error' size='small' />
          )}
        </CenteredTableCell>
      ),
    },
    {
      field: 'upstreamRevisionNum',
      headerName: 'Upstream Revision Number',
      minWidth: 200,
      flex: 1,
      // valueGetter is required for sorting to work correctly
      valueGetter: (_, row) => row.upstreamRevisionNum,
      renderCell: (params) => (
        <CenteredTableCell>
          <Ellipses variant='body1'>{params.row.upstreamRevisionNum}</Ellipses>
        </CenteredTableCell>
      ),
    },
    {
      field: 'lastReleasedRevisionNum',
      headerName: 'Last Released Revision Number',
      minWidth: 160,
      flex: 1,
      // valueGetter is required for sorting to work correctly
      valueGetter: (_, row) => row.lastReleasedRevisionNum,
      renderCell: (params) => (
        <CenteredTableCell>
          <Ellipses variant='body1'>{params.row.lastReleasedRevisionNum}</Ellipses>
        </CenteredTableCell>
      ),
    },
  ], [currentUnit, onUnitNavigation]);

  // Apply stored widths to columns
  const columns = useMemo(
    () => applyStoredWidths(baseColumns),
    [applyStoredWidths, baseColumns]
  );

  const Toolbar = () => (
    <DataGridToolbar hasStateChanged={hasStateChanged} onResetState={clearStoredState} />
  );

  return rows.length > 0 ? (
    <StripedDataGrid
      rows={[...rows]}
      // @ts-expect-error I don't know
      columns={columns}
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
      rowHeight={40}
    />
  ) : (
    <EmptyDownstream onCloneClick={onCloneClick} />
  );
};
