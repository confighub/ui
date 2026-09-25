// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Column, ExtendedUnitRead } from '@confighub/rtk-query';

import { GroupNavRow } from '../cell-value';
import { EntityAdapter } from './types';

const UNIT_FILTER_FIELDS = [
  'Slug',
  'DisplayName',
  'SpaceID',
  'TargetID',
  'ToolchainType',
  'CreatedAt',
  'UpdatedAt',
  'HeadRevisionNum',
  'LastReleasedRevisionNum',
  'LastChangeDescription',
  'UpstreamUnitID',
  'UpstreamSpaceID',
  'UpstreamRevisionNum',
  'BridgeWorkerID',
  'ChangeSetID',
  'ProviderType',
];

const ALL_UNIT_COLUMNS = [
  'Slug',
  'Space',
  'Target',
  'ToolchainType',
  'HeadRevisionNum',
  'LastReleasedRevisionNum',
  'CreatedAt',
  'UpdatedAt',
  'LastChangeDescription',
  'ChangeSetSlug',
  'UpstreamUnitSlug',
  'UpstreamSpaceSlug',
  'BridgeWorkerID',
  'ProviderType',
  'DisplayName',
  'HeadRevisionCreatedAt',
  'UnreleasedChanges',
  'UpgradeNeeded',
];

const DEFAULT_UNIT_COLUMNS: Column[] = [
  { Name: 'Slug' },
  { Name: 'Space' },
  { Name: 'Target' },
  { Name: 'ToolchainType' },
  { Name: 'HeadRevisionNum' },
  { Name: 'LastReleasedRevisionNum' },
  { Name: 'UpdatedAt' },
];

export const unitAdapter: EntityAdapter = {
  entityType: 'Unit',
  noun: 'unit',
  nounPlural: 'units',
  defaultColumns: DEFAULT_UNIT_COLUMNS,
  allColumns: ALL_UNIT_COLUMNS,
  filterFields: UNIT_FILTER_FIELDS,
  supportsDataFilter: true,
  supportsResources: true,
  getRowId(row) {
    const eu = row as ExtendedUnitRead;
    return eu.Unit?.UnitID ?? eu.Unit?.Slug;
  },
  getRowHref(row) {
    const eu = row as ExtendedUnitRead;
    const spaceId = eu.Unit?.SpaceID;
    const unitId = eu.Unit?.UnitID;
    if (!spaceId || !unitId) return undefined;
    return `/units/${spaceId}/${unitId}`;
  },
  navigateToRow(row: GroupNavRow, event, navigate, extraState) {
    const href = unitAdapter.getRowHref(row);
    if (!href) return;
    if (event.metaKey || event.ctrlKey) {
      window.open(href, '_blank');
    } else {
      navigate(href, { state: extraState ?? {} });
    }
  },
};
