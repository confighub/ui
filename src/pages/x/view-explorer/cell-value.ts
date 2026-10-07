// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  ExtendedSpaceRead,
  ExtendedUnitRead,
  ViewColumn,
} from '@confighub/rtk-query';
import { getCellValue as getUnitCellValue } from '@/components/group-nav/utils';
import { LABEL_PREFIX, SPACE_LABEL_PREFIX } from '@/components/group-nav/types';
import { formatAbsolute } from '@/utility/date-format';

import { isResourceViewRow, ResourceViewRow } from './adapters/resource-row';

/**
 * Rows the View Explorer can render. Unit rows reuse the shared group-nav
 * cell extractor; Space and Resource rows are handled here so the stable
 * group-nav component stays agnostic of the experimental entity types.
 */
export type GroupNavRow = ExtendedUnitRead | ExtendedSpaceRead | ResourceViewRow;


/** ExtendedUnitRead is the only row shape with a top-level `Unit` field. */
function isExtendedUnitRead(row: GroupNavRow): row is ExtendedUnitRead {
  return (row as ExtendedUnitRead).Unit !== undefined;
}

/**
 * Extract a display value for a column from any View Explorer row. Resource
 * rows are matched first (flattest shape, overlapping field names). Unit rows
 * delegate to the shared group-nav extractor so unit column behavior stays in
 * one place.
 *
 * Whatever the row cannot answer from its own fields falls back to the columns
 * the server computed from the View. That covers every DataPath and
 * DataExpression column, and any metadata attribute whose column name differs
 * from the field it reads. The row's own extractor is tried first so the
 * columns the client computes from several fields -- UnreleasedChanges,
 * UpgradeNeeded -- keep their behaviour.
 */
export function getCellValue(row: GroupNavRow, column: string): string {
  const local = isResourceViewRow(row)
    ? getResourceCellValue(row, column)
    : isExtendedUnitRead(row)
      ? getUnitCellValue(row, column)
      : getSpaceCellValue(row, column);
  if (local !== '') return local;
  return viewColumnValue(row, column);
}

/**
 * The View's own value for a column, as computed by the server. A column whose
 * path or expression selects several values has one entry per value, all under
 * the same name, so they join into a single cell.
 */
function viewColumnValue(row: GroupNavRow, column: string): string {
  const columns = (row as { ViewColumns?: ViewColumn[] }).ViewColumns;
  if (!columns?.length) return '';
  return columns
    .filter((c) => c.Name === column)
    .map((c) => c.Value ?? '')
    .filter(Boolean)
    .join(', ');
}

/**
 * Cell extraction for ExtendedSpaceRead. Space rows have a flatter shape than
 * Units — most columns map directly onto the embedded SpaceRead. Aggregate
 * counts hydrated by the server (TotalUnitCount, etc.) sit on the wrapping
 * ExtendedSpaceRead.
 */
function getSpaceCellValue(es: ExtendedSpaceRead, column: string): string {
  const space = es.Space;
  if (!space) return '';
  // The docs/CLI dialect prefixes Space view columns with the entity name
  // ("Space.Slug", "Space.Labels.Region"); the UI dialect uses bare names.
  // Space rows have no server-side ViewColumns fallback (ExtractViewColumns
  // runs for unit lists only), so both dialects must resolve here: strip the
  // prefix and match on the bare name. "Space.Labels.X" is left intact for
  // the default branch, which already matches that prefix.
  if (column.startsWith('Space.') && !column.startsWith(SPACE_LABEL_PREFIX)) {
    column = column.slice('Space.'.length);
  }
  switch (column) {
    case 'Slug':
      return space.Slug ?? '';
    case 'DisplayName':
      return space.DisplayName ?? '';
    case 'CreatedAt':
      return formatAbsolute(space.CreatedAt);
    case 'UpdatedAt':
      return formatAbsolute(space.UpdatedAt);
    case 'OrganizationID':
      return space.OrganizationID ?? '';
    case 'SpaceID':
      return space.SpaceID ?? '';
    case 'Component':
    case 'Component.Slug':
      // Present when the query included the Component; a Space that is a
      // Variant of none has no Component to name.
      return es.Component?.Slug ?? '';
    case 'TotalUnitCount':
      return es.TotalUnitCount != null ? String(es.TotalUnitCount) : '';
    case 'TotalLinkCount':
      return es.TotalLinkCount != null ? String(es.TotalLinkCount) : '';
    case 'TotalFilterCount':
      return es.TotalFilterCount != null ? String(es.TotalFilterCount) : '';
    case 'TotalBridgeWorkerCount':
      return es.TotalBridgeWorkerCount != null ? String(es.TotalBridgeWorkerCount) : '';
    case 'TotalChangeSetCount':
      return es.TotalChangeSetCount != null ? String(es.TotalChangeSetCount) : '';
    case 'TotalTagCount':
      return es.TotalTagCount != null ? String(es.TotalTagCount) : '';
    case 'TotalViewCount':
      return es.TotalViewCount != null ? String(es.TotalViewCount) : '';
    case 'TotalAttributeCount':
      return es.TotalAttributeCount != null ? String(es.TotalAttributeCount) : '';
    case 'TotalInvocationCount':
      return es.TotalInvocationCount != null ? String(es.TotalInvocationCount) : '';
    case 'UnreleasedUnitCount':
      return es.UnreleasedUnitCount != null ? String(es.UnreleasedUnitCount) : '';
    case 'UnlinkedUnitCount':
      return es.UnlinkedUnitCount != null ? String(es.UnlinkedUnitCount) : '';
    case 'UpgradableUnitCount':
      return es.UpgradableUnitCount != null ? String(es.UpgradableUnitCount) : '';
    case 'GatedUnitCount':
      return es.GatedUnitCount != null ? String(es.GatedUnitCount) : '';
    default:
      // There is no separate "space space label" axis, so both prefixes
      // resolve to the same Labels map.
      if (column.startsWith(SPACE_LABEL_PREFIX)) {
        return space.Labels?.[column.slice(SPACE_LABEL_PREFIX.length)] ?? '';
      }
      if (column.startsWith(LABEL_PREFIX)) {
        return space.Labels?.[column.slice(LABEL_PREFIX.length)] ?? '';
      }
      return '';
  }
}

/**
 * Cell extraction for ResourceViewRow. The row is flat — every field lives at
 * the top level. Unit/Space context fields are prefixed (`Unit.<field>`,
 * `Space.<field>`) to disambiguate from resource-info fields that share names
 * like Slug.
 */
function getResourceCellValue(row: ResourceViewRow, column: string): string {
  switch (column) {
    case 'ResourceType':
      return row.ResourceType;
    case 'ResourceName':
      return row.ResourceName;
  }

  if (column.startsWith('Unit.Labels.')) {
    return row.UnitLabels[column.slice('Unit.Labels.'.length)] ?? '';
  }
  if (column.startsWith('Unit.')) {
    switch (column.slice('Unit.'.length)) {
      case 'Slug':
        return row.UnitSlug;
      case 'ID':
        return row.UnitID;
      case 'DisplayName':
        return row.UnitDisplayName ?? '';
      case 'ToolchainType':
        return row.UnitToolchainType ?? '';
      case 'ProviderType':
        return row.UnitProviderType ?? '';
      case 'HeadRevisionNum':
        return row.UnitHeadRevisionNum != null ? String(row.UnitHeadRevisionNum) : '';
      case 'LastReleasedRevisionNum':
        return row.UnitLastReleasedRevisionNum != null
          ? String(row.UnitLastReleasedRevisionNum)
          : '';
      case 'UpstreamRevisionNum':
        return row.UnitUpstreamRevisionNum != null ? String(row.UnitUpstreamRevisionNum) : '';
      case 'CreatedAt':
        return formatAbsolute(row.UnitCreatedAt);
      case 'UpdatedAt':
        return formatAbsolute(row.UnitUpdatedAt);
      case 'LastChangeDescription':
        return row.UnitLastChangeDescription ?? '';
      case 'Target':
        return row.TargetSlug ?? '';
    }
  }
  if (column.startsWith(SPACE_LABEL_PREFIX)) {
    return row.SpaceLabels[column.slice(SPACE_LABEL_PREFIX.length)] ?? '';
  }
  if (column.startsWith('Space.')) {
    switch (column.slice('Space.'.length)) {
      case 'Slug':
        return row.SpaceSlug;
      case 'ID':
        return row.SpaceID;
    }
  }
  // Bare `Labels.x` historically referred to the row's own labels; for
  // resources the closest match is the originating unit's labels.
  if (column.startsWith(LABEL_PREFIX)) {
    return row.UnitLabels[column.slice(LABEL_PREFIX.length)] ?? '';
  }
  return '';
}

