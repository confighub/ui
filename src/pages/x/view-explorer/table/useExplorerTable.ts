// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  type ColumnSizingState,
  type Updater,
  columnOrderingFeature,
  columnResizingFeature,
  type columnResizingState,
  columnSizingFeature,
  createColumnHelper,
  functionalUpdate,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';

import type { EntityRow } from '../model/fields';

/**
 * The table's columns: order, widths and resizing. This is the View Explorer's
 * only import of `@tanstack/react-table`; the list consoles' sortable table
 * (`components/console-table/`) is the other. A change of its major version
 * stays in those two places.
 *
 * TanStack lays out the columns only. Rows and group headers come from the
 * view's derived rows and `model/grouping.ts` (shared with the other layouts)
 * and are drawn by one virtual list, so the table is given no data.
 */

const features = tableFeatures({ columnSizingFeature, columnResizingFeature, columnOrderingFeature });
const helper = createColumnHelper<typeof features, EntityRow>();
const NO_DATA: EntityRow[] = [];

export const MIN_COLUMN_WIDTH = 72;
export const MAX_COLUMN_WIDTH = 640;
/** A drag shorter than this is a click on the edge, not a resize. */
const MIN_RESIZE_MOVE = 2;

const IDLE_RESIZING: columnResizingState = {
  startOffset: null,
  startSize: null,
  deltaOffset: null,
  deltaPercentage: null,
  isResizingColumn: false,
  columnSizingStart: [],
};

export interface TableColumnInput {
  name: string;
  /** The width saved in the view, else the field's default. */
  width: number;
}

export interface ExplorerColumn {
  name: string;
  /** The width now, including a resize that is in progress. */
  width: number;
  isResizing: boolean;
  /** Start a resize from a mouse or touch event on the column's edge. */
  onResizeStart: (event: unknown) => void;
}

export interface ExplorerTableColumns {
  columns: ExplorerColumn[];
  totalWidth: number;
  isResizing: boolean;
  /** Change a column's width on screen by `delta` pixels (arrow keys on its edge). */
  nudge: (name: string, delta: number) => void;
  /** Commit the width set by `nudge`, as one step. */
  commitNudge: (name: string) => void;
}

/**
 * @param inputs the visible columns in order, with their widths
 * @param onResizeEnd called once when a resize ends, with the new width
 */
export function useExplorerTable(
  inputs: readonly TableColumnInput[],
  onResizeEnd: (name: string, width: number) => void,
): ExplorerTableColumns {
  const columnDefs = useMemo(
    () =>
      inputs.map((c) =>
        helper.display({ id: c.name, header: c.name, size: c.width, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH }),
      ),
    [inputs],
  );
  const columnOrder = useMemo(() => inputs.map((c) => c.name), [inputs]);
  const savedSizing = useMemo<ColumnSizingState>(() => Object.fromEntries(inputs.map((c) => [c.name, c.width])), [inputs]);

  // The width being dragged lives here until the drag ends; then it goes to
  // the view (one undo step) and this is cleared. The refs follow the latest
  // value between renders, because TanStack calls these handlers on every
  // pointer move.
  const [liveSizing, setLiveSizing] = useState<ColumnSizingState>({});
  const [resizing, setResizing] = useState<columnResizingState>(IDLE_RESIZING);
  const liveRef = useRef<ColumnSizingState>({});
  const resizingRef = useRef<columnResizingState>(IDLE_RESIZING);
  const columnSizing = useMemo(() => ({ ...savedSizing, ...liveSizing }), [savedSizing, liveSizing]);

  const onColumnSizingChange = useCallback(
    (updater: Updater<ColumnSizingState>) => {
      const next = functionalUpdate(updater, { ...savedSizing, ...liveRef.current });
      liveRef.current = next;
      setLiveSizing(next);
    },
    [savedSizing],
  );

  const onColumnResizingChange = useCallback(
    (updater: Updater<columnResizingState>) => {
      const prev = resizingRef.current;
      const next = functionalUpdate(updater, prev);
      resizingRef.current = next;
      setResizing(next);
      const ended = prev.isResizingColumn;
      if (ended && !next.isResizingColumn) {
        const width = liveRef.current[ended];
        const start = prev.startSize ?? savedSizing[ended];
        liveRef.current = {};
        setLiveSizing({});
        // A click on the edge (or a move of a pixel) is not a resize, and must not make a draft.
        if (typeof width === 'number' && (typeof start !== 'number' || Math.abs(width - start) >= MIN_RESIZE_MOVE)) onResizeEnd(ended, width);
      }
    },
    [onResizeEnd, savedSizing],
  );

  // Keyboard resizing: arrow keys change the width on screen; the key's release commits it as one step.
  const nudge = useCallback(
    (name: string, delta: number) => {
      const base = liveRef.current[name] ?? savedSizing[name] ?? MIN_COLUMN_WIDTH;
      const width = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, base + delta));
      liveRef.current = { ...liveRef.current, [name]: width };
      setLiveSizing(liveRef.current);
    },
    [savedSizing],
  );
  const commitNudge = useCallback(
    (name: string) => {
      const width = liveRef.current[name];
      liveRef.current = {};
      setLiveSizing({});
      if (typeof width === 'number' && width !== savedSizing[name]) onResizeEnd(name, width);
    },
    [onResizeEnd, savedSizing],
  );

  const table = useTable({
    features,
    columns: columnDefs,
    data: NO_DATA,
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    state: { columnSizing, columnResizing: resizing, columnOrder },
    onColumnSizingChange,
    onColumnResizingChange,
  });

  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const columns: ExplorerColumn[] = headers.map((h) => ({
    name: h.column.id,
    width: h.getSize(),
    isResizing: h.column.getIsResizing(),
    onResizeStart: h.getResizeHandler(),
  }));
  return { columns, totalWidth: table.getTotalSize(), isResizing: resizing.isResizingColumn !== false, nudge, commitNudge };
}
