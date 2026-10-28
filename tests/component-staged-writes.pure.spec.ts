// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `applyConfigWrites` / `orderConfigWrites` (configParser.ts): the Component view commits
// a staged subset by writing each staged key into the Unit's current data. Every key
// names an array element by its index in that data, as the server's Diff reports it
// (From-side indices), so a delete that removes an element must not move an element a
// later write names. An element the upstream inserts is not in that data: its leaves
// carry a made-up index after the array's last element, and the insertion the Diff
// gives them (`fieldDiffsFromConfigDiff`, configDiffFieldDiffs.ts) says where it goes.
//
// After a commit, a committed row keeps a "done" mark keyed on its stage key. A batch
// that inserts or removes elements moves the elements after them, so the marks under
// them are dropped (`keysMovedByBatch`, diffTree.ts) rather than shown on another element.
//
// Takes no `page` fixture and starts no browser:
//   cd ui && npx playwright test -c playwright.pure.config.ts component-staged-writes

import { expect, test } from '@playwright/test';
import { parse as parseYaml, parseAllDocuments } from 'yaml';

import type { ConfigDiff, PathChange, PathSegment } from '@confighub/rtk-query';

import { fieldDiffsFromConfigDiff, isWholeResourceChange, type KeyedFieldDiff } from '../src/pages/x/apps/configDiffFieldDiffs';
import { applyConfigWrites, orderConfigWrites, parseUnitDataStructured, type ArrayInsertion, type ConfigWrite } from '../src/pages/x/apps/configParser';
import { isRemovalWrite } from '../src/pages/x/apps/componentValues';
import { computeDocumentScopes, docStageKey, groupFieldEntriesByDocument, keysMovedByBatch, stageKeyDocId } from '../src/pages/x/apps/diffTree';

const ENV_ABCD = `env:
  - name: A
    value: a
  - name: B
    value: b
  - name: C
    value: c
  - name: D
    value: d
`;

const del = (path: string, extra: Partial<ConfigWrite> = {}): ConfigWrite => ({ path, kind: 'delete', ...extra });
const set = (path: string, value: string, extra: Partial<ConfigWrite> = {}): ConfigWrite => ({ path, kind: 'set', value, ...extra });

function envOf(data: string): unknown {
  return (parseYaml(data) as { env: unknown }).env;
}

test.describe('a batch writes each element its path names before the batch', () => {
  test('deleting B and updating C changes C, not D', () => {
    const { data, failedPaths } = applyConfigWrites(ENV_ABCD, [
      del('env.1.name'),
      del('env.1.value'),
      set('env.2.value', 'c2'),
    ]);
    expect(failedPaths).toEqual([]);
    expect(envOf(data)).toEqual([
      { name: 'A', value: 'a' },
      { name: 'C', value: 'c2' },
      { name: 'D', value: 'd' },
    ]);
  });

  test('deleting B and C leaves A and D', () => {
    const { data, failedPaths } = applyConfigWrites(ENV_ABCD, [
      del('env.1.name'),
      del('env.1.value'),
      del('env.2.name'),
      del('env.2.value'),
    ]);
    expect(failedPaths).toEqual([]);
    expect(envOf(data)).toEqual([
      { name: 'A', value: 'a' },
      { name: 'D', value: 'd' },
    ]);
  });

  test('deleting an element of a scalar list and the one after it', () => {
    const { data } = applyConfigWrites('args:\n  - a\n  - b\n  - c\n  - d\n', [del('args.1'), del('args.2')]);
    expect((parseYaml(data) as { args: unknown }).args).toEqual(['a', 'd']);
  });

  test('an insertion after the last element is set before any element is deleted', () => {
    // The Diff places an inserted element after the array's last element (index 4
    // here), an index that holds only while no element before it is deleted.
    const writes = [
      del('env.1.name'),
      set('env.4.name', 'E'),
      del('env.1.value'),
      set('env.4.value', 'e'),
      del('env.2.name'),
    ];
    expect(orderConfigWrites(writes).map((w) => `${w.kind} ${w.path}`)).toEqual([
      'set env.4.name',
      'set env.4.value',
      'delete env.2.name',
      'delete env.1.name',
      'delete env.1.value',
    ]);
  });

  test('a Replace from a scalar to a map deletes the scalar before setting the leaves', () => {
    const { data, failedPaths } = applyConfigWrites('a: 1\nb: 2\n', [set('a.x', 'y'), del('a')]);
    expect(failedPaths).toEqual([]);
    expect(parseYaml(data)).toEqual({ a: { x: 'y' }, b: 2 });
  });

  test('the same index changed in two documents of a Unit lands in each document', () => {
    const doc = (name: string) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
env:
  - name: A
    value: a
  - name: B
    value: b
  - name: C
    value: c
`;
    const data = `${doc('one')}---\n${doc('two')}`;
    const one = { resource: { ResourceType: 'v1/ConfigMap', ResourceName: 'one' }, documentId: 'one' };
    const two = { resource: { ResourceType: 'v1/ConfigMap', ResourceName: 'two' }, documentId: 'two' };
    const result = applyConfigWrites(data, [
      del('env.1.name', one),
      del('env.1.value', one),
      del('env.1.name', two),
      del('env.1.value', two),
      set('env.2.value', 'c2', two),
    ]);
    expect(result.failedPaths).toEqual([]);
    const envs = parseAllDocuments(result.data)
      .map((d) => d.toJSON() as { env: unknown } | null)
      .filter((d) => d !== null)
      .map((d) => d.env);
    expect(envs).toEqual([
      [{ name: 'A', value: 'a' }, { name: 'C', value: 'c' }],
      [{ name: 'A', value: 'a' }, { name: 'C', value: 'c2' }],
    ]);
  });
});

// ── Elements the upstream inserts ───────────────────────────────────────────

const field = (name: string): PathSegment => ({ Field: name, FromIndex: -1, ToIndex: -1 });
const keyed = (name: string, fromIndex: number, toIndex: number): PathSegment => ({
  MergeKeys: [{ Key: 'name', Value: name }],
  FromIndex: fromIndex,
  ToIndex: toIndex,
});

/** The Diff's Add of env var `name` at `toIndex` upstream. */
const addEnv = (name: string, toIndex: number): PathChange => ({
  ChangeType: 'Add',
  Segments: [field('env'), keyed(name, -1, toIndex)],
  ToValue: `name: ${name}\nvalue: ${name.toLowerCase()}`,
  ToDataType: 'YAML',
});

/** The Diff's Delete of env var `name`, at `fromIndex` in the Unit. */
const deleteEnv = (name: string, fromIndex: number): PathChange => ({
  ChangeType: 'Delete',
  Segments: [field('env'), keyed(name, fromIndex, -1)],
  FromValue: `name: ${name}\nvalue: ${name.toLowerCase()}`,
  FromDataType: 'YAML',
});

/** The upgrade's rows for the tree drawing `data`, as the Component view builds them. */
function upgradeRows(data: string, changes: PathChange[], resource?: { ResourceType: string; ResourceName: string }): KeyedFieldDiff[] {
  const diff: ConfigDiff = { Resources: [{ Resource: resource, ChangeType: 'Update', Changes: changes }] };
  return fieldDiffsFromConfigDiff(diff, data, { treeSide: 'from' })
    .filter((row): row is KeyedFieldDiff => !isWholeResourceChange(row));
}

/** The stage keys of the Unit's own leaves, as the Component view keys its tree rows. */
function treeKeys(data: string): Set<string> {
  const entries = parseUnitDataStructured(data);
  const scopes = computeDocumentScopes(entries);
  return new Set(groupFieldEntriesByDocument(entries)
    .flatMap((group, i) => group.entries.map((entry) => docStageKey(scopes[i], entry.path))));
}

/**
 * Commit the staged rows as the Component view does: each row's upgrade value, as its
 * type, pinned to its document.
 */
function commitRows(data: string, rows: KeyedFieldDiff[]): { data: string; failedPaths: string[] } {
  const scopes = computeDocumentScopes(parseUnitDataStructured(data));
  const held = treeKeys(data);
  return applyConfigWrites(data, rows.map((row): ConfigWrite => {
    const documentId = stageKeyDocId(row.key);
    const scope = scopes.find((sc) => sc?.id === documentId);
    const resource = scope?.writable ? scope.resource : undefined;
    return isRemovalWrite(row.newValue, row.newValueType, held.has(row.key))
      ? { path: row.path, kind: 'delete', resource, documentId, insertion: row.insertion }
      : { path: row.path, kind: 'set', value: row.newValue, valueType: row.newValueType, resource, documentId, insertion: row.insertion };
  }));
}

const names = (data: string): string[] => (envOf(data) as { name: string }[]).map((e) => e.name);
/** The rows of the new element named `name`. */
function rowsOf(rows: KeyedFieldDiff[], name: string): KeyedFieldDiff[] {
  const nameRow = rows.find((r) => r.path.endsWith('.name') && r.newValue === name);
  if (!nameRow) throw new Error(`no row adds ${name}`);
  const element = nameRow.path.slice(0, -'.name'.length);
  return rows.filter((r) => r.path.startsWith(`${element}.`));
}

test.describe('a staged subset writes an element the upstream inserts at its upstream position', () => {
  test('an env var inserted mid-list lands at its upstream index', () => {
    // Upstream: A X B C D.
    const rows = upgradeRows(ENV_ABCD, [addEnv('X', 1)]);
    const { data, failedPaths } = commitRows(ENV_ABCD, rows);
    expect(failedPaths).toEqual([]);
    expect(envOf(data)).toEqual([
      { name: 'A', value: 'a' },
      { name: 'X', value: 'x' },
      { name: 'B', value: 'b' },
      { name: 'C', value: 'c' },
      { name: 'D', value: 'd' },
    ]);
  });

  test('an env var inserted at the start of the list goes first', () => {
    const { data } = commitRows(ENV_ABCD, upgradeRows(ENV_ABCD, [addEnv('X', 0)]));
    expect(names(data)).toEqual(['X', 'A', 'B', 'C', 'D']);
  });

  test('two insertions into one list each land at their upstream index', () => {
    // Upstream: A X B Y C D.
    const rows = upgradeRows(ENV_ABCD, [addEnv('X', 1), addEnv('Y', 3)]);
    expect(names(commitRows(ENV_ABCD, rows).data)).toEqual(['A', 'X', 'B', 'Y', 'C', 'D']);
    // Staged alone, Y still follows B.
    expect(names(commitRows(ENV_ABCD, rowsOf(rows, 'Y')).data)).toEqual(['A', 'B', 'Y', 'C', 'D']);
  });

  test('two adjacent insertions keep their upstream order, staged in either order', () => {
    // Upstream: A X Y B C D.
    const rows = upgradeRows(ENV_ABCD, [addEnv('X', 1), addEnv('Y', 2)]);
    expect(names(commitRows(ENV_ABCD, [...rows].reverse()).data)).toEqual(['A', 'X', 'Y', 'B', 'C', 'D']);
    expect(names(commitRows(ENV_ABCD, rowsOf(rows, 'Y')).data)).toEqual(['A', 'Y', 'B', 'C', 'D']);
  });

  test('an insertion after an element the upstream deletes', () => {
    // Upstream: A C X D. B is deleted, and X follows C.
    const rows = upgradeRows(ENV_ABCD, [deleteEnv('B', 1), addEnv('X', 2)]);
    const both = commitRows(ENV_ABCD, rows);
    expect(both.failedPaths).toEqual([]);
    expect(names(both.data)).toEqual(['A', 'C', 'X', 'D']);
    // With the delete left out, X still follows C.
    expect(names(commitRows(ENV_ABCD, rowsOf(rows, 'X')).data)).toEqual(['A', 'B', 'C', 'X', 'D']);
  });

  test('an insertion, a delete before it, and an update after it', () => {
    // Upstream: A X C D', where B is deleted and D's value changed.
    const rows = [
      ...upgradeRows(ENV_ABCD, [deleteEnv('B', 1), addEnv('X', 1)]),
      { key: 'env.3.value', path: 'env.3.value', oldValue: 'd', newValue: 'd2', kind: 'Update' as const },
    ];
    const { data, failedPaths } = commitRows(ENV_ABCD, rows);
    expect(failedPaths).toEqual([]);
    expect(envOf(data)).toEqual([
      { name: 'A', value: 'a' },
      { name: 'X', value: 'x' },
      { name: 'C', value: 'c' },
      { name: 'D', value: 'd2' },
    ]);
  });

  test('an insertion into a list of scalars', () => {
    const args = 'args:\n  - a\n  - b\n  - c\n';
    const rows = upgradeRows(args, [{
      ChangeType: 'Add',
      Segments: [field('args'), { FromIndex: -1, ToIndex: 1 }],
      ToValue: 'x',
      ToDataType: 'string',
    }]);
    const { data, failedPaths } = commitRows(args, rows);
    expect(failedPaths).toEqual([]);
    expect((parseYaml(data) as { args: unknown }).args).toEqual(['a', 'x', 'b', 'c']);
  });

  test('an insertion in one document of a multi-document Unit', () => {
    const doc = (name: string) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
${ENV_ABCD}`;
    const data = `${doc('one')}---\n${doc('two')}`;
    const two = computeDocumentScopes(parseUnitDataStructured(data))[1]!.resource!;
    const rows = upgradeRows(data, [addEnv('X', 2)], { ResourceType: two.ResourceType!, ResourceName: two.ResourceName! });
    expect(rows.every((r) => stageKeyDocId(r.key) !== undefined)).toBe(true);
    const result = commitRows(data, rows);
    expect(result.failedPaths).toEqual([]);
    const envs = parseAllDocuments(result.data)
      .map((d) => d.toJSON() as { env: { name: string }[] } | null)
      .filter((d) => d !== null)
      .map((d) => d.env.map((e) => e.name));
    expect(envs).toEqual([['A', 'B', 'C', 'D'], ['A', 'B', 'X', 'C', 'D']]);
  });

  test('a partly staged element is written with only its staged leaves', () => {
    const rows = upgradeRows(ENV_ABCD, [addEnv('X', 1)]);
    const { data, failedPaths } = commitRows(ENV_ABCD, rows.filter((r) => r.path.endsWith('.name')));
    expect(failedPaths).toEqual([]);
    expect((envOf(data) as unknown[])[1]).toEqual({ name: 'X' });
    expect(names(data)).toEqual(['A', 'X', 'B', 'C', 'D']);
  });

  test('an element with no position from the Diff is appended', () => {
    const { data, failedPaths } = applyConfigWrites(ENV_ABCD, [
      set('env.4.name', 'X', { insertion: { arrayPath: 'env', index: 4, order: 4 } }),
      set('env.4.value', 'x', { insertion: { arrayPath: 'env', index: 4, order: 4 } }),
    ]);
    expect(failedPaths).toEqual([]);
    expect(names(data)).toEqual(['A', 'B', 'C', 'D', 'X']);
  });
});

test.describe('a list the configuration does not hold', () => {
  test('is built from its start, whatever order its leaves were staged in', () => {
    const { data, failedPaths } = applyConfigWrites('a: 1\n', [
      set('ports.1.port', '443'),
      set('ports.0.port', '80'),
      set('ports.0.name', 'http'),
    ]);
    expect(failedPaths).toEqual([]);
    expect(parseYaml(data)).toEqual({ a: 1, ports: [{ port: 80, name: 'http' }, { port: 443 }] });
  });

  test('cannot be written from an element past its first', () => {
    const { failedPaths } = applyConfigWrites('a: 1\n', [set('ports.1.port', '443')]);
    expect(failedPaths).toEqual(['ports.1.port']);
  });
});

// ── Typed values ────────────────────────────────────────────────────────────

test.describe('a value from the Diff is written as its type', () => {
  /** The Diff's Add of an env var whose block is `block`, at `toIndex` upstream. */
  const addEnvBlock = (block: string, toIndex: number): PathChange => ({
    ChangeType: 'Add',
    Segments: [field('env'), keyed('X', -1, toIndex)],
    ToValue: block,
    ToDataType: 'YAML',
  });
  const valueOfX = (data: string): unknown =>
    (envOf(data) as { name: string; value?: unknown }[]).find((e) => e.name === 'X')?.value;

  for (const text of ['2', 'true', 'null', '0x1F', '1e3', '-']) {
    test(`a new env var's string value "${text}" stays a string`, () => {
      const rows = upgradeRows(ENV_ABCD, [addEnvBlock(`name: X\nvalue: "${text}"`, 1)]);
      const { data, failedPaths } = commitRows(ENV_ABCD, rows);
      expect(failedPaths).toEqual([]);
      expect(valueOfX(data)).toBe(text);
      expect(data).toContain(`value: "${text}"`);
    });
  }

  test('a new env var\'s empty value is written, not taken for a removal', () => {
    const rows = upgradeRows(ENV_ABCD, [addEnvBlock('name: X\nvalue: ""', 1)]);
    const { data, failedPaths } = commitRows(ENV_ABCD, rows);
    expect(failedPaths).toEqual([]);
    expect((envOf(data) as unknown[])[1]).toEqual({ name: 'X', value: '' });
  });

  test('a new element\'s int and bool stay an int and a bool', () => {
    const rows = upgradeRows('ports:\n  - name: http\n    port: 80\n', [{
      ChangeType: 'Add',
      Segments: [field('ports'), keyed('https', -1, 1)],
      ToValue: 'name: https\nport: 443\nratio: 1.5\ntls: true\nnote: null',
      ToDataType: 'YAML',
    }]);
    const { data } = commitRows('ports:\n  - name: http\n    port: 80\n', rows);
    expect((parseYaml(data) as { ports: unknown[] }).ports[1]).toEqual({ name: 'https', port: 443, ratio: 1.5, tls: true, note: null });
  });

  test('an arg "8080" inserted into a list of scalars stays a string', () => {
    const args = 'args:\n  - --a\n  - --b\n';
    const rows = upgradeRows(args, [{
      ChangeType: 'Add',
      Segments: [field('args'), { FromIndex: -1, ToIndex: 1 }],
      ToValue: '8080',
      ToDataType: 'string',
    }]);
    const { data, failedPaths } = commitRows(args, rows);
    expect(failedPaths).toEqual([]);
    expect((parseYaml(data) as { args: unknown }).args).toEqual(['--a', '8080', '--b']);
  });

  test('a new annotation "true" stays a string', () => {
    const before = 'metadata:\n  annotations:\n    a: b\n';
    const rows = upgradeRows(before, [{
      ChangeType: 'Add',
      Segments: [field('metadata'), field('annotations'), field('enabled')],
      ToValue: 'true',
      ToDataType: 'string',
    }]);
    const { data, failedPaths } = commitRows(before, rows);
    expect(failedPaths).toEqual([]);
    expect(parseYaml(data)).toEqual({ metadata: { annotations: { a: 'b', enabled: 'true' } } });
  });

  test('replicas changed and added stay ints, and a string replacing an int is a string', () => {
    const before = 'spec:\n  replicas: 2\n  port: 80\n';
    const rows = upgradeRows(before, [
      { ChangeType: 'Update', Segments: [field('spec'), field('replicas')], FromValue: '2', FromDataType: 'int', ToValue: '3', ToDataType: 'int' },
      { ChangeType: 'Add', Segments: [field('spec'), field('minReplicas')], ToValue: '1', ToDataType: 'int' },
      { ChangeType: 'Update', Segments: [field('spec'), field('port')], FromValue: '80', FromDataType: 'int', ToValue: '8080', ToDataType: 'string' },
    ]);
    const { data, failedPaths } = commitRows(before, rows);
    expect(failedPaths).toEqual([]);
    expect(parseYaml(data)).toEqual({ spec: { replicas: 3, minReplicas: 1, port: '8080' } });
  });

  test('a typed edit with no type from the Diff is still read as typed', () => {
    const { data } = applyConfigWrites('spec:\n  replicas: 2\n', [set('spec.minReplicas', '1'), set('spec.replicas', '4')]);
    expect(parseYaml(data)).toEqual({ spec: { replicas: 4, minReplicas: 1 } });
  });

  test('an upstream removal still deletes the key, and so does an empty value replacing one', () => {
    const before = 'metadata:\n  annotations:\n    a: b\n    c: d\n    e: f\n';
    const rows = upgradeRows(before, [
      { ChangeType: 'Delete', Segments: [field('metadata'), field('annotations'), field('a')], FromValue: 'b', FromDataType: 'string' },
      { ChangeType: 'Update', Segments: [field('metadata'), field('annotations'), field('c')], FromValue: 'd', FromDataType: 'string', ToValue: '', ToDataType: 'string' },
    ]);
    const { data } = commitRows(before, rows);
    expect(parseYaml(data)).toEqual({ metadata: { annotations: { e: 'f' } } });
  });
});

// ── Committed marks ─────────────────────────────────────────────────────────

test.describe('a commit that moves list elements drops the marks it moves', () => {
  /** The keys of `marks` that still name their element once the batch is read back. */
  function keptMarks(
    data: string,
    marks: string[],
    batch: { deleted?: string[]; inserted?: KeyedFieldDiff[] },
  ): string[] {
    const moved = keysMovedByBatch(
      new Set(batch.deleted ?? []),
      (batch.inserted ?? []).flatMap((row): [string, ArrayInsertion][] => (row.insertion ? [[row.key, row.insertion]] : [])),
      treeKeys(data),
    );
    return marks.filter((key) => !moved(key));
  }

  test('deleting B and updating C keeps no mark on C or D, and keeps A\'s', () => {
    // After the refetch, env.1 is C and env.2 is D: B's struck-through mark would be on C.
    const marks = ['env.0.value', 'env.1.name', 'env.1.value', 'env.2.value', 'env.3.value'];
    expect(keptMarks(ENV_ABCD, marks, { deleted: ['env.1.name', 'env.1.value'] })).toEqual(['env.0.value']);
  });

  test('an element inserted after A drops the marks from B on, and the new element\'s own', () => {
    const rows = upgradeRows(ENV_ABCD, [addEnv('X', 1)]);
    const marks = ['env.0.value', ...rows.map((r) => r.key), 'env.1.value', 'env.3.value'];
    expect(keptMarks(ENV_ABCD, marks, { inserted: rows })).toEqual(['env.0.value']);
  });

  test('an element appended keeps every mark of the elements the Unit holds', () => {
    const rows = upgradeRows(ENV_ABCD, [addEnv('X', 4)]);
    const marks = ['env.0.value', 'env.3.value', ...rows.map((r) => r.key)];
    expect(keptMarks(ENV_ABCD, marks, { inserted: rows })).toEqual(['env.0.value', 'env.3.value']);
  });

  test('deleting part of an element moves nothing', () => {
    const marks = ['env.1.value', 'env.2.value'];
    expect(keptMarks(ENV_ABCD, marks, { deleted: ['env.1.value'] })).toEqual(marks);
  });

  test('deleting an element of a list of scalars moves the ones after it', () => {
    const args = 'args:\n  - a\n  - b\n  - c\n';
    expect(keptMarks(args, ['args.0', 'args.1', 'args.2'], { deleted: ['args.1'] })).toEqual(['args.0']);
  });

  test('deleting an element of a nested list moves only that list', () => {
    const data = `spec:
  containers:
    - name: web
      image: web:1
      env:
        - name: A
          value: a
        - name: B
          value: b
    - name: side
      image: side:1
`;
    const marks = [
      'spec.containers.0.image',
      'spec.containers.0.env.0.value',
      'spec.containers.0.env.1.value',
      'spec.containers.1.image',
    ];
    const deleted = ['spec.containers.0.env.0.name', 'spec.containers.0.env.0.value'];
    expect(keptMarks(data, marks, { deleted })).toEqual(['spec.containers.0.image', 'spec.containers.1.image']);
  });

  test('a batch in one document of a Unit moves no mark of another', () => {
    const doc = (name: string) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
${ENV_ABCD}`;
    const data = `${doc('one')}---\n${doc('two')}`;
    const [one, two] = computeDocumentScopes(parseUnitDataStructured(data));
    const marks = [docStageKey(one, 'env.2.value'), docStageKey(two, 'env.2.value')];
    const deleted = [docStageKey(one, 'env.1.name'), docStageKey(one, 'env.1.value')];
    expect(keptMarks(data, marks, { deleted })).toEqual([docStageKey(two, 'env.2.value')]);
  });
});
