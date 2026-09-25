// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode } from 'react';

import Box from '@mui/material/Box';

/**
 * Bolds the command verb of an instruction — "Click", "Type", "Select" — so
 * the action word itself stands out. Pair with `TourCue` for the thing the
 * verb acts on: `<TourCommand>Click</TourCommand> <TourCue>New component</TourCue>`.
 * Plain bold, not rust — rust is reserved for the actual click target so the
 * two roles read as visually distinct at a glance, not just two bold words.
 */
export const TourCommand = ({ children }: { children: ReactNode }) => (
  <Box component='span' sx={{ fontWeight: 700 }}>
    {children}
  </Box>
);

/**
 * Marks the exact label of the element a step wants clicked, typed into, or
 * selected — rust, and quoted, so it reads unambiguously as "this literal
 * thing on screen" rather than as emphasis on ordinary prose. The quotes are
 * added here, not typed by callers, so every step gets them consistently:
 * `<TourCue>New component</TourCue>` renders as rust `'New component'`.
 */
export const TourCue = ({ children }: { children: ReactNode }) => (
  <Box component='span' sx={{ color: 'primary.main', fontWeight: 700 }}>
    '{children}'
  </Box>
);
