// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Control, Controller, FieldErrors, FieldPath } from 'react-hook-form';

import { SLUG_MAX_LENGTH, SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { TextField } from '@mui/material';

interface NameFieldProps<T extends Record<string, unknown>> {
  control: Control<T>;
  errors: FieldErrors<T>;
  fieldName: FieldPath<T>;
  label?: string;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
}

export const NameField = <T extends Record<string, unknown>>({
  control,
  errors,
  fieldName,
  label,
  maxLength,
  pattern,
  patternMessage,
  placeholder,
  required = true,
  helperText,
}: NameFieldProps<T>) => {
  const fieldError = errors[fieldName];

  // Build validation rules
  const rules: Record<string, unknown> = {};
  if (required) {
    rules.required = `${label || 'This field'} is required`;
  }
  if (maxLength) {
    rules.maxLength = {
      value: maxLength,
      message: `${label || 'This field'} must be at most ${maxLength} characters`,
    };
  }
  if (pattern) {
    rules.pattern = {
      value: pattern,
      message: patternMessage,
    };
  }

  return (
    <Controller
      name={fieldName}
      control={control}
      rules={rules}
      render={({ field }) => (
        <TextField
          fullWidth
          label={label}
          error={!!fieldError}
          size='small'
          placeholder={placeholder}
          helperText={(fieldError?.message as string) || helperText}
          {...field}
        />
      )}
    />
  );
};

// Slug-specific name field for URL-safe identifiers (like Unit names)
export const SlugNameField = <T extends Record<string, unknown>>({
  control,
  errors,
  fieldName,
  label,
  required = true,
  helperText = 'This will be used as the URL identifier',
}: {
  control: Control<T>;
  errors: FieldErrors<T>;
  fieldName: FieldPath<T>;
  label?: string;
  required?: boolean;
  helperText?: string;
}) => {
  return (
    <NameField
      control={control}
      errors={errors}
      fieldName={fieldName}
      label={label}
      maxLength={SLUG_MAX_LENGTH}
      pattern={SLUG_PATTERN}
      patternMessage={SLUG_PATTERN_MESSAGE}
      placeholder='my-resource-name'
      required={required}
      helperText={helperText}
    />
  );
};
