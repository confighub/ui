// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { buildColumns } from '@/components/data-grid/cells';
import { SpaceRow } from '../SpacesTable';

/**
 * Create standardized column definitions for the SpacesTable
 */
export const createSpaceTableColumns = () =>
  buildColumns<SpaceRow>({
    Slug: {
      type: 'link',
      headerName: 'Name',
      linkTo: (row) => `/spaces/${row.SpaceID}`,
      getText: (row) => row.Slug,
      minWidth: 280,
      flex: 2,
    },

    SpaceID: {
      type: 'uuid',
      headerName: 'Space ID',
      minWidth: 300,
      flex: 1.5,
    },

    TotalUnitCount: {
      type: 'number',
      headerName: 'Units',
      minWidth: 80,
      flex: 1,
    },

    TotalBridgeWorkerCount: {
      type: 'number',
      headerName: 'Workers',
      minWidth: 80,
      flex: 1,
    },

    TotalTargets: {
      type: 'number',
      headerName: 'Targets',
      minWidth: 80,
      flex: 1,
    },

    TotalTriggers: {
      type: 'number',
      headerName: 'Triggers',
      minWidth: 80,
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
