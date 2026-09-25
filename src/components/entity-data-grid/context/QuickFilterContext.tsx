// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { GridApi } from '@mui/x-data-grid';
import React from 'react';

/**
 * Shared filter state manager to prevent memory leaks.
 * Uses a WeakMap to associate filter values with DataGrid instances.
 */
class FilterStateManager {
  private filterStates = new WeakMap<GridApi, string>();
  private listeners = new WeakMap<GridApi, Set<() => void>>();
  private unsubscribers = new WeakMap<GridApi, () => void>();

  subscribe(apiRef: GridApi, callback: () => void): () => void {
    // Initialize if first subscriber for this grid
    if (!this.listeners.has(apiRef)) {
      this.listeners.set(apiRef, new Set());
      this.initializeGrid(apiRef);
    }

    // Add this callback to the set
    const callbacks = this.listeners.get(apiRef)!;
    callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback);
      // Clean up if last subscriber
      if (callbacks.size === 0) {
        this.cleanupGrid(apiRef);
      }
    };
  }

  private initializeGrid(apiRef: GridApi) {
    // Get initial filter value
    const state = apiRef.state;
    const quickFilterValues = state.filter?.filterModel?.quickFilterValues || [];
    this.filterStates.set(apiRef, quickFilterValues.join(' '));

    // Subscribe to filter changes ONCE per grid
    const unsubscribe = apiRef.subscribeEvent('filterModelChange', () => {
      const newState = apiRef.state;
      const newQuickFilterValues = newState.filter?.filterModel?.quickFilterValues || [];
      const newValue = newQuickFilterValues.join(' ');
      this.filterStates.set(apiRef, newValue);

      // Notify all listeners for this grid
      const callbacks = this.listeners.get(apiRef);
      if (callbacks) {
        callbacks.forEach((cb) => cb());
      }
    });

    this.unsubscribers.set(apiRef, unsubscribe);
  }

  private cleanupGrid(apiRef: GridApi) {
    const unsubscribe = this.unsubscribers.get(apiRef);
    if (unsubscribe) {
      unsubscribe();
    }
    this.unsubscribers.delete(apiRef);
    this.listeners.delete(apiRef);
    this.filterStates.delete(apiRef);
  }

  getFilterValue(apiRef: GridApi): string {
    return this.filterStates.get(apiRef) || '';
  }
}

// Single instance shared across all grids
const filterManager = new FilterStateManager();

/**
 * Hook to access the current quick filter value.
 * Uses a shared subscription manager to prevent memory leaks.
 */
export const useQuickFilterContext = (apiRef: GridApi | undefined): string => {
  const [filterValue, setFilterValue] = React.useState('');

  React.useEffect(() => {
    if (!apiRef) {
      return;
    }

    // Get initial value
    setFilterValue(filterManager.getFilterValue(apiRef));

    // Subscribe to changes
    const unsubscribe = filterManager.subscribe(apiRef, () => {
      setFilterValue(filterManager.getFilterValue(apiRef));
    });

    return unsubscribe;
  }, [apiRef]);

  return filterValue;
};

// For backward compatibility
export const QuickFilterProvider = ({ children }: { children: React.ReactNode }) => children;
