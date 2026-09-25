// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type RefObject } from 'react';

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';

interface DropdownSearchFieldProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export const DropdownSearchField = ({ inputRef, value, onChange, onKeyDown }: DropdownSearchFieldProps) => (
  <Box
    sx={{
      flexShrink: 0,
      bgcolor: 'background.paper',
      p: 1,
      pb: 0,
    }}
  >
    <TextField
      inputRef={inputRef}
      size="small"
      placeholder="Search..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      fullWidth
      autoFocus
      sx={{
        '& .MuiInputBase-root': {
          fontSize: '0.875rem',
        },
      }}
    />
  </Box>
);
