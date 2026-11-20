// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The whole-unit blame names a field by the server's path (`containers.?name=web.image`); the
// tree names its row by stage key (`containers.0.image`). buildBlameIndex puts each blame field
// on its row with the tree's own resolver, once per (blame, configuration) pair.
import type { BlameField } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { stageKeyPath } from '../src/pages/x/apps/diffTree';
import { buildBlameIndex } from '../src/pages/x/apps/field-diagnosis/blameIndex';
import { prodWebBlame, prodWebYaml } from './fixtures/field-diagnosis/states';

const pathsOf = (index: Map<string, BlameField>) => new Map([...index].map(([key, field]) => [stageKeyPath(key), field.Path]));

test('a scalar path maps one to one', () => {
  const index = buildBlameIndex(prodWebBlame(), prodWebYaml());
  expect(pathsOf(index).get('spec.replicas')).toBe('spec.replicas');
});

test('a merge-key path maps to the positional row', () => {
  const index = buildBlameIndex(prodWebBlame(), prodWebYaml());
  expect(pathsOf(index).get('spec.template.spec.containers.0.image')).toBe('spec.template.spec.containers.?name=web.image');
  expect(pathsOf(index).get('spec.template.spec.containers.0.ports.0.containerPort')).toBe(
    'spec.template.spec.containers.?name=web.ports.0.containerPort',
  );
});

test('the resource field (no Path) has no row', () => {
  const index = buildBlameIndex(prodWebBlame(), prodWebYaml());
  expect([...index.values()].some((f) => !f.Path)).toBe(false);
});

test('two documents with the same path map by resource', () => {
  const yaml = [
    'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\n  namespace: ns\nspec:\n  type: ClusterIP',
    'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: web\n  namespace: ns\ndata:\n  a: "1"',
  ].join('\n---\n');
  const fields: BlameField[] = [
    { Path: 'metadata.name', ResourceType: 'v1/Service', ResourceName: 'ns/web', Value: 'web', Ref: 'svc' },
    { Path: 'metadata.name', ResourceType: 'v1/ConfigMap', ResourceName: 'ns/web', Value: 'web', Ref: 'cm' },
  ];
  const index = buildBlameIndex(fields, yaml);
  const refs = [...index.entries()].filter(([key]) => stageKeyPath(key) === 'metadata.name').map(([key, f]) => [key, f.Ref]);
  expect(refs).toHaveLength(2);
  expect(new Set(refs.map(([key]) => key)).size).toBe(2);
  expect(refs.map(([, ref]) => ref).sort()).toEqual(['cm', 'svc']);
});

test('a pattern path maps to nothing', () => {
  const fields: BlameField[] = [{ Path: 'spec.template.spec.containers.*.image', ResourceType: 'apps/v1/Deployment', ResourceName: 'test-ns/web' }];
  expect(buildBlameIndex(fields, prodWebYaml()).size).toBe(0);
});

test('the same input returns the same Map (cache hit)', () => {
  const fields = prodWebBlame();
  const yaml = prodWebYaml();
  expect(buildBlameIndex(fields, yaml)).toBe(buildBlameIndex(fields, yaml));
  expect(buildBlameIndex(fields, yaml)).not.toBe(buildBlameIndex(prodWebBlame(), yaml));
});

test('no configuration gives an empty index', () => {
  expect(buildBlameIndex(prodWebBlame(), undefined).size).toBe(0);
});
