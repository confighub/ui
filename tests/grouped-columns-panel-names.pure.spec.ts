// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The names the data grids' Columns panel shows: every word of a field is capitalized, acronyms
 * stay together, and a label key is shown as written.
 */
import { expect, test } from '@playwright/test';

import { formatColumnFieldName } from '../src/components/entity-data-grid/utils/formatColumnFieldName';

test('a field becomes Title Case words', () => {
  expect(formatColumnFieldName('changeSet')).toBe('Change Set');
  expect(formatColumnFieldName('changeOrders')).toBe('Change Orders');
  expect(formatColumnFieldName('tags')).toBe('Tags');
  expect(formatColumnFieldName('userName')).toBe('User Name');
  expect(formatColumnFieldName('createdAt')).toBe('Created At');
});

test('an acronym stays one word', () => {
  expect(formatColumnFieldName('WorkerID')).toBe('Worker ID');
  expect(formatColumnFieldName('ChangeSetID')).toBe('Change Set ID');
  expect(formatColumnFieldName('RevisionNum')).toBe('Revision Num');
});

test('a label key is shown as written, without its group prefix', () => {
  expect(formatColumnFieldName('Labels.app.kubernetes.io/name', ['Labels.'])).toBe(
    'app.kubernetes.io/name',
  );
  expect(formatColumnFieldName('Labels.tier', ['Values.', 'Labels.'])).toBe('tier');
});
