// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { Space, SpaceRead } from '@confighub/rtk-query';
import { Role } from '../types';
import { ApiHelper } from './api-helper';
import { EntityGridFixture } from './entity-grid-fixture';

export class SpaceListPage extends EntityGridFixture {
  private readonly addSpaceButton: Locator;

  constructor(public readonly page: Page) {
    super(page);
    this.addSpaceButton = this.page.getByRole('button', { name: 'Add', exact: true });
  }

  async goto() {
    await this.page.goto('/spaces');
  }

  async searchInGrid(searchTerm: string) {
    // The GridToolbarQuickFilter in MUI DataGrid Premium is typically a search textbox
    const searchInput = this.page.getByPlaceholder('Search…');
    await searchInput.fill(searchTerm);
    // Callers (e.g. getRowByName) auto-wait for the filtered row via waitFor()
  }

  async getRowByName(name: string, exact = false) {
    const row = this.page.getByRole('row', { name, exact });

    // First, try to find the row without searching
    const isVisible = await row.isVisible({ timeout: 1000 }).catch(() => false);

    if (!isVisible) {
      // Row not immediately visible, try searching for it
      await this.searchInGrid(name);
      // Wait for the row to appear after search
      await row.waitFor({ state: 'visible', timeout: 5000 });
    }

    return row;
  }

  async clickSpaceListNavItem() {
    await this.page.getByRole('button', { name: 'Spaces' }).click();
  }

  async goToSpaceDetailPageByName(displayName: string) {
    // Use a more flexible selector to handle HighlightedCell wrapping
    // First try exact match
    const exactLink = this.page.getByRole('link', { name: displayName });
    const exactCount = await exactLink.count();

    if (exactCount > 0) {
      await exactLink.click();
    } else {
      // Fall back to text content matching for HighlightedCell
      const link = this.page.locator('a').filter({ hasText: displayName }).first();
      await link.click();
    }

    // Wait for navigation to the space detail page (/spaces/:id)
    await this.page.waitForURL(/\/spaces\/[^/]+/);
  }

  async addSpace(name: string) {
    await this.addSpaceButton.click();
    await this.page.getByRole('textbox', { name: 'Name' }).fill(name);

    // Click Save and wait for the create-space API call to complete.
    // Use exact:true so the locator never matches other buttons whose accessible
    // name merely contains "Save" (e.g. a "Saved Functions" accordion), which would
    // otherwise trigger a strict-mode violation.
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          /\/space$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST',
      ),
      this.page.getByRole('button', { name: 'Save', exact: true }).click(),
    ]);

    // Wait for the new space to render in the grid before returning. The create
    // POST resolving does not mean the list has re-fetched and rendered the row;
    // callers assert on the space link, so wait for it (the real UI-settled state)
    // rather than returning early after only the API call completes.
    await expect(this.page.getByRole('link', { name }).first()).toBeVisible();
  }

  async goToSelectedSpace(name: string) {
    await this.page.getByText(name).click();
  }

  /**
   * Filter spaces using the advanced filter WHERE clause
   * @param filterText - The WHERE clause filter text
   */
  async filterSpaces(filterText: string) {
    // Space placeholder from ENTITY_FILTER_EXAMPLES
    await this.applyAdvancedFilter(filterText, "Slug = 'production'");
  }

  async expectToNotBeVisibleByRole(role: Role, name: string) {
    await expect(this.page.getByRole(role, { name })).not.toBeVisible();
  }

  /**
   * Create a space via API (FAST) - Use this for most tests
   * @param params - Space slug (required), optional displayName and labels
   * @returns Promise resolving to the created SpaceRead object
   */
  async createSpaceViaAPI({
    slug,
    displayName,
    labels,
  }: {
    slug: string;
    displayName?: string;
    labels?: Record<string, string>;
  }): Promise<SpaceRead> {
    const apiHelper = new ApiHelper(this.page);

    const space: Space = {
      Slug: slug,
      ...(displayName && { DisplayName: displayName }),
      ...(labels && { Labels: labels }),
    };

    const createdSpace = await apiHelper.createSpace({ space });

    return createdSpace;
  }
}
