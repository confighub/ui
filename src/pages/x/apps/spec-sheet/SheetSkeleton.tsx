// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The sheet while the Unit's configuration is read: one column of 8 lines, as the mock draws it.
import Box from '@mui/material/Box';

import { componentTheme } from '../componentTheme';

/** The widths of the 8 lines, so the column reads as text, not as a table. */
const LINE_WIDTHS = [92, 78, 85, 60, 90, 45, 82, 70];

export function SheetSkeleton() {
  return (
    <Box
      data-testid='field-skeleton'
      role='status'
      aria-label='Reading the configuration'
      sx={{ p: '14px', display: 'flex', flexDirection: 'column', gap: '9px' }}
    >
      {LINE_WIDTHS.map((width, i) => (
        <Box
          key={i}
          component='span'
          sx={{ display: 'block', height: 10, width: `${width}%`, borderRadius: '4px', bgcolor: componentTheme.bgInset }}
        />
      ))}
    </Box>
  );
}
