// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';

import { addSpacesToCamelCase } from '../../utility/name-format-functions';

export type PropertyType = 'Labels' | 'Annotations' | 'DeleteGates' | 'DestroyGates';

export type LabelsAccordionProps = {
  isAccordionExpanded?: boolean;
  onLabelDeleted: (label: { key: string; value: string }) => void;
  onLabelAddClicked: () => void;
  labels: Record<string, string | boolean>;
  type?: PropertyType;
  disabled?: boolean;
  variant?: 'standard' | 'outlined' | 'filled';
  edit?: boolean;
  limit?: number;
};

export const LabelsAccordion = ({
  onLabelDeleted,
  onLabelAddClicked,
  labels,
  type = 'Labels',
  disabled = false,
  variant = 'outlined',
  limit,
}: LabelsAccordionProps) => {
  const labelsArray = Object.entries(labels).map(([key, value]) => ({
    key,
    value: String(value),
  }));

  return (
    <FormControl variant={variant} fullWidth disabled={disabled} size='small'>
      <InputLabel id='labels-select'>{addSpacesToCamelCase(type)}</InputLabel>
      <Select
        endAdornment={
          <Button
            disabled={disabled}
            onClick={onLabelAddClicked}
            variant='text'
            sx={{ mr: 2 }}
          >
            Add
          </Button>
        }
        labelId='labels-select'
        size='small'
        id='labels-select-multiple-chip'
        label={addSpacesToCamelCase(type)}
        multiple
        value={labelsArray}
        // The renderValue prop's return value is what's displayed inside the Select input
        renderValue={(selected) => {
          // If no limit is set, or if the number of items is within the limit, show all chips.
          if (!limit || selected.length <= limit) {
            return (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((item) => {
                  const shouldHideValue = type === 'DeleteGates' || type === 'DestroyGates';
                  const label = shouldHideValue ? item.key : `${item.key}=${item.value}`;
                  return (
                    <Chip
                      key={item.key} // Use the key for a more stable React key
                      label={label}
                    />
                  );
                })}
              </Box>
            );
          }

          // If the limit is exceeded, slice the array and show an indicator.
          const visibleItems = selected.slice(0, limit);

          return (
            <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 0.5, alignItems: 'center' }}>
              {visibleItems.map((item, index) => {
                const shouldHideValue = type === 'DeleteGates' || type === 'DestroyGates';
                let label;
                if (shouldHideValue) {
                  label = limit === index + 1 ? `${item.key}...` : item.key;
                } else {
                  label = limit === index + 1 ? `${item.key}-${item.value}...` : `${item.key}-${item.value}`;
                }
                return (
                  <Chip
                    key={item.key}
                    label={label}
                  />
                );
              })}
            </Box>
          );
        }}
      >
        {labelsArray.map(
          (
            { key, value }, // Destructure for cleaner access
          ) => (
            <MenuItem key={key} value={`${key}=${value}`}>
              <Chip
                key={key} // Use the key for a more stable React key
                label={type === 'DeleteGates' || type === 'DestroyGates' ? key : `${key}=${value}`}
                onDelete={() => {
                  onLabelDeleted({ key, value });
                }}
              />
            </MenuItem>
          ),
        )}
      </Select>
    </FormControl>
  );
};
