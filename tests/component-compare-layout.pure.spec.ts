// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// How the compare grid decides what goes on a folder row, what goes on a leaf,
// and which leaves are hoisted out of the grid into the image rows above it.
//
// WHY THIS IS WORTH ASSERTING. The grid once had its own two-level folder rule —
// emit a row where a subtree branches AND owns a leaf — which looked like a
// density choice and was actually a flattening: it lost the nesting, built
// composite leaf keys, and ordered siblings by discovery rather than by tree.
// The rule now is the shipped one, from `diffTree.ts`: nest fully, and always
// collapse single-child chains so one leaf five levels down does not cost five
// rows of empty folders.
//
// The image hoist is asserted for a different reason. It reads the IDENTITY
// path, so it must keep working when a deployment carries an extra container and
// the indices no longer line up — which is exactly the case `imageRef.ts`'s own
// positional `parseImagePath` warns it cannot handle.

import { expect, test } from '@playwright/test';

import { containerImageOf } from '../src/pages/x/apps/compare/containerImagePaths';
import {
  buildCompareResult,
  type CompareFolderRow,
  type CompareLeafRow,
} from '../src/pages/x/apps/compare/deploymentCompareModel';

const DOC = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
  labels:
    app: payments-api
spec:
  replicas: 6
  selector:
    matchLabels:
      app: payments-api
  template:
    spec:
      dnsPolicy: ClusterFirst
      containers:
        - name: api
          image: ghcr.io/confighubai/api:v0.4.15
          ports:
            - containerPort: 8080
        - name: otel
          image: ghcr.io/confighubai/otel:v1.9.2
`;

function build(a: string, b: string) {
  return buildCompareResult(
    [
      { deploymentId: 'a', label: 'a', data: a },
      { deploymentId: 'b', label: 'b', data: b },
    ],
  );
}

const RESULT = build(DOC, DOC);
const ROWS = RESULT.groups[0]?.rows ?? [];
const FOLDERS = ROWS.filter((row): row is CompareFolderRow => row.type === 'folder');
const LEAVES = ROWS.filter((row): row is CompareLeafRow => row.type === 'leaf');

function leafKeyOf(identityPath: string): string {
  const leaf = LEAVES.find((row) => row.identityPath === identityPath);
  if (!leaf) throw new Error(`no leaf at ${identityPath}`);
  return leaf.leafKey;
}

test.describe('folder rows', () => {
  test('a folder is emitted for every level the document has', () => {
    // These once asserted a local two-level rule — branches-and-owns-a-leaf —
    // which is the rule that flattened the grid. The grid now uses the same
    // builder the shipped trees use, so what is asserted is real nesting.
    const labels = FOLDERS.map((folder) => folder.label);
    expect(labels).toContain('metadata');
    expect(labels).toContain('spec');
    expect(Math.max(...ROWS.map((row) => row.depth))).toBeGreaterThan(1);
  });

  test('a single-child chain collapses into one folder, always', () => {
    // `template` → `spec` and `selector` → `matchLabels` are each a single-child
    // run and each costs ONE row labelled with the whole chain. `spec` itself
    // branches, so it stays a folder of its own — collapsing is about chains,
    // not about depth.
    const labels = FOLDERS.map((folder) => folder.label);
    expect(labels, `folders were: ${labels.join(', ')}`).toContain('template.spec');
    expect(labels).toContain('selector.matchLabels');
    expect(labels).toContain('spec');

    // And the containers below it are siblings at one level, not a chain.
    const containers = FOLDERS.filter((folder) => folder.label.startsWith('containers['));
    expect(containers).toHaveLength(2);
    expect(new Set(containers.map((folder) => folder.depth)).size).toBe(1);
  });

  test('a leaf key is its own key, not a dotted composite', () => {
    expect(leafKeyOf('metadata.labels.app')).toBe('app');
    expect(leafKeyOf('spec.selector.matchLabels.app')).toBe('app');
    expect(leafKeyOf('spec.template.spec.containers[api].ports[8080].containerPort')).toBe(
      'containerPort',
    );
  });

  test('every leaf names a folder that is actually on the grid', () => {
    const emitted = new Set(FOLDERS.map((folder) => folder.identityPath));
    for (const leaf of LEAVES) {
      if (leaf.folderPath === '') continue;
      expect(emitted.has(leaf.folderPath)).toBe(true);
    }
  });

  test('a folder is opened once, not reopened by a path only a later column carries', () => {
    const extra = DOC.replace(
      '        - name: otel',
      '        - name: debug\n          image: ghcr.io/confighubai/debug:v0.3.0\n        - name: otel',
    );
    const rows = build(DOC, extra).groups[0]?.rows ?? [];
    const seen = rows
      .filter((row): row is CompareFolderRow => row.type === 'folder')
      .map((row) => row.identityPath);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

test.describe('the image hoist', () => {
  test('a container image is recognised by its container name', () => {
    const api = LEAVES.find(
      (row) => row.identityPath === 'spec.template.spec.containers[api].image',
    );
    expect(api).toBeDefined();
    expect(containerImageOf(api as CompareLeafRow)).toEqual({
      list: 'containers',
      container: 'api',
    });
  });

  test('a field that merely ends in something else is not hoisted', () => {
    const name = LEAVES.find(
      (row) => row.identityPath === 'spec.template.spec.containers[api].name',
    );
    expect(containerImageOf(name as CompareLeafRow)).toBeNull();

    const replicas = LEAVES.find((row) => row.identityPath === 'spec.replicas');
    expect(containerImageOf(replicas as CompareLeafRow)).toBeNull();
  });

  test('it still recognises the container when one deployment holds an extra one', () => {
    const extra = DOC.replace(
      '      containers:\n        - name: api',
      '      containers:\n        - name: debug\n          image: ghcr.io/confighubai/debug:v0.3.0\n        - name: api',
    );
    const leaves = (build(DOC, extra).groups[0]?.rows ?? []).filter(
      (row): row is CompareLeafRow => row.type === 'leaf',
    );
    const hoisted = leaves
      .map(containerImageOf)
      .filter((image): image is { list: string; container: string } => image !== null)
      .map((image) => image.container)
      .sort();
    expect(hoisted).toEqual(['api', 'debug', 'otel']);
  });
});
