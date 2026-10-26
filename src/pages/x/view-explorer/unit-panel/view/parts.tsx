// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import type { Tone } from '../tones';
import { toneColor } from './colors';

/** A status dot, as the table's and the peek's. */
export function Dot({ tone }: { tone: Tone }) {
  return (
    <Box
      component='span'
      aria-hidden
      sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block', bgcolor: (t) => toneColor(t, tone) }}
    />
  );
}

interface SectionProps {
  title: string;
  meta?: ReactNode;
  /** The section holds the panel's primary action: a mark in the brand colour on its left edge. */
  ranked?: boolean;
  children: ReactNode;
  testId?: string;
}

/** One section of the Summary: a heading with a muted note beside it, then its content. */
export function Section({ title, meta, ranked, children, testId }: SectionProps) {
  return (
    <Box
      component='section'
      aria-label={title}
      data-testid={testId}
      sx={{ position: 'relative', px: '14px', pt: '14px', pb: 2, borderBottom: 1, borderColor: 'grey.200' }}
    >
      {ranked && (
        <Box
          aria-hidden
          sx={{ position: 'absolute', left: -1, top: 14, width: 3, height: 16, borderRadius: '0 2px 2px 0', bgcolor: 'primary.main' }}
        />
      )}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.25 }}>
        <Typography component='h3' sx={{ fontSize: 12.5, fontWeight: 600, m: 0 }}>
          {title}
        </Typography>
        {meta && (
          <Typography component='span' sx={{ fontSize: 12, color: 'text.disabled' }}>
            {meta}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}
