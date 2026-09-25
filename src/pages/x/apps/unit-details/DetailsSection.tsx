// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode, useState } from 'react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { ChevronIcon, UnitHeaderRow } from '../diffStyles';
import { componentTheme } from '../componentTheme';

const ChevronRightIcon = () => (
  <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2'>
    <path d='M6 4l4 4-4 4' />
  </svg>
);

export interface DetailsSectionProps {
  /** Section title rendered uppercase in the header row. */
  title: string;
  /** Optional count badge rendered next to the title (e.g. label count). */
  count?: number;
  /** Whether the section starts expanded. @default true */
  defaultExpanded?: boolean;
  children: ReactNode;
}

/**
 * Collapsible section wrapper for the inline Unit Details pane. Reuses the
 * Component view's `UnitHeaderRow` + `ChevronIcon` so the accordion sections
 * match the existing visual grammar of `ComponentSidePane`.
 */
export const DetailsSection = ({ title, count, defaultExpanded = true, children }: DetailsSectionProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box sx={{ borderTop: `1px solid ${componentTheme.borderSubtle}` }}>
      <UnitHeaderRow onClick={() => setExpanded((e) => !e)}>
        <ChevronIcon $expanded={expanded}>
          <ChevronRightIcon />
        </ChevronIcon>
        <Typography
          sx={{
            flex: 1,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: componentTheme.fgSubtle,
            fontFamily: componentTheme.fontSans,
          }}
        >
          {title}
        </Typography>
        {count != null && (
          <Box
            component='span'
            sx={{
              fontSize: 10,
              fontWeight: 600,
              fontFamily: componentTheme.fontMono,
              color: componentTheme.fgMuted,
              background: componentTheme.bgInset,
              border: `1px solid ${componentTheme.borderSubtle}`,
              borderRadius: 10,
              padding: '0 6px',
              minWidth: 16,
              textAlign: 'center',
            }}
          >
            {count}
          </Box>
        )}
      </UnitHeaderRow>
      {expanded && (
        <Box
          sx={{
            padding: '10px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {children}
        </Box>
      )}
    </Box>
  );
};
