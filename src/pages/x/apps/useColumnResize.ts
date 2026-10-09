// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useState, type CSSProperties } from 'react';

const MIN_WIDTH_PX = 60;

/**
 * Until a divider is dragged, the key column is as wide as its widest key
 * (`--key-col-width`, which `TreeDiffSection` measures on its own container) and
 * the two value columns share the rest equally. A fixed split left values
 * wrapping beside an empty key column.
 */
const AUTO_COL1 = 'var(--key-col-width, 40%)';
const AUTO_COL2 = `calc((100% - ${AUTO_COL1}) / 2)`;

export interface ColumnResizeState {
  columnStyle: CSSProperties;
  onDividerMouseDown: (columnIndex: 0 | 1, e: React.MouseEvent) => void;
  isDragging: boolean;
}

/** Manages 3 column widths as pixel-based CSS variables, with draggable dividers between columns. */
export function useColumnResize(): ColumnResizeState {
  const [col1Width, setCol1Width] = useState<number | null>(null);
  const [col2Width, setCol2Width] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onDividerMouseDown = useCallback((columnIndex: 0 | 1, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);

    const startX = e.clientX;
    const divider = e.currentTarget as HTMLElement;
    const container = divider.closest('[data-diff-columns]') as HTMLElement | null;
    const containerWidth = container?.offsetWidth ?? 400;

    // Both widths are set together on the first drag, so they are either both
    // pixels or both automatic. When automatic, the second divider sits at
    // col1 + (width - col1) / 2, from which col1 follows.
    const startCol1 = col1Width ?? (columnIndex === 0 ? divider.offsetLeft : 2 * divider.offsetLeft - containerWidth);
    const startCol2 = col2Width ?? (containerWidth - startCol1) / 2;
    const startWidthRef = { col1: startCol1, col2: startCol2 };
    setCol1Width(startCol1);
    setCol2Width(startCol2);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;

      if (columnIndex === 0) {
        // Col1 must leave room for col2 + col3
        const maxCol1 = containerWidth - startWidthRef.col2 - MIN_WIDTH_PX;
        const newCol1 = Math.min(maxCol1, Math.max(MIN_WIDTH_PX, startWidthRef.col1 + delta));
        setCol1Width(newCol1);
      } else {
        // Col2 must leave room for col3
        const maxCol2 = containerWidth - startWidthRef.col1 - MIN_WIDTH_PX;
        const newCol2 = Math.min(maxCol2, Math.max(MIN_WIDTH_PX, startWidthRef.col2 + delta));
        setCol2Width(newCol2);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [col1Width, col2Width]);

  const columnStyle: CSSProperties = {
    '--col1-width': col1Width != null ? `${col1Width}px` : AUTO_COL1,
    '--col2-width': col2Width != null ? `${col2Width}px` : AUTO_COL2,
  } as CSSProperties;

  return { columnStyle, onDividerMouseDown, isDragging };
}
