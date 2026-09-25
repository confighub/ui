// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class TargetDetailPage {
  private readonly deleteTargetButton: Locator;
  private readonly confirmButton: Locator;
  private readonly editButton: Locator;

  constructor(public readonly page: Page) {
    this.deleteTargetButton = this.page.getByRole('button', { name: 'Delete', exact: true });
    this.confirmButton = this.page.getByRole('button', { name: 'Confirm', exact: true });
    this.editButton = this.page.getByRole('button', { name: 'Edit', exact: true });
  }

  async deleteTarget() {
    await this.deleteTargetButton.click();

    await this.confirmButton.click();
  }

  async expectToBeVisibleByText(text: string) {
    await expect(this.page.getByText(text)).toBeVisible();
  }

  async expectNotToBeVisibleByText(text: string) {
    await expect(this.page.getByText(text)).not.toBeVisible();
  }

  async expectToBeVisibleByLabel(label: string, text: string) {
    await expect(this.page.getByLabel(label).getByText(text)).toBeVisible();
  }
}
