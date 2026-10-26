// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { alpha, type Theme } from '@mui/material/styles';

import { TONE_PALETTE, type Tone } from '../tones';

/** The colour of a tone; grey for `muted`. */
export function toneColor(theme: Theme, tone: Tone): string {
  const name = TONE_PALETTE[tone];
  return name ? theme.palette[name].main : theme.palette.grey[400];
}

/** Tinted by a status, for the verdict box and a blocking line. */
export const tint = (theme: Theme, tone: Tone, strength: 'bg' | 'border') => {
  const name = TONE_PALETTE[tone];
  if (!name || tone === 'info') return strength === 'bg' ? 'transparent' : theme.palette.grey[200];
  return strength === 'bg' ? theme.palette[name].light : alpha(theme.palette[name].main, 0.24);
};
