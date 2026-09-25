// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';

// ============================================================================
// Tour-to-tour continuity E2E test.
//
// Proves the whole feature end to end: finishing a tour's last step shows a
// completion screen (not a silent disappearance), "Continue" starts the next
// tour in the sequence at its own first step, and the Getting Started panel
// marks the finished tour complete automatically — with its manual toggle
// never touched.
//
// Drives chapter 1 for real (it is the only tour whose last step is a plain
// click with no further dependency), so this run creates one real base
// component. Cleaned up in afterAll via a unique, timestamped name.
// ============================================================================

let baseSpaceId: string | undefined;
const COMPONENT_NAME = `tour-continuity-${Date.now()}`;

test.describe('tour-to-tour continuity', () => {
  test.use({ storageState: 'authentication.json' });

  test.afterAll(async ({ browser }) => {
    if (!baseSpaceId) return;
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.status() === 200);
    const api = new ApiHelper(page);
    await api.deleteSpace(baseSpaceId, true).catch(() => {});
    await context.close();
  });

  test('finishing chapter 1 offers, and can continue into, "Explore your component" — and the panel marks it done automatically', async ({
    page,
  }) => {
    await page.goto('/components?tour=getting-started');
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});

    const tooltip = page.getByTestId('tour-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 20000 });

    // Drive chapter 1 to its end.
    await page.getByTestId('header-add-button').click();
    const wizard = page.locator('[role="dialog"][aria-labelledby="create-component-title"]');
    await expect(wizard).toBeVisible({ timeout: 10000 });

    const nameInput = wizard.getByTestId('create-component-name-input').locator('input');
    await nameInput.click();
    await nameInput.pressSequentially(COMPONENT_NAME);
    await tooltip.getByRole('button', { name: 'Next' }).click();

    await wizard.getByTestId('create-component-next-button').click();
    await expect(tooltip).toContainText('Add the units', { timeout: 10000 });
    await wizard.getByTestId('create-component-insert-sample-button').click();
    await expect(tooltip).toContainText('Three resources, two units', { timeout: 10000 });

    await wizard.getByTestId('create-component-next-button').click();
    await expect(tooltip).toContainText('Create the component', { timeout: 10000 });

    await wizard.getByTestId('create-component-submit-button').click();

    // The wizard shows its own confirmation screen rather than closing
    // itself — the tour has one more step confirming/dismissing it.
    await expect(tooltip).toContainText('The component is ready', { timeout: 10000 });
    await wizard.getByTestId('create-component-done-button').click();

    // The tooltip is gone; the completion screen has taken its place.
    await expect(tooltip).toHaveCount(0, { timeout: 10000 });
    const completion = page.getByTestId('tour-completion');
    await expect(completion).toBeVisible({ timeout: 10000 });
    await expect(completion).toContainText('Make your first component');

    // Continue into the next tour.
    await page.getByTestId('tour-completion-continue').click();
    await expect(completion).toHaveCount(0);
    await expect(tooltip).toBeVisible({ timeout: 10000 });
    await expect(tooltip).toContainText('1 of 4');
    await expect(tooltip).toContainText('Your new component');

    // Leave the second tour without finishing it — this test only proves the handoff.
    await tooltip.getByRole('button', { name: 'Exit' }).click();
    await expect(tooltip).toHaveCount(0);

    // The panel shows chapter 1 as done, automatically — never touched its own checkbox.
    await page.getByRole('button', { name: 'Get started' }).click();
    const firstTourRow = page.getByRole('button', {
      name: 'Mark as not done: Make your first component',
    });
    await expect(firstTourRow).toBeVisible({ timeout: 5000 });
    await expect(firstTourRow).toHaveAttribute('aria-pressed', 'true');

    const api = new ApiHelper(page);
    // The wizard names the base space `<component>-base` (components.md's own
    // convention), not the component name itself.
    const space = await api.getSpaceBySlug(`${COMPONENT_NAME}-base`);
    baseSpaceId = space.SpaceID;
  });
});
