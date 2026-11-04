// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Theme } from '@mui/material/styles';

/**
 * A 12px scroll bar with a grey thumb on a light track, for a region that
 * scrolls sideways. The global 3px style is too thin to see or grab there.
 * Spread it into the `sx` or `styled` styles of the element that scrolls.
 */
export const scrollbarStyles = (theme: Theme) => ({
  '::-webkit-scrollbar': {
    WebkitAppearance: 'none',
    width: '12px',
    height: '12px',
  },
  '::-webkit-scrollbar-track': {
    background: theme.palette.grey[100],
    borderRadius: '10px',
  },
  '::-webkit-scrollbar-thumb': {
    background: '#aaa',
    borderRadius: '10px',
    border: '2px solid ' + theme.palette.grey[100],
  },
  '::-webkit-scrollbar-thumb:hover': {
    background: '#888',
  },
});
