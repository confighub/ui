// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { test, expect } from './fixtures/test';

import { UnitListPage } from './fixtures/unit-list-page';

/**
 * E2E tests for filter persistence when changing operators before setting a value.
 *
 * Reproduces the bug where a query block disappears when the user:
 * 1. Adds a new filter (e.g., Space)
 * 2. Clicks the operator dropdown to change the operator (e.g., "is" → "is not")
 * 3. Selects a new operator — the filter chip vanishes because the value
 *    input's ClickAwayListener fires onRemove() before the value is set.
 */
test.describe('Operator Change Filter Persistence', () => {
  test.use({ storageState: 'authentication.json' });

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        // Ignore errors if localStorage is unavailable
      }
    });

    const unitListPage = new UnitListPage(page);
    await unitListPage.goto();
    // Wait for the data grid to render instead of waiting on network idle
    await expect(page.locator('[role="grid"]')).toBeVisible({ timeout: 15000 });

    // Ensure at least one unit exists so the data grid toolbar renders
    const filterButton = page.locator('button').filter({ hasText: /^Filter$/ });
    const addFilterButton = page.getByLabel('Add filter');
    const hasToolbar = await filterButton.isVisible({ timeout: 3000 }).catch(() => false)
      || await addFilterButton.isVisible({ timeout: 1000 }).catch(() => false);
    if (!hasToolbar) {
      await unitListPage.createUnitViaAPI({ unitType: 'todo-app-fe', slug: `op-persist-${Date.now()}` });
    }

    await page.waitForSelector('button:has-text("Filter"), [aria-label="Add filter"]', {
      timeout: 10000,
    });
  });

  test('filter chip should persist after changing operator before setting a value', async ({ page }) => {
    const unitListPage = new UnitListPage(page);

    // Add a Space filter (multi-select field, defaults to "is" operator)
    await unitListPage.addVisualBuilderFilter('Space');

    // Verify filter chip appeared (auto-waiting assertion replaces the sleep)
    const filterChipButton = page.getByRole('button', { name: /Filter by Space/i });
    await expect(filterChipButton).toBeVisible({ timeout: 5000 });

    // Click the operator dropdown button directly (value dropdown may be open — that's fine)
    const filterRow = filterChipButton.locator('..');
    const operatorButton = filterRow.locator('button[aria-haspopup="listbox"]:not([aria-label])').first();
    await operatorButton.click();

    // Verify operator dropdown opened (auto-waiting assertion replaces the sleep)
    const operatorMenuItems = page.locator('.MuiPopper-root [role="menuitem"]');
    await expect(operatorMenuItems.first()).toBeVisible({ timeout: 3000 });

    // Select "is not" operator
    const isNotOption = operatorMenuItems.filter({ hasText: /^is not$/ });
    await expect(isNotOption).toBeVisible({ timeout: 2000 });
    await isNotOption.click();

    // Assert the filter chip is STILL visible (this is the bug — it used to vanish).
    // The auto-waiting assertion covers the 50ms blur timer + React re-render.
    await expect(filterChipButton).toBeVisible({ timeout: 3000 });

    // Verify operator actually changed to "is not"
    await expect(operatorButton).toContainText('is not');
  });

  test('filter chip should persist after changing operator on a Slug filter', async ({ page }) => {
    const unitListPage = new UnitListPage(page);

    // Add a Slug filter (text input field, has multiple operators)
    await unitListPage.addVisualBuilderFilter('Slug');

    // Verify filter chip appeared (auto-waiting assertion replaces the sleep)
    const filterChipButton = page.getByRole('button', { name: /Filter by Slug/i });
    await expect(filterChipButton).toBeVisible({ timeout: 5000 });

    // Click the operator dropdown directly
    const filterRow = filterChipButton.locator('..');
    const operatorButton = filterRow.locator('button[aria-haspopup="listbox"]:not([aria-label])').first();

    if (await operatorButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await operatorButton.click();

      // Wait for the operator dropdown to open before reading items
      const operatorMenuItems = page.locator('.MuiPopper-root [role="menuitem"]');
      await expect(operatorMenuItems.first()).toBeVisible({ timeout: 3000 });
      const itemCount = await operatorMenuItems.count();

      if (itemCount >= 2) {
        await operatorMenuItems.nth(1).click();

        // Filter chip should still be present (auto-waiting assertion replaces the sleep)
        await expect(filterChipButton).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('filter chip should persist after multiple rapid operator changes', async ({ page }) => {
    const unitListPage = new UnitListPage(page);

    // Add Space filter
    await unitListPage.addVisualBuilderFilter('Space');

    const filterChipButton = page.getByRole('button', { name: /Filter by Space/i });
    await expect(filterChipButton).toBeVisible({ timeout: 5000 });

    const filterRow = filterChipButton.locator('..');
    const operatorButton = filterRow.locator('button[aria-haspopup="listbox"]:not([aria-label])').first();

    // Change operator: "is" → "is not"
    await operatorButton.click();
    const isNotOption = page.locator('.MuiPopper-root [role="menuitem"]').filter({ hasText: /^is not$/ });
    await expect(isNotOption).toBeVisible({ timeout: 2000 });
    await isNotOption.click();
    // Confirm the operator switched before reopening the dropdown
    await expect(operatorButton).toContainText('is not');

    // Change operator back: "is not" → "is"
    await operatorButton.click();
    const isOption = page.locator('.MuiPopper-root [role="menuitem"]').filter({ hasText: /^is$/ });
    await expect(isOption).toBeVisible({ timeout: 2000 });
    await isOption.click();

    // Filter chip should still be present after rapid operator toggling
    await expect(filterChipButton).toBeVisible({ timeout: 3000 });
  });
});
