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

  test('a card dragged out and dropped back on itself stays on the board; a plain click opens it', async ({ page }) => {
    test.setTimeout(90000);
    const initiativesPage = new InitiativesPage(page);
    const name = `Drag ${RandomSlugGenerator.randomSlugName()}`;

    await initiativesPage.goto();
    try {
      await initiativesPage.createInitiativeViaUI({ name, description: 'E2E drag test', priority: 'LOW' });
      await page.goto('/x/initiatives');
      const card = page.locator('[class*="MuiCard-root"]').filter({ hasText: name }).first();
      await expect(card).toBeVisible();

      // The card's link is stretched over it, so the press lands on the link.
      const box = (await card.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      // Past the pointer sensor's 8px activation distance, then back.
      for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 6, y + i * 3);
      for (let i = 5; i >= 0; i--) await page.mouse.move(x + i * 6, y + i * 3);
      await page.mouse.up();
      // The click that follows the drop must not follow the link.
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/x\/initiatives$/);
      await expect(card).toBeVisible();

      await page.mouse.click(x, y);
      await page.waitForURL(/\/x\/initiatives\/[^/]+$/);
    } finally {
      await initiativesPage.deleteInitiativeViaAPI(name);
    }
  });
});
