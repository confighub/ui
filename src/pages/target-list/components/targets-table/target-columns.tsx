// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { buildColumns } from '@/components/data-grid/cells';
import { KeyValueListCell } from '@/components/entity-data-grid';
import { ColumnGroup, DynamicGroupConfig } from '@/components/entity-data-grid/column-groups-types';
import { CenteredTableCell } from '@/components/styled';
import { ExtendedTargetRead } from '@confighub/rtk-query';
import { parseTargetParameters } from '@/utility/string-functions';

export const TARGET_COLUMN_GROUPS: ColumnGroup[] = [
  {
    header: 'Core Identity',
    columns: ['Slug', 'TargetID', 'Space', 'SpaceID'],
  },
  {
    header: 'Configuration',
    columns: ['ProviderType', 'Parameters'],
  },
  {
    header: 'Infrastructure',
    columns: ['BridgeWorkerSlug', 'BridgeWorkerID'],
  },
  {
    header: 'Timestamps',
    columns: ['CreatedAt', 'UpdatedAt'],
  },
];

export const TARGET_DYNAMIC_GROUPS: DynamicGroupConfig[] = [
  {
    name: 'Labels',
    columnPrefix: 'Labels.',
  },
];

export interface TargetRowItem {
  id: string;
  Slug: string;
  TargetID: string;
  Space: string;
  SpaceID: string;
  ProviderType: string;
  Parameters: string;
  Labels: {
    [key: string]: string;
  };
  BridgeWorkerID: string;
  BridgeWorkerSlug: string;
  CreatedAt: string;
  UpdatedAt: string;
  _extendedTarget?: ExtendedTargetRead; // Store original ExtendedTargetRead for callbacks
}

export const createTargetStaticColumns = () =>
  buildColumns<TargetRowItem>({
    Slug: {
      type: 'link',
      headerName: 'Name',
      minWidth: 150,
      flex: 1.5,
      linkTo: (row) => `?edit=${row.TargetID}`,
      getText: (row) => row.Slug,
    },

    TargetID: {
      type: 'uuid',
      headerName: 'Target ID',
      minWidth: 300,
      flex: 1.5,
    },

    Space: {
      type: 'string',
      headerName: 'Space',
      minWidth: 150,
      flex: 1.5,
    },

    SpaceID: {
      type: 'uuid',
      headerName: 'Space ID',
      minWidth: 300,
      flex: 1.5,
    },

    ProviderType: {
      type: 'string',
      headerName: 'Provider Type',
      minWidth: 150,
      flex: 1,
    },

    Parameters: {
      type: 'custom',
      headerName: 'Parameters',
      minWidth: 150,
      flex: 1.5,
      valueGetter: (row) => row.Parameters,
      renderCell: (params) => {
        const parametersObj = parseTargetParameters(params.row.Parameters || '');
        const parameters = Object.entries(parametersObj)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ');

        return (
          <CenteredTableCell>
            <KeyValueListCell value={parameters} />
          </CenteredTableCell>
        );
      },
    },

    BridgeWorkerSlug: {
      type: 'string',
      headerName: 'Worker Slug',
      minWidth: 150,
      flex: 1.5,
    },

    BridgeWorkerID: {
      type: 'uuid',
      headerName: 'Worker ID',
      minWidth: 300,
      flex: 1.5,
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
