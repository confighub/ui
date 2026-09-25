// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class TriggerDetailPage {
  private readonly deleteButton: Locator;
  private readonly confirmButton: Locator;
  private readonly editButton: Locator;
  private readonly saveButton: Locator;
  private readonly triggerTab: Locator;

  constructor(public readonly page: Page) {
    this.deleteButton = this.page.getByRole('button', { name: 'Delete Trigger' });
    this.confirmButton = this.page.getByRole('button', { name: 'Confirm' });
    this.editButton = this.page.getByRole('button', { name: 'Edit', exact: true });
    this.saveButton = this.page.getByRole('button', { name: 'Update Trigger' });
    this.triggerTab = this.page.getByRole('tab', { name: 'Triggers' });
  }

  async goToTriggerDetail(triggerName: string) {
    // Click on the trigger name in the table to open edit drawer
    // Try exact match first
    const exactText = this.page.getByText(triggerName, { exact: true }).first();
    const exactCount = await exactText.count();

    if (exactCount > 0) {
      await exactText.click();
    } else {
      // Fall back to partial match for HighlightedCell
      const text = this.page.locator(`text=${triggerName}`).first();
      await text.click();
    }
  }

  async checkUnitByNameInTable(name: string) {
    // Find the row that contains the unit name
    const row = this.page.getByRole('row').filter({ hasText: name });

    // Wait for the row to be visible
    await row.waitFor({ state: 'visible' });

    // Find and check the checkbox within that specific row
    const checkbox = row.getByRole('checkbox');
    await checkbox.waitFor({ state: 'visible' });

    // Use click() instead of check() for MUI checkboxes
    const wasChecked = await checkbox.isChecked();
    if (!wasChecked) {
      await checkbox.click();
      // Wait for the checkbox state to update
      await expect(checkbox).toBeChecked();
    }
  }

  async deleteTrigger(triggerName: string) {
    await this.checkUnitByNameInTable(triggerName);
    await this.deleteButton.click();
    await this.confirmButton.click();
  }

  async editTrigger(olderTriggerName: string, triggerName: string) {
    await this.triggerTab.click();
    await this.goToTriggerDetail(olderTriggerName);
    await this.page.getByRole('textbox', { name: 'Name' }).fill(triggerName);

    // Click save and wait for the update API call to complete
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/trigger/') &&
          ['PUT', 'PATCH'].includes(response.request().method()),
      ),
      this.saveButton.click(),
    ]);
  }

  async expectToBeVisibileByText(name: string) {
    // Try exact match first
    const exactText = this.page.getByText(name);
    const exactCount = await exactText.count();

    if (exactCount > 0) {
      await expect(exactText).toBeVisible();
    } else {
      // Fall back to partial match for HighlightedCell
      await expect(this.page.locator(`text=${name}`)).toBeVisible();
    }
  }

  async editTriggerWithDeleteGates({
    triggerName,
    deleteGates,
  }: {
    triggerName: string;
    deleteGates: string[];
  }) {
    await this.triggerTab.click();
    await this.goToTriggerDetail(triggerName);

    // Add delete gates
    for (const gate of deleteGates) {
      await this.page.getByRole('textbox', { name: 'Delete Gate Key' }).fill(gate);
      await this.page.getByRole('button', { name: 'Add Gate' }).click();
    }

    // Click Update Trigger button and wait for the update API call to complete
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/trigger/') &&
          ['PUT', 'PATCH'].includes(response.request().method()),
      ),
      this.saveButton.click(),
    ]);
  }

  async attemptDeleteTriggerByNameExpectingError(name: string, expectedError: string) {
    await this.checkUnitByNameInTable(name);
    await this.deleteButton.click();

    // A delete refused by its DeleteGates is a conflict.
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/trigger') &&
        response.request().method() === 'DELETE' &&
        response.status() === 409,
    );

    await this.confirmButton.click();

    // Wait for the error response
    await responsePromise;

    // Verify the expected error message appears (auto-waits for it to render)
    await this.expectToBeVisibileByText(expectedError);
  }
}
