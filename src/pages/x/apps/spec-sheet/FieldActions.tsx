// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The actions of a value: Edit, Inspect, Keep on merge and Remove key, as the action
// row at the foot of the value's hover card (one card per value: the information and the
// actions). Edit opens the value's editor, as a click on the value does; the others only stage
// (or, for Inspect, open a popover). Remove key stands apart, on a row of its own after a
// divider, because it is the one that takes something away.

import { memo } from 'react';
import { Button } from '@mui/material';
import { componentTheme } from '../componentTheme';

const LockIcon = ({ open }: { open?: boolean }) => (
  <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.5' aria-hidden>
    <rect x='3.5' y='7' width='9' height='6.5' rx='1.2' />
    <path d={open ? 'M5.5 7V5a2.5 2.5 0 014.8-1' : 'M5.5 7V5a2.5 2.5 0 015 0v2'} />
  </svg>
);
const MinusIcon = () => (
  <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden>
    <circle cx='8' cy='8' r='5.5' />
    <path d='M5.5 8h5' />
  </svg>
);
const UndoIcon = () => (
  <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden>
    <path d='M5 4L2.5 6.5 5 9' />
    <path d='M2.5 6.5H10a3.5 3.5 0 010 7H7' />
  </svg>
);
export const PencilIcon = () => (
  <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinejoin='round' aria-hidden>
    <path d='M10.5 2.5l3 3-8 8H2.5v-3z' />
  </svg>
);
const InspectIcon = () => (
  <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.5' aria-hidden>
    <circle cx='7' cy='7' r='4.5' />
    <path d='M10.5 10.5L14 14' />
  </svg>
);

const buttonSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  minWidth: 0,
  px: '7px',
  py: '3px',
  borderRadius: `${componentTheme.radiusSm}px`,
  fontFamily: componentTheme.fontSans,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: '18px',
  textTransform: 'none',
  color: componentTheme.fgMuted,
  whiteSpace: 'nowrap',
  '& svg': { flexShrink: 0, color: componentTheme.fgSubtle },
  '&:hover, &.Mui-focusVisible': { color: componentTheme.accent, bgcolor: componentTheme.accentMuted, '& svg': { color: 'currentColor' } },
  '&.Mui-focusVisible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '-2px' },
  '&.Mui-disabled': { opacity: 0.45 },
} as const;

// Remove key is quiet like the others; it shows the danger colour only under the pointer or the
// keyboard focus. It only stages, so it asks for no confirmation.
const removeSx = {
  ...buttonSx,
  '&:hover, &.Mui-focusVisible': { color: componentTheme.danger, bgcolor: componentTheme.dangerHoverTint, '& svg': { color: 'currentColor' } },
  '&.Mui-focusVisible': { outline: `2px solid ${componentTheme.danger}`, outlineOffset: '-2px' },
} as const;

interface FieldActionsProps {
  kept: boolean;
  keepDisabled: boolean;
  removed: boolean;
  inspectOpen: boolean;
  /** Opens the value's editor; absent where the value has no editor. */
  onEdit?: () => void;
  onToggleKeep: () => void;
  onToggleRemove: () => void;
  onInspect: () => void;
}

/** The action row at the foot of a value's hover card: text buttons with their icons, easy to hit. */
export const FieldActions = memo(function FieldActions({
  kept,
  keepDisabled,
  removed,
  inspectOpen,
  onEdit,
  onToggleKeep,
  onToggleRemove,
  onInspect,
}: FieldActionsProps) {
  return (
    <div
      className='peek-actions'
      data-testid='field-actions'
      role='group'
      aria-label='Field actions'
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 2,
        padding: '4px 6px 6px',
        borderTop: `1px solid ${componentTheme.borderSubtle}`,
      }}
    >
      {onEdit && (
        <Button size='small' data-testid='field-action-edit' onClick={onEdit} sx={buttonSx}>
          <PencilIcon />
          Edit
        </Button>
      )}
      <Button size='small' data-testid='field-action-inspect' aria-expanded={inspectOpen} onClick={onInspect} sx={buttonSx}>
        <InspectIcon />
        Inspect
      </Button>
      <Button
        size='small'
        data-testid='field-action-keep'
        aria-pressed={kept}
        disabled={keepDisabled}
        title={keepDisabled ? 'A field inside a list cannot be kept on merge' : undefined}
        onClick={onToggleKeep}
        sx={buttonSx}
      >
        <LockIcon open={kept} />
        {kept ? 'Let merges update this' : 'Keep on merge'}
      </Button>
      <span
        aria-hidden
        data-testid='field-actions-divider'
        // A hairline across the card: Remove key is on a row of its own under the others, so the
        // divider never dangles at the end of a wrapped row.
        style={{ flexBasis: '100%', height: 1, margin: '2px 0', background: componentTheme.borderSubtle }}
      />
      <Button size='small' data-testid='field-action-remove' onClick={onToggleRemove} sx={removeSx}>
        {removed ? <UndoIcon /> : <MinusIcon />}
        {removed ? 'Undo remove' : 'Remove key'}
      </Button>
    </div>
  );
});
