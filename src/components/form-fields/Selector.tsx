// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Control, Controller, FieldErrors, UseFormSetValue } from 'react-hook-form';

import { Unit } from '@confighub/rtk-query';
import InfoIcon from '@mui/icons-material/Info';
import {
  Alert,
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  SelectChangeEvent,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';

interface SelectorOption {
  id: string;
  label: string;
}

interface SelectorProps {
  control: Control<Unit>;
  errors: FieldErrors<Unit>;
  fieldName: keyof Unit;
  label: string;
  options: SelectorOption[];
  selectedValue: string;
  onSelectionChange?: (event: SelectChangeEvent<string>) => void;
  setValue?: UseFormSetValue<Unit>;
  required?: boolean;
  showCheckbox?: boolean;
  emptyMessage?: string;
  // Optional Grid wrapper and Alert
  showInGrid?: boolean;
  alertMessage?: string;
  alertTitle?: string;
}

export const Selector = ({
  control,
  errors,
  fieldName,
  label,
  options,
  selectedValue,
  onSelectionChange,
  setValue,
  required = false,
  showCheckbox = false,
  emptyMessage = 'No options available',
  showInGrid = false,
  alertMessage,
  alertTitle,
}: SelectorProps) => {
  const displayLabel = `${label}${required ? ' *' : ''}`;
  const fieldError = errors[fieldName];

  const selectorContent = (
    <>
      <Controller
        name={fieldName}
        control={control}
        rules={required ? { required: `${label} is required` } : {}}
        render={({ field }) => (
          <FormControl fullWidth size='small'>
            <InputLabel id={`${fieldName}-label`} error={!!fieldError}>
              {displayLabel}
            </InputLabel>
            <Select
              {...field}
              value={showCheckbox ? selectedValue : field.value}
              onChange={(event) => {
                if (onSelectionChange) {
                  onSelectionChange(event as SelectChangeEvent<string>);
                } else if (setValue) {
                  setValue(fieldName, event.target.value as string);
                }
              }}
              input={<OutlinedInput label={displayLabel} />}
              size='small'
              error={!!fieldError}
              renderValue={
                showCheckbox
                  ? (selected) => options.find((option) => option.id === selected)?.label
                  : undefined
              }
            >
              {options?.length > 0 ? (
                options.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {showCheckbox && <Checkbox checked={selectedValue === option.id} />}
                    <ListItemText primary={option.label} />
                  </MenuItem>
                ))
              ) : (
                <MenuItem value=''>
                  <em>{emptyMessage}</em>
                </MenuItem>
              )}
            </Select>
            {fieldError && (
              <Typography variant='caption' color='error' sx={{ mt: 0.5 }}>
                {typeof fieldError === 'string' ? fieldError : (fieldError.message as string)}
              </Typography>
            )}
          </FormControl>
        )}
      />
      {/* Optional Alert */}
      {alertMessage && (
        <Alert severity='info' icon={<InfoIcon />} sx={{ mt: 1 }}>
          {alertTitle && <strong>{alertTitle}:</strong>} {alertMessage}
        </Alert>
      )}
    </>
  );

  // Conditionally wrap in Grid
  if (showInGrid) {
    return (
      <>
        <Grid size={{ xs: 12 }}>{selectorContent}</Grid>
        {/* Separate Grid for alert if it exists and we're in grid mode */}
        {alertMessage && !showInGrid && (
          <Grid size={{ xs: 12 }}>
            <Alert severity='info' icon={<InfoIcon />}>
              {alertTitle && <strong>{alertTitle}:</strong>} {alertMessage}
            </Alert>
          </Grid>
        )}
      </>
    );
  }

  return selectorContent;
};