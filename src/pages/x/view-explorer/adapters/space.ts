// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Column, ExtendedSpaceRead } from '@confighub/rtk-query';

import { EntityAdapter } from './types';

/** Attribute names the Space filter syntax accepts in WHERE. */
const SPACE_FILTER_FIELDS = [
  'Slug',
  'DisplayName',
  'SpaceID',
  'OrganizationID',
  'CreatedAt',
  'UpdatedAt',
];

/**
 * Column vocabulary surfaced in the ColumnPicker. Aggregate counts come from
 * the server-side ExtendedSpaceRead hydration — they don't require explicit
 * `include` parameters.
 */
const ALL_SPACE_COLUMNS = [
  'Slug',
  'DisplayName',
  'CreatedAt',
  'UpdatedAt',
  'OrganizationID',
  'TotalUnitCount',
  'TotalLinkCount',
  'TotalFilterCount',
  'TotalBridgeWorkerCount',
  'TotalChangeSetCount',
  'TotalTagCount',
  'TotalViewCount',
  'TotalAttributeCount',
  'TotalInvocationCount',
  'UnreleasedUnitCount',
  'UnlinkedUnitCount',
  'UpgradableUnitCount',
  'GatedUnitCount',
];

const DEFAULT_SPACE_COLUMNS: Column[] = [
  { Name: 'Slug' },
  { Name: 'DisplayName' },
  { Name: 'TotalUnitCount' },
  { Name: 'UnreleasedUnitCount' },
  { Name: 'UpgradableUnitCount' },
  { Name: 'UpdatedAt' },
];

export const spaceAdapter: EntityAdapter = {
  entityType: 'Space',
  noun: 'space',
  nounPlural: 'spaces',
  defaultColumns: DEFAULT_SPACE_COLUMNS,
  allColumns: ALL_SPACE_COLUMNS,
  filterFields: SPACE_FILTER_FIELDS,
  supportsDataFilter: false,
  supportsResources: false,
  getRowId(row) {
    const es = row as ExtendedSpaceRead;
    return es.Space?.SpaceID ?? es.Space?.Slug;
  },
  getRowHref(row) {
    const es = row as ExtendedSpaceRead;
    const spaceId = es.Space?.SpaceID;
    if (!spaceId) return undefined;
    return `/spaces/${spaceId}`;
  },
  navigateToRow(row, event, navigate, extraState) {
    const href = spaceAdapter.getRowHref(row);
    if (!href) return;
    if (event.metaKey || event.ctrlKey) {
      window.open(href, '_blank');
    } else {
      navigate(href, { state: extraState ?? {} });
    }
  },
};
