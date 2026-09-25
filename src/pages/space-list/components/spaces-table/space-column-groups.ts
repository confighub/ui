// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ColumnGroup, DynamicGroupConfig } from '@/components/entity-data-grid/column-groups-types';

/**
 * Column groups configuration for the Spaces grid
 */
export const SPACE_COLUMN_GROUPS: ColumnGroup[] = [
  {
    header: 'Core Identity',
    columns: ['Slug', 'SpaceID'],
  },
  {
    header: 'Resources',
    columns: ['TotalUnitCount', 'TotalBridgeWorkerCount', 'TotalTargets', 'TotalTriggers'],
  },
  {
    header: 'Timestamps',
    columns: ['CreatedAt', 'UpdatedAt'],
  },
];

/**
 * Dynamic groups configuration for the Spaces grid
 */
export const SPACE_DYNAMIC_GROUPS: DynamicGroupConfig[] = [
  {
    name: 'Labels',
    columnPrefix: 'Labels.',
  },
];
