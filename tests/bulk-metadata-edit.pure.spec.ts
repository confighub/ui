// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import {
  type BulkRow,
  bulkMetadataPatch,
  isBulkMetadataEditEmpty,
  keepsEachValue,
  keyUsage,
  rowsToFieldEdit,
  usageToRows,
} from '../src/components/bulk-edit/bulkMetadataEdit';

// Three selected entities: all have tier=web, two give owner different values, one has a gate.
const labels = keyUsage([
  { tier: 'web', owner: 'alice' },
  { tier: 'web', owner: 'bob' },
  { tier: 'web' },
]);
const gates = keyUsage([{ keep: true }, null, undefined]);

const rowsOf = (usage = labels, isLabel = true) => usageToRows(usage, isLabel);
const withRow = (rows: BulkRow[], key: string, change: Partial<BulkRow>) =>
  rows.map((row) => (row.key === key ? { ...row, ...change } : row));

test('the rows start as the entities have their keys, which an untouched edit leaves alone', () => {
  expect(labels).toEqual([
    { key: 'owner', count: 2, values: ['alice', 'bob'] },
    { key: 'tier', count: 3, values: ['web'] },
  ]);
  expect(rowsOf().map((r) => [r.key, r.value])).toEqual([
    ['owner', ''],
    ['tier', 'web'],
  ]);
  const edit = {
    Labels: rowsToFieldEdit(labels, rowsOf(), true),
    DeleteGates: rowsToFieldEdit(gates, rowsOf(gates, false), false),
  };
  expect(isBulkMetadataEditEmpty(edit)).toBe(true);
  expect(bulkMetadataPatch(edit)).toEqual({});
});

test('a changed value is set on every entity, a removed row removes its key, and an added row sets its key', () => {
  let rows = withRow(rowsOf(), 'tier', { value: 'api' });
  rows = rows.filter((row) => row.key !== 'owner');
  rows = [
    ...rows,
    { id: 'new-1', key: 'team', value: 'core' },
    { id: 'new-2', key: '', value: '' },
  ];
  const gateRows: BulkRow[] = [{ id: 'new-3', key: 'manual-review', value: 'true' }];
  expect(
    bulkMetadataPatch({
      Labels: rowsToFieldEdit(labels, rows, true),
      DeleteGates: rowsToFieldEdit(gates, gateRows, false),
    }),
  ).toEqual({
    Labels: { tier: 'api', team: 'core', owner: null },
    DeleteGates: { 'manual-review': true, keep: null },
  });
});

test('a label the entities give different values keeps each value until one is typed', () => {
  expect(rowsToFieldEdit(labels, rowsOf(), true)).toEqual({ set: {}, remove: [] });
  expect(
    rowsToFieldEdit(labels, withRow(rowsOf(), 'owner', { value: 'carol' }), true),
  ).toEqual({
    set: { owner: 'carol' },
    remove: [],
  });
});

test('a renamed row removes the old key and sets the new one', () => {
  expect(rowsToFieldEdit(labels, withRow(rowsOf(), 'tier', { key: 'layer' }), true)).toEqual({
    set: { layer: 'web' },
    remove: ['tier'],
  });
});

test('a key removed in one row and added in another is set, not removed', () => {
  const rows: BulkRow[] = [
    ...rowsOf().filter((row) => row.key !== 'tier'),
    { id: 'new-1', key: 'tier', value: 'web' },
  ];
  expect(rowsToFieldEdit(labels, rows, true)).toEqual({ set: { tier: 'web' }, remove: [] });
});

test('a key only some entities have is put on the rest only when its row is marked for all', () => {
  // Untouched, the partial keys stay on the entities that have them (the first test).
  const gateRows = withRow(rowsOf(gates, false), 'keep', { toAll: true });
  expect(rowsToFieldEdit(gates, gateRows, false)).toEqual({
    set: { keep: 'true' },
    remove: [],
  });

  // The entities give owner different values, so marked for all it needs one to set.
  const owner = withRow(rowsOf(), 'owner', { toAll: true });
  expect(keepsEachValue(owner.find((row) => row.key === 'owner')!)).toBe(false);
  expect(rowsToFieldEdit(labels, withRow(owner, 'owner', { value: 'carol' }), true)).toEqual({
    set: { owner: 'carol' },
    remove: [],
  });
});
