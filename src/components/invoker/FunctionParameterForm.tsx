// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Control, Controller, UseFormReturn } from 'react-hook-form';
import {
  TextField,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  FormHelperText,
  Typography,
  Tooltip,
} from '@mui/material';
import { FunctionParameter, FunctionSignature } from '@confighub/rtk-query';
import { FormContainer, ParameterField } from './styles/invoker.styles';
import { FunctionParameterFormData } from './types/invoker.types';

interface FunctionParameterFormProps {
  selectedFunction?: FunctionSignature | null;
  /**
   * Explicit parameter list. When provided it overrides
   * selectedFunction.Parameters — used to render an Invocation's declared
   * parameter namespace rather than the function signature's parameters.
   */
  parameters?: FunctionParameter[] | null;
  form: UseFormReturn<FunctionParameterFormData>;
  prefilledValues?: FunctionParameterFormData;
}

/**
 * Dynamic form for function parameters (or an Invocation's declared parameters).
 */
export const FunctionParameterForm = ({
  selectedFunction,
  parameters,
  form,
}: FunctionParameterFormProps) => {
  const { control, formState: { errors } } = form;

  // Format parameter names (capitalize first letter, handle camelCase)
  const formatParamName = (name: string): string => {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  // Form reset is handled by parent component (InvokerContent)

  const params = parameters ?? selectedFunction?.Parameters;
  if (!params?.length) {
    return null;
  }

  const renderParameter = (param: FunctionParameter, index: number) => {
    const paramName = param.ParameterName || '';
    const dataType = param.DataType || 'string';
    const isFirstParam = index === 0;

    switch (dataType) {
      case 'bool':
        return (
          <ParameterField key={paramName}>
            <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
              {formatParamName(paramName)}
              {param.Required && <span style={{ color: 'error.main' }}> *</span>}
            </Typography>
            <Controller
              name={paramName}
              control={control as Control<FunctionParameterFormData>}
              rules={{
                required: param.Required ? `${formatParamName(paramName)} is required` : false,
              }}
              render={({ field }) => (
                <>
                  <Tooltip title={param.Description || ''} placement="top">
                    <ToggleButtonGroup
                      value={field.value?.toString() || ''}
                      exclusive
                      size="small"
                      onChange={(_, value) => field.onChange(value)}
                      fullWidth
                    >
                      <ToggleButton value="true" autoFocus={isFirstParam}>True</ToggleButton>
                      <ToggleButton value="false">False</ToggleButton>
                    </ToggleButtonGroup>
                  </Tooltip>
                  {errors[paramName] && (
                    <FormHelperText error>{errors[paramName]?.message}</FormHelperText>
                  )}
                </>
              )}
            />
            {param.Description && (
              <Typography variant="caption" color="text.secondary">
                {param.Description}
              </Typography>
            )}
          </ParameterField>
        );

      case 'int':
        return (
          <ParameterField key={paramName}>
            <Controller
              name={paramName}
              control={control as Control<FunctionParameterFormData>}
              rules={{
                required: param.Required ? `${formatParamName(paramName)} is required` : false,
                validate: (value) => {
                  if (value === '' || value === undefined || value === null) {
                    return param.Required ? `${formatParamName(paramName)} is required` : true;
                  }
                  const numValue = Number(value);
                  if (isNaN(numValue)) {
                    return 'Must be a valid integer';
                  }
                  if (!Number.isInteger(numValue)) {
                    return 'Must be a whole number (no decimals)';
                  }
                  return true;
                },
              }}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="number"
                  label={formatParamName(paramName)}
                  variant="outlined"
                  size="small"
                  fullWidth
                  required={param.Required}
                  error={!!errors[paramName]}
                  helperText={errors[paramName]?.message || param.Description}
                  autoFocus={isFirstParam}
                  data-testid={`function-param-${paramName}`}
                  slotProps={{
                    htmlInput: {
                      step: 1,
                    },
                  }}
                />
              )}
            />
          </ParameterField>
        );

      case 'enum':
        return (
          <ParameterField key={paramName}>
            <Controller
              name={paramName}
              control={control as Control<FunctionParameterFormData>}
              rules={{
                required: param.Required ? `${formatParamName(paramName)} is required` : false,
                validate: (value) => {
                  if (param.Required && (!value || value === '')) {
                    return `${formatParamName(paramName)} is required`;
                  }
                  // Validate that the value is one of the enum options
                  if (value && param.EnumValues && !param.EnumValues.includes(String(value))) {
                    return `Must be one of: ${param.EnumValues.join(', ')}`;
                  }
                  return true;
                },
              }}
              render={({ field }) => (
                <FormControl fullWidth size="small" error={!!errors[paramName]}>
                  <InputLabel>{formatParamName(paramName)}</InputLabel>
                  <Select
                    {...field}
                    label={formatParamName(paramName)}
                    input={<OutlinedInput label={formatParamName(paramName)} />}
                    autoFocus={isFirstParam}
                  >
                    {param.EnumValues?.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </Select>
                  {(errors[paramName] || param.Description) && (
                    <FormHelperText>
                      {errors[paramName]?.message || param.Description}
                    </FormHelperText>
                  )}
                </FormControl>
              )}
            />
          </ParameterField>
        );

      case 'string':
      default:
        return (
          <ParameterField key={paramName}>
            <Controller
              name={paramName}
              control={control as Control<FunctionParameterFormData>}
              rules={{
                required: param.Required ? `${formatParamName(paramName)} is required` : false,
                validate: (value) => {
                  if (param.Required && (!value || String(value).trim() === '')) {
                    return `${formatParamName(paramName)} is required`;
                  }
                  return true;
                },
              }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={formatParamName(paramName)}
                  variant="outlined"
                  size="small"
                  fullWidth
                  required={param.Required}
                  error={!!errors[paramName]}
                  helperText={errors[paramName]?.message || param.Description}
                  placeholder={param.Example}
                  autoFocus={isFirstParam}
                  data-testid={`function-param-${paramName}`}
                />
              )}
            />
          </ParameterField>
        );
    }
  };

  return (
    <FormContainer>
      {params.map((param, index) => renderParameter(param, index))}
    </FormContainer>
  );
};
