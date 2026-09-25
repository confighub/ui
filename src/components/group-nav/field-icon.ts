// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import { FIELD_ICONS } from '@/components/query-builder/field-icons';
import type { FilterFieldType } from '@/components/query-builder/types';

/** Maps groupable field names to FIELD_ICONS keys. */
const FIELD_TO_ICON_KEY: Partial<Record<string, FilterFieldType>> = {
  Space: 'space',
  Target: 'target',
  ToolchainType: 'toolchainType',
  UpgradeNeeded: 'upgradeNeeded',
  UnreleasedChanges: 'unreleasedChanges',
  ChangeSetSlug: 'lastChangeDescription',
  UpstreamUnitSlug: 'slug',
  UpstreamSpaceSlug: 'space',
};

/**
 * Returns the section trigger icon for a submenu category header.
 * Used in FieldPickerDropdown for the Dynamic section trigger rows.
 */
export function getSubmenuIcon(header: string): ReactNode {
  if (header === 'Labels') return FIELD_ICONS['labels'];
  if (header === 'Space Labels') return FIELD_ICONS['space'];
  return FIELD_ICONS['where'];
}

/**
 * Returns the correct FIELD_ICONS node for a groupable field key.
 * Labels.* and Space.Labels.* use the 'labels' icon.
 * Unknown fields fall back to the generic 'where' icon.
 */
export function getChipIcon(field: string): ReactNode {
  if (!field) return FIELD_ICONS['where'];
  if (field.startsWith('Labels.') || field.startsWith('Space.Labels.')) {
    return FIELD_ICONS['labels'];
  }
  const key = FIELD_TO_ICON_KEY[field] ?? 'where';
  return FIELD_ICONS[key];
}
