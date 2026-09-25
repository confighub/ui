// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which fields the grid shows.
 *
 * ONE DEFINITION OF DIFFERING, NAMED ON THE CONTROL ITSELF: a field appears
 * when the deployments do not all agree, including when some set it and
 * others do not. There is no reference column to differ FROM — every column
 * is read against the others — so there is nothing left to pick a rule about.
 */

import { type ReactElement } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from '../componentTheme';

export type CompareFieldFilter = 'differing' | 'all';

export interface CompareFilterStripProps {
  filter: CompareFieldFilter;
  onFilterChange: (next: CompareFieldFilter) => void;
  differingCount: number;
  totalCount: number;
  /**
   * Rows that could not be checked against every deployment.
   *
   * Rendered beside the Differing count rather than folded into it. `Differing 0`
   * on its own means "nothing differs", and that is a claim the comparison
   * cannot make while a deployment is mute — so the count keeps its meaning and
   * this stands next to it saying what the count does not cover.
   */
  unverifiableCount?: number;
  /**
   * True while any deployment's configuration is still arriving.
   *
   * Every count here is derived from what has been read, so while this is true
   * they are all provisional and none may be printed as a number: `Differing 0`
   * is a statement about the configuration, and the pane has not seen it yet.
   */
  isLoading?: boolean;
  /** A caveat about the comparison itself, e.g. a list that could only be aligned by position. */
  note?: string;
}

const STRIP_SX = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '7px 11px',
  background: componentTheme.bgDefault,
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
} as const;

const SEGMENTED_SX = {
  display: 'inline-flex',
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: `${componentTheme.radiusSm}px`,
  overflow: 'hidden',
  background: componentTheme.bgDefault,
} as const;

const SEGMENT_SX = {
  border: 0,
  background: 'none',
  fontFamily: 'inherit',
  fontSize: 11.5,
  fontWeight: 600,
  color: componentTheme.fgMuted,
  padding: '3px 10px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  '& + &': { borderLeft: `1px solid ${componentTheme.borderDefault}` },
  '&[aria-pressed="true"]': {
    background: componentTheme.accentMuted,
    color: componentTheme.accentEmphasis,
  },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '-2px' },
} as const;

const COUNT_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 10,
  fontWeight: 600,
  color: componentTheme.fgSubtle,
  '[aria-pressed="true"] > &': { color: componentTheme.accentEmphasis },
} as const;

export function CompareFilterStrip({
  filter,
  onFilterChange,
  differingCount,
  totalCount,
  unverifiableCount = 0,
  isLoading = false,
  note,
}: CompareFilterStripProps): ReactElement {
  // Unverifiable rows are shown by the Differing filter too, so they are not
  // part of what it hid.
  const hidden = isLoading ? 0 : filter === 'differing' ? totalCount - differingCount - unverifiableCount : 0;
  // An em-dash rather than a zero: the count is unknown, and zero is an answer.
  const countText = (value: number) => (isLoading ? '—' : String(value));

  return (
    <Box sx={STRIP_SX} data-testid="compare-filter-strip">
      <Box sx={SEGMENTED_SX} role="group" aria-label="Which fields to show">
        <Box
          component="button"
          type="button"
          data-testid="compare-filter-differing"
          aria-pressed={filter === 'differing'}
          onClick={() => onFilterChange('differing')}
          title="A field appears when the deployments do not all agree, including when some set it and others do not."
          sx={SEGMENT_SX}
        >
          Differing
          <Box component="span" sx={COUNT_SX}>{countText(differingCount)}</Box>
        </Box>
        <Box
          component="button"
          type="button"
          data-testid="compare-filter-all"
          aria-pressed={filter === 'all'}
          onClick={() => onFilterChange('all')}
          sx={SEGMENT_SX}
        >
          All fields
          <Box component="span" sx={COUNT_SX}>{countText(totalCount)}</Box>
        </Box>
      </Box>

      {unverifiableCount > 0 && !isLoading ? (
        <Box
          component="span"
          data-testid="compare-unverifiable-count"
          title="These fields could not be compared against every deployment, so they are neither agreements nor differences."
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: componentTheme.attentionEmphasis,
            background: componentTheme.attentionMuted,
            border: `1px solid ${componentTheme.attention}`,
            borderRadius: `${componentTheme.radiusSm}px`,
            padding: '2px 6px',
            flex: 'none',
          }}
        >
          {unverifiableCount} unchecked
        </Box>
      ) : null}

      {hidden > 0 ? (
        <Box
          component="span"
          data-testid="compare-filter-hidden"
          sx={{ fontSize: 11, color: componentTheme.fgSubtle }}
        >
          {hidden} hidden
        </Box>
      ) : null}

      {note ? (
        <Box
          component="span"
          data-testid="compare-filter-note"
          sx={{
            marginLeft: 'auto',
            fontSize: 10.5,
            color: isLoading ? componentTheme.fgMuted : componentTheme.attention,
          }}
        >
          {note}
        </Box>
      ) : null}
    </Box>
  );
}
