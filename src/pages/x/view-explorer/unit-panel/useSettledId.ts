// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

/** How long the panel stays on a row before it reads that row's details. */
export const SETTLE_MS = 150;

/**
 * The open row's id once the panel has stayed on it for `ms`, so holding j
 * reads nothing for the rows it passes over. Opening and closing the panel
 * take effect at once: only a move from row to row waits.
 */
export function useSettledId(id: string | null, ms = SETTLE_MS): string | null {
  const [settled, setSettled] = useState(id);
  // Adjusted during render, so the first read of a panel just opened starts with it.
  if ((id === null || settled === null) && settled !== id) setSettled(id);
  // A timer is outside React, so waiting for it is an effect.
  useEffect(() => {
    if (id === settled) return;
    const timer = setTimeout(() => setSettled(id), ms);
    return () => clearTimeout(timer);
  }, [id, settled, ms]);
  return settled;
}
