// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The light tooltip surface the value pills open in. */

import { componentTheme } from './componentTheme';

export const tooltipSx = {
  p: 0,
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.borderMuted}`,
  borderRadius: '6px',
  boxShadow: '0 2px 8px rgba(0,0,0,.10)',
  maxWidth: 'none',
  // Never intercept the pointer — the tooltip overlaps the value/editing surface,
  // so it must be click-through (clicks pass to the value to enter inline edit).
  pointerEvents: 'none' as const,
};
