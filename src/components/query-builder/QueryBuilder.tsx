// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AddFilterButton, type AddFilterButtonHandle } from './AddFilterButton';
import { FilterRow } from './FilterRow';
import {
  ClearButton,
  Container,
  FiltersWrapper,
} from './QueryBuilder.styles';
import { QueryBuilderProvider, type QueryBuilderContextValue } from './QueryBuilderContext';
import type { FilterCondition, FilterFieldType, QueryBuilderProps } from './types';
import { generateFilterId, getDefaultOperator } from './operators';

/**
 * Group filters so that label filters are always rendered together.
 * Returns a new array with filters sorted: non-label filters first (preserving order),
 * then all label filters grouped together (preserving their relative order).
 *
 * Also returns a mapping from the grouped index back to the original index
 * so that update/remove callbacks work correctly.
 */
const groupFiltersForDisplay = (
  filters: FilterCondition[]
): { grouped: FilterCondition[]; originalIndices: number[] } => {
  const nonLabelFilters: { filter: FilterCondition; originalIndex: number }[] = [];
  const labelFilters: { filter: FilterCondition; originalIndex: number }[] = [];

  filters.forEach((filter, index) => {
    if (filter.field === 'labels') {
      labelFilters.push({ filter, originalIndex: index });
    } else {
      nonLabelFilters.push({ filter, originalIndex: index });
    }
  });

  // Put non-label filters first, then label filters grouped together
  const combined = [...nonLabelFilters, ...labelFilters];

  return {
    grouped: combined.map((item) => item.filter),
    originalIndices: combined.map((item) => item.originalIndex),
  };
};

export const QueryBuilder = ({
  filters,
  onFiltersChange,
  lockedFilters = [],
  entityType = 'Unit',
  spaces = [],
  targets = [],
  toolchainTypes,
  bridgeWorkers = [],
  slugs = [],
  resourceTypes = [],
  labelOptions = { keys: [], valuesByKey: {}, countByKey: {}, countByKeyValue: {} },
  disabled = false,
  onSelectSavedView,
}: QueryBuilderProps) => {
  // Track which filter was just added so we can auto-focus it
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);

  const addFilterButtonRef = useRef<AddFilterButtonHandle>(null);

  // Clear the newly added ID after a short delay (after focus has been set)
  useEffect(() => {
    if (newlyAddedId) {
      const timer = setTimeout(() => setNewlyAddedId(null), 100);
      return () => clearTimeout(timer);
    }
  }, [newlyAddedId]);

  // Handle backspace/delete key to remove last filter (when not focused on an input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle backspace/delete if there are filters to remove
      if ((e.key !== 'Backspace' && e.key !== 'Delete') || filters.length === 0 || disabled) {
        return;
      }

      // Check if focus is in the Add Filter menu - if so, close it and remove the last filter
      const target = e.target as HTMLElement;
      const isInAddFilterMenu = target.closest('[role="menu"]') !== null;

      if (isInAddFilterMenu) {
        // Close the Add Filter menu and remove the last filter
        e.preventDefault();
        addFilterButtonRef.current?.closeMenu();
        onFiltersChange(filters.slice(0, -1));
        return;
      }

      // Don't trigger if focus is in an input, textarea, contenteditable, or button
      // (component-level handlers will handle those cases)
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'BUTTON' ||
        target.isContentEditable ||
        target.closest('[role="listbox"]')
      ) {
        return;
      }

      // Prevent browser back navigation
      e.preventDefault();

      // Remove the last filter
      onFiltersChange(filters.slice(0, -1));
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filters, disabled, onFiltersChange]);

  const handleAddFilter = useCallback(
    (field: FilterFieldType) => {
      const id = generateFilterId();
      const newCondition: FilterCondition = {
        id,
        field,
        operator: getDefaultOperator(field),
        value: '',
      };
      setNewlyAddedId(id);

      // Auto-add resourceType filter when whereData is added (if not already present)
      const allFilters = [...lockedFilters, ...filters];
      const hasResourceType = allFilters.some((f) => f.field === 'resourceType');

      if (field === 'whereData' && !hasResourceType && entityType === 'Unit') {
        const resourceTypeId = generateFilterId();
        const resourceTypeCondition: FilterCondition = {
          id: resourceTypeId,
          field: 'resourceType',
          operator: 'equals',
          value: '*',
        };
        onFiltersChange([...filters, newCondition, resourceTypeCondition]);
      } else {
        onFiltersChange([...filters, newCondition]);
      }
    },
    [filters, lockedFilters, entityType, onFiltersChange]
  );

  const handleUpdateFilter = useCallback(
    (index: number, updatedCondition: FilterCondition) => {
      const newFilters = [...filters];
      newFilters[index] = updatedCondition;
      onFiltersChange(newFilters);
    },
    [filters, onFiltersChange]
  );

  const handleRemoveFilter = useCallback(
    (index: number) => {
      onFiltersChange(filters.filter((_, i) => i !== index));
    },
    [filters, onFiltersChange]
  );

  const handleClearAll = useCallback(() => {
    onFiltersChange([]);
  }, [onFiltersChange]);

  // Combine locked filter fields with user filter fields for "existing" check
  const existingFields = [...lockedFilters.map((f) => f.field), ...filters.map((f) => f.field)];

  const hasFilters = filters.length > 0;
  const hasLockedFilters = lockedFilters.length > 0;

  // Group filters for display so label filters are always rendered together
  const { grouped: groupedFilters, originalIndices } = useMemo(
    () => groupFiltersForDisplay(filters),
    [filters]
  );

  // Callback to open the add filter menu (exposed to child components via context)
  const openAddMenu = useCallback(() => {
    addFilterButtonRef.current?.openMenu();
  }, []);

  // Create context value for child components (memoized to prevent unnecessary re-renders)
  const contextValue = useMemo<QueryBuilderContextValue>(() => ({
    entityType,
    spaces,
    targets,
    toolchainTypes: toolchainTypes || [],
    bridgeWorkers,
    slugs,
    resourceTypes,
    labelOptions,
    disabled,
    onSelectSavedView,
    openAddMenu,
  }), [
    entityType,
    spaces,
    targets,
    toolchainTypes,
    bridgeWorkers,
    slugs,
    resourceTypes,
    labelOptions,
    disabled,
    onSelectSavedView,
    openAddMenu,
  ]);

  return (
    <QueryBuilderProvider value={contextValue}>
      {/* The legacy "Views" dropdown row was replaced by the standalone
          ViewTabs strip rendered by useQueryBuilder.renderViewTabs(). The
          page is responsible for placing that strip above the QueryBuilder. */}
      <Container data-testid="query-builder">
        {(hasLockedFilters || hasFilters) && (
          <FiltersWrapper>
            {/* Render locked filters first */}
            {lockedFilters.map((condition) => (
              <FilterRow
                key={condition.id}
                condition={{ ...condition, locked: true }}
                onUpdate={() => {}}
                onRemove={() => {}}
                disabled={true}
              />
            ))}
            {/* Render user-editable filters (grouped so label filters are together) */}
            {groupedFilters.map((condition, displayIndex) => {
              const originalIndex = originalIndices[displayIndex];
              return (
                <FilterRow
                  key={condition.id}
                  condition={condition}
                  onUpdate={(updated) => handleUpdateFilter(originalIndex, updated)}
                  onRemove={() => handleRemoveFilter(originalIndex)}
                  disabled={disabled}
                  autoFocus={condition.id === newlyAddedId}
                />
              );
            })}
          </FiltersWrapper>
        )}
        <AddFilterButton
          ref={addFilterButtonRef}
          onAddFilter={handleAddFilter}
          existingFields={existingFields}
          entityType={entityType}
          disabled={disabled}
          hasFilters={hasFilters}
        />
        {hasFilters && (
          <ClearButton
            type="button"
            onClick={handleClearAll}
            disabled={disabled}
            data-testid="clear-all-filters"
          >
            Clear all
          </ClearButton>
        )}
      </Container>
    </QueryBuilderProvider>
  );
};
