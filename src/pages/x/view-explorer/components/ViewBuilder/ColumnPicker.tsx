// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Column } from '@confighub/rtk-query';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { LABEL_PREFIX, SPACE_LABEL_PREFIX } from '../../types';

import { useLabelKeys } from '../../hooks/useLabelKeys';

interface ColumnPickerProps {
  columns: Column[];
  /** Adapter-provided column vocabulary (Slug, CreatedAt, ...). */
  baseColumns: string[];
  onChange: (columns: Column[]) => void;
  disabled?: boolean;
}

const DragHandle = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  cursor: 'grab',
  color: theme.palette.text.disabled,
  '&:active': { cursor: 'grabbing' },
}));

const ColumnChip = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  backgroundColor: theme.palette.action.selected,
  borderRadius: theme.shape.borderRadius,
  padding: '2px 6px 2px 4px',
  fontSize: '0.8rem',
}));

export function ColumnPicker({ columns, baseColumns, onChange, disabled }: ColumnPickerProps) {
  const selectedNames = columns.map((c) => c.Name);
  const { labelKeys, spaceLabelKeys } = useLabelKeys();

  const allOptions = [
    ...baseColumns,
    ...labelKeys.map((k) => `${LABEL_PREFIX}${k}`),
    ...spaceLabelKeys.map((k) => `${SPACE_LABEL_PREFIX}${k}`),
  ];

  // Only show options not already selected
  const availableOptions = allOptions.filter((o) => !selectedNames.includes(o));

  const handleAdd = (_: unknown, value: string | null) => {
    if (!value) return;
    onChange([...columns, { Name: value }]);
  };

  const handleRemove = (name: string) => {
    onChange(columns.filter((c) => c.Name !== name));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    const srcIndex = Number(e.dataTransfer.getData('text/plain'));
    if (srcIndex === targetIndex) return;
    const newCols = [...columns];
    const [moved] = newCols.splice(srcIndex, 1);
    newCols.splice(targetIndex, 0, moved);
    onChange(newCols);
  };

  return (
    <Box>
      <Autocomplete
        options={availableOptions}
        value={null}
        onChange={handleAdd}
        disabled={disabled}
        size='small'
        clearOnBlur
        blurOnSelect
        groupBy={(option) =>
          option.startsWith(SPACE_LABEL_PREFIX)
            ? 'Space Labels'
            : option.startsWith(LABEL_PREFIX)
              ? 'Labels'
              : 'Fields'
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label='Add column'
            placeholder='Search columns...'
          />
        )}
        renderOption={(props, option) => (
          <li {...props} key={option}>
            <Typography variant='body2'>{option}</Typography>
          </li>
        )}
      />

      {columns.length > 0 && (
        <Stack
          direction='row'
          flexWrap='wrap'
          gap={0.5}
          mt={1}
          sx={{ maxHeight: 120, overflowY: 'auto' }}
        >
          {columns.map((col, idx) => (
            <Box
              key={col.Name}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, idx)}
            >
              <ColumnChip>
                <DragHandle>
                  <DragIndicatorIcon sx={{ fontSize: 14 }} />
                </DragHandle>
                <span>{col.Name}</span>
                {!disabled && (
                  <Chip
                    size='small'
                    label='×'
                    onClick={() => handleRemove(col.Name)}
                    sx={{
                      height: 16,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                      '& .MuiChip-label': { px: 0.5 },
                    }}
                  />
                )}
              </ColumnChip>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
