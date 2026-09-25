// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react';
import {
  GridColDef,
  GridColumnResizeParams,
  GridColumnVisibilityModel,
  GridFilterModel,
  GridPaginationModel,
  GridSortModel,
  GridValidRowModel,
} from '@mui/x-data-grid';

interface ColumnWidths {
  [fieldName: string]: number;
}

interface GridState {
  columnWidths?: ColumnWidths;
  columnVisibility?: GridColumnVisibilityModel;
  sortModel?: GridSortModel;
  filterModel?: GridFilterModel;
  paginationModel?: GridPaginationModel;
}

interface GridPersistenceDefaults {
  sortModel?: GridSortModel;
  filterModel?: GridFilterModel;
  paginationModel?: GridPaginationModel;
  columnVisibility?: GridColumnVisibilityModel;
}

/**
 * Hook to persist DataGrid state (column widths, sorting, filtering, visibility, pagination)
 * in localStorage for MUI DataGrid tables.
 *
 * @param tableKey - Unique identifier for the table (e.g., 'revisions-table')
 * @param defaults - Optional default values to use when no persisted state exists
 * @returns Object containing state models and handlers for DataGrid persistence
 *
 * @example
 * ```tsx
 * const {
 *   columnVisibilityModel,
 *   onColumnVisibilityModelChange,
 *   sortModel,
 *   onSortModelChange,
 *   // ... other state
 * } = useGridPersistence('my-table', {
 *   sortModel: [{ field: 'createdAt', sort: 'desc' }],
 *   paginationModel: { page: 0, pageSize: 50 },
 * });
 *
 * <DataGrid
 *   columnVisibilityModel={columnVisibilityModel}
 *   onColumnVisibilityModelChange={onColumnVisibilityModelChange}
 *   sortModel={sortModel}
 *   onSortModelChange={onSortModelChange}
 *   // ... other props
 * />
 * ```
 */
export const useGridPersistence = (
  tableKey: string,
  defaults: GridPersistenceDefaults = {},
) => {
  const storageKey = `gridState_${tableKey}`;

  // Helper to safely load state from localStorage
  const loadState = useCallback((): GridState => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return {};

      const state: GridState = JSON.parse(stored);
      return state;
    } catch (error) {
      console.error(
        `[useGridPersistence] Failed to load grid state for "${tableKey}". ` +
        `Your table will work normally, but previous customizations could not be restored.`,
        error
      );

      // Clear corrupted data
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Silently fail if we can't remove
      }

      return {};
    }
  }, [storageKey, tableKey]);

  // React state for each DataGrid feature - initialize with lazy initializer
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => {
    const state = loadState();
    return state.columnWidths ?? {};
  });

  const [columnVisibilityModel, setColumnVisibilityModel] = useState<GridColumnVisibilityModel>(() => {
    const state = loadState();
    return state.columnVisibility ?? defaults.columnVisibility ?? {};
  });

  const [sortModel, setSortModel] = useState<GridSortModel>(() => {
    const state = loadState();
    return state.sortModel ?? defaults.sortModel ?? [];
  });

  const [filterModel, setFilterModel] = useState<GridFilterModel>(() => {
    const state = loadState();
    return state.filterModel ?? defaults.filterModel ?? { items: [] };
  });

  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>(() => {
    const state = loadState();
    return state.paginationModel ?? defaults.paginationModel ?? { page: 0, pageSize: 100 };
  });

  // Helper to save state to localStorage - needs useCallback since it's used in other callbacks
  const updateState = useCallback((updates: Partial<GridState>) => {
    const currentState: GridState = {
      columnWidths,
      columnVisibility: columnVisibilityModel,
      sortModel,
      filterModel,
      paginationModel,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...currentState, ...updates }));
    } catch (error) {
      console.error(
        `[useGridPersistence] Failed to save grid state for "${tableKey}". ` +
        `Your current view will work, but changes may not persist on page refresh. ` +
        `This can happen if localStorage is full or disabled.`,
        error
      );
    }
  }, [storageKey, tableKey, columnWidths, columnVisibilityModel, sortModel, filterModel, paginationModel]);

  // Handler for column width changes
  const handleColumnResize = useCallback((params: GridColumnResizeParams) => {
    setColumnWidths(prev => {
      const updatedWidths: ColumnWidths = {
        ...prev,
        [params.colDef.field]: params.width,
      };
      updateState({ columnWidths: updatedWidths });
      return updatedWidths;
    });
  }, [updateState]);

  // Handler for column visibility changes
  const handleColumnVisibilityChange = useCallback((newModel: GridColumnVisibilityModel) => {
    setColumnVisibilityModel(newModel);
    updateState({ columnVisibility: newModel });
  }, [updateState]);

  // Handler for sort model changes
  const handleSortModelChange = useCallback((newModel: GridSortModel) => {
    setSortModel(newModel);
    updateState({ sortModel: newModel });
  }, [updateState]);

  // Handler for filter model changes
  const handleFilterModelChange = useCallback((newModel: GridFilterModel) => {
    setFilterModel(newModel);
    updateState({ filterModel: newModel });
  }, [updateState]);

  // Handler for pagination model changes
  const handlePaginationModelChange = useCallback((newModel: GridPaginationModel) => {
    setPaginationModel(newModel);
    updateState({ paginationModel: newModel });
  }, [updateState]);

  // Apply stored column widths to column definitions and clean up stale widths
  const applyStoredWidths = useCallback(<T extends GridValidRowModel>(
    columns: GridColDef<T>[]
  ): GridColDef<T>[] => {
    if (!columnWidths || Object.keys(columnWidths).length === 0) {
      return columns;
    }

    // Get valid column fields for cleanup
    const validFields = new Set(columns.map(col => col.field));
    const hasStaleWidths = Object.keys(columnWidths).some(field => !validFields.has(field));

    // Clean up stale widths if any exist
    if (hasStaleWidths) {
      const cleanedWidths = Object.fromEntries(
        Object.entries(columnWidths).filter(([field]) => validFields.has(field))
      );
      setColumnWidths(cleanedWidths);
      updateState({ columnWidths: cleanedWidths });
    }

    return columns.map(column => {
      const storedWidth = columnWidths[column.field];
      if (storedWidth !== undefined) {
        // Remove flex when width is set, as flex takes precedence over width in MUI DataGrid
        return {
          ...column,
          width: storedWidth,
          flex: undefined,
        };
      }
      return column;
    });
  }, [columnWidths, setColumnWidths, updateState]);

  // Clear all stored state for this table
  const clearStoredState = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error(
        `[useGridPersistence] Failed to clear stored state for "${tableKey}". ` +
        `The table will still reset to defaults.`,
        error
      );
    }

    // Reset state to defaults regardless of localStorage success
    setColumnWidths({});
    setColumnVisibilityModel(defaults.columnVisibility ?? {});
    setSortModel(defaults.sortModel ?? []);
    setFilterModel(defaults.filterModel ?? { items: [] });
    setPaginationModel(defaults.paginationModel ?? { page: 0, pageSize: 100 });
  }, [storageKey, tableKey, defaults]);

  // Check if state has been changed from defaults
  const hasColumnWidths = columnWidths && Object.keys(columnWidths).length > 0;

  const defaultColumnVisibility = defaults.columnVisibility ?? {};
  const hasColumnVisibility = JSON.stringify(columnVisibilityModel) !== JSON.stringify(defaultColumnVisibility);

  // For sortModel comparison, filter out the grouping field since MUI manages it automatically
  const defaultSortModel = defaults.sortModel ?? [];
  const normalizedSortModel = sortModel.filter(item => item.field !== '__row_group_by_columns_group__');
  const normalizedDefaultSortModel = defaultSortModel.filter(item => item.field !== '__row_group_by_columns_group__');
  const hasSortModel = JSON.stringify(normalizedSortModel) !== JSON.stringify(normalizedDefaultSortModel);

  const defaultFilterModel = defaults.filterModel ?? { items: [] };
  const hasFilterModel = JSON.stringify(filterModel) !== JSON.stringify(defaultFilterModel);

  const defaultPaginationModel = defaults.paginationModel ?? { page: 0, pageSize: 100 };
  const hasPaginationModel = JSON.stringify(paginationModel) !== JSON.stringify(defaultPaginationModel);

  const hasStateChanged = !!(hasColumnWidths || hasColumnVisibility || hasSortModel || hasFilterModel || hasPaginationModel);

  // Return object - no useMemo needed since handlers are already memoized
  return {
    // Column widths
    handleColumnResize,
    applyStoredWidths,

    // Column visibility
    columnVisibilityModel,
    onColumnVisibilityModelChange: handleColumnVisibilityChange,

    // Sorting
    sortModel,
    onSortModelChange: handleSortModelChange,

    // Filtering
    filterModel,
    onFilterModelChange: handleFilterModelChange,

    // Pagination
    paginationModel,
    onPaginationModelChange: handlePaginationModelChange,

    // Utilities
    clearStoredState,
    hasStateChanged,
  };
};
