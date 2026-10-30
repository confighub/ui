// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The rows the group panel draws (`groupTree.ts`): which nodes are on screen
// for a set of expanded nodes, and the ARIA tree facts each row carries. No
// page, no browser.

import { expect, test } from '@playwright/test';

import {
  type FlatTreeRow,
  ancestorIds,
  buildGroupTree,
  findTypeAheadIndex,
  flattenVisible,
} from '../src/components/group-nav/groupTree';
import { ALL_GROUPS } from '../src/components/group-nav/types';

interface Item {
  space: string;
  tier: string;
}

const ITEMS: Item[] = [
  { space: 'beta', tier: 'web' },
  { space: 'alpha', tier: 'web' },
  { space: 'alpha', tier: 'db' },
  { space: 'alpha', tier: '' },
  { space: 'gamma', tier: 'db' },
];

const getValue = (item: Item, column: string) => (column === 'Space' ? item.space : item.tier);
const tree = buildGroupTree(ITEMS, ['Space', 'Tier'], 0, [], getValue);
const ALL = { label: 'All', count: ITEMS.length };

/** `label@level` for each row, to read a whole list at once. */
const shape = (rows: FlatTreeRow[]) => rows.map((r) => `${r.label}@${r.depth + 1}`);

test.describe('flattenVisible', () => {
  test('with nothing expanded: the All row, then the top level', () => {
    const rows = flattenVisible(tree, new Set(), ALL);
    expect(shape(rows)).toEqual(['All@1', 'alpha@1', 'beta@1', 'gamma@1']);
    expect(rows[0]).toMatchObject({ id: ALL_GROUPS, isAll: true, path: [], count: 5 });
    expect(rows.slice(1).map((r) => r.count)).toEqual([3, 1, 1]);
  });

  test('the All row and the top level are one set', () => {
    const rows = flattenVisible(tree, new Set(), ALL);
    expect(rows.map((r) => [r.posInSet, r.setSize])).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
    expect(rows.every((r) => r.parentIndex === -1)).toBe(true);
  });

  test('an expanded node shows its children after it, one level down; (empty) is last', () => {
    const rows = flattenVisible(tree, new Set(['alpha']), ALL);
    expect(shape(rows)).toEqual([
      'All@1',
      'alpha@1',
      'db@2',
      'web@2',
      '(empty)@2',
      'beta@1',
      'gamma@1',
    ]);
    const children = rows.slice(2, 5);
    expect(children.map((r) => [r.posInSet, r.setSize])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(children.every((r) => r.parentIndex === 1)).toBe(true);
    expect(children[0]).toMatchObject({ id: 'alpha\0db', path: ['alpha', 'db'] });
  });

  test('expansion and children: only a node with children is expandable', () => {
    const rows = flattenVisible(tree, new Set(['alpha', 'alpha\0db']), ALL);
    const alpha = rows.find((r) => r.id === 'alpha');
    const db = rows.find((r) => r.id === 'alpha\0db');
    const beta = rows.find((r) => r.id === 'beta');
    expect(alpha).toMatchObject({ hasChildren: true, isExpanded: true });
    // At the deepest level a node has no children, so it never counts as expanded.
    expect(db).toMatchObject({ hasChildren: false, isExpanded: false });
    expect(beta).toMatchObject({ hasChildren: true, isExpanded: false });
  });

  test('a node under a collapsed ancestor is not shown, even when it is expanded itself', () => {
    const deep = buildGroupTree(ITEMS, ['Space', 'Tier', 'Space'], 0, [], getValue);
    const rows = flattenVisible(deep, new Set(['alpha\0db']), ALL);
    expect(shape(rows)).toEqual(['All@1', 'alpha@1', 'beta@1', 'gamma@1']);
  });

  test('item leaves are rows of their own under the last level', () => {
    const withLeaves = buildGroupTree(ITEMS, ['Space'], 0, [], getValue, {
      getId: (item) => `${item.space}-${item.tier || 'none'}`,
    });
    const rows = flattenVisible(withLeaves, new Set(['alpha']), ALL);
    expect(shape(rows)).toEqual([
      'All@1',
      'alpha@1',
      'alpha-db@2',
      'alpha-none@2',
      'alpha-web@2',
      'beta@1',
      'gamma@1',
    ]);
    expect(rows[2]).toMatchObject({ isItem: true, hasChildren: false, count: 1 });
  });

  test('an empty tree is just the All row', () => {
    expect(shape(flattenVisible([], new Set(), { label: 'Overview', count: 0 }))).toEqual([
      'Overview@1',
    ]);
  });

  test('thousands of top-level groups, with none expanded, stay one row each', () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({
      space: `space-${String(i).padStart(4, '0')}`,
      tier: 'web',
    }));
    const big = buildGroupTree(many, ['Space', 'Tier'], 0, [], getValue);
    const collapsed = flattenVisible(big, new Set(), ALL);
    expect(collapsed).toHaveLength(2501);
    const expanded = flattenVisible(big, new Set(big.map((n) => n.id)), ALL);
    expect(expanded).toHaveLength(5001);
    expect(expanded[2]).toMatchObject({ label: 'web', parentIndex: 1, depth: 1 });
  });
});

test.describe('ancestorIds', () => {
  test('the ids of every node above the selected one', () => {
    expect(ancestorIds(['a', 'b', 'c'])).toEqual(['a', 'a\0b']);
    expect(ancestorIds(['a'])).toEqual([]);
    expect(ancestorIds(null)).toEqual([]);
  });
});

test.describe('findTypeAheadIndex', () => {
  const rows = flattenVisible(tree, new Set(['alpha']), ALL);

  test('finds the next row starting with the letter, ignoring case', () => {
    // From "alpha" (1), the next "w" is "web" (3).
    expect(findTypeAheadIndex(rows, 1, 'W')).toBe(3);
  });

  test('wraps round to the start', () => {
    // From "gamma" (6), the next "a" wraps to "All" (0).
    expect(findTypeAheadIndex(rows, 6, 'a')).toBe(0);
    expect(findTypeAheadIndex(rows, 0, 'a')).toBe(1);
  });

  test('with no row focused, starts from the top', () => {
    expect(findTypeAheadIndex(rows, -1, 'g')).toBe(6);
  });

  test('-1 when nothing matches', () => {
    expect(findTypeAheadIndex(rows, 0, 'z')).toBe(-1);
  });
});
