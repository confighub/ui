// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Column } from '@confighub/rtk-query';

import { ResourceViewRow } from './resource-row';
import { EntityAdapter } from './types';

/**
 * Attribute names valid in a Resource view's WHERE clause. The clause is
 * evaluated against the Resource entity, so the resource's own attributes are
 * unprefixed and the containing entities are addressed with a prefix. Paths
 * into the resource document go in the view's data filter, which qualifies
 * them with `Data.`. Listed inline to keep the adapter self-contained.
 */
const RESOURCE_FILTER_FIELDS = [
  'ResourceType',
  'ResourceName',
  'ToolchainType',
  'TargetID',
  'SpaceID',
  'UnitID',
  'CreatedAt',
  'UpdatedAt',
  'Unit.Slug',
  'Unit.DisplayName',
  'Unit.Labels',
  'Unit.ToolchainType',
  'Unit.ProviderType',
  'Unit.HeadRevisionNum',
  'Unit.LastReleasedRevisionNum',
  'Unit.UpstreamRevisionNum',
  'Unit.LastChangeDescription',
  'Space.Slug',
  'Space.DisplayName',
  'Space.Labels',
  'Target.Slug',
];

/**
 * Column vocabulary surfaced in the ColumnPicker for Resource views. Names
 * mirror the keys read by `getResourceCellValue` in group-nav/utils.ts.
 * Unit-context columns are prefixed `Unit.` to disambiguate from resource
 * fields like Slug.
 */
const ALL_RESOURCE_COLUMNS = [
  // Resource info. The other ResourceInfo fields get-resources computes during
  // its walk -- ResourceNameWithoutScope, ResourceCategory,
  // ResourceNameStableCore -- are not stored on the entity, so they are not
  // offered here.
  'ResourceType',
  'ResourceName',
  // Unit context
  'Unit.Slug',
  'Unit.DisplayName',
  'Unit.ToolchainType',
  'Unit.ProviderType',
  'Unit.Target',
  'Unit.HeadRevisionNum',
  'Unit.LastReleasedRevisionNum',
  'Unit.UpstreamRevisionNum',
  'Unit.CreatedAt',
  'Unit.UpdatedAt',
  'Unit.LastChangeDescription',
  // Space context
  'Space.Slug',
];

const DEFAULT_RESOURCE_COLUMNS: Column[] = [
  { Name: 'ResourceType' },
  { Name: 'ResourceName' },
  { Name: 'Unit.Slug' },
  { Name: 'Space.Slug' },
];

export const resourceAdapter: EntityAdapter = {
  entityType: 'Resource',
  noun: 'resource',
  nounPlural: 'resources',
  defaultColumns: DEFAULT_RESOURCE_COLUMNS,
  allColumns: ALL_RESOURCE_COLUMNS,
  filterFields: RESOURCE_FILTER_FIELDS,
  // No separate data filter. WhereData and ResourceType exist because a Unit's
  // configuration is opaque and needs a function to query; a Resource's is
  // stored as JSON, so the one WHERE clause says both --
  // `ResourceType = 'apps/v1/Deployment' AND Data.spec.replicas > 1`.
  supportsDataFilter: false,
  // Resources don't *contain* resources; the drawer renders the body inline
  // instead of opening a second-level Resources tab.
  supportsResources: false,
  getRowId(row) {
    return (row as ResourceViewRow).id;
  },
  // Resources have no detail page; the drawer is the only entry point.
  // Returning undefined disables the "Open detail" affordance.
  getRowHref() {
    return undefined;
  },
  navigateToRow() {
    // Intentional no-op: ViewExplorerPage opens the drawer on row click
    // before delegating to navigateToRow. Resources never need to navigate.
  },
};
