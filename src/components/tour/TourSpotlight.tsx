// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo } from 'react';

import Box from '@mui/material/Box';

import { SPOTLIGHT_PADDING_PX, SPOTLIGHT_RADIUS_PX } from './constants';
import { AnchorRect } from './types';

/**
 * The dim layer is a single path whose outer subpath is deliberately far larger
 * than any viewport, so the mask never has to know the window size and never
 * needs re-measuring on resize. The SVG clips it to its own box.
 */
const OUTER_SUBPATH = 'M-100000,-100000 H200000 V200000 H-100000 Z';

const roundedRectSubpath = (rect: AnchorRect, padding: number, radius: number): string => {
  const x = rect.left - padding;
  const y = rect.top - padding;
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));

  return [
    `M${x + r},${y}`,
    `H${x + width - r}`,
    `A${r},${r} 0 0 1 ${x + width},${y + r}`,
    `V${y + height - r}`,
    `A${r},${r} 0 0 1 ${x + width - r},${y + height}`,
    `H${x + r}`,
    `A${r},${r} 0 0 1 ${x},${y + height - r}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    'Z',
  ].join(' ');
};

interface TourSpotlightProps {
  /** Viewport rect of the highlighted element, or null while it is unresolved. */
  rect: AnchorRect | null;
  reducedMotion: boolean;
  /**
   * Opt-in dimming for a step where the ring alone does not draw enough
   * attention on a busy screen. Off by default: the ring is enough to point
   * at something without hiding whatever else the user might want to see, so
   * a step should only set this when it is genuinely needed.
   */
  dim?: boolean;
}

/**
 * Cuts a highlight ring over the anchor, with an optional (and, by default,
 * very light) dimming fill behind it.
 *
 * One `<svg>` with one even-odd-filled path rather than four positioned boxes:
 * a single path cannot leave seams between quadrants, animates as one unit, and
 * gives the cutout real rounded corners.
 *
 * `pointer-events: none` throughout — the hole must be genuinely clickable, not
 * a picture of a clickable thing.
 */
export const TourSpotlight = memo(({ rect, reducedMotion, dim }: TourSpotlightProps) => {
  if (!rect) return null;

  const d = `${OUTER_SUBPATH} ${roundedRectSubpath(rect, SPOTLIGHT_PADDING_PX, SPOTLIGHT_RADIUS_PX)}`;

  return (
    <Box
      component='svg'
      aria-hidden='true'
      focusable='false'
      sx={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {dim && (
        <path
          d={d}
          fillRule='evenodd'
          fill='rgba(0, 0, 0, 0.12)'
          style={reducedMotion ? undefined : { transition: 'fill 120ms ease-out' }}
        />
      )}
      <path
        d={roundedRectSubpath(rect, SPOTLIGHT_PADDING_PX, SPOTLIGHT_RADIUS_PX)}
        fill='none'
        stroke='var(--rust)'
        strokeWidth={2}
      />
    </Box>
  );
});

TourSpotlight.displayName = 'TourSpotlight';
