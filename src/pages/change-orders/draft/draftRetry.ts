// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** A read as a retry sees it: an RTK Query result, or a fan-out read that fails item by item. */
export interface DraftRetryableRead {
  isError: boolean;
  /** True for a skipped query, which has nothing to ask again (and refuses a refetch). */
  isUninitialized: boolean;
  refetch: () => unknown;
}

/**
 * Asks again every read that failed. Reads that did not fail are left alone: a retry is no
 * reason to fetch what is in hand. Returns how many were asked.
 */
export function retryFailedReads(reads: readonly DraftRetryableRead[]): number {
  let asked = 0;
  for (const read of reads) {
    if (!read.isError || read.isUninitialized) continue;
    void read.refetch();
    asked += 1;
  }
  return asked;
}
