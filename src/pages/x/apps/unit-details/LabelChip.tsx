// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';

import { componentTheme } from '../componentTheme';
import { getLabelColors } from './labelColors';

export interface LabelChipProps {
  labelKey: string;
  value: string;
  onDelete?: () => void;
  /** Called with the anchor element and which segment was clicked. */
  onEdit?: (anchorEl: HTMLElement, focus: 'key' | 'value') => void;
}

export const LabelChip = ({ labelKey, value, onDelete, onEdit }: LabelChipProps) => {
  const { bg, fg, border } = getLabelColors(labelKey);

  const segmentBase = {
    display: 'inline-flex',
    alignItems: 'center',
    height: '100%',
    px: '9px',
    fontSize: 12,
    fontFamily: componentTheme.fontSans,
    border: 'none',
    background: 'none',
    cursor: onEdit ? 'pointer' : 'default',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  } as const;

  return (
    <Tooltip title={`${labelKey}=${value}`} placement='top' arrow>
      <Box
        component='span'
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 24,
          flexShrink: 0,
          position: 'relative',
          borderRadius: '9999px',
          border: `1px solid ${border}`,
          '& .chip-delete': { opacity: 0, transition: 'opacity 0.12s' },
          '&:hover .chip-delete': { opacity: 1 },
        }}
      >
        {/* Key segment */}
        <Box
          component={onEdit ? 'button' : 'span'}
          onClick={onEdit ? (e: React.MouseEvent<HTMLElement>) => { const el = e.currentTarget.parentElement; if (el) onEdit(el, 'key'); } : undefined}
          sx={{
            ...segmentBase,
            background: bg,
            color: fg,
            fontWeight: 700,
            borderRight: `1px solid ${border}`,
            borderRadius: '9999px 0 0 9999px',
            '&:hover': onEdit ? { filter: 'brightness(0.95)' } : {},
          }}
        >
          {labelKey}
        </Box>

        {/* Value segment */}
        <Box
          component={onEdit ? 'button' : 'span'}
          onClick={onEdit ? (e: React.MouseEvent<HTMLElement>) => { const el = e.currentTarget.parentElement; if (el) onEdit(el, 'value'); } : undefined}
          sx={{
            ...segmentBase,
            background: componentTheme.bgDefault,
            color: componentTheme.fgDefault,
            fontWeight: 400,
            borderRadius: '0 9999px 9999px 0',
            '&:hover': onEdit ? { background: componentTheme.bgSubtle } : {},
          }}
        >
          {value}
        </Box>

        {/* Delete — absolutely positioned circle badge in top-right corner */}
        {onDelete && (
          <Box
            component='button'
            className='chip-delete'
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(); }}
            aria-label={`Remove label ${labelKey}=${value}`}
            sx={{
              position: 'absolute',
              top: -6,
              right: -6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: `1px solid ${componentTheme.borderDefault}`,
              background: componentTheme.bgDefault,
              color: componentTheme.fgMuted,
              cursor: 'pointer',
              padding: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              '&:hover': { background: componentTheme.danger, color: componentTheme.fgOnEmphasis, borderColor: componentTheme.danger },
            }}
          >
            <CloseIcon sx={{ fontSize: 9 }} />
          </Box>
        )}
      </Box>
    </Tooltip>
  );
};
