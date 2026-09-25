// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Column } from '@confighub/rtk-query';

export const BASE_COLUMNS = {
  // === Core Identity === (Default visible)
  Slug: true,
  ID: false, // UnitID
  Space: true,
  SpaceID: false,
  Target: true,
  ToolchainType: false,

  // === Status & Health ===
  UpgradeNeeded: true,
  UnreleasedChanges: true,

  // === Revisions === (Hidden by default)
  HeadRevisionNum: false,
  LastReleasedRevisionNum: false,
  HeadMutationNum: false,

  // === Timestamps === (Hidden by default)
  CreatedAt: false,
  UpdatedAt: true,

  // === Changes === (Hidden by default)
  ChangeSetID: false,
  ChangeSetSlug: false,
  LastChangeDescription: false,

  // === Clone/Upstream === (Hidden by default)
  UpstreamUnitSlug: false,
  UpstreamUnitID: false,
  UpstreamSpaceSlug: false,
  UpstreamSpaceID: false,

  // === Gates & Operations ===
  ValidationErrors: true,
  ValidationWarnings: false,
  DestroyGates: false,
  DeleteGates: false,

  // === Infrastructure === (Hidden by default)
  BridgeWorkerID: false,
  TargetBridgeWorkerID: false,
  TargetBridgeWorkerSlug: false,
  TargetID: false,

  // === Other Details === (Hidden by default)
  Annotations: false,
};

/**
 * Type representing the keys of BASE_COLUMNS
 */
export type BaseColumns = typeof BASE_COLUMNS;

export type BaseColumnKeys = keyof BaseColumns;

/**
 * Default columns that are shown in the unit data grid by default
 * Only includes columns where BASE_COLUMNS value is true
 */
export const DEFAULT_UNIT_COLUMNS = Object.entries(BASE_COLUMNS)
  .filter(([, visible]) => visible === true)
  .map(([key]) => key) as BaseColumnKeys[];

/**
 * Represents the delta between current columns and default columns
 */
export interface ColumnDelta {
  /** Columns to add beyond the defaults */
  add: string[];
  /** Default columns to remove */
  remove: string[];
}

/**
 * Parses a comma-delimited string of column changes into added and removed columns.
 * @param deltaString - The comma-delimited string (e.g., "-Slug,+Owner").
 * @returns An object containing `added` and `removed` arrays.
 */
export const parseColumnDelta = (deltaString: string) => {
  const added: string[] = [];
  const removed: string[] = [];

  deltaString.split(',').forEach((column) => {
    if (column.startsWith('+')) {
      added.push(column.slice(1)); // Remove the '+' prefix and add to the added array
    } else if (column.startsWith('-')) {
      removed.push(column.slice(1)); // Remove the '-' prefix and add to the removed array
    }
  });

  return { added, removed };
};

/**
 * Calculates the delta between visible columns and default columns
 * @param visibleColumns - Current visible columns
 * @returns Delta object with additions and removals
 */
export function calculateColumnDelta(
  visibleColumns: Record<string, boolean> | string[],
): ColumnDelta {
  let visibleColumnsArray: string[];

  if (Array.isArray(visibleColumns)) {
    // When an array is passed, it represents the complete list of visible columns
    visibleColumnsArray = visibleColumns;
  } else {
    // When an object is passed, filter for columns that are explicitly visible (true)
    visibleColumnsArray = Object.keys(visibleColumns).filter(
      (colName) => visibleColumns[colName] === true,
    );
  }

  // Find default columns that are NOT in visible columns (should be removed)
  const remove = DEFAULT_UNIT_COLUMNS.filter((col) => !visibleColumnsArray.includes(col));

  // Find visible columns that are NOT in default columns (should be added)
  const add = visibleColumnsArray.filter(
    (col) => !DEFAULT_UNIT_COLUMNS.includes(col as BaseColumnKeys),
  );

  return { add, remove };
}

/**
 * Encodes a column delta to a URL-friendly string format
 * Format: "+col1,col2,-col3,col4" where + indicates additions and - indicates removals
 * @param delta - Delta to encode
 * @returns Encoded string or empty string if no delta
 */
export function encodeColumnDelta(delta: ColumnDelta): string {
  const parts: string[] = [];

  // Add removed columns prefixed with "-"
  if (delta.remove.length > 0) {
    parts.push(...delta.remove.map((col) => `-${col}`));
  }

  // Add added columns prefixed with "+"
  if (delta.add.length > 0) {
    parts.push(...delta.add.map((col) => `+${col}`));
  }

  // Join all parts with a comma
  return parts.join(',');
}

/**
 * Decodes a column delta from URL string format
 * @param encoded - Encoded delta string
 * @returns Decoded delta object
 */
export function decodeColumnDelta(encoded: string): ColumnDelta {
  const delta: ColumnDelta = { add: [], remove: [] };

  if (!encoded) {
    return delta;
  }

  // Split the string by commas to get individual column changes
  const sections = encoded.split(',');

  for (const section of sections) {
    const trimmedSection = section.trim(); // Remove any extra whitespace

    if (trimmedSection.startsWith('+')) {
      // Add to the `add` array (remove the '+' prefix)
      delta.add.push(trimmedSection.slice(1));
    } else if (trimmedSection.startsWith('-')) {
      // Add to the `remove` array (remove the '-' prefix)
      delta.remove.push(trimmedSection.slice(1));
    }
  }

  return delta;
}

/**
 * Gets the final visible columns from a delta string
 * @param deltaString - Encoded delta string from URL
 * @returns Array of visible columns
 */
export function getColumnsFromDelta(columns: string): Column[] {
  if (!columns) {
    // Return only columns that are true in BASE_COLUMNS
    return DEFAULT_UNIT_COLUMNS.map((col) => ({ Name: col }));
  }

  // Get full column list of columns to add and remove based on BASE_COLUMNS.
  const { add, remove } = columns ? decodeColumnDelta(columns) : { add: [], remove: [] };

  // Build updated columns object
  const updatedColumns = { ...BASE_COLUMNS };

  // For all columns in add/remove, update their status
  add.forEach((col: string) => {
    updatedColumns[col as keyof typeof BASE_COLUMNS] = true;
  });

  remove.forEach((col: string) => {
    updatedColumns[col as keyof typeof BASE_COLUMNS] = false;
  });

  // Create final list of columns to save
  return Object.entries(updatedColumns)
    .map(([key, value]) => value && { Name: key })
    .filter(Boolean) as { Name: string }[];
}

/**
 * Checks if the current columns match the defaults (no delta needed)
 * @param columns - Current columns
 * @returns True if columns match defaults
 */
export function isDefaultColumns(columns: BaseColumnKeys[]): boolean {
  if (columns.length !== DEFAULT_UNIT_COLUMNS.length) {
    return false;
  }

  const defaultSet = new Set(DEFAULT_UNIT_COLUMNS);
  return columns.every((col) => defaultSet.has(col));
}

/**
 * Maps column names to their corresponding API field paths in the select parameter
 * This includes both direct Unit fields and related entity fields
 */
const COLUMN_TO_FIELD_MAP: Record<BaseColumnKeys, string | string[]> = {
  // Base columns - always needed
  Slug: 'Slug',
  ID: 'UnitID',
  Space: 'Space.Slug',
  SpaceID: 'SpaceID',
  Target: 'Target.Slug',
  TargetID: 'TargetID',
  ToolchainType: 'ToolchainType',
  // Status & Health columns
  UpgradeNeeded: ['UpstreamRevisionNum', 'UpstreamUnit.HeadRevisionNum'],
  // Legacy names are mapped by normalizeColumnName before reaching this map.
  UnreleasedChanges: ['HeadRevisionNum', 'LastReleasedRevisionNum'],
  // Revisions columns
  HeadRevisionNum: 'HeadRevisionNum',
  LastReleasedRevisionNum: 'LastReleasedRevisionNum',
  HeadMutationNum: 'HeadMutationNum',
  // Timestamps columns
  CreatedAt: 'CreatedAt',
  UpdatedAt: 'UpdatedAt',
  // Changes columns
  ChangeSetID: 'ChangeSetID',
  ChangeSetSlug: 'ChangeSet.Slug',
  LastChangeDescription: 'LastChangeDescription',
  // Clone/Upstream columns
  UpstreamUnitSlug: 'UpstreamUnit.Slug',
  UpstreamUnitID: 'UpstreamUnitID',
  UpstreamSpaceSlug: 'UpstreamSpace.Slug',
  UpstreamSpaceID: 'UpstreamSpaceID',
  // Gates & Operations columns
  ValidationErrors: 'ValidationErrors',
  ValidationWarnings: 'ValidationWarnings',
  DestroyGates: 'DestroyGates',
  DeleteGates: 'DeleteGates',
  // Infrastructure columns
  BridgeWorkerID: 'BridgeWorkerID',
  TargetBridgeWorkerID: 'Target.BridgeWorkerID',
  TargetBridgeWorkerSlug: 'Target.Slug',
  // Other Details columns
  Annotations: 'Annotations'
};

/**
 * Base fields that must always be included in select for page logic to work
 * These are needed for operations, filtering, and computed fields
 */
const BASE_SELECT_FIELDS = [
  'UnitID',
  'Slug',
  'SpaceID',
  'TargetID',
  'UpstreamUnitID',
  'ToolchainType', // Always needed for UnitModalComposer defaultToolchainType prop
  'Labels',
  'Values',
];

/**
 * Builds the select parameter string based on visible columns and grouping levels.
 *
 * Grouping levels also drive what fields the page reads off each unit (see
 * `getCellValue` in the unit list), so a column keyed under e.g. `Space.Labels.foo`
 * needs `Space.Labels` in the select even when no `Space.Labels.*` column is
 * currently visible — otherwise grouping reads `undefined` and every group
 * collapses to "(empty)".
 *
 * @param visibleColumns - Array of column names that are currently visible
 * @param groupByColumns - Optional array of column names used as group-by levels.
 *   Processed through the same dotted-name logic as visible columns so that
 *   grouping by a dotted field pulls its parent into the select.
 * @returns Comma-separated string of field paths for the API select parameter
 */
export function buildSelectParameter(
  visibleColumns: BaseColumnKeys[],
  groupByColumns: string[] = [],
): string {
  const fields = new Set<string>(BASE_SELECT_FIELDS);

  // Process visible columns and group-by levels through the same logic — both
  // describe fields that need to be present in the response.
  const allColumns: string[] = [...visibleColumns, ...groupByColumns];

  allColumns.forEach((columnName) => {
    const fieldMapping = COLUMN_TO_FIELD_MAP[columnName as BaseColumnKeys];

    if (fieldMapping !== undefined) {
      if (Array.isArray(fieldMapping)) {
        fieldMapping.forEach((field) => fields.add(field));
      } else if (fieldMapping !== '') {
        fields.add(fieldMapping);
      }
      // Empty string or empty array means auto-included (like UnitStatus fields)
      return;
    }

    // Column not in map — handle dotted dynamic columns. The API's `select`
    // parameter takes literal field paths, and an included entity returns
    // ONLY the fields named in select (e.g. `Space.Slug` returns just Slug,
    // not Labels). So `Space.Labels.X` and `Space.DisplayName` need explicit
    // entries here or `eu.Space.Labels` / `eu.Space.DisplayName` come back
    // undefined.
    if (
      columnName.startsWith('Labels.') ||
      columnName.startsWith('Values.') ||
      columnName.startsWith('Annotations.')
    ) {
      // Unit-level dynamic columns — covered by Labels/Values in BASE_SELECT_FIELDS.
      return;
    }
    if (columnName.startsWith('Space.Labels.')) {
      fields.add('Space.Labels');
      return;
    }
    if (columnName.startsWith('Space.')) {
      // Space.X scalar (e.g. Space.DisplayName, Space.Slug already covered).
      fields.add(columnName);
      return;
    }
  });

  return Array.from(fields).sort().join(',');
}

/**
 * Builds the include parameter string based on visible columns and grouping levels.
 *
 * Mirrors `buildSelectParameter`: grouping levels need their related entities
 * expanded on the initial fetch (e.g. grouping by `UpstreamSpaceSlug` requires
 * `UpstreamSpaceID` in include) so the left-pane grouping has the data it
 * needs without a second round-trip.
 *
 * @param visibleColumns - Array of column names currently visible in the grid
 * @param groupByColumns - Optional array of column names used as grouping levels
 * @returns Comma-separated string of relation IDs for the API include parameter
 */
export function buildIncludeParameter(
  visibleColumns: BaseColumnKeys[],
  groupByColumns: string[] = [],
): string {
  const includes = new Set<string>([
    'SpaceID', // Always needed for Space.Slug (base column)
    'TargetID', // Always needed for Target.Slug (base column)
    'UnitEventID', // Needed for unit operations
    'UpstreamUnitID', // Needed for UpgradeNeeded computation (base column)
  ]);

  // Union visible + grouping so a column required by either contributes its
  // expansion.
  const allColumns: string[] = [...visibleColumns, ...groupByColumns];

  // Check if any column needs UpstreamSpace
  const needsUpstreamSpace = allColumns.some((col) => ['UpstreamSpaceSlug', 'UpstreamSpaceID'].includes(col));
  if (needsUpstreamSpace) {
    includes.add('UpstreamSpaceID');
  }

  // Check if any column needs BridgeWorker
  const needsBridgeWorker = allColumns.some((col) => ['BridgeWorkerID'].includes(col));
  if (needsBridgeWorker) {
    includes.add('BridgeWorkerID');
  }

  // Check if any column needs ChangeSet
  const needsChangeSet = allColumns.some((col) => ['ChangeSetID', 'ChangeSetSlug'].includes(col));
  if (needsChangeSet) {
    includes.add('ChangeSetID');
  }

  return Array.from(includes).sort().join(',');
}

/**
 * Column names that were renamed. Saved Views store column names verbatim
 * (View.Columns[].Name), so a View created before a rename still carries the
 * old name. Normalizing on read keeps those Views working without migrating
 * stored data.
 */
const LEGACY_COLUMN_NAMES: Record<string, BaseColumnKeys> = {
  // Renamed when apply gave way to Release publish. The concept is the same.
  UnappliedChanges: 'UnreleasedChanges',
};

/**
 * Maps a possibly-legacy column name to its current name. Unknown names pass
 * through unchanged — they may be dynamic (Labels.<key>) or simply stale.
 */
export function normalizeColumnName(name: string): string {
  return LEGACY_COLUMN_NAMES[name] ?? name;
}

/**
 * Normalizes a list of column names read from a saved View.
 */
export function normalizeColumnNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map(normalizeColumnName).filter((n) => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}
