// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Control, FieldErrors } from 'react-hook-form';
import { Controller } from 'react-hook-form';

import { DEFAULT_TOOLCHAIN_TYPES } from '@/components/query-builder';
import { Unit } from '@confighub/rtk-query';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import { SelectChangeEvent } from '@mui/material/Select';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';

interface ToolchainSelectorProps {
  control: Control<Unit>;
  errors: FieldErrors<Unit>;
  selectedToolchainType: string;
  onToolchainTypeSelected: (event: SelectChangeEvent<string>) => void;
}

export const ToolchainSelector = ({
  control,
  errors,
  selectedToolchainType,
  onToolchainTypeSelected,
}: ToolchainSelectorProps) => {
  const selectorContent = (
    <Controller
      name='ToolchainType'
      control={control}
      rules={{ required: 'Toolchain type is required' }}
      render={({ field }) => (
        <FormControl fullWidth size='small' error={!!errors.ToolchainType}>
          <InputLabel id='toolchain-label'>Toolchain Type</InputLabel>
          <Select
            {...field}
            labelId='toolchain-label'
            label='Toolchain Type'
            value={selectedToolchainType}
            onChange={onToolchainTypeSelected}
            size='small'
          >
            {DEFAULT_TOOLCHAIN_TYPES.map((toolchain) => (
              <MenuItem key={toolchain} value={toolchain}>
                {toolchain}
              </MenuItem>
            ))}
          </Select>
          {errors.ToolchainType && (
            <Typography variant='caption' color='error' sx={{ mt: 0.5, ml: 1.75 }}>
              {errors.ToolchainType.message}
            </Typography>
          )}
        </FormControl>
      )}
    />
  );

  return selectorContent;
};
