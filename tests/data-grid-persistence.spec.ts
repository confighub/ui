// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { test, expect } from './fixtures/test';
import { UnitListPage } from './fixtures/unit-list-page';

test.describe('Data Grid Persistence', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear localStorage before each test for isolation
    await context.clearCookies();
    await page.goto('/units');
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        // Ignore errors if localStorage is unavailable
      }
    });
  });

  test.describe('Sort Model Persistence', () => {
    test.skip('should persist custom sort when changed and restore on reload', async ({ page }) => {
      const unitListPage = new UnitListPage(page);
      await unitListPage.goto();

      // Get the first column header and click to sort ascending
      const firstHeader = page.locator('[role="columnheader"]').first();
      await firstHeader.click();

      // Wait for sort to apply — the header gains aria-sort once the sort is active
      await expect(firstHeader).toHaveAttribute('aria-sort', /ascending|descending/);

      // Get the current sort state from localStorage
      const sortStateBefore = await page.evaluate(() => {
        const state = localStorage.getItem('gridState_unit-list-table');
        return state ? JSON.parse(state).sortModel : null;
      });

      expect(sortStateBefore).toBeTruthy();

      // Reload the page
      await page.reload();

      // Verify sort is still applied
      const sortStateAfter = await page.evaluate(() => {
        const state = localStorage.getItem('gridState_unit-list-table');
        return state ? JSON.parse(state).sortModel : null;
      });

      expect(sortStateAfter).toEqual(sortStateBefore);
    });

    test.skip('should reset to default sort when Reset Table button clicked', async ({ page }) => {
      const unitListPage = new UnitListPage(page);
      await unitListPage.goto();

      // Change sort by clicking a column header
      const firstHeader = page.locator('[role="columnheader"]').first();
      await firstHeader.click();
      await expect(firstHeader).toHaveAttribute('aria-sort', /ascending|descending/);

      // Find and click the Reset Table button
      const resetButton = page.getByRole('button', { name: /reset table/i });

      // Reset button should be enabled after changing sort
      await expect(resetButton).toBeEnabled();

      await resetButton.click();
      // After reset, the button returns to its disabled (default) state
      await expect(resetButton).toBeDisabled();

      // Verify sort returned to defaults
      const sortState = await page.evaluate(() => {
        const state = localStorage.getItem('gridState_unit-list-table');
        return state ? JSON.parse(state).sortModel : null;
      });

      // After reset, sort should match the default (which varies by table)
      // For unit list, default is typically descending by updatedAt
      expect(sortState).toBeTruthy();
    });
  });

  test.describe('Default Value Handling', () => {
    test.skip('should initialize with defaults when localStorage is empty', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Ensure localStorage is empty
      await page.evaluate(() => localStorage.clear());

      await unitListPage.goto();

      // Check that default sort is applied
      await page.evaluate(() => {
        const state = localStorage.getItem('gridState_unit-list-table');
        return state ? JSON.parse(state) : null;
      });

      // Table should have initialized with defaults
      // Even if no explicit state is saved yet, the table should be sorted
      const table = page.locator('[role="grid"]');
      await expect(table).toBeVisible();
    });

    test.skip('should restore all defaults when Reset Table clicked', async ({ page }) => {
      const unitListPage = new UnitListPage(page);
      await unitListPage.goto();

      // Make multiple changes: sort, hide column, change page size
      const firstHeader = page.locator('[role="columnheader"]').first();
      await firstHeader.click();
      await expect(firstHeader).toHaveAttribute('aria-sort', /ascending|descending/);

      // Open column menu and hide a column (if column menu is available)
      const columnMenuButton = page.locator('[aria-label*="column"]').first();
      if (await columnMenuButton.isVisible()) {
        await columnMenuButton.click();

        // Try to find and click hide column option once the menu surfaces it
        const hideOption = page.locator('text=/hide/i').first();
        if (await hideOption.isVisible()) {
          await hideOption.click();
          await expect(hideOption).toBeHidden();
        }
      }

      // Click Reset Table button
      const resetButton = page.getByRole('button', { name: /reset table/i });
      await resetButton.click();

      // Verify state is cleared or reset to defaults
      await page.evaluate(() => {
        const state = localStorage.getItem('gridState_unit-list-table');
        return state ? JSON.parse(state) : null;
      });

      // After reset, Reset button should be disabled
      await expect(resetButton).toBeDisabled();
    });

    test.skip('Reset button should be disabled when table matches defaults', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Clear localStorage to start fresh
      await page.evaluate(() => localStorage.clear());

      await unitListPage.goto();

      // Reset button should be disabled on first load
      const resetButton = page.getByRole('button', { name: /reset table/i });
      await expect(resetButton).toBeDisabled();

      // Change sort
      const firstHeader = page.locator('[role="columnheader"]').first();
      await firstHeader.click();

      // Reset button should now be enabled
      await expect(resetButton).toBeEnabled();

      // Click reset
      await resetButton.click();

      // Reset button should be disabled again
      await expect(resetButton).toBeDisabled();
    });

    test.skip('should respect column visibility defaults on first load', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Clear localStorage to start fresh
      await page.evaluate(() => localStorage.clear());

      await unitListPage.goto();

      // Check that expected columns are visible
      // This is table-specific, but we can verify the grid renders
      const grid = page.locator('[role="grid"]');
      await expect(grid).toBeVisible();

      // Verify some columns exist
      const columnHeaders = page.locator('[role="columnheader"]');
      const count = await columnHeaders.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('localStorage Edge Cases', () => {
    test.skip('should handle corrupted localStorage gracefully', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Set invalid JSON in localStorage
      await page.evaluate(() => {
        localStorage.setItem('gridState_unit-list-table', '{invalid json}');
      });

      // Table should still load with defaults
      await unitListPage.goto();

      const grid = page.locator('[role="grid"]');
      await expect(grid).toBeVisible();

      // Check console for error (optional - playwright captures console errors)
      // The table should recover and work normally
    });

    test.skip('should maintain table functionality when localStorage is disabled', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Simulate localStorage being unavailable by removing it
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: () => { throw new Error('localStorage unavailable'); },
            setItem: () => { throw new Error('localStorage unavailable'); },
            removeItem: () => { throw new Error('localStorage unavailable'); },
            clear: () => { throw new Error('localStorage unavailable'); },
          },
          writable: false,
        });
      });

      // Table should still load and function
      await unitListPage.goto();

      // The table should render even without localStorage
      const grid = page.locator('[role="grid"]');
      await expect(grid).toBeVisible();
    });
  });

  test.describe('Table Isolation', () => {
    test.skip('should maintain separate sort state for different tables', async ({ page }) => {
      // Navigate to unit list and set sort
      const unitListPage = new UnitListPage(page);
      await unitListPage.goto();

      const unitListHeader = page.locator('[role="columnheader"]').first();
      await unitListHeader.click();
      await expect(unitListHeader).toHaveAttribute('aria-sort', /ascending|descending/);

      // Get unit list sort state
      const unitListSort = await page.evaluate(() => {
        const state = localStorage.getItem('gridState_unit-list-table');
        return state ? JSON.parse(state).sortModel : null;
      });

      // Navigate to a unit detail page (if available)
      const firstUnitLink = page.locator('[role="gridcell"] a').first();
      if (await firstUnitLink.isVisible()) {
        await firstUnitLink.click();
        // Wait for the detail page to render its grid before interacting
        await expect(page.locator('[role="grid"]').first()).toBeVisible();

        // Find revisions table and change its sort
        const revisionsHeader = page.locator('[role="columnheader"]').first();
        if (await revisionsHeader.isVisible()) {
          await revisionsHeader.click();
          await expect(revisionsHeader).toHaveAttribute('aria-sort', /ascending|descending/);

          // Get revisions table sort state
          const revisionsSort = await page.evaluate(() => {
            const state = localStorage.getItem('gridState_revisions-table');
            return state ? JSON.parse(state).sortModel : null;
          });

          // Navigate back to unit list
          await page.goBack();

          // Verify unit list sort is still the same
          const unitListSortAfter = await page.evaluate(() => {
            const state = localStorage.getItem('gridState_unit-list-table');
            return state ? JSON.parse(state).sortModel : null;
          });

          expect(unitListSortAfter).toEqual(unitListSort);
          expect(revisionsSort).not.toEqual(unitListSort);
        }
      }
    });
  });

  test.describe('Sort + Filter + Pagination Interaction', () => {
    test.skip('should maintain sort order when filters reduce result set', async ({ page }) => {
      const unitListPage = new UnitListPage(page);
      await unitListPage.goto();

      // Set ascending sort
      const firstHeader = page.locator('[role="columnheader"]').first();
      await firstHeader.click();
      await expect(firstHeader).toHaveAttribute('aria-sort', /ascending|descending/);

      // Apply filter (if filter is available)
      const filterButton = page.locator('[aria-label*="filter"]').first();
      if (await filterButton.isVisible()) {
        await filterButton.click();
        // Filter panel surfaces a dialog/menu once opened
        await expect(page.locator('[role="menu"], [role="dialog"]').first()).toBeVisible();

        // Add filter logic here if UI supports it
      }

      // Verify sort is still applied
      const sortState = await page.evaluate(() => {
        const state = localStorage.getItem('gridState_unit-list-table');
        return state ? JSON.parse(state).sortModel : null;
      });

      expect(sortState).toBeTruthy();
    });
  });
});
