// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { SpaceListPage } from './fixtures/space-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('space list page', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
  test.use({ storageState: 'authentication.json' });

  test('should add a space', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();

    const spaceListPage = new SpaceListPage(page);

    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);

    await spaceListPage.getRowByName(spaceName);
  });

  test('should filter the space list', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();

    const spaceListPage = new SpaceListPage(page);

    // Create a space
    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);

    // Apply filter for the specific space
    await spaceListPage.filterSpaces(`Slug = '${spaceName}'`);

    // Verify the space is visible after filter
    await expect(page.getByRole('row', { name: spaceName })).toBeVisible();

    // Clear filters
    await spaceListPage.clearFilters();

    // The space should still be visible (no filter applied)
    await expect(page.getByRole('row', { name: spaceName })).toBeVisible();
  });

  test('should show empty state when filter matches nothing', async ({ page }) => {
    const spaceListPage = new SpaceListPage(page);

    await spaceListPage.goto();

    // Apply filter that matches nothing
    await spaceListPage.filterSpaces(`Slug = 'nonexistent-space-12345'`);

    // Verify the filtered empty state is shown
    await expect(page.getByText('No matching spaces')).toBeVisible();

    // Click clear filters button in the empty state
    await page.getByRole('button', { name: 'Clear all filters' }).click();

    // Wait for data to reload — empty state should disappear
    await expect(page.getByText('No matching spaces')).not.toBeVisible();
  });

  test('should clear filters and reset form', async ({ page }) => {
    const spaceListPage = new SpaceListPage(page);

    await spaceListPage.goto();

    // Add a filter using QueryBuilder
    await spaceListPage.filterSpaces(`Slug = 'test'`);

    // Verify filter is applied (Clear all button visible means filters exist)
    await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();

    // Clear filters
    await spaceListPage.clearFilters();

    // Verify filters are cleared — Filter button reappears when no filters exist
    await expect(page.locator('button').filter({ hasText: /^Filter$/ })).toBeVisible();
  });

  test('should navigate to space detail from space list', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();

    const spaceListPage = new SpaceListPage(page);

    // Create a space
    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);

    // Click on the space name to navigate to detail page
    await spaceListPage.goToSpaceDetailPageByName(spaceName);

    // Verify we're on the detail page
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(spaceName);
  });

  // URL Sync Tests
  test.describe('URL sync', () => {
    test('should update URL when filter is added', async ({ page }) => {
      const spaceListPage = new SpaceListPage(page);

      await spaceListPage.goto();

      // Apply a filter
      await spaceListPage.filterSpaces(`Slug = 'test-space'`);

      // Verify URL contains the filter param (filterWhere is the URL param name)
      await expect(page).toHaveURL(/filterWhere=/);
    });

    test('should restore filters from URL on page load', async ({ page }) => {
      // Navigate directly to URL with filter params (filterWhere is the URL param name)
      await page.goto('/spaces?filterWhere=Slug%20%3D%20%27test-filter-space%27');

      // Verify the filter is displayed in QueryBuilder (Clear all button should be visible)
      await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();
    });

    test('should clear URL params when filters cleared', async ({ page }) => {
      // Start with filters in URL (filterWhere is the URL param name)
      await page.goto('/spaces?filterWhere=Slug%20%3D%20%27test%27');

      // Wait for filter to be restored from URL
      await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();

      // Clear filters
      const spaceListPage = new SpaceListPage(page);
      await spaceListPage.clearFilters();

      // Verify URL no longer contains filter params
      await expect(page).not.toHaveURL(/filterWhere=/);
    });

    test('should preserve filter state on page refresh', async ({ page }) => {
      const spaceListPage = new SpaceListPage(page);

      await spaceListPage.goto();

      // Apply a filter
      await spaceListPage.filterSpaces(`Slug = 'refresh-test'`);

      // Wait for URL to update
      await expect(page).toHaveURL(/filterWhere=/);

      // Refresh the page
      await page.reload();

      // Verify the filter is still applied (Clear all button should be visible)
      await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();
    });
  });
});
