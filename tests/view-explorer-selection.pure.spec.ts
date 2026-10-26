// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Row selection in the Table: toggling, ⇧ ranges over the rows on screen,
 * select all, pruning, the selection that counts (picked ∩ shown), the
 * first five in table order and their slot letters; and the table order
 * itself, which the row panel's ↑/↓ follows too; and the changes the
 * Functions panel makes to its list of Units, applied to the selection.
 */
import { expect, test } from '@playwright/test';

import type { ExtendedUnitRead } from '@confighub/rtk-query';

import type { EntityRow } from '../src/pages/x/view-explorer/model/fields';
import {
  EMPTY_SELECTION,
  type RowSelection,
  applyPanelChange,
  applyRange,
  clear,
  compareSet,
  effective,
  orderedPicked,
  panelChange,
  pick,
  prune,
  rangeBetween,
  sameIds,
  selectAll,
  slotLetters,
  toggle,
  unselect,
} from '../src/pages/x/view-explorer/model/selection';
import { orderedRowIds, orderedRows } from '../src/pages/x/view-explorer/model/table-order';

const sel = (ids: string[], anchor: string | null = null): RowSelection => ({ ids: new Set(ids), anchor });
const ids = (s: RowSelection | ReadonlySet<string>) => [...('ids' in s ? s.ids : s)].sort();

const ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

test.describe('toggle', () => {
  test('picks and unpicks one row, and makes it the anchor', () => {
    const one = toggle(EMPTY_SELECTION, 'b');
    expect(ids(one)).toEqual(['b']);
    expect(one.anchor).toBe('b');
    const none = toggle(one, 'b');
    expect(ids(none)).toEqual([]);
    expect(none.anchor).toBe('b');
  });

  test('never changes the selection it was given', () => {
    const before = sel(['a']);
    toggle(before, 'c');
    expect(ids(before)).toEqual(['a']);
  });
});

test.describe('pick', () => {
  test('picks a row and leaves a picked row as it is, the same selection', () => {
    const one = pick(sel(['a']), 'b');
    expect(ids(one)).toEqual(['a', 'b']);
    expect(one.anchor).toBe('b');
    expect(pick(one, 'b')).toBe(one);
    const before = sel(['a']);
    pick(before, 'c');
    expect(ids(before)).toEqual(['a']);
  });
});

test.describe('ranges', () => {
  test('run from the anchor to the target, either way round', () => {
    expect(rangeBetween(ORDER, 'b', 'e')).toEqual(['b', 'c', 'd', 'e']);
    expect(rangeBetween(ORDER, 'e', 'b')).toEqual(['b', 'c', 'd', 'e']);
    expect(rangeBetween(ORDER, 'c', 'c')).toEqual(['c']);
  });

  test('are the target alone without an anchor on screen, and nothing for a target off screen', () => {
    expect(rangeBetween(ORDER, null, 'd')).toEqual(['d']);
    expect(rangeBetween(ORDER, 'zz', 'd')).toEqual(['d']);
    expect(rangeBetween(ORDER, 'a', 'zz')).toEqual([]);
  });

  test('⇧-click on an unpicked row picks the range, and keeps the anchor', () => {
    const next = applyRange(sel(['b'], 'b'), ORDER, 'e');
    expect(ids(next)).toEqual(['b', 'c', 'd', 'e']);
    expect(next.anchor).toBe('b');
    // A second ⇧-click from the same anchor grows the range further.
    expect(ids(applyRange(next, ORDER, 'g'))).toEqual(['b', 'c', 'd', 'e', 'f', 'g']);
  });

  test('⇧-click on a picked row unpicks the range', () => {
    const next = applyRange(sel(['a', 'b', 'c', 'd', 'e'], 'a'), ORDER, 'c');
    expect(ids(next)).toEqual(['d', 'e']);
  });

  test('skips rows that are not in the order given (a folded group)', () => {
    // `c` and `d` are in a folded group: not on screen, so not in the range.
    const visible = ['a', 'b', 'e', 'f'];
    expect(ids(applyRange(sel(['a'], 'a'), visible, 'f'))).toEqual(['a', 'b', 'e', 'f']);
  });

  test('with no anchor it picks the target and anchors there', () => {
    const next = applyRange(EMPTY_SELECTION, ORDER, 'c');
    expect(ids(next)).toEqual(['c']);
    expect(next.anchor).toBe('c');
  });
});

test.describe('select all, unselect, clear, prune', () => {
  test('select all adds to what is picked', () => {
    expect(ids(selectAll(sel(['z']), ['a', 'b']))).toEqual(['a', 'b', 'z']);
  });

  test('unselect removes only the rows named, so rows a filter hides stay picked', () => {
    expect(ids(unselect(sel(['a', 'b', 'hidden'], 'a'), ['a', 'b']))).toEqual(['hidden']);
    expect(unselect(sel(['a'], 'a'), ['a']).anchor).toBeNull();
  });

  test('clear empties the selection', () => {
    expect(ids(clear())).toEqual([]);
    expect(clear().anchor).toBeNull();
  });

  test('prune drops rows that no longer exist, and an anchor among them', () => {
    const pruned = prune(sel(['a', 'gone'], 'gone'), new Set(['a', 'b']));
    expect(ids(pruned)).toEqual(['a']);
    expect(pruned.anchor).toBeNull();
    const same = sel(['a'], 'a');
    expect(prune(same, new Set(['a']))).toBe(same);
  });
});

test.describe('the selection that counts', () => {
  test('is the picked rows that are shown', () => {
    expect(ids(effective(sel(['a', 'b', 'hidden']), new Set(['a', 'b', 'c'])))).toEqual(['a', 'b']);
  });

  test('comes back whole when the filter goes', () => {
    const stored = sel(['a', 'hidden']);
    expect(ids(effective(stored, new Set(['a'])))).toEqual(['a']);
    expect(ids(effective(stored, new Set(['a', 'hidden'])))).toEqual(['a', 'hidden']);
  });
});

test.describe('the comparison of a selection', () => {
  test('is the first five picked rows in table order, with the rest counted', () => {
    const picked = new Set(['g', 'a', 'c', 'e', 'f', 'b', 'd']);
    expect(orderedPicked(ORDER, picked)).toEqual(ORDER);
    expect(compareSet(picked, ORDER)).toEqual({ ids: ['a', 'b', 'c', 'd', 'e'], overflow: 2 });
    expect(compareSet(new Set(['c', 'a']), ORDER)).toEqual({ ids: ['a', 'c'], overflow: 0 });
  });

  test('gives letters A–E to the first five in table order, and none to the rest', () => {
    const letters = slotLetters(ORDER, new Set(['g', 'f', 'e', 'd', 'c', 'b']));
    expect([...letters.entries()]).toEqual([
      ['b', 'A'],
      ['c', 'B'],
      ['d', 'C'],
      ['e', 'D'],
      ['f', 'E'],
    ]);
    expect(letters.has('g')).toBe(false);
    expect(slotLetters(ORDER, new Set()).size).toBe(0);
  });
});

function unit(id: string, slug: string, space: string): EntityRow {
  const row: ExtendedUnitRead = {
    Unit: { UnitID: id, Slug: slug, SpaceID: space } as ExtendedUnitRead['Unit'],
    Space: { SpaceID: space, Slug: space } as ExtendedUnitRead['Space'],
  };
  return row;
}

test.describe('table order', () => {
  const rows = [unit('1', 'alpha', 'zeta'), unit('2', 'beta', 'eta'), unit('3', 'gamma', 'zeta'), unit('4', 'delta', 'eta')];
  const rowId = (r: EntityRow) => (r as ExtendedUnitRead).Unit?.UnitID ?? '';

  test('is the sorted order when the view is not grouped', () => {
    expect(orderedRowIds(rows, [], 'Unit', rowId)).toEqual(['1', '2', '3', '4']);
    expect(orderedRows(rows, [], 'Unit')).toBe(rows);
  });

  test('follows the groups, keeping the sort inside each', () => {
    expect(orderedRowIds(rows, ['Space'], 'Unit', rowId)).toEqual(['2', '4', '1', '3']);
  });

  test('ignores a group level that is not a field', () => {
    expect(orderedRowIds(rows, ['NotAField'], 'Unit', rowId)).toEqual(['1', '2', '3', '4']);
  });
});

test.describe('the Functions panel list', () => {
  const sel = (ids: string[], anchor: string | null = null): RowSelection => ({ ids: new Set(ids), anchor });
  const shown = new Set(['a', 'b', 'c', 'd']);

  test('sameIds compares contents and order', () => {
    expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameIds([], [])).toBe(true);
    expect(sameIds(['a'], ['a', 'b'])).toBe(false);
  });

  test('a Unit taken out of the list is unpicked; the others stay', () => {
    const change = panelChange(['a', 'b', 'c'], ['a', 'c'], shown);
    expect(change).toEqual({ clear: false, removed: ['b'], added: [] });
    expect([...applyPanelChange(sel(['a', 'b', 'c'], 'b'), change!).ids].sort()).toEqual(['a', 'c']);
  });

  test('"deselect all" clears the selection, rows a filter hides included', () => {
    const change = panelChange(['a', 'b'], [], shown, true);
    expect(change?.clear).toBe(true);
    expect(applyPanelChange(sel(['a', 'b', 'hidden'], 'a'), change!)).toBe(EMPTY_SELECTION);
  });

  test('taking out the last Unit unpicks that row only: rows a filter hides stay picked', () => {
    const change = panelChange(['a'], [], shown, false);
    expect(change).toEqual({ clear: false, removed: ['a'], added: [] });
    expect([...applyPanelChange(sel(['a', 'hidden1', 'hidden2'], 'a'), change!).ids].sort()).toEqual(['hidden1', 'hidden2']);
  });

  test('a Unit put in is picked only when the table shows it', () => {
    expect(panelChange(['a'], ['a', 'c', 'gone'], shown)).toEqual({ clear: false, removed: [], added: ['c'] });
    expect([...applyPanelChange(sel(['a']), { clear: false, removed: [], added: ['c'] }).ids].sort()).toEqual(['a', 'c']);
  });

  test('nothing the selection can take is null: the explorer writes its own list back', () => {
    expect(panelChange(['a'], ['a', 'gone'], shown)).toBeNull();
    expect(panelChange([], [], shown)).toBeNull();
    expect(panelChange([], [], shown, true)).toBeNull();
    // The same Units in another order change nothing either.
    expect(panelChange(['a', 'b'], ['b', 'a'], shown)).toBeNull();
  });
});

test.describe('the invoker request', () => {
  test('opening the invoker for the selection leaves a Trigger request as it is', async () => {
    const { invokerRequestSlice, requestInvokerOpen, requestTriggerCreation, clearInvokerRequest } = await import('../src/state/slices/invokerRequest');
    const reduce = invokerRequestSlice.reducer;
    let state = reduce(undefined, { type: '@@init' });
    state = reduce(state, requestTriggerCreation({ spaceId: 's1' }));
    state = reduce(state, clearInvokerRequest());
    const opened = reduce(state, requestInvokerOpen());
    expect(opened.openSeq).toBe(state.openSeq + 1);
    // `seq` is what the Trigger save panel keys on; a plain open does not touch it.
    expect(opened.seq).toBe(state.seq);
    expect(opened.createTriggerInSpaceId).toBeNull();
  });

  test('"deselect all" is told apart from taking out the last Unit, and other writes reset it', async () => {
    const { selectedUnitsSlice, removeAllSelectedUnits, setSelectedUnits } = await import('../src/state/slices/selectedUnits');
    const reduce = selectedUnitsSlice.reducer;
    const one = { Unit: { UnitID: 'u1' } } as ExtendedUnitRead;
    let state = reduce(undefined, setSelectedUnits({ units: [one] }));
    state = reduce(state, setSelectedUnits({ units: [] }));
    expect(state).toMatchObject({ units: [], removedAll: false });
    state = reduce(state, setSelectedUnits({ units: [one] }));
    state = reduce(state, removeAllSelectedUnits());
    expect(state).toMatchObject({ units: [], removedAll: true });
    expect(reduce(state, setSelectedUnits({ units: [one] })).removedAll).toBe(false);
  });
});
