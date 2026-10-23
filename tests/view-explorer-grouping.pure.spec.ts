// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Multi-level grouping: stable within groups, siblings in `compareGroupValues`
 * order with the empty group last, fixed orders per level, collapsing, and the
 * status mix of a group.
 */
import { expect, test } from '@playwright/test';

import { compareGroupValues } from '../src/components/group-nav/groupOrder';
import { STATUS_ORDER } from '../src/pages/x/view-explorer/model/fields';
import {
  EMPTY_GROUP_VALUE,
  type FlatItem,
  type GroupLevel,
  allGroupKeys,
  buildGroupTree,
  flattenGroups,
  statusMix,
} from '../src/pages/x/view-explorer/model/grouping';

interface Row {
  id: string;
  space: string;
  target: string | null;
  status: string;
}

const ROWS: Row[] = [
  { id: '1', space: 'payments-prod', target: 'prod-us', status: 'Released' },
  { id: '2', space: 'checkout-dev', target: null, status: 'Not targeted' },
  { id: '3', space: 'payments-prod', target: 'prod-eu', status: 'Unreleased' },
  { id: '4', space: 'checkout-dev', target: 'dev-kind', status: 'Unreleased' },
  { id: '5', space: 'payments-prod', target: 'prod-us', status: 'Upgrade available' },
  { id: '6', space: '', target: '', status: 'Released' },
];

const bySpace: GroupLevel<Row> = { field: 'Space', value: (r) => r.space };
const byTarget: GroupLevel<Row> = { field: 'Target', value: (r) => r.target };
const byStatus: GroupLevel<Row> = {
  field: 'Status',
  value: (r) => r.status,
  order: STATUS_ORDER,
};

test('one level: sibling order, empty group last, row order kept', () => {
  const tree = buildGroupTree(ROWS, [bySpace]);
  expect(tree.map((g) => g.value)).toEqual([
    'checkout-dev',
    'payments-prod',
    EMPTY_GROUP_VALUE,
  ]);
  expect(tree[1].rows.map((r) => r.id)).toEqual(['1', '3', '5']);
  expect(tree.map((g) => g.key)).toEqual([
    'Space=checkout-dev',
    'Space=payments-prod',
    `Space=${EMPTY_GROUP_VALUE}`,
  ]);
  const values = tree.map((g) => g.value);
  expect([...values].sort(compareGroupValues)).toEqual(values);
});

test('two levels: keys are paths and null joins the empty group', () => {
  const tree = buildGroupTree(ROWS, [bySpace, byTarget]);
  const checkout = tree[0];
  expect(checkout.children.map((c) => c.value)).toEqual(['dev-kind', EMPTY_GROUP_VALUE]);
  expect(checkout.children[1].key).toBe(`Space=checkout-dev/Target=${EMPTY_GROUP_VALUE}`);
  const payments = tree[1];
  expect(payments.children.map((c) => [c.value, c.rows.map((r) => r.id)])).toEqual([
    ['prod-eu', ['3']],
    ['prod-us', ['1', '5']],
  ]);
  expect(allGroupKeys(tree)).toHaveLength(3 + 2 + 2 + 1);
});

test('a fixed order puts the most urgent status first', () => {
  const tree = buildGroupTree(ROWS, [byStatus]);
  expect(tree.map((g) => g.value)).toEqual([
    'Unreleased',
    'Upgrade available',
    'Not targeted',
    'Released',
  ]);
});

test('no levels: no groups, and the flat list is the rows', () => {
  expect(buildGroupTree(ROWS, [])).toEqual([]);
  expect(
    flattenGroups(ROWS, [], new Set()).map((i) => (i.type === 'row' ? i.row.id : 'g')),
  ).toEqual(['1', '2', '3', '4', '5', '6']);
});

test('flatten: headers then rows, collapsed groups hide what is under them', () => {
  const tree = buildGroupTree(ROWS, [bySpace, byTarget]);
  const label = (i: FlatItem<Row>) =>
    i.type === 'group'
      ? `${'  '.repeat(i.node.depth)}${i.node.value}`
      : `${'  '.repeat(i.depth)}#${i.row.id}`;
  expect(flattenGroups(ROWS, tree, new Set(['Space=payments-prod'])).map(label)).toEqual([
    'checkout-dev',
    '  dev-kind',
    '    #4',
    `  ${EMPTY_GROUP_VALUE}`,
    '    #2',
    'payments-prod',
    EMPTY_GROUP_VALUE,
    `  ${EMPTY_GROUP_VALUE}`,
    '    #6',
  ]);
});

test('status mix lists present statuses in order', () => {
  expect(statusMix(ROWS, (r) => r.status, STATUS_ORDER)).toEqual([
    { status: 'Unreleased', count: 2 },
    { status: 'Upgrade available', count: 1 },
    { status: 'Not targeted', count: 1 },
    { status: 'Released', count: 2 },
  ]);
  expect(statusMix(ROWS.slice(0, 1), (r) => r.status, STATUS_ORDER)).toEqual([
    { status: 'Released', count: 1 },
  ]);
});
