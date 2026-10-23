// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Client evaluation and lens counts. Each lens's match set from
 * `lensPredicate` must equal a hand-written predicate (the oracle), and the
 * counts from `computeCounts` must equal the counts worked out naively, on 200
 * random Units and many random lens combinations.
 */
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { evalWhere, lensPredicate } from '../src/pages/x/view-explorer/model/client-eval';
import {
  LIVE_COUNT_ROW_LIMIT,
  type LensMatch,
  computeCounts,
  liveCountsEnabled,
  liveCountsOffText,
  matchSet,
  resultWithout,
  suggestionCount,
  valueCounts,
} from '../src/pages/x/view-explorer/model/counts';
import { fieldById } from '../src/pages/x/view-explorer/model/fields';
import type { Lens, LensSpec } from '../src/pages/x/view-explorer/model/types';
import { fakeUnits, lens, rng, unitId } from './fixtures/view-explorer-model-views';

const ROWS = fakeUnits(200);
const UNIVERSE = ROWS.map(unitId);

const tgt = (u: ExtendedUnitRead) => (u.Unit?.TargetID ? (u.Target?.Slug ?? null) : null);
const label = (u: ExtendedUnitRead, k: string) => u.Unit?.Labels?.[k];
const head = (u: ExtendedUnitRead) => u.Unit?.HeadRevisionNum ?? 0;
const rel = (u: ExtendedUnitRead) => u.Unit?.LastReleasedRevisionNum ?? 0;

/** Lens specs with an independent, hand-written meaning (SQL NULL rules spelled out). */
const POOL: Array<{ spec: LensSpec; oracle: (u: ExtendedUnitRead) => boolean }> = [
  {
    spec: { kind: 'field', field: 'Space', op: 'matches', values: ['payments-*'] },
    oracle: (u) => !!u.Space?.Slug.startsWith('payments-'),
  },
  {
    spec: { kind: 'field', field: 'Space', op: 'isNot', values: ['checkout-*'] },
    oracle: (u) => !u.Space?.Slug.startsWith('checkout-'),
  },
  {
    spec: { kind: 'field', field: 'Target', op: 'is', values: ['prod-us-east-1'] },
    oracle: (u) => tgt(u) === 'prod-us-east-1',
  },
  // `!=` matches a row with no value; NOT IN on a related entity's attribute does not.
  {
    spec: { kind: 'field', field: 'Target', op: 'isNot', values: ['dev-kind'] },
    oracle: (u) => tgt(u) !== 'dev-kind',
  },
  {
    spec: {
      kind: 'field',
      field: 'Target',
      op: 'isNot',
      values: ['dev-kind', 'prod-us-east-1'],
    },
    oracle: (u) => tgt(u) !== null && !['dev-kind', 'prod-us-east-1'].includes(tgt(u) ?? ''),
  },
  {
    spec: { kind: 'field', field: 'Labels.env', op: 'isNot', values: ['dev'] },
    oracle: (u) => label(u, 'env') !== 'dev',
  },
  {
    spec: {
      kind: 'field',
      field: 'Labels.region',
      op: 'is',
      values: ['eu-west-1', 'eu-central-1'],
    },
    oracle: (u) => ['eu-west-1', 'eu-central-1'].includes(label(u, 'region') ?? ''),
  },
  {
    spec: { kind: 'field', field: 'Labels.tier', op: 'isNot', values: ['config', 'web'] },
    oracle: (u) => !['config', 'web'].includes(label(u, 'tier') ?? ''),
  },
  {
    spec: { kind: 'field', field: 'Labels.region', op: 'isNot', values: ['eu-*'] },
    oracle: (u) => label(u, 'region') !== undefined && !label(u, 'region')?.startsWith('eu-'),
  },
  {
    spec: { kind: 'field', field: 'Labels.tier', op: 'empty', values: [] },
    oracle: (u) => label(u, 'tier') === undefined,
  },
  {
    spec: { kind: 'field', field: 'HeadRevisionNum', op: 'gte', values: ['10'] },
    oracle: (u) => head(u) >= 10,
  },
  {
    spec: { kind: 'field', field: 'UpdatedAt', op: 'lt', values: ['2026-10-01T00:00:00Z'] },
    oracle: (u) => (u.Unit?.UpdatedAt ?? '') < '2026-10-01',
  },
  {
    spec: { kind: 'field', field: 'ToolchainType', op: 'isNot', values: ['OpenTofu/HCL'] },
    oracle: (u) => u.Unit?.ToolchainType !== 'OpenTofu/HCL',
  },
  {
    spec: { kind: 'field', field: 'Slug', op: 'matches', values: ['cart-*'] },
    oracle: (u) => !!u.Unit?.Slug.startsWith('cart-'),
  },
  {
    spec: { kind: 'field', field: 'UpstreamSpaceSlug', op: 'notEmpty', values: [] },
    oracle: (u) => !!u.Unit?.UpstreamSpaceID,
  },
  {
    spec: { kind: 'status', status: 'unreleased' },
    oracle: (u) => tgt(u) !== null && head(u) > rel(u),
  },
  {
    spec: { kind: 'status', status: 'released' },
    oracle: (u) => tgt(u) !== null && head(u) === rel(u),
  },
  { spec: { kind: 'status', status: 'untargeted' }, oracle: (u) => !u.Unit?.TargetID },
  {
    spec: { kind: 'status', status: 'upgradable' },
    oracle: (u) =>
      (u.Unit?.UpstreamRevisionNum ?? 0) > 0 &&
      (u.Unit?.UpstreamRevisionNum ?? 0) < (u.UpstreamUnit?.HeadRevisionNum ?? 0),
  },
];

function setOf(l: Lens): Set<string> {
  const p = lensPredicate('Unit', l);
  if (!p) throw new Error('expected a client predicate');
  return matchSet(ROWS, unitId, p);
}

test.describe('client evaluation equals the oracle', () => {
  for (const { spec, oracle } of POOL) {
    test(JSON.stringify(spec), () => {
      const got = setOf(lens(spec));
      const want = new Set(ROWS.filter(oracle).map(unitId));
      expect([...got].sort()).toEqual([...want].sort());
      // Every lens in the pool matches some rows and misses others, so the check means something.
      expect(got.size).toBeGreaterThan(0);
      expect(got.size).toBeLessThan(ROWS.length);
    });
  }

  test('Custom WHERE lenses are left to the server', () => {
    expect(lensPredicate('Unit', lens({ kind: 'custom', where: "Slug = 'a'" }))).toBeNull();
    expect(
      lensPredicate(
        'Unit',
        lens({ kind: 'field', field: 'Space', op: 'is', values: [] }),
      )?.(ROWS[0]),
    ).toBe(true);
  });
});

test.describe('server semantics on single rows', () => {
  const row: ExtendedUnitRead = {
    Unit: {
      Slug: 'cart_api',
      ToolchainType: 'Kubernetes/YAML',
      Labels: { app: 'Cart' },
      HeadRevisionNum: 5,
      LastReleasedRevisionNum: 3,
    },
  };
  const cases: Array<[string, boolean | undefined]> = [
    ["Labels.env != 'dev'", true],
    ["Labels.env NOT IN ('dev')", true],
    ["Labels.env NOT LIKE 'd%'", false],
    ["Target.Slug != 'x'", true],
    ["Target.Slug NOT IN ('x')", false],
    ["Space.Labels.env NOT IN ('x')", false],
    ["Slug LIKE 'cart_ap_'", true],
    ['Labels.env IS NULL', true],
    ["Labels.app = 'cart'", false],
    ["Labels.app ILIKE 'cart'", true],
    ["Slug LIKE 'cart_api'", true],
    ["Slug LIKE 'cartXapi'", false],
    ["Slug LIKE 'cart%'", true],
    ["Slug NOT LIKE 'c%'", false],
    ['HeadRevisionNum > LastReleasedRevisionNum', true],
    ['TargetID IS NULL', true],
    ["Target.Slug = 'x' IS NOT TRUE", true],
    ['HeadRevisionNum IN (4, 5)', true],
    ["Slug ~ 'cart'", undefined],
    ['Data.spec.replicas > 1', undefined],
    ['LEN(Labels) > 0', undefined],
    ["Annotations.x = 'y'", undefined],
  ];
  for (const [where, want] of cases) {
    test(where, () => {
      expect(evalWhere('Unit', where, row)).toBe(want);
    });
  }
});

/** The counts worked out the slow, obvious way. */
function naive(matches: LensMatch[]) {
  const sets = (except?: string) =>
    matches
      .filter((m) => m.enabled && m.set && m.lensId !== except)
      .map((m) => m.set as ReadonlySet<string>);
  const pass = (id: string, list: ReadonlySet<string>[]) => list.every((s) => s.has(id));
  const result = UNIVERSE.filter((id) => pass(id, sets()));
  const perLens = new Map<string, { effect: number | null; alone: number | null }>();
  for (const m of matches) {
    if (!m.set) {
      perLens.set(m.lensId, { effect: null, alone: null });
      continue;
    }
    const set = m.set;
    const alone = UNIVERSE.filter((id) => set.has(id)).length;
    const effect = m.enabled
      ? UNIVERSE.filter((id) => pass(id, sets(m.lensId))).length - result.length
      : result.length - result.filter((id) => set.has(id)).length;
    perLens.set(m.lensId, { effect, alone });
  }
  return { result, perLens };
}

test.describe('counts equal a brute-force oracle', () => {
  test('300 random lens combinations on 200 rows', () => {
    const r = rng(42);
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + Math.floor(r() * 5);
      const matches: LensMatch[] = [];
      for (let i = 0; i < n; i++) {
        const { spec } = POOL[Math.floor(r() * POOL.length)];
        const l = lens(spec, r() > 0.25);
        matches.push({ lensId: l.id, enabled: l.enabled, set: r() < 0.05 ? null : setOf(l) });
      }
      const got = computeCounts(UNIVERSE, matches);
      const want = naive(matches);
      expect(got.result).toEqual(want.result);
      expect([...got.perLens.entries()]).toEqual([...want.perLens.entries()]);
      expect(got.partial).toBe(matches.some((m) => m.enabled && m.set === null));
    }
  });

  test('no lenses: everything is the result', () => {
    const got = computeCounts(UNIVERSE, []);
    expect(got.result).toEqual(UNIVERSE);
  });

  test('a hidden lens reports what it would remove', () => {
    const shown = lens({
      kind: 'field',
      field: 'Space',
      op: 'matches',
      values: ['payments-*'],
    });
    const hidden = lens({ kind: 'status', status: 'unreleased' }, false);
    const matches = [shown, hidden].map((l) => ({
      lensId: l.id,
      enabled: l.enabled,
      set: setOf(l),
    }));
    const got = computeCounts(UNIVERSE, matches);
    const unreleasedInPayments = got.result.filter((id) => matches[1].set.has(id)).length;
    expect(got.perLens.get(hidden.id)?.effect).toBe(got.result.length - unreleasedInPayments);
    expect(got.perLens.get(shown.id)?.effect).toBe(UNIVERSE.length - got.result.length);
  });
});

test.describe('value and suggestion counts', () => {
  test('value counts leave out the lens being edited', () => {
    const space = lens({ kind: 'field', field: 'Space', op: 'is', values: ['payments-prod'] });
    const unreleased = lens({ kind: 'status', status: 'unreleased' });
    const matches = [space, unreleased].map((l) => ({
      lensId: l.id,
      enabled: true,
      set: setOf(l),
    }));
    const base = new Set(resultWithout(UNIVERSE, matches, space.id));
    const field = fieldById('Unit', 'Space');
    if (!field) throw new Error('no Space field');
    const counts = valueCounts(ROWS, unitId, base, (u) => {
      const v = field.value(u);
      return v === null ? null : String(v);
    });
    const unreleasedRows = ROWS.filter((u) => tgt(u) !== null && head(u) > rel(u));
    for (const s of ['payments-prod', 'checkout-dev']) {
      expect(counts.get(s) ?? 0).toBe(
        unreleasedRows.filter((u) => u.Space?.Slug === s).length,
      );
    }
    // Choosing payments-prod gives exactly the current result.
    expect(counts.get('payments-prod') ?? 0).toBe(
      computeCounts(UNIVERSE, matches).result.length,
    );
  });

  test('a suggestion shows the result now and with it added', () => {
    const result = new Set(UNIVERSE.slice(0, 19));
    const set = new Set([...UNIVERSE.slice(10, 17), ...UNIVERSE.slice(100, 120)]);
    expect(suggestionCount(result, set)).toEqual({ from: 19, to: 7 });
  });
});

test('live counts stop above the row limit', () => {
  expect(LIVE_COUNT_ROW_LIMIT).toBe(5000);
  expect(liveCountsEnabled(0)).toBe(true);
  expect(liveCountsEnabled(5000)).toBe(true);
  expect(liveCountsEnabled(5001)).toBe(false);
});

test('one sentence explains why the counts are off', () => {
  expect(liveCountsOffText('Unit')).toBe(
    'Counts are off for views over 5,000 units, to keep typing fast.',
  );
  expect(liveCountsOffText('Space')).toBe(
    'Counts are off for views over 5,000 spaces, to keep typing fast.',
  );
  expect(liveCountsOffText('Resource')).toBe(
    'Counts are off for views over 5,000 resources, to keep typing fast.',
  );
});

test('with perLens off, only the result pass runs', () => {
  class CountingSet extends Set<string> {
    calls = 0;
    has(v: string) {
      this.calls++;
      return super.has(v);
    }
  }
  const universe = Array.from({ length: 1000 }, (_, i) => `r${i}`);
  const shown = new CountingSet(universe.filter((_, i) => i % 2 === 0));
  const hidden = new CountingSet(universe.filter((_, i) => i % 3 === 0));
  const matches = [
    { lensId: 'a', enabled: true, set: shown },
    { lensId: 'b', enabled: false, set: hidden },
  ];
  const off = computeCounts(universe, matches, { perLens: false });
  expect(off.result).toHaveLength(500);
  // One pass over the universe for the enabled lens; none for "alone" or the hidden lens.
  expect(shown.calls).toBe(universe.length);
  expect(hidden.calls).toBe(0);
  expect(off.perLens.get('a')).toEqual({ effect: null, alone: null });
  expect(off.perLens.get('b')).toEqual({ effect: null, alone: null });

  shown.calls = 0;
  const on = computeCounts(universe, matches);
  expect(on.result).toEqual(off.result);
  expect(shown.calls).toBeGreaterThan(universe.length);
  expect(hidden.calls).toBeGreaterThan(0);
  expect(on.perLens.get('a')).toEqual({ effect: 500, alone: 500 });
});
