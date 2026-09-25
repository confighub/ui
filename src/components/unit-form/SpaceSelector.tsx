// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Control, FieldErrors } from 'react-hook-form';
import { SelectChangeEvent } from '@mui/material/Select';
import { Unit, SpaceRead } from '@confighub/rtk-query';
import { Controller } from 'react-hook-form';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import OutlinedInput from '@mui/material/OutlinedInput';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid2';

interface SpaceSelectorProps {
  control: Control<Unit>;
  errors: FieldErrors<Unit>;
  spaces?: SpaceRead[];
  selectedSpaceID: string;
  onSpaceSelected: (event: SelectChangeEvent<string>) => void;
  showInGrid?: boolean;
}

export const SpaceSelector = ({
  control,
  errors,
  spaces,
  selectedSpaceID,
  onSpaceSelected,
  showInGrid = false,
}: SpaceSelectorProps) => {
  const selectorContent = (
    <Controller
      name='SpaceID'
      control={control}
      rules={{ required: 'Space is required' }}
      render={({ field }) => (
        <FormControl fullWidth size='small'>
          <InputLabel id='space-checkbox-label'>Space</InputLabel>
          <Select
            {...field}
            value={selectedSpaceID}
            onChange={onSpaceSelected}
            input={<OutlinedInput label='Space' />}
            size='small'
            error={!!errors.SpaceID}
            renderValue={(selected) =>
              spaces?.find((space) => space?.SpaceID === selected)?.Slug
            }
          >
            {spaces?.map((space) => (
              <MenuItem key={space?.Slug} value={space?.SpaceID}>
                <Checkbox checked={selectedSpaceID === space?.SpaceID} />
                <ListItemText primary={space?.Slug} />
              </MenuItem>
            ))}
          </Select>
          {errors.SpaceID && (
            <Typography
              variant='caption'
              color='error'
              sx={{ mt: 0.5, ml: 1.75 }}
            >
              {errors.SpaceID.message}
            </Typography>
          )}
        </FormControl>
      )}
    />
  );

  if (showInGrid) {
    return <Grid size={{ xs: 12 }}>{selectorContent}</Grid>;
  }

  return selectorContent;
};
