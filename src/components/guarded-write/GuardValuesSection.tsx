// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import type { GuardValues } from './guardValues';

/**
 * Asks whether to guard the values a write writes, and with what: a key and a value, the reason
 * they hold what they hold, and whether the guard is inherited. Sits beside Keep on merge, which
 * claims the values; this says why.
 */
export const GuardValuesSection = ({
  values,
  onChange,
  disabled = false,
  keyMissing = false,
}: {
  values: GuardValues;
  onChange: (values: GuardValues) => void;
  disabled?: boolean;
  /** Marks the key as missing, once something was attempted without one. */
  keyMissing?: boolean;
}) => (
  <Stack spacing={1} data-testid='guard-values-written'>
    <FormControlLabel
      control={
        <Checkbox
          checked={values.enabled}
          disabled={disabled}
          onChange={(e) => onChange({ ...values, enabled: e.target.checked })}
        />
      }
      label='Guard the values written'
    />
    {values.enabled && (
      <Stack spacing={1} sx={{ pl: 4 }}>
        <Stack direction='row' spacing={1}>
          <TextField
            size='small'
            label='Guard key'
            placeholder='RunAsRoot'
            value={values.key}
            disabled={disabled}
            required
            error={keyMissing && values.key.trim() === ''}
            helperText={keyMissing && values.key.trim() === '' ? 'Required' : undefined}
            onChange={(e) => onChange({ ...values, key: e.target.value })}
            sx={{ flex: 1 }}
          />
          <TextField
            size='small'
            label='Guard value'
            placeholder='LegacyImage'
            value={values.value}
            disabled={disabled}
            onChange={(e) => onChange({ ...values, value: e.target.value })}
            sx={{ flex: 1 }}
          />
        </Stack>
        <FormControlLabel
          control={
            <Checkbox
              checked={values.inherited}
              disabled={disabled}
              onChange={(e) => onChange({ ...values, inherited: e.target.checked })}
            />
          }
          label='Inherited by clones and downstream Units'
        />
      </Stack>
    )}
  </Stack>
);
