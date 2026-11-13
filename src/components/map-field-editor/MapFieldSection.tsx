// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Edits one map field of an entity (Labels, Annotations, Facts, Delete or Destroy Gates) as rows
// of text fields in a react-hook-form field array, so every entry stays readable and editable in
// place. The form converts the rows to and from the entity's map with `map-rows.ts`.

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
} from 'react-hook-form';

import { SectionCard } from '@/components/styled';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import {
  KEY_FIELD_SX,
  type MapFieldValidation,
  VALUE_FIELD_SX,
  checkKey,
  checkValue,
} from './map-field-rules';
import type { MapRow } from './map-rows';

export type { MapFieldValidation } from './map-field-rules';


export interface MapFieldSectionProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  /** The field-array path whose rows are `MapRow`s. */
  name: ArrayPath<TFieldValues>;
  title: string;
  description?: ReactNode;
  /** Names one entry, as in "Add label" and "Remove label 2". */
  itemLabel: string;
  /** For gates: each entry is a key alone. */
  keysOnly?: boolean;
  /** Lets a value span lines, as an annotation's may. Otherwise Enter does not add a line. */
  multilineValues?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /**
   * Suggested keys. The input stays free-form: a suggestion is a shortcut to a key used
   * elsewhere, never the only allowed value.
   */
  keyOptions?: string[];
  validation?: MapFieldValidation;
  disabled?: boolean;
  /** Prefixes the section's test ids, as `<testId>-section`, `<testId>-key-0` and `<testId>-add`. */
  testId?: string;
}

export function MapFieldSection<TFieldValues extends FieldValues>({
  control,
  name,
  title,
  description,
  itemLabel,
  keysOnly = false,
  multilineValues = false,
  keyPlaceholder,
  valuePlaceholder,
  keyOptions,
  validation,
  disabled = false,
  testId,
}: MapFieldSectionProps<TFieldValues>) {
  const { fields, append, remove } = useFieldArray({ control, name });

  // A row with a value needs a key, and a key appears once. A row left blank is ignored.
  const validateKey = (key: string, formValues: TFieldValues, index: number) => {
    const trimmed = (key ?? '').trim();
    const rows: MapRow[] = get(formValues, name) ?? [];
    if (!trimmed) {
      return keysOnly || !rows[index]?.value ? true : 'Key is required';
    }
    const firstIndex = rows.findIndex((row) => (row.key ?? '').trim() === trimmed);
    if (firstIndex !== index) return 'Duplicate key';
    return checkKey(trimmed, validation);
  };

  // The value of a blank row is not checked: the row is dropped.
  const validateValue = (value: string, formValues: TFieldValues, index: number) => {
    const rows: MapRow[] = get(formValues, name) ?? [];
    if (!(rows[index]?.key ?? '').trim()) return true;
    return checkValue(value ?? '', validation);
  };

  return (
    <SectionCard
      title={title}
      badge={fields.length}
      collapsible
      testId={testId ? `${testId}-section` : undefined}
    >
      {description && (
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          {description}
        </Typography>
      )}
      {fields.map((row, index) => (
        <Box
          key={row.id}
          sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, rowGap: 1, alignItems: 'flex-start', mb: 1.5 }}
        >
          <Controller
            name={`${name}.${index}.key` as Path<TFieldValues>}
            control={control}
            rules={{ validate: (key, formValues) => validateKey(key, formValues, index) }}
            render={({ field, fieldState }) => {
              const inputProps = {
                inputRef: field.ref,
                onBlur: field.onBlur,
                label: 'Key',
                size: 'small' as const,
                placeholder: keyPlaceholder,
                error: !!fieldState.error,
                helperText: fieldState.error?.message,
                slotProps: {
                  htmlInput: { 'data-testid': testId ? `${testId}-key-${index}` : undefined },
                },
              };
              return keyOptions ? (
                <Autocomplete
                  freeSolo
                  disablePortal
                  disabled={disabled}
                  options={keyOptions}
                  // Only the text matters: a picked suggestion and a typed key are the same value.
                  inputValue={String(field.value ?? '')}
                  onInputChange={(_e, next) => field.onChange(next)}
                  sx={keysOnly ? { flex: 1 } : KEY_FIELD_SX}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      {...inputProps}
                      slotProps={{
                        htmlInput: { ...params.inputProps, ...inputProps.slotProps.htmlInput },
                      }}
                    />
                  )}
                />
              ) : (
                <TextField
                  {...inputProps}
                  name={field.name}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  disabled={disabled}
                  sx={keysOnly ? { flex: 1 } : KEY_FIELD_SX}
                />
              );
            }}
          />
          {!keysOnly && (
            <Controller
              name={`${name}.${index}.value` as Path<TFieldValues>}
              control={control}
              rules={{ validate: (value, formValues) => validateValue(value, formValues, index) }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  label='Value'
                  size='small'
                  multiline
                  maxRows={10}
                  placeholder={valuePlaceholder}
                  disabled={disabled}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !multilineValues) e.preventDefault();
                  }}
                  slotProps={{
                    htmlInput: { 'data-testid': testId ? `${testId}-value-${index}` : undefined },
                  }}
                  sx={VALUE_FIELD_SX}
                />
              )}
            />
          )}
          <Tooltip title={`Remove ${itemLabel}`}>
            <span>
              <IconButton
                aria-label={`Remove ${itemLabel} ${index + 1}`}
                onClick={() => remove(index)}
                disabled={disabled}
                size='small'
                sx={{ mt: 0.5 }}
              >
                <DeleteOutlineIcon fontSize='small' />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ))}
      <Button
        size='small'
        startIcon={<AddIcon />}
        disabled={disabled}
        onClick={() => append({ key: '', value: keysOnly ? 'true' : '' } as FieldArray<TFieldValues, ArrayPath<TFieldValues>>)}
        data-testid={testId ? `${testId}-add` : undefined}
        sx={{ textTransform: 'none' }}
      >
        Add {itemLabel}
      </Button>
    </SectionCard>
  );
}
