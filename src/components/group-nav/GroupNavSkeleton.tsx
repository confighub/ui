// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

/**
 * Widths of the placeholder label bars for the group rows, as a percentage of
 * the row's label track. Deliberately uneven so the stack reads as a list of
 * real group names rather than a barcode.
 */
const GROUP_LABEL_WIDTHS = ['62%', '48%', '70%', '54%'] as const;

/** Width of the `iconContainer` slot in `StyledTreeItem` (holds the chevron). */
const ICON_CONTAINER_WIDTH = 20;

/** Size of the leading `SelectAllIcon` on the real "All" row (`fontSize='small'`). */
const ALL_ROW_ICON_SIZE = 20;

/** Size of the leading field icon on the real group rows (`fontSize: 15`). */
const GROUP_ROW_ICON_SIZE = 15;

interface SkeletonRowProps {
  /** Size of the leading icon placeholder, in px. */
  iconSize: number;
  /** Width of the label placeholder — any CSS width value. */
  labelWidth: string;
}

/**
 * One placeholder row shaped like a `StyledTreeItem`. The geometry is copied
 * from `GroupNavPanel`'s `StyledTreeItem`/`ItemLabel`/`CountBadge` styles —
 * `theme.spacing(0.75, 1)` content padding, a 20px icon container, a 4px label
 * inset, a 6px gap, and `body2` typography for the label track — so real rows
 * drop in at exactly the same height with no layout shift.
 */
function SkeletonRow({ iconSize, labelWidth }: SkeletonRowProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.75, mb: '2px' }}>
      {/* Chevron slot — left empty; it reads as indentation. */}
      <Box sx={{ width: ICON_CONTAINER_WIDTH, flexShrink: 0 }} />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flex: 1,
          minWidth: 0,
          pl: '4px',
          // Drives the height of the `variant='text'` skeleton so it matches the
          // Typography body2 line box of a real row.
          typography: 'body2',
        }}
      >
        <Skeleton
          variant='rounded'
          width={iconSize}
          height={iconSize}
          sx={{ flexShrink: 0, borderRadius: 'var(--r-sm)' }}
        />
        <Skeleton variant='text' width={labelWidth} sx={{ flexShrink: 0 }} />
        {/* Count badge — matches CountBadge's 0.7rem text, right-aligned. */}
        <Skeleton
          variant='rounded'
          width={16}
          height={10}
          sx={{ ml: 'auto', flexShrink: 0, borderRadius: 'var(--r-pill)' }}
        />
      </Box>
    </Box>
  );
}

interface GroupNavSkeletonProps {
  /** Number of placeholder group rows below the "All" row. */
  rowCount?: number;
}

/**
 * Content-shaped loading state for {@link GroupNavPanel}'s tree body: an "All"
 * row followed by a handful of depth-0 group rows. Replaces the old centered
 * spinner so the panel keeps its shape while the units query resolves.
 */
export function GroupNavSkeleton({
  rowCount = GROUP_LABEL_WIDTHS.length,
}: GroupNavSkeletonProps) {
  return (
    <Box role='status' aria-busy='true' aria-label='Loading grouped units'>
      <SkeletonRow iconSize={ALL_ROW_ICON_SIZE} labelWidth='15%' />
      {GROUP_LABEL_WIDTHS.slice(0, rowCount).map((width, i) => (
        <SkeletonRow key={i} iconSize={GROUP_ROW_ICON_SIZE} labelWidth={width} />
      ))}
    </Box>
  );
}
