// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { EntityGridFixture } from './entity-grid-fixture';

export class TargetListPage extends EntityGridFixture {
  private readonly addTargetButton: Locator;
  private readonly deleteTargetButton: Locator;
  private readonly confirmButton: Locator;

  constructor(public readonly page: Page) {
    super(page);
    this.addTargetButton = this.page.getByTestId('add-target-button');
    this.deleteTargetButton = this.page.getByRole('button', { name: 'Delete' });
    this.confirmButton = this.page.getByRole('button', { name: 'Confirm' });
  }

  async goto() {
    await this.page.goto('/targets');
  }

  async clickTargetListNavItem() {
    await this.page.getByRole('button', { name: 'Targets' }).click();
  }

  async goToDetailPageByRowClick(targetName: string) {
    await this.page.getByLabel(targetName, { exact: true }).click();
  }

  async editTarget({ targetName, newTargetName }: { targetName: string; newTargetName: string }) {
    await this.goToDetailPageByRowClick(targetName);

    await this.page.getByRole('textbox', { name: 'Name', exact: true }).fill(newTargetName);

    await this.page.getByRole('button', { name: 'Update Target' }).click();
  }

  async addTarget({ targetName }: { targetName: string }) {
    await this.addTargetButton.click();

    // Fill in the name field
    await this.page.getByRole('textbox', { name: 'Name', exact: true }).fill(targetName);

    await this.page.locator('#mui-component-select-SpaceID').click();
    await this.page.getByRole('option', { name: 'Default' }).click();

    // Click Create Target button
    await this.page.getByRole('button', { name: 'Create Target' }).click();
  }

  async closeTargetDetailDrawer() {
    await this.page.locator('.MuiBackdrop-root').click();
  }

  async deleteTarget(name: string) {
    await this.selectRow(name);

    await this.deleteTargetButton.click();

    // Confirm button click auto-waits for the confirmation dialog to appear
    await this.confirmButton.click();
  }

  /**
   * Filter targets using the advanced filter WHERE clause
   * @param filterText - The WHERE clause filter text
   */
  async filterTargets(filterText: string) {
    // Target placeholder from ENTITY_FILTER_EXAMPLES
    await this.applyAdvancedFilter(filterText, "Labels.environment = 'prod'");
  }

  /**
   * Gets a row by name, automatically filtering for it if not immediately visible.
   * This overrides the parent method to add automatic filtering for targets
   * @param name The name/text to search for in the row
   * @returns A Locator for the row
   */
  async getRowByName(name: string) {
    try {
      // Try the parent method first (handles HighlightedCell)
      return await super.getRowByName(name);
    } catch {
      // If not found, try quick search first.
      // super.getRowByName auto-waits for the filtered row to appear.
      await this.quickFilter(name);

      try {
        return await super.getRowByName(name);
      } catch {
        // Still not found, try advanced filtering
        await this.clearQuickFilter();
        await this.filterTargets(`Slug = '${name}'`);
        // Try again with parent method (auto-waits for the row)
        return await super.getRowByName(name);
      }
    }
  }

  async expectToBeVisibleByText(text: string) {
    // Try exact match first, then fall back to hasText for HighlightedCell
    const exactText = this.page.getByText(text, { exact: true });
    const exactCount = await exactText.count();

    if (exactCount > 0) {
      await expect(exactText).toBeVisible();
    } else {
      // Fall back to partial match for HighlightedCell
      await expect(this.page.locator('text=' + text)).toBeVisible();
    }
  }

  async expectNotToBeVisibleByText(text: string) {
    // For not visible, check both exact and partial matches
    const exactText = this.page.getByText(text, { exact: true });
    const partialText = this.page.locator('text=' + text);

    const exactCount = await exactText.count();
    const partialCount = await partialText.count();

    if (exactCount > 0) {
      await expect(exactText).not.toBeVisible();
    } else if (partialCount > 0) {
      await expect(partialText).not.toBeVisible();
    }
    // If neither exists, the expectation is already met
  }

  async editTargetWithDeleteGates({
    targetName,
    deleteGates,
  }: {
    targetName: string;
    deleteGates: string[];
  }) {
    await this.goToDetailPageByRowClick(targetName);

    // Add delete gates
    for (const gate of deleteGates) {
      await this.page.getByRole('textbox', { name: 'Delete Gate Key' }).fill(gate);
      await this.page.getByRole('button', { name: 'Add Gate' }).click();
    }

    // Click Update Target button and wait for the update API call to complete
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/target/') &&
          ['PUT', 'PATCH'].includes(response.request().method()),
      ),
      this.page.getByRole('button', { name: 'Update Target' }).click(),
    ]);
  }

  async attemptDeleteTargetByNameExpectingError(name: string, expectedError: string) {
    await this.selectRow(name);
    await this.deleteTargetButton.click();

    // A delete refused by its DeleteGates is a conflict.
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/target') &&
        response.request().method() === 'DELETE' &&
        response.status() === 409,
    );

    await this.confirmButton.click();

    // Wait for the error response
    await responsePromise;

    // Verify the expected error message appears (auto-waits for it to render)
    await this.expectToBeVisibleByText(expectedError);
  }
}
