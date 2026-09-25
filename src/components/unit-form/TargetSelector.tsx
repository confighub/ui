// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Control, FieldErrors, UseFormSetValue } from 'react-hook-form';
import { Controller } from 'react-hook-form';

import { TargetRead, Unit } from '@confighub/rtk-query';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';

interface TargetSelectorProps {
  control: Control<Unit>;
  errors: FieldErrors<Unit>;
  targets: TargetRead[];
  setValue: UseFormSetValue<Unit>;
  required?: boolean;
  showHelpText?: boolean;
  disabled?: boolean;
  title?: string;
}

export const TargetSelector = ({
  control,
  errors,
  targets,
  setValue,
  required = false,
  showHelpText,
  disabled = false,
  title = '',
}: TargetSelectorProps) => {
  return (
    <>
      <Controller
        name='TargetID'
        control={control}
        rules={required ? { required: 'Target is required' } : {}}
        render={({ field }) => (
          <FormControl fullWidth size='small'>
            <InputLabel>Target</InputLabel>
            <Select
              label='Target'
              size='small'
              title={title}
              disabled={disabled}
              input={<OutlinedInput label='Target' />}
              error={!!errors.TargetID}
              {...field}
              onChange={(event) => {
                setValue('TargetID', event.target.value);
              }}
            >
              {targets && targets?.length > 0 ? (
                targets.map((target) => (
                  <MenuItem key={target?.TargetID} value={target?.TargetID}>
                    {target?.Slug}
                  </MenuItem>
                ))
              ) : (
                <MenuItem value=''>
                  <em>No targets available</em>
                </MenuItem>
              )}
            </Select>
            {errors.TargetID && (
              <Typography variant='caption' color='error' sx={{ mt: 0.5, ml: 1.75 }}>
                {errors.TargetID.message}
              </Typography>
            )}
          </FormControl>
        )}
      />
      {showHelpText && (
        <FormHelperText sx={{ ml: 2 }}>
          Unlike adding units, importing requires a target to be selected to identify the
          source environment.
        </FormHelperText>
      )}
    </>
  );
};
