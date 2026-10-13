// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Group by "Kubernetes version" (?graphGroup=@k8s): the quiet Deployments of a Base
// stack by the Kubernetes minor version of their Target, from the Target fact
// Cluster.KubernetesVersion in the Target list the page already loads. It is
// derived, not read from a Space label, so its key starts with "@" and cannot
// be the same as a label key.
import { expect, test } from '@playwright/test';

import { buildComponentData, deploymentTargetId } from '../src/pages/x/apps/componentData';
import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import {
  kubernetesVersionCell,
  kubernetesVersionFact,
} from '../src/pages/x/apps/flow-graph/fold/derivedGroupKeys';
import { K8S_GROUP_KEY } from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import { foldMembers } from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  defaultGroupKey,
  groupByOptions,
  groupQuiet,
  resolveGroupKey,
} from '../src/pages/x/apps/flow-graph/fold/groupBy';
import type {
  ExtendedSpaceRead,
  ExtendedUnitRead,
  UnitRead,
} from '@confighub/rtk-query';

const QUIET = { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 };

interface Member {
  name: string;
  /** The Cluster.KubernetesVersion fact of its Target; absent is no fact. */
  k8s?: string;
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
    liveStatus: { Sync: 'Synced', Health: 'Healthy' },
    liveStatusProvider: 'argocd',
    labels: m.labels ?? {},
    ...(m.k8s !== undefined && { targetFacts: { 'Cluster.KubernetesVersion': m.k8s } }),
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

const withFacts = (facts: Record<string, string>): ComponentDeployment => ({
  ...node({ name: 'x' }, 'base-a'),
  targetFacts: facts,
});

test.describe('the value of a Deployment', () => {
  test('the minor version of Cluster.KubernetesVersion', () => {
    expect(kubernetesVersionCell(node({ name: 'a', k8s: '1.31.2' }, 'base-a'))).toEqual({
      value: '1.31',
      label: '1.31',
      rank: 1031,
    });
    expect(kubernetesVersionCell(node({ name: 'b', k8s: 'v1.30.14' }, 'base-a'))?.value).toBe(
      '1.30',
    );
    expect(kubernetesVersionCell(node({ name: 'c', k8s: '1.32' }, 'base-a'))?.value).toBe(
      '1.32',
    );
  });

  test('patch levels of one minor version share one value', () => {
    const values = ['1.31.2', '1.31.4', 'v1.31.0-eks-1234'].map(
      (k8s) => kubernetesVersionCell(node({ name: 'a', k8s }, 'base-a'))?.value,
    );
    expect(values).toEqual(['1.31', '1.31', '1.31']);
  });

  test('another fact whose key ends in KubernetesVersion is the fallback', () => {
    expect(kubernetesVersionFact({ 'Custom.KubernetesVersion': '1.29.1' })).toBe('1.29.1');
    expect(
      kubernetesVersionFact({
        'Custom.KubernetesVersion': '1.29.1',
        'Cluster.KubernetesVersion': '1.31.2',
      }),
    ).toBe('1.31.2');
    expect(
      kubernetesVersionFact({
        'Cluster.KubernetesVersion': '',
        'Other.KubernetesVersion': '1.28',
      }),
    ).toBe('1.28');
  });

  test('no Facts, no version fact, or an empty one is no value', () => {
    expect(kubernetesVersionCell(node({ name: 'a' }, 'base-a'))).toBeNull();
    expect(kubernetesVersionCell(withFacts({ 'Cluster.Provider': 'eks' }))).toBeNull();
    expect(kubernetesVersionCell(withFacts({ 'Cluster.KubernetesVersion': '  ' }))).toBeNull();
  });

  test('a value that is not a version keeps its text', () => {
    expect(
      kubernetesVersionCell(withFacts({ 'Cluster.KubernetesVersion': 'unknown' })),
    ).toEqual({
      value: 'unknown',
      label: 'unknown',
      rank: Number.MAX_SAFE_INTEGER,
    });
  });
});

test.describe("the Deployment's Target", () => {
  const space = (id: string, releaseTargetId?: string): ExtendedSpaceRead => ({
    Space: {
      SpaceID: id,
      Slug: id,
      ...(releaseTargetId && { ReleaseTargetID: releaseTargetId }),
    } as ExtendedSpaceRead['Space'],
  });
  const unit = (fields: Partial<UnitRead> & { UnitID: string; SpaceID: string }) =>
    ({ Unit: { Slug: fields.UnitID, ...fields } as UnitRead }) as ExtendedUnitRead;
  const units = [
    unit({ UnitID: 'app', SpaceID: 'base' }),
    unit({ UnitID: 'r-app', SpaceID: 'released', TargetID: 't-a', UpstreamUnitID: 'app' }),
    unit({ UnitID: 'r-cfg', SpaceID: 'released', TargetID: 't-b', UpstreamUnitID: 'app' }),
    unit({ UnitID: 'p-app', SpaceID: 'plain', TargetID: 't-b', UpstreamUnitID: 'app' }),
    unit({ UnitID: 'p-cfg', SpaceID: 'plain', TargetID: 't-a', UpstreamUnitID: 'app' }),
    unit({ UnitID: 'n-app', SpaceID: 'nofacts', TargetID: 't-c', UpstreamUnitID: 'app' }),
  ];
  const names = new Map([
    ['t-a', 'alpha'],
    ['t-b', 'beta'],
    ['t-c', 'gamma'],
  ]);
  const facts = new Map([
    ['t-a', { 'Cluster.KubernetesVersion': '1.30.5' }],
    ['t-b', { 'Cluster.KubernetesVersion': '1.32.1' }],
  ]);
  const { deployments } = buildComponentData(
    [space('base'), space('released', 't-b'), space('plain'), space('nofacts')],
    units,
    new Map(units.map((u) => [u.Unit!.UnitID!, u])),
    names,
    undefined,
    undefined,
    facts,
  );
  const byId = new Map(deployments.map((d) => [d.deploymentId, d]));

  test('the release Target, when the Space has one', () => {
    expect(kubernetesVersionCell(byId.get('released')!)?.value).toBe('1.32');
  });

  test('else the first Target by name', () => {
    expect(kubernetesVersionCell(byId.get('plain')!)?.value).toBe('1.30');
    expect(deploymentTargetId(undefined, byId.get('plain')!.targets)).toBe('t-a');
  });

  test('a Target with no Facts, and a Base, have no value', () => {
    expect(byId.get('nofacts')!.targetFacts).toBeUndefined();
    expect(kubernetesVersionCell(byId.get('nofacts')!)).toBeNull();
    expect(kubernetesVersionCell(byId.get('base')!)).toBeNull();
  });
});

test.describe('the order of the stacks', () => {
  test('oldest version first, as versions, not A-Z', () => {
    const deployments = component([
      { name: 'a', k8s: '1.32.0' },
      { name: 'b', k8s: '1.32.3' },
      { name: 'c', k8s: '1.9.1' },
      { name: 'd', k8s: '1.9.8' },
      { name: 'e', k8s: '1.30.2' },
      { name: 'f', k8s: '1.30.2' },
      { name: 'g', k8s: '1.31.1' },
      { name: 'h', k8s: 'v1.31.7' },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), K8S_GROUP_KEY);
    expect(groups.map((g) => g.label)).toEqual(['1.9', '1.30', '1.31', '1.32']);
    expect(groups.map((g) => g.memberIds)).toEqual([
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
      ['a', 'b'],
    ]);
  });

  test('"No version" is last, after a value that is not a version', () => {
    const deployments = component([
      { name: 'a' },
      { name: 'b' },
      { name: 'c', k8s: 'unknown' },
      { name: 'd', k8s: 'unknown' },
      { name: 'e', k8s: '1.31.2' },
      { name: 'f', k8s: '1.31.2' },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), K8S_GROUP_KEY);
    expect(groups.map((g) => [g.label, g.value])).toEqual([
      ['1.31', '1.31'],
      ['unknown', 'unknown'],
      ['No version', null],
    ]);
    expect(groups[2].id).toBe('stack:base-a:__none');
    expect(groups[2].memberIds).toEqual(['a', 'b']);
  });

  test('four versions of one Deployment each merge into one stack, in order', () => {
    const deployments = component([
      { name: 'a', k8s: '1.32.0' },
      { name: 'b', k8s: '1.10.0' },
      { name: 'c', k8s: '1.9.0' },
      { name: 'd', k8s: '1.30.0' },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), K8S_GROUP_KEY);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('other');
    expect(groups[0].label).toBe('4 Kubernetes versions, 1 each');
    expect(groups[0].mergedLabels).toEqual(['1.9', '1.10', '1.30', '1.32']);
  });
});

test.describe('the key', () => {
  const deployments = component([
    { name: 'a', k8s: '1.31.2', labels: { Department: 'retail', k8s: 'x' } },
    { name: 'b', k8s: '1.31.2', labels: { Department: 'retail', k8s: 'x' } },
    { name: 'c', k8s: '1.32.0', labels: { Department: 'payments', k8s: 'y' } },
  ]);
  const members = foldMembers(deployments);
  const options = groupByOptions(members);

  test('it is never the default, and comes after the Space label keys', () => {
    expect(options.map((o) => [o.key, o.isDefault])).toEqual([
      ['Department', true],
      ['k8s', false],
      [K8S_GROUP_KEY, false],
    ]);
    expect(defaultGroupKey(members)).toBe('Department');
  });

  test('it is not the default even when it is the only option', () => {
    const only = foldMembers(
      component([
        { name: 'a', k8s: '1.30.1' },
        { name: 'b', k8s: '1.30.1' },
        { name: 'c', k8s: '1.31.1' },
      ]),
    );
    expect(groupByOptions(only).map((o) => o.key)).toEqual([K8S_GROUP_KEY]);
    expect(defaultGroupKey(only)).toBeNull();
  });

  test('?graphGroup=@k8s resolves to it; a label named "k8s" stays a label', () => {
    expect(resolveGroupKey('@k8s', options, 'Department')).toBe(K8S_GROUP_KEY);
    expect(resolveGroupKey('k8s', options, 'Department')).toBe('k8s');
    expect(groupQuiet('base-a', members, 'k8s').map((g) => g.label)).toEqual(['x', 'y']);
  });

  test('?graphGroup=@k8s falls back to the default when it is not an option', () => {
    const noFacts = groupByOptions(
      foldMembers(
        component([
          { name: 'a', labels: { Department: 'retail' } },
          { name: 'b', labels: { Department: 'retail' } },
          { name: 'c', labels: { Department: 'payments' } },
        ]),
      ),
    );
    expect(resolveGroupKey('@k8s', noFacts, 'Department')).toBe('Department');
  });

});
