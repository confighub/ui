// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The hover cluster of a block label: Keep this block on merge, and Add a key for a map
// block. Icons only; it appears on hover or focus and moves nothing.

import { memo } from 'react';
import { IconButton } from '@mui/material';
import { componentTheme } from '../componentTheme';

const LockIcon = () => (
  <svg viewBox='0 0 16 16' width='13' height='13' fill='none' stroke='currentColor' strokeWidth='1.5' aria-hidden>
    <rect x='3.5' y='7' width='9' height='6.5' rx='1.2' />
    <path d='M5.5 7V5a2.5 2.5 0 015 0v2' />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox='0 0 16 16' width='13' height='13' fill='none' stroke='currentColor' strokeWidth='1.7' aria-hidden>
    <path d='M8 3v10M3 8h10' />
  </svg>
);

const sx = {
  width: 22,
  height: 22,
  p: 0,
  borderRadius: '4px',
  color: componentTheme.fgSubtle,
  '& svg': { width: 13, height: 13 },
  '&:hover': { color: componentTheme.accent, bgcolor: componentTheme.accentMuted },
  '&.Mui-disabled': { opacity: 0.4 },
} as const;

interface BlockActionsProps {
  /** Keys of the block that can still be kept; 0 disables Keep. */
  keepable: number;
  canAdd: boolean;
  onKeep: () => void;
  onAdd: () => void;
}

export const BlockActions = memo(function BlockActions({ keepable, canAdd, onKeep, onAdd }: BlockActionsProps) {
  return (
    <span className='bactions' data-testid='block-actions'>
      <IconButton size='small' data-testid='block-action-keep' aria-label='Keep this block on merge' title='Keep this block on merge' disabled={keepable === 0} onClick={onKeep} sx={sx}>
        <LockIcon />
      </IconButton>
      {canAdd && (
        <IconButton size='small' data-testid='block-action-add' aria-label='Add a key' title='Add a key' onClick={onAdd} sx={sx}>
          <PlusIcon />
        </IconButton>
      )}
    </span>
  );
});
