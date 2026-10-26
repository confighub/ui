// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Where a comparison of Units lives, without a browser: per tab in the
 * explorer reducer, cleared with its tab or when the tab stops listing Units,
 * copied to the tab "All units" forks into, never a draft or an undo step,
 * and in the URL as `?compare=`, read once when the page opens.
 */
import { expect, test } from '@playwright/test';

import { compareIdsFor, compareLinkNotice, decodeCompareParam, reconcileCompare } from '../src/pages/x/view-explorer/model/compare';
import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import { BUILTIN_TAB_ID, type ExplorerAction, editTargetTabId, explorerReducer, initialExplorerState, isDirty } from '../src/pages/x/view-explorer/model/reducer';
import type { ExplorerState, TabState } from '../src/pages/x/view-explorer/model/types';
import { encodeDraftParam } from '../src/pages/x/view-explorer/model/view-codec';
import { tabLinkParams } from '../src/pages/x/view-explorer/state/context';
import { buildInitialState } from '../src/pages/x/view-explorer/state/initial';
import type { ExplorerStorage } from '../src/pages/x/view-explorer/state/storage';
import { lens } from './fixtures/view-explorer-model-views';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = uuid(1);
const B = uuid(2);
const C = uuid(3);

const run = (state: ExplorerState, ...actions: ExplorerAction[]) => actions.reduce(explorerReducer, state);

function temp(id: string, entity: 'Unit' | 'Space' = 'Unit'): TabState {
  const def = defaultViewDef(entity);
  return { id, kind: 'temp', name: 'Mine', baseline: null, work: def, history: [], pinned: false };
}

function saved(id: string): TabState {
  const def = defaultViewDef('Unit');
  return { id, kind: 'saved', viewId: 'v1', name: 'Saved', baseline: def, work: def, history: [], pinned: true };
}

const memoryStorage = (): ExplorerStorage => ({
  readPins: () => [],
  writePins: () => {},
  readTemps: () => [],
  writeTemps: () => {},
  readDrafts: () => ({}),
  writeDrafts: () => {},
  mergePins: () => {},
  mergeTemps: () => {},
  mergeDrafts: () => {},
  readColumn: () => ({}),
  writeColumn: () => {},
});

const open = (query: string) => buildInitialState({ views: [], storage: memoryStorage(), params: new URLSearchParams(query) });

test.describe('compare state in the reducer', () => {
  test('belongs to the active tab, keeps slot order, holds no Unit twice and at most five', () => {
    const s = run(initialExplorerState(), { type: 'setCompare', ids: [B, A, B, C, uuid(4), uuid(5), uuid(6)] });
    expect(compareIdsFor(s, BUILTIN_TAB_ID)).toEqual([B, A, C, uuid(4), uuid(5)]);
  });

  test('is not an edit of the view: no fork, no draft, no undo step', () => {
    const s0 = run(initialExplorerState(), { type: 'openTab', tab: saved('view:v1') });
    const s1 = run(s0, { type: 'setCompare', ids: [A, B] });
    const tab = s1.tabs.find((t) => t.id === 'view:v1')!;
    expect(s1.tabs).toHaveLength(2);
    expect(tab.history).toEqual([]);
    expect(isDirty(tab)).toBe(false);
    // On "All units" it does not fork either.
    const b = run(initialExplorerState(), { type: 'setCompare', ids: [A] });
    expect(b.tabs).toHaveLength(1);
    expect(b.activeId).toBe(BUILTIN_TAB_ID);
  });

  test('an empty list ends the comparison, and a list equal to the current one changes nothing', () => {
    const s1 = run(initialExplorerState(), { type: 'setCompare', ids: [A, B] });
    expect(run(s1, { type: 'setCompare', ids: [A, B] })).toBe(s1);
    const s2 = run(s1, { type: 'setCompare', ids: [] });
    expect(compareIdsFor(s2, BUILTIN_TAB_ID)).toEqual([]);
    expect(s2.compare).toBeUndefined();
  });

  test('each tab keeps its own while the viewer moves between them', () => {
    const s = run(
      initialExplorerState(),
      { type: 'setCompare', ids: [A, B] },
      { type: 'openTab', tab: temp('temp-x') },
      { type: 'setCompare', ids: [C] },
      { type: 'activate', tabId: BUILTIN_TAB_ID },
    );
    expect(compareIdsFor(s, BUILTIN_TAB_ID)).toEqual([A, B]);
    expect(compareIdsFor(s, 'temp-x')).toEqual([C]);
  });

  test('a tab that closes takes its comparison with it', () => {
    const s = run(initialExplorerState(), { type: 'openTab', tab: temp('temp-x') }, { type: 'setCompare', ids: [A, B] }, { type: 'closeTab', tabId: 'temp-x' });
    expect(s.compare).toBeUndefined();
  });

  test('a tab that stops listing Units stops comparing, and an undo does not bring it back', () => {
    const s0 = run(initialExplorerState(), { type: 'openTab', tab: temp('temp-x') }, { type: 'setCompare', ids: [A, B] });
    const s1 = run(s0, { type: 'setEntity', entity: 'Space' });
    expect(compareIdsFor(s1, 'temp-x')).toEqual([]);
    const s2 = run(s1, { type: 'undo' });
    expect(s2.tabs.find((t) => t.id === 'temp-x')?.work.entity).toBe('Unit');
    expect(compareIdsFor(s2, 'temp-x')).toEqual([]);
    // A Spaces view never starts comparing.
    expect(run(s1, { type: 'setCompare', ids: [C] })).toBe(s1);
  });

  test('the first edit of "All units" forks it, and the fork compares the same Units', () => {
    const s0 = run(initialExplorerState(undefined, 'p'), { type: 'setCompare', ids: [A, B] });
    const forkId = editTargetTabId(s0);
    const s1 = run(s0, { type: 'addLenses', lenses: [lens({ kind: 'status', status: 'unreleased' })] });
    expect(s1.activeId).toBe(forkId);
    expect(compareIdsFor(s1, forkId)).toEqual([A, B]);
    // "All units" keeps its own.
    expect(compareIdsFor(s1, BUILTIN_TAB_ID)).toEqual([A, B]);
    // A change to the fork's comparison is the fork's alone.
    const s2 = run(s1, { type: 'setCompare', ids: [B] });
    expect(compareIdsFor(s2, BUILTIN_TAB_ID)).toEqual([A, B]);
  });

  test('a batch that forks "All units" copies the comparison too', () => {
    const s0 = run(initialExplorerState(undefined, 'p'), { type: 'setCompare', ids: [A] });
    const forkId = editTargetTabId(s0);
    const s1 = run(s0, { type: 'batch', actions: [{ type: 'addLenses', lenses: [lens({ kind: 'status', status: 'released' })] }, { type: 'setLayout', layout: 'table' }] });
    expect(s1.activeId).toBe(forkId);
    expect(compareIdsFor(s1, forkId)).toEqual([A]);
  });

  test('a new temporary tab opened from "All units" is not a fork, and compares nothing', () => {
    const s = run(initialExplorerState(undefined, 'p'), { type: 'setCompare', ids: [A] }, { type: 'newTemp', tabId: 'temp-new' });
    expect(s.activeId).toBe('temp-new');
    expect(compareIdsFor(s, 'temp-new')).toEqual([]);
  });

  test('reconcile hands back the same state when no rule applies', () => {
    const s0 = run(initialExplorerState(), { type: 'setCompare', ids: [A] });
    const s1 = { ...s0, mode: 'text' as const };
    expect(reconcileCompare(s0, s1, null)).toBe(s1);
  });
});

test.describe('compare in the URL', () => {
  test('a link carries the tab’s view and its comparison, slot A first', () => {
    const tab = temp('temp-x');
    const params = tabLinkParams(tab, undefined, [B, A]);
    expect(params.compare).toBe(`${B},${A}`);
    expect(params.view).toBe('new');
    expect(tabLinkParams(tab, undefined, [])).not.toHaveProperty('compare');
    // "All units" has no view parameter, only the comparison.
    expect(tabLinkParams(initialExplorerState().tabs[0], undefined, [A])).toEqual({ compare: A });
  });

  test('opening a link compares its Units in the tab it opens, with nothing to say', () => {
    const { state, notice } = open(`compare=${A},${B}`);
    expect(compareIdsFor(state, state.activeId)).toEqual([A, B]);
    expect(notice).toBeNull();
  });

  test('a link to a temporary view compares in that view’s tab', () => {
    const { state } = open(`view=new&d=${encodeURIComponent(encodeDraftParam(defaultViewDef('Unit')))}&compare=${A}`);
    expect(state.activeId).not.toBe(BUILTIN_TAB_ID);
    expect(compareIdsFor(state, state.activeId)).toEqual([A]);
    expect(compareIdsFor(state, BUILTIN_TAB_ID)).toEqual([]);
  });

  test('says what it left out: entries that are not Unit IDs, repeats, Units past the fifth', () => {
    const raw = [A, 'nope', A, B, C, uuid(4), uuid(5), uuid(6), uuid(7)].join(',');
    const { state, notice } = open(`compare=${raw}`);
    expect(compareIdsFor(state, state.activeId)).toEqual([A, B, C, uuid(4), uuid(5)]);
    expect(notice).toBe('In the link’s comparison, 1 entry is not a Unit ID and was left out; 1 Unit is named twice and is compared once; only five Units fit, so 2 were left out.');
  });

  test('says when it could read none of it, and shows the table', () => {
    const { state, notice } = open('compare=x,y');
    expect(state.compare).toBeUndefined();
    expect(notice).toBe('The link’s comparison could not be read, so the table is shown.');
    expect(open('compare=').notice).toBeNull();
  });

  test('a view that does not list Units compares nothing, and says so', () => {
    const { state, notice } = open(`view=new&d=${encodeURIComponent(encodeDraftParam(defaultViewDef('Space')))}&compare=${A}`);
    expect(state.compare).toBeUndefined();
    expect(notice).toBe('The link’s comparison was left out, because this view does not list Units.');
  });

  test('the notice words follow the counts', () => {
    expect(compareLinkNotice(decodeCompareParam(`${A},x,y`), true)).toBe('In the link’s comparison, 2 entries are not Unit IDs and were left out.');
    expect(compareLinkNotice(decodeCompareParam(`${A},${A},${A}`), true)).toBe('In the link’s comparison, 2 Units are named twice and are compared once.');
    expect(compareLinkNotice(decodeCompareParam([A, B, C, uuid(4), uuid(5), uuid(6)].join(',')), true)).toBe(
      'In the link’s comparison, only five Units fit, so 1 was left out.',
    );
    expect(compareLinkNotice(decodeCompareParam(''), false)).toBeNull();
  });

  test('a link whose view is gone still compares on "All units", and says both', () => {
    const { state, notice } = open(`view=missing&compare=${A},x`);
    expect(state.activeId).toBe(BUILTIN_TAB_ID);
    expect(compareIdsFor(state, BUILTIN_TAB_ID)).toEqual([A]);
    expect(notice).toBe('The view in the link no longer exists, or you cannot see it. In the link’s comparison, 1 entry is not a Unit ID and was left out.');
  });
});
