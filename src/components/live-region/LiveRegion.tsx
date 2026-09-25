// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A polite screen-reader announcement region.
 *
 * EXTRACTED FROM `pages/x/apps/ReleaseLane.tsx`, NOT REWRITTEN. That
 * implementation had three fixes in it that a fresh one looks equivalent
 * without, and all three are behaviours rather than styling — invisible in a
 * screenshot, invisible in a diff, audible only to the person who has no other
 * way to read the page. They are listed below because the whole reason this
 * file exists is so nobody has to rediscover them a third time.
 *
 * ⚠️ ALL THREE LIVE IN HERE, NOT IN THE CALLER. That is deliberate. Handing a
 * caller a hook and trusting it to debounce, guard the mount and key on a
 * stable value is exactly how the second copy lost them. A caller passes a
 * string; it cannot opt out of the behaviour, and it cannot get it subtly wrong.
 *
 *  1. **KEYED ON THE STRING'S VALUE, NEVER ON AN OBJECT.** The effect below
 *     depends on `message` itself, so a parent that re-renders — rebuilding
 *     arrays, recomputing props — announces nothing unless the WORDS changed.
 *     Keyed on anything with identity instead, a live region repeats itself on
 *     every parent render, which reads as a stutter to a screen-reader user and
 *     is silent to everyone else.
 *
 *  2. **DEBOUNCED.** Two rapid changes are one utterance, not two interrupting
 *     each other. `aria-live="polite"` queues rather than interrupts, so
 *     undebounced bursts do not get dropped — they get read out, all of them,
 *     after the user has moved on.
 *
 *  3. **SILENT ON MOUNT.** The first value is skipped. A live region that
 *     announces as it appears reads the page aloud at someone who has just
 *     arrived and has not asked for anything — worse than having no live region
 *     at all, because it is noise that arrives before any action.
 *
 * Announce only what a user's own action changed. This is not a place to
 * narrate the page.
 */

import { useEffect, useRef, useState } from 'react';

import { styled } from '@mui/material/styles';

/** Coalesces a burst of changes into one utterance. */
export const ANNOUNCE_DEBOUNCE_MS = 150;

/**
 * Visually hidden, but NOT `display: none` or `visibility: hidden` — either of
 * those removes the element from the accessibility tree, so the region would
 * exist, look correct in the DOM, and announce nothing at all.
 */
const HiddenRegion = styled('span')({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
});

export function LiveRegion({
  message,
  debounceMs = ANNOUNCE_DEBOUNCE_MS,
  'data-testid': dataTestId,
}: {
  /**
   * What to say. Pass `''` to say nothing. Changing it announces; re-rendering
   * with the same words does not.
   */
  message: string;
  /** Only for tests that cannot wait out the default. */
  debounceMs?: number;
  'data-testid'?: string;
}) {
  const [announcement, setAnnouncement] = useState('');
  const announcedOnceRef = useRef(false);

  useEffect(() => {
    // Fix 3. The ref, not a state flag: flipping state here would re-run this
    // effect and announce the value it was supposed to suppress.
    if (!announcedOnceRef.current) {
      announcedOnceRef.current = true;
      return;
    }
    // Fix 2. Cleared on re-entry, so a burst schedules once from the last value.
    const timeout = window.setTimeout(() => setAnnouncement(message), debounceMs);
    return () => window.clearTimeout(timeout);
    // Fix 1. `message` is a string, so this list compares by value.
  }, [message, debounceMs]);

  return (
    <HiddenRegion role="status" aria-live="polite" data-testid={dataTestId}>
      {announcement}
    </HiddenRegion>
  );
}
