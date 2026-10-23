// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The shared row sort: typed comparison, nulls last both ways, stability,
 * several keys, and group orders that agree with the sort.
 */
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { EMPTY_GROUP_VALUE } from '../src/components/group-nav/groupOrder';
import { buildGroupTree } from '../src/pages/x/view-explorer/model/grouping';
import { groupLevelFor, sortRows } from '../src/pages/x/view-explorer/model/sort';
import { fakeUnits } from './fixtures/view-explorer-model-views';

function unit(
  slug: string,
  extra: Partial<NonNullable<ExtendedUnitRead['Unit']>> = {},
  target?: string,
): ExtendedUnitRead {
  return {
    Unit: {
      UnitID: slug,
      Slug: slug,
      ToolchainType: 'Kubernetes/YAML',
      TargetID: target ? `t-${target}` : undefined,
      ...extra,
    },
    Target: target ? { Slug: target } : undefined,
  };
}

const slugs = (rows: ExtendedUnitRead[]) => rows.map((r) => r.Unit?.Slug);

test('text sorts with numeric awareness, both directions', () => {
  const rows = [unit('unit-10'), unit('unit-2'), unit('Unit-1'), unit('apple')];
  expect(slugs(sortRows('Unit', rows, { column: 'Slug', dir: 'ASC' }))).toEqual([
    'apple',
    'Unit-1',
    'unit-2',
    'unit-10',
  ]);
  expect(slugs(sortRows('Unit', rows, { column: 'Slug', dir: 'DESC' }))).toEqual([
    'unit-10',
    'unit-2',
    'Unit-1',
    'apple',
  ]);
});

test('numbers are numeric and times are by instant', () => {
  const rows = [
    unit('a', { HeadRevisionNum: 10, UpdatedAt: '2026-10-02T00:00:00Z' }),
    unit('b', { HeadRevisionNum: 9, UpdatedAt: '2026-10-01T23:00:00+02:00' }),
    unit('c', { HeadRevisionNum: 100, UpdatedAt: '2026-09-30T00:00:00Z' }),
  ];
  expect(slugs(sortRows('Unit', rows, { column: 'HeadRevisionNum', dir: 'ASC' }))).toEqual([
    'b',
    'a',
    'c',
  ]);
  // b is 21:00 UTC on 1 Oct, which is before a and after c.
  expect(slugs(sortRows('Unit', rows, { column: 'UpdatedAt', dir: 'DESC' }))).toEqual([
    'a',
    'b',
    'c',
  ]);
});

test('rows with no value go last in both directions', () => {
  const rows = [unit('a'), unit('b', {}, 'prod'), unit('c'), unit('d', {}, 'dev')];
  expect(slugs(sortRows('Unit', rows, { column: 'Target', dir: 'ASC' }))).toEqual([
    'd',
    'b',
    'a',
    'c',
  ]);
  expect(slugs(sortRows('Unit', rows, { column: 'Target', dir: 'DESC' }))).toEqual([
    'b',
    'd',
    'a',
    'c',
  ]);
});

test('stable, multi-key, and unknown or no sort keeps the input order', () => {
  const rows = [
    unit('x1', { HeadRevisionNum: 2 }),
    unit('x2', { HeadRevisionNum: 1 }),
    unit('x3', { HeadRevisionNum: 2 }),
    unit('x4', { HeadRevisionNum: 1 }),
  ];
  expect(slugs(sortRows('Unit', rows, { column: 'HeadRevisionNum', dir: 'ASC' }))).toEqual([
    'x2',
    'x4',
    'x1',
    'x3',
  ]);
  expect(
    slugs(
      sortRows('Unit', rows, [
        { column: 'HeadRevisionNum', dir: 'ASC' },
        { column: 'Slug', dir: 'DESC' },
      ]),
    ),
  ).toEqual(['x4', 'x2', 'x3', 'x1']);
  expect(slugs(sortRows('Unit', rows, null))).toEqual(['x1', 'x2', 'x3', 'x4']);
  expect(slugs(sortRows('Unit', rows, { column: 'NoSuchColumn', dir: 'ASC' }))).toEqual([
    'x1',
    'x2',
    'x3',
    'x4',
  ]);
  const copy = sortRows('Unit', rows, null);
  expect(copy).not.toBe(rows);
});

test('the Status column sorts by urgency', () => {
  const rows = [
    unit('released', { HeadRevisionNum: 2, LastReleasedRevisionNum: 2 }, 'prod'),
    unit('untargeted'),
    unit('unreleased', { HeadRevisionNum: 3, LastReleasedRevisionNum: 2 }, 'prod'),
  ];
  expect(slugs(sortRows('Unit', rows, { column: 'Status', dir: 'ASC' }))).toEqual([
    'unreleased',
    'untargeted',
    'released',
  ]);
});

test('group order agrees with an ascending sort, empty group last', () => {
  const rows = fakeUnits(120, 3);
  for (const column of ['HeadRevisionNum', 'Target', 'Space', 'Status', 'Labels.env']) {
    const level = groupLevelFor('Unit', column);
    if (!level) throw new Error(column);
    const groups = buildGroupTree(rows, [level]).map((g) => g.value);
    const sorted = sortRows('Unit', rows, { column, dir: 'ASC' });
    const firstSeen: string[] = [];
    for (const r of sorted) {
      const v = level.value(r);
      const key = v === null || v === '' ? EMPTY_GROUP_VALUE : String(v);
      if (!firstSeen.includes(key)) firstSeen.push(key);
    }
    expect(groups, column).toEqual(firstSeen);
  }
  const numeric = buildGroupTree(
    [unit('a', { HeadRevisionNum: 10 }), unit('b', { HeadRevisionNum: 9 })],
    [groupLevelFor('Unit', 'HeadRevisionNum')!],
  );
  expect(numeric.map((g) => g.value)).toEqual(['9', '10']);
  expect(groupLevelFor('Unit', 'NoSuchColumn')).toBeNull();
});
