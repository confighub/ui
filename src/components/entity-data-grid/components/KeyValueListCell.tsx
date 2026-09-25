// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React, { useRef, useState, useLayoutEffect } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { useQuickFilter } from '../hooks/useQuickFilter';
import { highlightText } from '../utils/highlightText';

/**
 * Component to render a key-value pair with visual distinction
 */
const KeyValueLabel: React.FC<{ keyValue: string; filterValue: string }> = ({
  keyValue,
  filterValue,
}) => {
  // Split only on the first '=' to handle values that contain '='
  const firstEqualIndex = keyValue.indexOf('=');

  if (firstEqualIndex === -1) {
    // No '=' found, fallback to plain text
    return <>{highlightText(keyValue, filterValue)}</>;
  }

  const key = keyValue.substring(0, firstEqualIndex);
  const value = keyValue.substring(firstEqualIndex + 1);

  return (
    <Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
      <Typography
        component='span'
        variant='body2'
        sx={{
          fontWeight: 600,
          fontSize: '0.75rem',
        }}
      >
        {highlightText(key, filterValue)}
      </Typography>
      <Typography
        component='span'
        variant='body2'
        sx={{
          fontSize: '0.75rem',
          opacity: 0.7,
        }}
      >
        =
      </Typography>
      <Typography
        component='span'
        variant='body2'
        sx={{
          fontSize: '0.75rem',
        }}
      >
        {highlightText(value, filterValue)}
      </Typography>
    </Box>
  );
};

interface KeyValueListCellProps {
  /**
   * The string containing key-value pairs to display.
   * Expected format: "key=value, key2=value2, key3=value3"
   */
  value: string;
  /**
   * Number of items to display before showing "+N more" chip.
   * If set to 'auto', dynamically calculates based on available space.
   * @default 'auto'
   */
  visibleCount?: number | 'auto';
  /**
   * Separator used to split the value string into individual items.
   * @default ', '
   */
  separator?: string;
  /**
   * Minimum number of items to show when using 'auto' mode.
   * @default 1
   */
  minVisible?: number;
}

/**
 * A cell component that displays a list of key-value pairs with smart features:
 * - Dynamically fits as many items as possible in available space (default)
 * - Displays "+N more" chip for remaining items with tooltip
 * - Automatically sorts matching items to the top when searching
 * - Highlights matching text in yellow
 *
 * @example
 * {
 *   field: 'Arguments',
 *   headerName: 'Arguments',
 *   renderCell: (params) => (
 *     <KeyValueListCell value={params.row.Arguments} />
 *   )
 * }
 *
 * @example Fixed count
 * <KeyValueListCell value={params.row.Arguments} visibleCount={2} />
 */
export const KeyValueListCell: React.FC<KeyValueListCellProps> = ({
  value,
  visibleCount = 'auto',
  separator = ', ',
  minVisible = 1,
}) => {
  const filterValue = useQuickFilter();
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenChipsRef = useRef<HTMLDivElement>(null);
  const [calculatedVisibleCount, setCalculatedVisibleCount] = useState<number>(2);

  // Parse string into array
  const itemsArray = value ? value.split(separator).map((item) => item.trim()) : [];

  // Sort: matching items first when search is active
  const sortedItems = [...itemsArray].sort((a, b) => {
    if (!filterValue) return 0; // No filter, keep original order

    const aMatches = a.toLowerCase().includes(filterValue.toLowerCase());
    const bMatches = b.toLowerCase().includes(filterValue.toLowerCase());

    if (aMatches && !bMatches) return -1; // a comes first
    if (!aMatches && bMatches) return 1; // b comes first
    return 0; // Keep relative order
  });

  // Calculate how many chips can fit in the available space
  useLayoutEffect(() => {
    if (visibleCount !== 'auto' || !containerRef.current || !hiddenChipsRef.current) {
      return;
    }

    const calculateFit = () => {
      const container = containerRef.current;
      const hiddenChips = hiddenChipsRef.current;
      if (!container || !hiddenChips) return;

      const containerWidth = container.offsetWidth;
      const gap = 4; // 0.5 * 8px (MUI spacing unit)
      const plusChipWidth = 60; // Approximate width of "+N" chip

      let totalWidth = 0;
      let count = 0;

      const chips = Array.from(hiddenChips.children) as HTMLElement[];
      for (let i = 0; i < chips.length; i++) {
        const chipWidth = chips[i].offsetWidth + gap;
        const needsPlusChip = i < chips.length - 1;

        if (needsPlusChip) {
          // Check if this chip + "+N" chip would fit
          if (totalWidth + chipWidth + plusChipWidth + gap <= containerWidth) {
            totalWidth += chipWidth;
            count++;
          } else {
            break;
          }
        } else {
          // Last chip, no "+N" needed
          if (totalWidth + chipWidth <= containerWidth) {
            count++;
          }
        }
      }

      // Ensure we show at least minVisible chips
      count = Math.max(minVisible, count);

      setCalculatedVisibleCount(count);
    };

    // Initial calculation
    calculateFit();

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(calculateFit);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [value, visibleCount, minVisible, sortedItems]);

  if (!value) {
    return null;
  }

  const effectiveVisibleCount = visibleCount === 'auto' ? calculatedVisibleCount : visibleCount;
  const visibleItems = sortedItems.slice(0, effectiveVisibleCount);
  const remainingCount = sortedItems.length - effectiveVisibleCount;

  return (
    <>
      {/* Hidden chips for measurement (only in auto mode) */}
      {visibleCount === 'auto' && (
        <Box
          ref={hiddenChipsRef}
          sx={{
            position: 'absolute',
            visibility: 'hidden',
            pointerEvents: 'none',
            display: 'flex',
            gap: 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          {sortedItems.map((item, index) => (
            <Chip key={index} label={item} size='small' />
          ))}
        </Box>
      )}

      {/* Visible chips */}
      <Box ref={containerRef} sx={{ display: 'flex', gap: 0.5, flexWrap: 'nowrap', width: '100%' }}>
        {visibleItems.map((item, index) => (
          <Chip key={index} label={<KeyValueLabel keyValue={item} filterValue={filterValue} />} size='small' />
        ))}
        {remainingCount > 0 && (
          <Tooltip title={sortedItems.slice(effectiveVisibleCount).join(separator)} arrow>
            <Chip label={`+${remainingCount}`} size='small' />
          </Tooltip>
        )}
      </Box>
    </>
  );
};
