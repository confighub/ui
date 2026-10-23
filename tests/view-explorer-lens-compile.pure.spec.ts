// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Lenses ⇄ WHERE. Compiling lenses and reading the WHERE back gives the same
 * lenses for every seeded view (the round-trip law), through the single-line
 * Filter.Where and through text mode's multi-line form with hidden lines.
 */
import { expect, test } from '@playwright/test';

import {
  compileWhere,
  lensConjuncts,
  lensProblem,
  lensesEqual,
  lensesToConjuncts,
  parsedTextToLenses,
  whereToLenses,
} from '../src/pages/x/view-explorer/model/lens-compile';
import type { EntityKind, Lens, LensSpec } from '../src/pages/x/view-explorer/model/types';
import {
  formatWhereText,
  parseWhereText,
} from '../src/pages/x/view-explorer/model/where/format';
import { UNRELEASED_CHANGES_WHERE } from '../src/utility/unit-release-functions';
import { idGen, lens, seedViews } from './fixtures/view-explorer-model-views';

function read(entity: EntityKind, where: string): Lens[] {
  const r = whereToLenses(entity, where, idGen());
  if (!r.ok) throw new Error(r.error.message);
  return r.lenses;
}

const specOf = (l: Lens): LensSpec & { enabled: boolean } => {
  const { id: _id, ...rest } = l;
  void _id;
  return rest;
};

test.describe('round-trip law', () => {
  for (const { name, def } of seedViews()) {
    test(`${name}: enabled lenses survive Filter.Where`, () => {
      const enabled = def.lenses.filter((l) => l.enabled);
      const back = read(def.entity, compileWhere(def.entity, def.lenses));
      expect(back.map(specOf)).toEqual(enabled.map(specOf));
      expect(lensesEqual(back, enabled)).toBe(true);
    });

    test(`${name}: all lenses survive text mode`, () => {
      const { enabled, hidden } = lensesToConjuncts(def.entity, def.lenses);
      const text = formatWhereText(enabled, hidden);
      const parsed = parseWhereText(text);
      if (!parsed.ok) throw new Error(parsed.error.message);
      const back = parsedTextToLenses(def.entity, parsed.value, idGen());
      const expected = [
        ...def.lenses.filter((l) => l.enabled),
        ...def.lenses.filter((l) => !l.enabled),
      ];
      expect(back.map(specOf)).toEqual(expected.map(specOf));
    });
  }
});

test.describe('lens -> WHERE', () => {
  const cases: Array<[EntityKind, LensSpec, string[] | null]> = [
    [
      'Unit',
      { kind: 'field', field: 'Space', op: 'is', values: ['payments-prod'] },
      ["Space.Slug = 'payments-prod'"],
    ],
    [
      'Unit',
      { kind: 'field', field: 'Space', op: 'is', values: ['a', 'b'] },
      ["Space.Slug IN ('a', 'b')"],
    ],
    [
      'Unit',
      { kind: 'field', field: 'Space', op: 'isNot', values: ['a', 'b'] },
      ["Space.Slug NOT IN ('a', 'b')"],
    ],
    [
      'Unit',
      { kind: 'field', field: 'Space', op: 'matches', values: ['payments-*'] },
      ["Space.Slug LIKE 'payments-%'"],
    ],
    [
      'Unit',
      { kind: 'field', field: 'Space', op: 'isNot', values: ['checkout-*'] },
      ["Space.Slug NOT LIKE 'checkout-%'"],
    ],
    [
      'Unit',
      { kind: 'field', field: 'Target', op: 'notEmpty', values: [] },
      ['TargetID IS NOT NULL'],
    ],
    [
      'Unit',
      { kind: 'field', field: 'Labels.app', op: 'is', values: ['cart'] },
      ["Labels.app = 'cart'"],
    ],
    [
      'Unit',
      { kind: 'field', field: 'Labels.app', op: 'empty', values: [] },
      ['Labels.app IS NULL'],
    ],
    [
      'Unit',
      { kind: 'field', field: 'HeadRevisionNum', op: 'gt', values: ['4'] },
      ['HeadRevisionNum > 4'],
    ],
    [
      'Unit',
      { kind: 'field', field: 'HeadRevisionNum', op: 'is', values: ['4', '5'] },
      ['HeadRevisionNum IN (4, 5)'],
    ],
    [
      'Unit',
      { kind: 'field', field: 'UpdatedAt', op: 'lt', values: ['2026-01-01T00:00:00Z'] },
      ["UpdatedAt < '2026-01-01T00:00:00Z'"],
    ],
    [
      'Unit',
      { kind: 'status', status: 'unreleased' },
      ['HeadRevisionNum > LastReleasedRevisionNum', 'TargetID IS NOT NULL'],
    ],
    ['Unit', { kind: 'status', status: 'untargeted' }, ['TargetID IS NULL']],
    ['Unit', { kind: 'custom', where: "Slug ~ '^a'" }, ["Slug ~ '^a'"]],
    [
      'Space',
      { kind: 'field', field: 'Component', op: 'is', values: ['payments'] },
      ["Component.Slug = 'payments'"],
    ],
    [
      'Resource',
      { kind: 'field', field: 'Unit.Labels.app', op: 'is', values: ['cart'] },
      ["Unit.Labels.app = 'cart'"],
    ],
    ['Resource', { kind: 'status', status: 'untargeted' }, ['TargetID IS NULL']],
    // Not expressible: no values yet, several patterns, a quote, a status Spaces lack, a column-only field.
    ['Unit', { kind: 'field', field: 'Space', op: 'is', values: [] }, null],
    ['Unit', { kind: 'field', field: 'Space', op: 'matches', values: ['a*', 'b*'] }, null],
    ['Unit', { kind: 'field', field: 'Slug', op: 'is', values: ["it's"] }, null],
    ['Space', { kind: 'status', status: 'unreleased' }, null],
    ['Unit', { kind: 'field', field: 'Status', op: 'is', values: ['Released'] }, null],
    ['Unit', { kind: 'field', field: 'Target', op: 'empty', values: [] }, null],
  ];
  for (const [entity, spec, expected] of cases) {
    test(`${entity} ${JSON.stringify(spec)}`, () => {
      expect(lensConjuncts(entity, spec)).toEqual(expected);
    });
  }

  test('only enabled lenses are compiled, in order', () => {
    const lenses = [
      lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] }),
      lens({ kind: 'status', status: 'untargeted' }, false),
      lens({ kind: 'field', field: 'Labels.app', op: 'is', values: ['x'] }),
    ];
    expect(compileWhere('Unit', lenses)).toBe("Space.Slug = 'a' AND Labels.app = 'x'");
  });

  test('the Unreleased status is the expression the Units page uses', () => {
    expect(compileWhere('Unit', [lens({ kind: 'status', status: 'unreleased' })])).toBe(
      UNRELEASED_CHANGES_WHERE,
    );
  });
});

test.describe('WHERE -> lenses', () => {
  test('field patterns become field lenses', () => {
    const got = read(
      'Unit',
      "Space.Slug = 'a' AND Target.Slug != 'b' AND Labels.app IN ('x', 'y') AND Labels.tier NOT IN ('z') AND Slug LIKE 'pay%' AND ToolchainType NOT LIKE 'Open%' AND UpstreamUnitID IS NULL AND HeadRevisionNum >= 3",
    ).map(specOf);
    expect(got).toEqual([
      { kind: 'field', field: 'Space', op: 'is', values: ['a'], enabled: true },
      { kind: 'field', field: 'Target', op: 'isNot', values: ['b'], enabled: true },
      { kind: 'field', field: 'Labels.app', op: 'is', values: ['x', 'y'], enabled: true },
      { kind: 'field', field: 'Labels.tier', op: 'isNot', values: ['z'], enabled: true },
      { kind: 'field', field: 'Slug', op: 'matches', values: ['pay*'], enabled: true },
      { kind: 'field', field: 'ToolchainType', op: 'isNot', values: ['Open*'], enabled: true },
      { kind: 'field', field: 'UpstreamUnitSlug', op: 'empty', values: [], enabled: true },
      { kind: 'field', field: 'HeadRevisionNum', op: 'gte', values: ['3'], enabled: true },
    ]);
  });

  test('statuses are read when their conjuncts are adjacent and in order', () => {
    const got = read(
      'Unit',
      'UpstreamRevisionNum > 0 AND UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum AND TargetID IS NULL',
    ).map(specOf);
    expect(got).toEqual([
      { kind: 'status', status: 'upgradable', enabled: true },
      { kind: 'status', status: 'untargeted', enabled: true },
    ]);
    const apart = read(
      'Unit',
      "HeadRevisionNum > LastReleasedRevisionNum AND Slug = 'a' AND TargetID IS NOT NULL",
    ).map(specOf);
    expect(apart).toEqual([
      { kind: 'custom', where: 'HeadRevisionNum > LastReleasedRevisionNum', enabled: true },
      { kind: 'field', field: 'Slug', op: 'is', values: ['a'], enabled: true },
      { kind: 'field', field: 'Target', op: 'notEmpty', values: [], enabled: true },
    ]);
  });

  test('anything a lens cannot show is one Custom WHERE lens per conjunct, as written', () => {
    const got = read(
      'Unit',
      "Slug ~ '^a' AND LEN(Labels) > 2 AND Labels ? 'app' AND Slug ILIKE 'A%' AND Data.spec.replicas > 1 AND Slug LIKE 'a_b' AND Slug = 'a' IS NOT TRUE AND HeadRevisionNum = 'x' AND SpaceID = '0b1c2d3e-0000-4000-8000-000000000000'",
    ).map((l) => (l.kind === 'custom' ? l.where : `not custom: ${l.kind}`));
    expect(got).toEqual([
      "Slug ~ '^a'",
      'LEN(Labels) > 2',
      "Labels ? 'app'",
      "Slug ILIKE 'A%'",
      'Data.spec.replicas > 1',
      "Slug LIKE 'a_b'",
      "Slug = 'a' IS NOT TRUE",
      "HeadRevisionNum = 'x'",
      "SpaceID = '0b1c2d3e-0000-4000-8000-000000000000'",
    ]);
  });

  test('a lens op the field does not offer stays custom', () => {
    // Target has no `empty`: a Unit with no Target is the Not targeted status.
    expect(read('Unit', 'TargetID IS NULL').map(specOf)).toEqual([
      { kind: 'status', status: 'untargeted', enabled: true },
    ]);
    expect(read('Unit', "UpdatedAt = '2026-01-01T00:00:00Z'")[0].kind).toBe('custom');
  });

  test('a parse error is returned, not thrown', () => {
    const r = whereToLenses('Unit', "Slug = 'a' OR Slug = 'b'", idGen());
    expect(r.ok).toBe(false);
  });

  test('Spaces and Resources read their own attributes', () => {
    expect(read('Space', "Slug LIKE 'pay%' AND Labels.env = 'prod'").map(specOf)).toEqual([
      { kind: 'field', field: 'Slug', op: 'matches', values: ['pay*'], enabled: true },
      { kind: 'field', field: 'Labels.env', op: 'is', values: ['prod'], enabled: true },
    ]);
    expect(
      read(
        'Resource',
        "ResourceType = 'apps/v1/Deployment' AND Unit.Labels.app = 'x' AND Unit.HeadRevisionNum > Unit.LastReleasedRevisionNum AND TargetID IS NOT NULL",
      ).map(specOf),
    ).toEqual([
      {
        kind: 'field',
        field: 'ResourceType',
        op: 'is',
        values: ['apps/v1/Deployment'],
        enabled: true,
      },
      { kind: 'field', field: 'Unit.Labels.app', op: 'is', values: ['x'], enabled: true },
      { kind: 'status', status: 'unreleased', enabled: true },
    ]);
  });
});

test.describe('lenses that WHERE cannot hold', () => {
  test('a glob with _ or % is not a pattern lens', () => {
    for (const v of ['pay_*', 'a%b*']) {
      expect(
        lensConjuncts('Unit', { kind: 'field', field: 'Slug', op: 'matches', values: [v] }),
      ).toBeNull();
      expect(
        lensProblem('Unit', lens({ kind: 'field', field: 'Slug', op: 'matches', values: [v] }))
          ?.kind,
      ).toBe('invalid');
      expect(
        lensConjuncts('Unit', { kind: 'field', field: 'Slug', op: 'isNot', values: [v] }),
      ).toBeNull();
    }
    // Without a *, a matches value is still a LIKE pattern, so _ is refused there too.
    expect(
      lensConjuncts('Unit', {
        kind: 'field',
        field: 'Slug',
        op: 'matches',
        values: ['my_app'],
      }),
    ).toBeNull();
  });

  test('* has one meaning: a pattern. Read back, a literal * stays Custom WHERE', () => {
    for (const where of [
      "DisplayName != 'a*'",
      "DisplayName = 'a*'",
      "DisplayName IN ('a*', 'b')",
      "DisplayName NOT IN ('a*')",
    ]) {
      expect(read('Unit', where).map((l) => l.kind)).toEqual(['custom']);
    }
    expect(
      lensConjuncts('Unit', {
        kind: 'field',
        field: 'Slug',
        op: 'isNot',
        values: ['a*', 'b'],
      }),
    ).toBeNull();
    expect(
      lensConjuncts('Unit', { kind: 'field', field: 'Slug', op: 'is', values: ['a*'] }),
    ).toBeNull();
    // Every lens that compiles reads back equal.
    const ok = [
      lens({ kind: 'field', field: 'Slug', op: 'matches', values: ['pay*'] }),
      lens({ kind: 'field', field: 'Slug', op: 'isNot', values: ['pay*'] }),
      lens({ kind: 'field', field: 'Slug', op: 'matches', values: ['exact'] }),
    ];
    expect(read('Unit', compileWhere('Unit', ok)).map(specOf)).toEqual(ok.map(specOf));
  });

  test('a number field refuses text; an empty comparison is incomplete, not dropped silently', () => {
    expect(
      lensConjuncts('Unit', {
        kind: 'field',
        field: 'HeadRevisionNum',
        op: 'is',
        values: ['abc'],
      }),
    ).toBeNull();
    expect(
      lensProblem(
        'Unit',
        lens({ kind: 'field', field: 'HeadRevisionNum', op: 'is', values: ['abc'] }),
      ),
    ).toEqual({
      kind: 'invalid',
      message: 'Head revision takes a whole number.',
    });
    expect(
      lensProblem(
        'Unit',
        lens({ kind: 'field', field: 'HeadRevisionNum', op: 'gt', values: [''] }),
      )?.kind,
    ).toBe('incomplete');
    expect(
      lensProblem('Unit', lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] })),
    ).toBeNull();
  });

  test('a Custom WHERE lens holds exactly one valid conjunct', () => {
    expect(
      lensProblem(
        'Unit',
        lens({
          kind: 'custom',
          where: 'HeadRevisionNum > LastReleasedRevisionNum AND TargetID IS NOT NULL',
        }),
      )?.kind,
    ).toBe('invalid');
    expect(
      lensProblem('Unit', lens({ kind: 'custom', where: "Slug = 'a' OR Slug = 'b'" }))?.kind,
    ).toBe('invalid');
    expect(lensProblem('Unit', lens({ kind: 'custom', where: "Slug ~ 'a'" }))).toBeNull();
  });
});
