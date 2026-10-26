// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { StatusKind } from '../model/types';

/**
 * The colours of the row panel of a Unit, as theme palette names, so the
 * panel matches the table's status chips: Unreleased is amber (`warning`),
 * Upgrade available purple (`secondary`), Released green (`success`). A gate
 * that fails is the design system's gated amber (`warning`) too: its text and
 * its own line tell it from Unreleased, not its hue. A failed action or a
 * withheld change is red (`error`). Status never uses the brand colour
 * (`primary`), which marks the one primary action and the fix links.
 */

export type Tone = 'blocked' | 'gated' | 'attention' | 'upgrade' | 'ok' | 'info' | 'muted';

export type PaletteName = 'error' | 'warning' | 'secondary' | 'success' | 'info';

/** The palette of a tone; `muted` is grey, which is no palette. */
export const TONE_PALETTE: Record<Tone, PaletteName | null> = {
  blocked: 'error',
  gated: 'warning',
  attention: 'warning',
  upgrade: 'secondary',
  ok: 'success',
  info: 'info',
  muted: null,
};

/** The dot of each status the group counts, as the table's chips. */
export const STATUS_TONE: Record<StatusKind, Tone> = {
  unreleased: 'attention',
  upgradable: 'upgrade',
  released: 'ok',
  untargeted: 'muted',
};

/** The mark before a cause or a fact; drawn in the tone's colour. */
export const TONE_MARK: Record<Tone, string> = {
  blocked: '!',
  gated: '!',
  attention: '●',
  upgrade: '↑',
  ok: '✓',
  info: '●',
  muted: '–',
};
