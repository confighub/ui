// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// triggerRule reads what a Trigger runs from the Trigger and its functions' signatures alone.
import type { FunctionSignature } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { describeFunction, triggerRule } from '../src/components/trigger-rule/triggerRule';

const podSecurity: FunctionSignature = {
  FunctionName: 'vet-pod-security-standard',
  Description:
    'Fails a pod template that does not meet a Pod Security Standard level (https://kubernetes.io/docs/concepts/security/pod-security-standards/), using the same checks. Each failure is an Issue. Fix: set what the check names.',
  Parameters: [
    { ParameterName: 'level', DataType: 'string', Required: false },
    { ParameterName: 'version', DataType: 'string', Required: false, DefaultValue: 'latest' },
    { ParameterName: 'check', DataType: 'CSV', Required: false },
  ],
} as FunctionSignature;

const signatures: Record<string, FunctionSignature> = {
  'vet-pod-security-standard': podSecurity,
  'vet-cel': {
    FunctionName: 'vet-cel',
    Parameters: [{ ParameterName: 'expression', DataType: 'CEL', Required: true }],
  } as FunctionSignature,
  'vet-images': {
    FunctionName: 'vet-images',
    Parameters: [{ ParameterName: 'image-filter', DataType: 'ValueFilter', Required: true }],
  } as FunctionSignature,
};

test('arguments are shown by their parameters, a list as a list, and an omitted default as one', () => {
  const rule = triggerRule(
    {
      FunctionName: 'vet-pod-security-standard',
      Arguments: [
        { ParameterName: 'level', Value: 'baseline' },
        { ParameterName: 'check', Value: 'privileged, hostPorts,' },
      ],
    },
    undefined,
    (name) => signatures[name],
  );
  expect(rule.functions).toHaveLength(1);
  expect(rule.functions[0].functionName).toBe('vet-pod-security-standard');
  expect(rule.functions[0].position).toBeUndefined();
  expect(rule.functions[0].arguments).toEqual([
    expect.objectContaining({
      name: 'level',
      value: { kind: 'text', text: 'baseline' },
      isDefault: false,
    }),
    expect.objectContaining({
      name: 'check',
      value: { kind: 'list', items: ['privileged', 'hostPorts'] },
    }),
    expect.objectContaining({
      name: 'version',
      value: { kind: 'text', text: 'latest' },
      isDefault: true,
    }),
  ]);
});

test('an expression is shown as one, a filter by its fields, and an unnamed argument by position', () => {
  const cel = triggerRule(
    { FunctionName: 'vet-cel', Arguments: [{ Value: 'r.spec.replicas >= 2' }] },
    undefined,
    (name) => signatures[name],
  );
  expect(cel.functions[0].arguments[0]).toMatchObject({
    name: 'expression',
    value: { kind: 'expression', language: 'CEL', text: 'r.spec.replicas >= 2' },
  });
  const images = triggerRule(
    {
      FunctionName: 'vet-images',
      Arguments: [
        {
          ParameterName: 'image-filter',
          Value:
            '{"AllowStrings":{"ghcr.io/a":true,"ghcr.io/b":true},"DenyRegexp":":latest$"}',
        },
      ],
    },
    undefined,
    (name) => signatures[name],
  );
  expect(images.functions[0].arguments[0].value).toEqual({
    kind: 'fields',
    fields: [
      { name: 'AllowStrings', value: 'ghcr.io/a, ghcr.io/b' },
      { name: 'DenyRegexp', value: ':latest$' },
    ],
  });
});

test("an Invocation's functions are numbered, and the Units a Trigger reads are listed by key", () => {
  const rule = triggerRule(
    { FunctionName: 'vet-cel', OtherUnitIDs: { policy: 'u1', params: 'u2' } },
    undefined,
    () => undefined,
  );
  expect(rule.reads).toEqual([
    { key: 'params', unitId: 'u2' },
    { key: 'policy', unitId: 'u1' },
  ]);
  const viaInvocation = triggerRule(
    { InvocationID: 'i1' },
    {
      Slug: 'checks',
      ToolchainType: 'Kubernetes/YAML',
      FunctionInvocations: [{ FunctionName: 'vet-cel' }, { FunctionName: 'vet-images' }],
      OtherUnitIDs: { schema: 'u3' },
    },
    (name) => signatures[name],
  );
  expect(viaInvocation.functions.map((f) => [f.functionName, f.position])).toEqual([
    ['vet-cel', 1],
    ['vet-images', 2],
  ]);
  expect(viaInvocation.reads).toEqual([{ key: 'schema', unitId: 'u3' }]);
});

test("a function's description gives its first sentence and its fix", () => {
  expect(describeFunction(podSecurity.Description)).toEqual({
    summary:
      'Fails a pod template that does not meet a Pod Security Standard level (https://kubernetes.io/docs/concepts/security/pod-security-standards/), using the same checks.',
    fix: 'Fix: set what the check names.',
  });
  expect(describeFunction('Returns true if schema passes validation')).toEqual({
    summary: 'Returns true if schema passes validation',
    fix: undefined,
  });
  expect(describeFunction(undefined)).toEqual({});
});
