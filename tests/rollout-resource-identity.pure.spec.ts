// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `buildRolloutChangeGroups` (rolloutChanges.ts) and the row key it feeds —
// exercised on real configuration text, end to end into `buildRolloutOutcome`.
//
// WHY THIS IS A PLAYWRIGHT SPEC AND NOT A UNIT-TEST FILE. The UI has no unit-test
// runner (no Jest), so `*.test.ts` files expecting one would never run.
// This file uses the runner the project has,
// takes no `page` fixture, and starts no browser, the same way
// `rollout-stage-matrix.spec.ts` and `rollout-outcome.spec.ts` do.
//
// WHY IT EXISTS. `buildRolloutChangeGroups` had no test at all, and the two
// specs above build `RolloutChangeGroup` objects by hand — so nothing checked
// how a group is DERIVED from configuration text. The row key lived in that
// gap: it read `source.slug`, a name that belongs to one Space, while the
// matrix's own header said rows key on resource identity. Two variants holding
// one resource under different slugs split into two rows, each read as lacking
// the other's, and the outcome bar reported missing resources about variants
// that held them. Every case below starts from configuration strings for that
// reason: a fixture that hands the builder a ready-made group cannot catch it.

import { expect, test } from '@playwright/test';

import {
  buildRolloutChangeGroups,
  type RolloutChangeSource,
} from '../src/pages/x/apps/rollout/rolloutChanges';
import { resourceIdentityJoinKeysOf, resourceIdentityKeyOf } from '../src/pages/x/apps/rollout/rolloutChanges';
import { buildStageMatrix } from '../src/pages/x/apps/rollout/rolloutMatrix';
import { buildRolloutOutcome, carriedResourceKeysOf, partitionShortfall } from '../src/pages/rollouts/rolloutOutcome';

// ── Builders ────────────────────────────────────────────────────────────────

const OLD_IMAGE = 'ghcr.io/confighubai/confighub:v0.4.21';
const NEW_IMAGE = 'ghcr.io/confighubai/confighub:v0.4.22';

/** A Deployment named `confighub`, with the image the promotion moves. */
function deployment(image: string): string {
  return [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: confighub',
    '  namespace: confighub',
    'spec:',
    '  template:',
    '    spec:',
    '      containers:',
    '        - name: confighub',
    `          image: ${image}`,
    '',
  ].join('\n');
}

function resource(kind: string, name: string): string {
  return `apiVersion: v1\nkind: ${kind}\nmetadata:\n  name: ${name}\n  namespace: confighub\n`;
}

interface SourceSpec {
  space: string;
  /** The Space-scoped slug. Deliberately free to differ between Spaces. */
  slug: string;
  beforeData: string | undefined;
  afterData: string | undefined;
}

function source(spec: SourceSpec): RolloutChangeSource {
  return {
    unitId: `${spec.space}/${spec.slug}`,
    slug: spec.slug,
    beforeData: spec.beforeData,
    afterData: spec.afterData,
    written: false,
    cannotDetermineAfter: false,
  };
}

/**
 * `carries` is the configuration of each resource the ChangeOrder carries, as
 * authored at the base. `null` means the base has not been read, which is the
 * state in which nothing may be filtered out.
 */
function outcomeOf(specs: SourceSpec[], spaceIds: string[], carries: string[] | null = null) {
  const groups = buildRolloutChangeGroups(specs.map(source));
  const matrix = buildStageMatrix({
    groups,
    spaceIds,
    spaceIdByUnitId: new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]])),
    spaceNameBySpaceId: new Map(spaceIds.map((id) => [id, id])),
    stageId: 'base',
  });
  /*
   * EVERY spelling, as production does. A helper that carries only the bare key
   * silently fails to match any row keyed on its namespace, and the case then
   * reads as "the change does not carry this resource" — a fixture that lies in
   * the same direction as the defect it is meant to catch.
   */
  const carried =
    carries === null ? null : new Set(carries.flatMap((data) => resourceIdentityJoinKeysOf(data)));
  return { groups, matrix, outcome: buildRolloutOutcome(matrix, carried) };
}

/** The nine resources a stage of this shape holds, for the Space named. */
function nineResources(space: string, slugPrefix = ''): SourceSpec[] {
  const unchanged = [
    ['service', 'Service'],
    ['configmap', 'ConfigMap'],
    ['secret', 'Secret'],
    ['namespace', 'Namespace'],
    ['serviceaccount', 'ServiceAccount'],
    ['ingress', 'Ingress'],
    ['role', 'Role'],
    ['rolebinding', 'RoleBinding'],
  ];
  return [
    {
      space,
      slug: `${slugPrefix}deployment`,
      beforeData: deployment(OLD_IMAGE),
      afterData: deployment(NEW_IMAGE),
    },
    ...unchanged.map(([slug, kind]) => ({
      space,
      slug: `${slugPrefix}${slug}`,
      beforeData: resource(kind, slug),
      afterData: resource(kind, slug),
    })),
  ];
}

// ── buildRolloutChangeGroups ────────────────────────────────────────────────

test.describe('buildRolloutChangeGroups', () => {
  test('identity comes from the configuration, not from the slug', () => {
    const [a, b] = buildRolloutChangeGroups([
      source({ space: 'a', slug: 'deployment', beforeData: deployment(OLD_IMAGE), afterData: undefined }),
      source({ space: 'b', slug: 'rds-deployment', beforeData: deployment(OLD_IMAGE), afterData: undefined }),
    ]);
    expect(a.resourceIdentity).toBeDefined();
    expect(a.resourceIdentity).toBe(b.resourceIdentity);
    // The slug still labels the row, so the reader keeps the name their Space uses.
    expect(a.resourceName).toBe('deployment');
    expect(b.resourceName).toBe('rds-deployment');
  });

  test('a payload with no resource identity reports none, rather than a guess', () => {
    // A properties file has no such concept. Inventing an identity here would
    // join two resources that are not the same.
    const [g] = buildRolloutChangeGroups([
      source({ space: 'a', slug: 'app-props', beforeData: 'LOG_LEVEL=info\n', afterData: 'LOG_LEVEL=debug\n' }),
    ]);
    expect(g.resourceIdentity).toBeUndefined();
    expect(g.determinable).toBe(true);
    expect(g.fieldDiffs).toHaveLength(1);
  });

  test('empty BEFORE data is missing data, never an empty configuration', () => {
    // `useUnitData`'s accessors end in `|| ''`, so a row the response did not
    // carry arrives as `''`. Reading that as real data claims a comparison
    // nobody made.
    const [g] = buildRolloutChangeGroups([
      source({ space: 'a', slug: 'deployment', beforeData: '', afterData: deployment(NEW_IMAGE) }),
    ]);
    expect(g.determinable).toBe(false);
    expect(g.fieldDiffs).toEqual([]);
  });

  test('empty AFTER data does not render the whole resource as removed', () => {
    // Diffing real data against nothing reports every path as removed, which
    // rendered as the promotion wiping the reader's configuration.
    const [g] = buildRolloutChangeGroups([
      source({ space: 'a', slug: 'deployment', beforeData: deployment(OLD_IMAGE), afterData: '' }),
    ]);
    expect(g.fieldDiffs).toEqual([]);
    expect(g.allPaths).toBeUndefined();
    expect(g.fieldDiffs.some((d) => d.newValue === '-')).toBe(false);
  });
});

// ── Multi-document payloads ─────────────────────────────────────────────────

test.describe('a payload holding several documents', () => {
  const nsDoc = 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: app\n';
  const depDoc = (image: string) =>
    `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: app\nspec:\n  image: ${image}\n`;
  const svcDoc = (port: string) =>
    `apiVersion: v1\nkind: Service\nmetadata:\n  name: api\n  namespace: app\nspec:\n  port: ${port}\n`;
  const bundle = (docs: string[]) => docs.join('---\n');

  test('two payloads that merely OPEN with the same document stay apart', () => {
    // The ordinary Kubernetes layout: every bundle carries its namespace. Keyed
    // on the leading document these are indistinguishable, so one of them takes
    // the other's row and leaves the grid -- and the outcome then reads as a
    // verdict on a comparison that never happened.
    const { matrix, outcome } = outcomeOf(
      [
        { space: 'a', slug: 'web', beforeData: bundle([nsDoc, depDoc('v1')]), afterData: bundle([nsDoc, depDoc('v2')]) },
        { space: 'a', slug: 'api', beforeData: bundle([nsDoc, svcDoc('80')]), afterData: bundle([nsDoc, svcDoc('81')]) },
        { space: 'b', slug: 'web', beforeData: bundle([nsDoc, depDoc('v1')]), afterData: bundle([nsDoc, depDoc('v2')]) },
        { space: 'b', slug: 'api', beforeData: bundle([nsDoc, svcDoc('80')]), afterData: bundle([nsDoc, svcDoc('81')]) },
      ],
      ['a', 'b'],
    );
    expect(matrix.rows).toHaveLength(2);
    expect(matrix.duplicateIdentityCount).toBe(0);
    expect(matrix.rows.every((r) => r.cells.every((c) => c.state === 'same'))).toBe(true);
    expect(outcome.groups.map((g) => g.kind)).toEqual(['same']);
  });

  test('the same documents in the opposite order are the same payload', () => {
    const { matrix, outcome } = outcomeOf(
      [
        { space: 'a', slug: 'bundle', beforeData: bundle([nsDoc, depDoc('v1')]), afterData: bundle([nsDoc, depDoc('v2')]) },
        { space: 'b', slug: 'bundle', beforeData: bundle([depDoc('v1'), nsDoc]), afterData: bundle([depDoc('v2'), nsDoc]) },
      ],
      ['a', 'b'],
    );
    expect(matrix.rows).toHaveLength(1);
    expect(outcome.groups.map((g) => g.kind)).toEqual(['same']);
  });

  test('two resources nothing can tell apart keep both rows, and are counted', () => {
    // Same identity AND the grid must still show both. Dropping one loses a
    // resource from the comparison while the card reports a full verdict.
    const { matrix } = outcomeOf(
      [
        { space: 'a', slug: 'first', beforeData: nsDoc, afterData: nsDoc },
        { space: 'a', slug: 'second', beforeData: nsDoc, afterData: nsDoc },
      ],
      ['a'],
    );
    expect(matrix.rows).toHaveLength(2);
    // BOTH are counted, not just the second. The count reports resources whose
    // identity did not separate them, and that is true of each of the pair —
    // counting only the later arrival made the number depend on iteration order.
    expect(matrix.duplicateIdentityCount).toBe(2);
  });
});

// ── The regression this key exists to prevent ───────────────────────────────

test.describe('one resource across variants', () => {
  test('two Spaces naming one resource differently give ONE row and read `same`', () => {
    // Both Spaces hold all nine resources and take the same change. Only the
    // slugs differ, which `cub unit create --name-prefix` makes routine.
    const { matrix, outcome } = outcomeOf(
      [...nineResources('a'), ...nineResources('b', 'rds-')],
      ['a', 'b'],
    );
    expect(matrix.rows).toHaveLength(9);
    expect(outcome.groups).toHaveLength(1);
    expect(outcome.groups[0].kind).toBe('same');
    expect(outcome.groups[0].spaceIds).toEqual(['a', 'b']);
    expect(partitionShortfall(outcome)).toBe(0);
    // No cell may claim the other variant lacks anything.
    expect(matrix.rows.every((r) => r.cells.every((c) => c.state === 'same'))).toBe(true);
  });

  test('a resource the change never touches is not an addition', () => {
    // Variants legitimately hold different furniture: one Space has its own
    // database, another its own cache. A promote that mentions neither has
    // nothing to say about them, so neither variant is "adding" anything. Both
    // hold every resource the change DOES touch.
    const { matrix, outcome } = outcomeOf(
      [
        ...nineResources('a'),
        { space: 'a', slug: 'rds', beforeData: resource('RDSInstance', 'rds'), afterData: resource('RDSInstance', 'rds') },
        ...nineResources('b'),
        { space: 'b', slug: 'redis', beforeData: resource('RedisCache', 'redis'), afterData: resource('RedisCache', 'redis') },
      ],
      ['a', 'b'],
      [deployment(NEW_IMAGE)],
    );
    // The rows are all still there — the matrix reports what each variant
    // holds. It is the OUTCOME that weighs only what the change carries.
    expect(matrix.rows).toHaveLength(11);
    expect(outcome.groups.map((g) => g.kind)).toEqual(['same']);
    expect(outcome.groups[0].spaceIds).toEqual(['a', 'b']);
  });

  test('a variant that lacks a CHANGED resource is still reported', () => {
    // The rule must not silence real news. `b` does not hold the Deployment the
    // promote moves, which is exactly what `adds` is for.
    const { outcome } = outcomeOf(
      [...nineResources('a'), ...nineResources('b').slice(1)],
      ['a', 'b'],
      [deployment(NEW_IMAGE)],
    );
    const adds = outcome.groups.find((g) => g.kind === 'adds');
    expect(adds).toBeDefined();
    expect(adds!.spaceIds).toEqual(['b']);
  });

  test('a variant the change does not touch at all reads `same`', () => {
    // No resource anywhere has a changed path, and the variants hold different
    // resources besides. Nothing the change does distinguishes them.
    const untouched = (space: string, slug: string, kind: string) => ({
      space,
      slug,
      beforeData: resource(kind, slug),
      afterData: resource(kind, slug),
    });
    const { matrix, outcome } = outcomeOf(
      [
        untouched('a', 'service', 'Service'),
        untouched('a', 'rds', 'RDSInstance'),
        untouched('b', 'service', 'Service'),
      ],
      ['a', 'b'],
      [],
    );
    expect(matrix.rows.length).toBeGreaterThan(0);
    expect(outcome.groups.map((g) => g.kind)).toEqual(['same']);
    expect(outcome.groups[0].spaceIds).toEqual(['a', 'b']);
  });

  test('an unreadable resource still reports `unknown`, touched or not', () => {
    // `changed` is read from the field diffs, and a resource nobody could read
    // has none — so it looks untouched whatever it really is. Skipping it would
    // report `same`, which asserts the change leaves the variant alone. That is
    // the one thing the missing data cannot tell us.
    const { outcome } = outcomeOf(
      [
        { space: 'a', slug: 'service', beforeData: resource('Service', 'service'), afterData: resource('Service', 'service') },
        { space: 'b', slug: 'service', beforeData: undefined, afterData: undefined },
      ],
      ['a', 'b'],
      [],
    );
    // Only the Space whose copy could not be read is undeterminable. `a` was
    // read perfectly well, and reporting it as undeterminable too would give up
    // a fact we hold.
    expect(outcome.groups.map((g) => g.kind)).toEqual(['unknown', 'same']);
    expect(outcome.groups.find((g) => g.kind === 'unknown')!.spaceIds).toEqual(['b']);
  });

  test('one resource in two formats is never reported as two additions', () => {
    // `a` holds it as Kubernetes YAML and resolves an identity; `b` holds the
    // same resource as a properties file and has none. The two rows cannot be
    // joined, so neither Space can be said to lack the other's -- both are
    // readable, so the honest answer is that we could not establish it.
    const { outcome } = outcomeOf(
      [
        { space: 'a', slug: 'cfg', beforeData: resource('Service', 'web'), afterData: resource('Service', 'web') },
        { space: 'b', slug: 'cfg', beforeData: 'port=80\n', afterData: 'port=81\n' },
      ],
      ['a', 'b'],
    );
    expect(outcome.groups.some((g) => g.kind === 'adds')).toBe(false);
    expect(outcome.groups.map((g) => g.kind)).toEqual(['unknown']);
  });

  test('a resource already at the target value still counts as carried', () => {
    // The change carries the Deployment, but `a` already holds the new value so
    // every diff in the stage is empty. `b` does not hold it at all. Reading
    // "the promote writes nothing here" as "the promote does not involve this"
    // would report both variants as taking the change identically.
    const dep = (image: string) =>
      `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: app\nspec:\n  image: ${image}\n`;
    const specs = [
      { space: 'a', slug: 'web', beforeData: dep('v2'), afterData: dep('v2') },
      { space: 'a', slug: 'other', beforeData: resource('Service', 'other'), afterData: resource('Service', 'other') },
      { space: 'b', slug: 'other', beforeData: resource('Service', 'other'), afterData: resource('Service', 'other') },
    ];
    const groups = buildRolloutChangeGroups(specs.map(source));
    const matrix = buildStageMatrix({
      groups,
      spaceIds: ['a', 'b'],
      spaceIdByUnitId: new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]])),
      spaceNameBySpaceId: new Map([['a', 'a'], ['b', 'b']]),
      stageId: 'base',
    });
    // Every diff in the stage is empty: the only holder already sits at the
    // target value. Nothing about the ROW can tell this apart from furniture.
    expect(matrix.rows.every((r) => r.fieldCount === 0)).toBe(true);

    // The change, though, carries it — and then the absence is real news.
    const carried = new Set(resourceIdentityJoinKeysOf(dep('v2')));
    const withChange = buildRolloutOutcome(matrix, carried);
    expect(withChange.groups.find((g) => g.kind === 'adds')!.spaceIds).toEqual(['b']);
  });

  test('the outcome does not depend on the order of the Spaces', () => {
    // `referenceSpaceId` is whichever Space contributes first, so anything read
    // from the reference alone makes the verdict an accident of graph order.
    const dep = (image: string) =>
      `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: app\nspec:\n  image: ${image}\n`;
    const specs = [
      { space: 'a', slug: 'web', beforeData: dep('v2'), afterData: dep('v2') },
      { space: 'b', slug: 'web', beforeData: dep('v1'), afterData: dep('v2') },
    ];
    const forward = outcomeOf(specs, ['a', 'b']);
    const reversed = outcomeOf(specs, ['b', 'a']);

    // The shape of the partition holds: the same kinds, the same sizes.
    const shape = (o: typeof forward.outcome) =>
      o.groups.map((g) => `${g.kind}:${g.spaceIds.length}`).sort();
    expect(shape(forward.outcome)).toEqual(shape(reversed.outcome));

    /*
     * WHAT DOES MOVE, and it is older than this filter: `differs` means
     * "differs from the canonical variant", and the canonical variant is
     * whichever Space contributes first. Two variants that disagree therefore
     * swap which of them is named divergent when the column order swaps. The
     * partition is stable; the membership of that one group is relative by
     * construction. Recorded here so the next reader meets it as a known
     * property rather than as a surprise.
     */
    const divergent = (o: typeof forward.outcome) =>
      o.groups.find((g) => g.kind === 'differs')!.spaceIds;
    expect(divergent(forward.outcome)).not.toEqual(divergent(reversed.outcome));
  });

  test('a diff on a resource the change does not carry is not an addition', () => {
    // The dry run computes a merged result, so ANY drift between a Space's data
    // and that result shows as a diff whatever caused it. Reading a diff as
    // proof that the ChangeOrder touches the resource warns a variant that it is
    // "adding" something the change never brings.
    const cache = (size: string) =>
      `apiVersion: apps/v1\nkind: RedisCache\nmetadata:\n  name: cache\n  namespace: app\nspec:\n  size: ${size}\n`;
    const { matrix, outcome } = outcomeOf(
      [
        { space: 'a', slug: 'cache', beforeData: cache('1'), afterData: cache('2') },
        ...nineResources('a'),
        ...nineResources('b'),
      ],
      ['a', 'b'],
      [deployment(NEW_IMAGE)],
    );
    // The drift is real and the row records it — `b` simply does not hold it.
    expect(matrix.rows.find((r) => r.resourceName === 'cache')!.fieldCount).toBe(1);
    expect(outcome.groups.some((g) => g.kind === 'adds')).toBe(false);
    expect(outcome.groups.map((g) => g.kind)).toEqual(['same']);
  });

  test('a Space that contributed nothing is undeterminable, never `same`', () => {
    // We hold no resource at all for `b`. "Takes the change identically" is a
    // claim about a comparison, and no comparison happened for it. Invisible
    // from the rows alone: `b` has a cell in every row, and once the filter
    // removes them it reads as though nothing was wrong.
    const { matrix, outcome } = outcomeOf(nineResources('a'), ['a', 'b'], [deployment(NEW_IMAGE)]);
    expect(matrix.columns.find((c) => c.spaceId === 'b')!.contributing).toBe(false);
    const undeterminable = outcome.groups.find((g) => g.kind === 'unknown');
    expect(undeterminable, 'a Space that contributed nothing must read `unknown`').toBeDefined();
    expect(undeterminable!.spaceIds).toEqual(['b']);
    expect(outcome.groups.some((g) => g.kind === 'same' && g.spaceIds.includes('b'))).toBe(false);
  });

  test('an unread authored change filters nothing, rather than silencing every row', () => {
    // `null` is "we have not read the base yet", and an empty set would be the
    // opposite claim — that the change carries nothing. Filtering on the second
    // when the first is true reports a whole stage as taking the change
    // identically on the strength of data nobody fetched.
    const specs = [...nineResources('a'), ...nineResources('b').slice(1)];
    expect(outcomeOf(specs, ['a', 'b'], null).outcome.groups.some((g) => g.kind === 'adds')).toBe(true);
    expect(outcomeOf(specs, ['a', 'b'], []).outcome.groups.some((g) => g.kind === 'adds')).toBe(false);
  });

  test('a per-variant namespace does not split one resource in two', () => {
    // `cub variant create --namespace` rewrites every namespace in the units it
    // clones, so a namespace that differs between variants is the documented way
    // to make a variant -- not a difference in what they hold. Keying on it
    // split the resource across exactly the variants the page exists to compare.
    const nsScoped = (namespace: string | null) =>
      [
        'apiVersion: apps/v1',
        'kind: Deployment',
        'metadata:',
        '  name: confighub',
        ...(namespace === null ? [] : [`  namespace: ${namespace}`]),
        'spec:',
        '  replicas: 2',
        '',
      ].join('\n');

    // One side declares a namespace and the other does not — the shape two real
    // Spaces held.
    expect(resourceIdentityKeyOf(nsScoped('checkout-prod'))).toBe(resourceIdentityKeyOf(nsScoped(null)));
    // And both declaring, differently — which "compare only where both declare"
    // would NOT have joined, and which the same corpus also holds.
    expect(resourceIdentityKeyOf(nsScoped('checkout-prod'))).toBe(resourceIdentityKeyOf(nsScoped('default')));

    const { matrix, outcome } = outcomeOf(
      [
        { space: 'a', slug: 'confighub', beforeData: nsScoped('checkout-prod'), afterData: nsScoped('checkout-prod') },
        { space: 'b', slug: 'confighub', beforeData: nsScoped('default'), afterData: nsScoped('default') },
      ],
      ['a', 'b'],
      [],
    );
    expect(matrix.rows).toHaveLength(1);
    expect(outcome.groups.map((g) => g.kind)).toEqual(['same']);
  });

  test('two namespaces of one resource in ONE Space keep separate rows', () => {
    // Within a single Space these are genuinely two resources, and the key
    // separates them without any tiebreak: it carries the namespace already.
    const scoped = (namespace: string) =>
      `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: settings\n  namespace: ${namespace}\n`;
    const specs = [
      { space: 'a', slug: 'settings-blue', beforeData: scoped('blue'), afterData: scoped('blue') },
      { space: 'a', slug: 'settings-green', beforeData: scoped('green'), afterData: scoped('green') },
    ];
    const { matrix } = outcomeOf(specs, ['a'], []);
    expect(matrix.rows).toHaveLength(2);
    // No fallback was needed. `duplicateIdentityCount` reports a genuine clash —
    // the same kind, name AND namespace inside one Space — which this is not.
    expect(matrix.duplicateIdentityCount).toBe(0);

    // And the separation does not turn on the order they arrive in: two Spaces
    // listing the pair in opposite orders must still key them the same way.
    const forward = outcomeOf([...specs], ['a'], []).matrix.rows.map((r) => r.key).sort();
    const reversed = outcomeOf([...specs].reverse(), ['a'], []).matrix.rows.map((r) => r.key).sort();
    expect(forward).toEqual(reversed);
  });

  test('a namespace clash is separated by the namespace, and still joins', () => {
    // The tiebreak has to keep joining across variants. The slug cannot: it
    // belongs to one Space, so a slug-keyed row joins nothing AND matches no
    // authored key, which filters it out of the outcome silently. The namespace
    // is a property of the configuration, so both variants reach the same key.
    const scoped = (namespace: string, replicas: string) =>
      `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: ${namespace}\nspec:\n  replicas: ${replicas}\n`;
    const specs = [
      // Each Space holds the SAME two resources, under different slugs.
      { space: 'a', slug: 'web-app', beforeData: scoped('app', '1'), afterData: scoped('app', '2') },
      { space: 'a', slug: 'web-staging', beforeData: scoped('staging', '1'), afterData: scoped('staging', '2') },
      { space: 'b', slug: 'app-web', beforeData: scoped('app', '1'), afterData: scoped('app', '2') },
      { space: 'b', slug: 'staging-web', beforeData: scoped('staging', '1'), afterData: scoped('staging', '2') },
    ];
    const { matrix, outcome } = outcomeOf(specs, ['a', 'b'], [scoped('app', '2'), scoped('staging', '2')]);
    // Two rows, and each joined BOTH Spaces despite the four different slugs.
    expect(matrix.rows).toHaveLength(2);
    expect(matrix.rows.every((r) => r.cells.map((c) => c.state).join() === 'same,same')).toBe(true);
    expect(outcome.groups.map((g) => g.kind)).toEqual(['same']);
    expect(outcome.groups[0].spaceIds).toEqual(['a', 'b']);
  });

  test('a variant missing one of two same-named resources is the one reported', () => {
    // The verdict-inverting case. `a` holds the resource in two namespaces and
    // `b` holds only one, so `b` is the variant missing something -- and a key
    // whose SHAPE depended on what its own Space held named `a` instead,
    // because `a` contested and `b` did not.
    const dep = (ns: string, replicas: string) =>
      `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n  namespace: ${ns}\nspec:\n  replicas: ${replicas}\n`;
    const specs = [
      { space: 'a', slug: 'api-prod', beforeData: dep('prod', '1'), afterData: dep('prod', '2') },
      { space: 'a', slug: 'api-stg', beforeData: dep('staging', '1'), afterData: dep('staging', '2') },
      { space: 'b', slug: 'api-prod', beforeData: dep('prod', '1'), afterData: dep('prod', '2') },
    ];
    const carries = [dep('prod', '2'), dep('staging', '2')];
    const { matrix, outcome } = outcomeOf(specs, ['a', 'b'], carries);

    // UNIFORM KEYING ALONE DECIDES THIS, and the test pins that so a later
    // change to the merge cannot quietly take the case with it: both Spaces
    // spell `prod/api` the same way, so that row joins with nothing merged.
    expect(matrix.mergeDeclinedCount).toBeGreaterThan(0);
    expect(matrix.rows).toHaveLength(2);
    const adds = outcome.groups.find((g) => g.kind === 'adds');
    expect(adds, '`b` lacks staging/api, so `b` is the addition').toBeDefined();
    expect(adds!.spaceIds).toEqual(['b']);

    // And it does not turn on the order of the resources or of the Spaces.
    const shape = (o: ReturnType<typeof outcomeOf>['outcome']) =>
      o.groups.map((g) => `${g.kind}:${[...g.spaceIds].sort().join('|')}`).sort();
    expect(shape(outcomeOf([...specs].reverse(), ['a', 'b'], carries).outcome)).toEqual(shape(outcome));
    expect(shape(outcomeOf(specs, ['b', 'a'], carries).outcome)).toEqual(shape(outcome));
  });

  test('one Space holding two copies declines the merge for the whole stage', () => {
    // The decline is global on purpose: a per-pair merge is a per-Space decision
    // wearing a different hat. `c` holding two copies stops `a` and `b` joining,
    // and the count is what stops that reading as a real difference.
    const dep = (ns: string) =>
      `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n  namespace: ${ns}\nspec:\n  replicas: 1\n`;
    const specs = [
      { space: 'a', slug: 'api', beforeData: dep('prod'), afterData: dep('prod') },
      { space: 'b', slug: 'api', beforeData: dep('default'), afterData: dep('default') },
      { space: 'c', slug: 'api-prod', beforeData: dep('prod'), afterData: dep('prod') },
      { space: 'c', slug: 'api-stg', beforeData: dep('staging'), afterData: dep('staging') },
    ];
    const { matrix, outcome } = outcomeOf(specs, ['a', 'b', 'c'], [dep('prod'), dep('staging')]);
    expect(matrix.mergeDeclinedCount).toBe(1);
    // `a` and `b` no longer share a row, and the count says why.
    expect(matrix.rows.length).toBeGreaterThan(1);
    /*
     * `a` and `b` hold one copy where `c` holds two, so each is genuinely short
     * one however the copies map to each other -- true, and more use to a reader
     * than "could not establish". `c` is short of nothing and reads as
     * undeterminable, because whether its second copy is one `a` or `b` also
     * holds under another namespace is the question the merge declined.
     */
    const kinds = Object.fromEntries(
      outcome.groups.flatMap((g) => g.spaceIds.map((id) => [id, g.kind])),
    );
    expect(kinds).toEqual({ a: 'adds', b: 'adds', c: 'unknown' });

    /*
     * AND THE SAME FOR EVERY LISTING OF THE SPACES. The shortfall is measured
     * against the MOST any variant holds, which names no Space -- measured
     * against the row's reference it named whichever Space contributed first,
     * and an absent Space's verdict then turned on column order.
     */
    const shape = (ids: string[]) =>
      Object.fromEntries(
        outcomeOf(specs, ids, [dep('prod'), dep('staging')]).outcome.groups.flatMap((g) =>
          g.spaceIds.map((id) => [id, g.kind]),
        ),
      );
    for (const order of [['c', 'b', 'a'], ['b', 'a', 'c'], ['c', 'a', 'b']]) {
      expect(shape(order), `order ${order.join(',')}`).toEqual(kinds);
    }
  });

  test('a declined merge still reports a variant that holds fewer copies', () => {
    // The trap in reading a decline as `unknown` everywhere: it would hide a
    // variant that genuinely holds one copy fewer, which is the case the card
    // exists to report. However the copies map to each other, one of `b`'s has
    // no partner, so the shortfall survives the decline.
    const dep = (ns: string, replicas: string) =>
      `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n  namespace: ${ns}\nspec:\n  replicas: ${replicas}\n`;
    const carries = [dep('prod', '2'), dep('staging', '2')];

    const short = outcomeOf(
      [
        { space: 'a', slug: 'api-prod', beforeData: dep('prod', '1'), afterData: dep('prod', '2') },
        { space: 'a', slug: 'api-stg', beforeData: dep('staging', '1'), afterData: dep('staging', '2') },
        { space: 'b', slug: 'api-prod', beforeData: dep('prod', '1'), afterData: dep('prod', '2') },
      ],
      ['a', 'b'],
      carries,
    ).outcome;
    expect(short.groups.find((g) => g.kind === 'adds')!.spaceIds).toEqual(['b']);

    // But where the counts MATCH and only the namespaces disagree, neither
    // variant is short of anything and neither may be reported as adding.
    const evenly = outcomeOf(
      [
        { space: 'a', slug: 'api-prod', beforeData: dep('prod', '1'), afterData: dep('prod', '2') },
        { space: 'a', slug: 'api-stg', beforeData: dep('staging', '1'), afterData: dep('staging', '2') },
        { space: 'b', slug: 'api-dev', beforeData: dep('dev', '1'), afterData: dep('dev', '2') },
        { space: 'b', slug: 'api-stg', beforeData: dep('staging', '1'), afterData: dep('staging', '2') },
      ],
      ['a', 'b'],
      carries,
    ).outcome;
    expect(evenly.groups.map((g) => g.kind)).toEqual(['unknown']);
    expect(evenly.groups[0].spaceIds).toEqual(['a', 'b']);
  });

  test('a resource the change CREATES is carried, though it has no diff', () => {
    // A resource with no recorded starting point never becomes a source group:
    // there is nothing to diff it against, so the tree drops it. It is still
    // part of what the change brings, and a variant that does not hold it is
    // the "Adds resources" case this page exists to report. Reading the carried
    // set from the groups alone silenced exactly that case.
    const created = resource('Ingress', 'new-ingress');
    const createdKeys = resourceIdentityJoinKeysOf(created);
    expect(createdKeys.length).toBeGreaterThan(0);

    // The authored change rewrites nothing at all — it only creates.
    const rewrites = buildRolloutChangeGroups([
      source({ space: 'base', slug: 'svc', beforeData: resource('Service', 'svc'), afterData: resource('Service', 'svc') }),
    ]);
    expect(carriedResourceKeysOf(rewrites)).toEqual(new Set());
    expect(carriedResourceKeysOf(rewrites, createdKeys)).toEqual(new Set(createdKeys));

    // End to end: `a` holds the created resource and `b` does not.
    const { outcome } = outcomeOf(
      [
        { space: 'a', slug: 'svc', beforeData: resource('Service', 'svc'), afterData: resource('Service', 'svc') },
        { space: 'a', slug: 'new-ingress', beforeData: created, afterData: created },
        { space: 'b', slug: 'svc', beforeData: resource('Service', 'svc'), afterData: resource('Service', 'svc') },
      ],
      ['a', 'b'],
      [created],
    );
    const adds = outcome.groups.find((g) => g.kind === 'adds');
    expect(adds, 'a variant lacking a created resource must read `adds`').toBeDefined();
    expect(adds!.spaceIds).toEqual(['b']);
  });

  test('a format with no resource identity is not a change that carries nothing', () => {
    // THE DISTINCTION THIS TURNS ON. ini, properties, toml and env resolve no
    // identity for anything, so the authored change has a group for every
    // resource it carries and a key for none of them. Reading that as "carries
    // nothing" filters every row away and reports the stage as taking the change
    // identically, however far its variants have diverged.
    const props = (level: string) => `LOG_LEVEL=${level}\n`;
    const sourceGroups = buildRolloutChangeGroups([
      source({ space: 'base', slug: 'app', beforeData: props('info'), afterData: props('debug') }),
    ]);
    expect(sourceGroups[0].fieldDiffs.length).toBeGreaterThan(0);
    expect(sourceGroups[0].resourceIdentity).toBeUndefined();
    expect(carriedResourceKeysOf(sourceGroups)).toBeNull();

    // And an authored change that DID resolve identities, but carries no changed
    // path, is the opposite claim: a real empty set.
    const identified = buildRolloutChangeGroups([
      source({ space: 'base', slug: 'svc', beforeData: resource('Service', 'svc'), afterData: resource('Service', 'svc') }),
    ]);
    expect(carriedResourceKeysOf(identified)).toEqual(new Set());
  });

  test('a diverging non-Kubernetes stage reports `differs`, never `same`', () => {
    // The end-to-end shape of the case above: two variants of a properties file
    // that genuinely take different values.
    const props = (level: string) => `LOG_LEVEL=${level}\n`;
    const { matrix, outcome } = outcomeOf(
      [
        { space: 'a', slug: 'app', beforeData: props('info'), afterData: props('debug') },
        { space: 'b', slug: 'app', beforeData: props('info'), afterData: props('trace') },
      ],
      ['a', 'b'],
      null,
    );
    expect(matrix.rows[0].cells.map((c) => c.state)).toEqual(['same', 'differs']);
    expect(outcome.groups.find((g) => g.kind === 'differs')!.spaceIds).toEqual(['b']);
    expect(outcome.groups.some((g) => g.kind === 'same' && g.spaceIds.includes('b'))).toBe(false);
  });

  test('a stage whose format carries no identity still compares by slug', () => {
    // Every variant falls back the same way, so the join still holds and the
    // fallback costs nothing.
    const props = (level: string) => `LOG_LEVEL=${level}\n`;
    const { matrix, outcome } = outcomeOf(
      [
        { space: 'a', slug: 'app-props', beforeData: props('info'), afterData: props('debug') },
        { space: 'b', slug: 'app-props', beforeData: props('info'), afterData: props('debug') },
      ],
      ['a', 'b'],
    );
    expect(matrix.rows).toHaveLength(1);
    expect(outcome.groups[0].kind).toBe('same');
  });

  test('a row nobody could read reports `unknown`, never a missing resource', () => {
    // Space `b`'s data never arrived, so its row key falls back to the slug
    // while `a`'s resolves a real identity. The two cannot be compared, and
    // "this variant does not hold it" needs to know what "it" is.
    const { outcome } = outcomeOf(
      [
        { space: 'a', slug: 'deployment', beforeData: deployment(OLD_IMAGE), afterData: deployment(NEW_IMAGE) },
        { space: 'b', slug: 'deployment', beforeData: '', afterData: undefined },
      ],
      ['a', 'b'],
    );
    /*
     * THE RECORDED TRADE. `b` holds the resource, so its absence from the row is
     * not absence at all -- but with `b`'s copy unreadable we cannot say whether
     * it takes the change. `adds` would assert `b` lacks a resource it holds;
     * `same` would assert a comparison that never happened. `unknown` is the
     * only claim the data supports, and it costs a genuine absence being
     * reported as undeterminable whenever the row's only holder is unreadable.
     * Accepted deliberately: "could not establish" beats a false all-clear.
     */
    expect(outcome.groups.map((g) => g.kind)).toEqual(['unknown', 'same']);
    expect(outcome.groups.find((g) => g.kind === 'unknown')!.spaceIds).toEqual(['b']);
    expect(outcome.groups.some((g) => g.kind === 'adds')).toBe(false);
    expect(partitionShortfall(outcome)).toBe(0);
  });
});
