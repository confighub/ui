// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Where a Space's counts link, on the Space list and the Space page, and the Releases page's
// reading of the Space or Component a link names.

import { expect, test } from '@playwright/test';

import { releaseScope } from '../src/pages/releases/releaseScope';
import { SPACE_SUMMARY_COUNTS, spaceCountLink, spaceTriggersHref } from '../src/utility/space-summary-counts';

const SPACE = { SpaceID: '11111111-1111-4111-8111-111111111111', Slug: 'app-prod' };
const SPACE_WHERE = `SpaceID = '${SPACE.SpaceID}'`;

const filterWhere = (href: string) => new URLSearchParams(href.split('?')[1]).get('filterWhere');

const countLink = (field: string) => {
  const count = SPACE_SUMMARY_COUNTS.find((c) => c.field === field);
  if (!count) throw new Error(`no count ${field}`);
  return spaceCountLink(count)?.(SPACE);
};

test('Units links to the Units of the Space', () => {
  const href = countLink('TotalUnitCount')!;
  expect(href.startsWith('/units?')).toBe(true);
  expect(filterWhere(href)).toBe(SPACE_WHERE);
});

test('each other Unit count adds what it counts to the Space', () => {
  for (const count of SPACE_SUMMARY_COUNTS.filter((c) => c.unitWhere)) {
    const href = spaceCountLink(count)!(SPACE);
    expect(href.startsWith('/units?')).toBe(true);
    expect(filterWhere(href)).toBe(`${SPACE_WHERE} AND ${count.unitWhere}`);
  }
});

test('Targets and Links link to their lists filtered to the Space', () => {
  for (const [field, path] of [
    ['TotalTargetCount', '/targets'],
    ['TotalLinkCount', '/links'],
  ]) {
    const href = countLink(field)!;
    expect(href.startsWith(`${path}?`)).toBe(true);
    expect(filterWhere(href)).toBe(SPACE_WHERE);
  }
});

test('Triggers links to the Space page Triggers tab, and Applied Triggers to its applied view', () => {
  expect(countLink('TriggerCountByEventType')).toBe(`/spaces/${SPACE.SpaceID}?tab=1`);
  expect(spaceTriggersHref(SPACE.SpaceID, 'applied')).toBe(`/spaces/${SPACE.SpaceID}?tab=1&triggers=applied`);
});

test('the counts of entities with a list page link to it with the Space slug', () => {
  for (const [field, path] of [
    ['TotalReleaseCount', '/releases'],
    ['TotalChangeSetCount', '/change-sets'],
    ['TotalChangeOrderCount', '/change-orders'],
    ['TotalChangeWorkflowCount', '/change-workflows'],
    ['TotalChannelCount', '/channels'],
  ]) {
    expect(countLink(field)).toBe(`${path}?space=${SPACE.Slug}`);
  }
});

test('the counts of entities with no list page link nowhere', () => {
  for (const field of [
    'UnlinkedUnitCount',
    'TotalTagCount',
    'TotalFilterCount',
    'TotalViewCount',
    'TotalInvocationCount',
    'TotalAttributeCount',
  ]) {
    expect(countLink(field)).toBeUndefined();
  }
});

const COMPONENTS = { idBySlug: new Map([['app', 'c-app']]), slugById: new Map([['c-app', 'app']]) };
const SPACES = [
  { SpaceID: 's-dev', Slug: 'app-dev', ComponentID: 'c-app' },
  { SpaceID: 's-prod', Slug: 'app-prod', ComponentID: 'c-app' },
  { SpaceID: 's-loose', Slug: 'loose' },
];
const scope = (spaceSlug: string, componentSlug: string) =>
  releaseScope({
    spaces: SPACES,
    spaceSlug,
    componentSlug,
    componentIdBySlug: COMPONENTS.idBySlug,
    componentSlugById: COMPONENTS.slugById,
  });

test('a Space in the Releases URL lists its Releases under its Component', () => {
  expect(scope('app-prod', '')).toEqual({
    space: SPACES[1],
    componentId: 'c-app',
    componentSlug: 'app',
    spaceIds: ['s-prod'],
  });
});

test('a Space in no Component lists its Releases with no Component selected', () => {
  expect(scope('loose', '')).toEqual({ space: SPACES[2], componentId: undefined, componentSlug: '', spaceIds: ['s-loose'] });
});

test('a Space overrides a Component in the URL, and an unknown Space lists nothing', () => {
  expect(scope('app-dev', 'other').spaceIds).toEqual(['s-dev']);
  expect(scope('no-such-space', 'app')).toEqual({ space: undefined, componentId: undefined, componentSlug: '', spaceIds: [] });
});

test('a Component with no Space in the URL lists the Releases of all its Spaces', () => {
  expect(scope('', 'app')).toEqual({ componentId: 'c-app', componentSlug: 'app', spaceIds: ['s-dev', 's-prod'] });
  expect(scope('', 'unknown').spaceIds).toEqual([]);
});
