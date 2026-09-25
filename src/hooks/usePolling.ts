// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

/**
 * Custom hook that polls a callback function at a specified interval,
 * but only when the browser tab is visible.
 *
 * @param callback - The function to call on each interval
 * @param intervalMs - The polling interval in milliseconds
 */
export const usePolling = (callback: () => void, intervalMs: number) => {
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (interval) return; // Already polling
      interval = setInterval(() => {
        callback();
      }, intervalMs);
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    // Start polling if tab is currently visible
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [callback, intervalMs]);
};
