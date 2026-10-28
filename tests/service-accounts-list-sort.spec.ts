// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The service accounts list's sortable column heads, against mocked API data:
 * every API request is answered here, so the org holds exactly the four
 * ServiceAccounts below, one in each activity state. The sorting rules
 * themselves are in `console-table-sort.pure.spec.ts`; this checks the heads
 * sort by the real values, and that the list's own order holds until one is
 * clicked.
 */

import { expect, test, type Page, type Route } from '@playwright/test';

const ORG = 'a0000000-0000-4000-8000-000000000001';
const USER = 'b0000000-0000-4000-8000-000000000001';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const DAY = 24 * 60;

interface Fixture {
  id: string;
  slug: string;
  role: string;
  created: string;
  keys: { LastUsedAt?: string }[];
  tokens: { LastUsedAt?: string }[];
}

/** Listed out of the console's order, so a pass cannot come from the response's own order. */
const FIXTURES: Fixture[] = [
  { id: 'd0000000-0000-4000-8000-000000000001', slug: 'gamma-none', role: 'none', created: ago(100 * DAY), keys: [], tokens: [] },
  { id: 'd0000000-0000-4000-8000-000000000002', slug: 'delta-unused', role: 'admin', created: ago(2 * DAY), keys: [{}, {}], tokens: [] },
  { id: 'd0000000-0000-4000-8000-000000000003', slug: 'alpha-idle', role: 'editor', created: ago(40 * DAY), keys: [{ LastUsedAt: ago(10 * DAY) }], tokens: [] },
  { id: 'd0000000-0000-4000-8000-000000000004', slug: 'beta-active', role: 'viewer', created: ago(5 * DAY), keys: [{}], tokens: [{ LastUsedAt: ago(60) }, {}] },
];

/** The console's own order: active, idle, never used, no credentials. */
const DEFAULT_ORDER = ['beta-active', 'alpha-idle', 'delta-unused', 'gamma-none'];

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
    if (path === '/api/service_account') {
      return json(
        FIXTURES.map((f) => ({
          ServiceAccount: { ServiceAccountID: f.id, OrganizationID: ORG, Slug: f.slug, DisplayName: f.slug, OrgRole: f.role, CreatedAt: f.created },
        })),
      );
    }
    const credentials = path.match(/^\/api\/service_account\/([^/]+)\/(user_key|user_token)$/);
    if (credentials) {
      const fixture = FIXTURES.find((f) => f.id === credentials[1]);
      if (fixture === undefined) return route.fulfill({ status: 404, body: '{}' });
      if (credentials[2] === 'user_key') {
        return json(fixture.keys.map((key, i) => ({ UserKey: { Slug: `${fixture.slug}-key-${i}`, Kid: `kid-${i}`, ...key } })));
      }
      return json(fixture.tokens.map((t, i) => ({ UserToken: { Slug: `${fixture.slug}-token-${i}`, ...t } })));
    }
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '{}' });
    if (path === '/api/info') return json({});
    return json([]);
  });
}

const rows = (page: Page) => page.getByTestId('service-accounts-row');
const head = (page: Page, name: string) => page.getByRole('columnheader', { name, exact: true });

async function openServiceAccounts(page: Page) {
  await mockApi(page);
  await page.goto('/service-accounts');
  await expect(rows(page)).toHaveCount(FIXTURES.length, { timeout: 30_000 });
  // The credentials are read after the list; the default order depends on them.
  await expect(page.locator('[data-testid="service-accounts-row"][data-slug="beta-active"]')).toHaveAttribute('data-activity', 'active');
}

async function shownSlugs(page: Page): Promise<string[]> {
  return rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-slug') ?? ''));
}

async function expectOrder(page: Page, slugs: string[]) {
  await expect.poll(() => shownSlugs(page)).toEqual(slugs);
}

async function sortBy(page: Page, name: string) {
  await head(page, name).getByRole('button').click();
}

test('with no sort chosen the list keeps its own order, and no head claims a sort', async ({ page }) => {
  await openServiceAccounts(page);
  await expectOrder(page, DEFAULT_ORDER);
  for (const name of ['Service account', 'Last used', 'Credentials', 'Org role', 'Age']) await expect(head(page, name)).toHaveAttribute('aria-sort', 'none');
  await expect(page.locator('[data-testid="service-accounts-row"][data-slug="alpha-idle"]')).toHaveAttribute('data-activity', 'idle');
  await expect(page.locator('[data-testid="service-accounts-row"][data-slug="gamma-none"]')).toHaveAttribute('data-activity', 'none');
  await expect(page.locator('[data-slug="beta-active"] [data-testid="service-accounts-row-credentials"]')).toHaveText('1 key · 2 tokens');
});

test('the name head sorts ascending, then descending, then back to the list order', async ({ page }) => {
  await openServiceAccounts(page);
  const name = head(page, 'Service account');

  await sortBy(page, 'Service account');
  await expect(name).toHaveAttribute('aria-sort', 'ascending');
  await expectOrder(page, ['alpha-idle', 'beta-active', 'delta-unused', 'gamma-none']);

  await sortBy(page, 'Service account');
  await expect(name).toHaveAttribute('aria-sort', 'descending');
  await expectOrder(page, ['gamma-none', 'delta-unused', 'beta-active', 'alpha-idle']);

  await sortBy(page, 'Service account');
  await expect(name).toHaveAttribute('aria-sort', 'none');
  await expectOrder(page, DEFAULT_ORDER);
});

test('last used sorts most recent first, by time, with never-used accounts last', async ({ page }) => {
  await openServiceAccounts(page);
  const lastUsed = head(page, 'Last used');

  await sortBy(page, 'Last used');
  await expect(lastUsed).toHaveAttribute('aria-sort', 'descending');
  await expectOrder(page, ['beta-active', 'alpha-idle', 'delta-unused', 'gamma-none']);

  await sortBy(page, 'Last used');
  await expect(lastUsed).toHaveAttribute('aria-sort', 'ascending');
  await expectOrder(page, ['alpha-idle', 'beta-active', 'delta-unused', 'gamma-none']);
});

test('credentials, org role and age sort by count, role strength and age', async ({ page }) => {
  await openServiceAccounts(page);

  await sortBy(page, 'Credentials');
  await expectOrder(page, ['gamma-none', 'alpha-idle', 'delta-unused', 'beta-active']);

  await sortBy(page, 'Org role');
  await expect(head(page, 'Credentials')).toHaveAttribute('aria-sort', 'none');
  await expectOrder(page, ['gamma-none', 'beta-active', 'alpha-idle', 'delta-unused']);

  await sortBy(page, 'Age');
  await expect(head(page, 'Age')).toHaveAttribute('aria-sort', 'ascending');
  await expectOrder(page, ['delta-unused', 'beta-active', 'alpha-idle', 'gamma-none']);
});

test('sorting keeps the filters, the action column does not sort, and a row still opens its account', async ({ page }) => {
  await openServiceAccounts(page);
  await sortBy(page, 'Service account');
  await page.getByLabel('Status').selectOption('Never used');
  await expectOrder(page, ['delta-unused']);
  await page.getByLabel('Status').selectOption('all');
  await expectOrder(page, ['alpha-idle', 'beta-active', 'delta-unused', 'gamma-none']);

  await expect(page.getByRole('row').first().getByRole('columnheader')).toHaveCount(6);
  await expect(page.getByRole('columnheader').last().getByRole('button')).toHaveCount(0);

  await page.getByRole('link', { name: 'Open service account beta-active' }).click();
  await expect(page).toHaveURL(/\/service-accounts\/beta-active$/);
});
