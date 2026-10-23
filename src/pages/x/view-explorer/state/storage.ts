// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { decodeDraftParam, encodeDraftParam } from '../model/view-codec';
import type { ViewDef } from '../model/types';

/**
 * What the View Explorer keeps in this browser: the views a person pinned,
 * their temporary tabs, unsaved changes to saved views, and the filter
 * column's width and collapsed state. Nothing here is shared with anyone.
 *
 * Keys are scoped to the organization and versioned, so switching
 * organization never shows another organization's tabs, and a later format
 * can ignore this one. Every access is wrapped: storage can be full, blocked
 * or cleared, and the page must work without it.
 */

const PREFIX = 'confighub:view-explorer';
const VERSION = 'v1';

export interface StoredTemp {
  id: string;
  name: string;
  work: ViewDef;
}

/** Unsaved work on a saved view, and the version of the view it started from. */
export interface StoredDraft {
  work: ViewDef;
  /**
   * The view's UpdatedAt when the work began. Saving compares it with the
   * server's, so a draft kept for days never overwrites a colleague's later
   * change without asking. Absent for a draft kept before versions were.
   */
  base?: string;
  /** The same for the view's Filter. */
  filterBase?: string;
}

/** The filter column as the viewer left it. */
export interface ColumnPrefs {
  /** Width in pixels (240–440); absent: the default. */
  width?: number;
  collapsed?: boolean;
  /**
   * The viewer collapsed or opened the column themselves. Below 1360 px the
   * column starts collapsed only when they never chose.
   */
  chosen?: boolean;
  /** Below 1360 px, the viewer left the column open (it floats over the table). */
  narrowOpen?: boolean;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Full or blocked storage loses the convenience, not the page.
  }
}

function readJson(key: string): unknown {
  const raw = read(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export interface ExplorerStorage {
  /** Pinned View IDs in strip order; null when the viewer never chose. */
  readPins(): string[] | null;
  writePins(viewIds: readonly string[]): void;
  readTemps(): StoredTemp[];
  writeTemps(temps: readonly StoredTemp[]): void;
  /** Unsaved work on saved views, by View ID. */
  readDrafts(): Record<string, StoredDraft>;
  writeDrafts(drafts: Readonly<Record<string, StoredDraft>>): void;
  /**
   * Merge this page's changes into what is stored, by key, so two browser tabs
   * never overwrite each other: `prev` is what this page last stored, `next`
   * what it holds now. Only entries whose content changed between the two are
   * written (and those removed are deleted); every other entry stays as another
   * page left it.
   */
  mergePins(prev: readonly string[], next: readonly string[]): void;
  mergeTemps(prev: readonly StoredTemp[], next: readonly StoredTemp[]): void;
  mergeDrafts(prev: Readonly<Record<string, StoredDraft>>, next: Readonly<Record<string, StoredDraft>>): void;
  readColumn(): ColumnPrefs;
  /** Merge `prefs` into what is stored. */
  writeColumn(prefs: ColumnPrefs): void;
}

export function explorerStorage(orgId: string): ExplorerStorage {
  const key = (part: string) => `${PREFIX}:${orgId || 'default'}:${VERSION}:${part}`;
  const readColumn = (): ColumnPrefs => {
    const v = readJson(key('column'));
    if (typeof v !== 'object' || v === null) return {};
    const { width, collapsed, chosen, narrowOpen } = v as Record<string, unknown>;
    return {
      width: typeof width === 'number' ? width : undefined,
      collapsed: typeof collapsed === 'boolean' ? collapsed : undefined,
      chosen: chosen === true ? true : undefined,
      narrowOpen: typeof narrowOpen === 'boolean' ? narrowOpen : undefined,
    };
  };
  const api: ExplorerStorage = {
    readPins() {
      const v = readJson(key('pins'));
      return isStringArray(v) ? v : null;
    },
    writePins(viewIds) {
      write(key('pins'), JSON.stringify(viewIds));
    },
    readTemps() {
      const v = readJson(key('temp-tabs'));
      if (!Array.isArray(v)) return [];
      const out: StoredTemp[] = [];
      for (const item of v) {
        if (typeof item !== 'object' || item === null) continue;
        const { id, name, work } = item as Record<string, unknown>;
        if (typeof id !== 'string' || typeof name !== 'string' || typeof work !== 'string') continue;
        const def = decodeDraftParam(work);
        if (def) out.push({ id, name, work: def });
      }
      return out;
    },
    writeTemps(temps) {
      const value = temps.map((t) => ({ id: t.id, name: t.name, work: encodeDraftParam(t.work) }));
      write(key('temp-tabs'), value.length ? JSON.stringify(value) : null);
    },
    readDrafts() {
      const v = readJson(key('drafts'));
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
      const out: Record<string, StoredDraft> = {};
      for (const [viewId, item] of Object.entries(v as Record<string, unknown>)) {
        // A bare string is a draft kept without its version.
        const { work, base, filterBase } =
          typeof item === 'string' ? { work: item, base: undefined, filterBase: undefined } : typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
        if (typeof work !== 'string') continue;
        const def = decodeDraftParam(work);
        const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
        if (def) out[viewId] = { work: def, base: text(base), filterBase: text(filterBase) };
      }
      return out;
    },
    writeDrafts(drafts) {
      const entries = Object.entries(drafts).map(([viewId, d]) => [viewId, { work: encodeDraftParam(d.work), base: d.base, filterBase: d.filterBase }]);
      write(key('drafts'), entries.length ? JSON.stringify(Object.fromEntries(entries)) : null);
    },
    mergePins(prev, next) {
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) return;
      const removed = new Set(prev.filter((id) => !next.includes(id)));
      const others = (api.readPins() ?? []).filter((id) => !removed.has(id) && !next.includes(id));
      api.writePins([...next, ...others]);
    },
    mergeTemps(prev, next) {
      const sig = (t: StoredTemp) => JSON.stringify([t.name, encodeDraftParam(t.work)]);
      const before = new Map(prev.map((t) => [t.id, sig(t)]));
      const changed = next.filter((t) => before.get(t.id) !== sig(t));
      const removed = prev.filter((t) => !next.some((n) => n.id === t.id)).map((t) => t.id);
      if (changed.length === 0 && removed.length === 0) return;
      // Only what this page changed: an entry it holds unchanged may be older than another page's copy.
      const out = new Map(api.readTemps().map((t) => [t.id, t]));
      for (const id of removed) out.delete(id);
      for (const t of changed) out.set(t.id, t);
      api.writeTemps([...out.values()]);
    },
    mergeDrafts(prev, next) {
      const sig = (d: StoredDraft) => JSON.stringify([encodeDraftParam(d.work), d.base ?? '', d.filterBase ?? '']);
      const changed = Object.entries(next).filter(([viewId, d]) => !prev[viewId] || sig(prev[viewId]) !== sig(d));
      const removed = Object.keys(prev).filter((viewId) => !(viewId in next));
      if (changed.length === 0 && removed.length === 0) return;
      const merged = { ...api.readDrafts() };
      for (const viewId of removed) delete merged[viewId];
      for (const [viewId, d] of changed) merged[viewId] = d;
      api.writeDrafts(merged);
    },
    readColumn,
    writeColumn(prefs) {
      write(key('column'), JSON.stringify({ ...readColumn(), ...prefs }));
    },
  };
  return api;
}
