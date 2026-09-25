// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { componentTheme } from './componentTheme';
import { NewValue } from './diffStyles';

// ============================================================================
// SHARED DIFF CONSTANTS
// ============================================================================

/** Section label color map for all diff variants. Includes 'data' variant used in tree views. */
export const SECTION_LABEL_COLORS = {
  upgrade: { color: componentTheme.upgrade, backgroundColor: componentTheme.upgradeMuted },
  apply: { color: componentTheme.accent, backgroundColor: componentTheme.accentMuted },
  gated: { color: componentTheme.attention, backgroundColor: componentTheme.attentionMuted },
  variation: { color: componentTheme.variation, backgroundColor: componentTheme.variationMuted },
  data: { color: componentTheme.fgMuted, backgroundColor: componentTheme.bgInset },
} as const;

/** Maps diff variant to the styled component used to render the "after" value. Currently all variants use NewValue. */
export const VAL_COMPONENTS = {
  upgrade: NewValue,
  apply: NewValue,
  gated: NewValue,
  variation: NewValue,
} as const;
