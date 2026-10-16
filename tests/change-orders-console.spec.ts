// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The ChangeOrders console at altitude 0, asserted against the live route.
 *
 * ⚠️ THE CONSOLE IS PROVEN RENDERED BEFORE ANYTHING ELSE IS BELIEVED. The route
 * is behind a login wall: unauthenticated it renders "Sign in to ConfigHub",
 * and every assertion below would then be precise, confident, and about the
 * wrong page. `playwright.config.ts` supplies `authentication.json` as
 * `storageState`; `assertOurConsole` proves it worked rather than assuming it
 * did.
 *
 * `/change-orders` lists every ChangeOrder in the org and other runs seed into the
 * same database, so the Component filter is asserted over ChangeOrders this file
 * seeds for itself.
 */
import { type Locator, type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { changeOrdersConsoleCopy } from '../src/pages/x/apps/change-order/changeOrdersConsoleCopy';

import { ApiHelper } from './fixtures/api-helper';
import { type ChangeOrderFixture, buildChangeOrderFixture } from './fixtures/change-order-fixture';

const CONSOLE_PATH = '/change-orders';

/**
 * The three facts that together mean "our worktree, authenticated, rendered".
 *
 * Checked as one helper so no test can start asserting before all three hold —
 * the failure this guards against is a green run against another checkout.
 */
async function assertOurConsole(page: Page) {
  await page.goto(CONSOLE_PATH);

  // Authenticated: the sign-in wall never renders the console's region.
  const consoleRegion = page.getByRole('region', { name: 'ChangeOrders console' });
  await expect(consoleRegion).toBeVisible({ timeout: 20_000 });

  // Ours: this region is absent from the other worktree's build.
  await expect(page.getByRole('region', { name: 'ChangeOrders' }).first()).toBeAttached();

  // Rendered, not mid-transition. An early capture here once came out entirely
  // orange because it was sampled during a page fade.
  await expect(page.getByRole('heading', { level: 1, name: changeOrdersConsoleCopy.pageTitle })).toBeVisible();

  /*
   * ⚠️ AND WAIT FOR THE LIST TO SETTLE, WHICH IS NOT THE SAME AS THE PAGE
   * RENDERING. The heading and both regions paint while the fetch is still in
   * flight, so a row counted before this line is counted against a list that
   * has not loaded yet.
   */
  await expect(consoleRegion.getByTestId('change-orders-loading')).toHaveCount(0, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  return consoleRegion;
}

test.describe('ChangeOrders console', () => {
  test('offers ChangeOrders in the top nav, and it navigates', async ({ page }) => {
    await page.goto('/components');

    const nav = page.getByRole('banner');
    const entry = nav.getByRole('button', { name: 'ChangeOrders', exact: true });
    await expect(entry).toBeVisible();

    // Sits between Components and Releases, per the design's ordering.
    await expect(nav.getByRole('button', { name: 'Components' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Releases', exact: true })).toBeVisible();

    // The entry has to actually go somewhere — a nav item that renders but does
    // not navigate is the failure mode worth testing for.
    await entry.click();
    await expect(page).toHaveURL(/\/change-orders$/);
  });
});

/**
 * The Component filter, over two ChangeOrders seeded for the purpose: one whose
 * Space is in a Component, and one whose Space is in none. The second is the
 * one the filter's exclusion is about, and the fixture always puts its Spaces
 * in a Component.
 */
test.describe('the Component filter', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;
  let looseSpaceId: string | undefined;
  let looseOrderSlug: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildChangeOrderFixture(fixturePage, { resources: 'minimal', releasable: false, workflow: 'none' });

    const api = new ApiHelper(fixturePage);
    const looseSpace = await api.createSpace({
      space: { Slug: `${fx.appLabel}-loose`, Labels: { Owner: 'E2E' } } as never,
    });
    looseSpaceId = (looseSpace as { SpaceID: string }).SpaceID;
    looseOrderSlug = `${fx.appLabel}-loose-order`;
    await api.createChangeOrder({
      spaceId: looseSpaceId,
      changeOrder: { Slug: looseOrderSlug, InScopeSpaceIDs: [looseSpaceId] } as never,
    });
  });

  test.afterAll(async () => {
    try {
      if (looseSpaceId) await new ApiHelper(fixturePage).deleteSpace(looseSpaceId, true);
    } catch (error) {
      console.warn(`[change-orders-console] could not delete Space ${looseSpaceId}: ${String(error)}`);
    }
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  const rowOf = (consoleRegion: Locator, slug: string) => consoleRegion.locator(`[data-change-order-slug="${slug}"]`);

  test('the Component filter shows only that Component’s ChangeOrders, and Clear resets it', async ({ page }) => {
    const consoleRegion = await assertOurConsole(page);
    await expect(rowOf(consoleRegion, looseOrderSlug)).toBeVisible({ timeout: 20_000 });

    const select = consoleRegion.getByRole('combobox', { name: changeOrdersConsoleCopy.filters.component, exact: true });
    await expect(select).toHaveValue('all');
    await select.selectOption(fx.appLabel);

    // The org is shared, but this Component is the fixture's own and holds one ChangeOrder.
    const rows = consoleRegion.locator('[data-change-order-slug]');
    await expect(rows).toHaveCount(1);
    await expect(rowOf(consoleRegion, fx.changeOrderSlug)).toBeVisible();
    await expect(rowOf(consoleRegion, looseOrderSlug)).toHaveCount(0);

    await consoleRegion.getByRole('button', { name: changeOrdersConsoleCopy.filters.clear }).click();
    await expect(select).toHaveValue('all');
    await expect(rowOf(consoleRegion, looseOrderSlug)).toBeVisible();
    await expect(rowOf(consoleRegion, fx.changeOrderSlug)).toBeVisible();
  });
});
