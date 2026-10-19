// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Components Overview's Release Problems column: for each Component, its
// Spaces whose running Release is reported out of sync, degraded or failed.
// Browser-free.

import { expect, test } from '@playwright/test';

import type { ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';

import { buildOverviewData } from '../src/pages/x/apps/componentOverview';
import type { LiveStatus, RunningRelease } from '../src/pages/x/apps/liveStatus';

const status = (fields: Partial<LiveStatus>): LiveStatus => ({
  Reporter: 'argobot',
  Sync: 'Synced',
  Health: 'Healthy',
  ...fields,
});

const component = (id: string, slug: string): ComponentRead => ({ ComponentID: id, Slug: slug }) as ComponentRead;
const COMPONENTS = new Map([
  ['c-cart', component('c-cart', 'cart')],
  ['c-api', component('c-api', 'api')],
]);

const space = (spaceId: string, slug: string, componentId: string): ExtendedSpaceRead =>
  ({ Space: { SpaceID: spaceId, Slug: slug, ComponentID: componentId } }) as ExtendedSpaceRead;
const SPACES = [
  space('s-cart-base', 'cart-base', 'c-cart'),
  space('s-cart-dev', 'cart-dev', 'c-cart'),
  space('s-cart-stage', 'cart-stage', 'c-cart'),
  space('s-cart-prod', 'cart-prod', 'c-cart'),
  space('s-api-dev', 'api-dev', 'c-api'),
  space('s-api-prod', 'api-prod', 'c-api'),
];

const running = (liveStatus: LiveStatus | null): RunningRelease => ({ releaseNum: 1, liveStatus });

test('a Space counts when its running Release is out of sync, degraded or failed', () => {
  const runningReleases = new Map([
    ['s-cart-dev', running(status({ Sync: 'OutOfSync' }))],
    ['s-cart-stage', running(status({ Health: 'Degraded' }))],
    ['s-cart-prod', running(status({ Operation: 'Failed', Health: undefined }))],
    ['s-api-dev', running(status({ Health: 'Progressing' }))],
    ['s-api-prod', running(null)],
  ]);
  const { rows, org } = buildOverviewData(SPACES, COMPONENTS, undefined, undefined, runningReleases);
  const byName = new Map(rows.map((row) => [row.componentName, row]));

  // Worst first, then by Space; the base Space runs no Release and is not listed.
  expect(byName.get('cart')!.liveProblems).toEqual([
    { spaceSlug: 'cart-prod', tone: 'danger', text: 'OutOfSync · Degraded' },
    { spaceSlug: 'cart-stage', tone: 'danger', text: 'Synced · Degraded' },
    { spaceSlug: 'cart-dev', tone: 'attention', text: 'OutOfSync · Healthy' },
  ]);
  // Progressing is in flight and an unreported Release says nothing: neither is a problem.
  expect(byName.get('api')!.liveProblems).toEqual([]);
  expect(org.liveProblems).toBe(3);
});

test('no problems before the running Releases are read', () => {
  const { rows, org } = buildOverviewData(SPACES, COMPONENTS);
  expect(rows.every((row) => row.liveProblems.length === 0)).toBe(true);
  expect(org.liveProblems).toBe(0);
});
