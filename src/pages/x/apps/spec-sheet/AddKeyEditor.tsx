// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The key and value editor at the end of a block: a new key of a map (labels, annotations,
// ConfigMap data), or a new env var. Check or Enter stages an add, X or Esc cancels. The key follows the tree's
// rules (validateKey): no dots, brackets or spaces, and not a key the block already has.

import { memo, useState, type KeyboardEvent } from 'react';
import { IconButton, InputBase } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { componentTheme } from '../componentTheme';
import { validateKey } from '../componentKeyUtils';
import type { SheetBlock } from './specSheetModel';

const inputSx = {
  fontFamily: componentTheme.fontMono,
  fontSize: 12,
  minWidth: 0,
  px: 0.75,
  py: 0.125,
  border: `1px solid ${componentTheme.accent}`,
  borderRadius: `${componentTheme.radiusSm}px`,
  bgcolor: componentTheme.bgDefault,
  '& input': { p: 0 },
} as const;

interface AddKeyEditorProps {
  block: SheetBlock;
  /** Replaces the map key check, for a list whose items are named (an env var's name). */
  validate?: (key: string) => string | undefined;
  onStage: (key: string, value: string) => void;
  onCancel: () => void;
}

export const AddKeyEditor = memo(function AddKeyEditor({ block, validate, onStage, onCancel }: AddKeyEditorProps) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const existing = block.atoms.map((a) => ({ path: a.path, value: '' }));
  const error =
    key === ''
      ? undefined
      : validate
        ? (validateKey(key, '', []) ?? validate(key.trim()))
        : (validateKey(key, block.prefix, existing) ?? undefined);
  const valid = key.trim() !== '' && !error;
  const stage = () => valid && onStage(key.trim(), value);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      stage();
    }
  };
  return (
    <span className='fedit' data-testid='field-add-editor'>
      <span className='fedit-row'>
        <InputBase
          autoFocus
          placeholder='key'
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={onKeyDown}
          inputProps={{ 'data-testid': 'field-add-key', 'aria-invalid': !!error, spellCheck: false }}
          sx={{ ...inputSx, width: '16ch', borderColor: error ? componentTheme.danger : componentTheme.accent }}
        />
        <InputBase
          placeholder='value'
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          inputProps={{ 'data-testid': 'field-add-value', spellCheck: false }}
          sx={{ ...inputSx, width: '22ch' }}
        />
        <IconButton size='small' data-testid='field-editor-confirm' aria-label='Stage this key' disabled={!valid} onClick={stage} sx={{ p: '2px', color: componentTheme.accent }}>
          <CheckIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size='small' data-testid='field-editor-cancel' aria-label='Cancel' onClick={onCancel} sx={{ p: '2px', color: componentTheme.fgSubtle }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </span>
      {error && (
        <span className='fedit-error' role='alert'>
          {error}
        </span>
      )}
    </span>
  );
});
