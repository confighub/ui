// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FunctionChannelOption } from '@/hooks/useFunctionChannels';
import {
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
} from '@mui/material';

interface ChannelSelectorProps {
  /** ID of the selected Channel, or '' for none */
  value: string;
  /** Called with the selected Channel's ID, or '' when the selection is cleared */
  onChange: (channelId: string) => void;
  /** The Channels to choose from */
  channels: FunctionChannelOption[];
  /** @default "Channel" */
  label?: string;
  /** @default 260 */
  minWidth?: number;
}

/** A single-select picker of Channels: picking the selected one clears it. */
export const ChannelSelector = ({
  value,
  onChange,
  channels,
  label = 'Channel',
  minWidth = 260,
}: ChannelSelectorProps) => (
  <FormControl
    sx={{ minWidth, '& .MuiInputLabel-root': { lineHeight: 1.2 } }}
    fullWidth
    size='small'
  >
    <InputLabel id={`${label.toLowerCase()}-select-label`}>{label}</InputLabel>
    <Select
      labelId={`${label.toLowerCase()}-select-label`}
      value={value}
      input={<OutlinedInput label={label} />}
      size='small'
      sx={{ height: '36px' }}
      renderValue={(selected) => channels.find((channel) => channel.id === selected)?.label}
    >
      {channels.map((channel) => (
        <MenuItem
          key={channel.id}
          value={channel.id}
          onClick={() => onChange(channel.id === value ? '' : channel.id)}
        >
          <Checkbox checked={value === channel.id} />
          <ListItemText primary={channel.label} />
        </MenuItem>
      ))}
    </Select>
  </FormControl>
);

export default ChannelSelector;
