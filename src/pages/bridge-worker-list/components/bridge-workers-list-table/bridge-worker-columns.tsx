// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { buildColumns } from '@/components/data-grid/cells';
import { ColumnGroup, DynamicGroupConfig } from '@/components/entity-data-grid/column-groups-types';
import { ExtendedBridgeWorkerRead } from '@confighub/rtk-query';
import { getDateWithFallback } from '@/utility/datetime-utils';

export const BRIDGE_WORKER_COLUMN_GROUPS: ColumnGroup[] = [
  {
    header: 'Core Identity',
    columns: ['Slug', 'BridgeWorkerID', 'Space', 'SpaceID', 'IPAddress'],
  },
  {
    header: 'Availability',
    columns: ['TargetCount', 'AvailableFunctions'],
  },
  {
    header: 'Status',
    columns: ['Condition', 'LastSeenAt', 'LastMessage'],
  },
  {
    header: 'Timestamps',
    columns: ['CreatedAt', 'UpdatedAt'],
  },
];

export const BRIDGE_WORKER_DYNAMIC_GROUPS: DynamicGroupConfig[] = [
  {
    name: 'Labels',
    columnPrefix: 'Labels.',
  },
  {
    name: 'Provided Info',
    columnPrefix: 'ProvidedInfo.',
  },
];

export interface BridgeWorkerRowItem {
  id: string;
  Slug: string;
  BridgeWorkerID: string;
  Space: string;
  SpaceID: string;
  Condition: string;
  TargetCount: number;
  AvailableFunctions: number;
  LastSeenAt: string;
  LastMessage: string;
  IPAddress: string;
  CreatedAt: string;
  UpdatedAt: string;
  Labels: {
    [key: string]: string;
  };
  ProvidedInfo: {
    [key: string]: string;
  };
  _extendedWorker?: ExtendedBridgeWorkerRead; // Store original ExtendedBridgeWorkerRead for callbacks
}

export const createBridgeWorkerStaticColumns = () =>
  buildColumns<BridgeWorkerRowItem>({
    Slug: {
      type: 'link',
      headerName: 'Name',
      minWidth: 100,
      flex: 1,
      linkTo: (row) => `?edit=${row.BridgeWorkerID}`,
      getText: (row) => row.Slug,
    },

    BridgeWorkerID: {
      type: 'uuid',
      headerName: 'Worker ID',
      minWidth: 300,
      flex: 1.5,
    },

    Space: {
      type: 'link',
      headerName: 'Space',
      linkTo: (row) => `/spaces/${row.SpaceID}`,
      getText: (row) => row.Space || 'Unknown',
      minWidth: 120,
      flex: 1,
    },

    SpaceID: {
      type: 'uuid',
      headerName: 'Space ID',
      minWidth: 300,
      flex: 1.5,
    },

    TargetCount: {
      type: 'number',
      headerName: 'Available Targets',
      minWidth: 200,
      flex: 1,
    },

    AvailableFunctions: {
      type: 'number',
      headerName: 'Available Functions',
      minWidth: 140,
      flex: 1,
    },

    Condition: {
      type: 'string',
      headerName: 'Condition',
      minWidth: 120,
      flex: 1,
      valueGetter: (row) => row.Condition || '-',
    },

    LastSeenAt: {
      type: 'dateTime',
      headerName: 'Last Seen',
      valueGetter: (row) => getDateWithFallback(row.LastSeenAt, row.CreatedAt),
      minWidth: 140,
      flex: 1,
    },

    LastMessage: {
      type: 'string',
      headerName: 'Last Message',
      minWidth: 200,
      flex: 1.5,
      valueGetter: (row) => row.LastMessage || '-',
    },

    IPAddress: {
      type: 'string',
      headerName: 'IP Address',
      minWidth: 140,
      flex: 1,
      valueGetter: (row) => row.IPAddress || '-',
    },

    CreatedAt: {
      type: 'dateTime',
      headerName: 'Created At',
      valueGetter: (row) => (row.CreatedAt ? new Date(row.CreatedAt) : null),
      minWidth: 140,
      flex: 1,
    },

    UpdatedAt: {
      type: 'dateTime',
      headerName: 'Updated At',
      valueGetter: (row) => (row.UpdatedAt ? new Date(row.UpdatedAt) : null),
      minWidth: 140,
      flex: 1,
    },
  });
