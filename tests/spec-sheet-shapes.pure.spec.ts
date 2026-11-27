// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The spec sheet's shape registry: first match wins, the Kubernetes shapes only draw the
// blocks of a workload's parts, and anything else falls to the generic key and value shape.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHAPE_MATCHERS, shapeIdFor } from '../src/pages/x/apps/spec-sheet/shapes/shapeMatch';
import { buildSpecSheet } from '../src/pages/x/apps/spec-sheet/specSheetModel';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'spec-sheet',
);
const fixture = (name: string, file: string) =>
  fs.readFileSync(path.join(FIXTURES, name, file), 'utf8');

/** Block test key → the id of the shape that draws it. */
function shapesOf(data: string): Map<string, string> {
  const sheet = buildSpecSheet(data, { scopedWritesSupported: true });
  const out = new Map<string, string>();
  for (const r of sheet.resources) {
    for (const p of r.parts) {
      for (const b of p.blocks) {
        out.set(
          b.testKey,
          shapeIdFor({ resourceKind: r.kind, partKind: p.kind, blockKey: b.key }),
        );
      }
    }
  }
  return out;
}

test.describe('spec sheet shapes', () => {
  test('the registry is in its order, with the generic shape last', () => {
    expect(SHAPE_MATCHERS.map((s) => s.id)).toEqual([
      'image',
      'command',
      'ports',
      'env',
      'resources',
      'probes',
      'mounts',
      'security',
      'volumes',
      'tokens',
      'pairs',
      'key-value',
    ]);
    // The last entry matches everything.
    expect(shapeIdFor({ resourceKind: 'Anything', partKind: 'section', blockKey: 'x' })).toBe(
      'key-value',
    );
  });

  test('most-items: each block is drawn by its shape', () => {
    const shapes = shapesOf(fixture('most-items', 'prod-released.yaml'));
    expect(Object.fromEntries(shapes)).toEqual({
      'deployment-metadata-namespace': 'key-value',
      'deployment-metadata-labels': 'tokens',
      'deployment-metadata-annotations': 'tokens',
      'deployment-spec-replicas': 'key-value',
      'deployment-spec-selector': 'tokens',
      'deployment-spec-strategy': 'pairs',
      'pod-labels': 'tokens',
      'pod-annotations': 'tokens',
      'pod-security': 'security',
      'init-init-config-security': 'security',
      'init-init-config-image': 'image',
      'init-init-config-command': 'command',
      'init-init-config-resources': 'resources',
      'init-init-config-mounts': 'mounts',
      'container-gateway-ports': 'ports',
      'container-gateway-security': 'security',
      'container-gateway-image': 'image',
      'container-gateway-command': 'command',
      'container-gateway-env': 'env',
      'container-gateway-resources': 'resources',
      'container-gateway-probes': 'probes',
      'container-gateway-mounts': 'mounts',
      'volumes-volumes': 'volumes',
    });
  });

  test('a custom resource with image, resources and env keys falls to the generic shape', () => {
    const crd = [
      'apiVersion: example.com/v1',
      'kind: Workload',
      'metadata:',
      '  name: look-alike',
      '  labels:',
      '    app: look-alike',
      'spec:',
      '  image: nginx:1.27',
      '  resources:',
      '    limits:',
      '      cpu: 1',
      '  env:',
      '    - name: A',
      '      value: b',
      '  selector:',
      '    matchLabels:',
      '      app: look-alike',
      '  strategy:',
      '    type: Recreate',
      '  template:',
      '    spec:',
      '      containers:',
      '        - name: c',
      '          image: nginx:1.27',
      '          env:',
      '            - name: A',
      '              value: b',
      '',
    ].join('\n');
    const shapes = shapesOf(crd);
    expect(shapes.size).toBeGreaterThan(0);
    for (const [block, id] of shapes) {
      // Metadata labels are tokens for any kind; nothing else of the custom resource is shaped.
      expect(id, block).toBe(block.endsWith('metadata-labels') ? 'tokens' : 'key-value');
    }
  });

  test('the container shapes need a workload kind and a container part', () => {
    for (const blockKey of [
      'image',
      'command',
      'ports',
      'env',
      'resources',
      'probes',
      'mounts',
    ]) {
      expect(shapeIdFor({ resourceKind: 'Deployment', partKind: 'container', blockKey })).toBe(
        blockKey,
      );
      expect(shapeIdFor({ resourceKind: 'Pod', partKind: 'init', blockKey })).toBe(blockKey);
      expect(shapeIdFor({ resourceKind: 'Workload', partKind: 'container', blockKey })).toBe(
        'key-value',
      );
      expect(shapeIdFor({ resourceKind: 'Deployment', partKind: 'spec', blockKey })).toBe(
        'key-value',
      );
      expect(shapeIdFor({ partKind: 'container', blockKey })).toBe('key-value');
    }
    // A Service's selector is tokens and its ports are port tokens; its other spec keys are not shaped.
    expect(
      shapeIdFor({ resourceKind: 'Service', partKind: 'spec', blockKey: 'selector' }),
    ).toBe('tokens');
    expect(shapeIdFor({ resourceKind: 'Service', partKind: 'spec', blockKey: 'ports' })).toBe('ports');
    expect(shapeIdFor({ resourceKind: 'Service', partKind: 'spec', blockKey: 'type' })).toBe('key-value');
    expect(
      shapeIdFor({ resourceKind: 'Service', partKind: 'metadata', blockKey: 'annotations' }),
    ).toBe('tokens');
    expect(
      shapeIdFor({ resourceKind: 'ConfigMap', partKind: 'section', blockKey: 'data' }),
    ).toBe('key-value');
  });
});
