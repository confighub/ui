// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Releases page's heatmap: one row per Component, one column
// per day, each cell the Releases of the Component's Spaces that day, coloured
// by the worst live status among them. Browser-free.

import { expect, test } from '@playwright/test';

import type { ComponentRead, ExtendedReleaseRead, ExtendedSpaceRead } from '@confighub/rtk-query';

import { type LiveStatus, releaseTone } from '../src/pages/x/apps/liveStatus';
import {
  buildReleaseHeatmap,
  dayKey,
  heatmapDays,
  heatmapSince,
  heatmapWindow,
} from '../src/pages/releases/releaseHeatmap';

const status = (fields: Partial<LiveStatus>): LiveStatus => ({
  Reporter: 'argobot',
  Sync: 'Synced',
  Health: 'Healthy',
  ...fields,
});

const GREEN = status({});
const DEGRADED = status({ Health: 'Degraded' });
const OUT_OF_SYNC = status({ Sync: 'OutOfSync' });

const component = (id: string, slug: string): ComponentRead => ({ ComponentID: id, Slug: slug }) as ComponentRead;
const COMPONENTS = new Map([
  ['c-cart', component('c-cart', 'cart')],
  ['c-api', component('c-api', 'api')],
]);

const space = (spaceId: string, slug: string, componentId?: string): ExtendedSpaceRead =>
  ({ Space: { SpaceID: spaceId, Slug: slug, ComponentID: componentId } }) as ExtendedSpaceRead;
const SPACES = [
  space('s-cart-dev', 'cart-dev', 'c-cart'),
  space('s-cart-prod', 'cart-prod', 'c-cart'),
  space('s-api-dev', 'api-dev', 'c-api'),
  space('s-loose', 'loose'),
];

let nextNum = 1;
const release = (
  spaceId: string,
  createdAt: string,
  liveStatus?: LiveStatus,
  published = true,
): ExtendedReleaseRead => {
  const releaseNum = nextNum++;
  return {
    Release: {
      ReleaseID: `${spaceId}-r${releaseNum}`,
      SpaceID: spaceId,
      ReleaseNum: releaseNum,
      CreatedAt: createdAt,
      Published: published,
      ...(liveStatus && { LiveStatus: liveStatus }),
    },
  } as ExtendedReleaseRead;
};

// Local noon, so the day a time falls on does not depend on the time zone the test runs in.
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString();
const DAYS = heatmapDays(3, new Date(at('2026-10-14')));

// ── One tone per Release ────────────────────────────────────────────────────

test('a Release reads as the worse of its sync and health', () => {
  expect(releaseTone(GREEN)).toBe('ok');
  expect(releaseTone(DEGRADED)).toBe('danger');
  expect(releaseTone(OUT_OF_SYNC)).toBe('attention');
  expect(releaseTone(status({ Sync: 'OutOfSync', Health: 'Degraded' }))).toBe('danger');
  expect(releaseTone(status({ Operation: 'Running', Health: 'Progressing' }))).toBe('progress');
});

test('a Release nobody has reported on, or reported only as Unknown, is neutral, never ok', () => {
  expect(releaseTone(null)).toBe('neutral');
  expect(releaseTone(status({ Sync: 'Unknown', Health: 'Unknown' }))).toBe('neutral');
  expect(releaseTone(status({ Health: 'Suspended' }))).toBe('neutral');
});

// ── Days ────────────────────────────────────────────────────────────────────

test('the days end with today, oldest first, and the read starts with the first of them', () => {
  expect(DAYS).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  expect(heatmapSince(3, new Date(at('2026-10-14')))).toBe(new Date('2026-10-12T00:00:00').toISOString().replace('.000Z', 'Z'));
});

// ── Rows and cells ──────────────────────────────────────────────────────────

test('every Component gets a row, sorted by name, whether or not it released', () => {
  const heatmap = buildReleaseHeatmap([release('s-cart-dev', at('2026-10-13'), GREEN)], SPACES, COMPONENTS, DAYS);
  expect(heatmap.rows.map((r) => r.componentName)).toEqual(['api', 'cart']);
  expect(heatmap.rows[0].cells.size).toBe(0);
});

test('a cell holds the Releases of all the Component’s Spaces that day, newest first, in the worst tone among them', () => {
  const heatmap = buildReleaseHeatmap(
    [
      release('s-cart-dev', at('2026-10-13', 9), GREEN),
      release('s-cart-prod', at('2026-10-13', 15), DEGRADED),
      release('s-cart-dev', at('2026-10-13', 11), OUT_OF_SYNC),
    ],
    SPACES,
    COMPONENTS,
    DAYS,
  );
  const cell = heatmap.rows.find((r) => r.componentName === 'cart')!.cells.get('2026-10-13')!;
  expect(cell.tone).toBe('danger');
  expect(cell.releases.map((r) => [r.spaceSlug, r.tone])).toEqual([
    ['cart-prod', 'danger'],
    ['cart-dev', 'attention'],
    ['cart-dev', 'ok'],
  ]);
  expect(heatmap.maxCount).toBe(3);
  expect(heatmap.releaseCount).toBe(3);
});

test('one healthy Release does not hide an unreported one', () => {
  const heatmap = buildReleaseHeatmap(
    [release('s-api-dev', at('2026-10-14', 9), GREEN), release('s-api-dev', at('2026-10-14', 10))],
    SPACES,
    COMPONENTS,
    DAYS,
  );
  expect(heatmap.rows.find((r) => r.componentName === 'api')!.cells.get('2026-10-14')!.tone).toBe('neutral');
});

test('a withdrawn Release still counts on the day it was released', () => {
  const heatmap = buildReleaseHeatmap([release('s-api-dev', at('2026-10-12'), GREEN, false)], SPACES, COMPONENTS, DAYS);
  const released = heatmap.rows.find((r) => r.componentName === 'api')!.cells.get('2026-10-12')!.releases;
  expect(released).toHaveLength(1);
  expect(released[0].published).toBe(false);
});

test('Releases outside the days, or of a Space with no Component, are left out', () => {
  const heatmap = buildReleaseHeatmap(
    [release('s-cart-dev', at('2026-10-11'), GREEN), release('s-loose', at('2026-10-13'), GREEN)],
    SPACES,
    COMPONENTS,
    DAYS,
  );
  expect(heatmap.releaseCount).toBe(0);
  expect(heatmap.rows.every((r) => r.cells.size === 0)).toBe(true);
});

test('a Release is placed on the local day it was created', () => {
  const late = new Date('2026-10-13T23:30:00');
  expect(dayKey(late.toISOString())).toBe('2026-10-13');
});

test('a selected Component is shown among its neighbours, as many rows at either end', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((componentId) => ({ componentId }));
  const ids = (selected: string) => heatmapWindow(rows, selected, 2).map((row) => row.componentId);
  expect(ids('d')).toEqual(['b', 'c', 'd', 'e', 'f']);
  expect(ids('a')).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(ids('g')).toEqual(['c', 'd', 'e', 'f', 'g']);
  expect(heatmapWindow(rows.slice(0, 3), 'b', 2).map((row) => row.componentId)).toEqual(['a', 'b', 'c']);
  expect(heatmapWindow(rows, 'missing', 2)).toHaveLength(7);
});
