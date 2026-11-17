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
import {
  DEFAULT_CLEARANCE,
  clearanceAdmitting,
  clearanceWithout,
  guardsNotCleared,
  guardsNotClearedByDefault,
  nonMergeClearance,
  promotionClearance,
  unitHasGuards,
} from '../src/utility/clearance-functions';
import {
  LINK_GUARD_KEY,
  OVERRIDE_GUARD_KEY,
  TRIGGER_GUARD_KEY,
  hasOverrideGuard,
  isKeptOnMergeConflict,
  joinKeepGuard,
  overrideGuardAt,
  overrideGuardEdit,
  overrideGuardValue,
  splitKeepGuard,
} from '../src/utility/override-guard';

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

test('a write that is not a merge is cleared for Override guards unless a clearance is stated', () => {
  expect(DEFAULT_CLEARANCE).toEqual([{ Key: 'Override', Operator: 'Exists' }]);
  expect(nonMergeClearance()).toEqual(DEFAULT_CLEARANCE);
  expect(nonMergeClearance([])).toEqual(DEFAULT_CLEARANCE);
  // A clearance stated replaces the default, as cub --clearance does.
  const scale = [{ Key: 'Scale', Operator: 'In', Values: ['RegionSpecific'] }];
  expect(nonMergeClearance(scale)).toEqual(scale);
  // What was acknowledged at the write answers a dry run sent with the default, so it adds to it.
  expect(nonMergeClearance(undefined, scale)).toEqual([...DEFAULT_CLEARANCE, ...scale]);
});

test('only guards the default does not clear are asked about', () => {
  expect(
    guardsNotClearedByDefault([
      { Key: 'Override', Value: 'External' },
      { Key: 'Override', Value: 'Upstream' },
      { Key: 'Scale', Value: 'RegionSpecific' },
    ]),
  ).toEqual([{ Key: 'Scale', Value: 'RegionSpecific' }]);
});

test('a promotion is cleared by default only for a ChangeOrder that does not merge', () => {
  expect(promotionClearance('Invoke')).toEqual(DEFAULT_CLEARANCE);
  expect(promotionClearance('Upsert')).toEqual(DEFAULT_CLEARANCE);
  expect(promotionClearance('UpgradeUnit')).toBeUndefined();
  expect(promotionClearance('MergeUnits')).toBeUndefined();
  // An empty UpdateType is UpgradeUnit, and one not loaded yet is not assumed to be anything else.
  expect(promotionClearance('')).toBeUndefined();
  expect(promotionClearance(undefined)).toBeUndefined();
});

test('Keep on merge records the Override guard, Upstream on a Unit with an upstream Unit', () => {
  expect(OVERRIDE_GUARD_KEY).toBe('Override');
  expect(overrideGuardValue('upstream-unit-id')).toBe('Upstream');
  expect(overrideGuardValue(true)).toBe('Upstream');
  expect(overrideGuardValue(null)).toBe('External');
  expect(overrideGuardValue(undefined)).toBe('External');
  expect(overrideGuardValue(false)).toBe('External');
  expect(hasOverrideGuard({ Override: 'External', Scale: 'RegionSpecific' })).toBe(true);
  expect(hasOverrideGuard({ Scale: 'RegionSpecific' })).toBe(false);
  expect(hasOverrideGuard(undefined)).toBe(false);
  // The default clearance of a write that is not a merge covers either value.
  expect(guardsNotCleared({ Override: overrideGuardValue('u') }, DEFAULT_CLEARANCE)).toEqual([]);
  expect(guardsNotCleared({ Override: overrideGuardValue(null) }, DEFAULT_CLEARANCE)).toEqual([]);
});

test('an Override guard edit sets the guard on the paths kept and removes it from those let go', () => {
  expect(overrideGuardEdit(DEPLOYMENT, ['spec.replicas', ''], ['spec.template'], 'Upstream')).toEqual({
    Resource: DEPLOYMENT,
    Set: { 'spec.replicas': { Override: 'Upstream' }, '': { Override: 'Upstream' } },
    Remove: { 'spec.template': ['Override'] },
  });
  expect(overrideGuardEdit(DEPLOYMENT, [], ['spec.replicas'], 'External')).toEqual({
    Resource: DEPLOYMENT,
    Remove: { 'spec.replicas': ['Override'] },
  });
});

test('the Override guard at a path is its own, else the nearest ancestor, else the resource', () => {
  const annotations: PathAnnotationList[number] = {
    Resource: DEPLOYMENT,
    PathAnnotationMap: {
      'spec.template.spec': { Guard: { Override: 'Upstream' } },
      'spec.template.spec.replicas': { Guard: { Scale: 'RegionSpecific' } },
      'metadata.labels.team': { Guard: { Override: 'External' } },
    },
  };
  expect(overrideGuardAt(annotations, 'metadata.labels.team')).toBe('External');
  // A path's own entry without an Override does not hide an ancestor's: guards are a union.
  expect(overrideGuardAt(annotations, 'spec.template.spec.replicas')).toBe('Upstream');
  expect(overrideGuardAt(annotations, 'spec.template.spec.containers')).toBe('Upstream');
  expect(overrideGuardAt(annotations, 'spec.strategy')).toBeUndefined();
  expect(
    overrideGuardAt(
      { ...annotations, ResourceAnnotations: { Guard: { Override: 'External' } } },
      'spec.strategy',
    ),
  ).toBe('External');
  expect(overrideGuardAt(undefined, 'spec.strategy')).toBeUndefined();
});

test('a clearance admits a guard by its value, and gives back only the value it added', () => {
  expect(clearanceAdmitting([], 'Link', 'Insert')).toEqual([
    { Key: 'Link', Operator: 'In', Values: ['Insert'] },
  ]);
  const exists = [{ Key: 'Link', Operator: 'Exists' }];
  expect(clearanceAdmitting(exists, 'Link', 'Insert')).toBe(exists);
  expect(
    clearanceAdmitting([{ Key: 'Link', Operator: 'In', Values: ['Upsert'] }], 'Link', 'Insert'),
  ).toEqual([{ Key: 'Link', Operator: 'In', Values: ['Upsert', 'Insert'] }]);
  expect(
    clearanceWithout(
      [
        { Key: 'Link', Operator: 'In', Values: ['Upsert', 'Insert'] },
        { Key: 'Link', Operator: 'In', Values: ['Insert'] },
        { Key: 'owner', Operator: 'In', Values: ['Insert'] },
      ],
      'Link',
      'Insert',
    ),
  ).toEqual([
    { Key: 'Link', Operator: 'In', Values: ['Upsert'] },
    { Key: 'owner', Operator: 'In', Values: ['Insert'] },
  ]);
  expect(clearanceWithout(exists, 'Link', 'Insert')).toEqual(exists);
});

test("Keep on merge of a Link or Trigger is the guard naming it, with the clearance admitting it", () => {
  expect(LINK_GUARD_KEY).toBe('Link');
  expect(TRIGGER_GUARD_KEY).toBe('Trigger');
  const stored = {
    guards: { owner: 'platform', Trigger: 'stamp' },
    clearance: [
      { Key: 'owner', Operator: 'Exists' },
      { Key: 'Trigger', Operator: 'In', Values: ['stamp'] },
    ],
  };
  const form = splitKeepGuard(stored.guards, stored.clearance, TRIGGER_GUARD_KEY, 'stamp');
  expect(form).toEqual({
    keep: true,
    guards: { owner: 'platform' },
    clearance: [{ Key: 'owner', Operator: 'Exists' }],
  });
  expect(joinKeepGuard(form, TRIGGER_GUARD_KEY, 'stamp')).toEqual(stored);
  expect(joinKeepGuard({ ...form, keep: false }, TRIGGER_GUARD_KEY, 'stamp')).toEqual({
    guards: { owner: 'platform' },
    clearance: [{ Key: 'owner', Operator: 'Exists' }],
  });
  // Another value of the key is the person's own guard, shown as one; Keep on merge replaces it.
  const other = splitKeepGuard({ Trigger: 'older' }, undefined, TRIGGER_GUARD_KEY, 'stamp');
  expect(other).toEqual({ keep: false, guards: { Trigger: 'older' }, clearance: undefined });
  expect(joinKeepGuard({ ...other, keep: true }, TRIGGER_GUARD_KEY, 'stamp')).toEqual({
    guards: { Trigger: 'stamp' },
    clearance: [{ Key: 'Trigger', Operator: 'In', Values: ['stamp'] }],
  });
  expect(joinKeepGuard({ keep: false }, LINK_GUARD_KEY, 'Insert')).toEqual({
    guards: undefined,
    clearance: undefined,
  });
});

test('Keep on merge in a write is sent with the guard the form records, which wins on its key', () => {
  const local = { enabled: true, key: 'Scale', value: 'RegionSpecific', inherited: false };
  expect(guardParams(NO_GUARD_VALUES, { Override: 'Upstream' })).toEqual({
    guards: '{"Override":"Upstream"}',
  });
  expect(guardParams(local, { Override: 'Upstream' })).toEqual({
    guards: '{"Override":"Upstream","Scale":"RegionSpecific"}',
  });
  expect(guardParams({ ...local, inherited: true }, { Override: 'Upstream' })).toEqual({
    guards: '{"Override":"Upstream"}',
    inheritedGuards: '{"Scale":"RegionSpecific"}',
  });
  expect(
    guardParams({ ...local, key: 'Override', value: 'External' }, { Override: 'Upstream' }),
  ).toEqual({ guards: '{"Override":"External"}' });
});

test('a conflict is a value kept on merge when Override guards alone withheld it', () => {
  expect(isKeptOnMergeConflict({ Reason: 'Guarded', Guards: [{ Key: 'Override' }] })).toBe(true);
  expect(isKeptOnMergeConflict({ Reason: 'Guarded', Guard: { Key: 'Override' } })).toBe(true);
  // Another guard held it too, and is the one to explain.
  expect(
    isKeptOnMergeConflict({ Reason: 'Guarded', Guards: [{ Key: 'Override' }, { Key: 'owner' }] }),
  ).toBe(false);
  expect(isKeptOnMergeConflict({ Reason: 'Guarded', Guards: [{ Key: 'owner' }] })).toBe(false);
  // As a merge reported a kept value before keeping it became a guard.
  expect(isKeptOnMergeConflict({ Reason: 'ProtectedPath' })).toBe(true);
  expect(isKeptOnMergeConflict({ Reason: 'Subtracted' })).toBe(false);
});
