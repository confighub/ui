// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Column group configuration. Previously used by `GroupedColumnsPanel` (a
 * Premium-DataGrid sidebar). The panel was removed when the codebase migrated
 * off the Premium DataGrid, but the column-group config objects across the
 * grid pages still reference these types — kept for source compatibility.
 */
export interface ColumnGroup {
  header: string;
  columns: string[];
}

/**
 * Dynamic group configuration (e.g., Labels, Values, Parameters).
 * See note on {@link ColumnGroup}.
 */
export interface DynamicGroupConfig {
  /** Name of the dynamic group (e.g., 'Labels', 'Values') */
  name: string;
  /** Field prefix to identify columns (e.g., 'Labels.', 'Values.') */
  columnPrefix: string;
}
