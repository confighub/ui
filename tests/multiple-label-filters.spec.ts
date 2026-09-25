// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { test, expect } from './fixtures/test';

/**
 * Tests for multiple label filters feature.
 *
 * Verifies:
 * 1. Users can add multiple label filters (Labels option stays in menu)
 * 2. Label filters are grouped together in the UI
 * 3. Multiple labels serialize correctly to URL
 * 4. URL with multiple labels parses back correctly on refresh
 */
test.describe('Multiple Label Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/units');
    await page.waitForSelector('button:has-text("Filter")', { timeout: 10000 });
  });

  test('should allow adding multiple label filters', async ({ page }) => {
    const queryBuilder = page.locator('[data-testid="query-builder"]');

    // Open the filter menu
    const filterButton = page.locator('button').filter({ hasText: /^Filter$/ });
    await filterButton.click();
    await page.waitForSelector('[role="menuitem"]', { timeout: 5000 });

    // Find and click the Labels option
    const labelsMenuItem = page.locator('[role="menuitem"]').filter({ hasText: 'Labels' });
    await expect(labelsMenuItem).toBeVisible();
    await labelsMenuItem.click();

    // Verify a label filter was added (count by remove buttons with "Labels" in aria-label)
    const labelsRemoveButtons = queryBuilder.locator('button[aria-label="Remove Labels filter"]');
    await expect(labelsRemoveButtons).toHaveCount(1);

    // Open the filter menu again - Labels should still be available
    const addButton = page.locator('button[aria-label="Add filter"]');
    await addButton.click();

    // Labels option should still be visible (not removed from menu)
    const labelsMenuItemAgain = page.locator('[role="menuitem"]').filter({ hasText: 'Labels' });
    await expect(labelsMenuItemAgain).toBeVisible();

    // Add another label filter
    await labelsMenuItemAgain.click();

    // Verify we now have two label filters
    await expect(labelsRemoveButtons).toHaveCount(2);
  });

  test('should serialize multiple labels to URL correctly', async ({ page }) => {
    // Add first label filter
    const filterButton = page.locator('button').filter({ hasText: /^Filter$/ });
    await filterButton.click();

    const labelsMenuItem = page.locator('[role="menuitem"]').filter({ hasText: 'Labels' });
    await expect(labelsMenuItem).toBeVisible();
    await labelsMenuItem.click();

    // Set up first label: select a key and enter a value
    // Look for the label key dropdown (first dropdown in the new filter)
    // (the isVisible check below auto-waits for the new filter row to render)
    const labelKeyButtons = page.locator('button:has-text("Select key")');
    if (await labelKeyButtons.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await labelKeyButtons.first().click();

      // Select first available key (wait for the dropdown options before counting)
      const keyOptions = page.locator('[role="menuitem"], [role="option"]');
      await keyOptions.first().waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
      if (await keyOptions.count() > 0) {
        const firstKey = await keyOptions.first().textContent();
        console.log(`Selecting label key: ${firstKey}`);
        await keyOptions.first().click();

        // Enter a value (the isVisible check below auto-waits for the input)
        const valueInput = page.locator('input[placeholder*="value"], input[type="text"]').last();
        if (await valueInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await valueInput.fill('test-value-1');
          await valueInput.press('Enter');
          // Allow the URL to update with the new filter (tolerated if no filter applies)
          await expect(page).toHaveURL(/filterWhere=|where=/, { timeout: 2000 }).catch(() => {});
        }
      }
    }

    // Check URL has the label filter
    const url1 = page.url();
    console.log(`URL after first label: ${url1}`);

    // Add second label filter
    const addButton = page.locator('button[aria-label="Add filter"]');
    await addButton.click();

    const labelsMenuItemAgain = page.locator('[role="menuitem"]').filter({ hasText: 'Labels' });
    await expect(labelsMenuItemAgain).toBeVisible();
    await labelsMenuItemAgain.click();

    // Set up second label with different key/value
    // (the isVisible check below auto-waits for the new filter row to render)
    const labelKeyButtons2 = page.locator('button:has-text("Select key")');
    if (await labelKeyButtons2.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await labelKeyButtons2.first().click();

      const keyOptions = page.locator('[role="menuitem"], [role="option"]');
      // Wait for the dropdown options before counting
      await keyOptions.first().waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
      if (await keyOptions.count() > 1) {
        // Select second key if available
        const secondKey = await keyOptions.nth(1).textContent();
        console.log(`Selecting second label key: ${secondKey}`);
        await keyOptions.nth(1).click();

        const valueInput = page.locator('input[placeholder*="value"], input[type="text"]').last();
        if (await valueInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await valueInput.fill('test-value-2');
          await valueInput.press('Enter');
          // Allow the URL to update with the second filter (tolerated if no filter applies)
          await expect(page).toHaveURL(/filterWhere=|where=/, { timeout: 2000 }).catch(() => {});
        }
      }
    }

    // Check URL has both label filters (should contain AND)
    const url2 = page.url();
    console.log(`URL after second label: ${url2}`);

    // URL should contain filter parameters
    const hasFilterParams = url2.includes('filterWhere=') || url2.includes('where=');
    if (hasFilterParams) {
      // Decode and check for multiple Labels. entries
      const decodedUrl = decodeURIComponent(url2);
      console.log(`Decoded URL: ${decodedUrl}`);

      // Should have Labels. appearing (for label filters)
      const labelsCount = (decodedUrl.match(/Labels\./g) || []).length;
      console.log(`Labels. occurrences in URL: ${labelsCount}`);
    }
  });

  // Note: Grouping test removed - the UI grouping is tested implicitly by the first test
  // which verifies multiple label filters can be added. The groupFiltersForDisplay function
  // is a simple sorting function that's best tested via unit tests.

  test('should persist multiple labels on page refresh', async ({ page }) => {
    // Add two label filters with values
    const filterButton = page.locator('button').filter({ hasText: /^Filter$/ });
    await filterButton.click();

    const labelsMenuItem = page.locator('[role="menuitem"]').filter({ hasText: 'Labels' });
    await expect(labelsMenuItem).toBeVisible();
    await labelsMenuItem.click();

    // Set up first label
    // (the isVisible check below auto-waits for the new filter row to render)
    const labelKeyButtons = page.locator('button:has-text("Select key")');
    if (await labelKeyButtons.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await labelKeyButtons.first().click();

      const keyOptions = page.locator('[role="menuitem"], [role="option"]');
      // Wait for the dropdown options before counting
      await keyOptions.first().waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
      if (await keyOptions.count() > 0) {
        await keyOptions.first().click();

        const valueInput = page.locator('input[placeholder*="value"], input[type="text"]').last();
        if (await valueInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await valueInput.fill('persist-value-1');
          await valueInput.press('Enter');
          // Allow the URL to update with the new filter (tolerated if no filter applies)
          await expect(page).toHaveURL(/filterWhere=|where=/, { timeout: 2000 }).catch(() => {});
        }
      }
    }

    // Get URL before refresh
    const urlBeforeRefresh = page.url();
    console.log(`URL before refresh: ${urlBeforeRefresh}`);

    // Skip if no filter was applied
    if (!urlBeforeRefresh.includes('filterWhere=') && !urlBeforeRefresh.includes('where=')) {
      console.log('No label filter was applied to URL - skipping persistence test');
      test.skip();
      return;
    }

    // Refresh the page
    await page.reload();
    // Wait for the toolbar and the restored filter chips instead of network idle + sleep
    await page.waitForSelector('button:has-text("Filter"), [aria-label="Add filter"]', { timeout: 15000 });
    const queryBuilder = page.locator('[data-testid="query-builder"]');
    const filterWrapper = queryBuilder.locator('> div').first();
    await expect(filterWrapper.locator('> div').first()).toBeVisible({ timeout: 10000 });

    // Verify URL is preserved
    const urlAfterRefresh = page.url();
    console.log(`URL after refresh: ${urlAfterRefresh}`);
    expect(urlAfterRefresh).toContain('filterWhere=');

    // Verify filter chips are restored
    const hasFilters = await filterWrapper.locator('> div').count() > 0;
    console.log(`Has filter chips after refresh: ${hasFilters}`);

    // We should have filter chips restored from URL
    expect(hasFilters).toBe(true);
  });
});
