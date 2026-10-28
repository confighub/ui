// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeSets list's sortable column heads, against mocked API data: every API
 * request is answered here, so the org holds exactly the four ChangeSets below.
 * The sorting rules themselves are in `console-table-sort.pure.spec.ts`; this
 * checks the heads drive them on the page, that the list's own order holds until
 * one is clicked, and that the columns read row by row do not sort.
 */

import { expect, test, type Page, type Route } from '@playwright/test';

const ORG = 'a0000000-0000-4000-8000-000000000001';
const VIEWER = 'b0000000-0000-4000-8000-000000000001';
const SPACE = { id: 'c0000000-0000-4000-8000-000000000001', slug: 'payments' };
const USERS = {
  ana: { id: 'b0000000-0000-4000-8000-000000000002', name: 'Ana Ortiz' },
  mia: { id: 'b0000000-0000-4000-8000-000000000003', name: 'Mia Chen' },
  zoe: { id: 'b0000000-0000-4000-8000-000000000004', name: 'Zoe Park' },
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** Listed out of the console's order, so a pass cannot come from the response's own order. */
function changeSets() {
  return [
    { id: 'd0000000-0000-4000-8000-000000000001', slug: 'delta-closed', state: 'Closed', updated: 1, created: 300, user: USERS.zoe.id },
    { id: 'd0000000-0000-4000-8000-000000000002', slug: 'alpha-open', state: 'Open', updated: 60, created: 10, user: USERS.mia.id },
    { id: 'd0000000-0000-4000-8000-000000000003', slug: 'charlie-new', state: 'New', updated: 5, created: 120, user: USERS.ana.id },
    { id: 'd0000000-0000-4000-8000-000000000004', slug: 'bravo-open', state: 'Open', updated: 2, created: 2000 },
  ].map((cs) => ({
    ChangeSet: {
      ChangeSetID: cs.id,
      OrganizationID: ORG,
      SpaceID: SPACE.id,
      SpaceSlug: SPACE.slug,
      Slug: cs.slug,
      DisplayName: cs.slug,
      State: cs.state,
      CreatedAt: minutesAgo(cs.created),
      UpdatedAt: minutesAgo(cs.updated),
      ...(cs.user ? { UserID: cs.user } : {}),
    },
  }));
}

/** The console's own order: Open, New, Closed, and most recently changed first within each. */
const DEFAULT_ORDER = ['bravo-open', 'alpha-open', 'charlie-new', 'delta-closed'];

function b64(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function mockApi(page: Page): Promise<void> {
  const token = `${b64({ alg: 'none' })}.${b64({ exp: 4102444800, sub: VIEWER })}.x`;
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
    if (path === '/api/me') return json({ UserID: VIEWER, DisplayName: 'Priya Raman', ExternalOrganizationID: 'org' });
    if (path === '/api/change_set') return json(changeSets());
    if (path === '/api/user') return json(Object.values(USERS).map((u) => ({ User: { UserID: u.id, DisplayName: u.name } })));
    if (path === '/api/space') return json([{ Space: { SpaceID: SPACE.id, Slug: SPACE.slug, OrganizationID: ORG } }]);
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '{}' });
    if (path === '/api/info') return json({});
    return json([]);
  });
}

test.use({ viewport: { width: 1440, height: 900 } });

async function openChangeSets(page: Page) {
  await mockApi(page);
  await page.goto('/change-sets');
  await expect(rows(page)).toHaveCount(DEFAULT_ORDER.length, { timeout: 30_000 });
}

const rows = (page: Page) => page.getByTestId('change-sets-row');
const head = (page: Page, name: string) => page.getByRole('columnheader', { name, exact: true });

async function shownSlugs(page: Page): Promise<string[]> {
  return rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-change-set-slug') ?? ''));
}

async function expectOrder(page: Page, slugs: string[]) {
  await expect.poll(() => shownSlugs(page)).toEqual(slugs);
}

test('with no sort chosen the list keeps its own order, and no head claims a sort', async ({ page }) => {
  await openChangeSets(page);
  await expectOrder(page, DEFAULT_ORDER);
  for (const name of ['ChangeSet', 'Reviews', 'Created by', 'Age']) await expect(head(page, name)).toHaveAttribute('aria-sort', 'none');
  await expect(page.locator('[data-testid="change-sets-row"][data-change-set-slug="delta-closed"]')).toHaveAttribute('data-state', 'Closed');
  await expect(page.getByTestId('change-sets-count')).toHaveText('4 ChangeSets');
  // A row's own reads start once it is near the screen; with no Revision, there is no image change to load.
  await expect(page.getByTestId('change-set-row-image-change').first()).not.toHaveAttribute('data-status', 'loading');
});

test('a head sorts ascending, then descending, then back to the list order', async ({ page }) => {
  await openChangeSets(page);
  const name = head(page, 'ChangeSet');

  await name.getByRole('button').click();
  await expect(name).toHaveAttribute('aria-sort', 'ascending');
  await expectOrder(page, ['alpha-open', 'bravo-open', 'charlie-new', 'delta-closed']);

  await name.getByRole('button').click();
  await expect(name).toHaveAttribute('aria-sort', 'descending');
  await expectOrder(page, ['delta-closed', 'charlie-new', 'bravo-open', 'alpha-open']);

  await name.getByRole('button').click();
  await expect(name).toHaveAttribute('aria-sort', 'none');
  await expectOrder(page, DEFAULT_ORDER);
});

test('Age sorts youngest first, and Created by sorts by name with no creator last', async ({ page }) => {
  await openChangeSets(page);

  await head(page, 'Age').getByRole('button').click();
  await expectOrder(page, ['alpha-open', 'charlie-new', 'delta-closed', 'bravo-open']);

  const creator = head(page, 'Created by');
  await creator.getByRole('button').click();
  await expect(head(page, 'Age')).toHaveAttribute('aria-sort', 'none');
  await expectOrder(page, ['charlie-new', 'alpha-open', 'delta-closed', 'bravo-open']);
  await creator.getByRole('button').click();
  await expectOrder(page, ['delta-closed', 'alpha-open', 'charlie-new', 'bravo-open']);
});

test('Reviews sorts by State, and ties keep the list order', async ({ page }) => {
  await openChangeSets(page);
  const reviews = head(page, 'Reviews');
  await reviews.getByRole('button').click();
  await reviews.getByRole('button').click();
  await expect(reviews).toHaveAttribute('aria-sort', 'descending');
  await expectOrder(page, ['delta-closed', 'charlie-new', 'bravo-open', 'alpha-open']);
});

test('a sort holds through the filters', async ({ page }) => {
  await openChangeSets(page);
  await head(page, 'ChangeSet').getByRole('button').click();
  await page.getByLabel('State').selectOption('Open');
  await expectOrder(page, ['alpha-open', 'bravo-open']);
  await page.getByLabel('State').selectOption('all');
  await page.getByRole('searchbox', { name: 'Search ChangeSets' }).fill('a');
  await expectOrder(page, ['alpha-open', 'bravo-open', 'charlie-new', 'delta-closed']);
  await page.getByRole('searchbox', { name: 'Search ChangeSets' }).fill('Zoe');
  await expectOrder(page, ['delta-closed']);
});

test('the columns read row by row do not sort, and a row still opens its ChangeSet', async ({ page }) => {
  await openChangeSets(page);
  await expect(page.getByRole('row').first().getByRole('columnheader')).toHaveCount(6);
  for (const name of ['Image change', 'Next action']) await expect(head(page, name).getByRole('button')).toHaveCount(0);

  await page.getByRole('link', { name: 'Open ChangeSet charlie-new' }).click();
  await expect(page).toHaveURL(/\/change-sets\/payments\/charlie-new$/);
});

test('below 1275px the image change takes the row\'s second line, and its head and Age hide', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openChangeSets(page);
  await expect(head(page, 'Image change')).toBeHidden();
  await expect(head(page, 'Age')).toBeHidden();
  const cell = page.getByTestId('change-set-row-image-change').first();
  await expect(cell).toBeVisible();
  expect(await cell.evaluate((el) => getComputedStyle(el).gridRowStart)).toBe('2');
});
