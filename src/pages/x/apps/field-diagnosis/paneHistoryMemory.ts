// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The side pane's state per history entry (PLAN.md decision 6): its scroll position and its open
// and closed Unit cards, by the router's location key. Back and Forward restore the entry's
// state, so a card the person opened stays open and a card a jump opened closes again. In
// sessionStorage, not the URL (the router owns history.state), newest 50 entries kept. Pure over
// the Storage it is given; a blocked, full or corrupt storage is ignored (nothing is lost but
// the restore).

export const HISTORY_MEMORY_STORAGE_KEY = 'componentView.history';
export const HISTORY_MEMORY_LIMIT = 50;

export interface PaneEntry {
  scrollTop: number;
  /** Unit cards opened past the pane's own rules. Absent: the entry saved no cards (do not restore). */
  forced?: string[];
  /** Unit cards closed against them. Absent as `forced` is. */
  collapsed?: string[];
}

interface Store {
  /** Keys, oldest first. */
  order: string[];
  entries: Record<string, Partial<PaneEntry>>;
}

const EMPTY = (): Store => ({ order: [], entries: {} });

function load(storage: Storage | undefined): Store {
  if (!storage) return EMPTY();
  try {
    const raw = storage.getItem(HISTORY_MEMORY_STORAGE_KEY);
    if (!raw) return EMPTY();
    const parsed = JSON.parse(raw) as Partial<Store>;
    if (!Array.isArray(parsed.order) || typeof parsed.entries !== 'object' || parsed.entries === null || Array.isArray(parsed.entries)) {
      return EMPTY();
    }
    return { order: parsed.order.filter((k): k is string => typeof k === 'string'), entries: parsed.entries };
  } catch {
    // Blocked storage or corrupt JSON: start from nothing.
    return EMPTY();
  }
}

export function readPaneEntry(storage: Storage | undefined, key: string): PaneEntry | undefined {
  const entry = load(storage).entries[key];
  if (!entry) return undefined;
  // A field opened in place gets a new entry with only its scroll: its cards are absent, which
  // is not "no cards" (review item 4).
  return {
    scrollTop: typeof entry.scrollTop === 'number' ? entry.scrollTop : 0,
    ...(Array.isArray(entry.forced) ? { forced: entry.forced } : {}),
    ...(Array.isArray(entry.collapsed) ? { collapsed: entry.collapsed } : {}),
  };
}

/** Merges `patch` into the entry of `key` and makes it the newest. */
export function savePaneEntry(storage: Storage | undefined, key: string, patch: Partial<PaneEntry>): void {
  if (!storage) return;
  const store = load(storage);
  store.entries[key] = { ...store.entries[key], ...patch };
  store.order = [...store.order.filter((k) => k !== key), key];
  while (store.order.length > HISTORY_MEMORY_LIMIT) {
    const oldest = store.order.shift();
    if (oldest !== undefined) delete store.entries[oldest];
  }
  try {
    storage.setItem(HISTORY_MEMORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Full or blocked storage: the entry is not kept, and Back restores less. Nothing else breaks.
  }
}

/** The session's storage, or undefined where it is not reachable. */
export function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    // Blocked by the browser's settings.
    return undefined;
  }
}
