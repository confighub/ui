// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// One line above the sheet when a read about the Unit fails. The values stay drawn under it.

import { Box, Button } from '@mui/material';
import { componentTheme } from '../componentTheme';
import { CHIP_TONE } from '../flow-graph/DeploymentFlowNode';

const ErrorIcon = () => (
  <svg viewBox='0 0 16 16' width='12' height='12' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
    <circle cx='8' cy='8' r='6' />
    <path d='M8 5v3.5' />
    <path d='M8 11v.01' />
  </svg>
);

export function SheetError({ onRetry }: { onRetry: () => void }) {
  return (
    <Box
      data-testid='field-error'
      role='alert'
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 2,
        py: 1.75,
        fontSize: 12.5,
        fontFamily: componentTheme.fontSans,
        color: componentTheme.fgMuted,
      }}
    >
      <Box
        component='span'
        sx={{
          width: 24,
          height: 24,
          borderRadius: `${componentTheme.radiusSm}px`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: CHIP_TONE.danger.tint,
          color: CHIP_TONE.danger.color,
          flexShrink: 0,
        }}
      >
        <ErrorIcon />
      </Box>
      <span>Not read: failed</span>
      <Button
        data-testid='field-retry'
        variant='text'
        size='small'
        onClick={onRetry}
        sx={{ minWidth: 0, p: 0, fontSize: 12.5, fontWeight: 600, color: componentTheme.accent, lineHeight: 1.4 }}
      >
        Retry
      </Button>
    </Box>
  );
}
