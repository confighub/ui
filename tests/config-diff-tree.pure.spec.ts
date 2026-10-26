// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `buildConfigDiffTree` and `summarizeConfigDiff` (configDiffTree.ts): how a
// server-computed `ConfigDiff` becomes the rows a diff view draws.
//
// The fixtures are what `GET .../unit/{id}/diff` returns, shape for shape. The server
// has already matched array elements by merge key, so what is tested here is that the
// tree keeps that matching visible: one row per changed path, labelled in path syntax,
// and no row for an element that only moved because another was inserted before it.
//
// Takes no `page` fixture and starts no browser:
//   cd ui && npx playwright test -c playwright.pure.config.ts config-diff-tree

import { expect, test } from '@playwright/test';

import type { ConfigDiff, PathChange, PathSegment } from '@confighub/rtk-query';

import {
  buildConfigDiffTree,
  changesNamingTheirElements,
  ORDER_LEAF_KEY,
  segmentLabel,
  serverPathContainer,
  serverPathField,
  serverPathLabels,
  resourceDiffLabel,
  summarizeConfigDiff,
} from '../src/components/config-diff/configDiffTree';
import type { DiffTreeNode } from '../src/pages/x/apps/diffTree';

const field = (name: string): PathSegment => ({ Field: name, FromIndex: -1, ToIndex: -1 });
const keyed = (key: string, value: string, fromIndex: number, toIndex: number): PathSegment => ({
  MergeKeys: [{ Key: key, Value: value }],
  FromIndex: fromIndex,
  ToIndex: toIndex,
});

const CONTAINER = [
  field('spec'),
  field('template'),
  field('spec'),
  field('containers'),
  keyed('name', 'web', 0, 0),
];
const CONTAINER_PATH = 'spec.template.spec.containers.?name=web';

const envVar = (changeType: 'Add' | 'Delete', name: string, value: string, fromIndex: number, toIndex: number): PathChange => ({
  ChangeType: changeType,
  DisplayPath: `${CONTAINER_PATH}.env.?name=${name}`,
  Segments: [...CONTAINER, field('env'), keyed('name', name, fromIndex, toIndex)],
  ...(changeType === 'Add'
    ? { ToValue: `name: ${name}\nvalue: ${value}` }
    : { FromValue: `name: ${name}\nvalue: ${value}` }),
});

/**
 * An image bump plus a reshuffled env list: three variables dropped from the front and
 * two added there, with the variables after them unchanged but at new positions.
 * Matched by position, every one of those later variables reads as changed.
 */
const ENV_CHANGES: PathChange[] = [
  {
    ChangeType: 'Update',
    DisplayPath: `${CONTAINER_PATH}.image`,
    Segments: [...CONTAINER, field('image')],
    FromValue: 'registry.example.com/web:1.4.0',
    ToValue: 'registry.example.com/web:1.5.0',
  },
  envVar('Delete', 'AUTH_MODE', 'bearer', 0, -1),
  envVar('Delete', 'API_URL', 'https://api.example.com', 1, -1),
  envVar('Delete', 'OAUTH_CLIENT_ID', 'client-123', 2, -1),
  envVar('Add', 'URL', 'https://api.example.com', -1, 0),
  envVar('Add', 'UI_OAUTH_CLIENT_ID', 'client-123', -1, 1),
];

/** Every leaf, with the labels from the root down to it joined into a path. */
function leafPaths(nodes: DiffTreeNode[], prefix = ''): { path: string; node: DiffTreeNode }[] {
  return nodes.flatMap((node) => {
    const path = prefix ? `${prefix}.${node.key}` : node.key;
    return node.type === 'leaf' ? [{ path, node }] : leafPaths(node.children ?? [], path);
  });
}

test.describe('config diff tree', () => {
  test('an env list with insertions and removals is one row per variable', () => {
    const tree = buildConfigDiffTree(ENV_CHANGES);

    expect(tree).toHaveLength(1);
    expect(tree[0].key).toBe(CONTAINER_PATH);
    expect(tree[0].children?.map((c) => `${c.type}:${c.key}`)).toEqual(['leaf:image', 'folder:env']);

    const env = tree[0].children![1];
    expect(env.children?.map((c) => c.key)).toEqual([
      '?name=AUTH_MODE',
      '?name=API_URL',
      '?name=OAUTH_CLIENT_ID',
      '?name=URL',
      '?name=UI_OAUTH_CLIENT_ID',
    ]);
    expect(env.children!.every((c) => c.type === 'leaf')).toBe(true);
  });

  test('a row path is the server display path', () => {
    const leaves = leafPaths(buildConfigDiffTree(ENV_CHANGES));
    expect(leaves.map((l) => l.path)).toEqual(ENV_CHANGES.map((c) => c.DisplayPath));
  });

  test('an added or deleted path has a placeholder on the side it is absent from', () => {
    const leaves = leafPaths(buildConfigDiffTree(ENV_CHANGES));
    const byPath = new Map(leaves.map((l) => [l.path, l.node]));

    expect(byPath.get(`${CONTAINER_PATH}.env.?name=AUTH_MODE`)?.diff).toEqual({
      oldValue: 'name: AUTH_MODE\nvalue: bearer',
      newValue: '-',
    });
    expect(byPath.get(`${CONTAINER_PATH}.env.?name=URL`)?.diff).toEqual({
      oldValue: '-',
      newValue: 'name: URL\nvalue: https://api.example.com',
    });
  });

  test('only a block value is preformatted', () => {
    const leaves = leafPaths(buildConfigDiffTree(ENV_CHANGES));
    const byPath = new Map(leaves.map((l) => [l.path, l.node]));

    expect(byPath.get(`${CONTAINER_PATH}.image`)?.preformatted).toBeUndefined();
    expect(byPath.get(`${CONTAINER_PATH}.env.?name=URL`)?.preformatted).toBe(true);
  });

  test('a reorder is a row inside the array it reorders', () => {
    const tree = buildConfigDiffTree([
      {
        ChangeType: 'Reorder',
        DisplayPath: `${CONTAINER_PATH}.env`,
        Segments: [...CONTAINER, field('env')],
        FromValue: '- A\n- B',
        ToValue: '- B\n- A',
      },
      {
        ChangeType: 'Update',
        DisplayPath: `${CONTAINER_PATH}.env.?name=A.value`,
        Segments: [...CONTAINER, field('env'), keyed('name', 'A', 0, 1), field('value')],
        FromValue: '1',
        ToValue: '2',
      },
    ]);

    const leaves = leafPaths(tree);
    expect(leaves.map((l) => l.path)).toEqual([
      `${CONTAINER_PATH}.env.${ORDER_LEAF_KEY}`,
      `${CONTAINER_PATH}.env.?name=A.value`,
    ]);
    // Both orders hold the same keys, so there are no changed tokens to highlight.
    expect(leaves.map((l) => l.node.wholeValues)).toEqual([true, undefined]);
  });

  test('a rename is a row for the merge key, under the element as it is now named', () => {
    const renamed = [...CONTAINER.slice(0, 2), field('spec'), field('initContainers'), keyed('name', 'db-init-v2', 0, 0)];
    const tree = buildConfigDiffTree([
      {
        ChangeType: 'Rename',
        DisplayPath: 'spec.template.spec.initContainers.?name=db-init-v2',
        Segments: renamed,
        FromValue: 'db-init',
        ToValue: 'db-init-v2',
      },
      {
        ChangeType: 'Update',
        DisplayPath: 'spec.template.spec.initContainers.?name=db-init-v2.image',
        Segments: [...renamed, field('image')],
        FromValue: 'db:1',
        ToValue: 'db:2',
      },
    ]);

    const leaves = leafPaths(tree);
    expect(leaves.map((l) => l.path)).toEqual([
      'spec.template.spec.initContainers.?name=db-init-v2.name',
      'spec.template.spec.initContainers.?name=db-init-v2.image',
    ]);
    expect(leaves[0].node.diff).toEqual({ oldValue: 'db-init', newValue: 'db-init-v2' });
  });

  test('a comment is a row beside the node it annotates', () => {
    const tree = buildConfigDiffTree([
      {
        ChangeType: 'Add',
        Comment: 'Head',
        DisplayPath: 'kind',
        Segments: [field('kind')],
        ToValue: 'what this ConfigMap is for',
      },
      {
        ChangeType: 'Update',
        DisplayPath: 'kind',
        Segments: [field('kind')],
        FromValue: 'ConfigMap',
        ToValue: 'Secret',
      },
      {
        ChangeType: 'Update',
        Comment: 'Line',
        DisplayPath: `${CONTAINER_PATH}.image`,
        Segments: [...CONTAINER, field('image')],
        FromValue: 'pinned',
        ToValue: 'pinned for the release',
      },
      { ChangeType: 'Add', Comment: 'Head', DisplayPath: '', Segments: [], ToValue: '# about this resource' },
    ]);

    expect(leafPaths(tree).map((l) => l.path)).toEqual([
      'kind (head comment)',
      'kind',
      `${CONTAINER_PATH}.image (line comment)`,
      '(head comment on the resource)',
    ]);
  });

  test('context is dimmed rows around the changes, and is not counted', () => {
    const changes: PathChange[] = [
      { ChangeType: 'None', DisplayPath: 'spec.replicas', Segments: [field('spec'), field('replicas')], ToValue: '2' },
      ...ENV_CHANGES.slice(0, 1),
      {
        ChangeType: 'None',
        DisplayPath: `${CONTAINER_PATH}.env`,
        Segments: [...CONTAINER, field('env')],
        ToValue: '- name: A\n  value: a',
      },
    ];
    const leaves = leafPaths(buildConfigDiffTree(changes));
    expect(leaves.map((l) => `${l.node.context ? 'context' : 'change'} ${l.path}`)).toEqual([
      'context spec.replicas',
      `change ${CONTAINER_PATH}.image`,
      `context ${CONTAINER_PATH}.env`,
    ]);
    expect(leaves[0].node.diff).toEqual({ oldValue: '2', newValue: '2' });

    const diff: ConfigDiff = {
      Resources: [{ ChangeType: 'Update', Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'ns/web' }, Changes: changes }],
    };
    expect(summarizeConfigDiff(diff)).toEqual({ additions: 0, deletions: 0, changes: 1, total: 1 });
  });

  test('segments are labelled in path syntax', () => {
    expect(segmentLabel(field('app.kubernetes.io/name'))).toBe('app~1kubernetes~1io/name');
    expect(segmentLabel({ FromIndex: 2, ToIndex: 3 })).toBe('3');
    expect(segmentLabel({ FromIndex: 2, ToIndex: -1 })).toBe('2');
    expect(
      segmentLabel({
        MergeKeys: [
          { Key: 'containerPort', Value: '8080' },
          { Key: 'protocol', Value: 'TCP' },
        ],
        FromIndex: 0,
        ToIndex: 0,
      }),
    ).toBe('?containerPort=8080,protocol=TCP');
  });

  test('the summary counts changed paths, and a whole resource as one', () => {
    const diff: ConfigDiff = {
      Resources: [
        { ChangeType: 'Update', Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'ns/web' }, Changes: ENV_CHANGES },
        { ChangeType: 'Add', Resource: { ResourceType: 'v1/Service', ResourceName: 'ns/web' }, ToValue: 'kind: Service' },
        { ChangeType: 'Delete', Resource: { ResourceType: 'v1/ConfigMap', ResourceName: 'ns/old' }, FromValue: 'kind: ConfigMap' },
      ],
    };

    expect(summarizeConfigDiff(diff)).toEqual({ additions: 3, deletions: 4, changes: 1, total: 8 });
    expect(summarizeConfigDiff(undefined)).toEqual({ additions: 0, deletions: 0, changes: 0, total: 0 });
  });

  test('a resource heading leaves out the placeholders of a resource that names nothing', () => {
    expect(resourceDiffLabel({ ResourceType: 'apps/v1/Deployment', ResourceName: 'app/web' })).toBe('apps/v1/Deployment app/web');
    expect(resourceDiffLabel({ ResourceType: 'NoSchema', ResourceName: 'NoName' })).toBe('');
    expect(resourceDiffLabel({ ResourceType: 'NoSchema', ResourceName: 'policy' })).toBe('policy');
  });
});

test.describe('values a merge kept', () => {
  test('a server path reads as the labels the diff gives its segments', () => {
    expect(serverPathLabels('spec.template.spec.containers.?name=api;@0.resources.limits.memory')).toEqual([
      'spec', 'template', 'spec', 'containers', '?name=api', 'resources', 'limits', 'memory',
    ]);
    // A merge key's value can hold a dot; it runs to the position, and its dots are escaped as the diff's are.
    expect(serverPathLabels('items.?name=my.app;@2.value')).toEqual(['items', '?name=my~1app', 'value']);
    expect(serverPathLabels('data.RETRY_LIMIT')).toEqual(['data', 'RETRY_LIMIT']);
  });

  test('a kept value is a leaf beside the changes under the same folders', () => {
    const kept = {
      path: `${CONTAINER_PATH.replace('?name=web', '?name=web;@0')}.resources.limits.memory`,
      value: '1Gi',
      incoming: '768Mi',
      label: 'kept on merge',
    };
    const leaves = leafPaths(buildConfigDiffTree(ENV_CHANGES.slice(0, 1), [kept]));
    expect(leaves.map((leaf) => leaf.path)).toEqual([
      `${CONTAINER_PATH}.image`,
      `${CONTAINER_PATH}.resources.limits.memory`,
    ]);
    const memory = leaves[1].node;
    expect(memory.kept).toEqual(kept);
    expect(memory.diff).toEqual({ oldValue: '1Gi', newValue: '1Gi' });
  });

  test('no kept values builds the same tree as before', () => {
    expect(buildConfigDiffTree(ENV_CHANGES, [])).toEqual(buildConfigDiffTree(ENV_CHANGES));
  });
});

test.describe('reading a server path', () => {
  test('its last field, past any merge-keyed element', () => {
    expect(serverPathField('spec.template.spec.containers.?name=api;@0.resources.limits.memory')).toBe('memory');
    expect(serverPathField('spec.env.?name=FOO;@3')).toBe('env');
    expect(serverPathField('data.RETRY_LIMIT')).toBe('RETRY_LIMIT');
  });

  test('the container it runs through, by name, dots and all', () => {
    expect(serverPathContainer('spec.template.spec.initContainers.?name=migrate;@0.image')).toBe('migrate');
    expect(serverPathContainer('spec.template.spec.containers.?name=my.app;@1.image')).toBe('my.app');
    expect(serverPathContainer('data.RETRY_LIMIT')).toBeUndefined();
  });
});

test.describe('naming a list element known only by its index', () => {
  const indexed = (i: number): PathSegment => ({ FromIndex: i, ToIndex: i });
  const at = (changeType: PathChange['ChangeType'], segments: PathSegment[], from: string, to: string): PathChange => ({
    ChangeType: changeType,
    DisplayPath: segments.map(segmentLabel).join('.'),
    Segments: segments,
    FromValue: from,
    ToValue: to,
  });
  const PORT = [field('spec'), field('ports'), indexed(1)];

  test('an element with a change keeps its unchanged name beside the change', () => {
    const changes = [
      at('None', [...PORT, field('name')], 'metrics', 'metrics'),
      at('Update', [...PORT, field('port')], '9090', '9091'),
      at('None', [...PORT, field('protocol')], 'TCP', 'TCP'),
    ];
    const kept = changesNamingTheirElements(changes);
    expect(kept.map((change) => change.DisplayPath)).toEqual(['spec.ports.1.name', 'spec.ports.1.port']);
    const rows = leafPaths(buildConfigDiffTree(kept));
    expect(rows.map((row) => [row.path, row.node.context === true])).toEqual([
      ['spec.ports.1.name', true],
      ['spec.ports.1.port', false],
    ]);
  });

  test('name wins; otherwise the first key-like field, label included', () => {
    const withKey = [
      at('None', [...PORT, field('key')], 'a', 'a'),
      at('None', [...PORT, field('name')], 'b', 'b'),
      at('Update', [...PORT, field('value')], '1', '2'),
    ];
    expect(changesNamingTheirElements(withKey).map((c) => c.DisplayPath)).toEqual(['spec.ports.1.name', 'spec.ports.1.value']);
    const withLabel = [at('None', [...PORT, field('label')], 'x', 'x'), at('Update', [...PORT, field('value')], '1', '2')];
    expect(changesNamingTheirElements(withLabel).map((c) => c.DisplayPath)).toEqual(['spec.ports.1.label', 'spec.ports.1.value']);
  });

  test('no naming row when the name itself changed, for an untouched element, or for a merge-keyed one', () => {
    const renamed = [at('Update', [...PORT, field('name')], 'a', 'b'), at('None', [...PORT, field('key')], 'k', 'k')];
    expect(changesNamingTheirElements(renamed).map((c) => c.DisplayPath)).toEqual(['spec.ports.1.name', 'spec.ports.1.key']);
    const untouched = [at('None', [...PORT, field('name')], 'a', 'a'), at('Update', [field('spec'), field('replicas')], '3', '4')];
    expect(changesNamingTheirElements(untouched).map((c) => c.DisplayPath)).toEqual(['spec.replicas']);
    const merged = [
      at('None', [...CONTAINER, field('name')], 'web', 'web'),
      at('Update', [...CONTAINER, field('image')], 'a:1', 'a:2'),
    ];
    expect(changesNamingTheirElements(merged).map((c) => c.Segments?.at(-1)?.Field)).toEqual(['image']);
  });
});
