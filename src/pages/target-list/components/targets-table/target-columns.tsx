// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { buildColumns } from '@/components/data-grid/cells';
import { ColumnGroup, DynamicGroupConfig } from '@/components/entity-data-grid/column-groups-types';
import { ExtendedTargetRead } from '@confighub/rtk-query';

export const TARGET_COLUMN_GROUPS: ColumnGroup[] = [
  {
    header: 'Core Identity',
    columns: ['Slug', 'TargetID', 'Space', 'SpaceID'],
  },
  {
    header: 'Triggers',
    columns: ['WhereTrigger', 'TriggerFilter', 'AppliedTriggerCount'],
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
  {
    name: 'Annotations',
    columnPrefix: 'Annotations.',
  },
  {
    name: 'Facts',
    columnPrefix: 'Facts.',
  },
];

export interface TargetRowItem {
  id: string;
  Slug: string;
  TargetID: string;
  Space: string;
  SpaceID: string;
  Labels: {
    [key: string]: string;
  };
  Annotations: {
    [key: string]: string;
  };
  Facts: {
    [key: string]: string;
  };
  WhereTrigger: string;
  TriggerFilter: string;
  AppliedTriggerCount: number;
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
