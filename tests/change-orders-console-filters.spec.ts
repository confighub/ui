// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeOrders console's Update type and Created filters, against mocked
 * API data: every API request is answered here, so the org holds exactly the
 * ChangeOrders each case needs. The rules themselves are in
 * `change-orders-console-filters.pure.spec.ts`; this checks the controls drive
 * them, together with the rest of the bar and Clear filters.
 */

import { expect, test, type Page, type Route } from '@playwright/test';

const ORG = 'a0000000-0000-4000-8000-000000000001';
const USER = 'b0000000-0000-4000-8000-000000000001';
const SPACE = { id: 'c0000000-0000-4000-8000-000000000001', slug: 'checkout-base' };

const ORDERS = [
  // No UpdateType: the server's default, UpgradeUnit.
  { id: 'd0000000-0000-4000-8000-000000000001', slug: 'bump-image', updateType: undefined, createdAt: '2026-09-28T10:00:00Z' },
  { id: 'd0000000-0000-4000-8000-000000000002', slug: 'merge-base', updateType: 'MergeUnits', createdAt: '2026-10-02T10:00:00Z' },
  { id: 'd0000000-0000-4000-8000-000000000003', slug: 'restart-pods', updateType: 'Invoke', createdAt: '2026-10-05T23:30:00Z' },
  { id: 'd0000000-0000-4000-8000-000000000004', slug: 'rotate-certs', updateType: 'Invoke', createdAt: '2026-10-06T00:30:00Z' },
];

function changeOrder(order: (typeof ORDERS)[number]) {
  return {
    ChangeOrder: {
      ChangeOrderID: order.id,
      OrganizationID: ORG,
      SpaceID: SPACE.id,
      SpaceSlug: SPACE.slug,
      Slug: order.slug,
      DisplayName: order.slug,
      ...(order.updateType !== undefined ? { UpdateType: order.updateType } : {}),
      CreatedAt: order.createdAt,
      InScopeSpaceIDs: [SPACE.id],
    },
    Space: { SpaceID: SPACE.id, Slug: SPACE.slug },
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
    if (path === '/api/space') return json([{ Space: { SpaceID: SPACE.id, Slug: SPACE.slug, OrganizationID: ORG } }]);
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '{}' });
    if (path === '/api/info') return json({});
    return json([]);
  });
}

async function openConsole(page: Page) {
  await mockApi(page);
  await page.goto('/change-orders');
  await expect(page.locator('[data-change-order-slug]')).toHaveCount(ORDERS.length, { timeout: 30_000 });
}

function shownSlugs(page: Page) {
  return page.locator('[data-change-order-slug]');
}

// The day boundary below is checked in one zone, so the 23:30 and 00:30 rows fall on known days.
test.use({ timezoneId: 'UTC' });

test('Update type offers the types on the list, an absent one as UpgradeUnit, and narrows to one', async ({ page }) => {
  await openConsole(page);
  const select = page.getByLabel('Update type');
  await expect(select.locator('option')).toHaveText(['All update types', 'Invoke', 'MergeUnits', 'UpgradeUnit']);

  await select.selectOption('Invoke');
  await expect(shownSlugs(page)).toHaveCount(2);
  await expect(page.locator('[data-change-order-slug="restart-pods"]')).toBeVisible();
  await expect(page.locator('[data-change-order-slug="rotate-certs"]')).toBeVisible();

  await select.selectOption('UpgradeUnit');
  await expect(shownSlugs(page)).toHaveCount(1);
  await expect(page.locator('[data-change-order-slug="bump-image"]')).toBeVisible();
});

test('Created narrows to whole days, either end open, and combines with Update type', async ({ page }) => {
  await openConsole(page);
  const from = page.getByLabel('Created from');
  const to = page.getByLabel('to', { exact: true });

  await from.fill('2026-10-02');
  await expect(shownSlugs(page)).toHaveCount(3);

  await to.fill('2026-10-05');
  await expect(shownSlugs(page)).toHaveCount(2);
  await expect(page.locator('[data-change-order-slug="merge-base"]')).toBeVisible();
  await expect(page.locator('[data-change-order-slug="restart-pods"]')).toBeVisible();

  await page.getByLabel('Update type').selectOption('Invoke');
  await expect(shownSlugs(page)).toHaveCount(1);
  await expect(page.locator('[data-change-order-slug="restart-pods"]')).toBeVisible();

  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(shownSlugs(page)).toHaveCount(ORDERS.length);
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');
  await expect(page.getByLabel('Update type')).toHaveValue('all');
});
