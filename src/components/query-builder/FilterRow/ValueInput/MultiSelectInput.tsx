// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useRef, useState } from 'react';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SearchIcon from '@mui/icons-material/Search';
import Checkbox from '@mui/material/Checkbox';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popper from '@mui/material/Popper';
import { styled } from '@mui/material/styles';

import { useQueryBuilderContext } from '../../QueryBuilderContext';
import { DropdownMenu } from '../../shared-styles';
import { buildCommonFieldOptions } from './buildFieldOptions';
import { DropdownSearchField } from './DropdownSearchField';
import type { FieldConfig, FilterCondition, FilterFieldType, FilterOperator } from '../../types';
import { ValueButton } from '../styles';

interface MultiSelectInputProps {
  field: FilterFieldType;
  config: FieldConfig;
  value: string; // Comma-separated values
  condition: FilterCondition;
  onUpdate: (condition: FilterCondition) => void;
  onRemove: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  focusTrigger?: number;
}

interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

const StyledCheckbox = styled(Checkbox)(({ theme }) => ({
  padding: 0,
  marginRight: theme.spacing(1),
  '& .MuiSvgIcon-root': {
    fontSize: 18,
  },
}));

const StyledGroupHeader = styled(ListSubheader)(({ theme }) => ({
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: theme.palette.text.secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  lineHeight: '28px',
  backgroundColor: theme.palette.background.paper,
  padding: theme.spacing(0.5, 1.5),
}));

/**
 * Compute the correct operator based on selection count and current polarity.
 * 1 item or 0 → equals/notEquals, >1 items → in/notIn.
 * When count is 0, the caller should handle removal via handleClickAway.
 */
export const getAutoOperator = (currentOperator: FilterOperator, count: number): FilterOperator => {
  const isNegative = currentOperator === 'notEquals' || currentOperator === 'notIn';
  if (count <= 1) {
    return isNegative ? 'notEquals' : 'equals';
  }
  return isNegative ? 'notIn' : 'in';
};

/**
 * Multi-select dropdown for filter values with checkboxes.
 * Matches the design pattern of SelectInput but allows multiple selections.
 */
export const MultiSelectInput = ({
  field,
  config,
  value,
  condition,
  onUpdate,
  onRemove,
  disabled = false,
  autoFocus = false,
  focusTrigger = 0,
}: MultiSelectInputProps) => {
  const { spaces, targets, toolchainTypes, slugs, resourceTypes, openAddMenu } = useQueryBuilderContext();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Parse comma-separated string to array
  const selectedValues = value ? value.split(',').map((v) => v.trim()).filter(Boolean) : [];

  // After multi-select closes, open the Add Filter menu only if no other
  // dropdown/popper was opened by the same interaction (e.g. clicking the
  // operator dropdown should NOT trigger the Add Filter menu).
  const openAddMenuIfNoPopperOpen = useCallback(() => {
    setTimeout(() => {
      const openPoppers = document.querySelectorAll('.MuiPopper-root');
      if (openPoppers.length === 0) {
        openAddMenu?.();
      }
    }, 150);
  }, [openAddMenu]);

  // Auto-open dropdown on mount if autoFocus
  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => buttonRef.current?.click(), 0);
    }
  }, [autoFocus]);

  // Focus/open dropdown when focusTrigger changes (operator changed)
  useEffect(() => {
    if (focusTrigger > 0) {
      buttonRef.current?.click();
    }
  }, [focusTrigger]);

  // Get options based on field type
  const getOptions = (): SelectOption[] => {
    // Slug field has grouped options (by space name)
    if (field === 'slug') {
      const sorted = [...slugs].sort((a, b) => {
        const spaceCompare = a.spaceName.localeCompare(b.spaceName);
        if (spaceCompare !== 0) return spaceCompare;
        return a.slug.localeCompare(b.slug);
      });
      return sorted.map((s) => ({
        value: s.slug,
        label: s.slug,
        group: s.spaceName,
      }));
    }

    // Common fields shared with SelectInput
    return buildCommonFieldOptions(field, config, { spaces, targets, toolchainTypes, resourceTypes }) || [];
  };

  const options = getOptions();
  const supportsContains = config.operators.some((op) => op.value === 'contains');

  // Filter options by search query (also searches group name for grouped options)
  const filteredOptions = searchQuery
    ? options.filter((option) => {
        const query = searchQuery.toLowerCase();
        return option.label.toLowerCase().includes(query) ||
          (option.group?.toLowerCase().includes(query) ?? false);
      })
    : options;

  const handleClose = () => {
    setAnchorEl(null);
    setSearchQuery('');
  };

  const handleContainsSelect = () => {
    onUpdate({ ...condition, value: searchQuery.trim(), operator: 'contains' });
    handleClose();
    openAddMenuIfNoPopperOpen();
  };

  // When clicking away or losing focus, finalize the selection
  const handleClickAway = (event: MouseEvent | TouchEvent) => {
    // If the click landed inside the same filter chip (e.g. the operator
    // dropdown), don't remove — the user is still configuring this filter.
    const chipEl = buttonRef.current?.closest('[data-filter-chip]');
    if (chipEl && event.target instanceof Node && chipEl.contains(event.target)) {
      handleClose();
      return;
    }

    handleClose();
    if (selectedValues.length === 0) {
      // Nothing selected - remove the filter
      onRemove();
    } else {
      openAddMenuIfNoPopperOpen();
    }
  };

  const handleToggle = (optionValue: string) => {
    const isSelected = selectedValues.includes(optionValue);
    let newValues: string[];

    if (isSelected) {
      newValues = selectedValues.filter((v) => v !== optionValue);
    } else {
      newValues = [...selectedValues, optionValue];
    }

    const newValue = newValues.join(',');
    const newOperator = getAutoOperator(condition.operator, newValues.length);
    onUpdate({ ...condition, value: newValue, operator: newOperator });
  };

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
        if (selectedValues.length === 0) {
          onRemove();
        } else {
          openAddMenuIfNoPopperOpen();
        }
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      const firstItem = menuRef.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])') as HTMLElement;
      firstItem?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredOptions.length === 1) {
        handleToggle(filteredOptions[0].value);
      } else if (searchQuery.trim() && supportsContains) {
        handleContainsSelect();
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Let arrow keys and Space bubble through to MenuList/MenuItem
    // MUI MenuItem handles Space by triggering onClick
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === ' ') {
      return; // Don't prevent default - let MUI handle it
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
      if (selectedValues.length === 0) {
        onRemove();
      } else {
        openAddMenuIfNoPopperOpen();
      }
    } else if (event.key === 'Backspace' && !disabled) {
      event.preventDefault();
      handleClose();
      onRemove();
    }
    // Note: Enter is handled in MenuList's onKeyDownCapture to prevent MUI's default behavior
  };

  // Handle button keyboard events when dropdown is closed
  const handleButtonKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && selectedValues.length === 0 && !disabled) {
      event.preventDefault();
      onRemove();
    } else if (event.key === 'Backspace' && !disabled) {
      event.preventDefault();
      onRemove();
    }
  };

  // Get display value for the button
  const getDisplayValue = (): string | null => {
    if (selectedValues.length === 0) return null;

    // Find labels for selected values
    const selectedLabels = selectedValues.map((val) => {
      const option = options.find((o) => o.value === val);
      return option?.label || val;
    });

    if (selectedLabels.length === 1) {
      return selectedLabels[0];
    }
    if (selectedLabels.length === 2) {
      return `${selectedLabels[0]}, ${selectedLabels[1]}`;
    }
    return `${selectedLabels[0]} (+${selectedLabels.length - 1} more)`;
  };

  return (
    <>
      <ValueButton
        ref={buttonRef}
        onClick={(e) => {
          setAnchorEl(e.currentTarget);
        }}
        onKeyDown={handleButtonKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={Boolean(anchorEl)}
      >
        {getDisplayValue() || <span style={{ opacity: 0.5 }}>{config.placeholder || 'Select...'}</span>}
        <KeyboardArrowDownIcon />
      </ValueButton>
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
        data-testid="multi-select-dropdown"
      >
        <ClickAwayListener onClickAway={handleClickAway}>
          <DropdownMenu onKeyDown={handleKeyDown} data-testid="multi-select-menu" sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <DropdownSearchField
              inputRef={searchInputRef}
              value={searchQuery}
              onChange={setSearchQuery}
              onKeyDown={handleSearchKeyDown}
            />
            <MenuList
              ref={menuRef}
              autoFocusItem={false}
              sx={{ overflow: 'auto', flexGrow: 1, pt: 0 }}
              onKeyDownCapture={(e) => {
                // Capture Enter before MUI can handle it
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();

                  if (selectedValues.length === 0) {
                    // Nothing selected - select the focused item, then close
                    const focusedElement = document.activeElement;
                    const focusedValue = focusedElement?.getAttribute('data-value');
                    if (focusedValue) {
                      const newOperator = getAutoOperator(condition.operator, 1);
                      onUpdate({ ...condition, value: focusedValue, operator: newOperator });
                    }
                  }
                  // Close and move on (with or without selection)
                  handleClose();
                  openAddMenuIfNoPopperOpen();
                }
              }}
            >
              {supportsContains && searchQuery.trim() && (
                <>
                  <MenuItem
                    data-value={`contains:${searchQuery.trim()}`}
                    onClick={handleContainsSelect}
                    sx={{ display: 'flex', alignItems: 'center', color: 'primary.main' }}
                  >
                    <SearchIcon sx={{ fontSize: 18, mr: 1, opacity: 0.7 }} />
                    Contains &ldquo;{searchQuery.trim()}&rdquo;
                  </MenuItem>
                  {filteredOptions.length > 0 && <Divider sx={{ my: 0.5 }} />}
                </>
              )}
              {filteredOptions.length === 0 && !(supportsContains && searchQuery.trim()) ? (
                <MenuItem disabled>No matches</MenuItem>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected = selectedValues.includes(option.value);
                  const showGroupHeader = option.group &&
                    (index === 0 || filteredOptions[index - 1].group !== option.group);
                  return (
                    <React.Fragment key={option.value}>
                      {showGroupHeader && (
                        <StyledGroupHeader>
                          {option.group}
                        </StyledGroupHeader>
                      )}
                      <MenuItem
                        data-value={option.value}
                        selected={isSelected}
                        onClick={() => handleToggle(option.value)}
                        sx={{ display: 'flex', alignItems: 'center' }}
                      >
                        <StyledCheckbox
                          checked={isSelected}
                          tabIndex={-1}
                          disableRipple
                        />
                        {option.label}
                      </MenuItem>
                    </React.Fragment>
                  );
                })
              )}
            </MenuList>
          </DropdownMenu>
        </ClickAwayListener>
      </Popper>
    </>
  );
};
