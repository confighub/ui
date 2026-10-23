// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from 'react';

/**
 * The lens whose text should be selected when text mode next opens: set by
 * `openTextMode({ selectLensId })` (a click on a Custom WHERE lens), read and
 * cleared by the editor once it has selected the text. It lives outside the
 * reducer because it is a one-shot request about focus, not part of the view.
 */

let pending: string | null = null;
const listeners = new Set<() => void>();

export function requestLensSelection(lensId: string | null): void {
  pending = lensId;
  listeners.forEach((l) => l());
}

/** Take the pending request, so it is acted on once. */
export function takeLensSelection(): string | null {
  const id = pending;
  if (id !== null) {
    pending = null;
    listeners.forEach((l) => l());
  }
  return id;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The pending lens id, so the editor re-renders when a new request arrives while it is open. */
export function usePendingLensSelection(): string | null {
  return useSyncExternalStore(subscribe, () => pending);
}
