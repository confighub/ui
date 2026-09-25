// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { SpaceRead } from '@confighub/rtk-query';
import {
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  SelectChangeEvent,
} from '@mui/material';

interface SpaceSelectorProps {
  /**
   * Currently selected space ID
   */
  value: string;
  /**
   * Callback fired when the selection changes
   */
  onChange: (spaceId: string) => void;
  /**
   * Array of available spaces
   */
  spaces: SpaceRead[];
  /**
   * Label for the select input
   * @default "Space"
   */
  label?: string;
  /**
   * Whether the component is disabled
   * @default false
   */
  disabled?: boolean;
  /**
   * Whether the field is required
   * @default false
   */
  required?: boolean;
  /**
   * Error state
   * @default false
   */
  error?: boolean;
  /**
   * Helper text to display below the select
   */
  helperText?: string;
  /**
   * Size of the select component
   * @default "small"
   */
  size?: 'small' | 'medium';
  /**
   * Whether to take full width
   * @default true
   */
  fullWidth?: boolean;
  /**
   * Minimum width of the component
   * @default 300
   */
  minWidth?: number;
}

export const SpaceSelector = ({
  value,
  onChange,
  spaces,
  label = 'Space',
  disabled = false,
  required = false,
  error = false,
  size = 'small',
  fullWidth = true,
  minWidth = 240,
}: SpaceSelectorProps) => {
  const handleChange = (event: SelectChangeEvent<string>) => {
    onChange(event.target.value);
  };

  return (
    <FormControl
      sx={{ minWidth }}
      fullWidth={fullWidth}
      size={size}
      disabled={disabled}
      required={required}
      error={error}
    >
      <InputLabel id={`${label.toLowerCase()}-select-label`}>{label}</InputLabel>
      <Select
        data-testid='space-selector'
        labelId={`${label.toLowerCase()}-select-label`}
        value={value}
        onChange={handleChange}
        input={<OutlinedInput label={label} />}
        size={size}
        // sx={{
        //   height: '36px',
        // }}
        renderValue={(selected) => spaces?.find((space) => space?.SpaceID === selected)?.Slug}
      >
        {spaces?.map((space) => (
          <MenuItem key={space?.SpaceID} value={space?.SpaceID}>
            <Checkbox checked={value === space?.SpaceID} />
            <ListItemText primary={space?.Slug} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default SpaceSelector;
