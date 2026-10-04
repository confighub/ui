// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Group by "Upstream revision" (?graphGroup=@revision): the quiet Deployments of a
// Base stack by how many revisions they are behind their upstream Base, the
// number the Stale chip shows. It is derived from the nodes the graph already
// has, not read from a Space label, so its key starts with "@" and cannot be
// the same as a label key.
import { expect, test } from '@playwright/test';

import { buildComponentData } from '../src/pages/x/apps/componentData';
import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import { revisionCell } from '../src/pages/x/apps/flow-graph/fold/derivedGroupKeys';
import { REVISION_GROUP_KEY } from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  foldHeaderCountText,
  foldHeaderTitle,
  foldHeaderValues,
} from '../src/pages/x/apps/flow-graph/fold/foldHeader';
import { buildFoldModel, foldMembers } from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  defaultGroupKey,
  groupByButtonLabel,
  groupByOptions,
  groupKeyPlural,
  groupQuiet,
  resolveGroupKey,
} from '../src/pages/x/apps/flow-graph/fold/groupBy';
import type {
  ExtendedSpaceRead,
  ExtendedUnitRead,
  UnitRead,
} from '@confighub/rtk-query';
import { meridianComponent } from './fixtures/meridianFoldFixture';

const QUIET = { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 };

interface Member {
  name: string;
  /** Revisions behind the upstream head; absent is up to date. */
  behind?: number;
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
    ...(behind > 0 && { staleRevisionsBehind: behind }),
    labels: m.labels ?? {},
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

test.describe('the value of a Deployment', () => {
  test('up to date, 1 revision behind, N revisions behind', () => {
    const [, , upToDate, one, three] = component([
      { name: 'a' },
      { name: 'b', behind: 1 },
      { name: 'c', behind: 3 },
    ]);
    expect(revisionCell(upToDate)).toEqual({ value: '0', label: 'Up to date', rank: 0 });
    expect(revisionCell(one)).toEqual({ value: '1', label: '1 revision behind', rank: 1 });
    expect(revisionCell(three)).toEqual({ value: '3', label: '3 revisions behind', rank: 3 });
  });

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
    expect(revisionCell(byId.get('mixed')!)?.label).toBe('3 revisions behind');
    expect(revisionCell(byId.get('fresh')!)?.label).toBe('Up to date');
    // The Base is the root: nothing upstream of it.
    expect(revisionCell(byId.get('base')!)).toBeNull();
  });
});

test.describe('the order of the stacks', () => {
  test('up to date first, then fewest behind first, not A-Z', () => {
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
    expect(groups.map((g) => g.label)).toEqual([
      'Up to date',
      '1 revision behind',
      '2 revisions behind',
      '10 revisions behind',
    ]);
    expect(groups.map((g) => g.memberIds)).toEqual([
      ['e', 'f'],
      ['g', 'h'],
      ['c', 'd'],
      ['a', 'b'],
    ]);
  });

  test('"No upstream" is last', () => {
    const quiet = [
      node({ name: 'x' }, null),
      node({ name: 'y' }, null),
      node({ name: 'a', behind: 4 }, 'base-a'),
      node({ name: 'b', behind: 4 }, 'base-a'),
      node({ name: 'c' }, 'base-a'),
      node({ name: 'd' }, 'base-a'),
    ];
    const groups = groupQuiet('base-a', quiet, REVISION_GROUP_KEY);
    expect(groups.map((g) => [g.label, g.value])).toEqual([
      ['Up to date', '0'],
      ['4 revisions behind', '4'],
      ['No upstream', null],
    ]);
    expect(groups[2].id).toBe('stack:base-a:__none');
  });

  test('four gaps of one Deployment each merge into one stack, in order', () => {
    const deployments = component([
      { name: 'a', behind: 9 },
      { name: 'b', behind: 3 },
      { name: 'c', behind: 1 },
      { name: 'd', behind: 2 },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), REVISION_GROUP_KEY);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('other');
    expect(groups[0].label).toBe('4 upstream revisions, 1 each');
    expect(groups[0].mergedLabels).toEqual([
      '1 revision behind',
      '2 revisions behind',
      '3 revisions behind',
      '9 revisions behind',
    ]);
  });
});

test.describe('when Upstream revision is offered', () => {
  test('listed when it puts two Deployments of one Base together', () => {
    const deployments = component([{ name: 'a' }, { name: 'b' }, { name: 'c', behind: 1 }]);
    const options = groupByOptions(foldMembers(deployments));
    expect(options).toEqual([
      { key: REVISION_GROUP_KEY, label: 'Upstream revision', valueCount: 2, isDefault: false },
    ]);
  });

  test('not listed when every Deployment is up to date', () => {
    expect(optionKeys(component([{ name: 'a' }, { name: 'b' }, { name: 'c' }]))).toEqual([]);
  });

  test('not listed when every value is on one Deployment of its Base', () => {
    const deployments = component([
      { name: 'a' },
      { name: 'b', behind: 1 },
      { name: 'c', base: 'base-b' },
      { name: 'd', behind: 2, base: 'base-b' },
    ]);
    expect(optionKeys(deployments)).toEqual([]);
  });

  test('not listed when it only repeats the Base split', () => {
    const deployments = component([
      { name: 'a' },
      { name: 'b' },
      { name: 'c', behind: 1, base: 'base-b' },
      { name: 'd', behind: 1, base: 'base-b' },
    ]);
    expect(optionKeys(deployments)).toEqual([]);
  });

  test('cert-manager: not listed when the nodes carry no revisions behind', () => {
    // The fixture has Stale unit counts but no revisions-behind numbers.
    expect(optionKeys(meridianComponent('cert-manager'))).not.toContain(REVISION_GROUP_KEY);
  });
});

test.describe('the key', () => {
  const deployments = component([
    { name: 'a', labels: { Department: 'retail', revision: 'r1' } },
    { name: 'b', labels: { Department: 'retail', revision: 'r1' } },
    { name: 'c', behind: 1, labels: { Department: 'payments', revision: 'r2' } },
  ]);
  const members = foldMembers(deployments);
  const options = groupByOptions(members);

  test('it is never the default, and comes after the Space label keys', () => {
    expect(options.map((o) => [o.key, o.isDefault])).toEqual([
      ['Department', true],
      ['revision', false],
      [REVISION_GROUP_KEY, false],
    ]);
    expect(defaultGroupKey(members)).toBe('Department');
  });

  test('it is not the default even when it is the only option', () => {
    const only = foldMembers(
      component([{ name: 'a' }, { name: 'b' }, { name: 'c', behind: 2 }]),
    );
    expect(groupByOptions(only).map((o) => o.key)).toEqual([REVISION_GROUP_KEY]);
    expect(defaultGroupKey(only)).toBeNull();
  });

  test('?graphGroup=@revision resolves to it; a label named "revision" stays a label', () => {
    expect(resolveGroupKey('@revision', options, 'Department')).toBe(REVISION_GROUP_KEY);
    expect(resolveGroupKey('revision', options, 'Department')).toBe('revision');
    const quietByLabel = groupQuiet('base-a', members, 'revision');
    expect(quietByLabel.map((g) => g.label)).toEqual(['r1', 'r2']);
  });

  test('?graphGroup=@revision falls back to the default when it is not an option', () => {
    const upToDate = foldMembers(
      component([
        { name: 'a', labels: { Department: 'retail' } },
        { name: 'b', labels: { Department: 'retail' } },
        { name: 'c', labels: { Department: 'payments' } },
      ]),
    );
    const noRevision = groupByOptions(upToDate);
    expect(resolveGroupKey('@revision', noRevision, 'Department')).toBe('Department');
  });

  test('the button, the fold header and merged stacks name it in words', () => {
    expect(groupByButtonLabel(true, REVISION_GROUP_KEY)).toBe('Upstream revision');
    expect(groupKeyPlural(REVISION_GROUP_KEY)).toBe('upstream revisions');
    const values = ['Up to date', '1 revision behind'];
    expect(foldHeaderTitle(REVISION_GROUP_KEY, values)).toBe(
      'Upstream revision: Up to date, 1 revision behind',
    );
    expect(foldHeaderCountText(REVISION_GROUP_KEY, 1)).toBe('1 upstream revision');
    expect(foldHeaderCountText(REVISION_GROUP_KEY, 5)).toBe('5 upstream revisions');
  });
});

test.describe('with a Stale wave', () => {
  test('all members in one bucket make one stack, and the wave stays', () => {
    const deployments = component(
      Array.from({ length: 6 }, (_, i) => ({ name: `d${i}`, behind: 2 })),
    );
    const model = buildFoldModel({ deployments, groupKey: REVISION_GROUP_KEY });
    const fold = model.bases.get('base-a')!;
    expect(fold.waves.map((w) => [w.condition, w.count])).toEqual([['stale', 6]]);
    expect(fold.cards).toEqual([]);
    expect(fold.groups.map((g) => [g.kind, g.label, g.memberIds.length])).toEqual([
      ['stack', '2 revisions behind', 6],
    ]);
    expect(foldHeaderValues(fold.groups, REVISION_GROUP_KEY)).toEqual(['2 revisions behind']);
  });

  test('a wave Base splits into its gaps, up to date first', () => {
    const deployments = component([
      ...Array.from({ length: 4 }, (_, i) => ({ name: `s${i}`, behind: 1 })),
      ...Array.from({ length: 2 }, (_, i) => ({ name: `o${i}`, behind: 3 })),
      { name: 'u0' },
      { name: 'u1' },
    ]);
    const model = buildFoldModel({ deployments, groupKey: REVISION_GROUP_KEY });
    const fold = model.bases.get('base-a')!;
    expect(fold.waves.map((w) => w.condition)).toEqual(['stale']);
    expect(fold.groups.map((g) => [g.label, g.memberIds.length])).toEqual([
      ['Up to date', 2],
      ['1 revision behind', 4],
      ['3 revisions behind', 2],
    ]);
  });
});
