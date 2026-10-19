// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class SpaceDetailPage {
  private readonly triggersTab: Locator;
  private readonly createTriggerButton: Locator;
  private readonly deleteSpaceButton: Locator;
  private readonly confirmationButton: Locator;
  private readonly saveButton: Locator;

  constructor(public readonly page: Page) {
    this.triggersTab = this.page.getByRole('tab', { name: 'Triggers' });
    this.createTriggerButton = this.page.getByTestId('create-trigger-button');
    this.deleteSpaceButton = this.page.getByRole('button', { name: 'Delete Space' });
    this.confirmationButton = this.page.getByRole('button', { name: 'Confirm' });
    // exact:true so this never also matches buttons whose name merely contains
    // "Save" (e.g. a "Saved Functions" accordion), which would cause a strict-mode
    // violation. (Pre-existing issue: this also fails on main.)
    this.saveButton = this.page.getByRole('button', { name: 'Save', exact: true });
  }

  async clickTriggersTab() {
    await this.triggersTab.click();
    await this.createTriggerButton.waitFor({ state: 'visible' });
  }

  // Create opens the function invoker; the Trigger form is the other way, in its menu.
  async openTriggerForm() {
    await this.page.getByRole('button', { name: 'More ways to create a Trigger' }).click();
    await this.page.getByRole('menuitem', { name: 'With the Trigger form' }).click();
  }

  async addCelTrigger(name: string) {
    await this.openTriggerForm();
    await this.page.getByRole('textbox', { name: 'Name' }).fill(name);

    const combobox = await this.page.getByRole('combobox', { name: 'Function Name' });
    await combobox.click();
    await combobox.fill('vet-cel');
    await this.page.getByRole('option', { name: 'vet-cel', exact: true }).click();

    await this.page
      .getByRole('textbox', { name: 'Expression' })
      .fill("r.kind != 'Deployment' || r.spec.replicas <= 10");

    await this.page.getByRole('button', { name: 'Create Trigger' }).click();

    await this.page.waitForTimeout(2000);
  }

  async addValidatedTrigger(name: string) {
    await this.openTriggerForm();

    await this.page.getByRole('textbox', { name: 'Name' }).fill(name);
    await this.page.getByRole('combobox', { name: 'Function Name' }).click();
    await this.page.getByRole('option', { name: 'validate', exact: true }).click();

    // Click Create Trigger and wait for the create API call to complete
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/trigger') &&
          response.request().method() === 'POST',
      ),
      this.page.getByRole('button', { name: 'Create Trigger' }).click(),
    ]);
  }

  async deleteSpace() {
    await this.deleteSpaceButton.click();
    await this.confirmationButton.click();
  }

  async goToSettingsTab() {
    await this.page.getByRole('tab', { name: 'Settings' }).click();
    await this.page.getByTestId('space-settings-form').waitFor({ state: 'visible' });
  }

  async editSpace(name: string) {
    await this.goToSettingsTab();
    await this.page
      .getByTestId('space-settings-form')
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill(name);

    // Click save and wait for the space update API call to complete
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          /\/space\/[^/]+$/.test(new URL(response.url()).pathname) &&
          ['PUT', 'PATCH'].includes(response.request().method()),
      ),
      this.saveButton.click(),
    ]);
  }

  async expectToBeVisibleByText(text: string) {
    await expect(this.page.getByText(text)).toBeVisible();
  }

  async expectToBeVisibleByLabel(label: string, text: string) {
    await expect(this.page.getByLabel(label).getByText(text)).toBeVisible();
  }
}
