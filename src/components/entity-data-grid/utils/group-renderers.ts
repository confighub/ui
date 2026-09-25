// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { GridRenderCellParams, GridValidRowModel } from '@mui/x-data-grid';

/**
 * Extract unique values from a group of rows for a specific column
 */
export const getUniqueValues = <T extends GridValidRowModel, V>(
  params: GridRenderCellParams<T>,
  rows: T[],
  valueExtractor: (row: T) => V,
): V[] | undefined => {
  if (params.rowNode.type === 'group') {
    const groupIds = Array.isArray(params.rowNode.children) ? params.rowNode.children : [];

    let invalidIdCount = 0;
    const filteredRows = rows.filter((row) => {
      // Validate row.id exists and is valid
      if (row.id === null || row.id === undefined) {
        invalidIdCount++;
        return false;
      }

      const rowId = typeof row.id === 'string' ? row.id : String(row.id);
      return groupIds.includes(rowId);
    });

    // Log if significant data loss occurred
    if (invalidIdCount > 0) {
      console.error(
        `[getUniqueValues] Found ${invalidIdCount} rows with invalid IDs during group filtering. ` +
        `These rows will not be included in the group.`,
        { invalidIdCount, totalRows: rows.length, groupIds }
      );
    }

    // Extract values for this column from all rows in the group
    const values = filteredRows.map(valueExtractor).filter(Boolean);
    return Array.from(new Set(values));
  }
  return undefined;
};

/**
 * Get filtered rows for a group
 */
export const getFilteredGroupRows = <T extends GridValidRowModel>(
  params: GridRenderCellParams<T>,
  rows: T[],
): T[] => {
  if (params.rowNode.type === 'group') {
    const groupIds = Array.isArray(params.rowNode.children) ? params.rowNode.children : [];

    let invalidIdCount = 0;
    const filteredRows = rows.filter((row) => {
      // Validate row.id exists and is valid
      if (row.id === null || row.id === undefined) {
        invalidIdCount++;
        return false;
      }

      const rowId = typeof row.id === 'string' ? row.id : String(row.id);
      return groupIds.includes(rowId);
    });

    // Log if significant data loss occurred
    if (invalidIdCount > 0) {
      console.error(
        `[getFilteredGroupRows] Found ${invalidIdCount} rows with invalid IDs during group filtering. ` +
        `These rows will not be included in the group.`,
        { invalidIdCount, totalRows: rows.length, groupIds }
      );
    }

    return filteredRows;
  }
  return [];
};
