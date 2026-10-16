// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

export interface EntityRefOption {
  id: string;
  label: string;
}

export interface EntityRefSelectProps {
  label: string;
  /** The referenced entity's ID; empty for none */
  value: string;
  onChange: (id: string) => void;
  options: EntityRefOption[];
  /** The current reference's name, for when the options do not include it */
  currentLabel?: string;
  helperText?: string;
  loading?: boolean;
  disabled?: boolean;
  testId?: string;
}

/**
 * A picker for an optional reference to another entity, such as a Space's TriggerFilterID. Clearing
 * it removes the reference.
 */
export const EntityRefSelect = ({
  label,
  value,
  onChange,
  options,
  currentLabel,
  helperText,
  loading = false,
  disabled = false,
  testId,
}: EntityRefSelectProps) => {
  const allOptions = useMemo(() => {
    if (!value || options.some((o) => o.id === value)) return options;
    return [{ id: value, label: currentLabel || value }, ...options];
  }, [options, value, currentLabel]);

  const selected = allOptions.find((o) => o.id === value) ?? null;

  return (
    <Autocomplete
      size='small'
      options={allOptions}
      value={selected}
      loading={loading}
      disabled={disabled}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      onChange={(_, option) => onChange(option?.id ?? '')}
      data-testid={testId}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder='None'
          helperText={helperText}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}
    />
  );
};
