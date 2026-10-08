// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * A stage gating only on a check this page cannot evaluate.
 *
 * A workflow may declare its own prerequisites as CEL expressions, evaluated
 * against the Space, the ChangeOrder and that Space's Release. `ui/` has no CEL
 * evaluator and is not getting one — porting the product's gating language into
 * the browser is a second implementation of it, not a port. The server
 * evaluates it when it promotes, and the rollout page asks it for its verdict
 * with a dry run of the promotion.
 *
 * ⚠️ TWO FAILURES ARE GUARDED AGAINST. Silence: a declared check rendered
 * anywhere but the stage's gate list leaves that list empty, which every reader
 * of it takes as "nothing is holding this". And a stage nobody can promote: a
 * check the page cannot make is not a refusal, and once the server finds it
 * satisfied the stage is promoted like any other. So what is asserted here is
 * the padlock, the row and the dialog together, on a real screen, against a
 * workflow a real server accepted and evaluated.
 */
import { type Page } from '@playwright/test';
import { test, expect, hubApi, newAuthorizedContext } from './fixtures/test';
import {
  CUSTOM_PREREQUISITE,
  type RolloutFixture,
  buildRolloutFixture,
} from './fixtures/rollout-fixture';
import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import { SERVER_GATES_POLL_INTERVAL_MS } from '../src/pages/x/apps/rollout/useServerStageGates';

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

  const gateTestId = `${GATED_STAGE}-custom-prerequisite:${CUSTOM_PREREQUISITE.Name}`;

  test('renders the check by name, held by the server\'s verdict', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));

    await page.goto(`/rollouts/${fx.changeOrderSlug}/${GATED_STAGE}`);
    const promote = page.locator(`[data-promote-stage="${GATED_STAGE}"]`);
    await expect(promote).toBeVisible({ timeout: 30_000 });

    // `dev` carries no sign-off annotation, so the server finds the check
    // unsatisfied, and the stage is HELD by that verdict.
    await expect(page.getByTestId(`rollout-gate-tag-${gateTestId}`)).toHaveText(
      rolloutCopy.gateTag.unsatisfied,
      { timeout: 30_000 },
    );
    await expect(promote).toHaveAttribute('data-promote-gated', 'true');

    // Named, so a reader can match the row to the line in the workflow, and
    // carrying the author's own description beside the server's message, which
    // names the check but not what it wants.
    await expect(page.getByText(`check/${CUSTOM_PREREQUISITE.Name}`).first()).toBeVisible();
    await expect(page.getByText(CUSTOM_PREREQUISITE.Description).first()).toBeVisible();
    await expect(page.getByText(/could not be evaluated|does not satisfy prerequisite/).first()).toBeVisible();

    await expect(page.getByText(/selects no Space/)).toHaveCount(0);
    expect(consoleErrors, 'a declared check must not crash the page').toEqual([]);
  });

  test('the dialog names the failed check as what is holding the stage', async ({ page }) => {
    await page.goto(`/rollouts/${fx.changeOrderSlug}/${GATED_STAGE}`);
    const promote = page.locator(`[data-promote-stage="${GATED_STAGE}"]`);
    await expect(promote).toHaveAttribute('data-promote-gated', 'true', { timeout: 30_000 });
    await promote.click();

    // Held means held: the dialog names the check and offers nothing to press.
    await expect(page.getByText(/A gate holds this stage/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await expect(page.locator('[data-promote-rel]')).toHaveCount(0);
    await page.locator('[data-cancel]').click();
  });

  /*
   * ⚠️ A VERDICT FETCHED ON ITS OWN CLOCK HAS TO BE SHOWN TO STAY.
   *
   * The server's answer arrives after the page has painted, and is asked for
   * again on a poll. A refresh that dropped the answer before the next one
   * arrived would flicker the gate back to not evaluated, and the Promote
   * button with it. So the settled screen is asserted, and asserted again after
   * the dry run has been asked for again.
   */
  test('the server\'s verdict settles, and stays settled', async ({ page }) => {
    await page.goto(`/rollouts/${fx.changeOrderSlug}/${GATED_STAGE}`);
    const gateTag = page.getByTestId(`rollout-gate-tag-${gateTestId}`);
    await expect(gateTag).toHaveText(rolloutCopy.gateTag.unsatisfied, { timeout: 30_000 });
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);

    // The gate poll's dry run, not the stage panel's, which asks for each Unit's
    // configuration and has no gate verdict to refresh.
    await page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname.endsWith('/promote') &&
        !(new URL(request.url()).searchParams.get('include') ?? '').split(',').includes('ConfigData'),
      { timeout: SERVER_GATES_POLL_INTERVAL_MS * 2 },
    );
    await page.waitForTimeout(2_000);
    await expect(gateTag).toHaveText(rolloutCopy.gateTag.unsatisfied);
    await expect(page.locator(`[data-promote-stage="${GATED_STAGE}"]`)).toHaveAttribute(
      'data-promote-gated',
      'true',
    );
  });

  /*
   * THE CASE THE PAGE ONCE COULD NOT DO. A check only the server can make,
   * satisfied, is a stage promoted from here like any other.
   */
  test('once the check is satisfied, the stage is promoted from the page', async ({ page }) => {
    // The prod Spaces take from `staging`, which this workflow has no stage
    // for, so it is given the change here; otherwise prod has nothing to take.
    await fx.promoteStage('staging');
    for (const space of fx.spacesInStage('dev')) {
      const resp = await hubApi.patch(`/api/space/${space.spaceId}`, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
        data: { Annotations: { 'confighub.com/qa-sign-off': 'yes' } },
      });
      expect(resp.ok(), `sign off ${space.slug}: ${resp.status()} ${await resp.text()}`).toBe(true);
    }

    await page.goto(`/rollouts/${fx.changeOrderSlug}/${GATED_STAGE}`);
    // Every gate holding, the list collapses to its summary: the mandatory
    // `check/promoted` and the declared check, both by the server's answer.
    await expect(page.getByRole('button', { name: /Gates 2 of 2 satisfied/ })).toBeVisible({
      timeout: 30_000,
    });
    const promote = page.locator(`[data-promote-stage="${GATED_STAGE}"]`);
    await expect(promote).toHaveAttribute('data-promote-gated', 'false');

    await promote.click();
    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/A gate holds this stage/)).toHaveCount(0);
    await confirm.click();

    // The announcement is chosen from the server's result, so it says the
    // promotion wrote something rather than that the button was pressed.
    await expect(page.locator('#announce')).toContainText(`Promoted to ${GATED_STAGE}.`, {
      timeout: 30_000,
    });

    // Every prod Space has the change now, so prod's gates hold nothing back,
    // whatever they read once the rollout has completed.
    const lane = page.locator(`a[href="/rollouts/${fx.changeOrderSlug}/${GATED_STAGE}"]`);
    const prodSpaces = fx.spacesInStage(GATED_STAGE).length;
    await expect(lane).toContainText(`${prodSpaces} of ${prodSpaces} spaces promoted`, { timeout: 30_000 });
    await expect(lane).not.toContainText('held');
  });
});
