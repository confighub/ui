// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The explorer reducer: the built-in tab forks on change, solo and restore,
 * undo, discard, saving, and the tab housekeeping the strip relies on.
 */
import { expect, test } from '@playwright/test';

import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import {
  BUILTIN_TAB_ID,
  type ExplorerAction,
  activeTab,
  editTargetTabId,
  explorerReducer,
  initialExplorerState,
  isBlankTemp,
  isDirty,
  makeForkPrefix,
} from '../src/pages/x/view-explorer/model/reducer';
import type { ExplorerState, TabState } from '../src/pages/x/view-explorer/model/types';
import { diffViewDefs } from '../src/pages/x/view-explorer/model/view-codec';
import { lens } from './fixtures/view-explorer-model-views';

function run(state: ExplorerState, ...actions: ExplorerAction[]): ExplorerState {
  return actions.reduce(explorerReducer, state);
}

function active(state: ExplorerState): TabState {
  const t = activeTab(state);
  if (!t) throw new Error('no active tab');
  return t;
}

function savedTab(id = 'saved-1'): TabState {
  const def = {
    ...defaultViewDef('Unit'),
    lenses: [lens({ kind: 'status', status: 'unreleased' })],
  };
  return {
    id,
    kind: 'saved',
    viewId: 'v1',
    filterId: 'f1',
    spaceId: 's1',
    name: 'Unreleased',
    baseline: def,
    work: def,
    history: [],
    pinned: true,
  };
}

test.describe('the built-in tab', () => {
  test('any change opens a temporary tab and leaves "All units" clean', () => {
    const s0 = initialExplorerState();
    const added = lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] });
    const s1 = run(s0, { type: 'addLenses', lenses: [added] });
    const builtin = s1.tabs.find((t) => t.id === BUILTIN_TAB_ID);
    expect(builtin?.work).toEqual(s0.tabs[0].work);
    const temp = active(s1);
    expect(temp.kind).toBe('temp');
    expect(temp.id).toBe('temp-1');
    expect(temp.work.lenses).toEqual([added]);
    expect(temp.history).toEqual([s0.tabs[0].work]);
    expect(s1.seq).toBe(1);
    // ⌘Z in the new tab goes back to what All units showed.
    expect(active(run(s1, { type: 'undo' })).work).toEqual(s0.tabs[0].work);
  });

  test('a change that changes nothing does not fork', () => {
    const s0 = initialExplorerState();
    expect(run(s0, { type: 'setLayout', layout: 'table' })).toBe(s0);
    expect(run(s0, { type: 'addLenses', lenses: [] })).toBe(s0);
  });

  test('the built-in tab cannot be closed, renamed, discarded or saved over', () => {
    const s0 = initialExplorerState();
    expect(run(s0, { type: 'closeTab', tabId: BUILTIN_TAB_ID })).toBe(s0);
    expect(run(s0, { type: 'renamed', tabId: BUILTIN_TAB_ID, name: 'x' })).toBe(s0);
    expect(run(s0, { type: 'discard' })).toBe(s0);
    expect(
      run(s0, {
        type: 'saved',
        tabId: BUILTIN_TAB_ID,
        name: 'x',
        viewId: 'v',
        filterId: 'f',
        spaceId: 's',
      }),
    ).toBe(s0);
  });
});

test.describe('solo and restore', () => {
  test('⌥-click shows one lens; again restores the others', () => {
    const a = lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] });
    const b = lens({ kind: 'status', status: 'unreleased' });
    const c = lens({ kind: 'field', field: 'Labels.app', op: 'is', values: ['x'] }, false);
    const s0 = run(initialExplorerState(), {
      type: 'openTab',
      tab: { ...savedTab(), work: { ...savedTab().work, lenses: [a, b, c] } },
    });
    const s1 = run(s0, { type: 'soloLens', lensId: c.id });
    expect(active(s1).work.lenses.map((l) => l.enabled)).toEqual([false, false, true]);
    expect(active(s1).solo?.lensId).toBe(c.id);
    const s2 = run(s1, { type: 'soloLens', lensId: c.id });
    expect(active(s2).work.lenses.map((l) => l.enabled)).toEqual([true, true, false]);
    expect(active(s2).solo).toBeUndefined();
  });

  test('solo another lens while one is solo, then restore gives the original', () => {
    const a = lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] });
    const b = lens({ kind: 'status', status: 'unreleased' });
    const s0 = run(initialExplorerState(), {
      type: 'openTab',
      tab: { ...savedTab(), work: { ...savedTab().work, lenses: [a, b] } },
    });
    const s1 = run(
      s0,
      { type: 'soloLens', lensId: a.id },
      { type: 'soloLens', lensId: b.id },
      { type: 'soloLens', lensId: b.id },
    );
    expect(active(s1).work.lenses.map((l) => l.enabled)).toEqual([true, false]);
  });

  test('any other edit ends the solo', () => {
    const a = lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] });
    const b = lens({ kind: 'status', status: 'unreleased' });
    const s0 = run(initialExplorerState(), {
      type: 'openTab',
      tab: { ...savedTab(), work: { ...savedTab().work, lenses: [a, b] } },
    });
    const s1 = run(
      s0,
      { type: 'soloLens', lensId: a.id },
      { type: 'setLayout', layout: 'board' },
    );
    expect(active(s1).solo).toBeUndefined();
  });
});

test.describe('undo, discard, dirty', () => {
  test('each edit is one undo step', () => {
    const s0 = run(initialExplorerState(), { type: 'openTab', tab: savedTab() });
    const base = active(s0).work;
    const s1 = run(
      s0,
      { type: 'setGroupBy', groupBy: ['Space', 'Target'] },
      { type: 'moveGroupLevel', from: 0, to: 1 },
      { type: 'setSort', sort: { column: 'Slug', dir: 'ASC' } },
    );
    expect(active(s1).work.groupBy).toEqual(['Target', 'Space']);
    expect(isDirty(active(s1))).toBe(true);
    const s2 = run(s1, { type: 'undo' });
    expect(active(s2).work.sort).toEqual(base.sort);
    expect(active(s2).work.groupBy).toEqual(['Target', 'Space']);
    expect(active(run(s2, { type: 'undo' })).work.groupBy).toEqual(['Space', 'Target']);
    const s3 = run(s2, { type: 'undo' }, { type: 'undo' });
    expect(active(s3).work).toEqual(base);
    expect(isDirty(active(s3))).toBe(false);
    expect(run(s3, { type: 'undo' })).toBe(s3);
  });

  test('discard returns to the saved view and can itself be undone', () => {
    const s0 = run(initialExplorerState(), { type: 'openTab', tab: savedTab() });
    const s1 = run(s0, { type: 'setLayout', layout: 'board' }, { type: 'discard' });
    expect(active(s1).work.layout).toBe('table');
    expect(isDirty(active(s1))).toBe(false);
    expect(active(run(s1, { type: 'undo' })).work.layout).toBe('board');
  });

  test('discard on a temporary tab closes it', () => {
    const s0 = run(
      initialExplorerState(),
      { type: 'newTemp', tabId: 't1' },
      { type: 'setLayout', layout: 'list' },
    );
    const s1 = run(s0, { type: 'discard' });
    expect(s1.tabs.map((t) => t.id)).toEqual([BUILTIN_TAB_ID]);
    expect(s1.activeId).toBe(BUILTIN_TAB_ID);
  });

  test('a lens edited back to how it was is not a change', () => {
    const tab = savedTab();
    const [l] = tab.work.lenses;
    const s1 = run(
      initialExplorerState(),
      { type: 'openTab', tab },
      { type: 'toggleLens', lensId: l.id },
      { type: 'toggleLens', lensId: l.id },
    );
    expect(isDirty(active(s1))).toBe(false);
  });
});

test.describe('lens and column actions', () => {
  test('add, update, remove and replace lenses', () => {
    const a = lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] });
    const s1 = run(
      initialExplorerState(),
      { type: 'openTab', tab: savedTab() },
      { type: 'addLenses', lenses: [a] },
    );
    expect(active(s1).work.lenses.at(-1)).toEqual(a);
    const s2 = run(s1, { type: 'updateLens', lens: { ...a, values: ['a', 'b'] } });
    expect(active(s2).work.lenses.at(-1)).toEqual({ ...a, values: ['a', 'b'] });
    const s3 = run(s2, { type: 'removeLens', lensId: a.id });
    expect(active(s3).work.lenses).toHaveLength(1);
    const custom = lens({ kind: 'custom', where: "Slug ~ 'x'" });
    const s4 = run(s3, {
      type: 'replaceFilter',
      lenses: [custom],
      resourceType: 'apps/v1/Deployment',
      whereData: 'spec.replicas > 1',
    });
    expect(active(s4).work).toMatchObject({
      lenses: [custom],
      resourceType: 'apps/v1/Deployment',
      whereData: 'spec.replicas > 1',
    });
  });

  test('columns: move, resize, hide (never the last one), set', () => {
    const s0 = run(initialExplorerState(), { type: 'openTab', tab: savedTab() });
    const names = active(s0).work.columns.map((c) => c.name);
    const s1 = run(s0, { type: 'moveColumn', from: 0, to: 2 });
    expect(active(s1).work.columns.map((c) => c.name)).toEqual([
      names[1],
      names[2],
      names[0],
      ...names.slice(3),
    ]);
    const s2 = run(s1, { type: 'resizeColumn', name: names[0], width: 233.4 });
    expect(active(s2).work.columns.find((c) => c.name === names[0])?.width).toBe(233);
    const s3 = run(s2, { type: 'setColumns', columns: [{ name: 'Slug' }] });
    expect(run(s3, { type: 'hideColumn', name: 'Slug' })).toBe(s3);
    const s4 = run(s2, { type: 'hideColumn', name: names[1] });
    expect(active(s4).work.columns.map((c) => c.name)).not.toContain(names[1]);
  });

  test('setEntity starts from that entity’s defaults and keeps the layout', () => {
    const s1 = run(
      initialExplorerState(),
      { type: 'openTab', tab: savedTab() },
      { type: 'setLayout', layout: 'board' },
      { type: 'setEntity', entity: 'Space' },
    );
    expect(active(s1).work).toEqual({ ...defaultViewDef('Space'), layout: 'board' });
  });

  test('group levels are unique', () => {
    const s1 = run(
      initialExplorerState(),
      { type: 'openTab', tab: savedTab() },
      { type: 'setGroupBy', groupBy: ['Space', 'Space', 'Target'] },
    );
    expect(active(s1).work.groupBy).toEqual(['Space', 'Target']);
  });
});

test.describe('tabs', () => {
  test('a blank temporary tab goes away when left; a used one stays', () => {
    const s1 = run(initialExplorerState(), { type: 'newTemp', tabId: 't1' });
    expect(isBlankTemp(active(s1))).toBe(true);
    expect(run(s1, { type: 'activate', tabId: BUILTIN_TAB_ID }).tabs.map((t) => t.id)).toEqual(
      [BUILTIN_TAB_ID],
    );
    const s2 = run(
      s1,
      { type: 'setLayout', layout: 'list' },
      { type: 'activate', tabId: BUILTIN_TAB_ID },
    );
    expect(s2.tabs.map((t) => t.id)).toEqual([BUILTIN_TAB_ID, 't1']);
  });

  test('saving a temporary tab makes it a clean saved tab', () => {
    const s1 = run(
      initialExplorerState(),
      { type: 'newTemp', tabId: 't1' },
      { type: 'setLayout', layout: 'list' },
    );
    const s2 = run(s1, {
      type: 'saved',
      tabId: 't1',
      name: 'Mine',
      viewId: 'v9',
      filterId: 'f9',
      spaceId: 's9',
    });
    const t = active(s2);
    expect(t).toMatchObject({
      kind: 'saved',
      name: 'Mine',
      viewId: 'v9',
      filterId: 'f9',
      spaceId: 's9',
    });
    expect(isDirty(t)).toBe(false);
    expect(isDirty(active(run(s2, { type: 'setLayout', layout: 'table' })))).toBe(true);
  });

  test('closing the active tab activates the one before it; pin, unpin, rename, mode', () => {
    const s1 = run(
      initialExplorerState(),
      { type: 'openTab', tab: savedTab('a') },
      { type: 'openTab', tab: savedTab('b') },
    );
    expect(run(s1, { type: 'closeTab', tabId: 'b' }).activeId).toBe('a');
    const s2 = run(
      s1,
      { type: 'unpin', tabId: 'a' },
      { type: 'renamed', tabId: 'a', name: 'Renamed' },
    );
    expect(s2.tabs.find((t) => t.id === 'a')).toMatchObject({
      pinned: false,
      name: 'Renamed',
    });
    expect(run(s2, { type: 'pin', tabId: 'a' }).tabs.find((t) => t.id === 'a')?.pinned).toBe(
      true,
    );
    expect(run(s2, { type: 'setMode', mode: 'text' }).mode).toBe('text');
    // Opening a tab that is already open only activates it.
    expect(run(s2, { type: 'openTab', tab: savedTab('a') }).tabs).toHaveLength(3);
  });

  test('the undo history is capped', () => {
    let s = run(initialExplorerState(), { type: 'openTab', tab: savedTab() });
    for (let i = 0; i < 130; i++)
      s = run(s, { type: 'resizeColumn', name: 'Slug', width: 100 + i });
    expect(active(s).history).toHaveLength(100);
  });
});

test.describe('edits made while a save is in flight', () => {
  test('the baseline is the def that was sent, so later edits stay unsaved', () => {
    const s0 = run(initialExplorerState(), { type: 'openTab', tab: savedTab() });
    const sent = active(run(s0, { type: 'setLayout', layout: 'board' })).work;
    const s1 = run(
      s0,
      { type: 'setLayout', layout: 'board' },
      { type: 'setGroupBy', groupBy: ['Space'] },
    );
    const s2 = run(s1, {
      type: 'saved',
      tabId: 'saved-1',
      name: 'Unreleased',
      viewId: 'v1',
      filterId: 'f1',
      spaceId: 's1',
      def: sent,
    });
    const tab = active(s2);
    expect(tab.baseline).toEqual(sent);
    expect(isDirty(tab)).toBe(true);
    expect(tab.baseline && diffViewDefs(tab.baseline, tab.work)).toEqual(['Grouped by Space']);
  });

  test('a first save of a temporary tab also keeps the late edits unsaved', () => {
    const s0 = run(
      initialExplorerState(),
      { type: 'newTemp', tabId: 't1' },
      { type: 'setLayout', layout: 'list' },
    );
    const sent = active(s0).work;
    const s1 = run(s0, { type: 'setSort', sort: { column: 'Slug', dir: 'ASC' } });
    const s2 = run(s1, {
      type: 'saved',
      tabId: 't1',
      name: 'Mine',
      viewId: 'v9',
      filterId: 'f9',
      spaceId: 's9',
      def: sent,
    });
    expect(isDirty(active(s2))).toBe(true);
    expect(active(s2).baseline).toEqual(sent);
  });

  test('without def the work at dispatch time is the baseline, as before', () => {
    const s0 = run(
      initialExplorerState(),
      { type: 'openTab', tab: savedTab() },
      { type: 'setLayout', layout: 'board' },
    );
    const s1 = run(s0, {
      type: 'saved',
      tabId: 'saved-1',
      name: 'x',
      viewId: 'v1',
      filterId: 'f1',
      spaceId: 's1',
    });
    expect(isDirty(active(s1))).toBe(false);
  });
});

test.describe('batch: several edits as one step', () => {
  test('a drill (new filter + table layout) is undone by one undo', () => {
    const s0 = run(
      initialExplorerState(),
      { type: 'openTab', tab: savedTab() },
      { type: 'setLayout', layout: 'matrix' },
    );
    const before = active(s0).work;
    const drill = [
      lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] }),
      lens({ kind: 'field', field: 'Target', op: 'is', values: ['t'] }),
    ];
    const s1 = run(s0, {
      type: 'batch',
      actions: [
        { type: 'replaceFilter', lenses: drill, resourceType: '', whereData: '' },
        { type: 'setLayout', layout: 'table' },
      ],
    });
    expect(active(s1).work).toMatchObject({ lenses: drill, layout: 'table' });
    expect(active(s1).history).toHaveLength(active(s0).history.length + 1);
    expect(active(run(s1, { type: 'undo' })).work).toEqual(before);
  });

  test('on "All units" a batch opens one temporary tab, and one undo goes back', () => {
    const s0 = initialExplorerState();
    const s1 = run(s0, {
      type: 'batch',
      actions: [
        { type: 'addLenses', lenses: [lens({ kind: 'status', status: 'unreleased' })] },
        { type: 'setLayout', layout: 'board' },
      ],
    });
    expect(s1.tabs).toHaveLength(2);
    expect(active(s1).kind).toBe('temp');
    expect(active(s1).history).toEqual([s0.tabs[0].work]);
    expect(active(run(s1, { type: 'undo' })).work).toEqual(s0.tabs[0].work);
  });

  test('a batch that changes nothing adds no step', () => {
    const s0 = run(initialExplorerState(), { type: 'openTab', tab: savedTab() });
    expect(run(s0, { type: 'batch', actions: [{ type: 'setLayout', layout: 'table' }] })).toBe(
      s0,
    );
    expect(run(s0, { type: 'batch', actions: [] })).toBe(s0);
  });
});

test.describe('a batch that ends where it started', () => {
  test('returns the same state: no history steps that change nothing', () => {
    const s0 = run(initialExplorerState(), { type: 'openTab', tab: savedTab() });
    const s1 = run(s0, {
      type: 'batch',
      actions: [
        { type: 'setLayout', layout: 'board' },
        { type: 'setLayout', layout: 'table' },
      ],
    });
    expect(s1).toBe(s0);
    expect(active(s1).history).toEqual([]);
  });

  test('on "All units" it opens no temporary tab', () => {
    const s0 = initialExplorerState();
    const s1 = run(s0, {
      type: 'batch',
      actions: [
        { type: 'setLayout', layout: 'board' },
        { type: 'setLayout', layout: 'table' },
      ],
    });
    expect(s1).toBe(s0);
  });
});

test.describe('tab ids of forks', () => {
  test('a fork after restored temporary tabs gets an id no tab has', () => {
    const restored: TabState = {
      id: 'temp-1',
      kind: 'temp',
      name: '',
      baseline: null,
      work: { ...defaultViewDef('Unit'), layout: 'list' },
      history: [],
      pinned: false,
    };
    const s0: ExplorerState = {
      ...initialExplorerState(),
      tabs: [...initialExplorerState().tabs, restored],
    };
    expect(s0.seq).toBe(0);
    const s1 = run(s0, {
      type: 'addLenses',
      lenses: [lens({ kind: 'status', status: 'unreleased' })],
    });
    const ids = s1.tabs.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s1.tabs.find((t) => t.id === 'temp-1')?.work.layout).toBe('list');
    expect(active(s1).work.lenses).toHaveLength(1);
    // Another fork is unique too.
    const s2 = run(
      s1,
      { type: 'activate', tabId: BUILTIN_TAB_ID },
      { type: 'setLayout', layout: 'board' },
    );
    const ids2 = s2.tabs.map((t) => t.id);
    expect(new Set(ids2).size).toBe(ids2.length);
  });
});

test('a renamed temporary tab with no changes is not blank', () => {
  const s0 = run(
    initialExplorerState(),
    { type: 'newTemp', tabId: 't1' },
    { type: 'renamed', tabId: 't1', name: 'Mine' },
  );
  expect(isBlankTemp(active(s0))).toBe(false);
  expect(run(s0, { type: 'activate', tabId: BUILTIN_TAB_ID }).tabs.map((t) => t.id)).toContain(
    't1',
  );
});

test('undo with a tab id acts on that tab, not the active one', () => {
  const s0 = run(
    initialExplorerState(),
    { type: 'openTab', tab: savedTab('a') },
    { type: 'setLayout', layout: 'board' },
    { type: 'discard' },
    { type: 'openTab', tab: savedTab('b') },
    { type: 'setLayout', layout: 'list' },
  );
  expect(s0.activeId).toBe('b');
  const s1 = run(s0, { type: 'undo', tabId: 'a' });
  expect(s1.tabs.find((t) => t.id === 'a')?.work.layout).toBe('board');
  expect(s1.tabs.find((t) => t.id === 'b')?.work.layout).toBe('list');
  expect(s1.activeId).toBe('b');
  expect(run(s0, { type: 'undo', tabId: 'nope' })).toBe(s0);
});

test('editTargetTabId names the tab an edit will land in, the fork included', () => {
  const s0 = initialExplorerState();
  const target = editTargetTabId(s0);
  const s1 = run(s0, {
    type: 'batch',
    actions: [
      { type: 'addLenses', lenses: [lens({ kind: 'status', status: 'unreleased' })] },
      { type: 'setLayout', layout: 'table' },
    ],
  });
  expect(s1.activeId).toBe(target);
  const s2 = run(s1, { type: 'openTab', tab: savedTab('x') });
  expect(editTargetTabId(s2)).toBe('x');
});

test.describe('fork ids across browser tabs', () => {
  test('two pages from the same stored state make different fork ids', () => {
    const restored: TabState = {
      id: 'temp-4',
      kind: 'temp',
      name: '',
      baseline: null,
      work: { ...defaultViewDef('Unit'), layout: 'list' },
      history: [],
      pinned: false,
    };
    const page = (prefix: string): ExplorerState => {
      const s = initialExplorerState(defaultViewDef('Unit'), prefix);
      return { ...s, tabs: [...s.tabs, restored] };
    };
    const edit = { type: 'setLayout', layout: 'board' } as const;
    const a = run(page(makeForkPrefix(1_000, () => 0.11)), edit);
    const b = run(page(makeForkPrefix(1_000, () => 0.97)), edit);
    expect(a.activeId).not.toBe(b.activeId);
    expect(a.activeId).toMatch(/^temp-/);
    // Still above the restored tab's number, and named in advance by editTargetTabId.
    expect(a.activeId).toMatch(/-5$/);
    const s = page(makeForkPrefix(2_000, () => 0.5));
    expect(run(s, edit).activeId).toBe(editTargetTabId(s));
  });

  test('a prefix is short, lower-case and differs per call', () => {
    expect(makeForkPrefix()).toMatch(/^[a-z0-9]+$/);
    expect(makeForkPrefix()).not.toBe(makeForkPrefix());
  });
});

test('setMatrixAxes: a sort is one undo step, and name ascending is stored as no sort', () => {
  const s0 = run(
    initialExplorerState(),
    { type: 'openTab', tab: savedTab() },
    { type: 'setLayout', layout: 'matrix' },
  );
  const before = active(s0).work.matrix;
  const s1 = run(s0, {
    type: 'setMatrixAxes',
    matrix: { ...before, rowSort: { key: 'total', dir: 'DESC' } },
  });
  expect(active(s1).work.matrix.rowSort).toEqual({ key: 'total', dir: 'DESC' });
  expect(active(run(s1, { type: 'undo' })).work.matrix).toEqual(before);
  const s2 = run(s1, {
    type: 'setMatrixAxes',
    matrix: { ...before, rowSort: { key: 'name', dir: 'ASC' } },
  });
  expect(active(s2).work.matrix).toEqual(before);
  // Name ascending is no sort: the view equals the one before any sort was set.
  expect(active(s2).work).toEqual(active(s0).work);
});
