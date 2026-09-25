// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { DATE_TIME_GRID_SLOTS, DateTimeCell } from '@/components/data-grid/cells';
import { ErrorBox } from '@/components/error-box/ErrorBox';
import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell, StripedDataGrid } from '@/components/styled';
import { DataGridToolbar } from '@/components/unit-data-grid/components/DataGridToolbar';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  ExtendedLinkRead,
  Link,
  LinkRead,
  Space,
  Unit,
  UnitRead,
  useDeleteLinkMutation,
} from '@confighub/rtk-query';
import { CmpProps } from '@/types';
import { isGoZeroTime } from '@/utility/datetime-utils';
import DeleteIcon from '@mui/icons-material/Delete';
import ModeEditIcon from '@mui/icons-material/ModeEdit';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { GridColDef } from '@mui/x-data-grid';

import { UpdateLinksModal } from '../update-links-modal/UpdateLinksModal';

/**
 * LinkRow represents a single row in the links table, combining link data with a unique ID
 */
export type LinkRow = { id: string } & ExtendedLinkRead;

// Define all possible column fields for type safety
type LinkColumnFields = 'slug' | 'from' | 'to' | 'toSpace' | 'updateType' | 'autoUpdate' | 'useLiveState' | 'whereMutation' | 'whereResource' | 'upstreamLastMergedRev' | 'downstreamLastMergedRev' | 'createdAt' | 'updatedAt' | 'actions';

// Create a type that requires all columns to be specified
type LinkColumnVisibility = Record<LinkColumnFields, boolean>;

export interface LinksTableProps extends CmpProps {
  rows: Array<LinkRow> | undefined;
  onLinkAction?: () => void;
}

/**
 * LinksTable displays a data grid of links between units with edit and delete operations.
 */
export const LinksTable = (props: LinksTableProps) => {
  const { rows = [], onLinkAction } = props;
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
      to: true,
      toSpace: true,
      updateType: true,
      autoUpdate: false,
      useLiveState: false,
      whereMutation: false,
      whereResource: false,
      upstreamLastMergedRev: false,
      downstreamLastMergedRev: false,
      createdAt: false,
      updatedAt: true,
      actions: true,
    } satisfies LinkColumnVisibility,
  });

  const [isLinkDeleteConfirmationOpen, setIsLinkDeleteConfirmationOpen] = useState(false);
  const [selectedLinkID, setSelectedLinkID] = useState<string>('');
  const [isUpdateLinksModalOpen, setIsUpdateLinksModalOpen] = useState(false);
  const [editLinkFrom, setEditLinkFrom] = useState<UnitRead>({} as UnitRead);
  const [editLinkTo, setEditLinkTo] = useState<UnitRead>({} as UnitRead);
  const [editLink, setEditLink] = useState<LinkRead>({} as LinkRead);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [deleteLink, { isSuccess: isDeleteSuccess, error: deleteError }] =
    useDeleteLinkMutation();

  const selectedLink: Link =
    rows.find((link) => link.id === selectedLinkID)?.Link || ({} as Link);

  useApiErrorMessage(deleteError, isDeleteSuccess, setErrorMessage);

  const onLinkDelete = async () => {
    const response = await deleteLink({
      spaceId: selectedLink.SpaceID || '',
      linkId: selectedLink.LinkID || '',
    });

    setIsLinkDeleteConfirmationOpen(false);

    if ('data' in response) {
      onLinkAction?.();
    }
  };

  // Memoize base columns definition
  const baseColumns: GridColDef<LinkRow>[] = useMemo(() => [
    {
      field: 'slug',
      headerName: 'Name',
      minWidth: 140,
      flex: 0.8,
      valueGetter: (_, row) => row.Link?.Slug,
      renderCell: (params) => (
        <CenteredTableCell>
          <Typography variant='body1'>{params.row.Link?.Slug}</Typography>
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
    {
      field: 'actions',
      headerName: 'Actions',
      minWidth: 100,
      flex: 0.5,
      renderCell: (params) => {
        const fromUnit = params.row.FromUnit || ({} as UnitRead);
        const toUnit = params.row.ToUnit || ({} as UnitRead);

        return (
          <CenteredTableCell>
            <Stack direction='row' spacing={1}>
              <DeleteIcon
                sx={{ cursor: 'pointer' }}
                color='error'
                onClick={() => {
                  setSelectedLinkID(params.row.id);
                  setIsLinkDeleteConfirmationOpen(true);
                }}
              />
              <ModeEditIcon
                sx={{ cursor: 'pointer' }}
                color='secondary'
                onClick={() => {
                  setEditLinkFrom(fromUnit);
                  setEditLinkTo(toUnit);
                  setEditLink(params.row.Link || ({} as LinkRead));
                  setIsUpdateLinksModalOpen(true);
                }}
              />
            </Stack>
          </CenteredTableCell>
        );
      },
    },
  ], [setSelectedLinkID, setIsLinkDeleteConfirmationOpen, setEditLinkFrom, setEditLinkTo, setEditLink, setIsUpdateLinksModalOpen]);

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
      <ErrorBox
        error={errorMessage}
        sx={{ mt: 1, mb: 1 }}
        onClose={() => setErrorMessage('')}
      />
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
        checkboxSelection={false}
        getRowClassName={(params) =>
          params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd'
        }
        rowHeight={40}
      />
      <ConfirmationModal
        isOpen={isLinkDeleteConfirmationOpen}
        onClose={() => setIsLinkDeleteConfirmationOpen(false)}
        onSubmit={onLinkDelete}
        modalDescriptionText={`Are you sure you want to delete ${selectedLink.Slug || 'the selected link'}?`}
        modalTitleText='Delete Link'
      />
      <UpdateLinksModal
        isOpen={isUpdateLinksModalOpen}
        onClose={() => setIsUpdateLinksModalOpen(false)}
        fromUnit={editLinkFrom}
        toUnit={editLinkTo}
        link={editLink}
        refresh={onLinkAction}
      />
    </>
  );
};
