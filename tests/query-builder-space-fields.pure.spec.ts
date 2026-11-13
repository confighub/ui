// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The filters of the Space and Link lists, and the reading of where expressions they share.
//
// The Space list's filters on the entities a Space refers to -- its Release
// Target, Component, Trigger Filter and Upstream Space -- written to a where
// expression and read back into the same filters.

import { expect, test } from '@playwright/test';

// Imported from the specific modules rather than the `query-builder` barrel,
// which pulls in MUI through a path Node's own resolver cannot follow.
import { buildWhereClauses } from '../src/components/query-builder/where-clause-builder';
import {
  getAvailableFieldsForEntity,
  getOfferedFieldsForEntity,
} from '../src/components/query-builder/operators';
import { parseWhereClausesToFilters } from '../src/components/query-builder/where-clause-parser';

const SPACE_FIELDS = getAvailableFieldsForEntity('Space');
const UNIT_FIELDS = getAvailableFieldsForEntity('Unit');

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

function parse(where: string, fields = SPACE_FIELDS) {
  return parseWhereClausesToFilters(where, '', '', [], undefined, fields);
}

const cases: Array<{ where: string; field: string; operator: string; value: string }> = [
  { where: `ReleaseTargetID = '${ID1}'`, field: 'releaseTarget', operator: 'equals', value: ID1 },
  { where: `ReleaseTargetID IN ('${ID1}', '${ID2}')`, field: 'releaseTarget', operator: 'in', value: `${ID1},${ID2}` },
  { where: `ComponentID != '${ID1}'`, field: 'component', operator: 'notEquals', value: ID1 },
  { where: `TriggerFilterID NOT IN ('${ID1}', '${ID2}')`, field: 'triggerFilter', operator: 'notIn', value: `${ID1},${ID2}` },
  { where: 'UpstreamSpaceID IS NOT NULL', field: 'upstreamSpace', operator: 'exists', value: '' },
  { where: 'ReleaseTargetID IS NULL', field: 'releaseTarget', operator: 'notExists', value: '' },
  { where: `SpaceID = '${ID1}'`, field: 'spaceId', operator: 'equals', value: ID1 },
];

for (const c of cases) {
  test(`${c.where} reads as one ${c.field} filter and writes back unchanged`, () => {
    const filters = parse(c.where);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ field: c.field, operator: c.operator, value: c.value });
    expect(buildWhereClauses(filters).where).toBe(c.where);
  });
}

test('the reference filters combine with label filters', () => {
  const where = `Labels.Tier = 'prod' AND ComponentID = '${ID1}' AND ReleaseTargetID IS NULL`;
  const filters = parse(where);
  expect(filters.map((f) => f.field)).toEqual(['labels', 'component', 'releaseTarget']);
  expect(buildWhereClauses(filters).where).toBe(where);
});

test('a Unit list still reads SpaceID as its Space filter', () => {
  const filters = parse(`SpaceID = '${ID1}'`, UNIT_FIELDS);
  expect(filters[0].field).toBe('space');
});

test('a null test on a field that offers none stays a raw where', () => {
  const filters = parse('Slug IS NULL');
  expect(filters).toHaveLength(1);
  expect(filters[0]).toMatchObject({ field: 'where', operator: 'raw', value: 'Slug IS NULL' });
});

test('a reference field is offered only to a caller that passes its options', () => {
  const without = getOfferedFieldsForEntity('Space');
  expect(without).not.toContain('releaseTarget');
  expect(without).toContain('spaceId');

  const withOptions = getOfferedFieldsForEntity('Space', { releaseTarget: [] });
  expect(withOptions).toContain('releaseTarget');
  expect(withOptions).not.toContain('component');
});

const LINK_FIELDS = getAvailableFieldsForEntity('Link');
const TRIGGER_FIELDS = getAvailableFieldsForEntity('Trigger');

const linkCases: Array<{ where: string; field: string; operator: string; value: string; fields?: typeof LINK_FIELDS }> = [
  { where: "UpdateType IN ('MergeUnits', 'UpgradeUnit')", field: 'updateType', operator: 'in', value: 'MergeUnits,UpgradeUnit' },
  { where: 'AutoUpdate = true', field: 'autoUpdate', operator: 'equals', value: 'true' },
  { where: 'Stale = false', field: 'stale', operator: 'equals', value: 'false' },
  { where: `ToSpaceID = '${ID1}'`, field: 'toSpace', operator: 'equals', value: ID1 },
  { where: `SpaceID = '${ID2}'`, field: 'space', operator: 'equals', value: ID2 },
  // The same reading of unquoted literals serves the Trigger and Unit fields that take them.
  { where: 'Disabled = true', field: 'disabled', operator: 'equals', value: 'true', fields: TRIGGER_FIELDS },
  { where: 'HeadRevisionNum >= 3', field: 'headRevisionNum', operator: 'greaterOrEqual', value: '3', fields: UNIT_FIELDS },
];

for (const c of linkCases) {
  test(`${c.where} reads as one ${c.field} filter and writes back unchanged`, () => {
    const filters = parse(c.where, c.fields ?? LINK_FIELDS);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ field: c.field, operator: c.operator, value: c.value });
    expect(buildWhereClauses(filters).where).toBe(c.where);
  });
}

test('an unquoted literal on a field that takes none stays a raw where', () => {
  const filters = parse('Slug = 3', LINK_FIELDS);
  expect(filters[0]).toMatchObject({ field: 'where', operator: 'raw', value: 'Slug = 3' });
});
