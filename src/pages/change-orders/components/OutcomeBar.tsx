// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

import { changeOrderInk, changeOrderShape, changeOrderType } from '../changeOrdersTokens';
import { OUTCOME_META, type OutcomeBarSegment } from './outcomeMeta';

export interface OutcomeBarProps {
  segments: readonly OutcomeBarSegment[];
  /** Thickness in px. The stage card's bar is 10; a rail node's is thinner. */
  height?: number;
  sx?: SxProps<Theme>;
}

/** The segmented outcome bar: one segment per outcome, as wide as its share of the variants. */
export function OutcomeBar({ segments, height = 10, sx }: OutcomeBarProps) {
  return (
    <Box
      sx={[
        { display: 'flex', height, borderRadius: `${changeOrderShape.radius.sm}px`, overflow: 'hidden', gap: '2px' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {segments.map((segment) => (
        <Box
          key={segment.kind}
          sx={{
            flexGrow: segment.count,
            flexBasis: 0,
            background: OUTCOME_META[segment.kind].tone,
          }}
        />
      ))}
    </Box>
  );
}

export interface OutcomeLegendProps {
  segments: readonly OutcomeBarSegment[];
}

/** The bar's key: each outcome's swatch, its count and its name. */
export function OutcomeLegend({ segments }: OutcomeLegendProps) {
  return (
    <Box sx={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
      {segments.map((segment) => (
        <Box key={segment.kind} sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: `${changeOrderShape.radius.xs}px`,
              background: OUTCOME_META[segment.kind].tone,
              marginRight: '6px',
            }}
          />
          <b style={{ color: changeOrderInk.default }}>{segment.count}</b>{' '}
          {OUTCOME_META[segment.kind].label}
        </Box>
      ))}
    </Box>
  );
}

export interface OutcomeBreakdownProps {
  segments: readonly OutcomeBarSegment[];
  /** Every variant of the stage, unknown included: what the group's name counts. */
  variantCount: number;
  /** Notes qualifying the counts, under the legend. */
  children?: ReactNode;
}

/**
 * A stage's outcome at a glance: the bar, its legend, and whatever qualifies
 * the counts. Drawn only for two or more comparable outcomes; with one there is
 * no proportion to show, and the card below already says it.
 */
export function OutcomeBreakdown({ segments, variantCount, children }: OutcomeBreakdownProps) {
  return (
    <Box role="group" aria-label={`Outcome across ${variantCount} variants`} sx={{ marginBottom: '14px' }}>
      <OutcomeBar segments={segments} />
      <OutcomeLegend segments={segments} />
      {children}
    </Box>
  );
}
