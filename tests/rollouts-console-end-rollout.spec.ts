// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The two ways to END a rollout, offered from a console row.
 *
 * ⚠️ WHAT A ROW OFFERS IS A RULE, NOT A LAYOUT. `rolloutIntents` decides which
 * of "Roll back" and "Abort" a rollout may be given, and every surface reads
 * it — the detail page already does. This spec is the console's half of that:
 * the same ChangeOrder must not offer an action in the list and withhold it
 * one click later, so both states of the rule are driven THROUGH THE UI on one
 * rollout rather than asserted separately on two.
 *
 * The rule itself is unit-tested in `rollout-row-actions.spec.ts`. Nothing is
 * re-derived here; what is asserted is that the row obeys it, that the shared
 * dialog opens against the right rollout, and that cancelling writes nothing.
 *
 * ⚠️ THE ORG-WIDE LIST IS NOT A FIXTURE. `/rollouts` shows every ChangeOrder in
 * the org, and other worktrees seed into the same database, so nothing here may
 * depend on the row count or on which row is first. The search box narrows to
 * this fixture's own slug before anything is believed.
 */
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { rolloutsConsoleCopy } from '../src/pages/x/apps/rollout/rolloutsConsoleCopy';
import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import { ApiHelper } from './fixtures/api-helper';
import { type RolloutFixture, buildRolloutFixture } from './fixtures/rollout-fixture';

test.describe.configure({ mode: 'serial' });

/**
 * The console, narrowed to one rollout.
 *
 * Waiting out `rollouts-loading` is not optional: the heading and both regions
 * paint while the org-wide read is still in flight, so a row query issued
 * before this resolves reports "no such rollout" about a fleet it has not seen.
 */
async function findRow(page: Page, slug: string) {
  await page.goto('/rollouts');
  const consoleRegion = page.getByRole('region', { name: 'Rollouts console' });
  await expect(consoleRegion).toBeVisible({ timeout: 20_000 });
  await expect(consoleRegion.getByTestId('rollouts-loading')).toHaveCount(0, { timeout: 30_000 });

  await page.getByLabel(rolloutsConsoleCopy.filters.searchPlaceholder).fill(slug);
  const row = page.locator(`[data-rollout-slug="${slug}"]`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  return row;
}

/** Open one row's actions menu without letting the click open the rollout. */
async function openRowMenu(page: Page, slug: string) {
  const row = await findRow(page, slug);
  await row.getByTestId('rollout-row-menu').click();
  // The menu portals to the body, so it is found on the page and not in the row.
  await expect(page.getByTestId('rollout-row-abort').or(page.getByTestId('rollout-row-rollback')).first())
    .toBeVisible({ timeout: 10_000 });
  // The row must NOT have navigated: the menu button stops its own click.
  expect(new URL(page.url()).pathname).toBe('/rollouts');
}

test.describe('ending a rollout from a console row', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: RolloutFixture;
  let fixturePage: Page;

  /** `AbortedReason` as the server holds it — '' until the rollout is stopped. */
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
    // much quicker. `releasable` is left on so the rollout reads like the
    // ordinary case rather than one with no Target anywhere.
    fx = await buildRolloutFixture(fixturePage, { resources: 'minimal' });
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
   * A rollout under way is neither aborted nor restored and its scope is known,
   * so `rolloutIntents` allows both. Both is also the state that matters most:
   * the two are different actions, and a row offering only one of them makes
   * the milder decision look like the destructive one.
   */
  test('a rollout under way offers both ways to end it', async ({ page }) => {
    await openRowMenu(page, fx.changeOrderSlug);

    await expect(page.getByTestId('rollout-row-rollback')).toHaveText(
      rolloutCopy.endRollout.rollBackLabel,
    );
    await expect(page.getByTestId('rollout-row-abort')).toHaveText(
      rolloutCopy.endRollout.abortLabel,
    );
  });

  /*
   * The dialog is the shared one, opened against THIS rollout. Cancelling has
   * to leave the rollout untouched — the console still lists it, and the next
   * test still finds it un-aborted.
   */
  test('choosing Abort opens the shared dialog, and Cancel writes nothing', async ({ page }) => {
    await openRowMenu(page, fx.changeOrderSlug);
    await page.getByTestId('rollout-row-abort').click();

    const dialog = page.getByTestId('rollout-end-dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toHaveAttribute('data-intent', 'abort');
    await expect(dialog).toContainText(rolloutCopy.endRollout.abortTitle);
    await expect(dialog).toContainText(fx.changeOrderSlug);

    await dialog.getByRole('button', { name: rolloutCopy.abort.cancel }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });

    expect(await abortedReason(), 'cancelling must not abort the rollout').toBe('');
  });

  /*
   * THE OTHER HALF OF THE RULE, DRIVEN THROUGH THE UI RATHER THAN SEEDED.
   * Aborting a rollout is the one thing that takes `abort` away — there is
   * nothing to decide twice — and leaves `rollBack` standing, because `cub
   * variant demote` REQUIRES an `AbortedReason` and refuses without one.
   * Withdrawing Roll back here would make Abort a trap.
   */
  test('a rollout already aborted offers the undoing and no second decision', async ({ page }) => {
    await openRowMenu(page, fx.changeOrderSlug);
    await page.getByTestId('rollout-row-abort').click();

    const dialog = page.getByTestId('rollout-end-dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('rollout-end-reason-input').fill('e2e: console row abort');
    await page.getByTestId('rollout-end-confirm').click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });

    expect(await abortedReason(), 'confirming must set AbortedReason').not.toBe('');

    await openRowMenu(page, fx.changeOrderSlug);
    await expect(page.getByTestId('rollout-row-rollback')).toBeVisible();
    await expect(page.getByTestId('rollout-row-abort')).toHaveCount(0);
  });
});
