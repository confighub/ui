// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Add column list's sections: the Units and Spaces pages' column groups,
 * by header and order, with every explorer field under a heading by meaning,
 * then labels last; empty sections are left out.
 */
import { expect, test } from '@playwright/test';

import { UNIT_COLUMN_GROUPS } from '../src/components/unit-data-grid/unit-column-groups';
import { SPACE_COLUMN_GROUPS } from '../src/pages/space-list/components/spaces-table/space-column-groups';
import { type FieldDef, fieldCatalog } from '../src/pages/x/view-explorer/model/fields';
import type { EntityKind } from '../src/pages/x/view-explorer/model/types';
import {
  ADD_COLUMN_GROUPS,
  addColumnSections,
} from '../src/pages/x/view-explorer/table/add-column-sections';

const ENTITIES: EntityKind[] = ['Unit', 'Space', 'Resource'];

const titles = (entity: EntityKind, fields: readonly FieldDef[]) =>
  addColumnSections(entity, fields).map((s) => s.title);

const sectionOf = (entity: EntityKind, fields: readonly FieldDef[], id: string) =>
  addColumnSections(entity, fields).find((s) => s.fields.some((f) => f.id === id))?.title;

test('Units and Spaces use their list pages’ group headers, in the same order', () => {
  expect(ADD_COLUMN_GROUPS.Unit.map((g) => g.header)).toEqual(
    UNIT_COLUMN_GROUPS.map((g) => g.header),
  );
  expect(ADD_COLUMN_GROUPS.Space.map((g) => g.header)).toEqual(
    SPACE_COLUMN_GROUPS.map((g) => g.header),
  );
  // A field the list page groups is in the same group here.
  for (const [entity, listGroups] of [
    ['Unit', UNIT_COLUMN_GROUPS],
    ['Space', SPACE_COLUMN_GROUPS],
  ] as const) {
    const fields = fieldCatalog(entity);
    for (const g of listGroups)
      for (const id of g.columns)
        if (fields.some((f) => f.id === id))
          expect(sectionOf(entity, fields, id), id).toBe(g.header);
  }
});

test('every static field of every entity is under a heading by meaning', () => {
  for (const entity of ENTITIES) {
    const fields = fieldCatalog(entity);
    const headers = new Set(ADD_COLUMN_GROUPS[entity].map((g) => g.header));
    for (const f of fields)
      expect(headers.has(sectionOf(entity, fields, f.id) ?? ''), `${entity} ${f.id}`).toBe(
        true,
      );
  }
});

test('the explorer’s own fields go where they belong', () => {
  const unit = fieldCatalog('Unit');
  expect(sectionOf('Unit', unit, 'Slug')).toBe('Core Identity');
  expect(sectionOf('Unit', unit, 'DisplayName')).toBe('Core Identity');
  expect(sectionOf('Unit', unit, 'ProviderType')).toBe('Core Identity');
  expect(sectionOf('Unit', unit, 'Status')).toBe('Status & Health');
  expect(sectionOf('Unit', unit, 'LastReleasedRevisionNum')).toBe('Revisions');
  expect(sectionOf('Unit', unit, 'UpstreamRevisionNum')).toBe('Clone/Upstream');
  expect(sectionOf('Unit', unit, 'UpdatedAt')).toBe('Timestamps');

  const space = fieldCatalog('Space');
  expect(sectionOf('Space', space, 'DisplayName')).toBe('Core Identity');
  expect(sectionOf('Space', space, 'TotalUnitCount')).toBe('Units');
  expect(sectionOf('Space', space, 'TotalLinkCount')).toBe('Entities');

  const resource = fieldCatalog('Resource');
  expect(sectionOf('Resource', resource, 'ResourceType')).toBe('Core Identity');
  expect(sectionOf('Resource', resource, 'Unit.Target')).toBe('Unit');
  expect(sectionOf('Resource', resource, 'Space.Slug')).toBe('Space');
});

test('the order: groups, then labels and Space labels last; empty groups are left out', () => {
  const unit = fieldCatalog('Unit', ['app']);
  expect(titles('Unit', unit)).toEqual([
    'Core Identity',
    'Status & Health',
    'Revisions',
    'Timestamps',
    'Changes',
    'Clone/Upstream',
    'Labels',
  ]);
  expect(sectionOf('Unit', unit, 'Labels.app')).toBe('Labels');

  // Spaces have no Triggers and Release fields here, so that heading is not shown.
  expect(titles('Space', fieldCatalog('Space', ['team']))).toEqual([
    'Core Identity',
    'Units',
    'Entities',
    'Timestamps',
    'Labels',
  ]);
});

test('a search keeps only the headings with a match, and fields keep their catalog order', () => {
  const unit = fieldCatalog('Unit', ['revision']);
  const matches = unit.filter((f) => f.label.toLowerCase().includes('revision'));
  const sections = addColumnSections('Unit', matches);
  expect(sections.map((s) => s.title)).toEqual(['Revisions', 'Clone/Upstream', 'Labels']);
  expect(sections[0]!.fields.map((f) => f.id)).toEqual([
    'HeadRevisionNum',
    'LastReleasedRevisionNum',
  ]);
  expect(addColumnSections('Unit', [])).toEqual([]);
});

test('a field no group names falls back to Computed or Other', () => {
  const [slug] = fieldCatalog('Unit');
  const loose: FieldDef[] = [
    { ...slug!, id: 'Loose', category: 'field' },
    { ...slug!, id: 'LooseComputed', category: 'computed' },
  ];
  expect(titles('Unit', loose)).toEqual(['Computed', 'Other']);
});
