// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { EntityGridFixture } from './entity-grid-fixture';

export class WorkerListPage extends EntityGridFixture {
  private readonly addWorkerButton: Locator;
  private readonly deleteWorkerButton: Locator;
  private readonly confirmButton: Locator;

  constructor(public readonly page: Page) {
    super(page);
    this.addWorkerButton = this.page.getByTestId('add-bridge-worker-button');
    this.deleteWorkerButton = this.page.getByRole('button', { name: 'Delete' });
    this.confirmButton = this.page.getByRole('button', { name: 'Confirm' });
  }

  async goto() {
    await this.page.goto('/bridge-workers');
  }

  async openEditWorkerDrawer(workerSlug: string) {
    await this.goToDetailPageByRowClick(workerSlug);
  }

  async clickWorkerListNavItem() {
    await this.page.getByRole('button', { name: 'Workers' }).click();
  }

  async addWorker(name: string) {
    await this.addWorkerButton.click();

    // Fill in the name field
    await this.page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);

    // Select Space (use first available space option)
    await this.page.locator('#mui-component-select-SpaceID').click();
    await this.page.getByRole('option', { name: 'Default' }).click();

    // Wait for the API call to complete after clicking Create
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/bridge_worker?') && response.request().method() === 'POST',
    );

    // Click Create Bridge Worker button
    await this.page.getByRole('button', { name: 'Create Bridge Worker' }).click();

    // Wait for the API response
    await responsePromise;

    // Wait for success message to appear
    await this.page
      .getByText('Worker Created Successfully!')
      .waitFor({ state: 'visible', timeout: 10000 });

    // Click Done button to close the success instructions
    await this.page.getByRole('button', { name: 'Close' }).click();

    // Wait for drawer to fully close (animation + state update)
    await this.ensureDrawersClosed();
  }

  /**
   * Ensure all MUI drawers are closed by waiting for them to be fully removed.
   * This prevents "intercepts pointer events" errors in subsequent actions.
   * Uses auto-retrying assertions instead of racy count-then-wait pattern.
   */
  async ensureDrawersClosed() {
    const modal = this.page.locator('.MuiModal-root');

    try {
      await expect(modal).toHaveCount(0, { timeout: 5000 });
    } catch {
      // Modal still present — click backdrop to dismiss, then retry
      const backdrop = this.page.locator('.MuiBackdrop-root');
      if (await backdrop.isVisible().catch(() => false)) {
        await backdrop.first().click({ force: true });
      }
      await expect(modal).toHaveCount(0, { timeout: 3000 });
    }
  }

  async expectToBeVisibleByText(text: string) {
    await expect(this.page.getByText(text, { exact: true })).toBeVisible();
  }

  async expectNotToBeVisibleByText(text: string) {
    await expect(this.page.getByText(text, { exact: true })).not.toBeVisible();
  }

  async editWorkerWithDeleteGates({
    workerName,
    deleteGates,
  }: {
    workerName: string;
    deleteGates: string[];
  }) {
    await this.openEditWorkerDrawer(workerName);

    // Add delete gates
    for (const gate of deleteGates) {
      await this.page.getByRole('textbox', { name: 'Delete Gate Key' }).fill(gate);
      await this.page.getByRole('button', { name: 'Add Gate' }).click();
    }

    // Click Update Bridge Worker button
    await this.page.getByRole('button', { name: 'Update Bridge Worker' }).click();

    // Wait for drawer to close
    await this.ensureDrawersClosed();
  }

  /**
   * Filter workers using the advanced filter WHERE clause
   * @param filterText - The WHERE clause filter text
   */
  async filterWorkers(filterText: string) {
    // BridgeWorker placeholder from ENTITY_FILTER_EXAMPLES
    await this.applyAdvancedFilter(filterText, "Condition = 'Ready'");
  }

  /**
   * Override to add automatic filtering for workers
   */
  async getRowByName(name: string) {
    const row = this.page.getByRole('row', { name }).first();

    // First, try to find the row without filtering
    const isVisible = await row.isVisible({ timeout: 1000 }).catch(() => false);

    if (!isVisible) {
      // Row not immediately visible, try quick search first
      await this.quickFilter(name);
      await this.page.waitForTimeout(500);

      const isVisibleAfterSearch = await row.isVisible({ timeout: 1000 }).catch(() => false);
      if (!isVisibleAfterSearch) {
        // Still not visible, try advanced filtering
        await this.clearQuickFilter();
        await this.filterWorkers(`Slug = '${name}'`);
      }
      // Wait for the row to appear after filter
      await row.waitFor({ state: 'visible', timeout: 5000 });
    }

    return row;
  }

  async goToDetailPageByRowClick(name: string) {
    const row = await this.getRowByName(name);

    // Click the worker name link within the row to open the edit drawer
    await row.getByRole('link', { name }).click();
  }

  async deleteWorker(name: string) {
    await this.selectRow(name);

    await this.deleteWorkerButton.click();
    await this.page.waitForTimeout(1000);
    await this.confirmButton.click();
  }

  async attemptDeleteWorkerByNameExpectingError(name: string, expectedError: string) {
    await this.selectRow(name);
    await this.deleteWorkerButton.click();

    // A delete refused by its DeleteGates is a conflict.
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/bridge_worker') &&
        response.request().method() === 'DELETE' &&
        response.status() === 409,
    );

    await this.confirmButton.click();

    // Wait for the error response
    await responsePromise;

    // Wait for error message to appear
    await this.page.waitForTimeout(1000);

    // Verify the expected error message appears
    await expect(this.page.getByText(expectedError)).toBeVisible();
  }
}
