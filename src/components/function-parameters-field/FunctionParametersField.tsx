// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Control, Controller, FieldErrors } from 'react-hook-form';

import { FunctionParameter } from '@confighub/rtk-query';
import { formatParamNames } from '@/utility/query-functions';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

type FormValues = Record<string, string>;

/**
 * Component for rendering individual parameter input fields
 * Handles different parameter types (string, bool, int) with appropriate UI components
 */
export const FunctionParametersField = ({
  param,
  control,
  errors,
  updateArgumentValue,
}: {
  param: FunctionParameter;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
  updateArgumentValue: (paramName: string, value: string) => void;
}) => {
  const paramName = param.ParameterName || '';
  const formattedName = formatParamNames(paramName);
  const hasError = !!errors[paramName];

  // String parameter input
  const renderStringField = () => (
    <Controller
      name={paramName}
      control={control}
      rules={{ required: param.Required }}
      render={({ field }) => (
        <TextField
          {...field}
          variant='outlined'
          fullWidth
          size='small'
          label={formattedName}
          error={hasError}
          helperText={param.Description}
          onChange={(event) => {
            field.onChange(event);
            updateArgumentValue(param.ParameterName!, event.target.value);
          }}
        />
      )}
    />
  );

  // Boolean parameter input with toggle buttons
  const renderBoolField = () => (
    <Controller
      name={paramName}
      control={control}
      rules={{
        required: param.Required ? `${formattedName} is required` : false,
      }}
      render={({ field }) => (
        <>
          <Typography variant='body1'>{paramName}</Typography>
          <Tooltip title={param.Description} placement='top'>
            <ToggleButtonGroup
              value={field.value}
              exclusive
              size='small'
              onChange={(_, value) => {
                field.onChange(value);
                updateArgumentValue(param.ParameterName!, value);
              }}
              aria-label={formattedName}
              fullWidth
            >
              <ToggleButton value='true' aria-label='true'>
                True
              </ToggleButton>
              <ToggleButton value='false' aria-label='false'>
                False
              </ToggleButton>
            </ToggleButtonGroup>
          </Tooltip>
          {hasError && <FormHelperText error>{errors[paramName]?.message}</FormHelperText>}
        </>
      )}
    />
  );

  // Integer parameter input
  const renderIntField = () => (
    <Controller
      name={paramName}
      control={control}
      rules={{ required: param.Required }}
      render={({ field }) => (
        <TextField
          {...field}
          variant='outlined'
          size='small'
          type='number'
          fullWidth
          label={formattedName}
          error={hasError}
          helperText={param.Description}
          onChange={(event) => {
            field.onChange(event);
            updateArgumentValue(param.ParameterName!, event.target.value);
          }}
        />
      )}
    />
  );

  // Enum input
  const renderSelect = () => (
    <Controller
      name={paramName}
      control={control}
      rules={{ required: param.Required }}
      render={({ field }) => (
        <>
          <FormControl fullWidth size='small'>
            <InputLabel>{formatParamNames(paramName)}</InputLabel>
            <Select
              {...field}
              label={paramName}
              input={<OutlinedInput label={formatParamNames(paramName)} />}
              error={!!errors[paramName]}
              size='small'
              onChange={(event) => {
                field.onChange(event);
                updateArgumentValue(param.ParameterName!, event.target.value);
              }}
            >
              {param?.EnumValues?.map((item: string) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {errors?.[paramName] && (
            <FormHelperText error>{errors[paramName]?.message}</FormHelperText>
          )}
        </>
      )}
    />
  );

  // Map parameter types to their respective renderers
  const fieldRenderers = {
    string: renderStringField,
    bool: renderBoolField,
    int: renderIntField,
    enum: renderSelect,
  };

  const dataType = param.DataType as keyof typeof fieldRenderers;
  return fieldRenderers[dataType]?.() || renderStringField();
};
