// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Pure, unit-testable catalog of fields that can be used for grouping in the
 * GroupNavPanel. Derived from the `switch` in utils.ts getCellValue — only
 * fields that produce a non-empty value are included.
 */

export interface FieldOption {
  field: string;
  label: string;
  /**
   * Optional unit count for this field key — shown right-aligned in the
   * submenu list when provided. Callers that compute label-key frequencies
   * from units can populate this; omit it and no count is rendered.
   */
  count?: number;
}

export interface GroupableCategory {
  header: string;
  fields: FieldOption[];
  /** When true, category is visible but non-selectable (rendered as "Coming soon"). */
  comingSoon?: boolean;
  /**
   * When true, category renders as a hover-triggered submenu trigger row in
   * FieldPickerDropdown rather than an inline expanded section.
   */
  isSubmenu?: boolean;
  /**
   * Placeholder text for the inline search input inside the submenu.
   * Defaults to "Search…" when absent.
   */
  searchPlaceholder?: string;
}

/**
 * A field catalog: the static categories offered by the breadcrumb's
 * add/change-field picker, plus the display-label overrides for those fields.
 * `getGroupableCategories`/`getFieldLabel` default to {@link UNIT_CATALOG} so
 * every pre-existing (Unit-list) caller is unaffected; a different page (e.g.
 * Components) passes its own catalog through `GroupNavPanel`'s `catalog` /
 * `fieldLabels` props.
 */
export interface GroupableFieldCatalog {
  staticCategories: GroupableCategory[];
  fieldLabels: Record<string, string>;
}

/**
 * The exact set of field names for which getCellValue returns a non-empty value
 * and that are meaningful as grouping dimensions.
 */
export const SUPPORTED_GROUPABLE_FIELDS: string[] = [
  'Space',
  'Target',
  'ToolchainType',
  'UpgradeNeeded',
  'UnreleasedChanges',
  // Pre-Release name, still present in saved Views' GroupBy. Not offered in the
  // picker (see GROUPABLE_CATEGORIES below), only accepted.
  'UnappliedChanges',
  'ChangeSetSlug',
  'UpstreamUnitSlug',
  'UpstreamSpaceSlug',
];

/** Human-readable labels for fields that need a friendlier name. */
const FIELD_LABELS: Record<string, string> = {
  Space: 'Space',
  Target: 'Target',
  ToolchainType: 'Toolchain Type',
  UpgradeNeeded: 'Upgrade Needed',
  UnreleasedChanges: 'Unreleased Changes',
  Action: 'Action',
  ChangeSetSlug: 'Change Set',
  UpstreamUnitSlug: 'Upstream Unit',
  UpstreamSpaceSlug: 'Upstream Space',
};

/**
 * Static category layout. Empty categories (those with no fields in
 * SUPPORTED_GROUPABLE_FIELDS) are filtered out by getGroupableCategories.
 */
const STATIC_CATEGORIES: GroupableCategory[] = [
  {
    header: 'Core identity',
    fields: ['Space', 'Target', 'ToolchainType']
      .filter((f) => SUPPORTED_GROUPABLE_FIELDS.includes(f))
      .map((f) => ({ field: f, label: FIELD_LABELS[f] ?? f })),
  },
  {
    header: 'Status & health',
    fields: ['UpgradeNeeded', 'UnreleasedChanges']
      .filter((f) => SUPPORTED_GROUPABLE_FIELDS.includes(f))
      .map((f) => ({ field: f, label: FIELD_LABELS[f] ?? f })),
  },
  {
    header: 'Changes',
    fields: ['ChangeSetSlug']
      .filter((f) => SUPPORTED_GROUPABLE_FIELDS.includes(f))
      .map((f) => ({ field: f, label: FIELD_LABELS[f] ?? f })),
  },
  {
    header: 'Clone & upstream',
    fields: ['UpstreamUnitSlug', 'UpstreamSpaceSlug']
      .filter((f) => SUPPORTED_GROUPABLE_FIELDS.includes(f))
      .map((f) => ({ field: f, label: FIELD_LABELS[f] ?? f })),
  },
];

/** The Unit list's field catalog — the default for every catalog-taking helper. */
export const UNIT_CATALOG: GroupableFieldCatalog = {
  staticCategories: STATIC_CATEGORIES,
  fieldLabels: FIELD_LABELS,
};

/**
 * Returns the ordered list of field categories for the FieldPickerDropdown.
 *
 * - Static categories with at least one field are included first.
 * - Dynamic Labels / Space Labels sections follow when the respective key
 *   arrays are non-empty.
 * - The Values "coming soon" placeholder is always appended last.
 *
 * @param labelKeyCounts    Optional map of label key → unit count (from filteredUnits).
 * @param spaceLabelKeyCounts Optional map of space label key → unit count.
 * @param catalog - Field catalog whose static categories seed the result. Defaults to
 *   {@link UNIT_CATALOG}.
 */
export function getGroupableCategories(
  labelKeys: string[],
  spaceLabelKeys: string[],
  labelKeyCounts?: Record<string, number>,
  spaceLabelKeyCounts?: Record<string, number>,
  catalog: GroupableFieldCatalog = UNIT_CATALOG,
): GroupableCategory[] {
  const result: GroupableCategory[] = [];

  // Static categories — omit empty ones
  for (const cat of catalog.staticCategories) {
    if (cat.fields.length > 0) {
      result.push(cat);
    }
  }

  // Dynamic label sections — rendered as hover-triggered submenu rows
  if (labelKeys.length > 0) {
    result.push({
      header: 'Labels',
      fields: labelKeys.map((k) => ({
        field: `Labels.${k}`,
        label: k,
        // Omit count when missing or zero so rows without data show no badge.
        count: labelKeyCounts?.[k] || undefined,
      })),
      isSubmenu: true,
      searchPlaceholder: 'Filter label keys…',
    });
  }

  if (spaceLabelKeys.length > 0) {
    result.push({
      header: 'Space Labels',
      fields: spaceLabelKeys.map((k) => ({
        field: `Space.Labels.${k}`,
        label: k,
        count: spaceLabelKeyCounts?.[k] || undefined,
      })),
      isSubmenu: true,
      searchPlaceholder: 'Filter space label keys…',
    });
  }

  // Values — always last, always coming-soon, rendered as submenu trigger
  result.push({
    header: 'Values',
    fields: [],
    comingSoon: true,
    isSubmenu: true,
    searchPlaceholder: 'Filter values…',
  });

  return result;
}

/**
 * Derives the human-readable display text for a groupable field key.
 *
 * - Strips `Labels.` / `Space.Labels.` prefixes for dynamic label fields.
 * - Looks up catalog labels for known fields.
 * - Falls back to the raw field name for anything not recognised.
 *
 * @param field - The groupable field key.
 * @param fieldLabelMap - Label overrides, defaulting to the Unit catalog's own map.
 */
export function getFieldLabel(field: string, fieldLabelMap: Record<string, string> = FIELD_LABELS): string {
  // Guard against null/undefined arriving from API responses whose types are
  // technically non-optional but may be missing in practice.
  if (!field) return '';
  if (field.startsWith('Space.Labels.')) {
    return field.slice('Space.Labels.'.length);
  }
  if (field.startsWith('Labels.')) {
    return field.slice('Labels.'.length);
  }
  return fieldLabelMap[field] ?? field;
}
