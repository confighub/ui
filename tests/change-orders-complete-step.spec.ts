// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Complete step on the ChangeOrder detail screen, on a real screen.
 *
 * The ChangeWorkflow's `Final` completion checklist is evaluated over the LAST
 * stage's OWN Spaces and answers "has the whole ChangeOrder landed" — a different
 * question from any stage's entry gates, which are evaluated over the stage
 * BEFORE them and answer "may the change move on". Before this step existed the
 * checklist had nowhere to be seen: a ChangeOrder could sit at "every stage taken"
 * with an unsatisfied final check, and the screen offered no place to look.
 *
 * ⚠️ WHAT ONLY A BROWSER CAN SAY. `change-order-complete-step.pure.spec.ts` pins
 * the step's tone ladder and the segment it builds, and none of that needs a
 * page. Three things do, and this file's one test drives all three:
 *
 *   1. THE STEP IS REACHABLE. Its routing id (`COMPLETE_STAGE_ID`) is not the
 *      id the console strip prints (`COMPLETE_SEGMENT_STAGE_ID`), and the rail
 *      node, the URL and the selection test all turn on the FIRST of them. A
 *      node wired to the display id would look identical and route nowhere.
 *   2. THE CHECKLIST IS THE FINAL ONE. `ChangeOrderGateList` keys every row by the
 *      stage id it was handed, so a list carrying `COMPLETE_STAGE_ID` is
 *      `finalStageGates`' output and can be nothing else. A panel wired to a
 *      stage's entry gates would render a perfectly plausible list of the
 *      wrong check.
 *   3. THE STEP IS TERMINAL. Every other panel on this screen ends in an
 *      action, because a stage is somewhere the change moves INTO. Nothing
 *      follows Complete, so a Promote here would offer a promotion with
 *      nowhere to go — and an action that should not exist is invisible in
 *      every derivation test, because no derivation draws it.
 *
 * SEEDED, NOT FOUND. Reading a ChangeOrder back from the org and taking
 * whichever it happened to have passes locally against a long-lived dev server
 * and fails in CI's fresh-per-run database whenever this file is scheduled
 * before anything else creates one. The fixture's standard workflow declares
 * no `Final` block of its own, which is the ordinary case and not a gap:
 * `buildGatesForStage` always injects the mandatory landed check, so the
 * checklist is never blank for a governed ChangeOrder.
 *
 * READ-ONLY. Nothing here promotes, releases or aborts; the rail node is a
 * client-side route and every assertion is about what the screen draws.
 */

import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { type ChangeOrderFixture, buildChangeOrderFixture } from './fixtures/change-order-fixture';
import { changeOrderCopy } from '../src/pages/x/apps/change-order/changeOrderCopy';
import { COMPLETE_STAGE_ID } from '../src/pages/change-orders/changeOrderCompleteStep';

/**
 * The mandatory landed check, which every governed ChangeOrder's `Final` list
 * carries whether or not the workflow declares a prerequisite of its own.
 * Named from the copy module so a rename cannot leave this file asserting a
 * string the product stopped using.
 */
const LANDED_CHECK = changeOrderCopy.gateNames.promoted;

test.describe('the Complete step', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildChangeOrderFixture(fixturePage, { resources: 'minimal' });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  /** The detail screen, settled. The summary region is the page's own "rendered" signal. */
  async function openChangeOrder(page: Page) {
    await page.goto(`/change-orders/${fx.changeOrderSlug}`);
    await expect(page.getByRole('region', { name: 'ChangeOrder summary' })).toBeVisible({
      timeout: 30_000,
    });
  }

  test('pressing Complete routes to the step, which lists the final checks and offers no action', async ({
    page,
  }) => {
    await openChangeOrder(page);

    const node = page.getByTestId('stage-rail-complete');
    await expect(node).toBeVisible({ timeout: 20_000 });
    await node.click();

    /*
     * ⚠️ THE ROUTING ID, NOT THE PRINTED ONE. `COMPLETE_STAGE_ID` is the
     * synthetic `__change_order_complete__`; the console strip prints the bare word
     * `Complete` instead. Selection on this screen turns on the synthetic id,
     * so a rail node linking to the printed one would route to a stage nobody
     * declared and select nothing.
     */
    await expect(page).toHaveURL(new RegExp(`/change-orders/[^/]+/${COMPLETE_STAGE_ID}$`));
    await expect(node).toHaveAttribute('aria-pressed', 'true');

    const panel = page.getByTestId('complete-step-detail');
    await expect(panel).toBeVisible({ timeout: 20_000 });

    /*
     * THE FINAL CHECKLIST, NOT A STAGE'S ENTRY GATES. `ChangeOrderGateList` keys
     * each row `change-order-gate-<stageId>-<gateId>` from the stage id it was
     * handed, so this testid is reachable ONLY from a list built out of
     * `finalStageGates`. And it is a real checklist rather than the empty-state
     * row, which every reader takes as "nothing is holding this".
     */
    await expect(panel.getByTestId(`change-order-gate-${COMPLETE_STAGE_ID}-${LANDED_CHECK}`)).toBeVisible({
      timeout: 20_000,
    });
    await expect(panel.getByTestId(`change-order-gates-empty-${COMPLETE_STAGE_ID}`)).toHaveCount(0);
    await expect(panel.locator('[role="progressbar"]')).toHaveCount(0);

    /*
     * NOTHING FOLLOWS COMPLETE. Scoped to the panel, because the Complete panel
     * opens ALONGSIDE the stage panel, whose actions must stay; what would be
     * wrong is either action inside THIS panel, where the step it would act on
     * is the one nothing comes after.
     */
    await expect(panel.locator('[data-promote-stage]')).toHaveCount(0);
    await expect(panel.locator('[data-release-stage]')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /promote|release/i })).toHaveCount(0);
  });
});
