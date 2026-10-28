// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The list consoles' sorting (`components/console-table/consoleTableColumns.ts`),
// run through TanStack Table itself, without a page: the order of values, the
// header cycle, and that a console's own order holds with no sort and within ties.

import { expect, test } from '@playwright/test';
import { constructTable } from '@tanstack/react-table';
// `useTable` supplies React's bindings; a table built outside React takes TanStack Store's.
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings';

import {
  compareSortValues,
  consoleTableFeatures,
  toColumnDefs,
  type ConsoleTableColumn,
} from '../src/components/console-table/consoleTableColumns';

interface Item {
  id: string;
  name: string;
  seen?: string;
  rank: number;
}

/** The console's own order, which is none of the columns' orders. */
const DATA: Item[] = [
  { id: 'c', name: 'web-10', seen: '2026-10-02T09:00:00Z', rank: 2 },
  { id: 'a', name: 'Web-2', seen: '2026-09-30T23:00:00Z', rank: 1 },
  { id: 'd', name: 'api', rank: 2 },
  { id: 'b', name: 'db', seen: '2026-10-05T12:00:00Z', rank: 1 },
];

const COLUMNS: ConsoleTableColumn<Item>[] = [
  { id: 'name', header: 'Name', sortValue: (row) => row.name },
  { id: 'seen', header: 'Last seen', sortValue: (row) => (row.seen === undefined ? undefined : new Date(row.seen)) },
  { id: 'rank', header: 'Rank', sortValue: (row) => row.rank },
  { id: 'seenTime', header: 'Last seen time', sortValue: (row) => Date.parse(row.seen ?? '') },
  { id: 'rankThenName', header: 'Rank, then name', compare: (a, b) => a.rank - b.rank || a.name.localeCompare(b.name) },
  { id: 'off', header: 'Off', sortValue: (row) => row.name, enableSorting: false },
  { id: 'action', header: '' },
];

function tableOf(data: Item[] = DATA) {
  return constructTable({
    features: { ...consoleTableFeatures, coreReactivityFeature: storeReactivityBindings() },
    columns: toColumnDefs(COLUMNS),
    data,
    getRowId: (row) => row.id,
    enableMultiSort: false,
  });
}

const ids = (table: ReturnType<typeof tableOf>) => table.getRowModel().rows.map((row) => row.id);

test('values: numbers and dates by size, text case-blind with digit runs as numbers, no value last', () => {
  expect(compareSortValues(2, 10)).toBeLessThan(0);
  expect(compareSortValues(new Date('2026-10-02'), new Date('2026-09-30'))).toBeGreaterThan(0);
  expect(compareSortValues('web-2', 'web-10')).toBeLessThan(0);
  expect(compareSortValues('Web', 'web')).toBe(0);
  expect(compareSortValues(false, true)).toBeLessThan(0);
  expect(compareSortValues(undefined, 'a')).toBeGreaterThan(0);
  expect(compareSortValues('a', null)).toBeLessThan(0);
  expect(compareSortValues(new Date('not a date'), new Date('2026-10-02'))).toBeGreaterThan(0);
  expect(compareSortValues(undefined, null)).toBe(0);
});

test('with no sort the rows keep the order they were given', () => {
  expect(ids(tableOf())).toEqual(['c', 'a', 'd', 'b']);
});

test('a header cycles ascending, descending, then the given order', () => {
  const table = tableOf();
  const name = table.getColumn('name')!;
  expect(name.getCanSort()).toBe(true);

  name.toggleSorting();
  expect(name.getIsSorted()).toBe('asc');
  expect(ids(table)).toEqual(['d', 'b', 'a', 'c']);

  name.toggleSorting();
  expect(name.getIsSorted()).toBe('desc');
  expect(ids(table)).toEqual(['c', 'a', 'b', 'd']);

  name.toggleSorting();
  expect(name.getIsSorted()).toBe(false);
  expect(ids(table)).toEqual(['c', 'a', 'd', 'b']);
});

test('dates sort as dates, and a row with none is last in both directions', () => {
  const table = tableOf();
  table.setSorting([{ id: 'seen', desc: false }]);
  expect(ids(table)).toEqual(['a', 'c', 'b', 'd']);
  table.setSorting([{ id: 'seen', desc: true }]);
  expect(ids(table)).toEqual(['b', 'c', 'a', 'd']);
});

test('a number that is NaN is no value, last in both directions', () => {
  const table = tableOf();
  table.setSorting([{ id: 'seenTime', desc: false }]);
  expect(ids(table)).toEqual(['a', 'c', 'b', 'd']);
  table.setSorting([{ id: 'seenTime', desc: true }]);
  expect(ids(table)).toEqual(['b', 'c', 'a', 'd']);
});

test('rows that tie keep the given order, in both directions', () => {
  const table = tableOf();
  table.setSorting([{ id: 'rank', desc: false }]);
  expect(ids(table)).toEqual(['a', 'b', 'c', 'd']);
  table.setSorting([{ id: 'rank', desc: true }]);
  expect(ids(table)).toEqual(['c', 'd', 'a', 'b']);
});

test('a compare function orders whole rows', () => {
  const table = tableOf();
  table.setSorting([{ id: 'rankThenName', desc: false }]);
  expect(ids(table)).toEqual(['b', 'a', 'd', 'c']);
});

test('a column without a sort value, or with sorting turned off, does not sort', () => {
  const table = tableOf();
  expect(table.getColumn('off')!.getCanSort()).toBe(false);
  expect(table.getColumn('action')!.getCanSort()).toBe(false);
  table.setSorting([{ id: 'off', desc: false }]);
  expect(ids(table)).toEqual(['c', 'a', 'd', 'b']);
});
