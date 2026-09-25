// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * A stage gating only on a check this build cannot evaluate.
 *
 * A workflow may declare its own prerequisites as CEL expressions, evaluated
 * against the Space, the ChangeOrder and that Space's Release. `ui/` has no CEL
 * evaluator and is not getting one — porting the product's gating language into
 * the browser is a second implementation of it, not a port — so the true state
 * of such a check is that it has not been made.
 *
 * ⚠️ THE FAILURE THIS GUARDS AGAINST IS SILENCE, NOT AN ERROR. Rendering a
 * declared check somewhere other than the stage's gate list leaves that list
 * EMPTY, and an empty gate list means "nothing is holding this" to every reader
 * of it: an open padlock, no blocking count, and a stage that reads as clear to
 * promote. Nothing on screen would be visibly wrong. So what is asserted here
 * is the padlock, the row and the refusal together, on a real screen, against a
 * workflow a real server accepted.
 */
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import {
  CUSTOM_PREREQUISITE,
  type RolloutFixture,
  buildRolloutFixture,
} from './fixtures/rollout-fixture';
import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import { ROLLOUT_POLL_INTERVAL_MS } from '../src/pages/x/apps/rollout/useRolloutData';

test.describe.configure({ mode: 'serial' });

/** The stage whose only prerequisite is the declared check. */
const GATED_STAGE = 'prod';

test.describe('a stage gating on a declared custom prerequisite', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: RolloutFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildRolloutFixture(fixturePage, {
      resources: 'minimal',
      releasable: false,
      workflow: 'custom-prerequisite',
    });

    /*
     * Promoting `dev` belongs to SETUP, not to one of the tests.
     *
     * `prod`'s mandatory `check/promoted` gate fails until the stage ahead of
     * it has taken the change, and a stage held by that is HELD rather than
     * unknown — a different claim from the one this file is about. Done here,
     * every test sees the same world and any of them can be run alone with
     * `-g`; done inside the third test, the first two silently depended on not
     * having run after it.
     */
    await fx.promoteStage('dev');
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  test('renders the check by name, and does not read as clear to promote', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));

    await page.goto(`/rollouts/${fx.changeOrderSlug}/${GATED_STAGE}`);
    const promote = page.locator(`[data-promote-stage="${GATED_STAGE}"]`);
    await expect(promote).toBeVisible({ timeout: 30_000 });

    // The stage is HELD, which is the claim. A declared check nobody has made
    // is not a check that passed.
    await expect(promote).toHaveAttribute('data-promote-gated', 'true');

    // Named, so a reader can match the row to the line in the workflow, and
    // carrying the author's own description, which is the only thing anyone
    // here knows about what it wants.
    await expect(page.getByText(`check/${CUSTOM_PREREQUISITE.Name}`).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(CUSTOM_PREREQUISITE.Description).first()).toBeVisible();

    // A workflow this page cannot fully evaluate is not a broken workflow. It
    // renders, and it renders without taking the screen down.
    await expect(page.getByText(/selects no Space/)).toHaveCount(0);
    expect(consoleErrors, 'a declared check must not crash the page').toEqual([]);
  });

  test('the dialog names the unevaluated check as what is holding the stage', async ({
    page,
  }) => {
    await page.goto(`/rollouts/${fx.changeOrderSlug}/${GATED_STAGE}`);
    const promote = page.locator(`[data-promote-stage="${GATED_STAGE}"]`);
    await expect(promote).toBeVisible({ timeout: 30_000 });
    await promote.click();

    // Held means held: the dialog names the check and offers nothing to press.
    await expect(page.getByText(/A gate holds this stage/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await expect(page.locator('[data-promote-rel]')).toHaveCount(0);
    await page.locator('[data-cancel]').click();
  });

  /*
   * ⚠️ A STATE THAT CAN BE "NOT YET" HAS TO BE SHOWN TO SETTLE.
   *
   * `not-evaluated` is exactly the shape that becomes a permanent spinner: it
   * reads as "no answer yet", and nothing about its VALUE distinguishes a
   * screen that has finished deciding from one still waiting. A stage-resolution
   * key that never matched the key it recorded did precisely that earlier in
   * this migration — every logic assertion passed while the pane showed a
   * skeleton that never cleared, and only a browser spec could see it.
   *
   * So this asserts the settled screen, then asserts it again after the poll
   * interval has come round: an unresolved state would either never paint the
   * gate row, or paint it and fall back to a loading treatment on the next tick.
   */
  test('the unevaluated check settles into an answer, and stays settled', async ({ page }) => {
    await page.goto(`/rollouts/${fx.changeOrderSlug}/${GATED_STAGE}`);
    const gateRow = page.getByTestId(
      `rollout-gate-${GATED_STAGE}-custom-prerequisite:${CUSTOM_PREREQUISITE.Name}`,
    );
    const gateTag = page.getByTestId(
      `rollout-gate-tag-${GATED_STAGE}-custom-prerequisite:${CUSTOM_PREREQUISITE.Name}`,
    );

    await expect(gateRow).toBeVisible({ timeout: 30_000 });
    // The words, not a colour: "not evaluated" is the claim, and it is neither
    // a pass nor a failure.
    await expect(gateTag).toHaveText(rolloutCopy.gateTag.notEvaluated);
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);

    /*
     * Past a real poll, waited on by watching for the poll itself rather than
     * by out-guessing its interval. `ROLLOUT_POLL_INTERVAL_MS` is imported so
     * the coupling is visible — and used only as a timeout ceiling, so a
     * change to it cannot silently turn this into a test that asserts before
     * the tick it is about.
     */
    await page.waitForRequest(
      (request) => {
        if (request.method() !== 'GET') return false;
        // Either read of the ChangeOrder counts: the page polls the single
        // order (`/api/space/<id>/change_order/<id>`) and lists them
        // (`/api/change_order`), and either arriving proves a tick happened.
        return new URL(request.url()).pathname.includes('/change_order');
      },
      { timeout: ROLLOUT_POLL_INTERVAL_MS * 4 },
    );
    await expect(gateTag).toHaveText(rolloutCopy.gateTag.notEvaluated);
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
    await expect(page.locator(`[data-promote-stage="${GATED_STAGE}"]`)).toBeVisible();
  });
});
