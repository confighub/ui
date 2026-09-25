// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import type {
  FunctionSignature,
  ListFunctionsApiResponse,
} from '@confighub/rtk-query';
import Autocomplete, { type AutocompleteProps } from '@mui/material/Autocomplete';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

/** A function option enriched with its toolchain category for grouping. */
export interface SimpleFunctionOption extends FunctionSignature {
  category: string;
}

export interface SimpleFunctionPickerProps
  extends Omit<
    AutocompleteProps<SimpleFunctionOption, false, false, false>,
    'renderInput' | 'options' | 'groupBy' | 'getOptionLabel' | 'onChange' | 'onSelect'
  > {
  /** Label shown on the text input. */
  label: string;
  /**
   * Function list returned by useListFunctionsQuery, keyed by toolchain type.
   * Pass an already-filtered slice when you only want to show a single toolchain.
   */
  functions: ListFunctionsApiResponse | undefined;
  /** Called when the user selects a function from the dropdown. */
  onSelect: (func: FunctionSignature) => void;
}

/**
 * SimpleFunctionPicker
 *
 * A lightweight autocomplete that lets the user pick one function from a
 * toolchain-filtered list. Intentionally excludes saved invocations, triggers,
 * delete icons, auto-invoke behaviour, and all related mutations — it only
 * surfaces the function list and delegates the "what to do next" decision to the
 * caller via `onSelect`.
 */
export const SimpleFunctionPicker = ({
  label,
  functions,
  onSelect,
  ...other
}: SimpleFunctionPickerProps) => {
  const [inputValue, setInputValue] = useState('');

  const functionOptions = useMemo<SimpleFunctionOption[]>(() => {
    if (!functions) return [];
    return Object.entries(functions).flatMap(([category, funcs]) =>
      Object.values(funcs).map((func) => ({
        category,
        ...func,
      })),
    );
  }, [functions]);

  const filteredOptions = useMemo(() => {
    if (!inputValue) return functionOptions;
    const lower = inputValue.toLowerCase();
    return functionOptions.filter((opt) =>
      (opt.FunctionName ?? '').toLowerCase().includes(lower),
    );
  }, [functionOptions, inputValue]);

  if (!functions) return null;

  return (
    <Autocomplete
      options={filteredOptions}
      filterOptions={(opts) => opts}
      groupBy={(option) => option.category}
      getOptionLabel={(option) => option.FunctionName ?? ''}
      getOptionKey={(option) => option.FunctionName ?? ''}
      renderOption={(props, option) => (
        <li {...props}>
          <Stack
            direction='row'
            spacing={1}
            justifyContent='space-between'
            alignItems='center'
            width='100%'
          >
            <Typography variant='body2' sx={{ flexGrow: 1 }}>
              {option.FunctionName}
            </Typography>
          </Stack>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          variant='outlined'
          sx={{
            backgroundColor: 'white',
            '& .MuiFormLabel-root': {
              lineHeight: '1.1',
            },
          }}
        />
      )}
      value={null}
      inputValue={inputValue}
      onInputChange={(_event, newInputValue) => {
        setInputValue(newInputValue);
      }}
      onClose={() => setInputValue('')}
      onChange={(_event, value) => {
        setInputValue('');
        if (value) {
          onSelect(value);
        }
      }}
      {...other}
    />
  );
};
