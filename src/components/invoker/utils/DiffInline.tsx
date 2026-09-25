// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { componentTheme } from '@/pages/x/apps/componentTheme';

interface DiffInlineProps {
  /** The original (before) value */
  oldValue: string;
  /** The new (after) value */
  newValue: string;
}

/**
 * Renders a pending edit inline: new value in amber.
 * Hovering reveals a tooltip showing the full before→after diff.
 * Used in the Value cell of the flat and pivot attribute grids when a pending edit exists.
 */
export function DiffInline({ oldValue, newValue }: DiffInlineProps) {
  return (
    <Tooltip title={`${oldValue} → ${newValue}`} placement="top">
      <Box
        component="span"
        sx={{
          fontFamily: componentTheme.fontMono,
          fontSize: 12,
          color: componentTheme.attentionEmphasis,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
          maxWidth: '100%',
        }}
      >
        {newValue}
      </Box>
    </Tooltip>
  );
}
