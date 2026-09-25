// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The image-change magnitude meter.
 *
 * Its own module so both the Releases tab's pairwise image rows and the
 * Configuration tab's N-deployment ones draw the same five glyphs. One
 * description of one fact: a meter that meant `mid` on one surface and
 * something else on the other would be worse than no meter.
 */

import { type ReactNode } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from './componentTheme';
import { type ImageMeterLevel } from './imageRef';

/**
 * Magnitude, on a channel that is not red/green — those already mean "before"
 * and "after" in every other row here, and a severity ramp over that channel
 * would collide with them.
 *
 * The five glyphs are static, so they are built once at module scope rather than
 * per row.
 */
const METER_BAR_HEIGHTS = [5, 8, 11] as const;

function meterBars(litCount: number, color: string): ReactNode {
  return METER_BAR_HEIGHTS.map((height, i) => (
    <Box
      key={i}
      component="span"
      sx={{
        width: 3,
        height,
        borderRadius: '1px',
        display: 'block',
        background: i < litCount ? color : componentTheme.borderEdge,
      }}
    />
  ));
}

const METER_FRAME_SX = {
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  gap: '1.5px',
  width: 14,
  height: 11,
} as const;

/**
 * A move with no rankable magnitude sits FLAT rather than borrowing the lowest
 * level, so the glyph reads as "cannot be ranked" instead of "small". A digest
 * move kept the tag it had, so it gets a shape rather than a level.
 */
export const METER_GLYPHS: Record<ImageMeterLevel, ReactNode> = {
  flat: (
    <Box component="span" sx={{ ...METER_FRAME_SX, opacity: 0.55 }}>
      {METER_BAR_HEIGHTS.map((_, i) => (
        <Box key={i} component="span" sx={{ width: 3, height: 5, borderRadius: '1px', display: 'block', background: componentTheme.fgSubtle }} />
      ))}
    </Box>
  ),
  low: <Box component="span" sx={METER_FRAME_SX}>{meterBars(1, componentTheme.fgSubtle)}</Box>,
  mid: <Box component="span" sx={METER_FRAME_SX}>{meterBars(2, componentTheme.fgMuted)}</Box>,
  high: <Box component="span" sx={METER_FRAME_SX}>{meterBars(3, componentTheme.attention)}</Box>,
  digest: (
    <Box component="span" sx={{ ...METER_FRAME_SX, alignItems: 'center' }}>
      <Box
        component="span"
        sx={{
          width: 8,
          height: 8,
          border: `1.5px solid ${componentTheme.attention}`,
          borderRadius: '1px',
          transform: 'rotate(45deg)',
          display: 'block',
        }}
      />
    </Box>
  ),
};
