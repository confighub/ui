// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Pure logic backing the Components left-nav tree (`componentIndex.ts`,
// `componentGroupFields.ts`). No page, no browser, no fixtures — the same
// pattern as `component-compare-model.pure.spec.ts`.

import { expect, test } from '@playwright/test';

import type { ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import {
  COMPONENT_CATALOG,
  COMPONENT_DEFAULT_LEVELS,
  ID_BATCH_SIZE,
  batchIds,
  deriveComponentTreePath,
  filterComponentsByGroupPath,
  getComponentGroupValue,
  getComponentLabelKeyCounts,
  getComponentLabelKeys,
  normalizeComponentLevels,
  resolveNodeGraphTarget,
  resolveOpenComponentSlug,
  spacesOfComponents,
} from '../src/pages/x/apps/componentGroupFields';
import { EMPTY_GROUP_VALUE, compareGroupValues } from '../src/components/group-nav/groupOrder';
import { type ComponentNavItem, buildComponentNavItems } from '../src/pages/x/apps/componentIndex';

/** A Component entity. */
function component(slug: string, labels: Record<string, string> = {}): ComponentRead {
  return { ComponentID: `cid-${slug}`, Slug: slug, Labels: labels } as ComponentRead;
}

/** A Space of the Component `componentSlug`. */
function space(
  componentSlug: string,
  labels: Record<string, string> = {},
  counts: Partial<Pick<ExtendedSpaceRead, 'UpgradableUnitCount' | 'UnreleasedUnitCount' | 'GatedUnitCount'>> = {},
): ExtendedSpaceRead {
  return {
    Space: { SpaceID: `sid-${componentSlug}-${Math.random()}`, Slug: 'slug', Labels: labels, ComponentID: `cid-${componentSlug}` },
    ...counts,
  };
}

function items(components: ComponentRead[], spaces: ExtendedSpaceRead[]): ComponentNavItem[] {
  return buildComponentNavItems(new Map(components.map((c) => [c.ComponentID as string, c])), spaces);
}

const loaded = { isSummaryLoaded: true };

test.describe('componentIndex (pure)', () => {
  test('buildComponentNavItems: one item per Component, sorted by Slug, including Components with no Spaces', () => {
    const spaces = [space('checkout', { Owner: 'a' }), space('checkout', { Owner: 'a' })];
    const result = items([component('empty'), component('checkout')], spaces);
    expect(result.map((i) => i.slug)).toEqual(['checkout', 'empty']);
    expect(result[0].spaces).toHaveLength(2);
    expect(result[1].spaces).toEqual([]);
  });

  test('buildComponentNavItems: the owner follows the owner rule (own label, else the label all Spaces share, else "")', () => {
    const result = items(
      [component('own', { Owner: 'team-c' }), component('shared'), component('split'), component('none')],
      [
        space('own', { Owner: 'team-a' }),
        space('shared', { Owner: 'team-a' }),
        space('shared', { Owner: 'team-a' }),
        space('split', { Owner: 'team-a' }),
        space('split', { Owner: 'team-b' }),
      ],
    );
    const owner = Object.fromEntries(result.map((i) => [i.slug, i.owner]));
    expect(owner).toEqual({ own: 'team-c', shared: 'team-a', split: '', none: '' });
  });
});

test.describe('componentGroupFields (pure)', () => {
  test('COMPONENT_DEFAULT_LEVELS is Owner only', () => {
    expect(COMPONENT_DEFAULT_LEVELS).toEqual(['Labels.Owner']);
  });

  test('COMPONENT_CATALOG offers only the status roll-ups as static fields (no Component, no Target)', () => {
    const fields = COMPONENT_CATALOG.staticCategories.flatMap((c) => c.fields.map((f) => f.field));
    expect(fields.sort()).toEqual(['Gated', 'UnreleasedChanges', 'UpgradeNeeded']);
  });

  const normalizationTable: Array<{ saved: string[]; read: string[]; why: string }> = [
    { saved: ['Labels.Owner', 'Component'], read: ['Labels.Owner'], why: 'the old default' },
    { saved: ['Component'], read: [], why: 'Component is the leaf now' },
    { saved: ['Labels.Owner', 'Component', 'Labels.Variant'], read: ['Labels.Owner'], why: 'Variant names a Space' },
    { saved: ['ReleaseTarget', 'Labels.Team'], read: ['Labels.Team'], why: 'a Release target belongs to a Space' },
    { saved: ['Space', 'Labels.Stage', 'Slug'], read: ['Labels.Stage'], why: 'unknown keys are dropped' },
    { saved: ['Gated', 'UpgradeNeeded', 'UnreleasedChanges'], read: ['Gated', 'UpgradeNeeded', 'UnreleasedChanges'], why: 'status levels stay' },
    { saved: ['Labels.Owner', 'Component', 'Labels.Owner'], read: ['Labels.Owner'], why: 'a repeated level is kept once' },
    { saved: ['Labels.', 'Space.Labels.Owner'], read: [], why: 'an empty key and a Space label key are dropped' },
  ];
  for (const { saved, read, why } of normalizationTable) {
    test(`normalizeComponentLevels: ${saved.join(',')} -> [${read.join(',')}] (${why})`, () => {
      expect(normalizeComponentLevels(saved)).toEqual(read);
    });
  }

  test('getComponentGroupValue: Labels.Owner is the owner rule; other Labels.<key> are the Component\'s own labels, not its Spaces\'', () => {
    const [item] = items(
      [component('checkout', { Team: 'payments' })],
      [space('checkout', { Owner: 'team-a', Stage: 'prod' }), space('checkout', { Owner: 'team-a', Stage: 'dev' })],
    );
    expect(getComponentGroupValue(item, 'Labels.Owner', loaded)).toBe('team-a');
    expect(getComponentGroupValue(item, 'Labels.Team', loaded)).toBe('payments');
    expect(getComponentGroupValue(item, 'Labels.Stage', loaded)).toBe('');
    expect(getComponentGroupValue(item, 'Space', loaded)).toBe('');
  });

  test('getComponentGroupValue: status levels sum the Spaces\' counts, and are "" until the summary has loaded', () => {
    const [stale, quiet, empty] = items(
      [component('a-stale'), component('b-quiet'), component('c-empty')],
      [
        space('a-stale', {}, { UpgradableUnitCount: 0, UnreleasedUnitCount: 0, GatedUnitCount: 0 }),
        space('a-stale', {}, { UpgradableUnitCount: 2, UnreleasedUnitCount: 0, GatedUnitCount: 1 }),
        space('b-quiet', {}, { UpgradableUnitCount: 0, UnreleasedUnitCount: 0, GatedUnitCount: 0 }),
      ],
    );
    expect(getComponentGroupValue(stale, 'UpgradeNeeded', loaded)).toBe('Yes');
    expect(getComponentGroupValue(stale, 'UnreleasedChanges', loaded)).toBe('No');
    expect(getComponentGroupValue(stale, 'Gated', loaded)).toBe('Yes');
    expect(getComponentGroupValue(quiet, 'UpgradeNeeded', loaded)).toBe('No');
    expect(getComponentGroupValue(empty, 'Gated', loaded)).toBe('No');
    for (const field of ['UpgradeNeeded', 'UnreleasedChanges', 'Gated']) {
      expect(getComponentGroupValue(stale, field, { isSummaryLoaded: false })).toBe('');
    }
  });

  test('getComponentLabelKeys / Counts: Component label keys, Owner always, Variant never', () => {
    const list = items(
      [component('a', { Team: 'x', Variant: 'base' }), component('b', { Owner: 'o' }), component('c')],
      [space('c', { Owner: 'o2', Stage: 'prod' })],
    );
    expect(getComponentLabelKeys(list)).toEqual(['Owner', 'Team']);
    expect(getComponentLabelKeys([])).toEqual(['Owner']);
    expect(getComponentLabelKeyCounts(list)).toEqual({ Owner: 2, Team: 1 });
  });

  test('filterComponentsByGroupPath / spacesOfComponents: a group node holds every Space of every Component under it', () => {
    const list = items(
      [component('checkout'), component('billing'), component('search'), component('empty', { Owner: 'a' })],
      [
        space('checkout', { Owner: 'a' }),
        space('checkout', { Owner: 'a' }),
        space('billing', { Owner: 'a' }),
        space('search', { Owner: 'b' }),
      ],
    );
    const levels = ['Labels.Owner'];
    const underA = filterComponentsByGroupPath(list, levels, ['a'], loaded);
    expect(underA.map((i) => i.slug)).toEqual(['billing', 'checkout', 'empty']);
    expect(spacesOfComponents(underA)).toHaveLength(3);
    expect(filterComponentsByGroupPath(list, levels, [], loaded)).toBe(list);
    // A stale path (longer than levels, or a value nobody has) matches nothing.
    expect(filterComponentsByGroupPath(list, levels, ['a', 'checkout'], loaded)).toEqual([]);
    expect(filterComponentsByGroupPath(list, levels, ['gone'], loaded)).toEqual([]);
  });

  test('resolveNodeGraphTarget: a leaf opens its Component; a group of several Components opens ?group=; a group of one opens that Component', () => {
    const list = items(
      [component('checkout'), component('billing'), component('search')],
      [space('checkout', { Owner: 'a' }), space('billing', { Owner: 'a' }), space('search', { Owner: 'b' })],
    );
    const levels = ['Labels.Owner'];
    expect(resolveNodeGraphTarget(list, levels, ['a', 'checkout'], loaded)).toEqual({ app: 'checkout' });
    expect(resolveNodeGraphTarget(list, levels, ['a'], loaded)).toEqual({ group: ['a'] });
    expect(resolveNodeGraphTarget(list, levels, ['b'], loaded)).toEqual({ app: 'search' });
    // No levels: every node is a leaf at the root.
    expect(resolveNodeGraphTarget(list, [], ['billing'], loaded)).toEqual({ app: 'billing' });
    // Two levels: the leaf is at depth 2.
    expect(resolveNodeGraphTarget(list, ['Labels.Owner', 'Gated'], ['a', 'No', 'billing'], loaded)).toEqual({ app: 'billing' });
    expect(resolveNodeGraphTarget(list, ['Labels.Owner', 'Gated'], ['a', 'No'], loaded)).toEqual({ group: ['a', 'No'] });
  });

  test('resolveNodeGraphTarget: a split-owner Component is under (empty) once, and its leaf opens the whole Component', () => {
    const list = items([component('split')], [space('split', { Owner: 'a' }), space('split', { Owner: 'b' })]);
    expect(getComponentGroupValue(list[0], 'Labels.Owner', loaded)).toBe('');
    expect(resolveNodeGraphTarget(list, ['Labels.Owner'], ['(empty)', 'split'], loaded)).toEqual({ app: 'split' });
  });

  test('deriveComponentTreePath: with ?app= the path of that Component\'s leaf; without it, groupParam', () => {
    const list = items(
      [component('checkout', { Team: 'payments' }), component('empty')],
      [space('checkout', { Owner: 'a' }, { GatedUnitCount: 1 })],
    );
    expect(deriveComponentTreePath(['Labels.Owner'], null, [], list, loaded)).toEqual([]);
    expect(deriveComponentTreePath(['Labels.Owner'], null, ['a'], list, loaded)).toEqual(['a']);
    expect(deriveComponentTreePath(['Labels.Owner'], 'checkout', [], list, loaded)).toEqual(['a', 'checkout']);
    expect(deriveComponentTreePath(['Labels.Owner', 'Labels.Team', 'Gated'], 'checkout', [], list, loaded)).toEqual([
      'a',
      'payments',
      'Yes',
      'checkout',
    ]);
    // A Component with no Spaces has a leaf too.
    expect(deriveComponentTreePath(['Labels.Owner'], 'empty', [], list, loaded)).toEqual(['(empty)', 'empty']);
    expect(deriveComponentTreePath([], 'empty', [], list, loaded)).toEqual(['empty']);
    // An unknown Component highlights nothing.
    expect(deriveComponentTreePath(['Labels.Owner'], 'gone', [], list, loaded)).toBeNull();
  });

  test('deriveComponentTreePath: a ?group= path that holds no Component highlights nothing', () => {
    const list = items([component('checkout')], [space('checkout', { Owner: 'a' })]);
    expect(deriveComponentTreePath(['Labels.Owner'], null, ['b'], list, loaded)).toBeNull();
    // Longer than the levels, with no Component open: no node has this path.
    expect(deriveComponentTreePath(['Labels.Owner'], null, ['a', 'checkout', 'x'], list, loaded)).toBeNull();
    expect(deriveComponentTreePath(['Labels.Owner'], null, ['a'], list, loaded)).toEqual(['a']);
  });

  test('compareGroupValues: (empty) sorts after its siblings; other names keep localeCompare order', () => {
    const names = ['team-b', EMPTY_GROUP_VALUE, 'Team-a', 'alpha'];
    const localeOrder = [...names].sort((a, b) => a.localeCompare(b));
    expect(localeOrder[0]).toBe(EMPTY_GROUP_VALUE);
    expect([...names].sort(compareGroupValues)).toEqual([
      ...localeOrder.filter((n) => n !== EMPTY_GROUP_VALUE),
      EMPTY_GROUP_VALUE,
    ]);
    expect(compareGroupValues(EMPTY_GROUP_VALUE, EMPTY_GROUP_VALUE)).toBe(0);
    expect(compareGroupValues('alpha', 'beta')).toBeLessThan(0);
  });

  test('deriveComponentTreePath: a Component under (empty) highlights a path whose (empty) node is last at each level', () => {
    const levels = ['Labels.Owner', 'Labels.Team'];
    const list = items(
      [component('checkout', { Team: 'payments' }), component('cart'), component('orphan')],
      [space('checkout', { Owner: 'a' }), space('cart', { Owner: 'a' })],
    );
    const paths = list.map((item) => deriveComponentTreePath(levels, item.slug, [], list, loaded) as string[]);
    expect(paths).toEqual([
      ['a', EMPTY_GROUP_VALUE, 'cart'],
      ['a', 'payments', 'checkout'],
      [EMPTY_GROUP_VALUE, EMPTY_GROUP_VALUE, 'orphan'],
    ]);
    const byLevel = (depth: number, parent: string[]) =>
      Array.from(
        new Set(paths.filter((p) => parent.every((v, i) => p[i] === v)).map((p) => p[depth])),
      ).sort(compareGroupValues);
    expect(byLevel(0, [])).toEqual(['a', EMPTY_GROUP_VALUE]);
    expect(byLevel(1, ['a'])).toEqual(['payments', EMPTY_GROUP_VALUE]);
  });

  test('resolveOpenComponentSlug: ?app=, else the last value of a ?group= path that ends at a leaf', () => {
    const levels = ['Labels.Owner'];
    expect(resolveOpenComponentSlug(levels, 'checkout', [])).toBe('checkout');
    // ?app= wins over ?group=.
    expect(resolveOpenComponentSlug(levels, 'checkout', ['a', 'billing'])).toBe('checkout');
    // One value longer than the levels: a leaf, so its Component opens.
    expect(resolveOpenComponentSlug(levels, null, ['a', 'billing'])).toBe('billing');
    expect(resolveOpenComponentSlug([], null, ['billing'])).toBe('billing');
    expect(resolveOpenComponentSlug(['Labels.Owner', 'Gated'], null, ['a', 'No', 'billing'])).toBe('billing');
    // A group node, Overview, or a path too long to be any node opens no Component.
    expect(resolveOpenComponentSlug(levels, null, ['a'])).toBeNull();
    expect(resolveOpenComponentSlug(levels, null, [])).toBeNull();
    expect(resolveOpenComponentSlug(levels, null, ['a', 'billing', 'x'])).toBeNull();
  });

  test('a ?group= leaf link highlights that Component\'s leaf, the same as ?app=', () => {
    const list = items([component('checkout'), component('ui-preview')], [space('ui-preview', { Owner: 'Engineering' })]);
    const levels = ['Labels.Owner'];
    const slug = resolveOpenComponentSlug(levels, null, ['Engineering', 'ui-preview']);
    expect(deriveComponentTreePath(levels, slug, ['Engineering', 'ui-preview'], list, loaded)).toEqual([
      'Engineering',
      'ui-preview',
    ]);
  });

  test('batchIds: splits into ID_BATCH_SIZE-sized chunks, deduplicating and dropping falsy entries', () => {
    const ids = Array.from({ length: ID_BATCH_SIZE + 1 }, (_, i) => `id-${i}`);
    const batches = batchIds(ids);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(ID_BATCH_SIZE);
    expect(batches[1]).toHaveLength(1);

    expect(batchIds(['a', 'a', 'b', '', undefined as unknown as string])).toEqual([['a', 'b']]);
    expect(batchIds([])).toEqual([]);
  });
});
