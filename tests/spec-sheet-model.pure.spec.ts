// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The spec sheet's model: every field drawn once, in document order, with the stage key the
// staging code uses, `{}` and `[]` included.

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpecSheet, type SpecSheet } from '../src/pages/x/apps/spec-sheet/specSheetModel';
import { parseUnitDataStructured } from '../src/pages/x/apps/configParser';
import { computeDocumentScopes, docStageKey, groupFieldEntriesByDocument } from '../src/pages/x/apps/diffTree';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'spec-sheet');
const fixture = (name: string, file: string) => fs.readFileSync(path.join(FIXTURES, name, file), 'utf8');

/** The stage keys of the tree's leaves, as the tree builds them. */
function treeKeys(data: string, scopedWritesSupported = true): string[] {
  const entries = parseUnitDataStructured(data);
  const scopes = computeDocumentScopes(entries, { scopedWritesSupported });
  if (scopes.length === 0) return entries.map((e) => e.path);
  const groups = groupFieldEntriesByDocument(entries);
  return groups.flatMap((g, i) => g.entries.map((e) => docStageKey(scopes[i], e.path)));
}

/** The keys a sheet draws, in the order it draws them. */
function drawnKeys(sheet: SpecSheet): string[] {
  const out: string[] = [];
  for (const r of sheet.resources) {
    for (const a of [r.kindAtom, r.nameAtom, r.apiVersionAtom]) if (a) out.push(a.key);
    for (const p of r.parts) {
      if (p.titleAtom) out.push(p.titleAtom.key);
      for (const b of p.blocks) for (const a of b.atoms) out.push(a.key);
    }
  }
  return out;
}

const counts = (keys: string[]) => {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

const YAML_FIXTURES: [string, string][] = [
  ['most-items', 'prod-released.yaml'],
  ['longest', 'prod-head.yaml'],
  ['changes', 'prod-head.yaml'],
  ['incoming', 'base-stale.yaml'],
  ['stress', 'prod-head.yaml'],
  ['stress-nodeploy', 'prod-head.yaml'],
];

test.describe('spec sheet model', () => {
  for (const [name, file] of YAML_FIXTURES) {
    test(`${name}: every leaf of the tree is drawn exactly once, with the tree's stage key`, () => {
      const data = fixture(name, file);
      const sheet = buildSpecSheet(data, { scopedWritesSupported: true });
      const drawn = drawnKeys(sheet);
      // Drawn once: the list of the model and the drawn list are one and the same.
      expect(drawn).toEqual(sheet.atoms.map((a) => a.key));
      expect(new Set(drawn).size).toBe(drawn.length);
      const emptyKeys = new Set(sheet.atoms.filter((a) => a.emptyContainer).map((a) => a.key));
      const leafKeys = drawn.filter((k) => !emptyKeys.has(k));
      expect(counts(leafKeys)).toEqual(counts(treeKeys(data)));
    });
  }

  test('most-items: resources, parts and blocks in the natural order', () => {
    const sheet = buildSpecSheet(fixture('most-items', 'prod-released.yaml'), { scopedWritesSupported: true });
    expect(sheet.resources).toHaveLength(1);
    const [deployment] = sheet.resources;
    expect(deployment.id).toBe('deployment-openclaw');
    expect(deployment.kind).toBe('Deployment');
    expect(deployment.name).toBe('openclaw');
    expect(deployment.apiVersion).toBe('apps/v1');
    expect(deployment.parts.map((p) => p.title)).toEqual(['Metadata', 'Spec', 'Pod', 'init-config', 'gateway', 'Volumes']);
    const gateway = deployment.parts.find((p) => p.title === 'gateway');
    expect(gateway?.id).toBe('deployment-openclaw-container-0');
    expect(gateway?.blocks.map((b) => b.label)).toEqual(['Ports', 'Security', 'Image', 'Command', 'Env', 'Resources', 'Probes', 'Mounts']);
    const metadata = deployment.parts[0];
    expect(metadata.blocks.map((b) => b.label)).toEqual(['Namespace', 'Labels', 'Annotations']);
    const spec = deployment.parts[1];
    expect(spec.blocks.map((b) => b.label)).toEqual(['Replicas', 'Selector', 'Strategy']);
  });

  test('an empty map and an empty list are atoms', () => {
    const sheet = buildSpecSheet('a:\n  b: {}\n  c: []\n  d: 1\n');
    expect(sheet.atoms.map((a) => [a.path, a.emptyContainer ?? null])).toEqual([
      ['a.b', 'map'],
      ['a.c', 'list'],
      ['a.d', null],
    ]);
  });

  test('integer-like keys keep the order they are written in', () => {
    const sheet = buildSpecSheet('apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: x\ndata:\n  b: "1"\n  "10": "2"\n  "2": "3"\n');
    const data = sheet.resources[0].parts.find((p) => p.title === 'Data');
    expect(data?.blocks[0].atoms.map((a) => a.path)).toEqual(['data.b', 'data.10', 'data.2']);
  });

  test('a key that comes back later in a part is a second block, never moved', () => {
    const sheet = buildSpecSheet('kind: Thing\nspec:\n  a: 1\n  b: 2\n  a2: 3\n');
    const spec = sheet.resources[0].parts.find((p) => p.title === 'Spec');
    expect(spec?.blocks.map((b) => b.key)).toEqual(['a', 'b', 'a2']);
  });

  test('two documents with the same path keep one stage key each', () => {
    const data = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: a\nspec:\n  type: ClusterIP\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: b\nspec:\n  type: ClusterIP\n';
    const sheet = buildSpecSheet(data, { scopedWritesSupported: true });
    const keys = sheet.atoms.filter((a) => a.path === 'spec.type').map((a) => a.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(counts(sheet.atoms.map((a) => a.key))).toEqual(counts(treeKeys(data)));
    expect(sheet.resources.map((r) => r.id)).toEqual(['service-a', 'service-b']);
  });

  test('a Unit that is not read as documents is one list of keys and values', () => {
    const sheet = buildSpecSheet('A=1\nB=2\n', { flatValues: new Map([['A', '1'], ['B', '2']]) });
    expect(sheet.atoms.map((a) => a.path)).toEqual(['A', 'B']);
  });

  test('no data, no sheet', () => {
    expect(buildSpecSheet('').resources).toEqual([]);
    expect(buildSpecSheet(undefined).atoms).toEqual([]);
  });
});

test('test ids follow the design: part, block and field words', () => {
  const sheet = buildSpecSheet(fixture('most-items', 'prod-released.yaml'), { scopedWritesSupported: true });
  const keys = new Set(sheet.atoms.map((a) => a.list?.testKey ?? a.testKey));
  for (const id of [
    'deployment-metadata-name',
    'deployment-spec-replicas',
    'container-gateway-image',
    'container-gateway-env-node-env',
    'container-gateway-resources-limits-cpu',
    'container-gateway-livenessprobe-exec-command',
    'pod-spec-securitycontext-fsgroup',
    'volumes-tmp-volume-emptydir',
  ]) {
    expect(keys.has(id), id).toBe(true);
  }
  const parts = sheet.resources[0].parts.map((p) => p.testKey);
  expect(parts).toEqual(['deployment-metadata', 'deployment-spec', 'pod', 'init-init-config', 'container-gateway', 'volumes']);
  const blocks = sheet.resources[0].parts.flatMap((p) => p.blocks.map((b) => b.testKey));
  for (const id of ['container-gateway-image', 'container-gateway-env', 'deployment-metadata-labels', 'deployment-spec-replicas', 'volumes-volumes']) {
    expect(blocks, id).toContain(id);
  }
  expect(new Set(sheet.atoms.map((a) => a.testKey)).size).toBe(sheet.atoms.length);
});

test('origin: set here only when this Unit set the value itself', async () => {
  const { originKindOf } = await import('../src/pages/x/apps/gates/gateOrigin');
  const hop = (UnitID: string, Source: string, extra = {}) => ({ UnitID, Source, ...extra });
  expect(originKindOf({ Chain: [hop('u', 'UpdateUnit')] }, 'u').kind).toBe('here');
  expect(originKindOf({ Chain: [hop('u', 'CloneUnit'), hop('base', 'MergeExternal')] }, 'u').kind).toBe('inherited');
  // Blame ends the chain at the merge hop here when the upstream cannot be read: not "here".
  expect(originKindOf({ Chain: [hop('u', 'UpgradeUnit')] }, 'u').kind).toBe('unreadable');
  expect(originKindOf({ Chain: [hop('u', 'UpdateUnit', { LinkUpstreamUnitID: 'x' })] }, 'u').kind).toBe('unreadable');
  expect(originKindOf({ Flags: ['SetByLink'], Chain: [hop('u', 'NeedsProvides')] }, 'u').kind).toBe('link');
  expect(originKindOf({}, 'u').kind).toBe('unreadable');
});

test('incoming additions: a key only upstream has, and a resource upstream adds whole', async () => {
  const { withIncomingAdditions } = await import('../src/pages/x/apps/spec-sheet/incomingAdditions');
  const data = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n';
  const sheet = buildSpecSheet(data, { scopedWritesSupported: true });
  const out = withIncomingAdditions(
    sheet,
    new Set(['spec.replicas', 'metadata.labels.tier']),
    [{ key: '\u0002pdb', wholeResource: 'added', resource: { ResourceType: 'policy/v1/PodDisruptionBudget', ResourceName: 'ns/web' } }],
    new Set(['\u0002pdb']),
  );
  const added = out.resources[0].parts.find((p) => p.title === 'Added upstream');
  expect(added?.blocks[0].atoms.map((a) => [a.path, a.added])).toEqual([['metadata.labels.tier', true]]);
  const whole = out.resources[1];
  expect(whole.kind).toBe('PodDisruptionBudget');
  expect(whole.whole).toEqual({ key: '\u0002pdb', change: 'added', available: true });
  // Nothing missing, nothing added: the same sheet back.
  expect(withIncomingAdditions(sheet, new Set(['spec.replicas']), [], new Set())).toBe(sheet);
});

test('variant values: the field is found by resource and path in each Variant', async () => {
  const { variantValues } = await import('../src/pages/x/apps/spec-sheet/variantValues');
  const doc = (name: string, replicas: number) =>
    `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\nspec:\n  replicas: ${replicas}\n`;
  const unit = (spaceId: string, data: string) => ({ slug: 'app', spaceId, unitId: `u-${spaceId}`, hasUpstream: true, data });
  const dep = (deploymentId: string, displayName: string) => ({ deploymentId, displayName }) as never;
  // base holds two Deployments with the same path; only the named one is read.
  const base = unit('base', `${doc('other', 9)}---\n${doc('web', 1)}`);
  const prod = unit('prod', doc('web', 3));
  const out = variantValues(
    { kind: 'Deployment', name: 'web', path: 'spec.replicas' },
    'app',
    'prod',
    [dep('base', 'base'), dep('prod', 'prod')],
    new Map([['base', [base]], ['prod', [prod]]]) as never,
  );
  expect(out.map((v) => [v.displayName, v.value, v.isCurrent])).toEqual([
    ['base', '1', false],
    ['prod', '3', true],
  ]);
});
