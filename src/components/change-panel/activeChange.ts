// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The person's active change: the ChangeSet their saves join, as `<Space slug>/<slug>#<ChangeSetID>`.
 * The ID is what names the change: a rename or move elsewhere keeps it, and the Space and slug
 * are refreshed from it for display and addresses. A value without an ID (older, or set by
 * name) gains one when the change is first read.
 *
 * Kept in browser storage, so every tab of one browser reads the same one. Another
 * browser or device does not see it: the server keeps no active change per person yet.
 */
import { useCallback, useSyncExternalStore } from 'react';

/** The storage key the panel reads. Specs install a change under it before the page loads. */
export const ACTIVE_CHANGE_KEY = 'confighub.activeChangeSet';

/** Fired in this tab when the active change is set here; `storage` covers the other tabs. */
const LOCAL_EVENT = 'confighub:active-change';

/** Asks the layout to open the sidebar on the change panel. */
export const OPEN_CHANGE_PANEL_EVENT = 'confighub:open-change-panel';

export function openChangePanel(): void {
  window.dispatchEvent(new Event(OPEN_CHANGE_PANEL_EVENT));
}

export interface ActiveChangeRef {
  space: string;
  slug: string;
  id?: string;
}

function read(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_CHANGE_KEY);
  } catch {
    return null;
  }
}

/** A pending change (D34) is stored as `pending:<name>`: it has no Space until its first save. */
const PENDING_PREFIX = 'pending:';

export function parsePendingChange(value: string | null): string | null {
  return value?.startsWith(PENDING_PREFIX) && value.length > PENDING_PREFIX.length ? value.slice(PENDING_PREFIX.length) : null;
}

/** The pending change's name, read outside React (the save seam). */
export function readPendingChange(): string | null {
  return parsePendingChange(read());
}

export function parseActiveChange(value: string | null): ActiveChangeRef | null {
  if (!value || parsePendingChange(value) !== null) return null;
  const hash = value.indexOf('#');
  const name = hash < 0 ? value : value.slice(0, hash);
  const id = hash < 0 ? undefined : value.slice(hash + 1) || undefined;
  const slash = name.indexOf('/');
  if (slash <= 0 || slash === name.length - 1) return null;
  return { space: name.slice(0, slash), slug: name.slice(slash + 1), ...(id ? { id } : {}) };
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ACTIVE_CHANGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

export function setActiveChange(ref: ActiveChangeRef | null): void {
  if (ref !== null) leftChange = null;
  write(ref === null ? null : `${ref.space}/${ref.slug}${ref.id ? `#${ref.id}` : ''}`);
}

// The change last left with "Leave this change" (D33), for the note that it is still open.
// Kept in this tab until a reload or until a change is picked.
let leftChange: string | null = null;

/** No active change; the change itself stays open (D33). */
export function leaveActiveChange(slug: string): void {
  leftChange = slug;
  write(null);
}

export function readLeftChange(): string | null {
  return leftChange;
}

/** Starts a pending change named `name`, or drops it with null (D34). */
export function setPendingChange(name: string | null): void {
  if (name !== null) leftChange = null;
  write(name === null ? null : `${PENDING_PREFIX}${name}`);
}

function write(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(ACTIVE_CHANGE_KEY);
    else window.localStorage.setItem(ACTIVE_CHANGE_KEY, value);
  } catch {
    // Storage blocked: the change still exists on the server; only this browser forgets it.
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

export function useActiveChangeRef(): {
  active: ActiveChangeRef | null;
  /** The pending change's name (D34), when one is started and not yet saved into. */
  pending: string | null;
  setActive: (ref: ActiveChangeRef | null) => void;
} {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const setActive = useCallback((ref: ActiveChangeRef | null) => setActiveChange(ref), []);
  return { active: parseActiveChange(raw), pending: parsePendingChange(raw), setActive };
}
