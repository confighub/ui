// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Scrolls a field's row to the top of the side pane, just below the Unit card's sticky header,
// with its details under it (PLAN.md R5). The row gets a scroll-margin of the header's measured
// height (the header sticks 8px above the list's padding edge, so its height leaves an 8px gap),
// and the browser's own scrollIntoView keeps it out from under the header. Retries for a few frames
// while the tree is still drawing.
import { type RefObject, useEffect } from 'react';

const MAX_FRAMES = 30;

/**
 * @param hostRef the details' box; the row is the element just before it
 * @param revealKey a new value scrolls again (the router's location key)
 * @param active the URL focuses this field
 */
export function useFieldReveal(hostRef: RefObject<HTMLElement | null>, revealKey: string, active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    let frames = 0;
    let handle = 0;
    const reveal = () => {
      const row = hostRef.current?.previousElementSibling;
      if (row instanceof HTMLElement && row.isConnected && row.offsetParent !== null) {
        const header = row.closest('[data-testid="unit-card"]')?.querySelector<HTMLElement>('[data-testid="unit-header"]');
        row.style.scrollMarginTop = `${header?.offsetHeight ?? 0}px`;
        row.scrollIntoView({ block: 'start' });
        return;
      }
      if (frames++ < MAX_FRAMES) handle = requestAnimationFrame(reveal);
    };
    handle = requestAnimationFrame(reveal);
    return () => cancelAnimationFrame(handle);
  }, [hostRef, revealKey, active]);
}
