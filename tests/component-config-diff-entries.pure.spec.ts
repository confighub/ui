// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `fieldDiffsFromConfigDiff` and `resolveConflictPath` (configDiffFieldDiffs.ts): how a
// server-computed `ConfigDiff`, and a merge conflict's path, become rows of the
// Component view's value tree, keyed as the tree keys its rows.
//
// The expected keys are not written out by hand. They come from `computeDocumentScopes`
// and `docStageKey` over the same configuration, which is what the tree builds its stage
// keys from, so a key here that the tree would not compute fails.
//
// The fixtures are hand-written in the shape the server returns: Segments with
// FromIndex/ToIndex, merge keys, YAML blocks with their data types.
//
// Takes no `page` fixture and starts no browser:
//   cd ui && npx playwright test -c playwright.pure.config.ts component-config-diff-entries

import { expect, test } from '@playwright/test';

import type { ConfigDiff, ExtendedUnitRead, MutationConflict, PathChange, PathSegment, ResourceDiff, UnitRead } from '@confighub/rtk-query';

import {
  fieldDiffsFromConfigDiff,
  isWholeResourceChange,
  resolveConflictPath,
  type ConfigDiffRow,
  type KeyedFieldDiff,
} from '../src/pages/x/apps/configDiffFieldDiffs';
import { parseUnitData, parseUnitDataStructured } from '../src/pages/x/apps/configParser';
import { computeDocumentScopes, docStageKey } from '../src/pages/x/apps/diffTree';
import {
  availableWholeResourceChanges,
  blockedDeleteKey,
  buildUpgradeEntries,
  buildVariationEntries,
  countUpgradableBadgeFields,
  type VariationDiffs,
} from '../src/pages/x/apps/entryBuilders';
import type { MergedUnit, VariationEntry } from '../src/pages/x/apps/componentTypes';

// ── Builders ────────────────────────────────────────────────────────────────

const field = (name: string): PathSegment => ({ Field: name, FromIndex: -1, ToIndex: -1 });
const keyed = (key: string, value: string, fromIndex: number, toIndex: number): PathSegment => ({
  MergeKeys: [{ Key: key, Value: value }],
  FromIndex: fromIndex,
  ToIndex: toIndex,
});
const fields = (...names: string[]) => names.map(field);

const DEPLOYMENT = { ResourceType: 'apps/v1/Deployment', ResourceName: 'prod/web' };
const SERVICE = { ResourceType: 'v1/Service', ResourceName: 'prod/web' };

const DEPLOYMENT_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: prod
  labels:
    app: web
    app.kubernetes.io/name: web
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: web
          image: web:1.4.0
          env:
            - name: A
              value: "1"
            - name: B
              value: "2"
            - name: C
              value: "3"
`;

const SERVICE_YAML = `apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: prod
  labels:
    app: web
spec:
  ports:
    - port: 80
`;

const TWO_DOCS = `${DEPLOYMENT_YAML}---\n${SERVICE_YAML}`;

const CONTAINER = [...fields('spec', 'template', 'spec', 'containers'), keyed('name', 'web', 0, 0)];

const update = (resource: ResourceDiff['Resource'], changes: PathChange[], extra: Partial<ResourceDiff> = {}): ResourceDiff => ({
  Resource: resource,
  ChangeType: 'Update',
  Changes: changes,
  ...extra,
});

/** The stage key the tree builds for `path` in the document at `documentIndex` of `data`. */
function treeKey(data: string, documentIndex: number, path: string): string {
  const scopes = computeDocumentScopes(parseUnitDataStructured(data));
  return docStageKey(scopes[documentIndex], path);
}

function leafRows(rows: ConfigDiffRow[]): KeyedFieldDiff[] {
  return rows.filter((row): row is KeyedFieldDiff => !isWholeResourceChange(row));
}

// ── Documents ───────────────────────────────────────────────────────────────

test.describe('document keys', () => {
  test('a path two documents share gives each its own key', () => {
    const labelChange = (from: string, to: string): PathChange => ({
      ChangeType: 'Update',
      Path: 'metadata.labels.app',
      Segments: fields('metadata', 'labels', 'app'),
      FromValue: from,
      FromDataType: 'string',
      ToValue: to,
      ToDataType: 'string',
    });
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [labelChange('web', 'web-d')]), update(SERVICE, [labelChange('web', 'web-s')])],
    };

    const rows = leafRows(fieldDiffsFromConfigDiff(diff, TWO_DOCS, { treeSide: 'from' }));

    expect(rows).toEqual([
      {
        key: treeKey(TWO_DOCS, 0, 'metadata.labels.app'),
        path: 'metadata.labels.app',
        resolvedPath: 'metadata.labels.app',
        oldValue: 'web',
        newValue: 'web-d',
        oldValueType: 'string',
        newValueType: 'string',
        kind: 'Update',
      },
      {
        key: treeKey(TWO_DOCS, 1, 'metadata.labels.app'),
        path: 'metadata.labels.app',
        resolvedPath: 'metadata.labels.app',
        oldValue: 'web',
        newValue: 'web-s',
        oldValueType: 'string',
        newValueType: 'string',
        kind: 'Update',
      },
    ]);
    expect(rows[0].key).not.toBe(rows[1].key);
    expect(rows[0].key).toContain('\u0001');
  });

  test('a single-document Unit keys its rows on bare paths', () => {
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Update',
        Segments: fields('spec', 'replicas'),
        FromValue: '2',
        FromDataType: 'int',
        ToValue: '3',
        ToDataType: 'int',
      }])],
    };

    const rows = leafRows(fieldDiffsFromConfigDiff(diff, DEPLOYMENT_YAML, { treeSide: 'from' }));

    expect(rows.map((r) => r.key)).toEqual(['spec.replicas']);
    expect(treeKey(DEPLOYMENT_YAML, 0, 'spec.replicas')).toBe('spec.replicas');
  });

  test('a resource whose namespace set-namespace changed still finds its document', () => {
    // Upstream's placeholder namespace against the variant's: the name without the
    // namespace names one Deployment, and the type keeps it off the Service.
    const diff: ConfigDiff = {
      Resources: [update({ ResourceType: 'apps/v1/Deployment', ResourceName: 'confighubplaceholder/web' }, [{
        ChangeType: 'Update',
        Segments: fields('spec', 'replicas'),
        FromValue: '2',
        FromDataType: 'int',
        ToValue: '5',
        ToDataType: 'int',
      }])],
    };

    const rows = leafRows(fieldDiffsFromConfigDiff(diff, TWO_DOCS, { treeSide: 'to' }));

    expect(rows.map((r) => r.key)).toEqual([treeKey(TWO_DOCS, 0, 'spec.replicas')]);
  });

  test('the From side is matched by PreviousResource, the To side by Resource', () => {
    const renamed = update(
      { ResourceType: 'apps/v1/Deployment', ResourceName: 'prod/web-v2' },
      [{ ChangeType: 'Update', Segments: fields('metadata', 'name'), FromValue: 'web', FromDataType: 'string', ToValue: 'web-v2', ToDataType: 'string' }],
      { PreviousResource: DEPLOYMENT },
    );
    const diff: ConfigDiff = { Resources: [renamed] };

    expect(leafRows(fieldDiffsFromConfigDiff(diff, TWO_DOCS, { treeSide: 'from' })).map((r) => r.key))
      .toEqual([treeKey(TWO_DOCS, 0, 'metadata.name')]);
    // No document of this tree is `web-v2`: a row the tree cannot draw is not returned.
    expect(fieldDiffsFromConfigDiff(diff, TWO_DOCS, { treeSide: 'to' })).toEqual([]);
  });
});

// ── Array elements ──────────────────────────────────────────────────────────

test.describe('array elements', () => {
  test('an env var inserted in the middle of the list is one added element', () => {
    // X goes in between A and B. B and C move from 1,2 to 2,3, but the server matched
    // them by name, so they are not changes; only X is.
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Add',
        Path: 'spec.template.spec.containers.?name=web;@0.env.?name=X;@1',
        Segments: [...CONTAINER, field('env'), keyed('name', 'X', -1, 1)],
        ToValue: 'name: X\nvalue: x',
        ToDataType: 'YAML',
      }])],
    };

    const rows = leafRows(fieldDiffsFromConfigDiff(diff, TWO_DOCS, { treeSide: 'from' }));

    const env = 'spec.template.spec.containers.0.env';
    // Written, it goes after A, the element it follows upstream.
    const insertion = { arrayPath: env, index: 3, after: 0, order: 1 };
    expect(rows).toEqual([
      { key: treeKey(TWO_DOCS, 0, `${env}.3.name`), path: `${env}.3.name`, oldValue: '-', newValue: 'X', newValueType: 'string', kind: 'Add', insertion },
      { key: treeKey(TWO_DOCS, 0, `${env}.3.value`), path: `${env}.3.value`, oldValue: '-', newValue: 'x', newValueType: 'string', kind: 'Add', insertion },
    ]);
    // One element: every row is under the one made-up index after the last element.
    expect(new Set(rows.map((r) => r.path.split('.').slice(0, 7).join('.')))).toEqual(new Set([`${env}.3`]));
  });

  test('two insertions into one array take successive indices, and one element keeps its index', () => {
    const add = (name: string, toIndex: number, leaf: string, value: string): PathChange => ({
      ChangeType: 'Add',
      Segments: [...CONTAINER, field('env'), keyed('name', name, -1, toIndex), field(leaf)],
      ToValue: value,
      ToDataType: 'string',
    });
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [add('X', 0, 'name', 'X'), add('Y', 1, 'name', 'Y'), add('X', 0, 'value', 'x')])],
    };

    const paths = leafRows(fieldDiffsFromConfigDiff(diff, DEPLOYMENT_YAML, { treeSide: 'from' })).map((r) => r.path);

    const env = 'spec.template.spec.containers.0.env';
    expect(paths).toEqual([`${env}.3.name`, `${env}.4.name`, `${env}.3.value`]);
  });

  test('an element absent on the tree side is found by merge key in the tree', () => {
    // The tree is not the diff's To side (the post-upgrade variation): B is deleted on
    // the To side but still in the tree, at index 1.
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Delete',
        Segments: [...CONTAINER, field('env'), keyed('name', 'B', 4, -1)],
        FromValue: 'name: B\nvalue: "2"',
        FromDataType: 'YAML',
      }])],
    };

    const rows = leafRows(fieldDiffsFromConfigDiff(diff, DEPLOYMENT_YAML, { treeSide: 'to' }));

    const env = 'spec.template.spec.containers.0.env';
    expect(rows.map((r) => [r.path, r.oldValue, r.newValue, r.kind])).toEqual([
      [`${env}.1.name`, 'B', '-', 'Delete'],
      [`${env}.1.value`, '2', '-', 'Delete'],
    ]);
  });

  test('with findElementsByMergeKey, an element is found by merge key though the side\'s index names another', () => {
    // The post-upgrade variation: the diff's To side is the Unit after an upgrade that
    // inserted an env var before C, so C is at index 3 there and at 2 in the tree.
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Update',
        Segments: [...CONTAINER, field('env'), keyed('name', 'C', 2, 3), field('value')],
        FromValue: '30',
        FromDataType: 'string',
        ToValue: '3',
        ToDataType: 'string',
      }])],
    };
    const env = 'spec.template.spec.containers.0.env';

    const exact = leafRows(fieldDiffsFromConfigDiff(diff, DEPLOYMENT_YAML, { treeSide: 'to' }));
    const byMergeKey = leafRows(fieldDiffsFromConfigDiff(diff, DEPLOYMENT_YAML, { treeSide: 'to', findElementsByMergeKey: true }));

    expect(exact.map((r) => r.path)).toEqual([`${env}.3.value`]);
    expect(byMergeKey.map((r) => [r.path, r.oldValue, r.newValue])).toEqual([[`${env}.2.value`, '30', '3']]);
  });

  test('a Rename is the Update of the merge-key field', () => {
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Rename',
        Path: 'spec.template.spec.containers.?name=web;@0.env.?name=B;@1',
        Segments: [...CONTAINER, field('env'), keyed('name', 'B2', 1, 1)],
        FromValue: 'B',
        FromDataType: 'string',
        ToValue: 'B2',
        ToDataType: 'string',
      }])],
    };

    const rows = leafRows(fieldDiffsFromConfigDiff(diff, TWO_DOCS, { treeSide: 'from' }));

    const path = 'spec.template.spec.containers.0.env.1.name';
    expect(rows).toEqual([{ key: treeKey(TWO_DOCS, 0, path), path, oldValue: 'B', newValue: 'B2', kind: 'Update' }]);
  });

  test('a Reorder and a comment change give no rows', () => {
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [
        {
          ChangeType: 'Reorder',
          Segments: [...CONTAINER, field('env')],
          FromValue: '- A\n- B',
          FromDataType: 'YAML',
          ToValue: '- B\n- A',
          ToDataType: 'YAML',
        },
        {
          ChangeType: 'Update',
          Comment: 'Line',
          Segments: fields('spec', 'replicas'),
          FromValue: 'two',
          FromDataType: 'string',
          ToValue: 'scaled up',
          ToDataType: 'string',
        },
      ])],
    };

    expect(fieldDiffsFromConfigDiff(diff, DEPLOYMENT_YAML, { treeSide: 'from' })).toEqual([]);
  });
});

// ── Values ──────────────────────────────────────────────────────────────────

test.describe('values', () => {
  test('a YAML block is expanded into leaves, written as parseUnitData writes them', () => {
    const block = [
      'limits:',
      '  cpu: 500m',
      '  memory: 1.0',
      '  gpus: 0x2',
      'requests:',
      '  enabled: true',
      '  nothing: ~',
      '  ports:',
      '    - 80',
      '    - 443',
      '  script: |',
      '    echo one',
      '    echo two',
    ].join('\n');
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Add',
        Path: 'spec.template.spec.containers.?name=web;@0.resources',
        Segments: [...CONTAINER, field('resources')],
        ToValue: block,
        ToDataType: 'YAML',
      }])],
    };

    const rows = leafRows(fieldDiffsFromConfigDiff(diff, DEPLOYMENT_YAML, { treeSide: 'from' }));

    // The tree after the upgrade would hold the same block: its values are the reference.
    const indented = block.split('\n').map((line) => `            ${line}`).join('\n');
    const after = DEPLOYMENT_YAML.replace('          image: web:1.4.0\n', `          image: web:1.4.0\n          resources:\n${indented}\n`);
    const expected = [...parseUnitData(after)].filter(([path]) => path.startsWith('spec.template.spec.containers.0.resources.'));

    expect(rows.map((r) => [r.path, r.newValue])).toEqual(expected);
    expect(rows.every((r) => r.oldValue === '-' && r.kind === 'Add' && r.resolvedPath === undefined)).toBe(true);
    expect(Object.fromEntries(expected)).toMatchObject({
      'spec.template.spec.containers.0.resources.limits.memory': '1',
      'spec.template.spec.containers.0.resources.limits.gpus': '2',
      'spec.template.spec.containers.0.resources.requests.nothing': 'null',
      'spec.template.spec.containers.0.resources.requests.ports.1': '443',
      'spec.template.spec.containers.0.resources.requests.script': 'echo one\necho two\n',
    });
  });

  test('scalars are written as parseUnitData writes them', () => {
    const scalar = (name: string, from: string, fromType: string, to: string, toType: string): PathChange => ({
      ChangeType: 'Update',
      Segments: fields('data', name),
      FromValue: from,
      FromDataType: fromType,
      ToValue: to,
      ToDataType: toType,
    });
    const before = 'kind: ConfigMap\ndata:\n  ratio: 1.50\n  empty: ~\n  quoted: "1.0"\n  flag: false\n  text: |\n    a\n';
    const diff: ConfigDiff = {
      Resources: [update(undefined, [
        scalar('ratio', '1.50', '', '2.0', ''),
        scalar('empty', '~', '', 'set', 'string'),
        scalar('quoted', '1.0', 'string', '2.0', 'string'),
        scalar('flag', 'false', 'bool', 'true', 'bool'),
        scalar('text', 'a\n', 'string', 'a\nb\n', 'string'),
      ])],
    };

    const rows = leafRows(fieldDiffsFromConfigDiff(diff, before, { treeSide: 'from' }));

    const tree = parseUnitData(before);
    for (const row of rows) expect(row.oldValue).toBe(tree.get(row.path));
    expect(rows.map((r) => [r.path, r.oldValue, r.newValue])).toEqual([
      ['data.ratio', '1.5', '2'],
      ['data.empty', 'null', 'set'],
      ['data.quoted', '1.0', '2.0'],
      ['data.flag', 'false', 'true'],
      ['data.text', 'a\n', 'a\nb\n'],
    ]);
  });

  test('a Replace from a scalar to a map removes the scalar and adds the leaves', () => {
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Replace',
        Segments: fields('spec', 'replicas'),
        FromValue: '2',
        FromDataType: 'int',
        ToValue: 'min: 2\nmax: 4',
        ToDataType: 'YAML',
      }])],
    };

    const rows = leafRows(fieldDiffsFromConfigDiff(diff, DEPLOYMENT_YAML, { treeSide: 'from' }));

    expect(rows.map((r) => [r.path, r.oldValue, r.newValue, r.kind])).toEqual([
      ['spec.replicas', '2', '-', 'Delete'],
      ['spec.replicas.min', '-', '2', 'Add'],
      ['spec.replicas.max', '-', '4', 'Add'],
    ]);
  });
});

// ── Whole resources ─────────────────────────────────────────────────────────

test.describe('whole resources', () => {
  test('an added resource is one marker, not a row per leaf', () => {
    const diff: ConfigDiff = {
      Resources: [{
        Resource: { ResourceType: 'v1/ConfigMap', ResourceName: 'prod/settings' },
        ChangeType: 'Add',
        ToValue: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: settings\n  namespace: prod\ndata:\n  a: "1"\n',
      }],
    };

    const rows = fieldDiffsFromConfigDiff(diff, TWO_DOCS, { treeSide: 'from' });

    expect(rows).toHaveLength(1);
    const [marker] = rows;
    expect(isWholeResourceChange(marker)).toBe(true);
    expect(marker).toMatchObject({ wholeResource: 'added', resource: { ResourceType: 'v1/ConfigMap', ResourceName: 'prod/settings' } });
    // It can never be taken for a row's key or a document's id.
    const scopeIds = computeDocumentScopes(parseUnitDataStructured(TWO_DOCS)).map((s) => s.id);
    expect(scopeIds).not.toContain(marker.key);
    expect(marker.key).not.toContain('\u0001');
  });

  test('a deleted resource of the tree is keyed on its document', () => {
    const diff: ConfigDiff = { Resources: [{ Resource: SERVICE, ChangeType: 'Delete', FromValue: SERVICE_YAML }] };

    const rows = fieldDiffsFromConfigDiff(diff, TWO_DOCS, { treeSide: 'from' });

    const scopes = computeDocumentScopes(parseUnitDataStructured(TWO_DOCS));
    expect(rows).toEqual([{ key: scopes[1].id, wholeResource: 'deleted', resource: SERVICE }]);
  });
});

// ── Merge conflicts ─────────────────────────────────────────────────────────

test.describe('resolveConflictPath', () => {
  test('merge-key segments resolve to the tree positions of the elements', () => {
    // The recorded index (@5) is where upstream had C; the tree has it at 2.
    const key = resolveConflictPath(
      { Resource: DEPLOYMENT, Path: 'spec.template.spec.containers.?name=web;@0.env.?name=C;@5.value' },
      TWO_DOCS,
    );
    expect(key).toBe(treeKey(TWO_DOCS, 0, 'spec.template.spec.containers.0.env.2.value'));
  });

  test('a plain path, escaped dots, an anchor and a positional element resolve', () => {
    expect(resolveConflictPath({ Resource: SERVICE, Path: 'metadata.labels.app' }, TWO_DOCS))
      .toBe(treeKey(TWO_DOCS, 1, 'metadata.labels.app'));
    expect(resolveConflictPath({ Resource: DEPLOYMENT, Path: 'metadata.labels.app~1kubernetes~1io/name' }, TWO_DOCS))
      .toBe(treeKey(TWO_DOCS, 0, 'metadata.labels.app.kubernetes.io/name'));
    expect(resolveConflictPath({ Resource: SERVICE, Path: 'spec.ports.?~h=9f2c,~p=^,~n=$;@0.port' }, TWO_DOCS))
      .toBe(treeKey(TWO_DOCS, 1, 'spec.ports.0.port'));
    expect(resolveConflictPath({ Resource: SERVICE, Path: 'spec.ports.0' }, TWO_DOCS))
      .toBe(treeKey(TWO_DOCS, 1, 'spec.ports.0'));
  });

  test('a single-document Unit resolves to a bare path', () => {
    expect(resolveConflictPath(
      { Resource: DEPLOYMENT, Path: 'spec.template.spec.containers.?name=web;@0.env.?name=B;@1' },
      DEPLOYMENT_YAML,
    )).toBe('spec.template.spec.containers.0.env.1');
  });

  test('what the tree does not draw does not resolve', () => {
    const unresolved = [
      { Resource: DEPLOYMENT, Path: 'spec.template.spec.containers.?name=web;@0.env.?name=MISSING;@1.value' },
      { Resource: DEPLOYMENT, Path: 'spec.paused' },
      { Resource: { ResourceType: 'v1/ConfigMap', ResourceName: 'prod/web' }, Path: 'metadata.name' },
      { Resource: DEPLOYMENT, Path: 'spec.template.spec.containers.*.image' },
      { Resource: DEPLOYMENT, Path: '' },
    ];
    for (const conflict of unresolved) expect(resolveConflictPath(conflict, TWO_DOCS), conflict.Path).toBeUndefined();
  });
});

// ── Upgrade entries and their count ─────────────────────────────────────────

test.describe('upgrade entries from the dry-run Diff', () => {
  const UNIT_ID = 'unit-1';
  const UPSTREAM_ID = 'upstream-1';
  // Only the fields the builder reads.
  const unitRead = (unit: Partial<UnitRead>) => ({ Unit: unit }) as ExtendedUnitRead;
  const units = [
    unitRead({ UnitID: UNIT_ID, SpaceID: 'child', Slug: 'web', UpstreamUnitID: UPSTREAM_ID, UpstreamRevisionNum: 1 }),
  ];
  const upstream = unitRead({ UnitID: UPSTREAM_ID, SpaceID: 'parent', HeadRevisionNum: 2 });
  const entriesFor = (diff: ConfigDiff | undefined, data: string, conflicts?: MutationConflict[]) => buildUpgradeEntries(
    new Set(['parent→child']),
    units,
    new Map([[UPSTREAM_ID, upstream]]),
    new Map(),
    diff ? new Map([[UNIT_ID, diff]]) : new Map(),
    undefined,
    conflicts ? new Map([[UNIT_ID, conflicts]]) : undefined,
    { unitData: () => data },
  );
  const merged = (diff: ConfigDiff, data: string, variationEntry?: VariationEntry, conflicts?: MutationConflict[]): MergedUnit => ({
    unitId: UNIT_ID,
    slug: 'web',
    spaceId: 'child',
    hasUpstream: true,
    data,
    upgradeEntry: entriesFor(diff, data, conflicts)[0],
    variationEntry,
    isUpgradeLoading: false,
    hasAction: true,
  });

  test('no entry is built before the Unit\'s Diff lands', () => {
    expect(entriesFor(undefined, TWO_DOCS)).toEqual([]);
  });

  test('a path two documents share, changed in one, is one upgradable row', () => {
    const diff: ConfigDiff = {
      Resources: [update(SERVICE, [{
        ChangeType: 'Update',
        Segments: fields('metadata', 'labels', 'app'),
        FromValue: 'web',
        FromDataType: 'string',
        ToValue: 'web-s',
        ToDataType: 'string',
      }])],
    };

    const unit = merged(diff, TWO_DOCS);

    expect(unit.upgradeEntry?.fieldDiffs.map((d) => d.key)).toEqual([treeKey(TWO_DOCS, 1, 'metadata.labels.app')]);
    expect(countUpgradableBadgeFields(unit)).toBe(1);
  });

  test('an env var inserted mid-list counts as one change', () => {
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Add',
        Segments: [...CONTAINER, field('env'), keyed('name', 'X', -1, 1)],
        ToValue: 'name: X\nvalue: x',
        ToDataType: 'YAML',
      }])],
    };

    expect(countUpgradableBadgeFields(merged(diff, TWO_DOCS))).toBe(1);
  });

  test('a local override of the path keeps it out of the count', () => {
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Update',
        Segments: fields('spec', 'replicas'),
        FromValue: '2',
        FromDataType: 'int',
        ToValue: '3',
        ToDataType: 'int',
      }])],
    };
    const variation: VariationEntry = {
      unitId: UNIT_ID,
      slug: 'web',
      deploymentId: 'child',
      deploymentName: 'child',
      fieldDiffs: [{ key: treeKey(TWO_DOCS, 0, 'spec.replicas'), path: 'spec.replicas', oldValue: '3', newValue: '2' }],
      localOnlyKeys: [],
      allPaths: [],
      liveFieldDiffs: [],
    };

    expect(countUpgradableBadgeFields(merged(diff, TWO_DOCS, variation))).toBe(0);
  });

  test('a resource added whole is one change, outside the field rows', () => {
    const diff: ConfigDiff = {
      Resources: [{ Resource: { ResourceType: 'v1/ConfigMap', ResourceName: 'prod/web' }, ChangeType: 'Add' }],
    };

    const unit = merged(diff, TWO_DOCS);

    expect(unit.upgradeEntry?.fieldDiffs).toEqual([]);
    expect(unit.upgradeEntry?.wholeResourceChanges?.map((c) => c.wholeResource)).toEqual(['added']);
    expect(availableWholeResourceChanges(unit.upgradeEntry)).toHaveLength(1);
    expect(countUpgradableBadgeFields(unit)).toBe(1);
  });

  test('a resource added whole is not counted while an upstream deletion is blocked', () => {
    // "Upgrade all" is the only commit that adds a whole resource, and it keeps the key
    // the upstream deleted, so with the deletion to accept it cannot be the batch.
    const diff: ConfigDiff = {
      Resources: [{ Resource: { ResourceType: 'v1/ConfigMap', ResourceName: 'prod/web' }, ChangeType: 'Add' }],
    };
    const blocked = {
      Reason: 'Subtracted',
      Path: 'metadata.labels.app',
      Resource: DEPLOYMENT,
      Source: { MutationType: 'Delete' },
    } as MutationConflict;

    const unit = merged(diff, TWO_DOCS, undefined, [blocked]);

    expect(unit.upgradeEntry?.blockedDeleteKeys).toEqual([treeKey(TWO_DOCS, 0, 'metadata.labels.app')]);
    expect(unit.upgradeEntry?.wholeResourceChanges).toHaveLength(1);
    expect(availableWholeResourceChanges(unit.upgradeEntry)).toEqual([]);
    expect(countUpgradableBadgeFields(unit)).toBe(1);
  });

  test('the same Diff and data give the same rows, so a rebuild re-renders nothing', () => {
    const diff: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Update',
        Segments: fields('spec', 'replicas'),
        FromValue: '2',
        FromDataType: 'int',
        ToValue: '3',
        ToDataType: 'int',
      }])],
    };

    expect(entriesFor(diff, TWO_DOCS)[0].fieldDiffs).toBe(entriesFor(diff, TWO_DOCS)[0].fieldDiffs);
  });
});

test.describe('upgrade entries of a Unit the tree reads as text', () => {
  // The tree reads Properties, Env and INI text through parseUnitData, as one leaf or a
  // few that name no key of the format. The server's Diff names keys (`port`), which
  // match none of the tree's rows, so these Units are compared as the tree reads them.
  const UNIT_ID = 'unit-1';
  const UPSTREAM_ID = 'upstream-1';
  const upstream = { Unit: { UnitID: UPSTREAM_ID, SpaceID: 'parent', HeadRevisionNum: 2 } } as ExtendedUnitRead;
  const keyDiff: ConfigDiff = {
    Resources: [{
      ChangeType: 'Update',
      Changes: [{ ChangeType: 'Update', Segments: fields('port'), FromValue: '80', FromDataType: 'string', ToValue: '81', ToDataType: 'string' }],
    }],
  };
  const entryFor = (toolchainType: string, current: string, dryRun: string) => buildUpgradeEntries(
    new Set(['parent→child']),
    [{ Unit: { UnitID: UNIT_ID, SpaceID: 'child', Slug: 'app', UpstreamUnitID: UPSTREAM_ID, UpstreamRevisionNum: 1, ToolchainType: toolchainType } } as ExtendedUnitRead],
    new Map([[UPSTREAM_ID, upstream]]),
    new Map(),
    new Map([[UNIT_ID, keyDiff]]),
    new Map([[UNIT_ID, dryRun]]),
    undefined,
    { unitData: () => current },
  )[0];
  /** The paths of the tree's leaves, as it draws the Unit. */
  const treePaths = (data: string) => parseUnitDataStructured(data).map((e) => e.path);

  test('a Properties Unit\'s change is one row at the tree\'s one leaf', () => {
    const current = 'host=web\nport=80\n';
    const entry = entryFor('AppConfig/Properties', current, 'host=web\nport=81\n');

    expect(treePaths(current)).toEqual(['']);
    expect(entry.fieldDiffs).toEqual([
      { key: '', path: '', oldValue: 'host=web port=80', newValue: 'host=web port=81', kind: 'Update' },
    ]);
    expect(entry.wholeResourceChanges).toBeUndefined();
  });

  test('a Properties Unit the upgrade leaves as it is has no row', () => {
    const current = 'host=web\nport=80\n';
    expect(entryFor('AppConfig/Properties', current, current).fieldDiffs).toEqual([]);
  });

  test('an INI Unit\'s rows are at the tree\'s leaves, never at the server\'s key paths', () => {
    const current = '[server]\nport=80\n';
    expect(treePaths(current)).toEqual(['0']);

    // A key's value is not drawn by the tree, so its change gives no row, and no
    // absent row for the server's `port` path.
    expect(entryFor('AppConfig/INI', current, '[server]\nport=81\n').fieldDiffs).toEqual([]);
    // The section name is what the tree draws at '0'.
    expect(entryFor('AppConfig/INI', current, '[api]\nport=80\n').fieldDiffs).toEqual([
      { key: '0', path: '0', oldValue: 'server', newValue: 'api', kind: 'Update' },
    ]);
  });

  test('a YAML Unit still takes its rows from the server\'s Diff', () => {
    const entry = entryFor('Kubernetes/YAML', 'port: 80\n', 'port: 81\n');
    expect(entry.fieldDiffs.map((d) => [d.key, d.oldValue, d.newValue])).toEqual([['port', '80', '81']]);
  });
});

test.describe('blocked deletions', () => {
  test('a conflict is keyed on the row of its own document', () => {
    const conflict = { Resource: SERVICE, Path: 'metadata.labels.app' };
    expect(blockedDeleteKey(conflict, TWO_DOCS)).toBe(treeKey(TWO_DOCS, 1, 'metadata.labels.app'));
  });

  test('a conflict that names no row keeps a key of its own, which matches no row', () => {
    const conflict = { Resource: SERVICE, Path: 'metadata.labels.tier' };
    const key = blockedDeleteKey(conflict, TWO_DOCS);
    const rowKeys = computeDocumentScopes(parseUnitDataStructured(TWO_DOCS)).flatMap((scope) =>
      scope.paths.map((path) => docStageKey(scope, path)));

    expect(key).not.toBe('metadata.labels.tier');
    expect(rowKeys).not.toContain(key);
    expect(blockedDeleteKey(conflict, TWO_DOCS)).toBe(key);
    expect(blockedDeleteKey({ Resource: DEPLOYMENT, Path: 'metadata.labels.tier' }, TWO_DOCS)).not.toBe(key);
  });
});

// ── Variation entries ───────────────────────────────────────────────────────

test.describe('variation entries from the server\'s diffs', () => {
  const UNIT_ID = 'unit-1';
  const UPSTREAM_ID = 'upstream-1';
  const unitRead = (unit: Partial<UnitRead>) => ({ Unit: unit }) as ExtendedUnitRead;
  const downstream = (toolchainType = 'Kubernetes/YAML') =>
    unitRead({ UnitID: UNIT_ID, SpaceID: 'child', Slug: 'web', UpstreamUnitID: UPSTREAM_ID, ToolchainType: toolchainType });
  const upstream = unitRead({ UnitID: UPSTREAM_ID, SpaceID: 'parent', HeadRevisionNum: 2 });
  const entriesFor = (
    diffs: Partial<VariationDiffs>,
    current: string,
    options: { dryRun?: string; upstreamData?: string; toolchainType?: string } = {},
  ) => buildVariationEntries(
    ['child'],
    [downstream(options.toolchainType)],
    new Map([[UPSTREAM_ID, upstream]]),
    new Map(),
    options.dryRun !== undefined ? new Map([[UNIT_ID, options.dryRun]]) : undefined,
    { live: diffs.live ?? new Map(), postUpgrade: diffs.postUpgrade ?? new Map() },
    { unitData: (id) => (id === UPSTREAM_ID ? options.upstreamData ?? '' : current) },
  );
  const labelChange = (resource: ResourceDiff['Resource'], from: string, to: string): ConfigDiff => ({
    Resources: [update(resource, [{
      ChangeType: 'Update',
      Segments: fields('metadata', 'labels', 'app'),
      FromValue: from,
      FromDataType: 'string',
      ToValue: to,
      ToDataType: 'string',
    }])],
  });

  test('no entry is built before the live diff lands', () => {
    expect(entriesFor({}, TWO_DOCS)).toEqual([]);
  });

  test('an override of a path two documents share is a row in its own document only', () => {
    const live = labelChange(SERVICE, 'web-upstream', 'web');
    const [entry] = entriesFor({ live: new Map([[UNIT_ID, live]]) }, TWO_DOCS);

    const key = treeKey(TWO_DOCS, 1, 'metadata.labels.app');
    expect(entry.liveFieldDiffs.map((d) => [d.key, d.oldValue, d.newValue])).toEqual([[key, 'web-upstream', 'web']]);
    // With no dry run, the Unit after its upgrade is the Unit as it is.
    expect(entry.fieldDiffs).toBe(entry.liveFieldDiffs);
    expect(entry.localOnlyKeys).toEqual([]);
  });

  test('a Unit with a dry run waits for its post-upgrade diff, which is keyed on the current tree', () => {
    const live = labelChange(SERVICE, 'web-upstream', 'web');
    expect(entriesFor({ live: new Map([[UNIT_ID, live]]) }, TWO_DOCS, { dryRun: TWO_DOCS })).toEqual([]);

    // After the upgrade, the label the Unit overrides is the only difference left, and
    // the upgrade inserted an env var before C, which the Unit also overrides.
    const postUpgrade: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Update',
        Segments: [...CONTAINER, field('env'), keyed('name', 'C', 2, 3), field('value')],
        FromValue: '30',
        FromDataType: 'string',
        ToValue: '3',
        ToDataType: 'string',
      }])],
    };
    const [entry] = entriesFor(
      { live: new Map([[UNIT_ID, live]]), postUpgrade: new Map([[UNIT_ID, postUpgrade]]) },
      TWO_DOCS,
      { dryRun: TWO_DOCS },
    );

    expect(entry.fieldDiffs.map((d) => d.key)).toEqual([treeKey(TWO_DOCS, 0, 'spec.template.spec.containers.0.env.2.value')]);
    expect(entry.liveFieldDiffs.map((d) => d.key)).toEqual([treeKey(TWO_DOCS, 1, 'metadata.labels.app')]);
  });

  test('a key only the Unit has is local-only, and a blocked deletion\'s row is its override', () => {
    const live: ConfigDiff = {
      Resources: [update(DEPLOYMENT, [{
        ChangeType: 'Add',
        Segments: fields('metadata', 'labels', 'app.kubernetes.io/name'),
        ToValue: 'web',
        ToDataType: 'string',
      }])],
    };
    const [entry] = entriesFor({ live: new Map([[UNIT_ID, live]]) }, TWO_DOCS);
    const key = treeKey(TWO_DOCS, 0, 'metadata.labels.app.kubernetes.io/name');

    expect(entry.localOnlyKeys).toEqual([key]);
    // The upstream has no value: the row the conflict resolves to reads as a removal.
    expect(entry.fieldDiffs.map((d) => [d.key, d.oldValue])).toEqual([[key, '-']]);
    expect(blockedDeleteKey({ Resource: DEPLOYMENT, Path: 'metadata.labels.app~1kubernetes~1io/name' }, TWO_DOCS)).toBe(key);
  });

  test('a resource only the Unit has is a local-only row per leaf of its document', () => {
    const live: ConfigDiff = { Resources: [{ Resource: SERVICE, ChangeType: 'Add' }] };
    const [entry] = entriesFor({ live: new Map([[UNIT_ID, live]]) }, TWO_DOCS);
    const serviceKeys = parseUnitDataStructured(SERVICE_YAML).map((e) => treeKey(TWO_DOCS, 1, e.path));

    expect(entry.localOnlyKeys).toEqual(serviceKeys);
    expect(entry.liveFieldDiffs.every((d) => d.oldValue === '-' && d.kind === 'Add')).toBe(true);
  });

  test('the same diff and data give the same rows', () => {
    const live = new Map([[UNIT_ID, labelChange(SERVICE, 'web-upstream', 'web')]]);
    expect(entriesFor({ live }, TWO_DOCS)[0].liveFieldDiffs).toBe(entriesFor({ live }, TWO_DOCS)[0].liveFieldDiffs);
  });

  test('a Unit the tree reads as text is compared as the tree reads it, with no diff read', () => {
    const [entry] = entriesFor({}, 'host=web\nport=81\n', {
      toolchainType: 'AppConfig/Properties',
      upstreamData: 'host=web\nport=80\n',
      dryRun: 'host=web\nport=82\n',
    });

    expect(entry.liveFieldDiffs).toEqual([
      { key: '', path: '', oldValue: 'host=web port=80', newValue: 'host=web port=81', kind: 'Update' },
    ]);
    expect(entry.fieldDiffs).toEqual([
      { key: '', path: '', oldValue: 'host=web port=80', newValue: 'host=web port=82', kind: 'Update' },
    ]);
  });
});

test.describe('an upstream element the Unit deleted, and one the upstream adds', () => {
  // Upstream: env A B C U X. The Unit deleted U (A B C), and the upgrade brings X.
  // Neither U nor X is in the Unit's tree, and each diff numbers its absent elements on
  // from the list's end, so both are drawn at env.3.
  const UNIT_ID = 'unit-1';
  const UPSTREAM_ID = 'upstream-1';
  const unitRead = (unit: Partial<UnitRead>) => ({ Unit: unit }) as ExtendedUnitRead;
  const downstream = unitRead({
    UnitID: UNIT_ID, SpaceID: 'child', Slug: 'web', UpstreamUnitID: UPSTREAM_ID, UpstreamRevisionNum: 1, ToolchainType: 'Kubernetes/YAML',
  });
  const upstream = unitRead({ UnitID: UPSTREAM_ID, SpaceID: 'parent', HeadRevisionNum: 2 });
  const env = [...CONTAINER, field('env')];
  const envBlock = (name: string) => `name: ${name}\nvalue: ${name.toLowerCase()}`;

  const upgrade: ConfigDiff = {
    Resources: [update(DEPLOYMENT, [{ ChangeType: 'Add', Segments: [...env, keyed('name', 'X', -1, 3)], ToValue: envBlock('X'), ToDataType: 'YAML' }])],
  };
  const postUpgrade: ConfigDiff = {
    Resources: [update(DEPLOYMENT, [{ ChangeType: 'Delete', Segments: [...env, keyed('name', 'U', 3, -1)], FromValue: envBlock('U'), FromDataType: 'YAML' }])],
  };

  function unitWithBothDiffs(): MergedUnit {
    const data = { unitData: () => DEPLOYMENT_YAML };
    const [upgradeEntry] = buildUpgradeEntries(
      new Set(['parent→child']), [downstream], new Map([[UPSTREAM_ID, upstream]]), new Map(),
      new Map([[UNIT_ID, upgrade]]), undefined, undefined, data,
    );
    const [variationEntry] = buildVariationEntries(
      ['child'], [downstream], new Map([[UPSTREAM_ID, upstream]]), new Map(),
      new Map([[UNIT_ID, DEPLOYMENT_YAML]]),
      { live: new Map([[UNIT_ID, postUpgrade]]), postUpgrade: new Map([[UNIT_ID, postUpgrade]]) },
      data,
    );
    return {
      unitId: UNIT_ID, slug: 'web', spaceId: 'child', hasUpstream: true, data: DEPLOYMENT_YAML,
      upgradeEntry, variationEntry, isUpgradeLoading: false, hasAction: true,
    };
  }

  test('the element the upstream adds is upgradable and counted', () => {
    const unit = unitWithBothDiffs();
    const xKeys = unit.upgradeEntry!.fieldDiffs.map((d) => d.key);
    expect(xKeys).toEqual(['spec.template.spec.containers.0.env.3.name', 'spec.template.spec.containers.0.env.3.value']);
    expect(countUpgradableBadgeFields(unit)).toBe(1);
  });

  test('the deleted element, which the tree has no row for, is no override of a row', () => {
    const { variationEntry } = unitWithBothDiffs();
    expect(variationEntry!.fieldDiffs).toEqual([]);
    // The live diff still holds it: the value border reads what differs from upstream now.
    expect(variationEntry!.liveFieldDiffs.map((d) => d.newValue)).toEqual(['-', '-']);
  });
});
