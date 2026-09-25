// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { isMeasurable, resolveAnchor } from './anchor';
import { ANCHOR_RESOLVE_TIMEOUT_MS } from './constants';
import { Anchor } from './types';

export type AnchorResolution =
  | { status: 'idle'; element: null }
  | { status: 'resolving'; element: null }
  | { status: 'resolved'; element: HTMLElement }
  | { status: 'missing'; element: null };

// Shared singletons: returning the same object reference lets React bail out of
// the re-render, so the per-frame setState below costs nothing while nothing
// has actually changed.
const IDLE: AnchorResolution = { status: 'idle', element: null };
const RESOLVING: AnchorResolution = { status: 'resolving', element: null };
const MISSING: AnchorResolution = { status: 'missing', element: null };

/**
 * Resolve a step's anchor, retrying on every animation frame until the element
 * exists or the timeout expires.
 *
 * Polling continues after a successful resolve: React re-renders routinely swap
 * the underlying DOM node (a virtualised grid row, a remounted flow node), and
 * the caller needs the current node, not the one that existed at step entry.
 *
 * Animation frames stop firing in a background tab, so the timeout budget is
 * reset whenever the document is hidden — otherwise a user who tabs away for
 * ten seconds returns to a step that "gave up" without ever having looked.
 */
export const useAnchorElement = (
  anchor: Anchor | null,
  timeoutMs: number = ANCHOR_RESOLVE_TIMEOUT_MS,
): AnchorResolution => {
  const [resolution, setResolution] = useState<AnchorResolution>(IDLE);

  useEffect(() => {
    if (!anchor) {
      setResolution(IDLE);
      return;
    }

    setResolution(RESOLVING);

    let frame = 0;
    let deadline = performance.now() + timeoutMs;
    let lastElement: HTMLElement | null = null;

    const tick = () => {
      frame = requestAnimationFrame(tick);

      const element = resolveAnchor(anchor);
      if (isMeasurable(element)) {
        // Refresh the budget so a later disappearance gets its own full window.
        deadline = performance.now() + timeoutMs;
        if (element !== lastElement) {
          lastElement = element;
          setResolution({ status: 'resolved', element });
        }
        return;
      }

      lastElement = null;
      if (document.hidden) deadline = performance.now() + timeoutMs;
      const expired = performance.now() > deadline;
      setResolution((previous) => {
        const next = expired ? MISSING : RESOLVING;
        return previous === next ? previous : next;
      });
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [anchor, timeoutMs]);

  return resolution;
};
