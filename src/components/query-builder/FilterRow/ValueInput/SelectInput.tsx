// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, useState } from 'react';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popper from '@mui/material/Popper';

import { useQueryBuilderContext } from '../../QueryBuilderContext';
import { DropdownMenu } from '../../shared-styles';
import { buildCommonFieldOptions, type FieldOption } from './buildFieldOptions';
import { DropdownSearchField } from './DropdownSearchField';
import type { FieldConfig, FilterFieldType } from '../../types';
import { ValueButton } from '../styles';

interface SelectInputProps {
  field: FilterFieldType;
  config: FieldConfig;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Trigger to programmatically focus the input */
  focusTrigger?: number;
}

/**
 * Select dropdown for filter values
 * Handles spaces, targets, toolchain types, and fields with predefined options
 */
export const SelectInput = ({
  field,
  config,
  value,
  onChange,
  onRemove,
  disabled = false,
  autoFocus = false,
  focusTrigger = 0,
}: SelectInputProps) => {
  const { spaces, targets, toolchainTypes, resourceTypes, openAddMenu } = useQueryBuilderContext();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-open dropdown on mount if autoFocus
  useEffect(() => {
    if (autoFocus) {
      // Use setTimeout to ensure the component has mounted
      setTimeout(() => buttonRef.current?.click(), 0);
    }
  }, [autoFocus]);

  // Focus/open dropdown when focusTrigger changes (operator changed)
  useEffect(() => {
    if (focusTrigger > 0) {
      buttonRef.current?.click();
    }
  }, [focusTrigger]);

  const handleClose = () => {
    setAnchorEl(null);
    setSearchQuery('');
  };

  // When clicking away without selecting a value, remove the incomplete filter
  const handleClickAway = (event: MouseEvent | TouchEvent) => {
    // If the click landed inside the same filter chip (e.g. the operator
    // dropdown), don't remove — the user is still configuring this filter.
    const chipEl = buttonRef.current?.closest('[data-filter-chip]');
    if (chipEl && event.target instanceof Node && chipEl.contains(event.target)) {
      handleClose();
      return;
    }

    handleClose();
    if (!value) {
      onRemove();
    }
  };

  const handleSelect = (newValue: string) => {
    onChange(newValue);
    handleClose();
    // Open the add filter menu after selection so user can quickly add another filter
    openAddMenu?.();
  };

  // Build data array of options for filtering and rendering
  const optionItems = useMemo(
    (): FieldOption[] => buildCommonFieldOptions(field, config, { spaces, targets, toolchainTypes, resourceTypes }) || [],
    [field, config, spaces, targets, toolchainTypes, resourceTypes]
  );

  // Filter options by search query
  const filteredOptionItems = searchQuery
    ? optionItems.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : optionItems;

  // Handle keyboard events in the search input
  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    // Prevent parent DropdownMenu handler from intercepting keystrokes
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.preventDefault();
      if (searchQuery) {
        setSearchQuery('');
      } else {
        handleClose();
        if (!value) {
          onRemove();
        }
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      const firstItem = menuRef.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])') as HTMLElement;
      firstItem?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredOptionItems.length === 1) {
        handleSelect(filteredOptionItems[0].value);
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
      // If no value is selected, remove the filter
      if (!value) {
        onRemove();
      }
    } else if (event.key === 'Backspace' && !disabled) {
      // Remove filter when backspace is pressed on select (at any time)
      event.preventDefault();
      handleClose();
      onRemove();
    }
  };

  // Handle escape and backspace on the button itself (when dropdown is closed)
  const handleButtonKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !value && !disabled) {
      // Remove filter on escape when no value selected
      event.preventDefault();
      onRemove();
    } else if (event.key === 'Backspace' && !disabled) {
      event.preventDefault();
      onRemove();
    }
  };

  // Get display value for select fields
  const getDisplayValue = (): string | null => {
    if (!value) return null;

    if (field === 'space') {
      const space = spaces.find(s => s.id === value);
      return space?.name || value;
    }

    if (field === 'target') {
      const target = targets.find(t => t.id === value);
      return target?.name || value;
    }

    // For fields with predefined options
    if (config.options) {
      const option = config.options.find(o => o.value === value);
      return option?.label || value;
    }

    return value;
  };

  return (
    <>
      <ValueButton
        ref={buttonRef}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        onKeyDown={handleButtonKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={Boolean(anchorEl)}
      >
        {getDisplayValue() || <span style={{ opacity: 0.5 }}>Select...</span>}
        <KeyboardArrowDownIcon />
      </ValueButton>
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
      >
        <ClickAwayListener onClickAway={handleClickAway}>
          <DropdownMenu onKeyDown={handleKeyDown}>
            <DropdownSearchField
              inputRef={searchInputRef}
              value={searchQuery}
              onChange={setSearchQuery}
              onKeyDown={handleSearchKeyDown}
            />
            <MenuList ref={menuRef} autoFocusItem={false}>
              {filteredOptionItems.length === 0 ? (
                <MenuItem disabled>No matches</MenuItem>
              ) : (
                filteredOptionItems.map((item) => (
                  <MenuItem
                    key={item.value}
                    selected={value === item.value}
                    onClick={() => handleSelect(item.value)}
                  >
                    {item.label}
                  </MenuItem>
                ))
              )}
            </MenuList>
          </DropdownMenu>
        </ClickAwayListener>
      </Popper>
    </>
  );
};
