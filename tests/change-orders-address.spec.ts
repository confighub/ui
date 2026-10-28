// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Which ChangeOrder a `/change-orders/...` URL opens when ChangeOrders in two
 * Spaces share a slug, against mocked API data: every API request is answered
 * here, so the org holds exactly the ChangeOrders each case needs. The
 * resolution rules themselves are in `change-orders-address.pure.spec.ts`; this
 * checks the page acts on them: the console's rows, the redirect, and the list
 * of candidates.
 */

import { expect, test, type Page, type Route } from '@playwright/test';

const ORG = 'a0000000-0000-4000-8000-000000000001';
const USER = 'b0000000-0000-4000-8000-000000000001';
const SHARED = 'release-v1-1-0';

const SPACES = [
  { id: 'c0000000-0000-4000-8000-000000000001', slug: 'fanui1-base' },
  { id: 'c0000000-0000-4000-8000-000000000002', slug: 'fanui2-base' },
];

const ORDERS = [
  { id: 'd0000000-0000-4000-8000-000000000002', space: SPACES[1], slug: SHARED, description: 'Second Space' },
  { id: 'd0000000-0000-4000-8000-000000000001', space: SPACES[0], slug: SHARED, description: 'First Space' },
  { id: 'd0000000-0000-4000-8000-000000000003', space: SPACES[0], slug: 'ten', description: 'Unique slug' },
];

function changeOrder(order: (typeof ORDERS)[number]) {
  return {
    ChangeOrder: {
      ChangeOrderID: order.id,
      OrganizationID: ORG,
      SpaceID: order.space.id,
      SpaceSlug: order.space.slug,
      Slug: order.slug,
      DisplayName: order.slug,
      Description: order.description,
      CreatedAt: '2026-10-06T12:00:00Z',
      InScopeSpaceIDs: [order.space.id],
    },
    Space: { SpaceID: order.space.id, Slug: order.space.slug },
  };
}

function b64(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function mockApi(page: Page): Promise<void> {
  const token = `${b64({ alg: 'none' })}.${b64({ exp: 4102444800, sub: USER })}.x`;
  await page.addInitScript((accessToken) => {
    sessionStorage.setItem('confighub_session', JSON.stringify({ accessToken, organizationId: 'org', idpClaims: {} }));
  }, token);

  // Nothing leaves the machine: index.html loads its fonts from Google, and page.goto waits for them.
  await page.route(
    (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    (route) => route.abort('blockedbyclient'),
  );

  await page.route('**/api/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/me') return json({ UserID: USER, DisplayName: 'Priya Raman', ExternalOrganizationID: 'org' });
    if (path === '/api/change_order') return json(ORDERS.map(changeOrder));
    const one = ORDERS.find((order) => path === `/api/space/${order.space.id}/change_order/${order.id}`);
    if (one !== undefined) return json(changeOrder(one));
    if (path === '/api/space') {
      return json(SPACES.map((space) => ({ Space: { SpaceID: space.id, Slug: space.slug, OrganizationID: ORG } })));
    }
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '{}' });
    if (path === '/api/info') return json({});
    return json([]);
  });
}

function summary(page: Page) {
  return page.getByRole('region', { name: 'ChangeOrder summary' });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('the full address opens the ChangeOrder in that Space, whichever the list returns first', async ({ page }) => {
  await page.goto(`/change-orders/fanui1-base/${SHARED}`);
  await expect(summary(page)).toContainText('First Space', { timeout: 30_000 });

  await page.goto(`/change-orders/fanui2-base/${SHARED}`);
  await expect(summary(page)).toContainText('Second Space', { timeout: 30_000 });
});

test('a slug-only link to a unique slug is replaced with the full address', async ({ page }) => {
  await page.goto('/change-orders/ten');
  await expect(page).toHaveURL(/\/change-orders\/fanui1-base\/ten$/, { timeout: 30_000 });
  await expect(summary(page)).toContainText('Unique slug');
});

test('a slug-only link to a shared slug lists the ChangeOrders, and each opens its own', async ({ page }) => {
  await page.goto(`/change-orders/${SHARED}/prod`);
  const candidates = page.getByTestId('change-order-candidates');
  await expect(candidates.getByRole('link')).toHaveText(
    [`fanui1-base/${SHARED}`, `fanui2-base/${SHARED}`],
    { timeout: 30_000 },
  );
  await candidates.getByRole('link', { name: `fanui2-base/${SHARED}` }).click();
  await expect(page).toHaveURL(new RegExp(`/change-orders/fanui2-base/${SHARED}/prod$`));
  await expect(summary(page)).toContainText('Second Space');
});

test('a console row opens its own ChangeOrder, not the first with its slug', async ({ page }) => {
  await page.goto('/change-orders');
  const rows = page.locator(`[data-change-order-slug="${SHARED}"]`);
  await expect(rows).toHaveCount(2, { timeout: 30_000 });
  await rows.filter({ hasText: 'fanui2-base' }).getByRole('link', { name: `Open ChangeOrder ${SHARED}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/change-orders/fanui2-base/${SHARED}$`));
  await expect(summary(page)).toContainText('Second Space');
});

test('an old /rollouts link reaches the full address', async ({ page }) => {
  await page.goto('/rollouts/ten');
  await expect(page).toHaveURL(/\/change-orders\/fanui1-base\/ten$/, { timeout: 30_000 });
});
