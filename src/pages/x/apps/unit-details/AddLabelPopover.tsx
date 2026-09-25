// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';

import type { LabelOptions } from '@/components/query-builder/types';
import AddIcon from '@mui/icons-material/Add';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { componentTheme } from '../componentTheme';
import { getLabelColors } from './labelColors';

/** Pill badge showing unit count in autocomplete dropdown options */
const CountBadge = ({ count }: { count: number }) => (
  <Box
    component='span'
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 16,
      minWidth: 16,
      px: '5px',
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.07)',
      color: componentTheme.fgSubtle,
      fontSize: 10,
      lineHeight: 1,
      flexShrink: 0,
    }}
  >
    {count}
  </Box>
);

export interface AddLabelPopoverProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onAdd: (key: string, value: string) => void;
  type: 'Labels' | 'Annotations';
  labelOptions?: LabelOptions;
  /** When set, pre-fills the form for editing an existing label. */
  initialKey?: string;
  initialValue?: string;
  /** Which field to focus on open when editing. Defaults to 'key'. */
  focusField?: 'key' | 'value';
}

/**
 * Inline popover for adding a label or annotation. Anchors to the triggering
 * button rather than opening a modal dialog. When labelOptions is provided,
 * both key and value inputs show autocomplete suggestions with unit counts.
 */
export const AddLabelPopover = ({
  anchorEl,
  open,
  onClose,
  onAdd,
  type,
  labelOptions,
  initialKey,
  initialValue,
  focusField = 'key',
}: AddLabelPopoverProps) => {
  const isEditMode = initialKey != null;
  const [key, setKey] = useState(initialKey ?? '');
  const [value, setValue] = useState(initialValue ?? '');
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);

  const valueOptions = key && labelOptions ? (labelOptions.valuesByKey[key] ?? []) : [];
  const canAdd = key.trim() !== '' && value.trim() !== '';

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(key.trim(), value.trim());
    setKey('');
    setValue('');
    onClose();
  };

  const handleClose = () => {
    setKey('');
    setValue('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canAdd) {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  const isLabel = type === 'Labels';

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      TransitionProps={{ onEntered: () => (focusField === 'value' ? valueInputRef : keyInputRef).current?.focus() }}
      slotProps={{
        paper: {
          sx: {
            width: 296,
            p: '12px',
            mb: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            borderRadius: `${componentTheme.radiusMd}px`,
            border: `1px solid ${componentTheme.borderDefault}`,
            boxShadow: componentTheme.shadowMd,
          },
        },
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: componentTheme.fgSubtle, mb: '2px' }}>
        {isEditMode ? 'Edit label' : `Add ${isLabel ? 'label' : 'annotation'}`}
      </Typography>

      {/* Key */}
      {isLabel && labelOptions ? (
        <Autocomplete
          freeSolo
          size='small'
          options={labelOptions.keys}
          value={key}
          onChange={(_, newValue) => {
            setKey(typeof newValue === 'string' ? newValue : '');
            setValue('');
          }}
          onInputChange={(_, newInputValue) => {
            setKey(newInputValue);
            setValue('');
          }}
          autoHighlight
          openOnFocus
          renderOption={(props, option) => {
            const count = labelOptions.countByKey[option];
            const { bg, fg, border } = getLabelColors(option);
            return (
              <li {...props} key={option}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                  <Box
                    component='span'
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      px: '8px',
                      height: 20,
                      borderRadius: '9999px',
                      border: `1px solid ${border}`,
                      background: bg,
                      color: fg,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {option}
                  </Box>
                  {count != null && <CountBadge count={count} />}
                </Box>
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={keyInputRef}
              placeholder='Key'
              size='small'
              onKeyDown={handleKeyDown}
            />
          )}
        />
      ) : (
        <TextField
          size='small'
          placeholder='Key'
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={handleKeyDown}
          inputRef={keyInputRef}
          fullWidth
        />
      )}

      {/* Value */}
      {isLabel && labelOptions ? (
        <Autocomplete
          freeSolo
          size='small'
          options={valueOptions}
          value={value}
          onChange={(_, newValue) => setValue(typeof newValue === 'string' ? newValue : '')}
          onInputChange={(_, newInputValue) => setValue(newInputValue)}
          disabled={!key}
          autoHighlight
          openOnFocus
          renderOption={(props, option) => {
            const count = key ? labelOptions.countByKeyValue[key]?.[option] : undefined;
            const { bg, fg, border } = getLabelColors(key);
            return (
              <li {...props} key={option}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                  <Box
                    component='span'
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      px: '8px',
                      height: 20,
                      borderRadius: '9999px',
                      border: `1px solid ${border}`,
                      background: bg,
                      color: fg,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {option}
                  </Box>
                  {count != null && (
                    <Tooltip title={`${count} unit${count === 1 ? '' : 's'} use this value`} placement='right'>
                      <Box component='span'>
                        <CountBadge count={count} />
                      </Box>
                    </Tooltip>
                  )}
                </Box>
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={valueInputRef}
              placeholder='Value'
              size='small'
              onKeyDown={handleKeyDown}
            />
          )}
        />
      ) : (
        <TextField
          size='small'
          placeholder='Value'
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          inputRef={valueInputRef}
          fullWidth
        />
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', mt: '2px' }}>
        <Button
          size='small'
          variant='text'
          onClick={handleClose}
          sx={{ textTransform: 'none', fontSize: 12, color: componentTheme.fgMuted, minWidth: 0, px: 1 }}
        >
          Cancel
        </Button>
        <Button
          size='small'
          variant='contained'
          disabled={!canAdd}
          onClick={handleAdd}
          startIcon={!isEditMode ? <AddIcon sx={{ fontSize: 13 }} /> : undefined}
          sx={{ textTransform: 'none', fontSize: 12, minWidth: 0, px: '10px', py: '4px' }}
        >
          {isEditMode ? 'Save' : 'Add'}
        </Button>
      </Box>
    </Popover>
  );
};
