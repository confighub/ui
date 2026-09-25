// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useRef } from 'react';

import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

interface PaneResizeHandleProps {
  /**
   * Called once when the user starts dragging. Use this to capture the
   * starting width and prepare any DOM-driven width tracking.
   */
  onResizeStart?: () => void;
  /**
   * Called with the cursor delta since the previous emission. Coalesced via
   * `requestAnimationFrame` so callers receive at most one update per frame
   * even when the browser fires multiple `mousemove` events between paints.
   */
  onResize: (delta: number) => void;
  /**
   * Called once when the user releases the mouse. Use this to commit the
   * final width to React state / persistence.
   */
  onResizeEnd?: () => void;
}

const Handle = styled(Box)(({ theme }) => ({
  width: 4,
  cursor: 'col-resize',
  flexShrink: 0,
  position: 'relative',
  zIndex: 1,
  '&::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 1,
    width: 2,
    backgroundColor: 'transparent',
    transition: 'background-color 150ms',
  },
  '&:hover::after': {
    backgroundColor: theme.palette.primary.main,
  },
}));

export function PaneResizeHandle({ onResizeStart, onResize, onResizeEnd }: PaneResizeHandleProps) {
  const lastXRef = useRef(0);
  const pendingDeltaRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      lastXRef.current = e.clientX;
      pendingDeltaRef.current = 0;
      onResizeStart?.();

      const flush = () => {
        rafIdRef.current = null;
        const delta = pendingDeltaRef.current;
        pendingDeltaRef.current = 0;
        if (delta !== 0) onResize(delta);
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - lastXRef.current;
        lastXRef.current = moveEvent.clientX;
        pendingDeltaRef.current += delta;
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(flush);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        // Flush any delta queued for the next frame so the parent ends with
        // the cursor's final position before we signal end-of-drag.
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        const remaining = pendingDeltaRef.current;
        pendingDeltaRef.current = 0;
        if (remaining !== 0) onResize(remaining);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        onResizeEnd?.();
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize, onResizeStart, onResizeEnd],
  );

  return <Handle onMouseDown={handleMouseDown} />;
}
