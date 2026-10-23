// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What Only this and Exclude do with picked cells: add a lens, or narrow or
 * extend the lens the field already has, and refuse in plain words what no
 * lens can say.
 */
import { expect, test } from '@playwright/test';

import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import type { ViewDef } from '../src/pages/x/view-explorer/model/types';
import {
  groupByAfterDrop,
  planCellLens,
} from '../src/pages/x/view-explorer/popovers/cellActions';
import { idGen, lens } from './fixtures/view-explorer-model-views';

const base = (patch: Partial<ViewDef> = {}): ViewDef => ({
  ...defaultViewDef('Unit'),
  ...patch,
});

test('Only this adds an "is" lens with the picked values', () => {
  const plan = planCellLens(
    base(),
    'Space',
    ['payments-prod', 'checkout-dev'],
    'only',
    idGen('n'),
  );
  expect(plan).toEqual({
    kind: 'add',
    lens: {
      kind: 'field',
      field: 'Space',
      op: 'is',
      values: ['payments-prod', 'checkout-dev'],
      id: 'n1',
      enabled: true,
    },
    label: 'Space: payments-prod, checkout-dev',
  });
});

test('Only this narrows the field’s "is" lens instead of adding another', () => {
  const existing = lens(
    { kind: 'field', field: 'Space', op: 'is', values: ['a', 'b'] },
    false,
  );
  const plan = planCellLens(base({ lenses: [existing] }), 'Space', ['b'], 'only', idGen());
  expect(plan).toEqual({
    kind: 'update',
    lens: { ...existing, values: ['b'], enabled: true },
    label: 'Space: b',
  });
});

test('Exclude adds an "is not" lens, then joins further values to it', () => {
  const first = planCellLens(base(), 'ToolchainType', ['OpenTofu/HCL'], 'exclude', idGen('x'));
  expect(first.kind === 'add' && first.lens).toMatchObject({
    field: 'ToolchainType',
    op: 'isNot',
    values: ['OpenTofu/HCL'],
  });
  expect(first.kind === 'add' && first.label).toBe('−Toolchain: OpenTofu/HCL');
  const existing = lens({
    kind: 'field',
    field: 'ToolchainType',
    op: 'isNot',
    values: ['OpenTofu/HCL'],
  });
  const second = planCellLens(
    base({ lenses: [existing] }),
    'ToolchainType',
    ['AppConfig/Properties', 'OpenTofu/HCL'],
    'exclude',
    idGen(),
  );
  expect(second.kind === 'update' && second.lens).toMatchObject({
    id: existing.id,
    values: ['OpenTofu/HCL', 'AppConfig/Properties'],
  });
});

test('a pattern lens on the field is left alone; a new lens is added', () => {
  const pattern = lens({ kind: 'field', field: 'Space', op: 'isNot', values: ['checkout-*'] });
  const plan = planCellLens(
    base({ lenses: [pattern] }),
    'Space',
    ['payments-prod'],
    'exclude',
    idGen('p'),
  );
  expect(plan.kind).toBe('add');
});

test('empty cells: is empty / is set, and no Target is the Not targeted status', () => {
  expect(planCellLens(base(), 'Labels.app', [null], 'only', idGen()).kind === 'add').toBe(
    true,
  );
  const onlyEmpty = planCellLens(base(), 'Labels.app', [null], 'only', idGen('e'));
  expect(onlyEmpty.kind === 'add' && onlyEmpty.lens).toMatchObject({
    field: 'Labels.app',
    op: 'empty',
    values: [],
  });
  const noTarget = planCellLens(base(), 'Target', [null], 'only', idGen('t'));
  expect(noTarget.kind === 'add' && noTarget.lens).toMatchObject({
    kind: 'status',
    status: 'untargeted',
  });
  const hasTarget = planCellLens(base(), 'Target', [null], 'exclude', idGen('t'));
  expect(hasTarget.kind === 'add' && hasTarget.lens).toMatchObject({
    field: 'Target',
    op: 'notEmpty',
  });
  expect(planCellLens(base(), 'Labels.app', [null, 'x'], 'only', idGen()).kind).toBe(
    'refused',
  );
});

test('a Status value is a status lens, and a status cannot be excluded', () => {
  const plan = planCellLens(base(), 'Status', ['Unreleased'], 'only', idGen('s'));
  expect(plan.kind === 'add' && plan.lens).toMatchObject({
    kind: 'status',
    status: 'unreleased',
  });
  const again = planCellLens(
    base({ lenses: [lens({ kind: 'status', status: 'unreleased' }, false)] }),
    'Status',
    ['Unreleased'],
    'only',
    idGen(),
  );
  expect(again.kind).toBe('update');
  expect(planCellLens(base(), 'Status', ['Unreleased'], 'exclude', idGen()).kind).toBe(
    'refused',
  );
});

test('refused in plain words: a column that is not a filter, and a value no lens can hold', () => {
  const computed = planCellLens(base(), 'UpgradeNeeded', ['Yes'], 'only', idGen());
  expect(computed).toEqual({ kind: 'refused', reason: 'Upgrade needed cannot be a filter.' });
  const star = planCellLens(base(), 'DisplayName', ['a*'], 'only', idGen());
  expect(star.kind).toBe('refused');
  const spaceCount = planCellLens(
    { ...defaultViewDef('Space') },
    'TotalUnitCount',
    ['3'],
    'only',
    idGen(),
  );
  expect(spaceCount.kind).toBe('refused');
});

test('a value with * is refused for both actions: * would turn it into a pattern', () => {
  for (const action of ['only', 'exclude'] as const) {
    const plan = planCellLens(base(), 'DisplayName', ['db * primary'], action, idGen());
    expect(plan.kind, action).toBe('refused');
  }
});

test('Exclude does not join a hidden "is not" lens; it adds its own', () => {
  const hidden = lens(
    { kind: 'field', field: 'ToolchainType', op: 'isNot', values: ['OpenTofu/HCL'] },
    false,
  );
  const plan = planCellLens(
    base({ lenses: [hidden] }),
    'ToolchainType',
    ['AppConfig/Properties'],
    'exclude',
    idGen('h'),
  );
  expect(plan.kind).toBe('add');
  expect(plan.kind === 'add' && plan.lens.values).toEqual(['AppConfig/Properties']);
});

test('a header dropped on Group adds a level only for a field the model knows', () => {
  expect(groupByAfterDrop('Unit', ['Space'], 'ToolchainType')).toEqual([
    'Space',
    'ToolchainType',
  ]);
  expect(groupByAfterDrop('Unit', ['Space'], 'Space')).toBeNull();
  // A data-path column has no field in the catalog: grouping by it would do nothing.
  expect(groupByAfterDrop('Unit', [], 'spec.replicas')).toBeNull();
});
