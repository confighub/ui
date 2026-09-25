// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import ListItemIcon from '@mui/material/ListItemIcon';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popper from '@mui/material/Popper';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';

import { FIELD_ICONS } from './field-icons';
import { FIELD_CONFIGS, FIELD_DESCRIPTIONS, getAvailableFieldsForEntity } from './operators';
import { DropdownMenu, MenuSection } from './shared-styles';
import type { AddFilterButtonProps, FilterFieldType } from './types';

// Filter button - shown when no filters exist
const FilterButton = styled('button')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  height: 32,
  padding: theme.spacing(0.5, 1.5),
  fontSize: '0.75rem',
  fontWeight: 500,
  color: theme.palette.text.secondary,
  backgroundColor: 'transparent',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  cursor: 'pointer',
  fontFamily: theme.typography.fontFamily,
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.grey[200],
    borderColor: theme.palette.grey[400],
  },
  '&:disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  '& svg': {
    fontSize: 18,
  },
}));

// Imperative handle for AddFilterButton
export interface AddFilterButtonHandle {
  openMenu: () => void;
  closeMenu: () => void;
}

export const AddFilterButton = forwardRef<AddFilterButtonHandle, AddFilterButtonProps>(({
  onAddFilter,
  existingFields,
  entityType = 'Unit',
  disabled = false,
  hasFilters = false,
}, ref) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const menuListRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Expose openMenu and closeMenu methods via ref for parent components
  useImperativeHandle(ref, () => ({
    openMenu: () => {
      if (!disabled) {
        buttonRef.current?.focus();
        setAnchorEl(buttonRef.current);
      }
    },
    closeMenu: () => {
      setAnchorEl(null);
    },
  }), [disabled]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (open) {
      handleClose();
    } else {
      setAnchorEl(event.currentTarget);
    }
  };

  const handleClose = useCallback(() => {
    setAnchorEl(null);
    // Return focus to button after closing
    buttonRef.current?.focus();
  }, []);

  // Handle keyboard events on the button
  const handleButtonKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setAnchorEl(event.currentTarget as HTMLButtonElement);
    }
  };

  // Handle keyboard events on the menu (Escape to close, Enter/Space to select)
  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target as HTMLElement;
      const menuItem = target.closest('[data-field]');
      if (menuItem) {
        const field = menuItem.getAttribute('data-field');
        if (field && field in FIELD_CONFIGS) {
          event.preventDefault();
          onAddFilter(field as FilterFieldType);
          handleClose();
        }
      }
    }
  };

  // Focus first menu item when menu opens
  useEffect(() => {
    if (open) {
      // Use requestAnimationFrame to ensure DOM is ready after Popper renders
      requestAnimationFrame(() => {
        const firstItem = menuListRef.current?.querySelector('[role="menuitem"]') as HTMLElement;
        firstItem?.focus();
      });
    }
  }, [open]);

  // Native event delegation for menu item clicks and click-outside closing.
  // React synthetic events don't fire reliably on elements rendered inside
  // MUI DataGrid toolbar slots, so we use native DOM events instead.
  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Find the menu dynamically via data attribute rather than ref, because
      // the Popper renders via Portal at document.body and the ref may not
      // be available when this closure is created.
      const menuEl = document.querySelector('[data-filter-menu]');
      const buttonEl = buttonRef.current;

      // Check if click is on a menu item (identified by data-field attribute)
      const menuItem = target.closest('[data-field]');
      if (menuItem && menuEl?.contains(menuItem)) {
        const field = menuItem.getAttribute('data-field');
        if (field && field in FIELD_CONFIGS) {
          e.preventDefault();
          setAnchorEl(null);
          buttonRef.current?.focus();
          onAddFilter(field as FilterFieldType);
        }
        return;
      }

      // Ignore clicks inside the menu that aren't on items (e.g. section headers)
      if (menuEl?.contains(target)) {
        return;
      }

      // Let the toggle button's own handler manage open/close
      if (buttonEl?.contains(target)) {
        return;
      }

      // Click outside - close the menu
      setAnchorEl(null);
      buttonRef.current?.focus();
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, [open, onAddFilter]);

  // Global keyboard shortcut: "/" to open filter menu
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' ||
                       target.tagName === 'TEXTAREA' ||
                       target.isContentEditable;

      if (event.key === '/' && !isTyping && !disabled && !open) {
        event.preventDefault();
        setAnchorEl(buttonRef.current);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [disabled, open]);

  // Get available fields for this entity type
  const availableFields = getAvailableFieldsForEntity(entityType);

  // Separate fields into categories
  const standardFields = availableFields.filter(
    (field) => !['where', 'whereData'].includes(field)
  );
  const advancedFields = availableFields.filter(
    (field) => ['where', 'whereData'].includes(field)
  );

  const renderFieldMenuItems = (fields: FilterFieldType[]) =>
    fields.map((field) => {
      const config = FIELD_CONFIGS[field];
      const description = FIELD_DESCRIPTIONS[field] || config.label;
      return (
        <Tooltip
          key={field}
          title={description}
          placement="right"
          enterDelay={500}
          enterNextDelay={500}
        >
          <MenuItem
            aria-label={description}
            data-field={field}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              {FIELD_ICONS[field]}
            </ListItemIcon>
            {config.label}
          </MenuItem>
        </Tooltip>
      );
    });

  // Filter out fields that can only be added once
  // Note: 'labels' can be added multiple times (for different label keys)
  const MULTI_INSTANCE_FIELDS: FilterFieldType[] = ['labels'];
  const availableStandardFields = standardFields.filter((field) => {
    if (MULTI_INSTANCE_FIELDS.includes(field)) {
      return true; // Always allow adding another label filter
    }
    return !existingFields.includes(field);
  });

  return (
    <>
      <FilterButton
        ref={buttonRef}
        onClick={handleClick}
        onKeyDown={handleButtonKeyDown}
        disabled={disabled}
        aria-label={hasFilters ? 'Add filter' : 'Filter'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {hasFilters ? <AddIcon /> : <FilterListIcon />}
        {hasFilters ? 'Add Filter' : 'Filter'}
      </FilterButton>
      <Popper
        open={open}
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
      >
        <DropdownMenu data-filter-menu onKeyDown={handleMenuKeyDown}>
          <MenuList ref={menuListRef} autoFocusItem={open} sx={{ pt: 0 }}>
            {/* Attribute filters section */}
            {availableStandardFields.length > 0 && (
              <>
                <MenuSection variant="caption">Attributes</MenuSection>
                {renderFieldMenuItems(availableStandardFields)}
              </>
            )}
            {advancedFields.length > 0 && (
              <>
                <MenuSection variant="caption">Advanced</MenuSection>
                {renderFieldMenuItems(advancedFields)}
              </>
            )}
          </MenuList>
        </DropdownMenu>
      </Popper>
    </>
  );
});

AddFilterButton.displayName = 'AddFilterButton';
