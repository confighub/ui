// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ColumnGroup, DynamicGroupConfig } from '@/components/entity-data-grid/column-groups-types';
import { SPACE_SUMMARY_COUNTS } from '@/utility/space-summary-counts';

/**
 * Column groups configuration for the Spaces grid
 */
export const SPACE_COLUMN_GROUPS: ColumnGroup[] = [
  {
    header: 'Core Identity',
    columns: ['Slug', 'Component', 'SpaceID'],
  },
  {
    header: 'Units',
    columns: SPACE_SUMMARY_COUNTS.filter((c) => c.group === 'Units').map((c) => c.field),
  },
  {
    header: 'Entities',
    columns: SPACE_SUMMARY_COUNTS.filter((c) => c.group === 'Entities').map((c) => c.field),
  },
  {
    header: 'Triggers and Release',
    columns: ['WhereTrigger', 'TriggerFilter', 'AppliedTriggerCount', 'ReleaseTarget'],
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
