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
    // The name links to the edit drawer from the Triggers table. The Overview tab names the
    // Space's applied Triggers too, so the table's link is the one to click.
    await this.page.getByRole('link', { name: triggerName, exact: true }).click();
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
    await expect(this.page.getByRole('link', { name, exact: true })).toBeVisible();
  }
}
