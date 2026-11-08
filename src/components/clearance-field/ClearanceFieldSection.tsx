// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Edits a stored clearance -- the guards something that writes is cleared to write over -- as
// rows of key, operator and values in a react-hook-form field array. The Trigger and Link drawers
// both show it, so a clearance reads and edits the same wherever it is stored.

import type { ReactNode } from 'react';

import {
  type ArrayPath,
  type Control,
  Controller,
  type FieldArray,
  type FieldValues,
  type Path,
  get,
  useFieldArray,
  useWatch,
} from 'react-hook-form';

import Add from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { CLEARANCE_OPERATORS, type ClearanceRow, operatorTakesValues } from './clearanceRows';

export interface ClearanceFieldSectionProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  /** The field-array path whose rows are `ClearanceRow`s. */
  name: ArrayPath<TFieldValues>;
  /** What the clearance lets its holder do, under the heading. */
  description: ReactNode;
  disabled?: boolean;
  /** Prefixes the section's test ids, as `<testId>-add` and `<testId>-key-0`. */
  testId?: string;
}

export function ClearanceFieldSection<TFieldValues extends FieldValues>({
  control,
  name,
  description,
  disabled = false,
  testId,
}: ClearanceFieldSectionProps<TFieldValues>) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const rows: ClearanceRow[] = useWatch({ control, name: name as Path<TFieldValues> }) ?? [];
  const field = (index: number, column: keyof ClearanceRow) =>
    `${name}.${index}.${column}` as Path<TFieldValues>;

  return (
    <Box data-testid={testId}>
      <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
        Clearance
      </Typography>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
        {description}
      </Typography>
      <Stack spacing={1}>
        {fields.map((row, index) => (
          <Stack key={row.id} direction='row' spacing={1} alignItems='flex-start'>
            <Controller
              name={field(index, 'Key')}
              control={control}
              rules={{
                validate: (key, values) => {
                  const r: ClearanceRow | undefined = get(values, name)?.[index];
                  return !!String(key ?? '').trim() || !r?.Values?.trim() || 'Key is required';
                },
              }}
              render={({ field: f, fieldState }) => (
                <TextField
                  {...f}
                  value={f.value ?? ''}
                  label='Guard key'
                  size='small'
                  disabled={disabled}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  slotProps={{ htmlInput: { 'data-testid': testId ? `${testId}-key-${index}` : undefined } }}
                  sx={{ flex: 1 }}
                />
              )}
            />
            <Controller
              name={field(index, 'Operator')}
              control={control}
              render={({ field: f }) => (
                <FormControl size='small' sx={{ minWidth: 150 }} disabled={disabled}>
                  <InputLabel>Operator</InputLabel>
                  <Select
                    {...f}
                    label='Operator'
                    input={<OutlinedInput label='Operator' />}
                    data-testid={testId ? `${testId}-operator-${index}` : undefined}
                  >
                    {CLEARANCE_OPERATORS.map((operator) => (
                      <MenuItem key={operator} value={operator}>
                        {operator}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              name={field(index, 'Values')}
              control={control}
              rules={{
                validate: (value, values) => {
                  const r: ClearanceRow | undefined = get(values, name)?.[index];
                  if (!r?.Key?.trim() || !operatorTakesValues(r.Operator)) return true;
                  return !!String(value ?? '').trim() || `${r.Operator} needs at least one value`;
                },
              }}
              render={({ field: f, fieldState }) => (
                <TextField
                  {...f}
                  value={f.value ?? ''}
                  label='Values'
                  size='small'
                  placeholder='a, b'
                  disabled={disabled || !operatorTakesValues(rows[index]?.Operator)}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message ?? 'For In and NotIn, comma-separated'}
                  slotProps={{ htmlInput: { 'data-testid': testId ? `${testId}-values-${index}` : undefined } }}
                  sx={{ flex: 1 }}
                />
              )}
            />
            <IconButton
              aria-label={`Remove clearance ${index + 1}`}
              onClick={() => remove(index)}
              disabled={disabled}
            >
              <DeleteOutline fontSize='small' />
            </IconButton>
          </Stack>
        ))}
        <Box>
          <Button
            size='small'
            startIcon={<Add />}
            disabled={disabled}
            onClick={() =>
              append({ Key: '', Operator: 'Exists', Values: '' } as FieldArray<
                TFieldValues,
                ArrayPath<TFieldValues>
              >)
            }
            data-testid={testId ? `${testId}-add` : undefined}
          >
            Add clearance
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
