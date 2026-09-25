// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useGridApiContext } from '@mui/x-data-grid';
import { useEffect, useState } from 'react';

/**
 * Hook to access the current quick filter value from the DataGrid.
 * Returns the filter string that's being used to search the grid.
 */
export const useQuickFilter = (): string => {
  const apiRef = useGridApiContext();
  const [filterValue, setFilterValue] = useState<string>('');

  useEffect(() => {
    if (!apiRef?.current) {
      return;
    }

    // Get initial filter value
    const state = apiRef.current.state;
    const quickFilterValues = state.filter?.filterModel?.quickFilterValues || [];
    setFilterValue(quickFilterValues.join(' '));

    // Subscribe to filter model changes
    const unsubscribe = apiRef.current.subscribeEvent('filterModelChange', () => {
      const newState = apiRef.current.state;
      const newQuickFilterValues = newState.filter?.filterModel?.quickFilterValues || [];
      setFilterValue(newQuickFilterValues.join(' '));
    });

    return () => {
      unsubscribe();
    };
  }, [apiRef]);

  return filterValue;
};
