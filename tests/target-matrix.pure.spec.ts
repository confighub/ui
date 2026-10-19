// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Target Overview's matrix: Components down, Targets across, each cell the
// Component's Spaces on the Target, the Release each runs there and the
// resources its Units hold for it. Browser-free.

import { expect, test } from '@playwright/test';

import type { ComponentRead, ExtendedSpaceRead, ExtendedTargetRead } from '@confighub/rtk-query';

import {
  buildTargetMatrix,
  countResources,
  spaceTargetKey,
} from '../src/pages/target-overview/targetMatrix';
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
  ['c-idle', component('c-idle', 'idle')],
]);

const space = (spaceId: string, componentId: string, releaseTargetId?: string, variant?: string): ExtendedSpaceRead =>
  ({
    Space: {
      SpaceID: spaceId,
      Slug: spaceId,
      ComponentID: componentId,
      ReleaseTargetID: releaseTargetId,
      Labels: variant ? { Variant: variant } : {},
    },
  }) as ExtendedSpaceRead;

const target = (targetId: string, slug: string, spaceSlug: string, version?: string): ExtendedTargetRead =>
  ({
    Target: {
      TargetID: targetId,
      Slug: slug,
      SpaceSlug: spaceSlug,
      Facts: version ? { 'Cluster.KubernetesVersion': version } : {},
    },
  }) as ExtendedTargetRead;

const TARGETS = [
  target('t-prod', 'k8s', 'prod-cluster', '1.31.2'),
  target('t-dev', 'k8s', 'dev-cluster'),
  target('t-unused', 'k8s', 'spare-cluster', '1.30.0'),
];

const running = (releaseNum: number, liveStatus: LiveStatus | null): RunningRelease => ({
  releaseId: `r${releaseNum}`,
  releaseNum,
  liveStatus,
});

const resource = (spaceId: string, targetId?: string) => ({ Resource: { SpaceID: spaceId, TargetID: targetId } });

test('cells hold each Space on the Target, its running Release and its resources', () => {
  const spaces = [
    space('cart-dev', 'c-cart', 't-dev', 'dev'),
    space('cart-prod-us', 'c-cart', 't-prod', 'prod'),
    space('cart-prod-eu', 'c-cart', 't-prod', 'prod'),
    space('cart-base', 'c-cart'),
    // Units on the prod Target, but releasing nowhere.
    space('api-prod', 'c-api'),
    space('idle-dev', 'c-idle'),
  ];
  const releases = new Map([
    ['cart-dev', running(3, status({}))],
    ['cart-prod-us', running(7, status({ Sync: 'OutOfSync' }))],
    ['cart-prod-eu', running(5, status({ Health: 'Degraded' }))],
  ]);
  const resources = countResources([
    resource('cart-dev', 't-dev'),
    resource('cart-dev', 't-dev'),
    resource('cart-prod-us', 't-prod'),
    resource('cart-prod-us', 't-prod'),
    resource('cart-prod-eu', 't-prod'),
    resource('api-prod', 't-prod'),
    resource('idle-dev'),
  ]);
  expect(resources.get(spaceTargetKey('cart-dev', 't-dev'))).toBe(2);

  const matrix = buildTargetMatrix(spaces, COMPONENTS, TARGETS, releases, resources);

  // Only Targets something is on, by their Space; the version from the Target's facts.
  expect(matrix.columns).toEqual([
    { targetId: 't-dev', slug: 'k8s', spaceSlug: 'dev-cluster', kubernetesVersion: undefined },
    { targetId: 't-prod', slug: 'k8s', spaceSlug: 'prod-cluster', kubernetesVersion: '1.31.2' },
  ]);
  // A Component on no Target has no row.
  expect(matrix.rows.map((row) => row.componentName)).toEqual(['api', 'cart']);

  const [api, cart] = matrix.rows;
  const cartProd = cart.cells.get('t-prod')!;
  expect(cartProd.tone).toBe('danger');
  expect(cartProd.resourceCount).toBe(3);
  // Worst first.
  expect(cartProd.deployments.map((d) => [d.spaceSlug, d.release?.releaseNum, d.tone, d.resourceCount])).toEqual([
    ['cart-prod-eu', 5, 'danger', 1],
    ['cart-prod-us', 7, 'attention', 2],
  ]);
  expect(cart.cells.get('t-dev')!.tone).toBe('ok');

  // Units on a Target with no Release there.
  const apiProd = api.cells.get('t-prod')!;
  expect(apiProd.tone).toBeNull();
  expect(apiProd.deployments).toEqual([
    { spaceId: 'api-prod', spaceSlug: 'api-prod', variant: undefined, release: null, tone: null, resourceCount: 1 },
  ]);
  expect(api.cells.has('t-dev')).toBe(false);
});

test('a Release is placed only on the Space\'s current release Target', () => {
  // The Space releases to dev now, while one of its Units is still on prod.
  const spaces = [space('cart-dev', 'c-cart', 't-dev')];
  const releases = new Map([['cart-dev', running(2, status({}))]]);
  const resources = countResources([resource('cart-dev', 't-prod')]);
  const [cart] = buildTargetMatrix(spaces, COMPONENTS, TARGETS, releases, resources).rows;
  expect(cart.cells.get('t-dev')!.deployments[0].release?.releaseNum).toBe(2);
  expect(cart.cells.get('t-dev')!.resourceCount).toBe(0);
  expect(cart.cells.get('t-prod')!.deployments[0].release).toBeNull();
});
