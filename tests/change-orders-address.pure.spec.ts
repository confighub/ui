// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `resolveChangeOrderAddress` and `changeOrderPath` (changeOrderAddress.ts):
// which ChangeOrder a `/change-orders/...` URL opens, when ChangeOrders in
// different Spaces share a slug. Pure, so no page and no server.

import { expect, test } from '@playwright/test';

import {
  changeOrderPath,
  resolveChangeOrderAddress,
  type ChangeOrderRef,
} from '../src/pages/change-orders/changeOrderAddress';

const IN_FIRST: ChangeOrderRef = {
  spaceId: 's1',
  spaceSlug: 'fanui1-base',
  changeOrderId: 'co1',
  slug: 'release-v1.1.0',
};
const IN_SECOND: ChangeOrderRef = {
  spaceId: 's2',
  spaceSlug: 'fanui2-base',
  changeOrderId: 'co2',
  slug: 'release-v1.1.0',
};
const ALONE: ChangeOrderRef = { spaceId: 's1', spaceSlug: 'fanui1-base', changeOrderId: 'co3', slug: 'ten' };
const ORDERS = [IN_SECOND, IN_FIRST, ALONE];

test('no segments is the console', () => {
  expect(resolveChangeOrderAddress({}, ORDERS)).toEqual({ kind: 'none' });
});

test('the full address opens the ChangeOrder in that Space, whichever is listed first', () => {
  expect(resolveChangeOrderAddress({ space: 'fanui1-base', slug: 'release-v1.1.0' }, ORDERS)).toEqual({
    kind: 'found',
    order: IN_FIRST,
    stage: undefined,
    canonical: true,
  });
  expect(resolveChangeOrderAddress({ space: 'fanui2-base', slug: 'release-v1.1.0', stage: 'prod' }, ORDERS)).toEqual({
    kind: 'found',
    order: IN_SECOND,
    stage: 'prod',
    canonical: true,
  });
});

test('a full address with a stage that matches nothing is not found', () => {
  expect(resolveChangeOrderAddress({ space: 'fanui3-base', slug: 'release-v1.1.0', stage: 'prod' }, ORDERS)).toEqual({
    kind: 'notFound',
    label: 'fanui3-base/release-v1.1.0',
  });
});

test('a slug-only link to a unique slug opens it, to be replaced with the full address', () => {
  expect(resolveChangeOrderAddress({ space: 'ten' }, ORDERS)).toEqual({
    kind: 'found',
    order: ALONE,
    stage: undefined,
    canonical: false,
  });
  // Two segments that are no Space and ChangeOrder are a slug and a stage.
  expect(resolveChangeOrderAddress({ space: 'ten', slug: 'prod' }, ORDERS)).toEqual({
    kind: 'found',
    order: ALONE,
    stage: 'prod',
    canonical: false,
  });
});

test('a slug-only link to a shared slug lists the ChangeOrders, by Space', () => {
  expect(resolveChangeOrderAddress({ space: 'release-v1.1.0', slug: 'prod' }, ORDERS)).toEqual({
    kind: 'ambiguous',
    slug: 'release-v1.1.0',
    stage: 'prod',
    candidates: [IN_FIRST, IN_SECOND],
  });
});

test('a slug that matches nothing is not found', () => {
  expect(resolveChangeOrderAddress({ space: 'gone' }, ORDERS)).toEqual({ kind: 'notFound', label: 'gone' });
  expect(resolveChangeOrderAddress({ space: 'gone', slug: 'prod' }, ORDERS)).toEqual({
    kind: 'notFound',
    label: 'gone/prod',
  });
});

test('the path names the Space, and escapes each segment once', () => {
  expect(changeOrderPath('fanui1-base', 'release-v1.1.0')).toBe('/change-orders/fanui1-base/release-v1.1.0');
  expect(changeOrderPath('fanui1-base', 'release-v1.1.0', 'prod eu')).toBe(
    '/change-orders/fanui1-base/release-v1.1.0/prod%20eu',
  );
  // With no Space slug it is the slug-only form, which the page resolves.
  expect(changeOrderPath(undefined, 'ten', 'prod')).toBe('/change-orders/ten/prod');
});
