// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import {
  buildTriggerBody,
  defaultTriggerFormInput,
  otherDataPatch,
  type IAddTriggerFormInput,
  triggerToFormInput,
} from '../src/hooks/triggerFormBody';

const ids = { spaceId: 'space-1', orgID: 'org-1' };

const form = (overrides: Partial<IAddTriggerFormInput>): IAddTriggerFormInput => ({
  ...defaultTriggerFormInput(),
  Slug: 'check-placeholders',
  FunctionName: 'vet-placeholders',
  ...overrides,
});

test('every field the form shows reaches the Trigger', () => {
  const body = buildTriggerBody(
    form({
      DisplayName: 'Placeholders',
      Description: 'Finds placeholders. Replace each with a real value.',
      ToolchainType: 'AppConfig/YAML',
      WhereUnit: "Space.Labels.Environment = 'prod'",
      UnitFilterID: 'filter-1',
      WhereResource: "ConfigHub.ResourceType = 'apps/v1/Deployment'",
      KeepOnMerge: true,
      Guards: [{ key: 'owner', value: 'platform' }],
      Clearance: [
        { Key: 'owner', Operator: 'In', Values: 'platform, sre' },
        { Key: 'policy-exception', Operator: 'DoesNotExist', Values: 'ignored' },
      ],
    }),
    { attribute: 'x' },
    ids,
  );
  expect(body).toMatchObject({
    Slug: 'check-placeholders',
    DisplayName: 'Placeholders',
    Description: 'Finds placeholders. Replace each with a real value.',
    ToolchainType: 'AppConfig/YAML',
    FunctionName: 'vet-placeholders',
    Arguments: [{ ParameterName: 'attribute', Value: 'x' }],
    WhereUnit: "Space.Labels.Environment = 'prod'",
    UnitFilterID: 'filter-1',
    WhereResource: "ConfigHub.ResourceType = 'apps/v1/Deployment'",
    // Keep on merge is the guard naming the Trigger, with the clearance to write over it again.
    Guards: { owner: 'platform', Trigger: 'check-placeholders' },
    Clearance: [
      { Key: 'owner', Operator: 'In', Values: ['platform', 'sre'] },
      { Key: 'policy-exception', Operator: 'DoesNotExist' },
      { Key: 'Trigger', Operator: 'In', Values: ['check-placeholders'] },
    ],
    SpaceID: 'space-1',
    OrganizationID: 'org-1',
  });
  // DoesNotExist takes no values.
  expect(body.Clearance?.[1]).not.toHaveProperty('Values');
  expect(body).not.toHaveProperty('Protect');
});

test('a blank optional field is left out, so an edit that clears it removes it', () => {
  const body = buildTriggerBody(
    form({ Description: '  ', UnitFilterID: '', WhereUnit: '', ChannelID: '', Guards: [], Clearance: [{ Key: ' ', Operator: 'Exists', Values: '' }] }),
    {},
    ids,
  );
  const sent = JSON.parse(JSON.stringify({ ...{ Description: 'old', UnitFilterID: 'f', Guards: { a: 'b' } }, ...body }));
  for (const field of ['Description', 'UnitFilterID', 'WhereUnit', 'ChannelID', 'Guards', 'Clearance', 'InvocationID']) {
    expect(sent).not.toHaveProperty(field);
  }
});

test('a Trigger that runs an Invocation names no function, arguments or Channel', () => {
  const body = buildTriggerBody(
    form({ Source: 'Invocation', InvocationID: 'inv-1', FunctionName: 'vet-placeholders', ChannelID: 'chan-1' }),
    { attribute: 'x' },
    ids,
  );
  expect(body.InvocationID).toBe('inv-1');
  expect(body.FunctionName).toBe('');
  expect(body.Arguments).toEqual([]);
  expect(body.ChannelID).toBeUndefined();
});

test('the other Units and selections round-trip, and an Invocation keeps only its selections', () => {
  const existingTrigger = {
    Slug: 'check-policy',
    FunctionName: 'vet-validating-admission-policy',
    OtherUnitIDs: { policy: 'unit-1' },
    OtherUnitSelections: {
      workloads: {
        Where: 'Space.ReleaseTargetID = EvaluatingSpace.ReleaseTargetID',
        WhereResource: "ConfigHub.ResourceType = 'apps/v1/Deployment'",
      },
      namespaces: { FilterID: 'filter-1' },
    },
  };
  const input = triggerToFormInput(existingTrigger);
  expect(input.OtherUnits).toEqual([{ key: 'policy', unitId: 'unit-1' }]);
  expect(input.OtherUnitSelections).toEqual([
    { key: 'namespaces', where: '', filterId: 'filter-1', whereResource: '' },
    {
      key: 'workloads',
      where: 'Space.ReleaseTargetID = EvaluatingSpace.ReleaseTargetID',
      filterId: '',
      whereResource: "ConfigHub.ResourceType = 'apps/v1/Deployment'",
    },
  ]);
  const body = buildTriggerBody(input, {}, ids, true, existingTrigger);
  expect(body.OtherUnitIDs).toEqual({ policy: 'unit-1' });
  expect(body.OtherUnitSelections).toEqual({
    namespaces: { Where: undefined, FilterID: 'filter-1', WhereResource: undefined },
    workloads: {
      Where: 'Space.ReleaseTargetID = EvaluatingSpace.ReleaseTargetID',
      FilterID: undefined,
      WhereResource: "ConfigHub.ResourceType = 'apps/v1/Deployment'",
    },
  });

  // One that runs an Invocation passes the Invocation's Units, and the server refuses its own.
  const runsInvocation = buildTriggerBody({ ...input, Source: 'Invocation', InvocationID: 'inv-1' }, {}, ids, true, existingTrigger);
  expect(runsInvocation.OtherUnitIDs).toBeUndefined();
  expect(Object.keys(runsInvocation.OtherUnitSelections ?? {})).toEqual(['namespaces', 'workloads']);
});

test('a key removed from the form is removed from the Trigger, and an incomplete row is left out', () => {
  const body = buildTriggerBody(
    form({
      OtherUnits: [
        { key: 'policy', unitId: '' },
        { key: ' ', unitId: 'unit-2' },
      ],
      OtherUnitSelections: [{ key: '', where: "Slug = 'x'", filterId: '', whereResource: '' }],
    }),
    {},
    ids,
  );
  expect(body.OtherUnitIDs).toEqual({});
  expect(body.OtherUnitSelections).toEqual({});
});

test('switching back to a function drops the Invocation', () => {
  const body = buildTriggerBody(form({ Source: 'Function', InvocationID: 'inv-1' }), {}, ids);
  expect(body.InvocationID).toBeUndefined();
  expect(body.FunctionName).toBe('vet-placeholders');
});

test('keep on merge is not sent for a validating function', () => {
  const body = buildTriggerBody(form({ KeepOnMerge: true }), {}, ids, true);
  expect(body.Guards).toBeUndefined();
  expect(body.Clearance).toBeUndefined();
});

test('an existing Trigger round-trips through the form', () => {
  const input = triggerToFormInput({
    Slug: 'stamp',
    DisplayName: 'Stamp',
    Description: 'Stamps an owner.',
    Event: 'PostClone',
    ToolchainType: 'Kubernetes/YAML',
    InvocationID: 'inv-1',
    WhereUnit: "Slug = 'web'",
    UnitFilterID: 'filter-1',
    WhereResource: '',
    Guards: { owner: 'platform', Trigger: 'stamp' },
    Clearance: [
      { Key: 'owner', Operator: 'NotIn', Values: ['legacy'] },
      { Key: 'Trigger', Operator: 'In', Values: ['stamp'] },
    ],
  });
  // Keep on merge stands for the guard naming the Trigger and the clearance admitting it.
  expect(input).toMatchObject({
    KeepOnMerge: true,
    Source: 'Invocation',
    InvocationID: 'inv-1',
    EventType: 'PostClone',
    Guards: [{ key: 'owner', value: 'platform' }],
    Clearance: [{ Key: 'owner', Operator: 'NotIn', Values: 'legacy' }],
  });
  const body = buildTriggerBody(input, {}, ids);
  expect(body).toMatchObject({
    Slug: 'stamp',
    DisplayName: 'Stamp',
    Description: 'Stamps an owner.',
    Event: 'PostClone',
    InvocationID: 'inv-1',
    WhereUnit: "Slug = 'web'",
    UnitFilterID: 'filter-1',
    Guards: { owner: 'platform', Trigger: 'stamp' },
    Clearance: [
      { Key: 'owner', Operator: 'NotIn', Values: ['legacy'] },
      { Key: 'Trigger', Operator: 'In', Values: ['stamp'] },
    ],
  });
});

test('a bulk patch states each selection whole and removes keys from both maps', () => {
  expect(
    otherDataPatch(
      [{ key: 'policy', unitId: 'unit-1' }],
      [{ key: 'workloads', where: '', filterId: '', whereResource: "ConfigHub.ResourceType = 'apps/v1/Deployment'" }],
      ['legacy', ' '],
    ),
  ).toEqual({
    // A key set in one map is removed from the other, where a Trigger may have it.
    OtherUnitIDs: { legacy: null, policy: 'unit-1', workloads: null },
    OtherUnitSelections: {
      legacy: null,
      policy: null,
      workloads: { Where: null, FilterID: null, WhereResource: "ConfigHub.ResourceType = 'apps/v1/Deployment'" },
    },
  });
  expect(otherDataPatch([], [], [])).toEqual({});
});
