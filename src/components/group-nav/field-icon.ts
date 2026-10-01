// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import { FIELD_ICONS, type FieldIconKey } from '@/components/query-builder/field-icons';

/** Maps groupable field names to FIELD_ICONS keys — the Unit catalog's default map. */
export const UNIT_FIELD_TO_ICON_KEY: Partial<Record<string, FieldIconKey>> = {
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
 * `iconMap` (a catalog-specific override, e.g. Components' special-label
 * icons for `Component`/`Labels.Owner`/etc.) is checked FIRST, so a
 * Labels.* key can still get its own icon instead of the generic one below.
 * Labels.* and Space.Labels.* with no override use the 'labels' icon.
 * Unknown fields fall back to the generic 'where' icon.
 *
 * @param field - The groupable field key (e.g. `'Space'`, `'Labels.Owner'`).
 * @param iconMap - Optional catalog-specific override map, consulted before
 *   the Unit catalog's own map. Defaults to `UNIT_FIELD_TO_ICON_KEY` so every
 *   existing (Unit-list) call site is unaffected.
 */
export function getChipIcon(
  field: string,
  iconMap: Partial<Record<string, FieldIconKey>> = UNIT_FIELD_TO_ICON_KEY,
): ReactNode {
  if (!field) return FIELD_ICONS['where'];
  const overrideKey = iconMap[field] ?? UNIT_FIELD_TO_ICON_KEY[field];
  if (overrideKey) return FIELD_ICONS[overrideKey];
  if (field.startsWith('Labels.') || field.startsWith('Space.Labels.')) {
    return FIELD_ICONS['labels'];
  }
  return FIELD_ICONS['where'];
}
