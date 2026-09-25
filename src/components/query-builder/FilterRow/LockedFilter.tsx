// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

import { FIELD_ICONS } from '../field-icons';
import { FIELD_CONFIGS } from '../operators';
import { isInOperator, type FilterCondition } from '../types';
import { useQueryBuilderContext } from '../QueryBuilderContext';

import {
  FilterChip,
  LockedFieldSection,
  LockedIndicator,
  LockedOperatorSection,
  LockedValueSection,
} from './styles';

interface LockedFilterProps {
  condition: FilterCondition;
}

/**
 * Renders a non-interactive locked filter chip
 * Used for filters that should always be visible but cannot be modified
 */
export const LockedFilter = ({ condition }: LockedFilterProps) => {
  const { spaces, targets } = useQueryBuilderContext();
  const config = FIELD_CONFIGS[condition.field];

  const currentOperator = config.operators.find(op => op.value === condition.operator);
  const operatorLabel = currentOperator?.label || condition.operator;

  // Helper to get label for a single value
  const getLabelForValue = (value: string): string => {
    if (condition.field === 'space') {
      const space = spaces.find(s => s.id === value);
      return space?.name || value;
    }

    if (condition.field === 'target') {
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

  // Get display value for select fields (supports multi-value for IN operators)
  const getDisplayValue = (): string => {
    if (!condition.value) return '';

    // Handle multi-value display for IN operators
    if (isInOperator(condition.operator)) {
      const values = condition.value.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 0) return '';
      if (values.length === 1) return getLabelForValue(values[0]);
      if (values.length === 2) {
        return `${getLabelForValue(values[0])}, ${getLabelForValue(values[1])}`;
      }
      return `${getLabelForValue(values[0])} (+${values.length - 1} more)`;
    }

    return getLabelForValue(condition.value);
  };

  const displayValue = getDisplayValue();

  return (
    <FilterChip $locked>
      <LockedFieldSection>
        {FIELD_ICONS[condition.field]}
        {config.label}
      </LockedFieldSection>
      <LockedOperatorSection>{operatorLabel}</LockedOperatorSection>
      <LockedValueSection>{displayValue}</LockedValueSection>
      <LockedIndicator>
        <LockOutlinedIcon />
      </LockedIndicator>
    </FilterChip>
  );
};
