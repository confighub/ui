// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The side pane's state per history entry (PLAN.md decision 6): its scroll and its open and
// closed Unit cards, kept in sessionStorage by the router's location key, at most 50 entries.
import { expect, test } from '@playwright/test';

import {
  HISTORY_MEMORY_LIMIT,
  HISTORY_MEMORY_STORAGE_KEY,
  readPaneEntry,
  savePaneEntry,
} from '../src/pages/x/apps/field-diagnosis/paneHistoryMemory';

/** A Storage with Map semantics. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const ENTRY = { scrollTop: 120, forced: ['u1'], collapsed: ['u2'] };

test('save and read per key', () => {
  const s = memoryStorage();
  savePaneEntry(s, 'k1', ENTRY);
  savePaneEntry(s, 'k2', { ...ENTRY, scrollTop: 5 });
  expect(readPaneEntry(s, 'k1')).toEqual(ENTRY);
  expect(readPaneEntry(s, 'k2')?.scrollTop).toBe(5);
  expect(readPaneEntry(s, 'k3')).toBeUndefined();
});

test('a partial save keeps the rest of the entry', () => {
  const s = memoryStorage();
  savePaneEntry(s, 'k1', ENTRY);
  savePaneEntry(s, 'k1', { scrollTop: 300 });
  expect(readPaneEntry(s, 'k1')).toEqual({ ...ENTRY, scrollTop: 300 });
});

test(`keeps the newest ${HISTORY_MEMORY_LIMIT}: the oldest goes at ${HISTORY_MEMORY_LIMIT + 1}`, () => {
  const s = memoryStorage();
  for (let i = 0; i <= HISTORY_MEMORY_LIMIT; i += 1) savePaneEntry(s, `k${i}`, { ...ENTRY, scrollTop: i });
  expect(readPaneEntry(s, 'k0')).toBeUndefined();
  expect(readPaneEntry(s, 'k1')?.scrollTop).toBe(1);
  expect(readPaneEntry(s, `k${HISTORY_MEMORY_LIMIT}`)?.scrollTop).toBe(HISTORY_MEMORY_LIMIT);
});

test('saving an old key again makes it the newest', () => {
  const s = memoryStorage();
  for (let i = 0; i < HISTORY_MEMORY_LIMIT; i += 1) savePaneEntry(s, `k${i}`, ENTRY);
  savePaneEntry(s, 'k0', { scrollTop: 1 });
  savePaneEntry(s, 'new', ENTRY);
  expect(readPaneEntry(s, 'k0')).toBeDefined();
  expect(readPaneEntry(s, 'k1')).toBeUndefined();
});

test('blocked or full storage: no throw, nothing read', () => {
  const blocked = {
    ...memoryStorage(),
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  } as Storage;
  expect(() => savePaneEntry(blocked, 'k', ENTRY)).not.toThrow();
  expect(readPaneEntry(blocked, 'k')).toBeUndefined();
  expect(() => savePaneEntry(undefined, 'k', ENTRY)).not.toThrow();
  expect(readPaneEntry(undefined, 'k')).toBeUndefined();
});

test('corrupt JSON reads as empty, and a save starts over', () => {
  const s = memoryStorage();
  s.setItem(HISTORY_MEMORY_STORAGE_KEY, '{not json');
  expect(readPaneEntry(s, 'k')).toBeUndefined();
  savePaneEntry(s, 'k', ENTRY);
  expect(readPaneEntry(s, 'k')).toEqual(ENTRY);
});

test('a wrong shape reads as empty', () => {
  const s = memoryStorage();
  s.setItem(HISTORY_MEMORY_STORAGE_KEY, JSON.stringify({ order: 'x', entries: [] }));
  expect(readPaneEntry(s, 'k')).toBeUndefined();
});

test('an entry with only a scroll has no cards: absent, not empty (nothing to restore)', () => {
  const s = memoryStorage();
  savePaneEntry(s, 'k', { scrollTop: 40 });
  const entry = readPaneEntry(s, 'k');
  expect(entry?.scrollTop).toBe(40);
  expect(entry?.forced).toBeUndefined();
  expect(entry?.collapsed).toBeUndefined();
});
