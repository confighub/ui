// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ColumnGroup, DynamicGroupConfig } from '@/components/entity-data-grid/column-groups-types';

/**
 * Column groups configuration for the Units grid
 */
export const UNIT_COLUMN_GROUPS: ColumnGroup[] = [
  {
    header: 'Core Identity',
    columns: ['Slug', 'ID', 'Space', 'SpaceID', 'Target', 'TargetID', 'ToolchainType'],
  },
  {
    header: 'Status & Health',
    columns: ['UpgradeNeeded', 'UnreleasedChanges'],
  },
  {
    header: 'Revisions',
    columns: ['HeadRevisionNum', 'LastReleasedRevisionNum', 'HeadMutationNum'],
  },
  {
    header: 'Timestamps',
    columns: ['CreatedAt', 'UpdatedAt'],
  },
  {
    header: 'Changes',
    columns: ['ChangeSetID', 'ChangeSetSlug', 'LastChangeDescription'],
  },
  {
    header: 'Clone/Upstream',
    columns: ['UpstreamUnitSlug', 'UpstreamUnitID', 'UpstreamSpaceSlug', 'UpstreamSpaceID'],
  },
  {
    header: 'Gates & Operations',
    columns: ['ValidationErrors', 'ValidationWarnings', 'DestroyGates', 'DeleteGates'],
  },
  {
    header: 'Other Details',
    columns: ['Annotations'],
  },
];

/**
 * Dynamic groups configuration for the Units grid
 */
export const UNIT_DYNAMIC_GROUPS: DynamicGroupConfig[] = [
  {
    name: 'Labels',
    columnPrefix: 'Labels.',
  },
  {
    name: 'Values',
    columnPrefix: 'Values.',
  },
];
