// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** A real value (a field path, an image tag) in a small pill. Never a name. */
export const valuePillSx = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: 'normal',
  letterSpacing: '-0.01em',
  color: 'text.primary',
  bgcolor: 'var(--bg-hover)',
  boxShadow: 'inset 0 0 0 1px var(--bd0)',
  borderRadius: 'var(--r-sm)',
  px: '4px',
} as const;
