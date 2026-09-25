// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `buildStageMatrix` (rolloutMatrix.ts) — the stage-first redesign's one piece
// of real derivation, exercised directly rather than through the pane.
//
// WHY THIS IS A PLAYWRIGHT SPEC AND NOT A UNIT-TEST FILE. The UI has no unit-test
// runner (no Jest), so `*.test.ts` files expecting one would never run.
// Playwright's runner is a Node test runner
// that already transpiles TypeScript, and `component-activity-feed-tabs.spec.ts`
// and `rollout-mode.spec.ts` both already import product modules from `../src`
// this way. So this file uses the runner the project actually has, takes no
// `page` fixture, and starts no browser: it is a few milliseconds of pure
// assertion, in the place the project keeps its tests.
//
// WHY IT EXISTS AT ALL, given the pane is covered live. The four cell states
// are decided by combinations the live fixture cannot cheaply produce on
// demand — an undeterminable dry run, a resource one Space holds and another
// does not, a Space of the stage that contributed nothing at all. Driving the
// browser proves the wiring; this proves the rules. Both are needed, and
// neither substitutes for the other.

import { expect, test } from '@playwright/test';

import {
  buildStageMatrix,
  rolloutMatrixRowKey,
  shortenVariantLabel,
  type BuildStageMatrixInput,
} from '../src/pages/x/apps/rollout/rolloutMatrix';
import { resourceIdentityKeyOf } from '../src/pages/x/apps/rollout/rolloutChanges';
import type { RolloutChangeGroup } from '../src/pages/x/apps/rollout/rolloutTypes';

/*
 * Identity built the way production builds it, from real configuration text.
 * A hand-written identity string cannot catch a change in how the key is
 * constructed: the fixture would keep agreeing with itself while production
 * moved underneath it.
 */
function identityOf(kind: string, name: string): string {
  const key = resourceIdentityKeyOf(
    `apiVersion: v1\nkind: ${kind}\nmetadata:\n  name: ${name}\n`,
  );
  expect(key, `no identity for ${kind}/${name}`).toBeDefined();
  return key!;
}

// ── Builders ────────────────────────────────────────────────────────────────
//
// Unit ids are `<space>/<resource>` so a failure names the offending group
// without a lookup table, and so `spaceIdByUnitId` can be derived from the
// groups themselves rather than maintained as a second list free to disagree.

interface GroupSpec {
  space: string;
  name: string;
  kind?: string;
  /**
   * Resource identity, the key rows join on. Omitted means the payload carried
   * none, which is what sends a row to the slug fallback — so a case that wants
   * the fallback simply leaves this out.
   */
  identity?: string;
  /** path -> newValue. The old value is deliberately not a parameter: see below. */
  fields?: Record<string, string>;
  /** Old values, when a case needs them to differ while new values match. */
  oldFields?: Record<string, string>;
  determinable?: boolean;
}

function group(spec: GroupSpec): RolloutChangeGroup {
  const fields = spec.fields ?? {};
  return {
    unitId: `${spec.space}/${spec.name}`,
    resourceName: spec.name,
    resourceKind: spec.kind,
    resourceIdentity: spec.identity,
    fieldDiffs: Object.entries(fields).map(([path, newValue]) => ({
      path,
      oldValue: spec.oldFields?.[path] ?? 'before',
      newValue,
    })),
    written: false,
    determinable: spec.determinable ?? true,
  };
}

function build(
  specs: GroupSpec[],
  spaceIds: string[],
  stageId = 'staging',
  overrides: Partial<BuildStageMatrixInput> = {},
) {
  const groups = specs.map(group);
  return buildStageMatrix({
    groups,
    spaceIds,
    spaceIdByUnitId: new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]])),
    spaceNameBySpaceId: new Map(spaceIds.map((id) => [id, id])),
    stageId,
    ...overrides,
  });
}

/** The cell states of one row, in column order — the shape every case asserts. */
function statesOf(matrix: ReturnType<typeof build>, resourceName: string): string[] {
  const row = matrix.rows.find((r) => r.resourceName === resourceName);
  expect(row, `no row for resource '${resourceName}'`).toBeDefined();
  return row!.cells.map((c) => c.state);
}

// ── §3.3 The four cell states ───────────────────────────────────────────────

test.describe('buildStageMatrix — cell states', () => {
  test('identical incoming changes read `same` in every column', () => {
    const m = build(
      [
        { space: 'a', name: 'app', kind: 'Deployment', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', kind: 'Deployment', fields: { '/image': 'v2' } },
      ],
      ['a', 'b'],
    );
    expect(statesOf(m, 'app')).toEqual(['same', 'same']);
    expect(m.divergentRowCount).toBe(0);
    expect(m.differsCountBySpaceId.size).toBe(0);
  });

  test('a different new value on the same path reads `differs`, and only in that column', () => {
    const m = build(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2' } },
        { space: 'c', name: 'app', fields: { '/image': 'v2-hotfix' } },
      ],
      ['a', 'b', 'c'],
    );
    expect(statesOf(m, 'app')).toEqual(['same', 'same', 'differs']);
    expect(m.divergentRowCount).toBe(1);
    expect(m.differsCountBySpaceId.get('c')).toBe(1);
    // The two that agree with the canonical variant are NOT counted, and the
    // canonical variant is never counted against itself.
    expect(m.differsCountBySpaceId.has('a')).toBe(false);
    expect(m.differsCountBySpaceId.has('b')).toBe(false);
    expect(m.rows[0].differingSpaceIds).toEqual(['c']);
  });

  test('a path present in one variant and absent in another reads `differs`', () => {
    // Same new value on the shared path, but one variant additionally changes
    // something the other does not. Comparing only the shared paths would call
    // this "the same change", which it is not.
    const m = build(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2', '/replicas': '3' } },
      ],
      ['a', 'b'],
    );
    expect(statesOf(m, 'app')).toEqual(['same', 'differs']);
  });

  test('a resource one Space does not hold reads `new` there, not `differs`', () => {
    const m = build(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'a', name: 'ratelimit', fields: { '/burst': '10' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2' } },
      ],
      ['a', 'b'],
    );
    expect(statesOf(m, 'app')).toEqual(['same', 'same']);
    expect(statesOf(m, 'ratelimit')).toEqual(['same', 'new']);
    // `new` is not divergence: nothing about it says the promote does a
    // different thing there, only that it has not arrived yet.
    expect(m.divergentRowCount).toBe(0);
    expect(m.differsCountBySpaceId.size).toBe(0);
  });

  test('an undeterminable group reads `unknown`, never `same` and never `differs`', () => {
    const m = build(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', fields: {}, determinable: false },
      ],
      ['a', 'b'],
    );
    // The load-bearing half: `fieldDiffs` is empty for BOTH "no change" and
    // "could not tell", so an undeterminable group with no field diffs must
    // not read as "takes it verbatim". Asserted as the state of THAT column,
    // not as an absence anywhere in the row — the canonical column is
    // legitimately `same`.
    expect(statesOf(m, 'app')).toEqual(['same', 'unknown']);
    expect(m.rows[0].cells[1]).toEqual({ spaceId: 'b', state: 'unknown' });
    expect(m.divergentRowCount).toBe(0);
  });

  test('an undeterminable CANONICAL variant makes the whole row `unknown`', () => {
    // Both sides must be determinable for a cell to claim `same`. When the
    // reference itself could not be established there is nothing to compare
    // against, so a determinable variant is still `?` — the honest answer, not
    // a quiet promotion to `same`.
    const m = build(
      [
        { space: 'a', name: 'app', fields: {}, determinable: false },
        { space: 'b', name: 'app', fields: { '/image': 'v2' } },
      ],
      ['a', 'b'],
    );
    expect(m.canonicalSpaceId).toBe('a');
    expect(statesOf(m, 'app')).toEqual(['unknown', 'unknown']);
    expect(m.divergentRowCount).toBe(0);
  });
});

// ── §3.3 What counts as "the same change" ───────────────────────────────────

test.describe('buildStageMatrix — the sameness rule', () => {
  test('a different STARTING value with the same new value is still the same change', () => {
    // Two variants that arrive at the same value from different places ARE
    // taking the same change; flagging that would report a difference in where
    // they were, not in what the promote does.
    const m = build(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' }, oldFields: { '/image': 'v1' } },
        {
          space: 'b',
          name: 'app',
          fields: { '/image': 'v2' },
          oldFields: { '/image': 'v1-hotfix' },
        },
      ],
      ['a', 'b'],
    );
    expect(statesOf(m, 'app')).toEqual(['same', 'same']);
  });

  test('the same paths in a different order are the same change', () => {
    // `fieldDiffs` follows each Space's own document order, and two Spaces can
    // legitimately hold the same paths in a different sequence. An unsorted
    // comparison would report every such stage as fully divergent.
    const a = group({ space: 'a', name: 'app', fields: { '/image': 'v2', '/memory': '768Mi' } });
    const b = group({ space: 'b', name: 'app', fields: { '/memory': '768Mi', '/image': 'v2' } });
    const m = buildStageMatrix({
      groups: [a, b],
      spaceIds: ['a', 'b'],
      spaceIdByUnitId: new Map([
        [a.unitId, 'a'],
        [b.unitId, 'b'],
      ]),
      spaceNameBySpaceId: new Map(),
      stageId: 'staging',
    });
    expect(m.rows[0].cells.map((c) => c.state)).toEqual(['same', 'same']);
  });
});

// ── §3.3 Row identity ───────────────────────────────────────────────────────

test.describe('buildStageMatrix — row identity', () => {
  test('rows join on resource identity, not on list position', () => {
    // The multi-doc trap: Space `b` holds the same two resources in the
    // opposite order. An index-keyed matrix would compare the Deployment
    // against the ConfigMap and report both as divergent.
    const m = build(
      [
        { space: 'a', name: 'app', kind: 'Deployment', fields: { '/image': 'v2' } },
        { space: 'a', name: 'config', kind: 'ConfigMap', fields: { '/APP_VERSION': '2' } },
        { space: 'b', name: 'config', kind: 'ConfigMap', fields: { '/APP_VERSION': '2' } },
        { space: 'b', name: 'app', kind: 'Deployment', fields: { '/image': 'v2' } },
      ],
      ['a', 'b'],
    );
    expect(m.divergentRowCount).toBe(0);
    expect(statesOf(m, 'app')).toEqual(['same', 'same']);
    expect(statesOf(m, 'config')).toEqual(['same', 'same']);
    // Row ORDER follows the canonical variant's own order, not `b`'s.
    expect(m.rows.map((r) => r.resourceName)).toEqual(['app', 'config']);
  });

  test('a different resource identity is a different row', () => {
    // A Deployment and a StatefulSet are two resources, whatever each Space
    // calls them, so they get two rows and neither holds the other's.
    const m = build(
      [
        {
          space: 'a',
          name: 'app',
          kind: 'Deployment',
          identity: identityOf('Deployment', 'app'),
          fields: { '/image': 'v2' },
        },
        {
          space: 'b',
          name: 'app',
          kind: 'StatefulSet',
          identity: identityOf('StatefulSet', 'app'),
          fields: { '/image': 'v2' },
        },
      ],
      ['a', 'b'],
    );
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0].cells.map((c) => c.state)).toEqual(['same', 'new']);
    expect(m.rows[1].cells.map((c) => c.state)).toEqual(['new', 'same']);
  });

  test('one resource under two slugs is ONE row, not two arrivals', () => {
    // The defect this key exists to prevent. `cub unit create --name-prefix`
    // makes divergent slugs a supported workflow, so two variants can hold one
    // resource under two names. Keyed on the slug they split into two rows and
    // each variant reads as lacking the other's, which the outcome bar reports
    // as "Missing resources" about variants that hold the resource already.
    const identity = identityOf('Deployment', 'confighub');
    const m = build(
      [
        { space: 'a', name: 'deployment', kind: 'Deployment', identity, fields: { '/image': 'v2' } },
        { space: 'b', name: 'rds-deployment', kind: 'Deployment', identity, fields: { '/image': 'v2' } },
      ],
      ['a', 'b'],
    );
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].cells.map((c) => c.state)).toEqual(['same', 'same']);
    expect(m.divergentRowCount).toBe(0);
  });

  test('the row key cannot collide across a name/kind boundary', () => {
    // `a-b` + kind `c` and `a` + kind `b-c` would collide under a delimiter
    // join. This is the quiet mis-join the JSON key exists to prevent. Only a
    // payload with no identity to read reaches this fallback.
    const key = (name: string, kind: string | undefined) =>
      rolloutMatrixRowKey({
        unitId: `u/${name}`,
        resourceName: name,
        resourceKind: kind,
        fieldDiffs: [],
        written: false,
        determinable: true,
      });
    expect(key('a-b', 'c')).not.toBe(key('a', 'b-c'));
    // An absent kind is distinct from a kind that is the literal string 'null'.
    expect(key('app', undefined)).not.toBe(key('app', 'null'));
  });

  test('a resource only a non-canonical Space holds is still a row', () => {
    // Omitting it would hide exactly the divergence the matrix exists to show.
    const m = build(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'canary-only', fields: { '/x': '1' } },
      ],
      ['a', 'b'],
    );
    expect(m.rows.map((r) => r.resourceName)).toEqual(['app', 'canary-only']);
    // Its reference falls back to the first contributing Space that HOLDS it,
    // so `b`'s real change reads as its own baseline rather than as `new`
    // everywhere with nothing to compare against.
    const row = m.rows[1];
    expect(row.referenceSpaceId).toBe('b');
    expect(row.cells.map((c) => c.state)).toEqual(['new', 'same']);
    expect(row.fieldCount).toBe(1);
  });
});

// ── §3.4 Canonical variant, and §3.3 part-populated stages ──────────────────

test.describe('buildStageMatrix — part-populated stages', () => {
  const PART_POPULATED: GroupSpec[] = [
    { space: 'b', name: 'app', kind: 'Deployment', fields: { '/image': 'v2' } },
    { space: 'b', name: 'config', kind: 'ConfigMap', fields: { '/APP_VERSION': '2' } },
  ];

  test('the canonical variant is the first CONTRIBUTING Space, not the first in graph order', () => {
    // The defect this rule removes: `a` is first in graph order and holds
    // nothing, so taking it would render an empty diff tree directly beneath a
    // matrix showing `b`'s real content.
    const m = build(PART_POPULATED, ['a', 'b', 'c']);
    expect(m.canonicalSpaceId).toBe('b');
  });

  test('a Space that contributed nothing is still a column, full of `new`', () => {
    const m = build(PART_POPULATED, ['a', 'b', 'c']);
    expect(m.columns.map((c) => c.spaceId)).toEqual(['a', 'b', 'c']);
    expect(m.columns.map((c) => c.contributing)).toEqual([false, true, false]);
    expect(statesOf(m, 'app')).toEqual(['new', 'same', 'new']);
    expect(statesOf(m, 'config')).toEqual(['new', 'same', 'new']);
  });

  test('the counts are qualified, and the resource count is a floor', () => {
    const m = build(PART_POPULATED, ['a', 'b', 'c']);
    expect(m.partial).toBe(true);
    expect(m.contributingSpaceCount).toBe(1);
    expect(m.resourceCount).toBe(2);
    expect(m.totalFieldCount).toBe(2);
    // An unpopulated Space contributes no divergence: it has not taken a
    // different change, it has taken no change.
    expect(m.divergentRowCount).toBe(0);
  });

  test('a stage where NO Space has contributed is not "partial"', () => {
    // Nothing has been promoted anywhere yet is the ordinary pre-first-promote
    // state, not a part-populated one, and the pane's roster must keep each
    // Space's real verdict sentence rather than replacing it with "Not here
    // yet".
    const m = build([], ['a', 'b']);
    expect(m.partial).toBe(false);
    expect(m.canonicalSpaceId).toBeNull();
    expect(m.contributingSpaceCount).toBe(0);
    expect(m.rows).toHaveLength(0);
  });

  test('a fully-populated stage is not "partial"', () => {
    const m = build(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2' } },
      ],
      ['a', 'b'],
    );
    expect(m.partial).toBe(false);
    expect(m.contributingSpaceCount).toBe(2);
  });
});

// ── Columns and labels ──────────────────────────────────────────────────────

test.describe('buildStageMatrix — columns', () => {
  test('a group whose Space cannot be resolved is dropped, never assigned to a guess', () => {
    // Landing it in some column would read as that variant's change.
    const orphan = group({ space: 'ghost', name: 'app', fields: { '/image': 'v9' } });
    const real = group({ space: 'a', name: 'app', fields: { '/image': 'v2' } });
    const m = buildStageMatrix({
      groups: [real, orphan],
      spaceIds: ['a', 'b'],
      spaceIdByUnitId: new Map([[real.unitId, 'a']]), // the orphan is absent
      spaceNameBySpaceId: new Map(),
      stageId: 'staging',
    });
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].cells.map((c) => c.state)).toEqual(['same', 'new']);
    expect(m.contributingSpaceCount).toBe(1);
  });

  test('a column keeps its whole slug alongside the shortened heading', () => {
    const m = build([{ space: 'staging-eu-west', name: 'app', fields: { '/i': '1' } }], [
      'staging-eu-west',
      'staging-us-east',
    ]);
    expect(m.columns.map((c) => c.label)).toEqual(['eu-west', 'us-east']);
    expect(m.columns.map((c) => c.fullLabel)).toEqual(['staging-eu-west', 'staging-us-east']);
  });

  test('shortenVariantLabel never returns nothing', () => {
    expect(shortenVariantLabel('staging-eu-west', 'staging')).toBe('eu-west');
    expect(shortenVariantLabel('staging_eu', 'staging')).toBe('eu');
    // A slug that IS the stage name keeps its whole value rather than
    // collapsing to an empty heading.
    expect(shortenVariantLabel('staging', 'staging')).toBe('staging');
    // No shared prefix: guessing at one across arbitrary slugs would truncate
    // something meaningful.
    expect(shortenVariantLabel('eu-west-1', 'staging')).toBe('eu-west-1');
    expect(shortenVariantLabel('staging-eu', '')).toBe('staging-eu');
  });
});

// ── Aggregates the pane and the graph both read ─────────────────────────────

test.describe('buildStageMatrix — aggregates', () => {
  test('differs counts are per Space, summed across rows', () => {
    const m = build(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'a', name: 'config', fields: { '/v': '2' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'config', fields: { '/v': '2' } },
        { space: 'c', name: 'app', fields: { '/image': 'other' } },
        { space: 'c', name: 'config', fields: { '/v': 'other' } },
      ],
      ['a', 'b', 'c'],
    );
    expect(m.divergentRowCount).toBe(2);
    expect(m.differsCountBySpaceId.get('c')).toBe(2);
    // `differsCountBySpaceId.size` is what the pane's scope line prints as
    // "N variants differ" — variants, not resources.
    expect(m.differsCountBySpaceId.size).toBe(1);
  });

  test('the field count comes from each row’s own reference variant', () => {
    const m = build(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2', '/memory': '768Mi' } },
        { space: 'a', name: 'config', fields: { '/v': '2' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2', '/memory': '768Mi' } },
      ],
      ['a', 'b'],
    );
    expect(m.rows.map((r) => r.fieldCount)).toEqual([2, 1]);
    expect(m.totalFieldCount).toBe(3);
  });
});
