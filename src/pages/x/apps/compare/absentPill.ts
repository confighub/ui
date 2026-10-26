// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The "not set" mark of a value a column does not set: a cell's (`CompareCell`),
 * and, in the page layout, an image row's (`CompareImageRows`), so the two
 * read as one thing.
 */

import { componentTheme } from '../componentTheme';

export const ABSENT_BASE_SX = {
  display: 'inline-block',
  boxSizing: 'border-box',
  minHeight: 20,
  lineHeight: '16px',
  fontFamily: componentTheme.fontSans,
  fontStyle: 'italic',
  fontSize: 10.5,
  fontWeight: 600,
  color: componentTheme.fgSubtle,
  padding: '1px 4px',
  border: '1px dashed transparent',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
} as const;

/** Not set here, where another column sets it: always a difference. */
export const ABSENT_KIND_SX = {
  color: componentTheme.danger,
  background: componentTheme.dangerTint,
  borderColor: componentTheme.dangerEdge,
} as const;

export const ABSENT_PILL_SX = { ...ABSENT_BASE_SX, ...ABSENT_KIND_SX } as const;
