// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Control, Controller, FieldErrors } from 'react-hook-form';

import { Attribute } from '@/types';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import TextField, { TextFieldProps } from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';

import { formatParamNames } from '../../../utility/query-functions';
import { AttributeInput } from '../../../utility/schema-functions';

export interface ComponentProps extends Omit<AttributeInput, 'root' | 'value'> {
  onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  control: Control<Record<string, string>, unknown>;
  errors: FieldErrors<Record<string, string>>;
  disabled?: boolean;
  variant?: TextFieldProps['variant'];
  defaultValue: string;
  label: string;
  name: string;
}

const ComponentMap = {
  string: (props: ComponentProps) => {
    const {
      enum: enumValues = [],
      label,
      defaultValue,
      control,
      errors,
      onBlur,
      disabled = false,
      variant,
      name,
    } = props;
    if (enumValues.length > 0) {
      return (
        <Controller
          name={name}
          control={control}
          rules={{ required: 'Toolchain Type is required' }}
          render={({ field }) => (
            <>
              <FormControl fullWidth size='small'>
                <InputLabel>{formatParamNames(label)}</InputLabel>
                <Select
                  {...field}
                  label={label}
                  input={<OutlinedInput label={formatParamNames(label)} />}
                  error={!!errors[name]}
                  defaultValue={defaultValue}
                  size='small'
                >
                  {enumValues.map((item: string) => (
                    <MenuItem key={item} value={item}>
                      {item}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {errors?.[name] && (
                <FormHelperText error>{errors[name]?.message}</FormHelperText>
              )}
            </>
          )}
        />
      );
    }
    return (
      <Controller
        name={name}
        control={control}
        rules={{ required: `${formatParamNames(label)} is required` }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label={formatParamNames(label)}
            error={!!errors[name]}
            helperText={errors[name]?.message}
            defaultValue={defaultValue}
            disabled={disabled}
            variant={variant}
            onBlur={onBlur}
            size='small'
          />
        )}
      />
    );
  },
  int: ({
    name,
    control,
    label,
    errors,
    defaultValue,
    disabled,
    variant,
    onBlur,
  }: ComponentProps) => (
    <Controller
      // TODO: Need to make path unique with resource name...
      name={name}
      control={control}
      rules={{ required: `${formatParamNames(label)} is required` }}
      render={({ field }) => (
        <TextField
          {...field}
          type='number'
          fullWidth
          label={formatParamNames(label)}
          error={!!errors[name]}
          helperText={errors[name]?.message}
          defaultValue={defaultValue}
          disabled={disabled}
          variant={variant}
          onBlur={onBlur}
          size='small'
        />
      )}
    />
  ),
  boolean: ({ label, onBlur, defaultValue, name, control, errors }: ComponentProps) => (
    <Controller
      name={name}
      control={control}
      rules={{ required: `${formatParamNames(label)} is required` }}
      render={({ field }) => (
        <>
          <ToggleButtonGroup
            {...field}
            defaultValue={defaultValue}
            exclusive
            // @ts-expect-error - TODO:
            onChange={onBlur}
            aria-label={formatParamNames(label)}
            helperText={errors[name]?.message}
            fullWidth
            size='small'
          >
            <ToggleButton value={true} aria-label='true'>
              True
            </ToggleButton>
            <ToggleButton value={false} aria-label='false'>
              False
            </ToggleButton>
          </ToggleButtonGroup>
          {errors?.[name] && <FormHelperText error>{errors[name]?.message}</FormHelperText>}
        </>
      )}
    />
  ),
};

export type UpdateAttributesInput = {
  name: string;
  value: string;
  path: string;
  dataType: string;
  resourceName: string;
};

export interface ComposerProps {
  field: Attribute;
  updateAttributes: (elem: UpdateAttributesInput) => void;
  isEditMode: boolean;
  control: Control<Record<string, string>, unknown>;
  errors: FieldErrors<Record<string, string>>;
  uniqueResourceKey: string;
}

export const Composer = ({
  field,
  updateAttributes,
  isEditMode,
  control,
  errors,
  uniqueResourceKey,
}: ComposerProps) => {
  let Component = ComponentMap['string'];
  if (field.DataType in ComponentMap) {
    Component = ComponentMap[field.DataType as keyof typeof ComponentMap];
  }

  return (
    <Tooltip title={`${field.Description} : ${field.Path}`} arrow placement='top-start'>
      <Box>
        <Component
          name={uniqueResourceKey}
          control={control}
          errors={errors}
          disabled={!isEditMode}
          label={formatParamNames(field.AttributeName)}
          defaultValue={field?.Value || ''}
          onBlur={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            updateAttributes({
              name: field.Path,
              value: event.target.value,
              path: field.Path,
              dataType: field.DataType,
              resourceName: field.ResourceName,
            })
          }
          description={field?.Description || ''}
          path={field.Path}
          type={field.DataType}
        />
      </Box>
    </Tooltip>
  );
};
