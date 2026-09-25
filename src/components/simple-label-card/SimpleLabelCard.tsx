// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { UseFormSetValue, UseFormWatch } from 'react-hook-form';

import { SectionCard } from '@/components/styled';
import {
  ANNOTATION_KEY_MAX_LENGTH,
  ANNOTATION_KEY_PATTERN,
  ANNOTATION_KEY_PATTERN_MESSAGE,
  ANNOTATION_VALUE_MAX_LENGTH,
  LABEL_KEY_MAX_LENGTH,
  LABEL_KEY_PATTERN,
  LABEL_KEY_PATTERN_MESSAGE,
  LABEL_VALUE_MAX_LENGTH,
  LABEL_VALUE_PATTERN,
  LABEL_VALUE_PATTERN_MESSAGE,
} from '@confighub/api';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export type PropertyType = 'Labels' | 'Annotations';

export interface ISimpleLabelCardProps<T extends Record<string, unknown>> {
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
  fieldName: keyof T;
  type: PropertyType;
  title: string;
  description: string;
  onErrorChange?: (hasError: boolean) => void;
}

// Validation helper functions
const validateKey = (key: string, type: PropertyType): string | null => {
  if (!key.trim()) return null; // Empty is handled separately
  const maxLength = type === 'Annotations' ? ANNOTATION_KEY_MAX_LENGTH : LABEL_KEY_MAX_LENGTH;
  const regex = type === 'Annotations' ? ANNOTATION_KEY_PATTERN : LABEL_KEY_PATTERN;
  if (key.length > maxLength) {
    return `Key must be ${maxLength} characters or less`;
  }
  if (!regex.test(key)) {
    return type === 'Annotations' ? ANNOTATION_KEY_PATTERN_MESSAGE : LABEL_KEY_PATTERN_MESSAGE;
  }
  return null;
};

const validateLabelValue = (value: string): string | null => {
  if (!value.trim()) return null; // Empty is handled separately
  if (value.length > LABEL_VALUE_MAX_LENGTH) {
    return `Value must be ${LABEL_VALUE_MAX_LENGTH} characters or less`;
  }
  if (!LABEL_VALUE_PATTERN.test(value)) {
    return LABEL_VALUE_PATTERN_MESSAGE;
  }
  return null;
};

const validateAnnotationValue = (value: string): string | null => {
  if (!value.trim()) return null; // Empty is handled separately
  if (value.length > ANNOTATION_VALUE_MAX_LENGTH) {
    return `Value must be ${ANNOTATION_VALUE_MAX_LENGTH} characters or less`;
  }
  // Backend allows any content in annotation values — only length is enforced
  return null;
};

export const SimpleLabelCard = <T extends Record<string, unknown>>({
  watch,
  setValue,
  fieldName,
  type,
  title,
  description,
  onErrorChange,
}: ISimpleLabelCardProps<T>) => {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);

  const labels =
    (watch(fieldName as import('react-hook-form').Path<T>) as Record<string, string>) || {};

  const addLabel = () => {
    if (!newKey.trim() || !newValue.trim()) return;

    // Validate key
    const keyValidationError = validateKey(newKey, type);
    if (keyValidationError) {
      setKeyError(keyValidationError);
      return;
    }

    // Validate value based on type
    const valueValidationError = type === 'Labels'
      ? validateLabelValue(newValue)
      : validateAnnotationValue(newValue);
    if (valueValidationError) {
      setValueError(valueValidationError);
      return;
    }

    const updatedLabels = {
      ...labels,
      [newKey.trim()]: newValue.trim(),
    };

    setValue(
      fieldName as import('react-hook-form').Path<T>,
      updatedLabels as import('react-hook-form').PathValue<
        T,
        import('react-hook-form').Path<T>
      >,
    );
    setNewKey('');
    setNewValue('');
    setKeyError(null);
    setValueError(null);
    onErrorChange?.(false);
  };

  const removeLabel = (key: string) => {
    const updatedLabels = { ...labels };
    delete updatedLabels[key];

    setValue(
      fieldName as import('react-hook-form').Path<T>,
      updatedLabels as import('react-hook-form').PathValue<
        T,
        import('react-hook-form').Path<T>
      >,
    );
  };

  const labelEntries = Object.entries(labels);

  return (
    <SectionCard title={title}>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
        {description}
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 5 }}>
          <TextField
            fullWidth
            size='small'
            label={`${type === 'Annotations' ? 'Annotation' : 'Label'} Key`}
            placeholder='e.g., environment'
            value={newKey}
            onChange={(e) => {
              const value = e.target.value;
              setNewKey(value);
              // Validate on change
              const newKeyError = value.trim() ? validateKey(value, type) : null;
              setKeyError(newKeyError);
              onErrorChange?.(!!newKeyError || !!valueError);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addLabel();
              }
            }}
            error={!!keyError}
            helperText={keyError}
          />
        </Grid>
        <Grid size={{ xs: 5 }}>
          <TextField
            fullWidth
            size='small'
            label={`${type === 'Annotations' ? 'Annotation' : 'Label'} Value`}
            placeholder='e.g., production'
            value={newValue}
            onChange={(e) => {
              const value = e.target.value;
              setNewValue(value);
              // Validate on change
              const newValueError = value.trim()
                ? (type === 'Labels' ? validateLabelValue(value) : validateAnnotationValue(value))
                : null;
              setValueError(newValueError);
              onErrorChange?.(!!keyError || !!newValueError);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addLabel();
              }
            }}
            error={!!valueError}
            helperText={valueError}
          />
        </Grid>
        <Grid size={{ xs: 2 }}>
          <Button
            variant='outlined'
            fullWidth
            startIcon={<Add />}
            onClick={addLabel}
            disabled={!newKey.trim() || !newValue.trim() || !!keyError || !!valueError}
            sx={{ minWidth: 'auto', px: 2, borderRadius: '8px' }}
          >
            Add
          </Button>
        </Grid>
      </Grid>

      {labelEntries.length > 0 && (
        <Stack direction='row' spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
          {labelEntries.map(([key, value]) => (
            <Chip
              key={key}
              label={`${key}=${value}`}
              size='small'
              variant='outlined'
              color='primary'
              deleteIcon={
                <IconButton size='small' sx={{ width: 16, height: 16 }}>
                  <Delete sx={{ fontSize: 12 }} />
                </IconButton>
              }
              onDelete={() => removeLabel(key)}
            />
          ))}
        </Stack>
      )}
    </SectionCard>
  );
};
