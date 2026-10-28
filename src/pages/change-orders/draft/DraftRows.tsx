// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The rows a kind of change has under the What track: a short name, then its controls. */

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import HistoryIcon from '@mui/icons-material/History';

import { changeOrderInk, changeOrderType } from '../changeOrdersTokens';

export interface RowProps {
  label: string;
  testId: string;
  /** Keep the controls on one line: what can give way truncates instead of wrapping. */
  oneLine?: boolean;
  children: ReactNode;
}

/** One row: a short name, and its controls on one line that wraps. */
export function Row({ label, testId, oneLine = false, children }: RowProps) {
  return (
    <>
      <Box
        aria-hidden="true"
        sx={{ fontSize: changeOrderType.size.small, fontWeight: changeOrderType.weight.medium, color: changeOrderInk.muted, lineHeight: '28px', whiteSpace: 'nowrap' }}
      >
        {label}
      </Box>
      <Box
        role="group"
        aria-label={label}
        data-testid={testId}
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: oneLine ? 'nowrap' : 'wrap',
          gap: '6px',
          minWidth: 0,
          minHeight: 28,
        }}
      >
        {children}
      </Box>
    </>
  );
}

export interface KeepTogetherProps {
  children: ReactNode;
}

/** A control and what reads with it (its history mark, its resource): they wrap as one. */
export function KeepTogether({ children }: KeepTogetherProps) {
  return <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', minWidth: 0, flex: 'none' }}>{children}</Box>;
}

/** Last time's value, said with the facts' history mark. */
export function AsLastTime() {
  return <HistoryIcon aria-hidden data-testid="draft-row-last-time" sx={{ fontSize: 13, color: changeOrderInk.subtle, flex: 'none' }} />;
}
