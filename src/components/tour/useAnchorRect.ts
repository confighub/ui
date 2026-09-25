// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { AnchorRect } from './types';

/** Sub-pixel jitter must not trigger a re-render. */
const EPSILON_PX = 0.5;

const sameRect = (a: AnchorRect | null, b: AnchorRect | null): boolean => {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < EPSILON_PX &&
    Math.abs(a.left - b.left) < EPSILON_PX &&
    Math.abs(a.width - b.width) < EPSILON_PX &&
    Math.abs(a.height - b.height) < EPSILON_PX
  );
};

/**
 * Track an element's viewport rect on every animation frame.
 *
 * A frame loop rather than ResizeObserver/IntersectionObserver because the
 * cases that matter here move the element without resizing it or crossing a
 * threshold: reactflow pans and zooms by mutating a CSS transform on
 * `.react-flow__viewport`, and the app relayouts on its 5s poll. Neither fires
 * a resize event, but both change `getBoundingClientRect()`.
 *
 * Frames are throttled to zero in a background tab, so the loop is free while
 * the user is elsewhere — the same reasoning as `usePolling`'s visibility gate.
 */
export const useAnchorRect = (element: HTMLElement | null): AnchorRect | null => {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!element) {
      setRect(null);
      return;
    }

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const box = element.getBoundingClientRect();
      const next: AnchorRect = {
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
      };
      setRect((previous) => (sameRect(previous, next) ? previous : next));
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [element]);

  return rect;
};
