// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { InitiativesPage } from './fixtures/initiatives-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('initiatives page', () => {
  test.use({ storageState: 'authentication.json' });

  test('should create, edit, activate, inspect and delete an initiative', async ({ page }) => {
    test.setTimeout(90000);
    const initiativesPage = new InitiativesPage(page);
    const originalName = `Original ${RandomSlugGenerator.randomSlugName()}`;
    const updatedName = `Updated ${RandomSlugGenerator.randomSlugName()}`;

    await initiativesPage.goto();

    try {
      // Create: the new initiative lands in the kanban with its priority chip
      await initiativesPage.createInitiativeViaUI({
        name: originalName,
        description: 'E2E test initiative',
        priority: 'HIGH',
      });
      const card = page
        .locator('[class*="MuiCard-root"]')
        .filter({ hasText: originalName })
        .first();
      await expect(card.getByText('HIGH')).toBeVisible();

      // Edit: the form is pre-filled, and the new name replaces the old one
      await initiativesPage.openCardMenu(originalName);
      await initiativesPage.clickEditFromMenu();
      const nameField = page.getByRole('textbox', { name: 'Initiative name' });
      await expect(nameField).toHaveValue(originalName);
      await initiativesPage.fillInitiativeForm({ name: updatedName });
      await initiativesPage.updateInitiative();
      await initiativesPage.expectInitiativeVisible(updatedName);
      await initiativesPage.expectInitiativeNotVisible(originalName);

      // Activate: watchers are set before the action so the responses cannot be missed.
      // After the PATCH, RTK Query invalidates the 'View' tag and refetches the list,
      // and only then does the card menu show the in-progress actions.
      const patchDone = page.waitForResponse(
        (r) =>
          r.url().includes('/api/space') &&
          r.request().method() === 'PATCH' &&
          r.status() === 200,
      );
      const refetchDone = page.waitForResponse(
        (r) => r.url().includes('/api/view') && r.request().method() === 'GET' && r.status() === 200,
      );
      await initiativesPage.openCardMenu(updatedName);
      await initiativesPage.clickActivateFromMenu();
      await patchDone;
      await refetchDone;
      await initiativesPage.openCardMenu(updatedName);
      await expect(page.getByRole('menuitem', { name: 'Mark Completed' })).toBeVisible();
      await page.keyboard.press('Escape');

      // Detail: selecting the card shows the inline detail panel below the kanban
      await initiativesPage.selectInitiative(updatedName);
      await expect(page.getByRole('button', { name: 'Recheck' })).toBeVisible();
      await expect(
        page.getByText(
          'This initiative has no compliance check configured. Edit the initiative to add a compliance check.',
        ),
      ).toBeVisible();

      // Delete
      await initiativesPage.deleteInitiativeViaUI(updatedName);
      await initiativesPage.expectInitiativeNotVisible(updatedName);
    } finally {
      await initiativesPage.deleteInitiativeViaAPI(updatedName);
      await initiativesPage.deleteInitiativeViaAPI(originalName);
    }
  });
});
