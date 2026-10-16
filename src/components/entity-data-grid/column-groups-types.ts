// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Column group configuration: how `GroupedColumnsPanel`, the panel behind
 * `EntityDataGrid`'s Columns button, groups a grid's columns. A column no
 * group names is not listed there.
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
