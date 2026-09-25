// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { test, expect } from './fixtures/test';

import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * Test to verify grid toolbar search bar stability
 * This tests the fix for the infinite render loop issue
 */
test.describe('Grid Toolbar Search Stability', () => {
  test.beforeEach(async ({ page }) => {
    const unitListPage = new UnitListPage(page);
    // Ensure at least one unit exists so the DataGrid renders
    await unitListPage.createUnitViaAPI({ unitType: 'todo-app-fe', slug: RandomSlugGenerator.randomSlugName() });
  });

  test('should maintain focus while typing in search box', async ({ page }) => {
    // Navigate directly to unit list
    await page.goto('/units');

    // Find the search box (auto-waiting assertion replaces waiting on the network)
    const searchBox = page.getByPlaceholder('Search…');
    await expect(searchBox).toBeVisible({ timeout: 10000 });

    // Click to focus
    await searchBox.click();
    await expect(searchBox).toBeFocused();

    // Type slowly, character by character with delays
    // This tests that focus is maintained throughout typing
    const searchText = 'test';
    for (let i = 0; i < searchText.length; i++) {
      await page.keyboard.type(searchText[i], { delay: 100 });

      // After each character, verify:
      // 1. Search box still has focus (would fail if toolbar remounts)
      await expect(searchBox).toBeFocused();

      // 2. All characters typed so far are present
      await expect(searchBox).toHaveValue(searchText.substring(0, i + 1));
    }

    // Final verification
    await expect(searchBox).toHaveValue(searchText);
    await expect(searchBox).toBeFocused();

    // Bounded wait (last resort): let the search debounce timer fire so an
    // infinite-render regression has a chance to manifest. There is no positive
    // UI signal to assert on here (results may legitimately be empty).
    await page.waitForTimeout(600);

    // The search should have filtered the results (or shown no results)
    // Just verify the page is still responsive and no infinite loop occurred
    await expect(searchBox).toBeVisible();
  });

  test('should not cause infinite loop when typing', async ({ page }) => {
    await page.goto('/units');

    // Auto-waiting assertion replaces waiting on the network
    const searchBox = page.getByPlaceholder('Search…');
    await expect(searchBox).toBeVisible({ timeout: 10000 });

    // Monitor console for errors (infinite loops often cause console warnings)
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Type rapidly
    await searchBox.click();
    await page.keyboard.type('unit', { delay: 50 });

    // Verify no focus loss
    await expect(searchBox).toBeFocused();
    await expect(searchBox).toHaveValue('unit');

    // Bounded wait (last resort): let the search debounce fire so any
    // infinite-loop error has time to surface in the console before we assert
    // zero errors. There is no positive UI signal that the debounce has run.
    await page.waitForTimeout(600);

    // Verify no infinite loop errors in console
    expect(consoleErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);

    // Verify toolbar buttons are still visible (wouldn't be if toolbar kept remounting)
    const columnsButton = page.getByRole('button', { name: 'Select columns' });
    await expect(columnsButton).toBeVisible();

    // Verify the search box is still visible and functional
    await expect(searchBox).toBeVisible();
  });
});
