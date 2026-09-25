// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Complete step on the rollout detail screen, on a real screen.
 *
 * The ChangeWorkflow's `Final` completion checklist is evaluated over the LAST
 * stage's OWN Spaces and answers "has the whole rollout landed" — a different
 * question from any stage's entry gates, which are evaluated over the stage
 * BEFORE them and answer "may the change move on". Before this step existed the
 * checklist had nowhere to be seen: a rollout could sit at "every stage taken"
 * with an unsatisfied final check, and the screen offered no place to look.
 *
 * ⚠️ WHAT ONLY A BROWSER CAN SAY. `rollout-complete-step.pure.spec.ts` pins
 * the step's tone ladder and the segment it builds, and none of that needs a
 * page. Three things do, and they are the three this file is for:
 *
 *   1. THE STEP IS REACHABLE. Its routing id (`COMPLETE_STAGE_ID`) is not the
 *      id the console strip prints (`COMPLETE_SEGMENT_STAGE_ID`), and the rail
 *      node, the URL and the selection test all turn on the FIRST of them. A
 *      node wired to the display id would look identical and route nowhere.
 *   2. THE CHECKLIST IS THE FINAL ONE. `RolloutGateList` keys every row by the
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
 * before anything else creates one — the same trap `rollouts-uppercase.spec.ts`
 * documents. The fixture's standard workflow declares no `Final` block of its
 * own, which is the ordinary case and not a gap: `buildGatesForStage` always
 * injects the mandatory landed check, so the checklist is never blank for a
 * governed rollout.
 *
 * READ-ONLY. Nothing here promotes, releases or aborts; the rail node is a
 * client-side route and every assertion is about what the screen draws.
 */

import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { type RolloutFixture, buildRolloutFixture } from './fixtures/rollout-fixture';
import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import {
  COMPLETE_STAGE_ID,
  COMPLETE_STEP_LABEL,
} from '../src/pages/rollouts/rolloutCompleteStep';

test.describe.configure({ mode: 'serial' });

/**
 * The mandatory landed check, which every governed rollout's `Final` list
 * carries whether or not the workflow declares a prerequisite of its own.
 * Named from the copy module so a rename cannot leave this file asserting a
 * string the product stopped using.
 */
const LANDED_CHECK = rolloutCopy.gateNames.promoted;

test.describe('the Complete step', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: RolloutFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildRolloutFixture(fixturePage, { resources: 'minimal' });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  /** The detail screen, settled. The summary region is the page's own "rendered" signal. */
  async function openRollout(page: Page, stage?: string) {
    const suffix = stage === undefined ? '' : `/${stage}`;
    await page.goto(`/rollouts/${fx.changeOrderSlug}${suffix}`);
    await expect(page.getByRole('region', { name: 'Rollout summary' })).toBeVisible({
      timeout: 30_000,
    });
  }

  test('the rail ends on a node called Complete, and pressing it names the step in the URL', async ({
    page,
  }) => {
    await openRollout(page);

    const node = page.getByTestId('stage-rail-complete');
    await expect(node).toBeVisible({ timeout: 20_000 });

    /*
     * Named `Complete`, and named it FIRST — the node also carries its own
     * state in words ("Not reached yet") and a gate tally, and on a finished
     * rollout that state line reads `Complete` too. Matching anywhere in the
     * node would be satisfied by the state line alone, on a node whose title
     * had gone missing.
     */
    expect((await node.innerText()).trim()).toMatch(new RegExp(`^${COMPLETE_STEP_LABEL}\\b`));

    await node.click();

    /*
     * ⚠️ THE ROUTING ID, NOT THE PRINTED ONE. `COMPLETE_STAGE_ID` is the
     * synthetic `__rollout_complete__`; the console strip prints the bare word
     * `Complete` instead, for reasons that belong to the strip's hover title.
     * Selection on this screen (`stageParam === COMPLETE_STAGE_ID`) turns on
     * the synthetic id, so a rail node linking to the printed one would route
     * to a stage nobody declared and select nothing.
     */
    await expect(page).toHaveURL(new RegExp(`/rollouts/[^/]+/${COMPLETE_STAGE_ID}$`));

    // Selected, and exclusively so: the rail falls back to the next stage when
    // the URL names no real stage, and two ringed nodes say two things are
    // selected when one is.
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('complete-step-detail')).toBeVisible();
  });

  test('the panel lists the workflow’s final prerequisites, not a stage’s entry gates', async ({
    page,
  }) => {
    await openRollout(page, COMPLETE_STAGE_ID);

    const panel = page.getByTestId('complete-step-detail');
    await expect(panel).toBeVisible({ timeout: 20_000 });

    /*
     * `RolloutGateList` keys each row `rollout-gate-<stageId>-<gateId>` from
     * the stage id it was handed, so this testid is reachable ONLY from a list
     * built out of `finalStageGates`. No stage panel on this screen can
     * produce it, which is what makes the selector the assertion rather than
     * just a way of finding the row.
     */
    const landed = panel.getByTestId(`rollout-gate-${COMPLETE_STAGE_ID}-${LANDED_CHECK}`);
    await expect(landed).toBeVisible({ timeout: 20_000 });
    await expect(landed).toContainText(LANDED_CHECK);

    /*
     * And it is a real checklist rather than the empty-state row. A blank gate
     * list reads as "nothing is holding this" to every reader of it, so an
     * empty list here would be the silent version of the defect the step was
     * built to end.
     */
    await expect(panel.getByTestId(`rollout-gates-empty-${COMPLETE_STAGE_ID}`)).toHaveCount(0);
    await expect(
      panel.getByTestId(`rollout-gate-tag-${COMPLETE_STAGE_ID}-${LANDED_CHECK}`),
    ).toBeVisible();

    // Settled, not still deciding. A checklist that can read "not evaluated"
    // is exactly the shape that becomes a permanent spinner.
    await expect(panel.locator('[role="progressbar"]')).toHaveCount(0);
  });

  test('nothing follows Complete: the panel offers no Promote and no Release', async ({ page }) => {
    await openRollout(page, COMPLETE_STAGE_ID);

    const panel = page.getByTestId('complete-step-detail');
    await expect(panel).toBeVisible({ timeout: 20_000 });

    /*
     * ⚠️ SCOPED TO THE PANEL, DELIBERATELY. The Complete panel opens ALONGSIDE
     * the stage panel rather than in place of it, so both actions remain on the
     * page for whichever stage is selected — and must. What would be wrong is
     * either of them inside THIS panel, where the step it would act on is the
     * one nothing comes after.
     *
     * BY ATTRIBUTE AND BY NAME. `data-promote-stage` is how the rest of this
     * suite finds the action, and an action rebuilt without that hook would
     * slip past a selector that only knew the attribute; the accessible name is
     * what a reader would actually be offered.
     */
    await expect(panel.locator('[data-promote-stage]')).toHaveCount(0);
    await expect(panel.locator('[data-release-stage]')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /promote/i })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /release/i })).toHaveCount(0);

    // The step says so in words too, so a reader is told rather than left to
    // infer it from an absence.
    await expect(panel).toContainText('Nothing is promoted after this step.');
  });
});
