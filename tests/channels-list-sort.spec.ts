// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Channels list's sortable column heads, against mocked API data: every API
 * request is answered here, so the org holds exactly the four Channels below,
 * one in each connection state. The sorting rules themselves are in
 * `console-table-sort.pure.spec.ts`; this checks the heads drive them on the
 * page, and that the list's own order holds until one is clicked.
 */

import { expect, test, type Page, type Route } from '@playwright/test';

const ORG = 'a0000000-0000-4000-8000-000000000001';
const USER = 'b0000000-0000-4000-8000-000000000001';
const SPACE = { id: 'c0000000-0000-4000-8000-000000000001', slug: 'bots' };

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const commands = (...names: string[]) => Object.fromEntries(names.map((name) => [name, {}]));

/** Listed out of the console's order, so a pass cannot come from the response's own order. */
function channels() {
  return [
    { id: 'd0000000-0000-4000-8000-000000000001', slug: 'zeta-never', commands: commands('a') },
    { id: 'd0000000-0000-4000-8000-000000000002', slug: 'alpha-connected', claimed: true, lastSeen: minutesAgo(0), commands: commands('a', 'b', 'c') },
    { id: 'd0000000-0000-4000-8000-000000000003', slug: 'mid-disconnected', lastSeen: minutesAgo(30), commands: {} },
    { id: 'd0000000-0000-4000-8000-000000000004', slug: 'beta-lapsed', claimed: true, lastSeen: minutesAgo(90), commands: commands('a', 'b') },
  ].map((c) => ({
    Channel: {
      ChannelID: c.id,
      OrganizationID: ORG,
      SpaceID: SPACE.id,
      SpaceSlug: SPACE.slug,
      Slug: c.slug,
      DisplayName: c.slug,
      ...(c.claimed ? { Condition: 'Claimed', ClaimTTLSeconds: 60 } : {}),
      ...(c.lastSeen ? { LastSeenAt: c.lastSeen } : {}),
      Commands: c.commands,
    },
  }));
}

/** The console's own order: lapsed, connected, disconnected, never. */
const DEFAULT_ORDER = ['beta-lapsed', 'alpha-connected', 'mid-disconnected', 'zeta-never'];

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
    if (path === '/api/channel') return json(channels());
    if (path === '/api/space') return json([{ Space: { SpaceID: SPACE.id, Slug: SPACE.slug, OrganizationID: ORG } }]);
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, body: '{}' });
    if (path === '/api/info') return json({});
    return json([]);
  });
}

async function openChannels(page: Page) {
  await mockApi(page);
  await page.goto('/channels');
  await expect(rows(page)).toHaveCount(DEFAULT_ORDER.length, { timeout: 30_000 });
}

const rows = (page: Page) => page.getByTestId('channels-row');
const head = (page: Page, name: string) => page.getByRole('columnheader', { name, exact: true });

async function shownSlugs(page: Page): Promise<string[]> {
  return rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-slug') ?? ''));
}

async function expectOrder(page: Page, slugs: string[]) {
  await expect.poll(() => shownSlugs(page)).toEqual(slugs);
}

test('with no sort chosen the list keeps its own order, and no head claims a sort', async ({ page }) => {
  await openChannels(page);
  await expectOrder(page, DEFAULT_ORDER);
  for (const name of ['Channel', 'Connection', 'Claimed by', 'Commands']) await expect(head(page, name)).toHaveAttribute('aria-sort', 'none');
  // The row's own attributes are unchanged by the table.
  await expect(page.locator('[data-testid="channels-row"][data-slug="beta-lapsed"]')).toHaveAttribute('data-connection', 'lapsed');
  await expect(page.locator('[data-testid="channels-row"][data-slug="zeta-never"]')).toHaveAttribute('data-connection', 'never');
});

test('a head sorts ascending, then descending, then back to the list order', async ({ page }) => {
  await openChannels(page);
  const channel = head(page, 'Channel');

  await channel.getByRole('button').click();
  await expect(channel).toHaveAttribute('aria-sort', 'ascending');
  await expectOrder(page, ['alpha-connected', 'beta-lapsed', 'mid-disconnected', 'zeta-never']);

  await channel.getByRole('button').click();
  await expect(channel).toHaveAttribute('aria-sort', 'descending');
  await expectOrder(page, ['zeta-never', 'mid-disconnected', 'beta-lapsed', 'alpha-connected']);

  await channel.getByRole('button').click();
  await expect(channel).toHaveAttribute('aria-sort', 'none');
  await expectOrder(page, DEFAULT_ORDER);
});

test('a number column sorts by number, and one sort replaces another', async ({ page }) => {
  await openChannels(page);
  await head(page, 'Channel').getByRole('button').click();

  const commandsHead = head(page, 'Commands');
  await commandsHead.getByRole('button').click();
  await expect(commandsHead).toHaveAttribute('aria-sort', 'ascending');
  await expect(head(page, 'Channel')).toHaveAttribute('aria-sort', 'none');
  await expectOrder(page, ['mid-disconnected', 'zeta-never', 'beta-lapsed', 'alpha-connected']);
});

test('a head sorts from the keyboard, and sorting keeps the filters', async ({ page }) => {
  await openChannels(page);
  await page.getByLabel('Connection').selectOption('Connected');
  await expectOrder(page, ['alpha-connected']);
  await page.getByLabel('Connection').selectOption('all');

  const channel = head(page, 'Channel');
  await channel.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(channel).toHaveAttribute('aria-sort', 'ascending');
  await expectOrder(page, ['alpha-connected', 'beta-lapsed', 'mid-disconnected', 'zeta-never']);

  await page.getByRole('searchbox', { name: 'Search Channels' }).fill('ta');
  await expectOrder(page, ['beta-lapsed', 'zeta-never']);
});

test('the action column does not sort, and a row still opens its Channel', async ({ page }) => {
  await openChannels(page);
  await expect(page.getByRole('row').first().getByRole('columnheader')).toHaveCount(6);
  await expect(page.getByRole('columnheader').last().getByRole('button')).toHaveCount(0);

  await page.getByRole('link', { name: 'Open Channel bots/beta-lapsed' }).click();
  await expect(page).toHaveURL(/\/channels\/bots\/beta-lapsed$/);
});
