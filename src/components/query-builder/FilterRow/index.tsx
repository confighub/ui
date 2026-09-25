// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useRef, useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';

import { FIELD_CONFIGS, getDefaultOperator, isMultiSelectConfig } from '../operators';
import type { FilterFieldType, FilterOperator, FilterRowProps } from '../types';

import { FieldDropdown } from './FieldDropdown';
import { LockedFilter } from './LockedFilter';
import { OperatorDropdown } from './OperatorDropdown';
import { FilterChip, RemoveButton, ValueSection } from './styles';
import { ValueInput } from './ValueInput';

/**
 * Check if a filter is incomplete (has no value set)
 * Used to determine if the filter should be cancelled on blur
 */
const isFilterIncomplete = (condition: FilterRowProps['condition']): boolean => {
  // For labels field, we need to check both labelKey and value
  if (condition.field === 'labels') {
    // If no labelKey, it's incomplete
    if (!condition.labelKey) return true;
    // For exists/notExists operators, only labelKey is needed
    if (condition.operator === 'exists' || condition.operator === 'notExists') {
      return false;
    }
    // For other operators, value is required
    return !condition.value;
  }
  // For all other fields, just check value
  return !condition.value;
};

/**
 * A single filter row in the QueryBuilder
 * Consists of: Field selector | Operator selector | Value input | Remove button
 */
export const FilterRow = ({
  condition,
  onUpdate,
  onRemove,
  disabled = false,
  autoFocus = false,
}: Omit<FilterRowProps, 'entityType' | 'spaces' | 'targets' | 'toolchainTypes' | 'bridgeWorkers' | 'labelOptions' | 'onSelectSavedView' | 'isFirst'>) => {
  const config = FIELD_CONFIGS[condition.field];
  const chipRef = useRef<HTMLDivElement>(null);
  // Keep a ref to the latest condition to avoid stale closure issues in blur handler
  const conditionRef = useRef(condition);
  conditionRef.current = condition;
  // Track whether a value was recently committed so the blur handler doesn't
  // race with React's render cycle on slow machines (e.g., CI)
  const recentlyCommittedRef = useRef(false);

  // Focus trigger: increment this to trigger value input focus
  const [focusTrigger, setFocusTrigger] = useState(0);

  // Handle blur on the entire chip - remove incomplete filters when focus leaves
  // Uses a delayed check to handle the race condition between blur and click events
  const handleChipBlur = useCallback((e: React.FocusEvent) => {
    // Check if focus is moving outside of this chip
    const relatedTarget = e.relatedTarget as HTMLElement | null;

    // If focus is moving to an element within the chip, don't do anything
    if (relatedTarget && chipRef.current?.contains(relatedTarget)) {
      return;
    }

    // If focus is moving to a MUI popper/menu (dropdowns), don't do anything
    // These render outside the chip but are part of our interaction
    if (relatedTarget?.closest('.MuiPopper-root') ||
        relatedTarget?.closest('.MuiMenu-root') ||
        relatedTarget?.closest('.MuiPopover-root')) {
      return;
    }

    // Use a delay to handle blur/click race condition
    // When clicking on a dropdown item, blur fires before click, so we need to
    // wait to see if focus comes back to a related element (like a dropdown)
    // The delay needs to be long enough for MUI Popper to render after a click
    // and for React state updates to propagate (important for multi-select dropdowns)
    setTimeout(() => {
      // Check if focus has returned to inside the chip
      // (e.g., value input was re-focused after operator change)
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement && chipRef.current?.contains(activeElement)) {
        return;
      }

      // Re-check if focus is now inside a MUI popper (dropdown just opened)
      if (activeElement?.closest('.MuiPopper-root') ||
          activeElement?.closest('.MuiMenu-root') ||
          activeElement?.closest('.MuiPopover-root')) {
        return;
      }

      // Also check if any MUI popper is currently open that belongs to our chip
      // This handles cases where the click opened a dropdown or the multi-select is still open
      const openPoppers = document.querySelectorAll('.MuiPopper-root');
      for (const popper of openPoppers) {
        // Check for menus, listboxes, or any menu items (multi-select dropdown)
        if (popper.querySelector('[role="listbox"]') ||
            popper.querySelector('[role="menu"]') ||
            popper.querySelector('[role="menuitem"]')) {
          return;
        }
      }

      // If a value was just committed, skip the incomplete check — React may
      // not have re-rendered yet so conditionRef could be stale
      if (recentlyCommittedRef.current) {
        recentlyCommittedRef.current = false;
        return;
      }

      // Use ref to get the latest condition value (avoids stale closure)
      // This is important because the input's onBlur commits the value, and we need
      // to check the UPDATED condition, not the one from when this callback was created
      if (!disabled && isFilterIncomplete(conditionRef.current)) {
        onRemove();
      }
    }, 50); // Increased delay to allow React state updates to propagate
  }, [disabled, onRemove]);

  // Wrap onUpdate to track when a value is committed, so the blur handler
  // doesn't race with React's async re-render on slow machines
  const handleValueUpdate = useCallback((updated: FilterRowProps['condition']) => {
    if (updated.value) {
      recentlyCommittedRef.current = true;
    }
    onUpdate(updated);
  }, [onUpdate]);

  // Locked filters are rendered differently
  if (condition.locked) {
    return <LockedFilter condition={condition} />;
  }

  const handleFieldChange = (newField: FilterFieldType) => {
    const newOperator = getDefaultOperator(newField);

    onUpdate({
      ...condition,
      field: newField,
      operator: newOperator,
      value: '',
      labelKey: newField === 'labels' ? condition.labelKey : undefined,
    });

    // Trigger focus on value input after field change
    setFocusTrigger(prev => prev + 1);
  };

  const handleOperatorChange = (operator: FilterOperator) => {
    recentlyCommittedRef.current = true;
    onUpdate({ ...condition, operator });
    // Trigger focus on value input after operator change
    setFocusTrigger(prev => prev + 1);
  };

  // For multi-select fields, compute the selection count for the operator dropdown
  const multiSelectCount = isMultiSelectConfig(config)
    ? (condition.value ? condition.value.split(',').filter(Boolean).length : 0)
    : undefined;

  return (
    <FilterChip ref={chipRef} onBlur={handleChipBlur} data-filter-chip>
      <FieldDropdown
        currentField={condition.field}
        onChange={handleFieldChange}
        disabled={disabled}
      />

      <OperatorDropdown
        config={config}
        currentOperator={condition.operator}
        onChange={handleOperatorChange}
        disabled={disabled}
        multiSelectCount={multiSelectCount}
      />

      <ValueSection>
        <ValueInput
          condition={condition}
          config={config}
          onUpdate={handleValueUpdate}
          onRemove={onRemove}
          disabled={disabled}
          autoFocus={autoFocus}
          focusTrigger={focusTrigger}
        />
      </ValueSection>

      <RemoveButton
        onClick={onRemove}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            onRemove();
          }
        }}
        disabled={disabled}
        aria-label={`Remove ${config.label} filter`}
      >
        <CloseIcon />
      </RemoveButton>
    </FilterChip>
  );
};

// Re-export subcomponents for direct use if needed
export { FieldDropdown } from './FieldDropdown';
export { LockedFilter } from './LockedFilter';
export { OperatorDropdown } from './OperatorDropdown';
export * from './ValueInput';
