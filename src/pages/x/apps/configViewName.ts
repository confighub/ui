// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConfigViewName } from '@/types/analytics';

import type { PaneViewMode } from './ComponentToolbar';

/** The analytics name of each view of the drawer: the word a person sees, not the mode's code name. */
export const CONFIG_VIEW_NAME: Record<PaneViewMode, ConfigViewName> = {
  diff: 'sheet',
  source: 'code',
  overview: 'stacked',
};
