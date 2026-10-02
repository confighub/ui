// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { RELEASE_CLOCK_MS } from './fold/foldConstants';

const toMinute = (ms: number): number => ms - (ms % RELEASE_CLOCK_MS);

/**
 * The time now, to the minute; it changes once at the start of each minute.
 * What reads it (the "Last released" buckets) is then the same on every
 * render and every status poll within that minute.
 */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => toMinute(Date.now()));
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      const wait = RELEASE_CLOCK_MS - (Date.now() % RELEASE_CLOCK_MS);
      timer = window.setTimeout(() => {
        setNow(toMinute(Date.now()));
        arm();
      }, wait);
    };
    arm();
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}
