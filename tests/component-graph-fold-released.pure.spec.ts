// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Group by "Last released" (?graphGroup=@released): the quiet Deployments of a Base
// stack by how long ago their latest published Release was made ("Today",
// "This week", "This month", "Older"), from the Releases the page already
// loads, with "Never released" last. It is derived, not read from a Space
// label, so its key starts with "@" and cannot be the same as a label key.
import { expect, test } from '@playwright/test';

import type { ComponentDeployment, ReleaseAge } from '../src/pages/x/apps/componentTypes';
import {
  releaseAge,
  releasedCell,
  withReleaseAges,
} from '../src/pages/x/apps/flow-graph/fold/derivedGroupKeys';
import { RELEASED_GROUP_KEY } from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  foldHeaderCountText,
  foldHeaderTitle,
  foldHeaderValues,
} from '../src/pages/x/apps/flow-graph/fold/foldHeader';
import {
  buildFoldModel,
  countDrawnValues,
  countStacks,
  foldMembers,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  defaultGroupKey,
  drawnCountsText,
  groupByButtonLabel,
  groupByOptions,
  groupKeyPlural,
  groupQuiet,
  resolveGroupKey,
} from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { meridianComponent } from './fixtures/meridianFoldFixture';

const QUIET = { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 };

// Local times, so "Today" (from local midnight) holds in any time zone.
const NOW = new Date(2026, 8, 25, 15, 30).getTime();
const at = (month: number, day: number, hour = 12, minute = 0): string =>
  new Date(2026, month, day, hour, minute).toISOString();

interface Member {
  name: string;
  /** The bucket of its latest Release; absent is never released. */
  age?: ReleaseAge;
  labels?: Record<string, string>;
  /** The Base it sits under; default "base-a". */
  base?: string;
}

function node(m: Member, parent: string | null): ComponentDeployment {
  return {
    deploymentId: m.name,
    slug: m.name,
    displayName: m.name,
    type: 'Deployment',
    targets: [{ targetId: `target-${m.name}`, name: m.name, label: m.name }],
    parentDeploymentId: parent,
    stage: 2,
    upgradeableCount: 0,
    unappliedCount: 0,
    unitCount: 1,
    liveStatus: { syncStatus: 'Synced', healthStatus: 'Healthy' },
    liveStatusProvider: 'argocd',
    labels: m.labels ?? {},
    ...(m.age !== undefined && { releaseAge: m.age }),
    configSignals: QUIET,
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

test.describe('the value of a Deployment', () => {
  test('"today" is from local midnight, not the last 24 hours', () => {
    expect(releaseAge(at(8, 25, 0, 0), NOW)).toBe('today');
    expect(releaseAge(at(8, 25, 15, 29), NOW)).toBe('today');
    expect(releaseAge(at(8, 24, 23, 59), NOW)).toBe('week');
  });

  test('a Release a little in the future, from clock skew, is today', () => {
    expect(releaseAge(at(8, 25, 15, 45), NOW)).toBe('today');
  });

  test('"week" is the last 7 days, "month" the last 30, then "older"', () => {
    expect(releaseAge(at(8, 19, 12), NOW)).toBe('week');
    expect(releaseAge(new Date(NOW - 7 * 86_400_000 + 60_000).toISOString(), NOW)).toBe(
      'week',
    );
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
  });

  test('the cell of each bucket, and none for a Deployment never released', () => {
    const cell = (age?: ReleaseAge) => releasedCell(node({ name: 'x', age }, 'base-a'));
    expect(cell('today')).toEqual({ value: 'today', label: 'Today', rank: 0 });
    expect(cell('week')).toEqual({ value: 'week', label: 'This week', rank: 1 });
    expect(cell('month')).toEqual({ value: 'month', label: 'This month', rank: 2 });
    expect(cell('older')).toEqual({ value: 'older', label: 'Older', rank: 3 });
    expect(cell()).toBeNull();
  });
});

test.describe('the clock and the Releases the page loads', () => {
  const deployments = component([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
  const releases = new Map([
    ['a', { createdAt: at(8, 25, 9) }],
    ['b', { createdAt: at(7, 1) }],
  ]);

  test('each Deployment gets the bucket of its latest Release against the one clock', () => {
    const ages = withReleaseAges(deployments, releases, NOW);
    expect(Object.fromEntries(ages.map((d) => [d.deploymentId, d.releaseAge]))).toEqual({
      root: undefined,
      'base-a': undefined,
      a: 'today',
      b: 'older',
      c: undefined,
    });
  });

  test('the same clock gives the same buckets, as on every poll in one minute', () => {
    const first = withReleaseAges(deployments, releases, NOW);
    const again = withReleaseAges(deployments, releases, NOW);
    expect(again.map((d) => d.releaseAge)).toEqual(first.map((d) => d.releaseAge));
  });

  test('a later clock moves a Release to its next bucket', () => {
    const tomorrow = new Date(2026, 8, 26, 9, 0).getTime();
    const ages = withReleaseAges(deployments, releases, tomorrow);
    expect(ages.find((d) => d.deploymentId === 'a')?.releaseAge).toBe('week');
  });

  test('a Deployment with no Release keeps its object; no Releases keep the array', () => {
    const ages = withReleaseAges(deployments, releases, NOW);
    expect(ages.find((d) => d.deploymentId === 'c')).toBe(deployments[4]);
    expect(withReleaseAges(deployments, new Map(), NOW)).toBe(deployments);
    expect(withReleaseAges(deployments, undefined, NOW)).toBe(deployments);
  });

  test('the fold stacks by the buckets the clock gave', () => {
    const more = component([
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
      { name: 'd' },
      { name: 'e' },
    ]);
    const loaded = new Map([
      ['a', { createdAt: at(8, 25, 9) }],
      ['b', { createdAt: at(8, 25, 11) }],
      ['c', { createdAt: at(8, 1) }],
      ['d', { createdAt: at(8, 2) }],
    ]);
    const model = buildFoldModel({
      deployments: withReleaseAges(more, loaded, NOW),
      groupKey: RELEASED_GROUP_KEY,
    });
    const groups = model.bases.get('base-a')!.groups;
    expect(groups.map((g) => [g.label, g.kind, g.memberIds])).toEqual([
      ['Today', 'stack', ['a', 'b']],
      ['This month', 'stack', ['c', 'd']],
      ['Never released', 'loose', ['e']],
    ]);
  });
});

test.describe('the order of the stacks', () => {
  test('newest first, not A-Z, and "Never released" last', () => {
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
    expect(groups.map((g) => [g.label, g.value])).toEqual([
      ['Today', 'today'],
      ['This week', 'week'],
      ['This month', 'month'],
      ['Older', 'older'],
      ['Never released', null],
    ]);
    expect(groups.map((g) => g.memberIds)).toEqual([
      ['i', 'j'],
      ['g', 'h'],
      ['e', 'f'],
      ['c', 'd'],
      ['a', 'b'],
    ]);
    expect(groups[4].id).toBe('stack:base-a:__none');
  });

  test('four buckets of one Deployment each merge into one stack, in order', () => {
    const deployments = component([
      { name: 'a', age: 'older' },
      { name: 'b', age: 'today' },
      { name: 'c' },
      { name: 'd', age: 'month' },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), RELEASED_GROUP_KEY);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('other');
    expect(groups[0].label).toBe('4 release times, 1 each');
    expect(groups[0].mergedLabels).toEqual(['Today', 'This month', 'Older', 'Never released']);
  });
});

test.describe('when Last released is offered', () => {
  test('listed when it puts two Deployments of one Base together', () => {
    const deployments = component([
      { name: 'a', age: 'today' },
      { name: 'b', age: 'today' },
      { name: 'c', age: 'older' },
    ]);
    expect(groupByOptions(foldMembers(deployments))).toEqual([
      { key: RELEASED_GROUP_KEY, label: 'Last released', valueCount: 2, isDefault: false },
    ]);
  });

  test('listed when some Deployments were never released and two share a bucket', () => {
    const deployments = component([{ name: 'a', age: 'week' }, { name: 'b' }, { name: 'c' }]);
    expect(optionKeys(deployments)).toEqual([RELEASED_GROUP_KEY]);
  });

  test('not listed when no Deployment was ever released', () => {
    expect(optionKeys(component([{ name: 'a' }, { name: 'b' }, { name: 'c' }]))).toEqual([]);
  });

  test('not listed when every Deployment is in one bucket', () => {
    const deployments = component([
      { name: 'a', age: 'month' },
      { name: 'b', age: 'month' },
      { name: 'c', age: 'month', base: 'base-b' },
    ]);
    expect(optionKeys(deployments)).toEqual([]);
  });

  test('not listed when every bucket is on one Deployment of its Base', () => {
    const deployments = component([
      { name: 'a', age: 'today' },
      { name: 'b', age: 'older' },
      { name: 'c', age: 'today', base: 'base-b' },
      { name: 'd', age: 'week', base: 'base-b' },
    ]);
    expect(optionKeys(deployments)).toEqual([]);
  });

  test('not listed when it only repeats the Base split', () => {
    const deployments = component([
      { name: 'a', age: 'today' },
      { name: 'b', age: 'today' },
      { name: 'c', age: 'older', base: 'base-b' },
      { name: 'd', age: 'older', base: 'base-b' },
    ]);
    expect(optionKeys(deployments)).toEqual([]);
  });

  test('cert-manager: not listed when no Release was loaded', () => {
    expect(optionKeys(meridianComponent('cert-manager'))).not.toContain(RELEASED_GROUP_KEY);
  });
});

test.describe('the key', () => {
  const deployments = component([
    { name: 'a', age: 'today', labels: { Department: 'retail', released: 'x' } },
    { name: 'b', age: 'today', labels: { Department: 'retail', released: 'x' } },
    { name: 'c', age: 'older', labels: { Department: 'payments', released: 'y' } },
  ]);
  const members = foldMembers(deployments);
  const options = groupByOptions(members);

  test('it is never the default, and comes after the Space label keys', () => {
    expect(options.map((o) => [o.key, o.isDefault])).toEqual([
      ['Department', true],
      ['released', false],
      [RELEASED_GROUP_KEY, false],
    ]);
    expect(defaultGroupKey(members)).toBe('Department');
  });

  test('it is not the default even when it is the only option', () => {
    const only = foldMembers(
      component([
        { name: 'a', age: 'week' },
        { name: 'b', age: 'week' },
        { name: 'c', age: 'older' },
      ]),
    );
    expect(groupByOptions(only).map((o) => o.key)).toEqual([RELEASED_GROUP_KEY]);
    expect(defaultGroupKey(only)).toBeNull();
  });

  test('?graphGroup=@released resolves to it; a label named "released" stays a label', () => {
    expect(resolveGroupKey('@released', options, 'Department')).toBe(RELEASED_GROUP_KEY);
    expect(resolveGroupKey('released', options, 'Department')).toBe('released');
    expect(groupQuiet('base-a', members, 'released').map((g) => g.label)).toEqual(['x', 'y']);
  });

  test('?graphGroup=@released falls back to the default when it is not an option', () => {
    const neverReleased = groupByOptions(
      foldMembers(
        component([
          { name: 'a', labels: { Department: 'retail' } },
          { name: 'b', labels: { Department: 'retail' } },
          { name: 'c', labels: { Department: 'payments' } },
        ]),
      ),
    );
    expect(resolveGroupKey('@released', neverReleased, 'Department')).toBe('Department');
  });

  test('the button, the fold header and merged stacks name it in words', () => {
    expect(groupByButtonLabel(true, RELEASED_GROUP_KEY)).toBe('Last released');
    expect(groupKeyPlural(RELEASED_GROUP_KEY)).toBe('release times');
    expect(foldHeaderTitle(RELEASED_GROUP_KEY, ['Today', 'Older'])).toBe(
      'Last released: Today, Older',
    );
    expect(foldHeaderCountText(RELEASED_GROUP_KEY, 1)).toBe('1 release time');
    expect(foldHeaderCountText(RELEASED_GROUP_KEY, 3)).toBe('3 release times');
  });
});

test.describe('what the menu and the header say matches what is drawn', () => {
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

  test('the menu counts the values the stacks show, not the values all Deployments hold', () => {
    expect(
      groupByOptions(foldMembers(deployments)).find((o) => o.key === RELEASED_GROUP_KEY)
        ?.valueCount,
    ).toBe(2);
    expect(countDrawnValues(model)).toBe(1);
    expect(countStacks(model)).toBe(1);
    expect(drawnCountsText(countDrawnValues(model), countStacks(model))).toBe(
      '1 value, 1 stack',
    );
  });

  test('the header names a value once', () => {
    const groups = model.bases.get('base-a')!.groups;
    expect(foldHeaderValues([...groups, ...groups], RELEASED_GROUP_KEY)).toEqual(['Today']);
  });

  test('the count words agree in number', () => {
    expect(drawnCountsText(4, 15)).toBe('4 values, 15 stacks');
    expect(drawnCountsText(2, 0)).toBe('2 values, 0 stacks');
  });
});
