// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Pure logic backing the Components left-nav grouping (`componentGroupFields.ts`).
// No page, no browser, no fixtures — the same pattern as
// `component-compare-model.pure.spec.ts`.

import { expect, test } from '@playwright/test';

import type { ExtendedSpaceRead, ExtendedTargetRead } from '@confighub/rtk-query';
import {
  COMPONENT_CATALOG,
  COMPONENT_DEFAULT_LEVELS,
  COMPONENT_FIELD,
  ID_BATCH_SIZE,
  batchIds,
  buildTargetSlugById,
  deriveComponentTreePath,
  getSpaceGroupValue,
  getSpaceLabelKeyCounts,
  getSpaceLabelKeys,
  resolveNodeGraphTarget,
} from '../src/pages/x/apps/componentGroupFields';

/** Component Slug by ComponentID, as `useComponentSlugs().slugById` gives it. */
const slugById = new Map(['checkout', 'billing', 'shared'].map((slug) => [`cid-${slug}`, slug]));

/** A Space; `Component` (a Slug from `slugById`) sets its `ComponentID`. */
function space(
  overrides: Partial<ExtendedSpaceRead> & { Labels?: Record<string, string>; Component?: string },
): ExtendedSpaceRead {
  const { Labels, Component, ...rest } = overrides;
  return {
    Space: {
      SpaceID: 'sid',
      Slug: 'slug',
      Labels: Labels ?? {},
      ...(Component ? { ComponentID: `cid-${Component}` } : {}),
    },
    ...rest,
  };
}

test.describe('componentGroupFields (pure)', () => {
  test('COMPONENT_DEFAULT_LEVELS is Owner then Component', () => {
    expect(COMPONENT_DEFAULT_LEVELS).toEqual(['Labels.Owner', 'Component']);
    expect(COMPONENT_FIELD).toBe('Component');
  });

  test('getSpaceGroupValue reads dynamic Labels.<key> fields', () => {
    const s = space({ Component: 'checkout', Labels: { Owner: 'team-a', Variant: 'prod' } });
    expect(getSpaceGroupValue(s, 'Labels.Owner', { targetSlugById: new Map(), isSummaryLoaded: true, slugById })).toBe('team-a');
    expect(getSpaceGroupValue(s, 'Labels.Missing', { targetSlugById: new Map(), isSummaryLoaded: true, slugById })).toBe('');
  });

  test('getSpaceGroupValue: Component is the Slug of the Space\'s Component entity, not a label', () => {
    const ctx = { targetSlugById: new Map<string, string>(), isSummaryLoaded: true, slugById };
    expect(getSpaceGroupValue(space({ Component: 'checkout' }), COMPONENT_FIELD, ctx)).toBe('checkout');
    // A leftover `Component` LABEL means nothing to the field.
    expect(getSpaceGroupValue(space({ Labels: { Component: 'checkout' } }), COMPONENT_FIELD, ctx)).toBe('');
    // A ComponentID whose Component has not loaded has no name yet.
    expect(getSpaceGroupValue(space({ Component: 'not-loaded' }), COMPONENT_FIELD, ctx)).toBe('');
  });

  test('getSpaceGroupValue: ReleaseTarget prefers the expanded relation, falls back to the target map', () => {
    const withRelation = space({ ReleaseTarget: { Slug: 'us-east-1' } });
    expect(getSpaceGroupValue(withRelation, 'ReleaseTarget', { targetSlugById: new Map(), isSummaryLoaded: true, slugById })).toBe('us-east-1');

    const withIdOnly = space({ Space: { SpaceID: 's1', Slug: 'slug', Labels: {}, ReleaseTargetID: 'tgt-1' } });
    const targetSlugById = new Map([['tgt-1', 'us-west-2']]);
    expect(getSpaceGroupValue(withIdOnly, 'ReleaseTarget', { targetSlugById, isSummaryLoaded: true, slugById })).toBe('us-west-2');

    // No relation, no id, no map entry — '(empty)' upstream, '' here.
    const bare = space({});
    expect(getSpaceGroupValue(bare, 'ReleaseTarget', { targetSlugById: new Map(), isSummaryLoaded: true, slugById })).toBe('');
  });

  test('getSpaceGroupValue: summary-only fields return "" (never a false "No") until isSummaryLoaded', () => {
    const s = space({ UpgradableUnitCount: 3, UnreleasedUnitCount: 0, GatedUnitCount: 1 });
    for (const field of ['UpgradeNeeded', 'UnreleasedChanges', 'Gated']) {
      expect(getSpaceGroupValue(s, field, { targetSlugById: new Map(), isSummaryLoaded: false, slugById })).toBe('');
    }
    expect(getSpaceGroupValue(s, 'UpgradeNeeded', { targetSlugById: new Map(), isSummaryLoaded: true, slugById })).toBe('Yes');
    expect(getSpaceGroupValue(s, 'UnreleasedChanges', { targetSlugById: new Map(), isSummaryLoaded: true, slugById })).toBe('No');
    expect(getSpaceGroupValue(s, 'Gated', { targetSlugById: new Map(), isSummaryLoaded: true, slugById })).toBe('Yes');
  });

  test('buildTargetSlugById maps TargetID to Slug, skipping incomplete entries', () => {
    const targets: ExtendedTargetRead[] = [
      { Target: { TargetID: 't1', Slug: 'prod' } },
      { Target: { TargetID: 't2' } } as ExtendedTargetRead,
      {},
    ];
    const map = buildTargetSlugById(targets);
    expect(map.get('t1')).toBe('prod');
    expect(map.has('t2')).toBe(false);
    expect(map.size).toBe(1);
  });

  test('getSpaceLabelKeys / getSpaceLabelKeyCounts: dropped fields never appear (only Space.Labels keys)', () => {
    const spaces = [
      space({ Component: 'checkout', Labels: { Owner: 'a' } }),
      space({ Component: 'billing', Labels: { Owner: 'a', Variant: 'prod' } }),
      space({ Component: 'checkout', Labels: {} }), // no Owner
    ];
    expect(getSpaceLabelKeys(spaces)).toEqual(['Owner', 'Variant']);
    const counts = getSpaceLabelKeyCounts(spaces);
    expect(counts).toEqual({ Owner: 2, Variant: 1 });
    // Dropped fields (Slug, SpaceID, CreatedAt, ...) are structurally absent —
    // they can never appear since this only ever reads `Space.Labels`.
  });

  test('COMPONENT_CATALOG has no Space-Labels-only Unit-list fields (Slug/CreatedAt/ToolchainType/…)', () => {
    const allFields = COMPONENT_CATALOG.staticCategories.flatMap((c) => c.fields.map((f) => f.field));
    expect(allFields.sort()).toEqual(['Component', 'Gated', 'ReleaseTarget', 'UnreleasedChanges', 'UpgradeNeeded'].sort());
    for (const dropped of ['Slug', 'SpaceID', 'DisplayName', 'CreatedAt', 'UpdatedAt', 'ToolchainType', 'Annotations']) {
      expect(allFields).not.toContain(dropped);
    }
  });

  test('the ReleaseTarget field displays as "Target" — the internal key stays ReleaseTarget so a saved view\'s GroupBy annotation or a ?group= deep link keeps working', () => {
    expect(COMPONENT_CATALOG.fieldLabels?.['ReleaseTarget']).toBe('Target');
  });

  // Icon identity (the Component field, Owner/Stage/Region/Department vs.
  // the generic Labels icon) is covered by `component-nav-grouping.spec.ts`
  // test 15 instead of here: it needs a real rendered `data-testid`
  // (MUI's `createSvgIcon`) to tell icons apart, and importing the icon
  // components directly into this Node-run pure spec trips a Node ESM
  // resolution error in `@mui/icons-material`'s own `createSvgIcon.js`
  // (a directory import of `@mui/material/utils`) that has nothing to do
  // with the logic under test.

  const ctx = { targetSlugById: new Map<string, string>(), isSummaryLoaded: true, slugById };

  test('resolveNodeGraphTarget: a leaf whose bucket is exactly one whole Component resolves to {app}', () => {
    const appSpaces = [
      space({ Component: 'checkout', Labels: { Owner: 'a' } }),
      space({ Component: 'checkout', Labels: { Owner: 'a' } }),
      space({ Component: 'billing', Labels: { Owner: 'a' } }),
    ];
    const levels = ['Labels.Owner', 'Component'];
    expect(resolveNodeGraphTarget(appSpaces, levels, ['a', 'checkout'], ctx)).toEqual({ app: 'checkout' });
  });

  test('resolveNodeGraphTarget: an Owner bucket spanning several Components resolves to {group}', () => {
    const appSpaces = [
      space({ Component: 'checkout', Labels: { Owner: 'a' } }),
      space({ Component: 'billing', Labels: { Owner: 'a' } }),
    ];
    const levels = ['Labels.Owner', 'Component'];
    expect(resolveNodeGraphTarget(appSpaces, levels, ['a'], ctx)).toEqual({
      group: ['a'],
    });
  });

  test('resolveNodeGraphTarget: a Component field in the MIDDLE still resolves to {app} when its bucket is the whole Component', () => {
    const appSpaces = [
      space({ Component: 'checkout', Labels: { Owner: 'a', Variant: 'base' } }),
      space({ Component: 'checkout', Labels: { Owner: 'a', Variant: 'dev' } }),
    ];
    const levels = ['Labels.Owner', 'Component', 'Labels.Variant'];
    // Owner -> Component bucket = both Spaces = the whole "checkout" Component.
    expect(resolveNodeGraphTarget(appSpaces, levels, ['a', 'checkout'], ctx)).toEqual({ app: 'checkout' });
    // One level deeper (Variant), the bucket is a strict subset — a group (one-node) graph.
    expect(resolveNodeGraphTarget(appSpaces, levels, ['a', 'checkout', 'base'], ctx)).toEqual({
      group: ['a', 'checkout', 'base'],
    });
  });

  test('resolveNodeGraphTarget: a Component split across two Owners resolves to {app} from either Owner\'s Component node', () => {
    const appSpaces = [
      space({ Component: 'shared', Labels: { Owner: 'a' } }),
      space({ Component: 'shared', Labels: { Owner: 'b' } }),
      space({ Component: 'shared' }),
    ];
    const levels = ['Labels.Owner', 'Component'];
    expect(resolveNodeGraphTarget(appSpaces, levels, ['a', 'shared'], ctx)).toEqual({ app: 'shared' });
    expect(resolveNodeGraphTarget(appSpaces, levels, ['b', 'shared'], ctx)).toEqual({ app: 'shared' });
    expect(resolveNodeGraphTarget(appSpaces, levels, ['(empty)', 'shared'], ctx)).toEqual({ app: 'shared' });
    // The Owner nodes themselves hold only part of the Component — still {group}.
    expect(resolveNodeGraphTarget(appSpaces, levels, ['a'], ctx)).toEqual({ group: ['a'] });
  });

  test('resolveNodeGraphTarget: a split Component in the MIDDLE resolves to {app}; a node below it stays {group}', () => {
    const appSpaces = [
      space({ Component: 'shared', Labels: { Owner: 'a', Variant: 'base' } }),
      space({ Component: 'shared', Labels: { Owner: 'b', Variant: 'dev' } }),
      space({ Component: 'shared', Labels: { Owner: 'b', Variant: 'prod' } }),
    ];
    const levels = ['Labels.Owner', 'Component', 'Labels.Variant'];
    expect(resolveNodeGraphTarget(appSpaces, levels, ['b', 'shared'], ctx)).toEqual({ app: 'shared' });
    expect(resolveNodeGraphTarget(appSpaces, levels, ['b', 'shared', 'dev'], ctx)).toEqual({
      group: ['b', 'shared', 'dev'],
    });
  });

  test('resolveNodeGraphTarget: a Component at the TOP level resolves to {app}; a node below it stays {group}', () => {
    const appSpaces = [
      space({ Component: 'checkout', Labels: { Stage: 'dev' } }),
      space({ Component: 'checkout', Labels: { Stage: 'prod' } }),
    ];
    const levels = ['Component', 'Labels.Stage'];
    expect(resolveNodeGraphTarget(appSpaces, levels, ['checkout'], ctx)).toEqual({ app: 'checkout' });
    expect(resolveNodeGraphTarget(appSpaces, levels, ['checkout', 'dev'], ctx)).toEqual({
      group: ['checkout', 'dev'],
    });
  });

  test('deriveComponentTreePath: no app open — the highlight is exactly groupParam', () => {
    const appSpaces = [space({ Component: 'checkout', Labels: { Owner: 'a' } })];
    const levels = ['Labels.Owner', 'Component'];
    expect(deriveComponentTreePath(levels, null, [], appSpaces, ctx)).toEqual([]);
    expect(deriveComponentTreePath(levels, null, ['a'], appSpaces, ctx)).toEqual(['a']);
  });

  test('deriveComponentTreePath: levels end in Component — derives the path from the Component\'s Spaces', () => {
    const appSpaces = [space({ Component: 'checkout', Labels: { Owner: 'a' } })];
    const levels = ['Labels.Owner', 'Component'];
    expect(deriveComponentTreePath(levels, 'checkout', [], appSpaces, ctx)).toEqual(['a', 'checkout']);
    // A matching groupParam (the click that opened it) is preserved as-is.
    expect(deriveComponentTreePath(levels, 'checkout', ['a', 'checkout'], appSpaces, ctx)).toEqual(['a', 'checkout']);
  });

  test('deriveComponentTreePath: Component in the middle — highlights the Component node, not a node below it', () => {
    const appSpaces = [
      space({ Component: 'checkout', Labels: { Owner: 'a', Variant: 'base' } }),
      space({ Component: 'checkout', Labels: { Owner: 'a', Variant: 'dev' } }),
    ];
    const levels = ['Labels.Owner', 'Component', 'Labels.Variant'];
    expect(deriveComponentTreePath(levels, 'checkout', [], appSpaces, ctx)).toEqual(['a', 'checkout']);
  });

  test('deriveComponentTreePath: a split Component highlights its FIRST node in tree order, whatever the Space order', () => {
    const levels = ['Labels.Owner', 'Component'];
    const spaces = [
      space({ Component: 'shared', Labels: { Owner: 'b' } }),
      space({ Component: 'shared' }),
      space({ Component: 'shared', Labels: { Owner: 'a' } }),
    ];
    // The tree sorts siblings with localeCompare: "(empty)" < "a" < "b".
    expect(deriveComponentTreePath(levels, 'shared', [], spaces, ctx)).toEqual(['(empty)', 'shared']);
    expect(deriveComponentTreePath(levels, 'shared', [], [...spaces].reverse(), ctx)).toEqual(['(empty)', 'shared']);
    // Component in the middle: the same rule, and the levels below it are ignored.
    const middleLevels = ['Labels.Owner', 'Component', 'Labels.Variant'];
    const middleSpaces = [
      space({ Component: 'shared', Labels: { Owner: 'b', Variant: 'base' } }),
      space({ Component: 'shared', Labels: { Owner: 'a', Variant: 'dev' } }),
    ];
    expect(deriveComponentTreePath(middleLevels, 'shared', [], middleSpaces, ctx)).toEqual(['a', 'shared']);
    // A groupParam naming another of its Component nodes is kept.
    expect(deriveComponentTreePath(middleLevels, 'shared', ['b', 'shared'], middleSpaces, ctx)).toEqual(['b', 'shared']);
  });

  test('deriveComponentTreePath: no Component field in levels — selects nothing', () => {
    const appSpaces = [space({ Component: 'checkout', Labels: { Owner: 'a' } })];
    expect(deriveComponentTreePath(['Labels.Owner'], 'checkout', [], appSpaces, ctx)).toBeNull();
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
