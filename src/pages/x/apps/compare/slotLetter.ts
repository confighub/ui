// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The slot letter a deployment wears, and the badge that carries it.
 *
 * ONE DEFINITION, because five copies had already drifted. The footer's badge
 * was 15x15 with a 3px radius at 9px while every other one was 16x16 at 9.5px,
 * so the same deployment was a visibly different size in two places on the same
 * screen — and one copy had quietly lost the past-Z fallback the others kept.
 *
 * The letter ties a column, a graph node and a footer chip to the same
 * deployment, so it is the last thing that should differ between them.
 */

import { componentTheme } from '../componentTheme';

/** `A`, `B`, `C`… Past Z the index itself is the label; nobody compares 27 deployments. */
export function letterFor(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

export const LETTER_SX = {
  flex: 'none',
  width: 16,
  height: 16,
  borderRadius: '4px',
  display: 'grid',
  placeItems: 'center',
  fontFamily: componentTheme.fontMono,
  fontSize: 9.5,
  fontWeight: 700,
  color: componentTheme.fgOnEmphasis,
  background: componentTheme.fgDefault,
} as const;
