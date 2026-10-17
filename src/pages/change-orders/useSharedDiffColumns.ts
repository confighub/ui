// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo, type CSSProperties } from 'react';

import type { ConfigDiffColumns } from '@/components/config-diff/ConfigDiffView';
import { useColumnResize } from '../x/apps/useColumnResize';

export interface SharedDiffColumns {
  /** For `ConfigDiffView`. */
  columns: ConfigDiffColumns;
  /** The same widths, for `TreeDiffSection`'s own props. */
  columnStyle: CSSProperties;
  onDividerMouseDown: ConfigDiffColumns['onDividerMouseDown'];
  isDragging: boolean;
}

/**
 * ONE column model for every diff on a page, as `ReleaseDiffPanel` and
 * `ComponentActivityFeed` have it: the diffs stay aligned down the page, and
 * dragging any one divider rebalances all of them at once.
 *
 * `useColumnResize` rebuilds `columnStyle` as a fresh object on every render,
 * which would defeat the memo of every diff on the page, so it is rebuilt here
 * only when a width changes.
 */
export function useSharedDiffColumns(): SharedDiffColumns {
  const { columnStyle, onDividerMouseDown, isDragging } = useColumnResize();
  const col1 = (columnStyle as Record<string, string>)['--col1-width'];
  const col2 = (columnStyle as Record<string, string>)['--col2-width'];
  const stableColumnStyle = useMemo(() => ({ '--col1-width': col1, '--col2-width': col2 }) as CSSProperties, [col1, col2]);
  return useMemo(
    () => ({
      columns: { columnStyle: stableColumnStyle, onDividerMouseDown, isDragging },
      columnStyle: stableColumnStyle,
      onDividerMouseDown,
      isDragging,
    }),
    [stableColumnStyle, onDividerMouseDown, isDragging],
  );
}
