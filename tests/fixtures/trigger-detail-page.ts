// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class TriggerDetailPage {
  private readonly saveButton: Locator;
  private readonly triggerTab: Locator;

  constructor(public readonly page: Page) {
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
}
