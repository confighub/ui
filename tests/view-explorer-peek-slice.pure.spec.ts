// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A peek shows the group's own rows; "Pin as draft" and "Add as filter" may
 * act only when the slice's filters keep exactly those rows. And the slice
 * joins the view's lenses without fighting them.
 */
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { type EntityRow, unitStatusLabel } from '../src/pages/x/view-explorer/model/fields';
import type { Lens } from '../src/pages/x/view-explorer/model/types';
import { mergeSlice, peekSlice } from '../src/pages/x/view-explorer/peek/slice';
import { fakeUnits, unitId } from './fixtures/view-explorer-model-views';

const UNITS = fakeUnits(200);
const rowId = (r: EntityRow) => unitId(r as ExtendedUnitRead);
const ids = (rows: readonly ExtendedUnitRead[]) => rows.map(unitId);

test.describe('peekSlice', () => {
  test('a group its filter matches exactly: the rows, and nothing blocks', () => {
    const group = UNITS.filter((u) => u.Unit?.Labels?.app === 'cart');
    const r = peekSlice(
      'Unit',
      UNITS,
      rowId,
      [{ kind: 'field', field: 'Labels.app', op: 'is', values: ['cart'] }],
      ids(group),
    );
    expect(r.rows.map(rowId)).toEqual(ids(group));
    expect(r.blocked).toBeNull();
  });

  test('a status group is not its status filter: the group rows, and the actions are blocked with the reason', () => {
    // A Unit counts once in the Status column, by its most urgent state; the
    // released filter also keeps released Units that need an upgrade.
    const group = UNITS.filter((u) => unitStatusLabel(u) === 'Released');
    const r = peekSlice(
      'Unit',
      UNITS,
      rowId,
      [{ kind: 'status', status: 'released' }],
      ids(group),
    );
    expect(r.rows).toHaveLength(group.length);
    const byFilter = peekSlice('Unit', UNITS, rowId, [{ kind: 'status', status: 'released' }])
      .rows.length;
    expect(byFilter).toBeGreaterThan(group.length);
    expect(r.blocked).toContain(`these ${group.length} units`);
    expect(r.blocked).toContain(`the closest one shows ${byFilter}`);
    expect(r.blocked).toContain('status group');
  });

  test('a group value no filter can hold (a literal *) blocks; the rows are still the group rows', () => {
    const group = UNITS.slice(0, 3);
    const r = peekSlice(
      'Unit',
      UNITS,
      rowId,
      [{ kind: 'field', field: 'Labels.app', op: 'is', values: ['a*b'] }],
      ids(group),
    );
    expect(r.rows.map(rowId)).toEqual(ids(group));
    expect(r.blocked).toContain('No filter can say this part of the view');
  });

  test('a level with no filter form keeps the parent lenses: blocked when the rows differ', () => {
    const parent = UNITS.filter((u) => u.Unit?.Labels?.app === 'cart');
    const part = parent.slice(0, 1);
    const r = peekSlice(
      'Unit',
      UNITS,
      rowId,
      [{ kind: 'field', field: 'Labels.app', op: 'is', values: ['cart'] }],
      ids(part),
    );
    expect(r.rows).toHaveLength(1);
    expect(r.blocked).toContain('the closest one shows');
  });
});

test.describe('mergeSlice', () => {
  let n = 0;
  const id = () => `new-${++n}`;
  const lens = (l: Partial<Lens> & Pick<Lens, 'id' | 'kind'>) =>
    ({ enabled: true, ...l }) as Lens;

  test('an is value takes the place of an is lens on the same field, enabled again', () => {
    const before = [
      lens({
        id: 's',
        kind: 'field',
        field: 'Space',
        op: 'is',
        values: ['a', 'b'],
        enabled: false,
      } as Lens),
    ];
    const { lenses, touched } = mergeSlice(
      before,
      [{ kind: 'field', field: 'Space', op: 'is', values: ['a'] }],
      id,
    );
    expect(lenses).toEqual([
      { id: 's', kind: 'field', field: 'Space', op: 'is', values: ['a'], enabled: true },
    ]);
    expect(touched).toEqual(['s']);
  });

  test('a status already a lens is enabled; other comparisons stay and the slice is added', () => {
    const before = [
      lens({ id: 'st', kind: 'status', status: 'unreleased', enabled: false } as Lens),
      lens({
        id: 'm',
        kind: 'field',
        field: 'Space',
        op: 'matches',
        values: ['pay*'],
      } as Lens),
    ];
    const { lenses } = mergeSlice(
      before,
      [
        { kind: 'status', status: 'unreleased' },
        { kind: 'field', field: 'Space', op: 'is', values: ['payments-prod'] },
      ],
      id,
    );
    expect(lenses[0]).toMatchObject({ id: 'st', enabled: true });
    expect(lenses[1]).toMatchObject({ id: 'm', op: 'matches', values: ['pay*'] });
    expect(lenses[2]).toMatchObject({
      kind: 'field',
      field: 'Space',
      op: 'is',
      values: ['payments-prod'],
      enabled: true,
    });
  });
});
