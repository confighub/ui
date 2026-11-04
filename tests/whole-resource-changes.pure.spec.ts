// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `withDocumentChanges` (wholeResourceChanges.ts): a resource added or deleted whole is
// read into path changes, so the Releases tab draws it as a tree.
//
//   cd ui && npx playwright test -c playwright.pure.config.ts whole-resource-changes
import type { ResourceDiff } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { buildConfigDiffTree } from '../src/components/config-diff/configDiffTree';
import { withDocumentChanges } from '../src/pages/x/apps/wholeResourceChanges';

const DOCUMENT = `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: web
          image: nginx:1.25
          args: []
`;

test('an added resource becomes one Add change per leaf, in document order', () => {
  const read = withDocumentChanges({ ChangeType: 'Add', ToValue: DOCUMENT });
  expect(read.ChangeType).toBe('Add');
  const rows = (read.Changes ?? []).map((c) => [
    (c.Segments ?? []).map((s) => s.Field ?? String(s.ToIndex)).join('.'),
    c.ChangeType,
    c.ToValue,
  ]);
  expect(rows).toEqual([
    ['apiVersion', 'Add', 'apps/v1'],
    ['kind', 'Add', 'Deployment'],
    ['spec.template.spec.containers.0.name', 'Add', 'web'],
    ['spec.template.spec.containers.0.image', 'Add', 'nginx:1.25'],
    ['spec.template.spec.containers.0.args', 'Add', '[]'],
  ]);
});

test('a deleted resource carries the old values', () => {
  const read = withDocumentChanges({ ChangeType: 'Delete', FromValue: 'a:\n  b: 1\n' });
  expect(read.Changes).toHaveLength(1);
  expect(read.Changes?.[0]).toMatchObject({ ChangeType: 'Delete', FromValue: '1' });
});

test('the read changes build a folder tree', () => {
  const read = withDocumentChanges({ ChangeType: 'Add', ToValue: DOCUMENT });
  const tree = buildConfigDiffTree(read.Changes ?? []);
  expect(tree.some((node) => node.type === 'folder')).toBe(true);
});

test('what is not a map or array document, or already holds changes, comes back as it was', () => {
  const text: ResourceDiff = { ChangeType: 'Add', ToValue: 'just text' };
  expect(withDocumentChanges(text)).toBe(text);
  const updated: ResourceDiff = { ChangeType: 'Update', Changes: [] };
  expect(withDocumentChanges(updated)).toBe(updated);
  const held: ResourceDiff = {
    ChangeType: 'Add',
    ToValue: 'a: 1',
    Changes: [{ ChangeType: 'Add' }],
  };
  expect(withDocumentChanges(held)).toBe(held);
});
