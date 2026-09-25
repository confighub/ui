// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';

/**
 * Tracks whether an element has scrolled into (or near) the viewport, using
 * IntersectionObserver. This is a one-shot "seen it" trigger for lazily
 * kicking off data loading for a row — not a live visibility toggle: once the
 * element has intersected once, the observer disconnects and the returned
 * flag stays `true` for the lifetime of the component.
 *
 * @param rootMargin - IntersectionObserver rootMargin, e.g. `'400px 0px'` to
 * trigger before the element is actually on-screen. Pass a stable string
 * (module-level constant or a value that doesn't change across renders) —
 * changing it re-creates the observer.
 * @returns `[ref, hasBeenInView]` — attach `ref` to the target element.
 */
export const useInViewport = <T extends Element>(rootMargin = '0px') => {
  const [hasBeenInView, setHasBeenInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: T | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (node) {
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setHasBeenInView(true);
            observer.disconnect();
          }
        }, { rootMargin });
        observer.observe(node);
        observerRef.current = observer;
      }
    },
    [rootMargin],
  );

  return [ref, hasBeenInView] as const;
};
