// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `insertedElementLabels` (diffTree.ts): an array element the upstream inserts is not in
// the Unit, so the rows of its leaves carry a made-up index after the array's last
// element (`fieldDiffsFromConfigDiff`, configDiffFieldDiffs.ts), which keeps their stage
// keys still. The Component view's tree shows the element with its index upstream, the
// position a commit gives it, and not the made-up index: the row of `env.4` reads
// `env.1`, and is still staged as `env.4`.
//
// Takes no `page` fixture and starts no browser:
//   cd ui && npx playwright test -c playwright.pure.config.ts component-inserted-element-label

import { expect, test } from '@playwright/test';

import type { ConfigDiff, PathChange, PathSegment } from '@confighub/rtk-query';

import { fieldDiffsFromConfigDiff, isWholeResourceChange, type KeyedFieldDiff } from '../src/pages/x/apps/configDiffFieldDiffs';
import { parseUnitDataStructured, type ArrayInsertion } from '../src/pages/x/apps/configParser';
import { computeDocumentScopes, docStageKey, insertedElementLabels } from '../src/pages/x/apps/diffTree';

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

const field = (name: string): PathSegment => ({ Field: name, FromIndex: -1, ToIndex: -1 });

/** The Diff's Add of env var `name` at `toIndex` upstream. */
const addEnv = (name: string, toIndex: number): PathChange => ({
  ChangeType: 'Add',
  Segments: [field('env'), { MergeKeys: [{ Key: 'name', Value: name }], FromIndex: -1, ToIndex: toIndex }],
  ToValue: `name: ${name}\nvalue: ${name.toLowerCase()}`,
  ToDataType: 'YAML',
});

/** The upgrade's rows for the tree drawing `data`, as the Component view builds them. */
function upgradeRows(data: string, changes: PathChange[], resource?: { ResourceType: string; ResourceName: string }): KeyedFieldDiff[] {
  const diff: ConfigDiff = { Resources: [{ Resource: resource, ChangeType: 'Update', Changes: changes }] };
  return fieldDiffsFromConfigDiff(diff, data, { treeSide: 'from' })
    .filter((row): row is KeyedFieldDiff => !isWholeResourceChange(row));
}

/** The labels as the Component view builds them: from each row's stage key and insertion. */
function labelsOf(rows: KeyedFieldDiff[]): Map<string, string> {
  return insertedElementLabels(rows.flatMap((r): [string, ArrayInsertion][] => (r.insertion ? [[r.key, r.insertion]] : [])));
}

test.describe('an inserted element reads as its upstream index', () => {
  test('an env var inserted at upstream index 1 reads env.1, and is keyed env.4', () => {
    const rows = upgradeRows(ENV_ABCD, [addEnv('X', 1)]);
    expect(rows.map((r) => r.key).sort()).toEqual(['env.4.name', 'env.4.value']);
    expect(labelsOf(rows)).toEqual(new Map([['env.4', '1']]));
  });

  test('two inserted env vars each read as their own upstream index', () => {
    // Upstream: A X B Y C D.
    const labels = labelsOf(upgradeRows(ENV_ABCD, [addEnv('X', 1), addEnv('Y', 3)]));
    expect(labels).toEqual(new Map([['env.4', '1'], ['env.5', '3']]));
  });

  test('an element appended upstream reads as the index it is appended at', () => {
    expect(labelsOf(upgradeRows(ENV_ABCD, [addEnv('E', 4)]))).toEqual(new Map([['env.4', '4']]));
  });

  test('a scalar inserted into a list reads as its upstream index', () => {
    const rows = upgradeRows('args:\n  - a\n  - b\n  - c\n', [{
      ChangeType: 'Add',
      Segments: [field('args'), { FromIndex: -1, ToIndex: 1 }],
      ToValue: 'x',
      ToDataType: 'string',
    }]);
    expect(rows.map((r) => r.key)).toEqual(['args.3']);
    expect(labelsOf(rows)).toEqual(new Map([['args.3', '1']]));
  });

  test('an element inserted in one document is labelled in that document only', () => {
    const doc = (name: string) => `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${name}\n${ENV_ABCD}`;
    const data = `${doc('one')}---\n${doc('two')}`;
    const scopes = computeDocumentScopes(parseUnitDataStructured(data));
    const two = scopes[1]!;
    const rows = upgradeRows(data, [addEnv('X', 2)], { ResourceType: two.resource!.ResourceType!, ResourceName: two.resource!.ResourceName! });
    expect(labelsOf(rows)).toEqual(new Map([[docStageKey(two, 'env.4'), '2']]));
    expect(labelsOf(rows).has(docStageKey(scopes[0], 'env.4'))).toBe(false);
  });

  test('an element the Unit holds has no label', () => {
    const rows = upgradeRows(ENV_ABCD, [{
      ChangeType: 'Update',
      Segments: [field('env'), { MergeKeys: [{ Key: 'name', Value: 'B' }], FromIndex: 1, ToIndex: 1 }, field('value')],
      FromValue: 'b',
      ToValue: 'b2',
      FromDataType: 'string',
      ToDataType: 'string',
    }]);
    expect(rows.map((r) => r.key)).toEqual(['env.1.value']);
    expect(labelsOf(rows).size).toBe(0);
  });
});
