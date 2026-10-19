// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useLayoutEffect, useRef } from 'react';

import { type DraftRetryableRead, retryFailedReads } from './draftRetry';

/**
 * One callback that asks again every read that failed (`retryFailedReads`), and the retry of
 * whatever the caller's value is worked out from (`upstream`), for a "Could not establish" with
 * a retry icon: a value that failed because a read it depends on failed is retried by asking
 * that read again.
 *
 * Stable across renders, so a memoised section that takes it does not render again for it; it
 * reads the reads of the latest render when called.
 */
export function useRetry(
  reads: readonly DraftRetryableRead[],
  upstream?: () => void,
): () => void {
  const latest = useRef({ reads, upstream });
  // Kept once a render commits, never during one: a render React sets aside must not leave its reads behind.
  useLayoutEffect(() => {
    latest.current = { reads, upstream };
  });
  return useCallback(() => {
    latest.current.upstream?.();
    retryFailedReads(latest.current.reads);
  }, []);
}
