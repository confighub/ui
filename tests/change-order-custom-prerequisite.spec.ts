// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * A stage gating only on a check this page cannot evaluate.
 *
 * A workflow may declare its own prerequisites as CEL expressions, evaluated
 * against the Space, the ChangeOrder and that Space's Release. `ui/` has no CEL
 * evaluator and is not getting one — porting the product's gating language into
 * the browser is a second implementation of it, not a port. The server
 * evaluates it when it promotes, and the ChangeOrder page asks it for its verdict
 * with a dry run of the promotion.
 *
 * ⚠️ TWO FAILURES ARE GUARDED AGAINST. Silence: a declared check rendered
 * anywhere but the stage's gate list leaves that list empty, which every reader
 * of it takes as "nothing is holding this". And a stage nobody can promote: a
 * check the page cannot make is not a refusal, and once the server finds it
 * satisfied the stage is promoted like any other. So what is asserted here is
 * the failing row and the held box, then the promotion once the check is
 * satisfied, on a real screen, against a workflow a real server accepted and
 * evaluated.
 */
import { type Page } from '@playwright/test';
import { test, expect, hubApi, newAuthorizedContext } from './fixtures/test';
import {
  CUSTOM_PREREQUISITE,
  type ChangeOrderFixture,
  buildChangeOrderFixture,
} from './fixtures/change-order-fixture';

/** The stage whose only prerequisite is the declared check. */
const GATED_STAGE = 'prod';

test.describe('a stage gating on a declared custom prerequisite', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildChangeOrderFixture(fixturePage, {
      resources: 'minimal',
      releasable: false,
      workflow: 'custom-prerequisite',
    });

    /*
     * `prod`'s mandatory `check/promoted` gate fails until the stage ahead of
     * it has taken the change, and a stage held by that is HELD for a reason
     * other than the declared check this file is about.
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

  /*
   * HELD, THEN PROMOTED, on one ChangeOrder. The check is held by the server's
   * verdict while `dev` carries no sign-off, and once it is signed off the
   * stage is promoted from the page like any other — the case the page once
   * could not do.
   */
  test('the check is held by the server\'s verdict, and once satisfied the stage is promoted', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));

    await page.goto(`${fx.changeOrderPath}/${GATED_STAGE}`);
    const box = page.getByTestId('stage-status');

    // `dev` carries no sign-off annotation, so the server finds the check
    // unsatisfied, and the stage is HELD by that verdict: its line in the log is
    // red, the pill names it, and Promote is locked, waiting for it.
    const red = page.locator('[data-testid^="log-gate-"][data-tone="bad"]');
    await expect(red).toContainText(`${CUSTOM_PREREQUISITE.Name} Failed`, { timeout: 30_000 });
    await expect(box).toHaveAttribute('data-stage-state', 'gateFailed');
    await expect(page.locator('#stage-status-heading')).toContainText(CUSTOM_PREREQUISITE.Name);
    await expect(page.locator(`[data-promote-stage="${GATED_STAGE}"]`)).toHaveCount(0);
    await expect(page.getByTestId('open-promote')).toContainText(`Waiting for ${CUSTOM_PREREQUISITE.Name}`);

    // Named as the workflow names it, and carrying the author's own description,
    // which the server's message lacks, as what it needs.
    await expect(red).toContainText(`Needs ${CUSTOM_PREREQUISITE.Description}`);
    expect(consoleErrors, 'a declared check must not crash the page').toEqual([]);

    for (const space of fx.spacesInStage('dev')) {
      const resp = await hubApi.patch(`/api/space/${space.spaceId}`, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
        data: { Annotations: { 'confighub.com/qa-sign-off': 'yes' } },
      });
      expect(resp.ok(), `sign off ${space.slug}: ${resp.status()} ${await resp.text()}`).toBe(true);
    }

    await page.goto(`${fx.changeOrderPath}/${GATED_STAGE}`);
    // The declared check is satisfied by the server's answer: a passed line, by
    // "auto", with what it checks. (The mandatory `check/promoted` is the arrival line.)
    const passed = page.locator('[data-testid^="log-gate-"]');
    await expect(passed).toHaveCount(1);
    await expect(passed).toHaveAttribute('data-tone', 'okDone', { timeout: 30_000 });
    await expect(passed).toContainText(`${CUSTOM_PREREQUISITE.Name} Passed — ${CUSTOM_PREREQUISITE.Description}`);
    await expect(passed).toContainText('auto');
    await expect(box).toHaveAttribute('data-stage-state', 'ready');

    // No Space here has a Target (`releasable: false`), so Promote is a plain
    // button with nothing to choose between.
    const promote = page.locator(`[data-testid="stage-merge"][data-promote-stage="${GATED_STAGE}"]`);
    await expect(promote).toBeVisible();
    await expect(promote).toHaveAttribute('data-promote-gated', 'false');
    // Nothing is wrong once the dry run is back, so the click promotes: no confirm.
    await expect(promote).toHaveAttribute('data-one-click', 'true', { timeout: 30_000 });
    await promote.click();
    await expect(page.locator('[data-confirm]')).toHaveCount(0);

    // The announcement is chosen from the server's result, so it says the
    // promotion wrote something rather than that the button was pressed.
    await expect(page.locator('#announce')).toContainText(`Promoted to ${GATED_STAGE}.`, {
      timeout: 30_000,
    });

    // Every prod Space has the change now, so prod's gates hold nothing back,
    // whatever they read once the ChangeOrder has completed.
    const lane = page.locator(`a[href="${fx.changeOrderPath}/${GATED_STAGE}"]`);
    const prodSpaces = fx.spacesInStage(GATED_STAGE).length;
    await expect(lane).toContainText(`${prodSpaces} of ${prodSpaces} spaces promoted`, { timeout: 30_000 });
    await expect(lane).not.toContainText('held');
  });
});
