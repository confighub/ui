// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The derived Group by keys: the quiet Deployments of a Base stack by a value
// the page works out, not by a Space label.
//
// - "Cloud provider" (?graphGroup=@provider): the Target fact Cloud.Provider.
// - "Last released" (?graphGroup=@released): how long ago the latest published
//   Release was made, "Never released" last.
// - "Upstream revision" (?graphGroup=@revision): how many revisions the
//   Deployment is behind its upstream Base, the number the Stale chip shows.
//
// Each key starts with "@" so it cannot be the same as a label key. When a key
// is offered and how it resolves from the URL is one rule for all three, so it
// is asserted once, over every key.
import { expect, test } from '@playwright/test';

import type {
  ExtendedSpaceRead,
  ExtendedUnitRead,
  UnitRead,
} from '@confighub/rtk-query';
import { buildComponentData } from '../src/pages/x/apps/componentData';
import type { ComponentDeployment, ReleaseAge } from '../src/pages/x/apps/componentTypes';
import {
  cloudProviderCell,
  cloudProviderFact,
  releaseAge,
  releasedCell,
  revisionCell,
  withReleaseAges,
} from '../src/pages/x/apps/flow-graph/fold/derivedGroupKeys';
import {
  PROVIDER_GROUP_KEY,
  RELEASED_GROUP_KEY,
  REVISION_GROUP_KEY,
} from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import { foldHeaderValues } from '../src/pages/x/apps/flow-graph/fold/foldHeader';
import {
  buildFoldModel,
  countDrawnValues,
  countStacks,
  foldMembers,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  defaultGroupKey,
  groupByOptions,
  groupQuiet,
  resolveGroupKey,
} from '../src/pages/x/apps/flow-graph/fold/groupBy';

const QUIET = { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 };

/** The derived value a member carries. Absent fields are no value. */
interface Derived {
  /** The Cloud.Provider fact of its Target. */
  provider?: string;
  /** The bucket of its latest Release. */
  age?: ReleaseAge;
  /** Revisions behind the upstream head; absent is up to date. */
  behind?: number;
}

interface Member extends Derived {
  name: string;
  labels?: Record<string, string>;
  /** The Base it sits under; default "base-a". */
  base?: string;
}

function node(m: Member, parent: string | null): ComponentDeployment {
  const behind = m.behind ?? 0;
  return {
    deploymentId: m.name,
    slug: m.name,
    displayName: m.name,
    type: 'Deployment',
    targets: [{ targetId: `target-${m.name}`, name: m.name, label: m.name }],
    parentDeploymentId: parent,
    stage: 2,
    upgradeableCount: behind > 0 ? 1 : 0,
    unappliedCount: 0,
    unitCount: 1,
    liveStatus: { Sync: 'Synced', Health: 'Healthy' },
    liveStatusProvider: 'argocd',
    labels: m.labels ?? {},
    ...(m.provider !== undefined && { targetFacts: { 'Cloud.Provider': m.provider } }),
    ...(m.age !== undefined && { releaseAge: m.age }),
    ...(behind > 0 && { staleRevisionsBehind: behind }),
    configSignals: { ...QUIET, staleUnits: behind > 0 ? 1 : 0 },
  };
}

function base(id: string, parent: string | null): ComponentDeployment {
  return {
    deploymentId: id,
    slug: id,
    displayName: id,
    type: 'Base',
    targets: [],
    parentDeploymentId: parent,
    stage: parent === null ? 0 : 1,
    upgradeableCount: 0,
    unappliedCount: 0,
    unitCount: 1,
    liveStatusProvider: 'unknown',
    labels: {},
    configSignals: QUIET,
  };
}

/** A root with Bases "base-a" (and "base-b" when used) and the given leaves. */
function component(members: Member[]): ComponentDeployment[] {
  const bases = [...new Set(members.map((m) => m.base ?? 'base-a'))];
  return [
    base('root', null),
    ...bases.map((b) => base(b, 'root')),
    ...members.map((m) => node(m, m.base ?? 'base-a')),
  ];
}

const optionKeys = (deployments: ComponentDeployment[]) =>
  groupByOptions(foldMembers(deployments)).map((o) => o.key);

interface DerivedKey {
  key: string;
  /** The ?graphGroup= value, and (without "@") a Space label key it must not be confused with. */
  param: string;
  label: string;
  /** Three distinct values. */
  values: [Derived, Derived, Derived];
}

const KEYS: DerivedKey[] = [
  {
    key: PROVIDER_GROUP_KEY,
    param: '@provider',
    label: 'Cloud provider',
    values: [{ provider: 'aws' }, { provider: 'gcp' }, { provider: 'azure' }],
  },
  {
    key: RELEASED_GROUP_KEY,
    param: '@released',
    label: 'Last released',
    values: [{ age: 'today' }, { age: 'older' }, { age: 'week' }],
  },
  {
    key: REVISION_GROUP_KEY,
    param: '@revision',
    label: 'Upstream revision',
    values: [{}, { behind: 1 }, { behind: 2 }],
  },
];

test.describe('when a derived key is offered', () => {
  test('listed when it puts two Deployments of one Base together', () => {
    for (const { key, label, values: [a, b] } of KEYS) {
      const deployments = component([
        { name: 'a', ...a },
        { name: 'b', ...a },
        { name: 'c', ...b },
      ]);
      expect(groupByOptions(foldMembers(deployments)), key).toEqual([
        { key, label, valueCount: 2, isDefault: false },
      ]);
    }
  });

  test('not listed when no Deployment has a value', () => {
    // No provider fact and no Release; under a Base, every Deployment is
    // "Up to date", which is one value.
    expect(optionKeys(component([{ name: 'a' }, { name: 'b' }, { name: 'c' }]))).toEqual([]);
  });

  test('not listed when every Deployment has one value', () => {
    for (const { key, values: [a] } of KEYS) {
      const deployments = component([
        { name: 'a', ...a },
        { name: 'b', ...a },
        { name: 'c', ...a, base: 'base-b' },
      ]);
      expect(optionKeys(deployments), key).toEqual([]);
    }
  });

  test('not listed when every value is on one Deployment of its Base', () => {
    for (const { key, values: [a, b, c] } of KEYS) {
      const deployments = component([
        { name: 'a', ...a },
        { name: 'b', ...b },
        { name: 'c', ...a, base: 'base-b' },
        { name: 'd', ...c, base: 'base-b' },
      ]);
      expect(optionKeys(deployments), key).toEqual([]);
    }
  });

  test('not listed when it only repeats the Base split', () => {
    for (const { key, values: [a, b] } of KEYS) {
      const deployments = component([
        { name: 'a', ...a },
        { name: 'b', ...a },
        { name: 'c', ...b, base: 'base-b' },
        { name: 'd', ...b, base: 'base-b' },
      ]);
      expect(optionKeys(deployments), key).toEqual([]);
    }
  });
});

test.describe('the key', () => {
  test('it is never the default, and comes after the Space label keys', () => {
    for (const { key, param, values: [a, b] } of KEYS) {
      const label = param.slice(1);
      const members = foldMembers(
        component([
          { name: 'a', ...a, labels: { Department: 'retail', [label]: 'x' } },
          { name: 'b', ...a, labels: { Department: 'retail', [label]: 'x' } },
          { name: 'c', ...b, labels: { Department: 'payments', [label]: 'y' } },
        ]),
      );
      const options = groupByOptions(members);
      expect(options.map((o) => [o.key, o.isDefault]), key).toEqual([
        ['Department', true],
        [label, false],
        [key, false],
      ]);
      expect(defaultGroupKey(members)).toBe('Department');

      // ?graphGroup=@<key> resolves to the derived key; the bare name stays a label.
      expect(resolveGroupKey(param, options, 'Department')).toBe(key);
      expect(resolveGroupKey(label, options, 'Department')).toBe(label);
      expect(groupQuiet('base-a', members, label).map((g) => g.label)).toEqual(['x', 'y']);
    }
  });

  test('it is not the default even when it is the only option', () => {
    for (const { key, values: [a, b] } of KEYS) {
      const only = foldMembers(
        component([
          { name: 'a', ...a },
          { name: 'b', ...a },
          { name: 'c', ...b },
        ]),
      );
      expect(groupByOptions(only).map((o) => o.key), key).toEqual([key]);
      expect(defaultGroupKey(only)).toBeNull();
    }
  });

  test('?graphGroup=@<key> falls back to the default when it is not an option', () => {
    const labelsOnly = groupByOptions(
      foldMembers(
        component([
          { name: 'a', labels: { Department: 'retail' } },
          { name: 'b', labels: { Department: 'retail' } },
          { name: 'c', labels: { Department: 'payments' } },
        ]),
      ),
    );
    for (const { param } of KEYS) {
      expect(resolveGroupKey(param, labelsOnly, 'Department'), param).toBe('Department');
    }
  });
});

test.describe('Cloud provider', () => {
  test('a known provider gets its product name, matched without regard to case', () => {
    const cell = (provider: string) => cloudProviderCell(node({ name: 'x', provider }, 'base-a'));
    expect(cell('aws')).toEqual({ value: 'aws', label: 'AWS', rank: 0 });
    expect(cell('gcp')).toEqual({ value: 'gcp', label: 'Google Cloud', rank: 0 });
    expect(cell('azure')).toEqual({ value: 'azure', label: 'Azure', rank: 0 });
    expect(cell('Aws')).toEqual({ value: 'aws', label: 'AWS', rank: 0 });
    expect(cell('oracle')).toEqual({ value: 'oracle', label: 'oracle', rank: 0 });
    expect(cell('  ')).toBeNull();
    expect(cloudProviderCell(node({ name: 'x' }, 'base-a'))).toBeNull();
  });

  test('another fact whose key ends in Provider is the fallback', () => {
    expect(cloudProviderFact({ 'Custom.Provider': 'gcp' })).toBe('gcp');
    expect(cloudProviderFact({ 'Custom.Provider': 'gcp', 'Cloud.Provider': 'aws' })).toBe('aws');
    expect(cloudProviderFact({ 'Cloud.Provider': '', 'Other.Provider': 'azure' })).toBe('azure');
  });

  test('stacks run A-Z by product name, "No provider" last', () => {
    const deployments = component([
      { name: 'a' },
      { name: 'b' },
      { name: 'c', provider: 'oracle' },
      { name: 'd', provider: 'oracle' },
      { name: 'e', provider: 'gcp' },
      { name: 'f', provider: 'gcp' },
      { name: 'g', provider: 'aws' },
      { name: 'h', provider: 'aws' },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), PROVIDER_GROUP_KEY);
    expect(groups.map((g) => [g.label, g.memberIds])).toEqual([
      ['AWS', ['g', 'h']],
      ['Google Cloud', ['e', 'f']],
      ['oracle', ['c', 'd']],
      ['No provider', ['a', 'b']],
    ]);
    expect(groups[3].id).toBe('stack:base-a:__none');
  });
});

test.describe('Last released', () => {
  // Local times, so "Today" (from local midnight) holds in any time zone.
  const NOW = new Date(2026, 8, 25, 15, 30).getTime();
  const at = (month: number, day: number, hour = 12, minute = 0): string =>
    new Date(2026, month, day, hour, minute).toISOString();

  test('"today" is from local midnight, not the last 24 hours, and clock skew is today', () => {
    expect(releaseAge(at(8, 25, 0, 0), NOW)).toBe('today');
    expect(releaseAge(at(8, 25, 15, 29), NOW)).toBe('today');
    expect(releaseAge(at(8, 24, 23, 59), NOW)).toBe('week');
    expect(releaseAge(at(8, 25, 15, 45), NOW)).toBe('today');
  });

  test('"week" is the last 7 days, "month" the last 30, then "older"', () => {
    expect(releaseAge(at(8, 19, 12), NOW)).toBe('week');
    expect(releaseAge(new Date(NOW - 7 * 86_400_000 + 60_000).toISOString(), NOW)).toBe('week');
    expect(releaseAge(new Date(NOW - 7 * 86_400_000).toISOString(), NOW)).toBe('month');
    expect(releaseAge(new Date(NOW - 30 * 86_400_000 + 60_000).toISOString(), NOW)).toBe(
      'month',
    );
    expect(releaseAge(new Date(NOW - 30 * 86_400_000).toISOString(), NOW)).toBe('older');
    expect(releaseAge(at(0, 3), NOW)).toBe('older');
  });

  test('no time, or a time that does not parse, is no value', () => {
    expect(releaseAge(undefined, NOW)).toBeUndefined();
    expect(releaseAge('', NOW)).toBeUndefined();
    expect(releaseAge('not a time', NOW)).toBeUndefined();
    expect(releasedCell(node({ name: 'x' }, 'base-a'))).toBeNull();
  });

  test('each Deployment gets the bucket of its latest Release against the one clock', () => {
    const deployments = component([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    const releases = new Map([
      ['a', { createdAt: at(8, 25, 9) }],
      ['b', { createdAt: at(7, 1) }],
    ]);
    const ages = withReleaseAges(deployments, releases, NOW);
    expect(Object.fromEntries(ages.map((d) => [d.deploymentId, d.releaseAge]))).toEqual({
      root: undefined,
      'base-a': undefined,
      a: 'today',
      b: 'older',
      c: undefined,
    });
  });

  test('stacks run newest first, not A-Z, and "Never released" last', () => {
    const deployments = component([
      { name: 'a' },
      { name: 'b' },
      { name: 'c', age: 'older' },
      { name: 'd', age: 'older' },
      { name: 'e', age: 'month' },
      { name: 'f', age: 'month' },
      { name: 'g', age: 'week' },
      { name: 'h', age: 'week' },
      { name: 'i', age: 'today' },
      { name: 'j', age: 'today' },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), RELEASED_GROUP_KEY);
    expect(groups.map((g) => [g.label, g.memberIds])).toEqual([
      ['Today', ['i', 'j']],
      ['This week', ['g', 'h']],
      ['This month', ['e', 'f']],
      ['Older', ['c', 'd']],
      ['Never released', ['a', 'b']],
    ]);
    expect(groups[4].id).toBe('stack:base-a:__none');
  });

  test('the menu, the drawn count and the header agree with what is drawn', () => {
    // Never-released Deployments have unreleased changes, so they are cards:
    // the stacks hold "Today" only, whatever the Deployments' own values are.
    const deployments = component([
      { name: 'a', age: 'today' },
      { name: 'b', age: 'today' },
      { name: 'c', age: 'today' },
      { name: 'x' },
      { name: 'y' },
    ]).map((d) =>
      ['x', 'y'].includes(d.deploymentId)
        ? { ...d, configSignals: { ...QUIET, unreleasedUnits: 1 } }
        : d,
    );
    const model = buildFoldModel({ deployments, groupKey: RELEASED_GROUP_KEY });
    expect(
      groupByOptions(foldMembers(deployments)).find((o) => o.key === RELEASED_GROUP_KEY)
        ?.valueCount,
    ).toBe(2);
    expect(countDrawnValues(model)).toBe(1);
    expect(countStacks(model)).toBe(1);
    const groups = model.bases.get('base-a')!.groups;
    expect(foldHeaderValues([...groups, ...groups], RELEASED_GROUP_KEY)).toEqual(['Today']);
  });
});

test.describe('Upstream revision', () => {
  test('a Deployment with no upstream has no value', () => {
    expect(revisionCell(node({ name: 'lone' }, null))).toBeNull();
  });

  test('a Deployment with several Units takes the most any Unit is behind', () => {
    const space = (id: string): ExtendedSpaceRead => ({
      Space: { SpaceID: id, Slug: id } as ExtendedSpaceRead['Space'],
    });
    const unit = (fields: Partial<UnitRead> & { UnitID: string; SpaceID: string }) =>
      ({ Unit: { Slug: fields.UnitID, ...fields } as UnitRead }) as ExtendedUnitRead;
    const units = [
      unit({ UnitID: 'app', SpaceID: 'base', HeadRevisionNum: 5 }),
      unit({ UnitID: 'cfg', SpaceID: 'base', HeadRevisionNum: 7 }),
      // 1 behind on app and 3 behind on cfg: the Deployment is 3 behind.
      unit({
        UnitID: 'mixed-app',
        SpaceID: 'mixed',
        TargetID: 't1',
        UpstreamUnitID: 'app',
        UpstreamRevisionNum: 4,
      }),
      unit({
        UnitID: 'mixed-cfg',
        SpaceID: 'mixed',
        TargetID: 't1',
        UpstreamUnitID: 'cfg',
        UpstreamRevisionNum: 4,
      }),
      unit({
        UnitID: 'fresh-app',
        SpaceID: 'fresh',
        TargetID: 't2',
        UpstreamUnitID: 'app',
        UpstreamRevisionNum: 5,
      }),
      unit({
        UnitID: 'fresh-cfg',
        SpaceID: 'fresh',
        TargetID: 't2',
        UpstreamUnitID: 'cfg',
        UpstreamRevisionNum: 7,
      }),
    ];
    const { deployments } = buildComponentData(
      [space('base'), space('mixed'), space('fresh')],
      units,
      new Map(units.map((u) => [u.Unit!.UnitID!, u])),
      new Map(),
    );
    const byId = new Map(deployments.map((d) => [d.deploymentId, d]));
    expect(revisionCell(byId.get('mixed')!)).toEqual({
      value: '3',
      label: '3 revisions behind',
      rank: 3,
    });
    expect(revisionCell(byId.get('fresh')!)).toEqual({ value: '0', label: 'Up to date', rank: 0 });
    // The Base is the root: nothing upstream of it.
    expect(revisionCell(byId.get('base')!)).toBeNull();
  });

  test('stacks run up to date first, then fewest behind, not A-Z', () => {
    const deployments = component([
      { name: 'a', behind: 10 },
      { name: 'b', behind: 10 },
      { name: 'c', behind: 2 },
      { name: 'd', behind: 2 },
      { name: 'e' },
      { name: 'f' },
      { name: 'g', behind: 1 },
      { name: 'h', behind: 1 },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), REVISION_GROUP_KEY);
    expect(groups.map((g) => [g.label, g.memberIds])).toEqual([
      ['Up to date', ['e', 'f']],
      ['1 revision behind', ['g', 'h']],
      ['2 revisions behind', ['c', 'd']],
      ['10 revisions behind', ['a', 'b']],
    ]);
  });

  test('a Stale wave stays, and its Base still splits into its gaps', () => {
    const one = buildFoldModel({
      deployments: component(Array.from({ length: 6 }, (_, i) => ({ name: `d${i}`, behind: 2 }))),
      groupKey: REVISION_GROUP_KEY,
    }).bases.get('base-a')!;
    expect(one.waves.map((w) => [w.condition, w.count])).toEqual([['stale', 6]]);
    expect(one.cards).toEqual([]);
    expect(one.groups.map((g) => [g.kind, g.label, g.memberIds.length])).toEqual([
      ['stack', '2 revisions behind', 6],
    ]);

    const split = buildFoldModel({
      deployments: component([
        ...Array.from({ length: 4 }, (_, i) => ({ name: `s${i}`, behind: 1 })),
        ...Array.from({ length: 2 }, (_, i) => ({ name: `o${i}`, behind: 3 })),
        { name: 'u0' },
        { name: 'u1' },
      ]),
      groupKey: REVISION_GROUP_KEY,
    }).bases.get('base-a')!;
    expect(split.waves.map((w) => w.condition)).toEqual(['stale']);
    expect(split.groups.map((g) => [g.label, g.memberIds.length])).toEqual([
      ['Up to date', 2],
      ['1 revision behind', 4],
      ['3 revisions behind', 2],
    ]);
  });
});
