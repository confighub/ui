// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { buildColumns, LinkCell } from '@/components/data-grid/cells';
import { SPACE_SUMMARY_COUNTS } from '@/utility/space-summary-counts';
import { GridColDef, GridSortCellParams } from '@mui/x-data-grid';
import { SpaceRow } from '../SpacesTable';

// Spaces in no Component sort after those in one, whichever the direction, and Spaces of one
// Component sort by name, so sorting by Component lists each Component's Variants together.
const compareByComponent = (
  v1: string,
  v2: string,
  p1: GridSortCellParams<string>,
  p2: GridSortCellParams<string>,
) => {
  if (!v1 !== !v2) {
    return v1 ? -1 : 1;
  }
  const byComponent = (v1 || '').localeCompare(v2 || '');
  if (byComponent !== 0) {
    return byComponent;
  }
  const slug1 = String(p1.api.getRow(p1.id)?.Slug ?? '');
  const slug2 = String(p2.api.getRow(p2.id)?.Slug ?? '');
  return slug1.localeCompare(slug2);
};

/**
 * Create standardized column definitions for the SpacesTable
 */
export const createSpaceTableColumns = (): GridColDef<SpaceRow>[] => {
  const columns = buildColumns<SpaceRow>({
    Slug: {
      type: 'link',
      headerName: 'Name',
      // Opens the Space's settings drawer, which links to the Space's page.
      linkTo: (row) => `?edit=${row.SpaceID}`,
      getText: (row) => row.Slug,
      minWidth: 280,
      flex: 2,
    },

    Component: {
      type: 'custom',
      headerName: 'Component',
      valueGetter: (row) => row.Component,
      renderCell: (params) =>
        params.row.Component ? (
          <LinkCell
            params={params}
            linkTo={(row) => `/components?app=${encodeURIComponent(row.Component)}`}
          />
        ) : null,
      minWidth: 160,
      flex: 1.5,
    },

    SpaceID: {
      type: 'uuid',
      headerName: 'Space ID',
      minWidth: 300,
      flex: 1.5,
    },

    ...Object.fromEntries(
      SPACE_SUMMARY_COUNTS.map((c) => [
        c.field,
        {
          type: 'number' as const,
          headerName: c.label,
          valueGetter: (row: SpaceRow) => row.Counts[c.field] ?? 0,
          minWidth: 80,
          flex: 1,
        },
      ]),
    ),

    WhereTrigger: {
      type: 'string',
      headerName: 'Where Trigger',
      minWidth: 200,
      flex: 1.5,
    },

    TriggerFilter: {
      type: 'string',
      headerName: 'Trigger Filter',
      minWidth: 160,
      flex: 1,
    },

    AppliedTriggerCount: {
      type: 'number',
      headerName: 'Applied Triggers',
      minWidth: 80,
      flex: 1,
    },

    ReleaseTarget: {
      type: 'string',
      headerName: 'Release Target',
      minWidth: 160,
      flex: 1,
    },

    CreatedAt: {
      type: 'dateTime',
      headerName: 'Created At',
      valueGetter: (row) => (row.CreatedAt ? new Date(row.CreatedAt) : null),
      minWidth: 160,
      flex: 1,
    },

    UpdatedAt: {
      type: 'dateTime',
      headerName: 'Updated At',
      valueGetter: (row) => (row.UpdatedAt ? new Date(row.UpdatedAt) : null),
      minWidth: 160,
      flex: 1,
    },
  });

  return columns.map((col) =>
    col.field === 'Component' ? { ...col, type: 'string', sortComparator: compareByComponent } : col,
  );
};
