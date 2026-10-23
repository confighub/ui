// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

/** Small shared pieces of the lens column. */

/** A key cap on a light surface (`/`, `⌘E`). */
export const Kbd = styled('kbd')(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  fontSize: 10.5,
  fontWeight: 700,
  lineHeight: 1,
  padding: '2px 5px',
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  borderBottomWidth: 2,
  color: theme.palette.text.disabled,
  background: theme.palette.background.paper,
  whiteSpace: 'nowrap',
}));

interface SectionProps {
  label: string;
  note?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  testId?: string;
}

/** A column section: an uppercase label, an optional note and a right-hand part, then its content. */
export function Section({ label, note, right, children, testId }: SectionProps) {
  return (
    <Box sx={{ mt: 1.75 }} data-testid={testId}>
      <Stack
        direction='row'
        alignItems='baseline'
        sx={{ px: 0.5, pb: 0.75, minHeight: 22, gap: 0.875 }}
      >
        <Typography
          variant='caption'
          sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.disabled' }}
        >
          {label}
        </Typography>
        {note && (
          <Typography component='span' sx={{ fontSize: 11.5, color: 'text.disabled' }}>
            {note}
          </Typography>
        )}
        {right && (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'baseline' }}>{right}</Box>
        )}
      </Stack>
      {children}
    </Box>
  );
}
