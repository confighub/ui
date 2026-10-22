// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { DATE_TIME_GRID_SLOTS, DateTimeCell } from '@/components/data-grid/cells';
import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell, StripedDataGrid } from '@/components/styled';
import { DataGridToolbar } from '@/components/unit-data-grid/components/DataGridToolbar';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { isGoZeroTime } from '@/utility/datetime-utils';
import type { ExtendedReleaseRead } from '@confighub/rtk-query';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { GridColDef } from '@mui/x-data-grid';

import {
  deriveHealthPresentation,
  deriveSyncPresentation,
  formatDigest,
  reporterDetailLines,
  type LiveStatus,
  type VitalTone,
} from '../x/apps/liveStatus';
import {
  releaseChangeOrderHref,
  releaseChangeOrderName,
  releaseTagName,
  releaseTargetName,
  releaseUserName,
} from './releaseFields';

/** A row of the table: a Release, keyed by its ReleaseID. */
export type ReleaseRow = { id: string } & ExtendedReleaseRead;

type ReleaseColumnFields =
  | 'releaseNum'
  | 'space'
  | 'tag'
  | 'changeOrder'
  | 'published'
  | 'sync'
  | 'health'
  | 'operation'
  | 'digest'
  | 'unitCount'
  | 'target'
  | 'publishedBy'
  | 'observedAt'
  | 'createdAt';

/** The Chip colour of a live-status tone; the same tones the heatmap colours its cells by. */
const TONE_CHIP_COLOR: Record<VitalTone, 'success' | 'default' | 'info' | 'warning' | 'error'> = {
  ok: 'success',
  neutral: 'default',
  progress: 'info',
  attention: 'warning',
  danger: 'error',
};

const linkStyle = { textDecoration: 'underline', cursor: 'pointer' } as const;

function formatTime(value: string | undefined): Date | null {
  return value && !isGoZeroTime(value) ? new Date(value) : null;
}

/** One axis of a Release's live status in normalized words, or nothing when it was not reported. */
function liveAxisLabel(status: LiveStatus | undefined, axis: 'sync' | 'health'): string {
  const presentation = axis === 'sync' ? deriveSyncPresentation(status) : deriveHealthPresentation(status);
  return presentation?.state ?? '';
}

function LiveAxisCell({ status, axis }: { status: LiveStatus | undefined; axis: 'sync' | 'health' }) {
  const presentation = axis === 'sync' ? deriveSyncPresentation(status) : deriveHealthPresentation(status);
  if (!presentation) return null;
  const detail = [presentation.desc, ...reporterDetailLines(status, axis)].join('. ');
  return (
    <CenteredTableCell>
      <Tooltip title={detail}>
        <Chip
          size='small'
          label={presentation.state}
          color={TONE_CHIP_COLOR[presentation.tone]}
          data-testid={`release-${axis}`}
        />
      </Tooltip>
    </CenteredTableCell>
  );
}

export interface ReleasesTableProps {
  rows: ReleaseRow[];
  isLoading: boolean;
  /** Opens a Release's details. */
  onReleaseSelect: (releaseId: string) => void;
}

/**
 * The Releases of a Component's Spaces, newest first: what `cub release list`
 * shows of each, with its Space, as `cub release list` without `--space` does.
 */
export const ReleasesTable = ({ rows, isLoading, onReleaseSelect }: ReleasesTableProps) => {
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
  } = useGridPersistence('releases-table', {
    sortModel: [{ field: 'createdAt', sort: 'desc' }],
    columnVisibility: {
      releaseNum: true,
      space: true,
      tag: true,
      changeOrder: true,
      published: true,
      sync: true,
      health: true,
      operation: false,
      digest: true,
      unitCount: false,
      target: false,
      publishedBy: false,
      observedAt: false,
      createdAt: true,
    } satisfies Record<ReleaseColumnFields, boolean>,
  });

  const baseColumns: GridColDef<ReleaseRow>[] = useMemo(
    () => [
      {
        field: 'releaseNum',
        headerName: 'Release',
        type: 'number',
        align: 'left',
        headerAlign: 'left',
        minWidth: 90,
        flex: 0.4,
        valueGetter: (_, row) => row.Release?.ReleaseNum,
        renderCell: (params) => (
          <CenteredTableCell>
            <Typography
              variant='body1'
              component='button'
              onClick={() => onReleaseSelect(params.row.id)}
              sx={{ ...linkStyle, background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit' }}
              data-testid={`release-details-${params.row.Release?.SpaceSlug}-${params.row.Release?.ReleaseNum}`}
            >
              {params.row.Release?.ReleaseNum}
            </Typography>
          </CenteredTableCell>
        ),
      },
      {
        field: 'space',
        headerName: 'Space',
        minWidth: 200,
        flex: 1,
        valueGetter: (_, row) => row.Space?.Slug ?? row.Release?.SpaceSlug,
        renderCell: (params) => (
          <CenteredTableCell>
            <NavLink to={`/spaces/${params.row.Release?.SpaceID}`} style={linkStyle}>
              <Typography variant='body1'>{params.row.Space?.Slug ?? params.row.Release?.SpaceSlug}</Typography>
            </NavLink>
          </CenteredTableCell>
        ),
      },
      {
        field: 'tag',
        headerName: 'Tag',
        minWidth: 200,
        flex: 1,
        valueGetter: (_, row) => releaseTagName(row),
      },
      {
        field: 'changeOrder',
        headerName: 'ChangeOrder',
        minWidth: 200,
        flex: 1,
        valueGetter: (_, row) => releaseChangeOrderName(row),
        renderCell: (params) => {
          const href = releaseChangeOrderHref(params.row);
          const name = releaseChangeOrderName(params.row);
          return (
            <CenteredTableCell>
              {href ? (
                <NavLink to={href} style={linkStyle} data-testid='release-change-order'>
                  <Typography variant='body1'>{name}</Typography>
                </NavLink>
              ) : (
                <Typography variant='body1'>{name}</Typography>
              )}
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'published',
        headerName: 'Published',
        minWidth: 100,
        flex: 0.5,
        valueGetter: (_, row) => (row.Release?.Published ? 'Published' : 'Withdrawn'),
      },
      {
        field: 'sync',
        headerName: 'Sync',
        minWidth: 110,
        flex: 0.5,
        valueGetter: (_, row) => liveAxisLabel(row.Release?.LiveStatus, 'sync'),
        renderCell: (params) => <LiveAxisCell status={params.row.Release?.LiveStatus} axis='sync' />,
      },
      {
        field: 'health',
        headerName: 'Health',
        minWidth: 110,
        flex: 0.5,
        valueGetter: (_, row) => liveAxisLabel(row.Release?.LiveStatus, 'health'),
        renderCell: (params) => <LiveAxisCell status={params.row.Release?.LiveStatus} axis='health' />,
      },
      {
        field: 'operation',
        headerName: 'Operation',
        minWidth: 110,
        flex: 0.5,
        valueGetter: (_, row) =>
          row.Release?.LiveStatus?.ReporterOperation || row.Release?.LiveStatus?.Operation || '',
      },
      {
        field: 'digest',
        headerName: 'Digest',
        minWidth: 150,
        flex: 0.6,
        valueGetter: (_, row) => (row.Release?.ManifestDigest ? formatDigest(row.Release.ManifestDigest) : ''),
      },
      {
        field: 'unitCount',
        headerName: 'Units',
        type: 'number',
        align: 'left',
        headerAlign: 'left',
        minWidth: 80,
        flex: 0.3,
        valueGetter: (_, row) => row.Release?.UnitCount,
      },
      {
        field: 'target',
        headerName: 'Target',
        minWidth: 160,
        flex: 0.8,
        valueGetter: (_, row) => releaseTargetName(row),
      },
      {
        field: 'publishedBy',
        headerName: 'Published By',
        minWidth: 140,
        flex: 0.7,
        valueGetter: (_, row) => releaseUserName(row.User, row.Release?.UserID),
      },
      {
        field: 'observedAt',
        headerName: 'Observed At',
        type: 'dateTime',
        minWidth: 160,
        flex: 0.8,
        valueGetter: (_, row) => formatTime(row.Release?.LiveStatus?.ObservedAt),
        renderCell: (params) => <DateTimeCell params={params} />,
      },
      {
        field: 'createdAt',
        headerName: 'Created At',
        type: 'dateTime',
        minWidth: 160,
        flex: 0.8,
        valueGetter: (_, row) => formatTime(row.Release?.CreatedAt),
        renderCell: (params) => <DateTimeCell params={params} />,
      },
    ],
    [onReleaseSelect],
  );

  const columns = useMemo(() => applyStoredWidths(baseColumns), [applyStoredWidths, baseColumns]);

  const Toolbar = () => <DataGridToolbar hasStateChanged={hasStateChanged} onResetState={clearStoredState} />;

  return (
    <StripedDataGrid
      data-testid='releases-table'
      rows={rows}
      // @ts-expect-error StripedDataGrid is styled from DataGrid, which loses the row type
      columns={columns}
      loading={isLoading}
      onColumnWidthChange={handleColumnResize}
      columnVisibilityModel={columnVisibilityModel}
      onColumnVisibilityModelChange={onColumnVisibilityModelChange}
      sortModel={sortModel}
      onSortModelChange={onSortModelChange}
      filterModel={filterModel}
      onFilterModelChange={onFilterModelChange}
      paginationModel={paginationModel}
      onPaginationModelChange={onPaginationModelChange}
      slots={{ ...DATE_TIME_GRID_SLOTS, toolbar: Toolbar }}
      initialState={{ pagination: { paginationModel: { page: 0, pageSize: 25 } } }}
      pageSizeOptions={[10, 25, 50, 100]}
      disableRowSelectionOnClick
      checkboxSelection={false}
      getRowClassName={(params) => (params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd')}
      rowHeight={40}
    />
  );
};
