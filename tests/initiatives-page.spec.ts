// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { InitiativesPage } from './fixtures/initiatives-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('initiatives page', () => {
  test.use({ storageState: 'authentication.json' });

  test.beforeEach(async ({ page }) => {
    const initiativesPage = new InitiativesPage(page);
    await initiativesPage.goto();
  });

  test('should show initiatives page with header and new initiative button', async ({ page }) => {
    // The breadcrumb renders "Initiatives" as a Typography element — use first() since
    // kanban column labels also contain the word "initiatives" in longer strings.
    await expect(page.getByText('Initiatives', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Initiative' })).toBeVisible();
  });

  test('should navigate to initiative creation form when clicking New Initiative', async ({ page }) => {
    const initiativesPage = new InitiativesPage(page);

    await initiativesPage.clickNewInitiative();

    await expect(page).toHaveURL(/\/x\/initiatives\/new$/);
    await expect(page.getByRole('textbox', { name: 'Initiative name' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Initiative' })).toBeVisible();
  });

  test('should show back button in initiative editor that navigates to list', async ({ page }) => {
    const initiativesPage = new InitiativesPage(page);

    await initiativesPage.clickNewInitiative();

    // Verify the back button is visible in the editor left pane. The name must match
    // exactly: a substring match on 'Back' also selects the "Feedback" button in the
    // header, and `exact` is what keeps the two apart.
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();

    // Click back and verify we return to the initiatives list
    await initiativesPage.clickBackButton();

    await initiativesPage.expectOnInitiativesPage();
    await expect(page.getByRole('button', { name: 'New Initiative' })).toBeVisible();
  });

  test('should create a initiative and show it in the kanban', async ({ page }) => {
    const initiativesPage = new InitiativesPage(page);
    const initiativeName = `Test Initiative ${RandomSlugGenerator.randomSlugName()}`;

    try {
      await initiativesPage.createInitiativeViaUI({
        name: initiativeName,
        description: 'E2E test initiative',
        priority: 'HIGH',
      });

      // Initiative should appear in the Draft column of the kanban
      await initiativesPage.expectInitiativeVisible(initiativeName);

      // Priority chip should be visible inside the card
      const card = page.locator('[class*="MuiCard-root"]').filter({ hasText: initiativeName }).first();
      await expect(card.getByText('HIGH')).toBeVisible();
    } finally {
      // Clean up: delete the initiative via API to avoid test pollution
      await initiativesPage.deleteInitiativeViaAPI(initiativeName);
    }
  });

  test('should delete a initiative and remove it from the kanban', async ({ page }) => {
    const initiativesPage = new InitiativesPage(page);
    const initiativeName = `Delete Test ${RandomSlugGenerator.randomSlugName()}`;

    // Create the initiative first
    await initiativesPage.createInitiativeViaUI({ name: initiativeName });

    // Delete it via the UI
    await initiativesPage.deleteInitiativeViaUI(initiativeName);

    // The initiative card should no longer be visible
    await initiativesPage.expectInitiativeNotVisible(initiativeName);
  });

  test('should edit a initiative name and reflect the change in the kanban', async ({ page }) => {
    const initiativesPage = new InitiativesPage(page);
    const originalName = `Original ${RandomSlugGenerator.randomSlugName()}`;
    const updatedName = `Updated ${RandomSlugGenerator.randomSlugName()}`;

    try {
      // Create the initiative
      await initiativesPage.createInitiativeViaUI({
        name: originalName,
        description: 'Will be edited',
        priority: 'LOW',
      });

      // Open the edit form via the card menu
      await initiativesPage.openCardMenu(originalName);
      await initiativesPage.clickEditFromMenu();

      // Wait for the editor to load and the form to be pre-filled with the existing name
      const nameField = page.getByRole('textbox', { name: 'Initiative name' });
      await expect(nameField).toBeVisible();
      await expect(nameField).toHaveValue(originalName);

      // Update the name
      await initiativesPage.fillInitiativeForm({ name: updatedName });
      await initiativesPage.updateInitiative();

      // The updated name should appear in the kanban, the original should be gone
      await initiativesPage.expectInitiativeVisible(updatedName);
      await initiativesPage.expectInitiativeNotVisible(originalName);
    } finally {
      // Clean up both names in case test partially failed
      await initiativesPage.deleteInitiativeViaAPI(updatedName);
      await initiativesPage.deleteInitiativeViaAPI(originalName);
    }
  });

  test('should change initiative status from draft to in_progress via card menu', async ({
    page,
  }) => {
    const initiativesPage = new InitiativesPage(page);
    const initiativeName = `Status Test ${RandomSlugGenerator.randomSlugName()}`;

    try {
      await initiativesPage.createInitiativeViaUI({ name: initiativeName });

      // Initially in draft — open menu and activate it.
      // Set up response watchers before triggering the action to avoid race conditions.
      const patchDone = page.waitForResponse(
        (r) =>
          r.url().includes('/api/space') &&
          r.request().method() === 'PATCH' &&
          r.status() === 200,
      );
      // After the PATCH, RTK Query invalidates the 'View' tag and refetches the list.
      // We must wait for that GET before checking the card's updated menu state.
      const refetchDone = page.waitForResponse(
        (r) => r.url().includes('/api/view') && r.request().method() === 'GET' && r.status() === 200,
      );
      await initiativesPage.openCardMenu(initiativeName);
      await initiativesPage.clickActivateFromMenu();
      await patchDone;
      await refetchDone;

      // The card should now be in the "In Progress" column — its menu should have
      // "Mark Completed" instead of "Activate".
      await initiativesPage.openCardMenu(initiativeName);
      await expect(page.getByRole('menuitem', { name: 'Mark Completed' })).toBeVisible();
      await page.keyboard.press('Escape');
    } finally {
      await initiativesPage.deleteInitiativeViaAPI(initiativeName);
    }
  });

  test('should require a name to save a initiative', async ({ page }) => {
    const initiativesPage = new InitiativesPage(page);

    await initiativesPage.clickNewInitiative();

    // Try to save without filling in the name
    await page.getByRole('button', { name: 'Save Initiative' }).click();

    // Should show validation error and stay on the create page
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page).toHaveURL(/\/x\/initiatives\/new$/);
  });

  test('should show initiative detail panel when card is selected', async ({ page }) => {
    const initiativesPage = new InitiativesPage(page);
    const initiativeName = `Detail Test ${RandomSlugGenerator.randomSlugName()}`;

    try {
      await initiativesPage.createInitiativeViaUI({ name: initiativeName });

      // Click the card to select it — shows the inline detail panel below the kanban.
      await initiativesPage.selectInitiative(initiativeName);

      // The detail header has a "Recheck" button unique to the detail panel.
      await expect(page.getByRole('button', { name: 'Recheck' })).toBeVisible();

      // An info alert about no compliance check should appear (no trigger was set up)
      await expect(
        page.getByText(
          'This initiative has no compliance check configured. Edit the initiative to add a compliance check.',
        ),
      ).toBeVisible();
    } finally {
      await initiativesPage.deleteInitiativeViaAPI(initiativeName);
    }
  });
});
