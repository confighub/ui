// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useRef, useState } from 'react';

/**
 * Whether an element is out of the viewport, live: true while none of it shows. Observed
 * through a callback ref, so the observer comes and goes with the element and no effect is
 * needed. Before the element has mounted, and before the first answer, it reads as in view.
 *
 * @param rootMargin Shrinks the viewport first: `-48px 0px 0px 0px` counts what sits under a 48px bar as out of view.
 */
export function useOutOfView<T extends Element>(rootMargin = '0px') {
  const [outOfView, setOutOfView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (node === null) {
      setOutOfView(false);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry !== undefined) setOutOfView(!entry.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(node);
    observerRef.current = observer;
  }, [rootMargin]);
  return [ref, outOfView] as const;
}
