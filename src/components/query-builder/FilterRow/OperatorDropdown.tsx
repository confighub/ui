// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popper from '@mui/material/Popper';

import type { FieldConfig, FilterOperator } from '../types';
import { DropdownMenu } from '../shared-styles';

import { OperatorSection } from './styles';

interface OperatorDropdownProps {
  config: FieldConfig;
  currentOperator: FilterOperator;
  onChange: (operator: FilterOperator) => void;
  disabled?: boolean;
  /** When provided, shows polarity-only options (positive/negative) with dynamic labels */
  multiSelectCount?: number;
}

/**
 * Dropdown for selecting filter operator
 * Renders as static text if only one operator is available
 */
export const OperatorDropdown = ({
  config,
  currentOperator,
  onChange,
  disabled = false,
  multiSelectCount,
}: OperatorDropdownProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // Build polarity options for multi-select fields
  const isPolarity = multiSelectCount !== undefined;
  const isMulti = isPolarity && multiSelectCount > 1;
  const polarityOperatorValues = new Set(['in', 'notIn', 'equals', 'notEquals']);
  const polarityOptions: { value: FilterOperator; label: string }[] = isPolarity
    ? [
        {
          value: isMulti ? 'in' : 'equals',
          label: isMulti ? 'is one of' : 'is',
        },
        {
          value: isMulti ? 'notIn' : 'notEquals',
          label: isMulti ? 'is not one of' : 'is not',
        },
        // Include any extra operators beyond the standard polarity set (e.g. contains, startsWith)
        ...config.operators.filter((op) => !polarityOperatorValues.has(op.value)),
      ]
    : [];

  const displayOperators = isPolarity ? polarityOptions : config.operators;

  // Determine current label
  const isNegative = currentOperator === 'notEquals' || currentOperator === 'notIn';
  const isPolarityOperator = polarityOperatorValues.has(currentOperator);
  const operatorLabel = isPolarity && isPolarityOperator
    ? (isNegative ? polarityOptions[1].label : polarityOptions[0].label)
    : (config.operators.find(op => op.value === currentOperator)?.label || currentOperator);

  // Determine which option is selected in polarity mode
  const isSelected = (opValue: FilterOperator) => {
    if (isPolarity && isPolarityOperator && polarityOperatorValues.has(opValue)) {
      const opIsNegative = opValue === 'notEquals' || opValue === 'notIn';
      return opIsNegative === isNegative;
    }
    return currentOperator === opValue;
  };

  const handleClose = () => setAnchorEl(null);

  const handleSelect = (operator: FilterOperator) => {
    onChange(operator);
    handleClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
    }
  };

  // Single operator - render as static text
  if (displayOperators.length <= 1) {
    return (
      <OperatorSection as="span" style={{ cursor: 'default' }}>
        {operatorLabel}
      </OperatorSection>
    );
  }

  return (
    <>
      <OperatorSection
        onClick={(e) => setAnchorEl(e.currentTarget)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={Boolean(anchorEl)}
      >
        {operatorLabel}
        <KeyboardArrowDownIcon />
      </OperatorSection>
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
      >
        <ClickAwayListener onClickAway={handleClose}>
          <DropdownMenu onKeyDown={handleKeyDown}>
            <MenuList autoFocusItem={Boolean(anchorEl)}>
              {displayOperators.map((op) => (
                <MenuItem
                  key={op.value}
                  selected={isSelected(op.value)}
                  onClick={() => handleSelect(op.value)}
                >
                  {op.label}
                </MenuItem>
              ))}
            </MenuList>
          </DropdownMenu>
        </ClickAwayListener>
      </Popper>
    </>
  );
};
