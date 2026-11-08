// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What a write to a guarded Unit would withhold, or did, as the save flow reads it from the
// server's conflicts.
import type { MutationConflict, PathAnnotationList } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import {
  NO_GUARD_VALUES,
  clearanceRecording,
  guardParams,
  guardValuesComplete,
} from '../src/components/guarded-write/guardValues';
import {
  type GuardedChange,
  type GuardedFieldState,
  guardGroups,
  guardInheritance,
  guardedChanges,
  withheldSummary,
} from '../src/components/guarded-write/guardedWrite';
import { unitHasGuards } from '../src/utility/clearance-functions';

const DEPLOYMENT = { ResourceType: 'apps/v1/Deployment', ResourceName: 'prod/web' };

const replicasWithheld: MutationConflict = {
  Reason: 'Guarded',
  Resource: DEPLOYMENT,
  Path: 'spec.replicas',
  Source: { MutationType: 'Update', Index: 0, Value: '5\n' },
  Guard: { Key: 'Scale', Value: 'RegionSpecific' },
  Guards: [
    { Key: 'Scale', Value: 'RegionSpecific' },
    { Key: 'owner', Value: 'local' },
  ],
};

const imageWithheld: MutationConflict = {
  Reason: 'Guarded',
  Resource: DEPLOYMENT,
  Path: 'spec.template.spec.containers.?name=web.image',
  Source: { MutationType: 'Update', Index: 0, Value: 'nginx:1.28\n' },
  Guard: { Key: 'Link', Value: 'TransformPaths' },
};

// What an earlier merge left outstanding, which a write reports with its own.
const upgradeKept: MutationConflict = {
  Reason: 'ProtectedPath',
  Resource: DEPLOYMENT,
  Path: 'metadata.labels.tier',
  Source: { MutationType: 'Update', Index: 0, Value: 'web\n' },
};

test('a Unit has guards when any resource or path carries one', () => {
  const guarded: PathAnnotationList = [
    {
      Resource: DEPLOYMENT,
      PathAnnotationMap: { 'spec.replicas': { Guard: { Scale: 'RegionSpecific' } } },
    },
  ];
  const onResource: PathAnnotationList = [
    { Resource: DEPLOYMENT, ResourceAnnotations: { Guard: { owner: 'local' } } },
  ];
  // Annotations of another kind, or an emptied guard map, are not guards.
  const dismissalsOnly: PathAnnotationList = [
    {
      Resource: DEPLOYMENT,
      PathAnnotationMap: {
        'spec.replicas': { ConflictDismissal: { Guarded: '' }, Guard: {} },
      },
    },
  ];
  expect(unitHasGuards(guarded)).toBe(true);
  expect(unitHasGuards(onResource)).toBe(true);
  expect(unitHasGuards(dismissalsOnly)).toBe(false);
  expect(unitHasGuards(undefined)).toBe(false);
  expect(unitHasGuards([])).toBe(false);
});

test('only what a guard withheld is a guarded change, with the guards and the value', () => {
  expect(guardedChanges([upgradeKept, replicasWithheld, imageWithheld], 'prod/web')).toEqual([
    {
      unitLabel: 'prod/web',
      resourceType: 'apps/v1/Deployment',
      resourceName: 'prod/web',
      path: 'spec.replicas',
      value: '5\n',
      guards: [
        { Key: 'Scale', Value: 'RegionSpecific' },
        { Key: 'owner', Value: 'local' },
      ],
    },
    {
      unitLabel: 'prod/web',
      resourceType: 'apps/v1/Deployment',
      resourceName: 'prod/web',
      path: 'spec.template.spec.containers.?name=web.image',
      value: 'nginx:1.28\n',
      // A conflict recorded before every guard was reported names its one guard.
      guards: [{ Key: 'Link', Value: 'TransformPaths' }],
    },
  ]);
  expect(guardedChanges(undefined, 'prod/web')).toEqual([]);
});

test('changes are grouped under each guard that withheld them, in key and then value order', () => {
  const changes = guardedChanges([replicasWithheld, imageWithheld], 'prod/web');
  const groups = guardGroups(changes);
  // Upper case sorts first, as the server orders guard keys.
  expect(groups.map((group) => group.text)).toEqual([
    'Link=TransformPaths',
    'Scale=RegionSpecific',
    'owner=local',
  ]);
  // A change withheld by two guards is under both: acknowledging either alone does not land it.
  expect(groups[1].changes.map((change) => change.path)).toEqual(['spec.replicas']);
  expect(groups[2].changes.map((change) => change.path)).toEqual(['spec.replicas']);
  expect(withheldSummary(changes)).toBe('Guards withheld 2 changes');
  expect(withheldSummary(changes.slice(0, 1), true)).toBe('Guards would withhold 1 change');
});

test('a guard is inherited where every path it guards says so, and mixed where only some do', () => {
  const resourcesWithheld: MutationConflict = {
    ...replicasWithheld,
    Path: 'spec.template.spec.containers.0.resources',
  };
  const changes = guardedChanges([replicasWithheld, resourcesWithheld], 'prod/web', {
    spaceId: 's',
    unitId: 'u',
  });
  const scale = guardGroups(changes).find((group) => group.guard.Key === 'Scale')!;
  const states = new Map<string, GuardedFieldState>();
  const stateOf = (change: GuardedChange) => states.get(change.path);

  expect(guardInheritance(scale, stateOf)).toBe('unknown');
  for (const change of scale.changes) {
    states.set(change.path, { inheritedGuardKeys: new Set(['Scale']) });
  }
  expect(guardInheritance(scale, stateOf)).toBe('inherited');
  for (const change of scale.changes) {
    states.set(change.path, { inheritedGuardKeys: new Set() });
  }
  expect(guardInheritance(scale, stateOf)).toBe('local');
  expect(scale.changes).toHaveLength(2);
  states.set(scale.changes[0].path, { inheritedGuardKeys: new Set(['Scale']) });
  expect(guardInheritance(scale, stateOf)).toBe('mixed');
  expect(changes[0].unit).toEqual({ spaceId: 's', unitId: 'u' });
});

test('a guard written is sent as guards or inherited guards, and the clearance covers it', () => {
  expect(guardParams(NO_GUARD_VALUES)).toEqual({});
  expect(guardValuesComplete(NO_GUARD_VALUES)).toBe(true);

  const local = { enabled: true, key: ' RunAsRoot ', value: 'LegacyImage', inherited: false };
  expect(guardParams(local)).toEqual({ guards: '{"RunAsRoot":"LegacyImage"}' });
  expect(guardParams({ ...local, inherited: true })).toEqual({
    inheritedGuards: '{"RunAsRoot":"LegacyImage"}',
  });

  // Asked for, but with no key: nothing to send, and the form cannot be sent.
  const keyless = { ...local, key: '  ' };
  expect(guardValuesComplete(keyless)).toBe(false);
  expect(guardParams(keyless)).toEqual({});

  const stated = [{ Key: 'Scale', Operator: 'In' as const, Values: ['RegionSpecific'] }];
  expect(clearanceRecording(undefined, NO_GUARD_VALUES)).toBeUndefined();
  expect(clearanceRecording(stated, NO_GUARD_VALUES)).toEqual(stated);
  expect(clearanceRecording(stated, local)).toEqual([
    ...stated,
    { Key: 'RunAsRoot', Operator: 'In', Values: ['LegacyImage'] },
  ]);
  expect(clearanceRecording(undefined, { ...local, value: '' })).toEqual([
    { Key: 'RunAsRoot', Operator: 'Exists' },
  ]);
});

test('a guard change a guard withheld is asked about too, as a change to the path’s guards', () => {
  const guardWithheld: MutationConflict = {
    Reason: 'GuardWithheld',
    Resource: DEPLOYMENT,
    Path: 'spec.replicas',
    Source: { MutationType: 'None', Index: 0 },
    Guard: { Key: 'Scale', Value: 'RegionSpecific' },
    Guards: [{ Key: 'Scale', Value: 'RegionSpecific' }],
    GuardChange: { Path: 'spec.replicas', RemoveLocal: ['Scale'] },
  };
  const [change] = guardedChanges([guardWithheld], 'prod/web');
  expect(change.guardChange).toBe(true);
  expect(change.value).toBeUndefined();
  expect(change.guards).toEqual([{ Key: 'Scale', Value: 'RegionSpecific' }]);
  expect(guardedChanges([{ ...guardWithheld, Reason: 'ProtectedPath' }], 'prod/web')).toEqual([]);
});
