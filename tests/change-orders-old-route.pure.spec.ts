// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `changeOrdersPathFromOldRoute` (oldRoute.ts): where an old `/rollouts/...`
// link is sent. Pure, so no page and no server. `OldRouteRedirect` adds only the
// query string and hash, which react-router carries unchanged.

import { expect, test } from '@playwright/test';

import { changeOrdersPathFromOldRoute } from '../src/pages/change-orders/oldRoute';
import { COMPLETE_STAGE_ID } from '../src/pages/change-orders/changeOrderCompleteStep';
import { SOURCE_STAGE_ID } from '../src/pages/x/apps/change-order/changeOrderStages';

test('the bare old address goes to the console', () => {
  expect(changeOrdersPathFromOldRoute(undefined, undefined)).toBe('/change-orders');
});

test('a ChangeOrder keeps its slug', () => {
  expect(changeOrdersPathFromOldRoute('release-42', undefined)).toBe('/change-orders/release-42');
});

test('a real stage name passes through unchanged', () => {
  expect(changeOrdersPathFromOldRoute('release-42', 'prod')).toBe('/change-orders/release-42/prod');
});

test('the old synthetic stage ids open the same steps under their current ids', () => {
  expect(changeOrdersPathFromOldRoute('release-42', '__rollout_complete__')).toBe(
    `/change-orders/release-42/${COMPLETE_STAGE_ID}`,
  );
  expect(changeOrdersPathFromOldRoute('release-42', '__rollout_source__')).toBe(
    `/change-orders/release-42/${SOURCE_STAGE_ID}`,
  );
});

test('a stage name that needs escaping is escaped once', () => {
  expect(changeOrdersPathFromOldRoute('release-42', 'prod eu')).toBe('/change-orders/release-42/prod%20eu');
});
