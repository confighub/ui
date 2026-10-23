// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import { cellSummary, presentStatusKeys, sortAxis, sortLabel, statusSortKeys } from '../src/pages/x/view-explorer/layouts/matrix/matrix-model';
import { EMPTY_GROUP_VALUE, type GroupNode } from '../src/pages/x/view-explorer/model/grouping';

/**
 * Sorting one axis of the Matrix: by name, by total, or by how many rows have
 * a status. Ties keep the name order, and the empty group ("none") is last in
 * every order.
 */

/** A row is just its status here. */
type Row = string;

const group = (value: string, rows: Row[]): GroupNode<Row> => ({ key: `F=${value}`, depth: 0, field: 'F', value, rows, children: [] });

// In name order, as the matrix builds them: a, b, c, d, then the empty group.
const groups = [
  group('a', ['Released', 'Released']),
  group('b', ['Unreleased', 'Released', 'Unreleased']),
  group('c', ['Unreleased']),
  group('d', ['Released', 'Released']),
  group(EMPTY_GROUP_VALUE, ['Unreleased', 'Unreleased', 'Unreleased', 'Unreleased']),
];
const order = (sorted: GroupNode<Row>[]) => sorted.map((g) => g.value);
const statusOf = (r: Row) => r;

test.describe('matrix axis sort', () => {
  test('no sort, or Name A→Z, keeps the name order', () => {
    expect(order(sortAxis('Unit', groups, undefined, statusOf))).toEqual(['a', 'b', 'c', 'd', EMPTY_GROUP_VALUE]);
    expect(order(sortAxis('Unit', groups, { key: 'name', dir: 'ASC' }, statusOf))).toEqual(['a', 'b', 'c', 'd', EMPTY_GROUP_VALUE]);
  });

  test('Name Z→A reverses the names; the empty group stays last', () => {
    expect(order(sortAxis('Unit', groups, { key: 'name', dir: 'DESC' }, statusOf))).toEqual(['d', 'c', 'b', 'a', EMPTY_GROUP_VALUE]);
  });

  test('Total sorts by row count, ties in name order, the empty group last even when it is largest', () => {
    expect(order(sortAxis('Unit', groups, { key: 'total', dir: 'DESC' }, statusOf))).toEqual(['b', 'a', 'd', 'c', EMPTY_GROUP_VALUE]);
    expect(order(sortAxis('Unit', groups, { key: 'total', dir: 'ASC' }, statusOf))).toEqual(['c', 'a', 'd', 'b', EMPTY_GROUP_VALUE]);
  });

  test('a status sorts by how many rows have it', () => {
    expect(order(sortAxis('Unit', groups, { key: 'unreleased', dir: 'DESC' }, statusOf))).toEqual(['b', 'c', 'a', 'd', EMPTY_GROUP_VALUE]);
    expect(order(sortAxis('Unit', groups, { key: 'released', dir: 'DESC' }, statusOf))).toEqual(['a', 'd', 'b', 'c', EMPTY_GROUP_VALUE]);
  });

  test('Spaces count the Space statuses', () => {
    const spaces = [group('x', ['All released']), group('y', ['Has unreleased units', 'Has unreleased units']), group('z', ['Has unreleased units'])];
    expect(order(sortAxis('Space', spaces, { key: 'unreleased', dir: 'DESC' }, statusOf))).toEqual(['y', 'z', 'x']);
    expect(order(sortAxis('Space', spaces, { key: 'released', dir: 'DESC' }, statusOf))).toEqual(['x', 'y', 'z']);
    expect(statusSortKeys('Space')).toEqual(['unreleased', 'upgradable', 'released']);
    // A status Spaces do not have keeps the name order (not "All released").
    expect(order(sortAxis('Space', spaces, { key: 'untargeted', dir: 'DESC' }, statusOf))).toEqual(['x', 'y', 'z']);
  });

  test('the sort reads as words', () => {
    expect(sortLabel('Unit', undefined)).toBe('Name A→Z');
    expect(sortLabel('Unit', { key: 'total', dir: 'DESC' })).toBe('Total, most first');
    expect(sortLabel('Unit', { key: 'unreleased', dir: 'DESC' })).toBe('Most unreleased');
    expect(sortLabel('Unit', { key: 'upgradable', dir: 'DESC' })).toBe('Most to upgrade');
    expect(sortLabel('Space', { key: 'released', dir: 'DESC' })).toBe('Most fully released');
  });

  test('under a status sort a cell counts that status; the menu lists statuses most urgent first', () => {
    const mix = [
      { status: 'Unreleased', count: 2 },
      { status: 'Released', count: 5 },
    ];
    expect(cellSummary('Unit', mix)).toBe('2 unreleased');
    expect(cellSummary('Unit', mix, 'released')).toBe('5 released');
    expect(cellSummary('Unit', mix, 'upgradable')).toBe('0 to upgrade');
    expect(presentStatusKeys('Unit', [{ status: 'Unreleased', count: 1 }, { status: 'Upgrade available', count: 1 }, { status: 'Released', count: 1 }])).toEqual([
      'unreleased',
      'upgradable',
      'released',
    ]);
  });
});
