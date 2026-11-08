// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { DATE_TIME_GRID_SLOTS, DateTimeCell } from '@/components/data-grid/cells';
import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell, StripedDataGrid } from '@/components/styled';
import { DataGridToolbar } from '@/components/unit-data-grid/components/DataGridToolbar';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { ExtendedLinkRead, Space, Unit } from '@confighub/rtk-query';
import { CmpProps } from '@/types';
import { isGoZeroTime } from '@/utility/datetime-utils';
import Typography from '@mui/material/Typography';
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';

import { LinkDrawer } from '../link-drawer/LinkDrawer';

/**
 * LinkRow represents a single row in the links table, combining link data with a unique ID
 */
export type LinkRow = { id: string } & ExtendedLinkRead;

// Define all possible column fields for type safety
type LinkColumnFields = 'slug' | 'from' | 'fromSpace' | 'to' | 'toSpace' | 'updateType' | 'autoUpdate' | 'stale' | 'useLiveState' | 'whereMutation' | 'whereResource' | 'upstreamLastMergedRev' | 'downstreamLastMergedRev' | 'hiddenReason' | 'createdAt' | 'updatedAt';

// Create a type that requires all columns to be specified
type LinkColumnVisibility = Record<LinkColumnFields, boolean>;

export interface LinksTableProps extends CmpProps {
  rows: Array<LinkRow> | undefined;
  onLinkAction?: () => void;
  /** The LinkIDs checked in the table's first column, which the tab deletes. */
  selectedRows?: string[];
  onRowSelected?: (linkIds: string[]) => void;
}

/**
 * LinksTable displays a data grid of links between units. A Link's name opens its drawer, which
 * shows and edits it; the checked rows are what the tab's Delete deletes.
 */
export const LinksTable = (props: LinksTableProps) => {
  const { rows = [], onLinkAction, selectedRows = [], onRowSelected } = props;
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
  } = useGridPersistence('links-table', {
    sortModel: [{ field: 'updatedAt', sort: 'desc' }],
    columnVisibility: {
      slug: true,
      from: true,
      fromSpace: true,
      to: true,
      toSpace: true,
      updateType: true,
      autoUpdate: false,
      stale: true,
      useLiveState: false,
      whereMutation: false,
      whereResource: false,
      upstreamLastMergedRev: false,
      downstreamLastMergedRev: false,
      hiddenReason: false,
      createdAt: false,
      updatedAt: false,
    } satisfies LinkColumnVisibility,
  });

  const [detailsLinkID, setDetailsLinkID] = useState<string>('');
  const detailsLink = rows.find((link) => link.id === detailsLinkID);

  // Memoize base columns definition
  const baseColumns: GridColDef<LinkRow>[] = useMemo(() => [
    {
      field: 'slug',
      headerName: 'Name',
      minWidth: 220,
      flex: 1.2,
      valueGetter: (_, row) => row.Link?.Slug,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography
            variant='body1'
            component='button'
            onClick={() => setDetailsLinkID(params.row.id)}
            sx={{
              cursor: 'pointer',
              textDecoration: 'underline',
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'inherit',
              font: 'inherit',
            }}
            data-testid={`link-details-${params.row.Link?.Slug}`}
          >
            {params.row.Link?.Slug}
          </Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'from',
      headerName: 'From Unit',
      minWidth: 240,
      flex: 1,
      valueGetter: (_, row) => row.FromUnit?.Slug,
      renderCell: (params) => {
        const fromUnit = params.row.FromUnit || ({} as Unit);

        return (
          <CenteredTableCell>
            <NavLink to={`/units/${fromUnit.SpaceID}/${fromUnit.UnitID}`}>
              <Typography
                variant='body1'
                sx={{ cursor: 'pointer', textDecoration: 'underline' }}
              >
                {fromUnit.Slug}
              </Typography>
            </NavLink>
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'fromSpace',
      headerName: 'From Space',
      minWidth: 200,
      flex: 1,
      valueGetter: (_, row) => row.Space?.Slug ?? row.Link?.SpaceSlug,
      renderCell: (params) => {
        const spaceID = params.row.Link?.SpaceID;
        const slug = params.row.Space?.Slug ?? params.row.Link?.SpaceSlug;

        return (
          <CenteredTableCell>
            <NavLink
              to={`/spaces/${spaceID}`}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
            >
              <Typography variant='body1'>{slug}</Typography>
            </NavLink>
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'to',
      headerName: 'To Unit',
      minWidth: 240,
      flex: 1,
      valueGetter: (_, row) => row.ToUnit?.Slug,
      renderCell: (params) => {
        const toUnit = params.row.ToUnit || ({} as Unit);

        return (
          <CenteredTableCell>
            <NavLink to={`/units/${toUnit.SpaceID}/${toUnit.UnitID}`}>
              <Typography
                variant='body1'
                sx={{ cursor: 'pointer', textDecoration: 'underline' }}
              >
                {toUnit.Slug}
              </Typography>
            </NavLink>
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'toSpace',
      headerName: 'To Space',
      minWidth: 240,
      flex: 1,
      valueGetter: (_, row) => row.ToSpace?.Slug,
      renderCell: (params) => {
        const toSpace = params.row.ToSpace || ({} as Space);

        return (
          <CenteredTableCell>
            <NavLink
              to={`/spaces/${toSpace.SpaceID}`}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
            >
              <Typography variant='body1'>{toSpace.Slug}</Typography>
            </NavLink>
          </CenteredTableCell>
        );
      },
    },
    {
      field: 'updateType',
      headerName: 'Update Type',
      minWidth: 120,
      flex: 0.6,
      valueGetter: (_, row) => row.Link?.UpdateType || '',
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body1'>{params.row.Link?.UpdateType}</Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'hiddenReason',
      headerName: 'Hidden Reason',
      minWidth: 120,
      flex: 0.5,
      valueGetter: (_, row) => row.Link?.HiddenReason || '',
    },
    {
      field: 'autoUpdate',
      headerName: 'Auto Update',
      minWidth: 100,
      flex: 0.5,
      valueGetter: (_, row) => row.Link?.AutoUpdate ?? false,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body1'>
            {params.row.Link?.AutoUpdate ? 'true' : ''}
          </Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'stale',
      headerName: 'Stale',
      minWidth: 80,
      flex: 0.4,
      valueGetter: (_, row) => row.Link?.Stale ?? false,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body1'>
            {params.row.Link?.Stale ? 'true' : ''}
          </Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'whereMutation',
      headerName: 'Where Mutation',
      minWidth: 140,
      flex: 0.8,
      valueGetter: (_, row) => row.Link?.WhereMutation || '',
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body1'>{params.row.Link?.WhereMutation}</Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'whereResource',
      headerName: 'Where Resource',
      minWidth: 140,
      flex: 0.8,
      valueGetter: (_, row) => row.Link?.WhereResource || '',
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body1'>{params.row.Link?.WhereResource}</Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'upstreamLastMergedRev',
      headerName: 'Upstream Last Merged Rev',
      minWidth: 160,
      flex: 0.6,
      valueGetter: (_, row) => row.Link?.UpstreamLastMergedRevisionNum ?? 0,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body1'>
            {params.row.Link?.UpstreamLastMergedRevisionNum || ''}
          </Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'downstreamLastMergedRev',
      headerName: 'Downstream Last Merged Rev',
      minWidth: 170,
      flex: 0.6,
      valueGetter: (_, row) => row.Link?.DownstreamLastMergedRevisionNum ?? 0,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body1'>
            {params.row.Link?.DownstreamLastMergedRevisionNum || ''}
          </Typography>
        </CenteredTableCell>
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Created At',
      type: 'dateTime',
      minWidth: 160,
      flex: 1,
      valueGetter: (_, row) => {
        const createdAt = row.Link?.CreatedAt;
        return createdAt && !isGoZeroTime(createdAt) ? new Date(createdAt) : null;
      },
      renderCell: (params) => <DateTimeCell params={params} />,
    },
    {
      field: 'updatedAt',
      headerName: 'Updated At',
      type: 'dateTime',
      minWidth: 160,
      flex: 1,
      valueGetter: (_, row) => {
        const updatedAt = row.Link?.UpdatedAt;
        return updatedAt && !isGoZeroTime(updatedAt) ? new Date(updatedAt) : null;
      },
      renderCell: (params) => <DateTimeCell params={params} />,
    },
  ], [setDetailsLinkID]);

  // Apply stored widths to columns
  const columns = useMemo(
    () => applyStoredWidths(baseColumns),
    [applyStoredWidths, baseColumns]
  );

  const Toolbar = () => (
    <DataGridToolbar hasStateChanged={hasStateChanged} onResetState={clearStoredState} />
  );

  return (
    <>
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
          ...DATE_TIME_GRID_SLOTS,
          toolbar: Toolbar,
        }}
        initialState={{
          pagination: {
            paginationModel: { page: 0, pageSize: 10 },
          },
        }}
        disableRowSelectionOnClick
        checkboxSelection={!!onRowSelected}
        rowSelectionModel={selectedRows}
        // The grid's model is the row IDs, which are LinkIDs.
        onRowSelectionModelChange={(model: GridRowSelectionModel) => onRowSelected?.(model.map(String))}
        getRowClassName={(params) =>
          params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd'
        }
        rowHeight={40}
      />
      <LinkDrawer
        subject={detailsLink ? { mode: 'edit', link: detailsLink } : undefined}
        onClose={() => setDetailsLinkID('')}
        onSaved={() => {
          setDetailsLinkID('');
          onLinkAction?.();
        }}
        onChanged={onLinkAction}
      />
    </>
  );
};
