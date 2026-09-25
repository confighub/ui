// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { Role } from '../types';

export class SpaceDetailPage {
  private readonly triggersTab: Locator;
  private readonly addTriggerButton: Locator;
  private readonly deleteSpaceButton: Locator;
  private readonly confirmationButton: Locator;
  private readonly editButton: Locator;
  private readonly saveButton: Locator;
  private readonly triggerTab: Locator;

  constructor(public readonly page: Page) {
    this.triggersTab = this.page.getByRole('tab', { name: 'Triggers' });
    this.addTriggerButton = this.page.getByRole('button', { name: 'Add Trigger' });
    this.deleteSpaceButton = this.page.getByRole('button', { name: 'Delete Space' });
    this.confirmationButton = this.page.getByRole('button', { name: 'Confirm' });
    this.editButton = this.page.getByRole('button', { name: 'Edit', exact: true });
    // exact:true so this never also matches buttons whose name merely contains
    // "Save" (e.g. a "Saved Functions" accordion), which would cause a strict-mode
    // violation. (Pre-existing issue: this also fails on main.)
    this.saveButton = this.page.getByRole('button', { name: 'Save', exact: true });
    this.triggerTab = this.page.getByRole('tab', { name: 'Triggers' });
  }

  async clickTriggersTab() {
    await this.triggersTab.click();
    await this.addTriggerButton.waitFor({ state: 'visible' });
  }

  async addCelTrigger(name: string) {
    await this.addTriggerButton.click();
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

  async addSetPodDefaultsTrigger(name: string) {
    await this.addTriggerButton.click();

    await this.page.getByRole('textbox', { name: 'Name' }).fill(name);
    await this.page.getByRole('combobox', { name: 'Function Name' }).click();

    await this.page.getByRole('option', { name: 'set-pod-defaults' }).click();

    await this.page.getByRole('group', { name: 'Pod-security' }).getByLabel('true').click();
    await this.page
      .getByRole('group', { name: 'Automount-service-account-token' })
      .getByLabel('true')
      .click();
    await this.page
      .getByRole('group', { name: 'Security-context' })
      .getByLabel('true')
      .click();
    await this.page.getByRole('group', { name: 'Resources' }).getByLabel('true').click();
    await this.page.getByRole('group', { name: 'Probes' }).getByLabel('true').click();

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

  async addValidatedTrigger(name: string) {
    await this.addTriggerButton.click();

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

  async editSpace(name: string) {
    await this.page.getByRole('textbox', { name: 'Name' }).fill(name);

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

  async goToTriggerDetailByName(name: string) {
    await this.triggerTab.click();

    // Try exact match first
    const exactLink = this.page.getByRole('link', { name });
    const exactCount = await exactLink.count();

    if (exactCount > 0) {
      await exactLink.click();
    } else {
      // Fall back to text content matching for HighlightedCell
      const link = this.page.locator('a').filter({ hasText: name }).first();
      await link.click();
    }
  }

  async expectToBeVisibleByRole(role: Role, name: string) {
    // Try exact match first
    const exactElement = this.page.getByRole(role, { name });
    const exactCount = await exactElement.count();

    if (exactCount > 0) {
      await expect(exactElement).toBeVisible();
    } else {
      // Fall back to partial match for HighlightedCell
      const element = this.page.locator(`[role="${role}"]`).filter({ hasText: name }).first();
      await expect(element).toBeVisible();
    }
  }

  async expectNotToBeVisibleByRole(role: Role, name: string) {
    // Try exact match first
    const exactElement = this.page.getByRole(role, { name });
    const exactCount = await exactElement.count();

    if (exactCount > 0) {
      await expect(exactElement).not.toBeVisible();
    }
    // If exact match doesn't exist, the expectation is already met
  }

  async expectToBeVisibleByText(text: string) {
    await expect(this.page.getByText(text)).toBeVisible();
  }

  async expectToBeVisibleByLabel(label: string, text: string) {
    await expect(this.page.getByLabel(label).getByText(text)).toBeVisible();
  }
}
