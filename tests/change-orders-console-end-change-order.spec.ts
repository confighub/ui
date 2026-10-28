// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The two ways to END a ChangeOrder, offered from a console row.
 *
 * ⚠️ WHAT A ROW OFFERS IS A RULE, NOT A LAYOUT. `changeOrderIntents` decides which
 * of "Roll back" and "Abort" a ChangeOrder may be given, and every surface reads
 * it — the detail page already does. This spec is the console's half of that:
 * the same ChangeOrder must not offer an action in the list and withhold it
 * one click later, so both states of the rule are driven THROUGH THE UI on one
 * ChangeOrder rather than asserted separately on two.
 *
 * The rule itself is unit-tested in the change-order-row-actions spec. Nothing is
 * re-derived here; what is asserted is that the row obeys it, that the shared
 * dialog opens against the right ChangeOrder, and that cancelling writes nothing.
 *
 * ⚠️ THE ORG-WIDE LIST IS NOT A FIXTURE. `/change-orders` shows every ChangeOrder in
 * the org, and other worktrees seed into the same database, so nothing here may
 * depend on the row count or on which row is first. The search box narrows to
 * this fixture's own slug before anything is believed.
 */
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { changeOrdersConsoleCopy } from '../src/pages/x/apps/change-order/changeOrdersConsoleCopy';
import { changeOrderCopy } from '../src/pages/x/apps/change-order/changeOrderCopy';
import { ApiHelper } from './fixtures/api-helper';
import { type ChangeOrderFixture, buildChangeOrderFixture } from './fixtures/change-order-fixture';

/**
 * The console, narrowed to one ChangeOrder.
 *
 * Waiting out `change-orders-loading` is not optional: the heading and both regions
 * paint while the org-wide read is still in flight, so a row query issued
 * before this resolves reports "no such ChangeOrder" about a fleet it has not seen.
 */
async function findRow(page: Page, slug: string) {
  await page.goto('/change-orders');
  const consoleRegion = page.getByRole('region', { name: 'ChangeOrders console' });
  await expect(consoleRegion).toBeVisible({ timeout: 20_000 });
  await expect(consoleRegion.getByTestId('change-orders-loading')).toHaveCount(0, { timeout: 30_000 });

  await page.getByLabel(changeOrdersConsoleCopy.filters.searchPlaceholder).fill(slug);
  const row = page.locator(`[data-change-order-slug="${slug}"]`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  return row;
}

/** Open one row's actions menu without letting the click open the ChangeOrder. */
async function openRowMenu(page: Page, slug: string) {
  const row = await findRow(page, slug);
  await row.getByTestId('change-order-row-menu').click();
  // The menu portals to the body, so it is found on the page and not in the row.
  await expect(page.getByTestId('change-order-row-abort').or(page.getByTestId('change-order-row-rollback')).first())
    .toBeVisible({ timeout: 10_000 });
  // The row must NOT have navigated: the menu button sits above the row's link.
  expect(new URL(page.url()).pathname).toBe('/change-orders');
}

test.describe('ending a ChangeOrder from a console row', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;

  /** `AbortedReason` as the server holds it — '' until the ChangeOrder is stopped. */
  const abortedReason = async (): Promise<string> => {
    const order = await new ApiHelper(fixturePage).getChangeOrder({
      spaceId: fx.changeOrderSpaceId,
      changeOrderId: fx.changeOrderId,
    });
    return order.AbortedReason ?? '';
  };

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    // `minimal` resources: nothing here reads the diff panels, and the seed is
    // much quicker. `releasable` is left on so the ChangeOrder reads like the
    // ordinary case rather than one with no Target anywhere.
    fx = await buildChangeOrderFixture(fixturePage, { resources: 'minimal' });
    // Which Spaces a rollback would run over is `ResolvedSpaceIDs`, and a server
    // that cannot derive it withdraws Roll back for a reason that has nothing to
    // do with this rule. Fail naming that rather than reporting a missing menu.
    await fx.assertPropagationSupported();
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  /*
   * BOTH STATES OF THE RULE, DRIVEN THROUGH THE UI RATHER THAN SEEDED.
   *
   * A ChangeOrder under way is neither aborted nor restored and its scope is known,
   * so `changeOrderIntents` allows both ways to end it. Aborting is the one thing
   * that takes `abort` away — there is nothing to decide twice — and leaves
   * `rollBack` standing, because `cub variant demote` REQUIRES an
   * `AbortedReason` and refuses without one. Withdrawing Roll back after an
   * abort would make Abort a trap.
   */
  test('Abort opens the shared dialog, Cancel writes nothing, and an aborted ChangeOrder offers only the undoing', async ({
    page,
  }) => {
    await openRowMenu(page, fx.changeOrderSlug);
    await expect(page.getByTestId('change-order-row-rollback')).toBeVisible();
    await page.getByTestId('change-order-row-abort').click();

    // The dialog is the shared one, opened against THIS ChangeOrder.
    const dialog = page.getByTestId('change-order-end-dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toHaveAttribute('data-intent', 'abort');
    await expect(dialog).toContainText(fx.changeOrderSlug);

    await dialog.getByRole('button', { name: changeOrderCopy.abort.cancel }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    expect(await abortedReason(), 'cancelling must not abort the ChangeOrder').toBe('');

    await openRowMenu(page, fx.changeOrderSlug);
    await page.getByTestId('change-order-row-abort').click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('change-order-end-reason-input').fill('e2e: console row abort');
    await page.getByTestId('change-order-end-confirm').click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });

    expect(await abortedReason(), 'confirming must set AbortedReason').not.toBe('');

    await openRowMenu(page, fx.changeOrderSlug);
    await expect(page.getByTestId('change-order-row-rollback')).toBeVisible();
    await expect(page.getByTestId('change-order-row-abort')).toHaveCount(0);
  });
});
