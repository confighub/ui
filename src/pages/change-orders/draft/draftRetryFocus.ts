// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** How many frames to wait for the read a retry starts to redraw its section (about ten seconds). */
const WAIT_FRAMES = 600;

/**
 * A retry that keeps the keyboard's place. The retry button stays while the read runs; when the
 * section redraws without it (the read answered), focus would fall to the page, so it goes to
 * `fallbackId` instead: the section's heading or result, focusable with `tabIndex={-1}`. A reader
 * who moved focus elsewhere in the meantime keeps it there.
 */
export function retryKeepingFocus(retry: () => void, fallbackId: string): () => void {
  return () => {
    const button = document.activeElement;
    retry();
    let frames = 0;
    const settle = () => {
      if (button instanceof HTMLElement && button.isConnected) {
        frames += 1;
        if (frames < WAIT_FRAMES) window.requestAnimationFrame(settle);
        return;
      }
      const active = document.activeElement;
      if (active !== null && active !== document.body) return;
      document.getElementById(fallbackId)?.focus({ preventScroll: true });
    };
    window.requestAnimationFrame(settle);
  };
}
