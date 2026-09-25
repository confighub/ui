// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// One row editor for a react-hook-form field array of `{ key, value }` pairs.
// Labels, annotations and any other flat map the create wizard collects are
// entered the same way, so they share this component instead of each growing
// their own copy of the row markup.

import type { ReactNode } from 'react';

import { type ArrayPath, type Control, Controller, type FieldValues, type Path } from 'react-hook-form';

import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';

/** Keeps the key column at the width a bare `size='small'` TextField takes. */
const KEY_FIELD_WIDTH = 200;

// Both columns are sized here rather than on each branch, so a row reads the
// same whether or not its key field offers suggestions, and so a row that runs
// out of width shrinks and then wraps instead of squeezing both inputs down to
// a few characters.
const KEY_FIELD_SX = { flex: `0 1 ${KEY_FIELD_WIDTH}px`, minWidth: 140 } as const;
const VALUE_FIELD_SX = { flex: '1 1 240px', minWidth: 180 } as const;

export interface KeyValueRowsProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  /** The field-array path whose rows hold a `key` and a `value`. */
  name: ArrayPath<TFieldValues>;
  /** The field array's rows, straight from `useFieldArray`. */
  fields: Array<{ id: string }>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  /**
   * Suggested keys. The input stays free-form: a suggestion is a shortcut to a
   * key the rest of ConfigHub already reads, never the only allowed value.
   */
  keyOptions?: string[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /**
   * Drawn at the head of every row, for a control the row needs beyond its key
   * and value — such as a choice of what the pair becomes.
   */
  rowPrefix?: (index: number) => ReactNode;
  /** Text of the add button, and the stem of each row's remove label. */
  addLabel: string;
  /** Names one row for a screen reader, as "Remove <itemLabel> 2". */
  itemLabel: string;
}

export function KeyValueRows<TFieldValues extends FieldValues>({
  control,
  name,
  fields,
  onAdd,
  onRemove,
  keyOptions,
  keyPlaceholder,
  valuePlaceholder,
  rowPrefix,
  addLabel,
  itemLabel,
}: KeyValueRowsProps<TFieldValues>) {
  return (
    <>
      {fields.map((f, index) => (
        <Box key={f.id} sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, rowGap: 1, alignItems: 'center', mb: 1 }}>
          {rowPrefix?.(index)}
          <Controller
            name={`${name}.${index}.key` as Path<TFieldValues>}
            control={control}
            render={({ field }) =>
              keyOptions ? (
                <Autocomplete
                  freeSolo
                  disablePortal
                  options={keyOptions}
                  // Only the text matters: a picked suggestion and a typed key
                  // are the same value, so the input drives the form field.
                  inputValue={String(field.value ?? '')}
                  onInputChange={(_e, next) => field.onChange(next)}
                  sx={KEY_FIELD_SX}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      inputRef={field.ref}
                      onBlur={field.onBlur}
                      label='Key'
                      size='small'
                      placeholder={keyPlaceholder}
                    />
                  )}
                />
              ) : (
                <TextField {...field} label='Key' size='small' placeholder={keyPlaceholder} sx={KEY_FIELD_SX} />
              )
            }
          />
          <Controller
            name={`${name}.${index}.value` as Path<TFieldValues>}
            control={control}
            render={({ field }) => (
              <TextField {...field} label='Value' size='small' placeholder={valuePlaceholder} sx={VALUE_FIELD_SX} />
            )}
          />
          <Tooltip title={`Remove ${itemLabel}`}>
            <IconButton aria-label={`Remove ${itemLabel} ${index + 1}`} onClick={() => onRemove(index)} size='small'>
              <DeleteOutlineIcon fontSize='small' />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
      <Button size='small' startIcon={<AddIcon />} onClick={onAdd} sx={{ textTransform: 'none' }}>
        {addLabel}
      </Button>
    </>
  );
}
