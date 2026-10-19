// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

/**
 * `value`, once it has stopped changing for `delayMs`: the draft asks the server about a name
 * when the typing pauses, not at every key.
 *
 * The one effect the draft's data layer has, and it is a timer, which nothing in render can
 * be: it is cleared on every change and on unmount, so a value that has moved on is never
 * reported as settled.
 */
export function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return undefined;
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, settled, delayMs]);
  return settled;
}
