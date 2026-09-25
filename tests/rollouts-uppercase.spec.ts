// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The rollouts feature renders no uppercase text, on any route.
 *
 * The user ruled that this feature uses no capitalised labels. That is easy to
 * satisfy once and hard to keep, because **almost nothing that uppercases here
 * says so in its own source.** This theme puts `textTransform: uppercase` on
 * `typography.caption` and `typography.overline` and on two component
 * overrides, and MUI resolves several components to those variants by default —
 * `FormHelperText` is one. So a control inherits the transform without any file
 * mentioning it, and a grep for `variant="caption"` finds the instances someone
 * already knew about.
 *
 * Two live defects arrived that way and neither was visible in a search:
 * the stage strip's early-return caption, and a promote refusal that rendered
 * as "A REASON IS REQUIRED." at someone who had just been refused.
 *
 * ⚠️ THERE IS A KNOWN LATENT ONE THIS GUARD EXISTS TO CATCH.
 * `RolloutStageStrip.tsx:186` renders its `showCaption` line as
 * `variant='caption'`, so it uppercases. The strip's one caller passes
 * `showCaption={false}`, which is the only reason the feature is clean today.
 * **The moment a caller leaves that prop at its default, uppercase appears.**
 * This spec is what turns that from something a user notices into something a
 * test says.
 *
 * MEASURED, NOT SEARCHED. It reads computed style on the rendered page, because
 * that is the only place the transform exists.
 *
 * VERIFIED PASSING against a real CI run and locally. The detail screen and
 * promote dialog tests seed their own ChangeOrder (`fixtures/rollout-fixture`)
 * rather than reading `/api/change_order` and taking whichever this org
 * happened to have — the original approach here, which passed against a
 * long-lived dev server holding years of leftover ChangeOrders and failed in
 * CI's fresh-per-run database whenever this file was scheduled before
 * anything else created one ("no ChangeOrder to open — the guard would pass
 * by measuring nothing").
 *
 * SCOPED TO THE ROLLOUTS ROOT ON PURPOSE. The app shell around it carries ~95
 * uppercase elements of its own, which this feature neither owns nor
 * restyles.
 * Widening this assertion to the document would make it fail for something the
 * feature has no business changing.
 */

import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { type RolloutFixture, buildRolloutFixture } from './fixtures/rollout-fixture';

const ROOT = '#rollouts-root';

/** Every uppercase element inside the rollouts root, with enough text to identify it. */
async function uppercaseInside(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (root === null) {
      // A selector matching nothing is a mis-scope, not an empty result: an
      // empty list would read as "no uppercase" and pass.
      throw new Error(`uppercase guard: ${sel} matched nothing — refusing to report a clean result`);
    }
    return [...root.querySelectorAll('*')]
      .filter((el) => getComputedStyle(el).textTransform === 'uppercase' && el.textContent?.trim())
      .map((el) => `${el.tagName}: ${el.textContent?.trim().slice(0, 40)}`);
  }, ROOT);
}

test.describe('rollouts render no uppercase', () => {
  test('the console', async ({ page }) => {
    await page.goto('/rollouts');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 25000 });
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    expect(await uppercaseInside(page)).toEqual([]);
  });

  /*
   * The detail screen and promote dialog both need a real ChangeOrder to
   * open. Reading one back from `/api/change_order` and taking whichever
   * this org happened to have — the original approach — depends entirely on
   * some OTHER test's fixture surviving into this file's run: it can pass
   * locally against a long-lived dev server with years of leftover
   * ChangeOrders and still fail in CI's fresh-per-run database if this file
   * is scheduled before anything else creates one. Seeded here instead, so
   * the guard does not depend on execution order.
   */
  test.describe('against a seeded rollout', () => {
    test.use({ storageState: 'authentication.json' });

    let fx: RolloutFixture;
    let fixturePage: Page;

    test.beforeAll(async ({ browser }) => {
      const context = await newAuthorizedContext(browser);
      fixturePage = await context.newPage();
      fx = await buildRolloutFixture(fixturePage, { resources: 'minimal' });
    });

    test.afterAll(async () => {
      await fx?.teardown();
      await fixturePage?.close();
    });

    test('the detail screen, including its stage rail and gate bar', async ({ page }) => {
      await page.goto(`/rollouts/${fx.changeOrderSlug}`);
      await expect(page.getByRole('region', { name: 'Rollout summary' })).toBeVisible({ timeout: 25000 });
      await page.waitForFunction(() => document.fonts.status === 'loaded');
      expect(await uppercaseInside(page)).toEqual([]);
    });

  /*
   * ⚠️ ASSERTED WHILE THE DIALOG IS OPEN, WHICH IS THE ONLY TIME IT EXISTS.
   *
   * Confirming closes it (`confirmPromote`), so anything read afterwards is a
   * subtree on its way out — and an emptying subtree contains no uppercase, so
   * the check passes without having looked at the dialog at all. The state
   * worth asserting is the one a reader actually sees.
   *
   * Nothing is confirmed here either. This test needs the dialog rendered, not
   * a promotion performed, and a promotion writes to a shared server.
   */
    test('the promote dialog', async ({ page }) => {
      // No write can reach the server from this spec.
      //
      // `dry_run=true` is exempt WHATEVER THE METHOD. A promotion is planned by
      // a POST that writes nothing, and the dialog issues one to state what it
      // is about to do — so blocking it by method blocks the very request this
      // dialog needs, and the confirm never renders at all.
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        if (request.url().includes('dry_run=true')) return route.continue();
        const m = request.method();
        if (m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH') return route.abort();
        return route.continue();
      });

      await page.goto(`/rollouts/${fx.changeOrderSlug}`);
      await expect(page.getByRole('region', { name: 'Rollout summary' })).toBeVisible({ timeout: 25000 });

      /*
       * ASSERTED, NOT SKIPPED OVER. A bare `test.skip()` when the control is
       * missing turns the one regression this file would catch — a page that
       * stopped offering the action at all — into a green run.
       */
      const promote = page.locator('[data-promote-stage]').first();
      await expect(promote).toBeVisible({ timeout: 20000 });
      await expect(promote).toBeEnabled();

      await promote.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10000 });
      // The dialog states its coverage from a dry run, so it has content worth
      // reading only once that has landed.
      await expect(dialog.locator('[data-confirm]')).toBeVisible({ timeout: 10000 });
      await page.waitForFunction(() => document.fonts.status === 'loaded');

      const shouting = await page.evaluate(() =>
        [...document.querySelectorAll('[role="dialog"] *')]
          .filter((el) => getComputedStyle(el).textTransform === 'uppercase' && el.textContent?.trim())
          .map((el) => `${el.tagName}: ${el.textContent?.trim().slice(0, 40)}`),
      );
      expect(shouting).toEqual([]);

      // It really did read a populated dialog, not an empty one on its way out.
      const read = await page.evaluate(
        () => document.querySelectorAll('[role="dialog"] *').length,
      );
      expect(read, 'the dialog was empty, so nothing was checked').toBeGreaterThan(3);
    });
  });
});
