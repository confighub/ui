// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { DATE_TIME_GRID_SLOTS, DateTimeCell } from '@/components/data-grid/cells';
import { type ColumnGroup, type DynamicGroupConfig } from '@/components/entity-data-grid/column-groups-types';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { useAttributeColumnManager } from '@/components/entity-data-grid/hooks/useAttributeColumnManager';
import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell } from '@/components/styled';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { ExtendedLinkRead, Space, Unit } from '@confighub/rtk-query';
import { CmpProps } from '@/types';
import { isGoZeroTime } from '@/utility/datetime-utils';
import Typography from '@mui/material/Typography';
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';

import { LinkDrawer } from '../link-drawer/LinkDrawer';

/** The entities a Links list includes, which the table's columns and the Link drawer name */
export const LINK_INCLUDE = 'FromUnitID,ToUnitID,SpaceID,ToSpaceID,TransformInvocationID';

/**
 * LinkRow represents a single row in the links table, combining link data with a unique ID
 */
export type LinkRow = { id: string } & ExtendedLinkRead;

// Define all possible column fields for type safety
type LinkColumnFields = 'slug' | 'from' | 'fromSpace' | 'to' | 'toSpace' | 'updateType' | 'autoUpdate' | 'stale' | 'whereMutation' | 'whereResource' | 'upstreamLastMergedRev' | 'downstreamLastMergedRev' | 'hiddenReason' | 'createdAt' | 'updatedAt';

// Create a type that requires all columns to be specified
type LinkColumnVisibility = Record<LinkColumnFields, boolean>;

export interface LinksTableProps extends CmpProps {
  rows: Array<LinkRow> | undefined;
  onLinkAction?: () => void;
  /** The LinkIDs checked in the table's first column, which Update and Delete act on. */
  selectedRows?: string[];
  onRowSelected?: (linkIds: string[]) => void;
  /** Where the grid keeps its column choices; each page that lists Links has its own. */
  persistenceKey?: string;
  isLoading?: boolean;
  /** The filters, rendered below the toolbar */
  filterElement?: React.ReactNode;
  /** Controls for the toolbar, before its Columns button */
  customToolbarActions?: React.ReactNode;
  /** Shown in the grid when Links exist but none is shown */
  noRowsOverlay?: React.ReactNode;
  /** Shown instead of the grid when there are no Links at all */
  emptyState?: React.ReactNode;
  hasNoData?: boolean;
}

/** The column picker's groups; the Labels group lists the label keys of the Links shown. */
const LINK_COLUMN_GROUPS: ColumnGroup[] = [
  { header: 'Core Identity', columns: ['slug', 'from', 'fromSpace', 'to', 'toSpace', 'hiddenReason'] },
  {
    header: 'Updates',
    columns: ['updateType', 'autoUpdate', 'stale', 'whereMutation', 'whereResource', 'upstreamLastMergedRev', 'downstreamLastMergedRev'],
  },
  { header: 'Timestamps', columns: ['createdAt', 'updatedAt'] },
];
const LINK_DYNAMIC_GROUPS: DynamicGroupConfig[] = [{ name: 'Labels', columnPrefix: 'Labels.' }];

const LINK_LABELS = {
  fieldName: 'Labels',
  columnPrefix: 'Labels.',
  getAttributes: (row: LinkRow) => row.Link?.Labels,
};

/**
 * LinksTable displays a data grid of links between units, with the same columns wherever Links are
 * listed. A Link's name opens its drawer, which shows and edits it; the checked rows are what the
 * page's Update and Delete act on.
 */
export const LinksTable = (props: LinksTableProps) => {
  const {
    rows = [],
    onLinkAction,
    selectedRows = [],
    onRowSelected,
    persistenceKey = 'links-table',
    isLoading,
    filterElement,
    customToolbarActions,
    noRowsOverlay,
    emptyState,
    hasNoData,
  } = props;
  const {
    handleColumnResize,
    applyStoredWidths,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    sortModel,
    onSortModelChange,
    clearStoredState,
    hasStateChanged,
  } = useGridPersistence(persistenceKey, {
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

  // A column for each label key of the Links shown, hidden unless chosen
  const { availableAttributeKeys, createAttributeColumn } = useAttributeColumnManager(rows, {
    attributeConfigs: [LINK_LABELS],
  });
  const labelColumns = useMemo(
    () => (availableAttributeKeys.get('Labels') || []).map((label) => createAttributeColumn(LINK_LABELS, label)),
    [availableAttributeKeys, createAttributeColumn],
  );

  // Apply stored widths to columns
  const columns = useMemo(
    () => applyStoredWidths([...baseColumns, ...labelColumns] as GridColDef<Record<string, unknown>>[]),
    [applyStoredWidths, baseColumns, labelColumns]
  );

  const effectiveColumnVisibilityModel = useMemo(() => {
    const labelVisibility = Object.fromEntries(labelColumns.map((col) => [col.field, false]));
    return { ...labelVisibility, ...columnVisibilityModel };
  }, [labelColumns, columnVisibilityModel]);

  return (
    <>
      <EntityDataGrid
        rows={rows}
        columns={columns}
        loading={isLoading}
        onColumnWidthChange={handleColumnResize}
        columnVisibilityModel={effectiveColumnVisibilityModel}
        onColumnVisibilityModelChange={onColumnVisibilityModelChange}
        sortModel={sortModel}
        onSortModelChange={onSortModelChange}
        onClearState={clearStoredState}
        hasStateChanged={hasStateChanged}
        columnGroups={LINK_COLUMN_GROUPS}
        dynamicGroups={LINK_DYNAMIC_GROUPS}
        filterElement={filterElement}
        customToolbarActions={customToolbarActions}
        noRowsOverlay={noRowsOverlay}
        emptyState={emptyState}
        hasNoData={hasNoData}
        slots={DATE_TIME_GRID_SLOTS}
        disableRowSelectionOnClick
        checkboxSelection={!!onRowSelected}
        rowSelectionModel={selectedRows}
        // The grid's model is the row IDs, which are LinkIDs.
        onRowSelectionModelChange={(model: GridRowSelectionModel) => onRowSelected?.(model.map(String))}
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
