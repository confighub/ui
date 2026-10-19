// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * "New ChangeOrder"'s picker, as its model reads the Spaces, ChangeOrders and Units: which
 * Space is a Component's base, which ChangeOrder is its last, whether changes are waiting
 * there, the order the rows take, and the size of the requests its reads make.
 */
import type { ChangeOrderRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { DEFAULT_MAX_ENCODED_WHERE, chunkIds, inClause } from '../src/hooks/inClauseChunks';
import { draftCopy } from '../src/pages/change-orders/draft/draftCopy';
import {
  PICKER_READ_COLUMN,
  type PickerBaseUnit,
  type PickerChangeOrder,
  type PickerRow,
  type PickerSpace,
  type PickerVariantUnit,
  agoText,
  baseForFilter,
  draftBases,
  groupBySpace,
  lastChangeOrderBySpace,
  pickerGroups,
  upstreamOfSpace,
  waitingOf,
} from '../src/pages/change-orders/draft/newChangeOrderModel';

const space = (
  spaceId: string,
  componentId: string,
  upstreamSpaceId?: string,
): PickerSpace => ({
  spaceId,
  slug: spaceId,
  componentId,
  upstreamSpaceId,
});

const components = [
  { componentId: 'acme', slug: 'acme', name: 'Acme' },
  { componentId: 'solo', slug: 'solo', name: 'Solo' },
  { componentId: 'pay', slug: 'payments', name: 'payments' },
  { componentId: 'loop', slug: 'loop', name: 'Loop' },
];

test.describe('which Space is a base', () => {
  test('the root of a Component, not a variant that has no release Target', () => {
    const bases = draftBases(
      [
        space('eval-acme-base', 'acme'),
        // Variants with no Target: the old rule took them for bases.
        space('eval-acme-dev', 'acme', 'eval-acme-base'),
        space('eval-acme-prod', 'acme', 'eval-acme-dev'),
      ],
      components,
    );
    expect(bases.map((base) => base.spaceSlug)).toEqual(['eval-acme-base']);
    expect(bases[0].componentName).toBe('Acme');
    expect(bases[0].variantSpaceIds).toEqual(['eval-acme-dev', 'eval-acme-prod']);
  });

  test('an upstream outside the Component makes a root; a root nothing descends from is not listed', () => {
    const bases = draftBases(
      [
        space('pay-base', 'pay', 'platform'),
        space('pay-dev', 'pay', 'pay-base'),
        space('solo-base', 'solo'),
        // Two Spaces of one Component with no lineage recorded: nothing to promote to.
        space('acme-a', 'acme'),
        space('acme-b', 'acme'),
      ],
      components,
    );
    expect(bases.map((base) => base.spaceSlug)).toEqual(['pay-base']);
  });

  test('Spaces whose upstreams go round in a circle are not listed', () => {
    const bases = draftBases(
      [
        space('loop-a', 'loop', 'loop-b'),
        space('loop-b', 'loop', 'loop-a'),
        space('loop-c', 'loop', 'loop-a'),
      ],
      components,
    );
    expect(bases).toEqual([]);
  });

  test('the server field wins, else the variant breadcrumb', () => {
    expect(
      upstreamOfSpace({ UpstreamSpaceID: 'a', Annotations: { UpstreamSpaceID: 'b' } }),
    ).toBe('a');
    expect(upstreamOfSpace({ Annotations: { UpstreamSpaceID: 'b' } })).toBe('b');
    expect(upstreamOfSpace({ Annotations: {} })).toBeUndefined();
  });

  test('a filter to one base Space, or to a Component with one base, opens it', () => {
    const bases = draftBases(
      [space('pay-base', 'pay'), space('pay-dev', 'pay', 'pay-base')],
      components,
    );
    expect(baseForFilter(bases, { componentSlug: 'payments' })?.spaceSlug).toBe('pay-base');
    expect(baseForFilter(bases, { spaceSlug: 'pay-base' })?.spaceSlug).toBe('pay-base');
    expect(baseForFilter(bases, { spaceSlug: 'pay-dev' })).toBeUndefined();
  });
});

test.describe('the last ChangeOrder', () => {
  const order = (
    slug: string,
    createdAt: string,
    fields: Partial<ChangeOrderRead> = {},
  ): ChangeOrderRead =>
    ({
      ChangeOrderID: slug,
      Slug: slug,
      SpaceID: 'b',
      CreatedAt: createdAt,
      UpdateType: 'UpgradeUnit',
      ...fields,
    }) as ChangeOrderRead;

  test('is the one the draft re-aims: not given up on, and over Links', () => {
    const last = lastChangeOrderBySpace([
      order('older', '2026-10-01T00:00:00Z'),
      order('aborted', '2026-10-05T00:00:00Z', { State: 'Aborted' }),
      order('abandoned', '2026-10-06T00:00:00Z', { AbortedReason: 'superseded' }),
      order('restored', '2026-10-07T00:00:00Z', { State: 'Restored' }),
      order('functions', '2026-10-08T00:00:00Z', { UpdateType: 'None' }),
      order('newest-kept', '2026-10-04T00:00:00Z'),
    ]);
    expect(last.get('b')?.slug).toBe('newest-kept');
  });
});

test.describe('whether changes are waiting', () => {
  const [base] = draftBases(
    [space('b', 'acme'), space('v1', 'acme', 'b'), space('v2', 'acme', 'b')],
    components,
  );
  const units: PickerBaseUnit[] = [
    { unitId: 'u1', spaceId: 'b', headRevisionNum: 4 },
    { unitId: 'u2', spaceId: 'b', headRevisionNum: 2 },
  ];
  const clone = (
    spaceId: string,
    upstreamUnitId: string,
    upstreamRevisionNum: number | undefined,
  ): PickerVariantUnit => ({
    spaceId,
    upstreamSpaceId: 'b',
    upstreamUnitId,
    upstreamRevisionNum,
  });
  const order = (inScope: string[], updateType = 'UpgradeUnit'): PickerChangeOrder => ({
    slug: 'last',
    createdAt: '2026-10-09T09:00:00Z',
    inScopeSpaceIds: inScope,
    updateType,
  });
  const level = [
    clone('v1', 'u1', 4),
    clone('v1', 'u2', 2),
    clone('v2', 'u1', 4),
    clone('v2', 'u2', 2),
  ];

  test('a variant behind its base Unit: waiting; every variant at head: level', () => {
    expect(waitingOf(base, undefined, groupBySpace(units), groupBySpace(level))).toBe('level');
    expect(
      waitingOf(
        base,
        undefined,
        groupBySpace(units),
        groupBySpace([...level.slice(1), clone('v1', 'u1', 3)]),
      ),
    ).toBe('waiting');
  });

  test("only last time's scope counts", () => {
    const behind = [
      clone('v1', 'u1', 4),
      clone('v1', 'u2', 2),
      clone('v2', 'u1', 1),
      clone('v2', 'u2', 1),
    ];
    expect(waitingOf(base, order(['v1']), groupBySpace(units), groupBySpace(behind))).toBe(
      'level',
    );
    expect(
      waitingOf(base, order(['v1', 'v2']), groupBySpace(units), groupBySpace(behind)),
    ).toBe('waiting');
  });

  test('a variant in scope without a clone of a base Unit is waiting, though another variant has one', () => {
    expect(
      waitingOf(
        base,
        undefined,
        groupBySpace(units),
        groupBySpace(
          level.filter((unit) => !(unit.spaceId === 'v2' && unit.upstreamUnitId === 'u2')),
        ),
      ),
    ).toBe('waiting');
    // A variant holding nothing yet: the draft would add everything.
    expect(
      waitingOf(
        base,
        undefined,
        groupBySpace(units),
        groupBySpace(level.filter((unit) => unit.spaceId === 'v1')),
      ),
    ).toBe('waiting');
  });

  test('what cannot be told is not guessed', () => {
    expect(
      waitingOf(base, order(['v1'], 'MergeUnits'), groupBySpace(units), groupBySpace(level)),
    ).toBe('unknown');
    expect(waitingOf(base, order([]), groupBySpace(units), groupBySpace(level))).toBe(
      'unknown',
    );
    // A clone with no Revision recorded: the draft has no start for it.
    expect(
      waitingOf(
        base,
        undefined,
        groupBySpace(units),
        groupBySpace([...level.slice(1), clone('v1', 'u1', 0)]),
      ),
    ).toBe('unknown');
    expect(
      waitingOf(
        base,
        undefined,
        groupBySpace(units),
        groupBySpace([...level.slice(1), clone('v1', 'u1', undefined)]),
      ),
    ).toBe('unknown');
    // A Unit cloned from another variant: the base's head says nothing about it.
    expect(
      waitingOf(
        base,
        undefined,
        groupBySpace(units),
        groupBySpace([
          ...level,
          {
            spaceId: 'v2',
            upstreamSpaceId: 'v1',
            upstreamUnitId: 'x',
            upstreamRevisionNum: 1,
          },
        ]),
      ),
    ).toBe('unknown');
    // A variant whose Units all come from another variant (base -> staging -> prod).
    const chained = [
      ...level.filter((unit) => unit.spaceId !== 'v2'),
      ...level
        .filter((unit) => unit.spaceId === 'v2')
        .map((unit) => ({ ...unit, upstreamSpaceId: 'v1' })),
    ];
    expect(waitingOf(base, undefined, groupBySpace(units), groupBySpace(chained))).toBe(
      'unknown',
    );
  });

  test('a variant known to be behind is waiting, whatever else is unknown', () => {
    expect(
      waitingOf(
        base,
        undefined,
        groupBySpace(units),
        groupBySpace([clone('v1', 'u1', 0), clone('v1', 'u2', 1), ...level.slice(2)]),
      ),
    ).toBe('waiting');
  });
});

test.describe('the rows', () => {
  const row = (
    slug: string,
    name: string,
    createdAt: string | undefined,
    waiting: PickerRow['waiting'],
  ): PickerRow => ({
    base: {
      componentId: slug,
      componentSlug: slug,
      componentName: name,
      spaceId: `${slug}-base`,
      spaceSlug: `${slug}-base`,
      variantSpaceIds: [],
    },
    last:
      createdAt === undefined
        ? undefined
        : { slug: `${slug}-co`, createdAt, inScopeSpaceIds: [], updateType: 'UpgradeUnit' },
    waiting,
  });
  const rows = [
    row('catalog', 'Catalog', '2026-10-14T00:00:00Z', 'level'),
    row('ledger', 'Ledger', '2026-10-12T00:00:00Z', 'waiting'),
    row('search', 'Search', undefined, 'level'),
    row('payments', 'payments', '2026-10-09T00:00:00Z', 'waiting'),
  ];

  test('waiting first, then nothing waiting; newest ChangeOrder first, none last', () => {
    expect(
      pickerGroups(rows, '').map((group) => [
        group.key,
        group.rows.map((item) => item.base.componentSlug),
      ]),
    ).toEqual([
      ['waiting', ['ledger', 'payments']],
      ['level', ['catalog', 'search']],
    ]);
  });

  test('search keeps rows by Component name or base slug, ignoring case', () => {
    expect(
      pickerGroups(rows, 'LEDG').flatMap((group) =>
        group.rows.map((item) => item.base.componentSlug),
      ),
    ).toEqual(['ledger']);
    expect(
      pickerGroups(rows, 'search-base').flatMap((group) =>
        group.rows.map((item) => item.base.componentSlug),
      ),
    ).toEqual(['search']);
    expect(pickerGroups(rows, 'nothing')).toEqual([]);
  });

  test('rows whose waiting is unread are not grouped', () => {
    expect(
      pickerGroups([...rows, row('x', 'X', undefined, undefined)], '').map(
        (group) => group.key,
      ),
    ).toEqual(['all']);
  });

  test('how long ago, in the draft words', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const words = draftCopy.page.picker.ago;
    expect(agoText('2026-10-16T11:59:40Z', now)).toBe(words.justNow);
    expect(agoText('2026-10-16T11:48:00Z', now)).toBe(words.minutes(12));
    expect(agoText('2026-10-16T09:00:00Z', now)).toBe(words.hours(3));
    expect(agoText('2026-10-11T09:00:00Z', now)).toBe(words.days(5));
  });
});

test.describe('the reads', () => {
  test('500 Spaces: every request fits the query-string budget, in a bounded number of requests', () => {
    const ids = Array.from(
      { length: 500 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    for (const column of Object.values(PICKER_READ_COLUMN)) {
      const wheres = chunkIds(column, ids).map((chunk) => inClause(column, chunk));
      for (const where of wheres)
        expect(encodeURIComponent(where).length).toBeLessThanOrEqual(
          DEFAULT_MAX_ENCODED_WHERE,
        );
      expect(wheres.length).toBeLessThanOrEqual(Math.ceil(500 / 120));
      expect(wheres.flatMap((where) => where.match(/'[^']+'/g) ?? []).length).toBe(500);
    }
  });
});
