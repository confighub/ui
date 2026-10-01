// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ExtendedUnitRead } from '@confighub/rtk-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export type Label = {
  key: string;
  total: number;
};

export const LABEL_COLUMN_CONFIG = {
  minWidth: 120,
  flex: 0.8,
} as const;

export interface UnitRowItem {
  id: string;
  SpaceID: string;
  Space: string;
  Slug: string;
  TargetID: string;
  Target: string;
  UpgradeNeeded: string;
  UnreleasedChanges: string;
  ValidationErrors: {
    [key: string]: boolean;
  };
  ValidationWarnings: {
    [key: string]: boolean;
  };
  LastChangeDescription: string;
  UpdatedAt: string;
  CreatedAt: string;
  HeadRevisionNum: number;
  Labels: {
    [key: string]: string;
  };
  Values: {
    [key: string]: string;
  };
  ToolchainType?: string;
  // Revision Tracking columns
  LastReleasedRevisionNum?: number;
  HeadMutationNum?: number;
  // Clone/Upstream columns
  UpstreamUnitSlug?: string;
  UpstreamUnitID?: string;
  UpstreamSpaceSlug?: string;
  UpstreamSpaceID?: string;
  // Operations & Gates columns
  DestroyGates?: {
    [key: string]: boolean;
  };
  DeleteGates?: {
    [key: string]: boolean;
  };
  ChangeSetID?: string;
  ChangeSetSlug?: string;
  // Metadata columns
  Annotations?: {
    [key: string]: string;
  };
  [key: string]: string | number | { [key: string]: boolean } | { [key: string]: string } | null | undefined;
}

export interface UnitDataGridProps {
  units: Array<ExtendedUnitRead>;
}


export const createUnitListRow = (unit: ExtendedUnitRead): UnitRowItem => {
  // Compute upgrade needed status
  const upstreamRevisionNum = unit?.Unit?.UpstreamRevisionNum || 0;
  const upstreamUnitHeadRevisionNum = unit?.UpstreamUnit?.HeadRevisionNum || 0;
  const upgradeNeeded: 'Yes' | 'No' =
    upstreamRevisionNum > 0 && upstreamRevisionNum < upstreamUnitHeadRevisionNum ? 'Yes' : 'No';

  // Compute unreleased changes status. LastReleasedRevisionNum is advanced by
  // `release publish`, so head > lastReleased means "not yet in a Release".
  const headRevisionNum = unit?.Unit?.HeadRevisionNum || 0;
  const lastReleasedRevisionNum = unit?.Unit?.LastReleasedRevisionNum || 0;
  const targetID = unit?.Unit?.TargetID || '';
  const unreleasedChanges: 'Yes' | 'No' =
    headRevisionNum > lastReleasedRevisionNum && targetID != '' ? 'Yes' : 'No';

  const baseRow: UnitRowItem = {
    id: unit?.Unit?.UnitID || '',
    Slug: unit?.Unit?.Slug || '',
    SpaceID: unit?.Unit?.SpaceID || '',
    Space: unit?.Space?.Slug || '',
    Target: unit?.Target?.Slug || '',
    TargetID: unit?.Unit?.TargetID || '',
    UnreleasedChanges: unreleasedChanges,
    UpgradeNeeded: upgradeNeeded,
    ValidationErrors: unit?.Unit?.ValidationErrors || {},
    ValidationWarnings: unit?.Unit?.ValidationWarnings || {},
    LastChangeDescription: unit?.Unit?.LastChangeDescription || '',
    UpdatedAt: unit?.Unit?.UpdatedAt || '',
    CreatedAt: unit?.Unit?.CreatedAt || '',
    HeadRevisionNum: unit?.Unit?.HeadRevisionNum || 0,
    Labels: unit?.Unit?.Labels || {},
    Values: unit?.Unit?.Values || {},
    ToolchainType: unit?.Unit?.ToolchainType || '',
    // Revision Tracking columns
    LastReleasedRevisionNum: unit?.Unit?.LastReleasedRevisionNum || 0,
    HeadMutationNum: unit?.Unit?.HeadMutationNum || 0,
    // Clone/Upstream columns
    UpstreamUnitSlug: unit?.UpstreamUnit?.Slug || '',
    UpstreamUnitID: unit?.Unit?.UpstreamUnitID || '',
    UpstreamSpaceSlug: unit?.UpstreamSpace?.Slug || '',
    UpstreamSpaceID: unit?.Unit?.UpstreamSpaceID || '',
    // Operations & Gates columns
    DestroyGates: unit?.Unit?.DestroyGates || {},
    DeleteGates: unit?.Unit?.DeleteGates || {},
    ChangeSetID: unit?.Unit?.ChangeSetID || '',
    ChangeSetSlug: unit?.ChangeSet?.Slug || '',
    // Metadata columns
    Annotations: unit?.Unit?.Annotations || {},
  };

  // Add label values directly to the row for better grouping performance
  const labels = unit?.Unit?.Labels || {};
  Object.keys(labels).forEach((labelKey) => {
    (baseRow as UnitRowItem)[labelKey] = labels[labelKey] || '';
  });

  return baseRow;
};
