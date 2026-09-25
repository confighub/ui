// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { BridgeWorkerRead } from '@confighub/rtk-query';
import {
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
} from '@mui/material';

interface WorkerSelectorProps {
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
  workers: BridgeWorkerRead[];
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

export const WorkerSelector = ({
  value,
  onChange,
  workers,
  label = 'Worker',
  disabled = false,
  required = false,
  error = false,
  size = 'small',
  fullWidth = true,
  minWidth = 260,
}: WorkerSelectorProps) => {
  const handleItemClick = (workerId: string) => {
    // Toggle selection: clicking the already-selected worker deselects it
    onChange(workerId === value ? '' : workerId);
  };

  return (
    <FormControl
      sx={{
        minWidth,
        '& .MuiInputLabel-root': {
          lineHeight: 1.2,
        },
      }}
      fullWidth={fullWidth}
      size={size}
      disabled={disabled}
      required={required}
      error={error}
    >
      <InputLabel id={`${label.toLowerCase()}-select-label`}>{label}</InputLabel>
      <Select
        labelId={`${label.toLowerCase()}-select-label`}
        value={value}
        input={<OutlinedInput label={label} />}
        size={size}
        sx={{
          height: '36px',
        }}
        renderValue={(selected) =>
          workers?.find((worker) => worker.BridgeWorkerID === selected)?.Slug
        }
      >
        {workers?.map((worker) => (
          <MenuItem
            key={worker?.BridgeWorkerID}
            value={worker?.BridgeWorkerID}
            onClick={() => handleItemClick(worker?.BridgeWorkerID ?? '')}
          >
            <Checkbox checked={value === worker?.BridgeWorkerID} />
            <ListItemText primary={worker?.Slug} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default WorkerSelector;
