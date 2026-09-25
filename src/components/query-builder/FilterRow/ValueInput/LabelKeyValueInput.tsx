// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useQueryBuilderContext } from '../../QueryBuilderContext';
import type { FilterCondition } from '../../types';

interface LabelKeyValueInputProps {
  condition: FilterCondition;
  onUpdate: (condition: FilterCondition) => void;
  onRemove: () => void;
  disabled?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Trigger to programmatically focus the input */
  focusTrigger?: number;
}

/** Pill badge styles for count indicators in dropdown options */
const countBadgeStyles = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 16,
  minWidth: 16,
  padding: '0 6px',
  borderRadius: 8,
  backgroundColor: 'rgba(0, 0, 0, 0.08)',
  color: 'text.secondary',
  fontSize: '0.7rem',
  lineHeight: 1,
  flexShrink: 0,
} as const;

/** Shared styles for the inline Autocomplete components */
const autocompleteStyles = {
  // ~12 characters at 0.875rem ≈ 100px + padding
  minWidth: 120,
  '& .MuiInputBase-root': {
    height: 28,
    fontSize: '0.875rem',
    padding: '0 8px !important',
    backgroundColor: 'transparent',
    '& fieldset': {
      border: 'none',
    },
    '&:hover': {
      backgroundColor: 'rgba(25, 118, 210, 0.08)',
    },
  },
  '& .MuiInputBase-input': {
    padding: '4px 0 !important',
    '&::placeholder': {
      opacity: 0.5,
    },
  },
  '& .MuiAutocomplete-endAdornment': {
    right: '4px !important',
  },
};

/**
 * Label key/value pair input for filtering by labels
 * Uses Autocomplete with freeSolo to allow custom key/value entry
 */
export const LabelKeyValueInput = ({
  condition,
  onUpdate,
  onRemove,
  disabled = false,
  autoFocus = false,
  focusTrigger = 0,
}: LabelKeyValueInputProps) => {
  const { labelOptions, openAddMenu } = useQueryBuilderContext();
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);

  // Auto-focus on mount if autoFocus is true
  useEffect(() => {
    if (autoFocus && keyInputRef.current) {
      keyInputRef.current.focus();
      setKeyOpen(true);
    }
  }, [autoFocus]);

  // Focus/open dropdown when focusTrigger changes (operator changed)
  useEffect(() => {
    if (focusTrigger > 0 && keyInputRef.current) {
      keyInputRef.current.focus();
      setKeyOpen(true);
    }
  }, [focusTrigger]);

  // Get available values for the selected key
  const availableValues = condition.labelKey
    ? labelOptions.valuesByKey[condition.labelKey] || []
    : [];

  // Only show value input for operators that need a value
  const showValueInput = condition.operator !== 'exists' && condition.operator !== 'notExists';

  const handleKeyChange = (newKey: string | null) => {
    const key = newKey || '';
    onUpdate({ ...condition, labelKey: key, value: '' });

    // For exists/notExists operators, no value is needed - open add menu immediately
    if (condition.operator === 'exists' || condition.operator === 'notExists') {
      if (key) {
        openAddMenu?.();
      }
    } else if (key) {
      // For other operators, auto-focus the value input after key selection
      setTimeout(() => {
        if (valueInputRef.current) {
          valueInputRef.current.focus();
          setValueOpen(true);
        }
      }, 0);
    }
  };

  const handleValueChange = (newValue: string | null) => {
    const value = newValue || '';
    onUpdate({ ...condition, value });

    // Open the add filter menu after value selection so user can quickly add another filter
    if (value) {
      openAddMenu?.();
    }
  };

  // Handle keyboard events for removing filter
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Backspace' && !disabled) {
      const target = event.target as HTMLInputElement;
      // Only remove if input is empty
      if (target.value === '') {
        event.preventDefault();
        onRemove();
      }
    } else if (event.key === 'Escape' && !disabled) {
      // Remove incomplete filter on escape
      if (!condition.labelKey || (showValueInput && !condition.value)) {
        event.preventDefault();
        onRemove();
      }
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      {/* Label Key Autocomplete */}
      <Autocomplete
        freeSolo
        size="small"
        open={keyOpen}
        onOpen={() => setKeyOpen(true)}
        onClose={() => setKeyOpen(false)}
        options={labelOptions.keys}
        value={condition.labelKey || ''}
        onChange={(_, newValue) => handleKeyChange(newValue)}
        onInputChange={(_, _newValue, reason) => {
          // Only update on blur or enter (not while typing for freeSolo)
          if (reason === 'clear') {
            handleKeyChange('');
          }
        }}
        onBlur={(event) => {
          const inputValue = (event.target as HTMLInputElement).value;
          if (inputValue && inputValue !== condition.labelKey) {
            handleKeyChange(inputValue);
          }
        }}
        disabled={disabled}
        disableClearable
        autoHighlight
        openOnFocus
        renderOption={(props, option) => (
          <li {...props} key={option}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
              <span>{option}</span>
              {labelOptions.countByKey[option] != null && (
                <Typography component="span" sx={countBadgeStyles}>
                  {labelOptions.countByKey[option]}
                </Typography>
              )}
            </Box>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            inputRef={keyInputRef}
            placeholder="Key..."
            variant="outlined"
            onKeyDown={handleKeyDown}
            sx={{
              ...autocompleteStyles,
              borderRight: showValueInput ? '1px solid' : 'none',
              borderColor: 'divider',
            }}
          />
        )}
        slotProps={{
          popper: {
            style: { zIndex: 1300, width: 'auto' },
          },
          paper: {
            sx: { minWidth: 'fit-content' },
          },
        }}
        sx={{ flex: '0 0 auto' }}
      />

      {/* Label Value Autocomplete - only shown for equals/notEquals/contains operators */}
      {showValueInput && (
        <Autocomplete
          freeSolo
          size="small"
          open={valueOpen}
          onOpen={() => setValueOpen(true)}
          onClose={() => setValueOpen(false)}
          options={availableValues}
          value={condition.value || ''}
          onChange={(_, newValue) => handleValueChange(newValue)}
          onInputChange={(_, _newValue, reason) => {
            if (reason === 'clear') {
              handleValueChange('');
            }
          }}
          onBlur={(event) => {
            const inputValue = (event.target as HTMLInputElement).value;
            if (inputValue && inputValue !== condition.value) {
              handleValueChange(inputValue);
            }
          }}
          disabled={disabled || !condition.labelKey}
          disableClearable
          autoHighlight
          openOnFocus
          renderOption={(props, option) => {
            const count = condition.labelKey
              ? labelOptions.countByKeyValue[condition.labelKey]?.[option]
              : undefined;
            return (
              <li {...props} key={option}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                  <span>{option}</span>
                  {count != null && (
                    <Typography component="span" sx={countBadgeStyles}>
                      {count}
                    </Typography>
                  )}
                </Box>
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={valueInputRef}
              placeholder="Value..."
              variant="outlined"
              onKeyDown={handleKeyDown}
              sx={autocompleteStyles}
            />
          )}
          slotProps={{
            popper: {
              style: { zIndex: 1300, width: 'auto' },
            },
            paper: {
              sx: { minWidth: 'fit-content' },
            },
          }}
          sx={{ flex: '0 0 auto' }}
        />
      )}
    </Box>
  );
};
