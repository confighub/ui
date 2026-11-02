// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// validationFindings turns a gate's failed results, as Unit.ValidationResults records them or a
// live run returns them, into the fields they name and the checks that name none.
import type { ValidationResult } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import {
  formatFoundValue,
  selectLiveResult,
  validationFindings,
} from '../src/pages/unit-detail/components/action-side-bar/validationFindings';

test('a placeholder finding names the field and the value found', () => {
  const results: ValidationResult[] = [
    {
      Passed: false,
      Index: 0,
      FunctionName: 'vet-placeholders',
      FailedAttributes: [
        {
          ResourceType: 'apps/v1/Deployment',
          ResourceName: 'confighubplaceholder/frontend',
          Path: 'metadata.namespace',
          Value: 'confighubplaceholder',
        },
      ],
    },
  ];
  const findings = validationFindings(results);
  expect(findings.unit).toEqual([]);
  expect(findings.fields).toEqual([
    {
      key: '0/0',
      resourceType: 'apps/v1/Deployment',
      resourceName: 'confighubplaceholder/frontend',
      path: 'metadata.namespace',
      score: undefined,
      messages: [],
      value: 'confighubplaceholder',
    },
  ]);
});

test("a field's own issues are its messages, and the result's score stands in for its own", () => {
  const findings = validationFindings([
    {
      Passed: false,
      Index: 0,
      MaxScore: 'High',
      FailedAttributes: [
        {
          Path: 'spec.replicas',
          Issues: [{ Message: 'replicas must be at least 2' }, { Message: '' }],
          Value: 1,
        },
      ],
    },
  ]);
  expect(findings.fields[0].messages).toEqual(['replicas must be at least 2']);
  expect(findings.fields[0].score).toBe('High');
  expect(findings.fields[0].value).toBe('1');
});

test('a check that names no field is a Unit finding with its issues and details', () => {
  const findings = validationFindings([
    {
      Passed: false,
      Index: 0,
      FunctionName: 'vet-cel',
      Issues: [{ Message: 'no Deployment found' }],
      Details: ['expression evaluated to false'],
    },
  ]);
  expect(findings.fields).toEqual([]);
  expect(findings.unit).toEqual([
    {
      key: '0',
      functionName: 'vet-cel',
      score: undefined,
      messages: ['no Deployment found', 'expression evaluated to false'],
    },
  ]);
});

test('passing results and an absent list produce no findings', () => {
  expect(validationFindings([{ Passed: true, Index: 0 }])).toEqual({ fields: [], unit: [] });
  expect(validationFindings(undefined)).toEqual({ fields: [], unit: [] });
});

test('a live result is picked by its function index, falling back to position', () => {
  const results: ValidationResult[] = [
    { Passed: true, Index: 1 },
    { Passed: false, Index: 0 },
  ];
  expect(selectLiveResult(results, 0)).toBe(results[1]);
  expect(selectLiveResult([{ Passed: false } as ValidationResult], 0)?.Passed).toBe(false);
  expect(selectLiveResult(undefined, 0)).toBeUndefined();
});

test('found values are shown as one line and shortened when long', () => {
  expect(formatFoundValue(undefined)).toBeUndefined();
  expect(formatFoundValue(null)).toBeUndefined();
  expect(formatFoundValue({ a: 1 })).toBe('{"a":1}');
  expect(formatFoundValue('x'.repeat(250))).toBe(`${'x'.repeat(200)}…`);
});
