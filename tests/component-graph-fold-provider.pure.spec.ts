// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Group by "Cloud provider" (?graphGroup=@provider): the quiet Deployments of a
// Base stack by the cloud provider of their Target, from the Target fact
// Cloud.Provider in the Target list the page already loads. It is derived,
// not read from a Space label, so its key starts with "@" and cannot be the
// same as a label key.
import { expect, test } from '@playwright/test';

import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import {
  cloudProviderCell,
  cloudProviderFact,
} from '../src/pages/x/apps/flow-graph/fold/derivedGroupKeys';
import { PROVIDER_GROUP_KEY } from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  foldHeaderCountText,
  foldHeaderTitle,
} from '../src/pages/x/apps/flow-graph/fold/foldHeader';
import { foldMembers } from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  defaultGroupKey,
  groupByButtonLabel,
  groupByOptions,
  groupKeyPlural,
  groupQuiet,
  resolveGroupKey,
} from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { meridianComponent } from './fixtures/meridianFoldFixture';

const QUIET = { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 };

interface Member {
  name: string;
  /** The Cloud.Provider fact of its Target; absent is no fact. */
  provider?: string;
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
    ...(m.provider !== undefined && { targetFacts: { 'Cloud.Provider': m.provider } }),
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

const withFacts = (facts: Record<string, string>): ComponentDeployment => ({
  ...node({ name: 'x' }, 'base-a'),
  targetFacts: facts,
});

test.describe('the value of a Deployment', () => {
  test('the known providers get their product name', () => {
    expect(cloudProviderCell(node({ name: 'a', provider: 'aws' }, 'base-a'))).toEqual({
      value: 'aws',
      label: 'AWS',
      rank: 0,
    });
    expect(cloudProviderCell(node({ name: 'b', provider: 'gcp' }, 'base-a'))).toEqual({
      value: 'gcp',
      label: 'Google Cloud',
      rank: 0,
    });
    expect(cloudProviderCell(node({ name: 'c', provider: 'azure' }, 'base-a'))).toEqual({
      value: 'azure',
      label: 'Azure',
      rank: 0,
    });
  });

  test('matches a known provider without regard to case, and shares its value', () => {
    expect(cloudProviderCell(node({ name: 'a', provider: 'AWS' }, 'base-a'))).toEqual({
      value: 'aws',
      label: 'AWS',
      rank: 0,
    });
    expect(cloudProviderCell(node({ name: 'b', provider: 'Aws' }, 'base-a'))?.value).toBe(
      'aws',
    );
  });

  test('an unknown provider keeps its own text', () => {
    expect(cloudProviderCell(node({ name: 'a', provider: 'oracle' }, 'base-a'))).toEqual({
      value: 'oracle',
      label: 'oracle',
      rank: 0,
    });
  });

  test('another fact whose key ends in Provider is the fallback', () => {
    expect(cloudProviderFact({ 'Custom.Provider': 'gcp' })).toBe('gcp');
    expect(
      cloudProviderFact({ 'Custom.Provider': 'gcp', 'Cloud.Provider': 'aws' }),
    ).toBe('aws');
    expect(
      cloudProviderFact({ 'Cloud.Provider': '', 'Other.Provider': 'azure' }),
    ).toBe('azure');
  });

  test('no Facts, no provider fact, or an empty one is no value', () => {
    expect(cloudProviderCell(node({ name: 'a' }, 'base-a'))).toBeNull();
    expect(cloudProviderCell(withFacts({ 'Cluster.KubernetesVersion': '1.31' }))).toBeNull();
    expect(cloudProviderCell(withFacts({ 'Cloud.Provider': '  ' }))).toBeNull();
  });
});

test.describe('the order of the stacks', () => {
  test('A-Z by product name, which is already the meaningful order', () => {
    const deployments = component([
      { name: 'a', provider: 'azure' },
      { name: 'b', provider: 'azure' },
      { name: 'c', provider: 'aws' },
      { name: 'd', provider: 'aws' },
      { name: 'e', provider: 'gcp' },
      { name: 'f', provider: 'gcp' },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), PROVIDER_GROUP_KEY);
    expect(groups.map((g) => g.label)).toEqual(['AWS', 'Azure', 'Google Cloud']);
    expect(groups.map((g) => g.memberIds)).toEqual([
      ['c', 'd'],
      ['a', 'b'],
      ['e', 'f'],
    ]);
  });

  test('"No provider" is last, after an unknown provider', () => {
    const deployments = component([
      { name: 'a' },
      { name: 'b' },
      { name: 'c', provider: 'oracle' },
      { name: 'd', provider: 'oracle' },
      { name: 'e', provider: 'aws' },
      { name: 'f', provider: 'aws' },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), PROVIDER_GROUP_KEY);
    expect(groups.map((g) => [g.label, g.value])).toEqual([
      ['AWS', 'aws'],
      ['oracle', 'oracle'],
      ['No provider', null],
    ]);
    expect(groups[2].id).toBe('stack:base-a:__none');
    expect(groups[2].memberIds).toEqual(['a', 'b']);
  });

  test('four providers of one Deployment each merge into one stack, in order', () => {
    const deployments = component([
      { name: 'a', provider: 'gcp' },
      { name: 'b', provider: 'oracle' },
      { name: 'c', provider: 'aws' },
      { name: 'd', provider: 'azure' },
    ]);
    const groups = groupQuiet('base-a', foldMembers(deployments), PROVIDER_GROUP_KEY);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('other');
    expect(groups[0].label).toBe('4 cloud providers, 1 each');
    expect(groups[0].mergedLabels).toEqual(['AWS', 'Azure', 'Google Cloud', 'oracle']);
  });
});

test.describe('when Cloud provider is offered', () => {
  test('listed when it puts two Deployments of one Base together', () => {
    const deployments = component([
      { name: 'a', provider: 'aws' },
      { name: 'b', provider: 'aws' },
      { name: 'c', provider: 'gcp' },
    ]);
    expect(groupByOptions(foldMembers(deployments))).toEqual([
      { key: PROVIDER_GROUP_KEY, label: 'Cloud provider', valueCount: 2, isDefault: false },
    ]);
  });

  test('not listed when no Target has a provider fact', () => {
    expect(optionKeys(component([{ name: 'a' }, { name: 'b' }, { name: 'c' }]))).toEqual([]);
  });

  test('not listed when every Deployment is on one provider', () => {
    const deployments = component([
      { name: 'a', provider: 'aws' },
      { name: 'b', provider: 'aws' },
      { name: 'c', provider: 'aws', base: 'base-b' },
    ]);
    expect(optionKeys(deployments)).toEqual([]);
  });

  test('not listed when every provider is on one Deployment of its Base', () => {
    const deployments = component([
      { name: 'a', provider: 'aws' },
      { name: 'b', provider: 'gcp' },
      { name: 'c', provider: 'aws', base: 'base-b' },
      { name: 'd', provider: 'azure', base: 'base-b' },
    ]);
    expect(optionKeys(deployments)).toEqual([]);
  });

  test('not listed when it only repeats the Base split', () => {
    const deployments = component([
      { name: 'a', provider: 'aws' },
      { name: 'b', provider: 'aws' },
      { name: 'c', provider: 'gcp', base: 'base-b' },
      { name: 'd', provider: 'gcp', base: 'base-b' },
    ]);
    expect(optionKeys(deployments)).toEqual([]);
  });

  test('cert-manager: not listed when the Targets carry no Facts', () => {
    expect(optionKeys(meridianComponent('cert-manager'))).not.toContain(PROVIDER_GROUP_KEY);
  });

  test('positive case: listed on fixture data with two providers', () => {
    const deployments = component([
      { name: 'a', provider: 'aws' },
      { name: 'b', provider: 'aws' },
      { name: 'c', provider: 'gcp' },
      { name: 'd', provider: 'gcp' },
      { name: 'e', provider: 'aws' },
    ]);
    expect(optionKeys(deployments)).toContain(PROVIDER_GROUP_KEY);
  });
});

test.describe('the key', () => {
  const deployments = component([
    { name: 'a', provider: 'aws', labels: { Department: 'retail', provider: 'x' } },
    { name: 'b', provider: 'aws', labels: { Department: 'retail', provider: 'x' } },
    { name: 'c', provider: 'gcp', labels: { Department: 'payments', provider: 'y' } },
  ]);
  const members = foldMembers(deployments);
  const options = groupByOptions(members);

  test('it is never the default, and comes after the Space label keys', () => {
    expect(options.map((o) => [o.key, o.isDefault])).toEqual([
      ['Department', true],
      ['provider', false],
      [PROVIDER_GROUP_KEY, false],
    ]);
    expect(defaultGroupKey(members)).toBe('Department');
  });

  test('it is not the default even when it is the only option', () => {
    const only = foldMembers(
      component([
        { name: 'a', provider: 'aws' },
        { name: 'b', provider: 'aws' },
        { name: 'c', provider: 'gcp' },
      ]),
    );
    expect(groupByOptions(only).map((o) => o.key)).toEqual([PROVIDER_GROUP_KEY]);
    expect(defaultGroupKey(only)).toBeNull();
  });

  test('?graphGroup=@provider resolves to it; a label named "provider" stays a label', () => {
    expect(resolveGroupKey('@provider', options, 'Department')).toBe(PROVIDER_GROUP_KEY);
    expect(resolveGroupKey('provider', options, 'Department')).toBe('provider');
    expect(groupQuiet('base-a', members, 'provider').map((g) => g.label)).toEqual(['x', 'y']);
  });

  test('?graphGroup=@provider falls back to the default when it is not an option', () => {
    const noFacts = groupByOptions(
      foldMembers(
        component([
          { name: 'a', labels: { Department: 'retail' } },
          { name: 'b', labels: { Department: 'retail' } },
          { name: 'c', labels: { Department: 'payments' } },
        ]),
      ),
    );
    expect(resolveGroupKey('@provider', noFacts, 'Department')).toBe('Department');
  });

  test('the button, the fold header and merged stacks name it in words', () => {
    expect(groupByButtonLabel(true, PROVIDER_GROUP_KEY)).toBe('Cloud provider');
    expect(groupKeyPlural(PROVIDER_GROUP_KEY)).toBe('cloud providers');
    expect(foldHeaderTitle(PROVIDER_GROUP_KEY, ['AWS', 'Azure'])).toBe(
      'Cloud provider: AWS, Azure',
    );
    expect(foldHeaderCountText(PROVIDER_GROUP_KEY, 1)).toBe('1 cloud provider');
    expect(foldHeaderCountText(PROVIDER_GROUP_KEY, 3)).toBe('3 cloud providers');
  });
});
