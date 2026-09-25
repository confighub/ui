// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { WorkerListPage } from './worker-list-page';

export class WorkerDetailPage {
  private readonly deleteWorkerButton: Locator;
  private readonly confirmButton: Locator;
  private readonly editButton: Locator;
  private readonly saveButton: Locator;

  constructor(public readonly page: Page) {
    this.deleteWorkerButton = this.page.getByRole('button', { name: 'Delete', exact: true });
    this.confirmButton = this.page.getByRole('button', { name: 'Confirm', exact: true });
    this.editButton = this.page.getByRole('button', { name: 'Edit', exact: true });
    this.saveButton = this.page.getByRole('button', { name: 'Save', exact: true });
  }

  async goto() {
    await this.page.goto('/bridge-workers');
  }

  async goToWorkerDetailPage(workerSlug: string) {
    const workerListPage = new WorkerListPage(this.page);

    // Click on the worker name in the table to open edit drawer
    await workerListPage.goToDetailPageByRowClick(workerSlug);
  }

  async checkWorkerByName(name: string) {
    const workerListPage = new WorkerListPage(this.page);

    const row = await workerListPage.getRowByName(name);
    // Ensure the row is visible and check the checkbox
    await row.getByRole('checkbox').check();
  }

  async deleteWorker() {
    await this.deleteWorkerButton.click();

    await this.page.waitForTimeout(1000);

    await this.confirmButton.click();

    await this.page.waitForTimeout(1000);
  }

  async editWorker(oldname: string, newName: string) {
    await this.goToWorkerDetailPage(oldname);
    // Click on the worker name to open edit drawer (uses underlined text click pattern)
    await this.page.getByRole('textbox', { name: 'Name' }).fill(newName);

    // Click Update Bridge Worker button
    await this.page.getByRole('button', { name: 'Update Bridge Worker' }).click();

    // Wait for drawer to close
    await this.page.waitForTimeout(1000);
  }

  async expectToBeVisibleByLabel(label: string, text: string) {
    await expect(this.page.getByLabel(label).getByText(text)).toBeVisible();
  }
}
