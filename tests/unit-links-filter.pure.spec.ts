// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The unit detail page's Links tab filters, which another page sets through the URL to open
// the tab on the Links it is about.
import { expect, test } from '@playwright/test';

import {
  NO_LINK_FILTER,
  filterLinkRows,
  readLinkFilter,
  unitConfigHref,
  unitLinksHref,
} from '../src/pages/unit-detail/unitDetailHrefs';

const unit = { unitId: 'deployment', spaceId: 'staging' };

function link(slug: string, from: string, fromSpace: string, to: string, toSpace: string, updateType: string) {
  return { Link: { Slug: slug, FromUnitID: from, SpaceID: fromSpace, ToUnitID: to, ToSpaceID: toSpace, UpdateType: updateType } };
}

const rows = [
  link('stable-image', 'deployment', 'staging', 'facts', 'registry-facts', 'TransformPaths'),
  link('configmap-hash', 'deployment', 'staging', 'configmap', 'staging', 'TransformPaths'),
  link('upgrade', 'deployment', 'staging', 'base-deployment', 'base', 'UpgradeUnit'),
  link('to-me', 'other', 'staging', 'deployment', 'staging', 'NeedsProvides'),
  link('to-me-from-prod', 'prod-deployment', 'prod', 'deployment', 'staging', 'UpgradeUnit'),
];

function slugs(filtered: typeof rows) {
  return filtered.map((row) => row.Link.Slug);
}

test('a ChangeOrder opens the Links of its type into other Spaces', () => {
  const href = unitLinksHref('staging', 'deployment', {
    updateType: 'TransformPaths',
    otherSpacesOnly: true,
    direction: 'from',
  });
  expect(href).toBe('/units/staging/deployment?tab=3&linkUpdateType=TransformPaths&linkSpaces=other&linkDirection=from');
  const filter = readLinkFilter(new URLSearchParams(href.split('?')[1]));
  expect(slugs(filterLinkRows(rows, filter, unit))).toEqual(['stable-image']);
});

test('other Spaces are judged by the far end of the Link, either way round', () => {
  const filter = { ...NO_LINK_FILTER, otherSpacesOnly: true };
  expect(slugs(filterLinkRows(rows, filter, unit))).toEqual(['stable-image', 'upgrade', 'to-me-from-prod']);
});

test('direction keeps the Links from or to the unit', () => {
  expect(slugs(filterLinkRows(rows, { ...NO_LINK_FILTER, direction: 'to' }, unit))).toEqual(['to-me', 'to-me-from-prod']);
  expect(slugs(filterLinkRows(rows, { ...NO_LINK_FILTER, direction: 'from' }, unit))).toEqual([
    'stable-image',
    'configmap-hash',
    'upgrade',
  ]);
});

test('no filter is no parameters, and keeps every Link', () => {
  expect(unitLinksHref('s', 'u')).toBe('/units/s/u?tab=3');
  expect(readLinkFilter(new URLSearchParams('tab=3'))).toEqual(NO_LINK_FILTER);
  expect(filterLinkRows(rows, NO_LINK_FILTER, unit)).toHaveLength(rows.length);
});

test('a unit link opens its Config tab', () => {
  expect(unitConfigHref('s', 'u')).toBe('/units/s/u?tab=1');
});
