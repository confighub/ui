// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import {
  buildTriggerBody,
  defaultTriggerFormInput,
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
      Protect: true,
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
    Protect: true,
    Guards: { owner: 'platform' },
    Clearance: [
      { Key: 'owner', Operator: 'In', Values: ['platform', 'sre'] },
      { Key: 'policy-exception', Operator: 'DoesNotExist' },
    ],
    SpaceID: 'space-1',
    OrganizationID: 'org-1',
  });
  // DoesNotExist takes no values.
  expect(body.Clearance?.[1]).not.toHaveProperty('Values');
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

test('an edit keeps the other Units the form does not show, unless the Trigger runs an Invocation', () => {
  const existingTrigger = {
    Slug: 'check-policy',
    FunctionName: 'vet-validating-admission-policy',
    OtherUnitIDs: { policy: 'unit-1' },
  };
  const input = triggerToFormInput(existingTrigger);
  const body = buildTriggerBody(input, {}, ids, true, existingTrigger);
  expect(body.OtherUnitIDs).toEqual({ policy: 'unit-1' });

  // One that runs an Invocation passes the Invocation's, and the server refuses its own.
  const runsInvocation = buildTriggerBody({ ...input, Source: 'Invocation', InvocationID: 'inv-1' }, {}, ids, true, existingTrigger);
  expect(runsInvocation.OtherUnitIDs).toBeUndefined();
});

test('switching back to a function drops the Invocation', () => {
  const body = buildTriggerBody(form({ Source: 'Function', InvocationID: 'inv-1' }), {}, ids);
  expect(body.InvocationID).toBeUndefined();
  expect(body.FunctionName).toBe('vet-placeholders');
});

test('keep on merge is not sent for a validating function', () => {
  expect(buildTriggerBody(form({ Protect: true }), {}, ids, true).Protect).toBe(false);
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
    Protect: true,
    Guards: { owner: 'platform' },
    Clearance: [{ Key: 'owner', Operator: 'NotIn', Values: ['legacy'] }],
  });
  expect(input).toMatchObject({
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
    Protect: true,
    Guards: { owner: 'platform' },
    Clearance: [{ Key: 'owner', Operator: 'NotIn', Values: ['legacy'] }],
  });
});
