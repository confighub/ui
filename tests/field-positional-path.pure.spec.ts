// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The tree names array elements by position (`containers.0.image`); the server names them by
// merge key where the array has one and the element carries it, else by index
// (`containers.?name=web.image`, `ports.0.containerPort`: internal/blame/expand.go
// appendSequenceLeaves). GET .../path accepts only the server's form (ARCHITECTURE §13 Q1).
import { expect, test } from '@playwright/test';

import { positionalToMergeKeyPath } from '../src/components/field-diagnosis/positionalPath';

/** fd-prod/web's leaves (tests/fixtures/field-diagnosis/reports/prod-web.yaml), by positional path. */
const PROD_WEB = new Map<string, unknown>([
  ['metadata.name', 'web'],
  ['spec.replicas', 5],
  ['spec.template.spec.containers.0.name', 'web'],
  ['spec.template.spec.containers.0.image', 'registry.example.com/legacy/web:1.4.2'],
  ['spec.template.spec.containers.0.ports.0.containerPort', 8080],
]);

/** The merge keys of the arrays in the examples: containers and env by name; ports have none here. */
const KEYS = (arrayPath: string): readonly string[] | undefined =>
  /(^|\.)(containers|initContainers|env)$/.test(arrayPath) ? ['name'] : undefined;

test('a path with no array segment is unchanged', () => {
  expect(positionalToMergeKeyPath(PROD_WEB, 'spec.replicas', KEYS)).toBe('spec.replicas');
});

test('a named container becomes ?name=', () => {
  expect(positionalToMergeKeyPath(PROD_WEB, 'spec.template.spec.containers.0.image', KEYS)).toBe(
    'spec.template.spec.containers.?name=web.image',
  );
});

test('an element of an array with no merge key keeps its index, as the server writes it', () => {
  // The real blame of fd-prod/web has `spec.template.spec.containers.?name=web.ports.0.containerPort`.
  expect(positionalToMergeKeyPath(PROD_WEB, 'spec.template.spec.containers.0.ports.0.containerPort', KEYS)).toBe(
    'spec.template.spec.containers.?name=web.ports.0.containerPort',
  );
});

test('an element that lacks the merge key keeps its index', () => {
  const doc = new Map<string, unknown>([['spec.containers.0.image', 'nginx']]);
  expect(positionalToMergeKeyPath(doc, 'spec.containers.0.image', KEYS)).toBe('spec.containers.0.image');
});

test('nested keyed arrays', () => {
  const doc = new Map<string, unknown>([
    ['spec.containers.0.name', 'api'],
    ['spec.containers.1.name', 'sidecar'],
    ['spec.containers.1.env.0.name', 'LOG_LEVEL'],
    ['spec.containers.1.env.0.value', 'debug'],
  ]);
  expect(positionalToMergeKeyPath(doc, 'spec.containers.1.env.0.value', KEYS)).toBe(
    'spec.containers.?name=sidecar.env.?name=LOG_LEVEL.value',
  );
});

test('several merge keys are comma-joined in key order', () => {
  const doc = new Map<string, unknown>([
    ['spec.ports.0.containerPort', 80],
    ['spec.ports.0.protocol', 'TCP'],
  ]);
  const keys = () => ['containerPort', 'protocol'];
  expect(positionalToMergeKeyPath(doc, 'spec.ports.0.protocol', keys)).toBe('spec.ports.?containerPort=80,protocol=TCP.protocol');
});

test('a dot in a key value is escaped as the server escapes it', () => {
  const doc = new Map<string, unknown>([['data.items.0.key', 'app.properties']]);
  expect(positionalToMergeKeyPath(doc, 'data.items.0.key', () => ['key'])).toBe('data.items.?key=app~1properties.key');
});

test('an element the document does not have gives undefined', () => {
  expect(positionalToMergeKeyPath(PROD_WEB, 'spec.template.spec.containers.3.image', KEYS)).toBeUndefined();
});
