// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import type { FilterCondition } from '@/components/query-builder';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';

interface CheckResultGridToolbarProps {
  filterConditions: FilterCondition[];
  onRemoveFilter: (id: string) => void;
  onClearFilters: () => void;
  filterElement: ReactNode;
}

/** Converts a raw FilterCondition into a human-readable chip label.
 *  e.g. { field: 'space', operator: 'contains', value: 'acme' } → "Space contains acme" */
function formatConditionLabel(condition: FilterCondition): string {
  const fieldLabel = condition.labelKey
    ? `Labels.${condition.labelKey}`
    : condition.field.replace(/([A-Z])/g, ' $1').trim();
  // Capitalise first letter
  const displayField = fieldLabel.charAt(0).toUpperCase() + fieldLabel.slice(1);
  return `${displayField} ${condition.operator} ${condition.value}`;
}

export const CheckResultGridToolbar = ({
  filterConditions,
  onRemoveFilter,
  onClearFilters,
  filterElement,
}: CheckResultGridToolbarProps) => {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        flexWrap: 'wrap',
        alignItems: 'center',
        px: 1.5,
        py: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {filterConditions.map((condition) => (
        <Chip
          key={condition.id}
          size='small'
          label={formatConditionLabel(condition)}
          onDelete={() => onRemoveFilter(condition.id)}
          variant='outlined'
        />
      ))}
      {filterElement}
      <Box sx={{ flex: 1 }} />
      {filterConditions.length > 0 && (
        <Button
          size='small'
          variant='text'
          startIcon={<FilterAltOffIcon />}
          onClick={onClearFilters}
        >
          Reset
        </Button>
      )}
    </Box>
  );
};
