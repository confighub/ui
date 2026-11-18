// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What the revision viewer's Mutations view lists for each mutation, and which tab an old
// link to the retired Mutations tab opens. Starts no browser:
//   cd ui && npx playwright test -c playwright.pure.config.ts revision-mutation-changes
import type { ExtendedMutationRead, ResourceMutation } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import {
  mutationArguments,
  mutationChanges,
  upstreamRevisions,
} from '../src/components/revision-compare-drawer/revisionMutationChanges';
import { UNIT_DETAIL_TAB, readUnitDetailTab } from '../src/pages/unit-detail/unitDetailHrefs';

const deployment: ResourceMutation = {
  Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'ns/web' },
  ResourceMutationInfo: { Index: 1, MutationType: 'Add' },
  PathMutationMap: {
    'spec.replicas': { Index: 3, MutationType: 'Update', Value: '5' },
    'metadata.labels.team': { Index: 3, MutationType: 'Delete', Value: 'old' },
    'spec.template.spec.securityContext': {
      Index: 2,
      MutationType: 'Add',
      Value: 'runAsNonRoot: true\n',
    },
    'spec.paused': { Index: 3, MutationType: 'None', Value: 'false' },
  },
};

const service: ResourceMutation = {
  Resource: { ResourceType: 'v1/Service', ResourceName: 'ns/web' },
  ResourceMutationInfo: { Index: 3, MutationType: 'Add' },
  PathMutationMap: { 'spec.ports': { Index: 3, MutationType: 'Add', Value: '- port: 80' } },
};

test('a mutation lists the paths it left, by resource and path, without a deleted value', () => {
  expect(mutationChanges([deployment], 3)).toEqual([
    {
      key: 'apps/v1/Deployment ns/web\u0000metadata.labels.team',
      resource: 'apps/v1/Deployment ns/web',
      path: 'metadata.labels.team',
      type: 'Delete',
      value: undefined,
    },
    {
      key: 'apps/v1/Deployment ns/web\u0000spec.replicas',
      resource: 'apps/v1/Deployment ns/web',
      path: 'spec.replicas',
      type: 'Update',
      value: '5',
    },
  ]);
});

test('a resource the mutation added is one change, not one per path', () => {
  expect(
    mutationChanges([deployment, service], 3).filter((c) =>
      c.resource.startsWith('v1/Service'),
    ),
  ).toEqual([
    { key: 'v1/Service ns/web\u0000', resource: 'v1/Service ns/web', path: '', type: 'Add' },
  ]);
  expect(mutationChanges([deployment], 1)).toEqual([
    {
      key: 'apps/v1/Deployment ns/web\u0000',
      resource: 'apps/v1/Deployment ns/web',
      path: '',
      type: 'Add',
    },
  ]);
});

test('a mutation whose values later mutations overwrote lists nothing', () => {
  expect(mutationChanges([deployment, service], 4)).toEqual([]);
});

test("arguments are the ones the mutation recorded, never the Trigger's as they are now", () => {
  const positional: ExtendedMutationRead = {
    Mutation: { FunctionInvocation: { Arguments: [{ ParameterName: 'replicas', Value: 5 }] } },
    Trigger: { Arguments: [{ ParameterName: 'ignored', Value: 'x' }] },
  };
  expect(mutationArguments(positional)).toEqual(['replicas=5']);
  const named: ExtendedMutationRead = {
    Mutation: { FunctionInvocation: { Params: { image: 'nginx', ports: [80] } } },
  };
  expect(mutationArguments(named)).toEqual(['image=nginx', 'ports=[80]']);
  const noneRecorded: ExtendedMutationRead = {
    Mutation: { FunctionInvocation: { FunctionName: 'set-pod-defaults' } },
    Trigger: { Arguments: [{ ParameterName: 'probes', Value: true }] },
  };
  expect(mutationArguments(noneRecorded)).toEqual([]);
});

test('upstream revisions name the one taken, or the range after the merge base', () => {
  expect(upstreamRevisions({ Mutation: {} })).toBeUndefined();
  expect(upstreamRevisions({ Mutation: { MergeEndRevisionNum: 4 } })).toBe('4');
  expect(
    upstreamRevisions({ Mutation: { MergeBaseRevisionNum: 3, MergeEndRevisionNum: 4 } }),
  ).toBe('4');
  expect(
    upstreamRevisions({ Mutation: { MergeBaseRevisionNum: 2, MergeEndRevisionNum: 6 } }),
  ).toBe('3 to 6');
});

test('a link to the retired Mutations tab opens Revisions; an unknown tab opens the Overview', () => {
  expect(readUnitDetailTab('4')).toBe(UNIT_DETAIL_TAB.revisions);
  expect(readUnitDetailTab(String(UNIT_DETAIL_TAB.blame))).toBe(UNIT_DETAIL_TAB.blame);
  expect(readUnitDetailTab(null)).toBe(UNIT_DETAIL_TAB.overview);
  expect(readUnitDetailTab('99')).toBe(UNIT_DETAIL_TAB.overview);
  expect(readUnitDetailTab('settings')).toBe(UNIT_DETAIL_TAB.overview);
});
