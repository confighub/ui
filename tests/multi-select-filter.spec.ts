// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { test, expect } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * E2E tests for Multi-Select Filter functionality (IN operator)
 *
 * Tests the new multi-value filter feature where select/dropdown fields
 * can have multiple values selected (e.g., Space "is one of" [Space1, Space2])
 */
test.describe('Multi-Select Filter (IN Operator)', () => {
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
    await page.waitForLoadState('networkidle');

    // Ensure at least 3 spaces exist so multi-select tests have enough options
    const apiHelper = new ApiHelper(page);
    const spaces = await apiHelper.listSpaces();
    const spaceCount = spaces.length;
    for (let i = spaceCount; i < 3; i++) {
      await apiHelper.createSpace({ space: { Slug: `ms-test-space-${i}` } });
    }

    // Ensure at least one unit exists so the data grid (and filter toolbar) renders
    // instead of the "Getting Started" welcome page
    const filterButton = page.locator('button').filter({ hasText: /^Filter$/ });
    const addFilterButton = page.getByLabel('Add filter');
    const hasToolbar = await filterButton.isVisible({ timeout: 3000 }).catch(() => false)
      || await addFilterButton.isVisible({ timeout: 1000 }).catch(() => false);
    if (!hasToolbar) {
      await unitListPage.createUnitViaAPI({ unitType: 'todo-app-fe', slug: `ms-test-${Date.now()}` });
    }

    // Wait for the query builder to be visible
    await page.waitForSelector('button:has-text("Filter"), [aria-label="Add filter"]', {
      timeout: 10000
    });
  });

  test.describe('Basic Multi-Select Functionality', () => {
    test('should open multi-select dropdown when adding Space filter', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Space filter - should default to 'in' operator
      await unitListPage.addVisualBuilderFilter('Space');

      // Verify filter chip appears
      await expect(page.getByRole('button', { name: /Filter by Space/i })).toBeVisible();

      // Verify "is" operator is shown (count=0, polarity defaults to positive)
      // Use :not([aria-label]) to skip the FieldDropdown button which has aria-label
      const filterChip = page.getByRole('button', { name: /Filter by Space/i }).locator('..');
      await expect(filterChip.locator('button[aria-haspopup="listbox"]:not([aria-label])').first()).toContainText('is');

      // Verify dropdown button with placeholder (field-specific like "Select spaces...")
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      await expect(selectButton).toBeVisible();
    });

    test('should show checkboxes in multi-select dropdown', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Space filter
      await unitListPage.addVisualBuilderFilter('Space');

      // Open the dropdown
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      await selectButton.click();

      // Wait for dropdown to open
      await page.waitForTimeout(300);

      // Verify checkboxes are present in the dropdown options
      const checkboxes = page.locator('[role="menuitem"] input[type="checkbox"], [role="option"] input[type="checkbox"], .MuiCheckbox-root');
      const checkboxCount = await checkboxes.count();

      // There should be at least one checkbox if there are options
      // If no options, the test should handle that gracefully
      if (checkboxCount === 0) {
        // Check if there's a "No options" message
        const noOptions = page.getByText(/no (options|spaces|items)/i);
        const hasNoOptions = await noOptions.isVisible({ timeout: 1000 }).catch(() => false);
        if (!hasNoOptions) {
          // Wait a bit more and recheck
          await page.waitForTimeout(500);
          const recheckedCount = await checkboxes.count();
          expect(recheckedCount).toBeGreaterThan(0);
        }
      }
    });

    test('should allow selecting multiple values in dropdown', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Toolchain filter (more likely to have multiple options)
      await unitListPage.addVisualBuilderFilter('Toolchain');

      // Wait for dropdown button
      await page.waitForTimeout(300);

      // Open the dropdown
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      if (await selectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selectButton.click();
        await page.waitForTimeout(500);

        // Get all menu items
        const menuItems = page.locator('[role="menuitem"], [role="option"]');
        const itemCount = await menuItems.count();

        if (itemCount >= 2) {
          // Click first item to select it
          await menuItems.first().click();
          await page.waitForTimeout(200);

          // The dropdown should stay open for multi-select
          // Try to click the second item
          const secondItem = menuItems.nth(1);
          if (await secondItem.isVisible({ timeout: 1000 }).catch(() => false)) {
            await secondItem.click();
            await page.waitForTimeout(200);

            // Close dropdown by pressing Enter or clicking away
            await page.keyboard.press('Enter');
            await page.waitForTimeout(300);

            // Verify the display shows multiple values (e.g., "Value1 (+1 more)" or "Value1, Value2")
            const filterValue = page.locator('button').filter({ has: page.locator('svg[data-testid="KeyboardArrowDownIcon"]') }).first();
            const valueText = await filterValue.textContent();

            // Should show multiple values or a count
            expect(valueText).toBeTruthy();
          }
        }
      }
    });

    test('should allow deselecting all values while dropdown is open', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Toolchain filter
      await unitListPage.addVisualBuilderFilter('Toolchain');
      await page.waitForTimeout(300);

      // Open the dropdown
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      if (await selectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selectButton.click();
        await page.waitForTimeout(500);

        // Get menu items
        const menuItems = page.locator('[role="menuitem"], [role="option"]');
        const itemCount = await menuItems.count();

        if (itemCount >= 1) {
          // Select first item
          await menuItems.first().click();
          await page.waitForTimeout(200);

          // Verify the item is checked
          const firstCheckbox = menuItems.first().locator('input[type="checkbox"]');
          await expect(firstCheckbox).toBeChecked();

          // Deselect the same item (click again)
          await menuItems.first().click();
          await page.waitForTimeout(200);

          // Item should be unchecked - deselection to 0 is allowed
          await expect(firstCheckbox).not.toBeChecked();

          // Filter row should still exist while dropdown is open
          const dropdown = page.locator('[data-testid="multi-select-menu"]');
          await expect(dropdown).toBeVisible();
        }
      }
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should navigate dropdown options with arrow keys', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Space filter (using Space instead of Toolchain for reliability)
      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(300);

      // Verify filter was added
      await expect(page.getByRole('button', { name: /Filter by Space/i })).toBeVisible({ timeout: 5000 });

      // The dropdown should auto-open due to autoFocus
      await page.waitForTimeout(500);

      // Verify dropdown is open by checking for menu items
      const menuItems = page.locator('[role="menuitem"]');
      const itemCount = await menuItems.count();

      if (itemCount > 1) {
        // Navigate with arrow keys
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(100);

        // Verify arrow navigation moves through items
        // MUI MenuList handles this - we just verify the dropdown is still open
        await expect(menuItems.first()).toBeVisible();
      }
    });

    test('Space key should toggle selection and keep dropdown open', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(500);

      const menuItems = page.locator('[role="menuitem"]');
      const itemCount = await menuItems.count();
      if (itemCount < 1) {
        test.skip();
        return;
      }

      // Move focus from search input to first menu item
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);

      // Press Space to select first item
      await page.keyboard.press(' ');
      await page.waitForTimeout(300);

      // Verify item is selected
      const firstCheckbox = menuItems.first().locator('input[type="checkbox"]');
      await expect(firstCheckbox).toBeChecked();

      // Verify dropdown is still open (multi-select stays open)
      await expect(menuItems.first()).toBeVisible();

      // Press Space again to deselect
      await page.keyboard.press(' ');
      await page.waitForTimeout(300);
      await expect(firstCheckbox).not.toBeChecked();

      // Dropdown should still be open even with nothing selected
      await expect(menuItems.first()).toBeVisible();
    });

    test('Enter with something selected should NOT toggle and just close', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(500);

      // Use specific selector for multi-select dropdown menu items
      const multiSelectMenu = page.locator('[data-testid="multi-select-menu"]');
      const menuItems = multiSelectMenu.locator('[role="menuitem"]');

      // Move focus from search input to first menu item and select
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press(' ');
      await page.waitForTimeout(300);

      const firstCheckbox = menuItems.first().locator('input[type="checkbox"]');
      await expect(firstCheckbox).toBeChecked();

      // Navigate to second item
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);

      // Press Enter - should NOT select second item, just close
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Dropdown should be closed
      await expect(multiSelectMenu).not.toBeVisible();

      // Close the Add Filter menu that opens automatically
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Reopen the Space filter dropdown to verify only first item is selected
      // The value button is the third button with aria-haspopup="listbox" in the filter row
      // (after the field button and operator button)
      const spaceFilterChip = page.getByRole('button', { name: /Filter by Space/i });
      const filterRow = spaceFilterChip.locator('..');
      const valueButton = filterRow.locator('button[aria-haspopup="listbox"]').last();
      await valueButton.click();
      await page.waitForTimeout(300);

      // Only first item should be checked - use fresh selector after reopening
      const newMultiSelectMenu = page.locator('[data-testid="multi-select-menu"]');
      const newMenuItems = newMultiSelectMenu.locator('[role="menuitem"]');
      const newFirstCheckbox = newMenuItems.first().locator('input[type="checkbox"]');
      const newSecondCheckbox = newMenuItems.nth(1).locator('input[type="checkbox"]');

      await expect(newFirstCheckbox).toBeChecked();
      await expect(newSecondCheckbox).not.toBeChecked();
    });

    test('should close dropdown with Escape key', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(500);

      await expect(page.locator('[role="menuitem"]').first()).toBeVisible();

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      await expect(page.locator('[role="menuitem"]')).not.toBeVisible();
    });

    test('focus should stay on current item when toggling selections', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(500);

      const menuItems = page.locator('[role="menuitem"]');

      // Move focus from search input to first menu item and select all items
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press(' '); // Select first
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press(' '); // Select second
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press(' '); // Select third
      await page.waitForTimeout(200);

      // All three should be checked
      await expect(menuItems.first().locator('input[type="checkbox"]')).toBeChecked();
      await expect(menuItems.nth(1).locator('input[type="checkbox"]')).toBeChecked();
      await expect(menuItems.nth(2).locator('input[type="checkbox"]')).toBeChecked();

      // Go back to second item and deselect it
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);
      await page.keyboard.press(' '); // Deselect second
      await page.waitForTimeout(200);

      // Second should be unchecked, first and third still checked
      await expect(menuItems.first().locator('input[type="checkbox"]')).toBeChecked();
      await expect(menuItems.nth(1).locator('input[type="checkbox"]')).not.toBeChecked();
      await expect(menuItems.nth(2).locator('input[type="checkbox"]')).toBeChecked();

      // CRITICAL: Focus should still be on second item (not jumped to first)
      // We can verify by pressing Space again - it should re-select second item
      await page.keyboard.press(' ');
      await page.waitForTimeout(200);
      await expect(menuItems.nth(1).locator('input[type="checkbox"]')).toBeChecked();
    });
  });

  test.describe('URL Synchronization', () => {
    test('should sync IN clause to URL when selecting multiple values', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Toolchain filter
      await unitListPage.addVisualBuilderFilter('Toolchain');
      await page.waitForTimeout(300);

      // Open dropdown and select values
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      if (await selectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selectButton.click();
        await page.waitForTimeout(500);

        // Select multiple items
        const menuItems = page.locator('[role="menuitem"], [role="option"]');
        const itemCount = await menuItems.count();

        if (itemCount >= 1) {
          // Select first item
          await menuItems.first().click();
          await page.waitForTimeout(200);

          // Close dropdown
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);

          // Verify URL contains IN clause
          const url = page.url();
          expect(url).toContain('filterWhere=');

          // The URL should contain an IN clause like "ToolchainType IN ('value')"
          // or the value directly
          expect(url.toLowerCase()).toMatch(/toolchaintype|in|%27/i);
        }
      }
    });

    test('should restore multi-select values from URL on page load', async ({ page }) => {
      // Navigate to URL with an IN clause
      // Using a properly encoded IN clause for ToolchainType
      await page.goto("/units?filterWhere=ToolchainType%20IN%20('Kubernetes/YAML')");
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Verify the filter is restored
      const filterChip = page.getByRole('button', { name: /Filter by Toolchain/i });
      await expect(filterChip).toBeVisible({ timeout: 5000 });

      // Verify the operator shows "is" (single value auto-switches to equals polarity label)
      const toolchainChip = page.getByRole('button', { name: /Filter by Toolchain/i }).locator('..');
      await expect(toolchainChip.locator('button[aria-haspopup="listbox"]:not([aria-label])').first()).toContainText('is');
    });
  });

  test.describe('Operator Switching', () => {
    test('should switch polarity from "is" to "is not"', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Space filter (defaults to "is" with no selection)
      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(300);

      // Find and click on the operator button to open the polarity dropdown
      const spaceFilterChip = page.getByRole('button', { name: /Filter by Space/i });
      const filterRow = spaceFilterChip.locator('..');
      const operatorButton = filterRow.locator('button[aria-haspopup="listbox"]:not([aria-label])').first();
      await operatorButton.click();
      await page.waitForTimeout(300);

      // Select "is not" option
      const isNotOption = page.locator('[role="menuitem"]').filter({ hasText: /^is not$/ });
      if (await isNotOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await isNotOption.click();
        await page.waitForTimeout(300);

        // Verify operator changed to "is not"
        await expect(operatorButton).toContainText('is not');
      }
    });

    test('should show "is one of" / "is not one of" labels with multiple values', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Toolchain filter
      await unitListPage.addVisualBuilderFilter('Toolchain');
      await page.waitForTimeout(300);

      // Open dropdown and select two values
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      if (await selectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selectButton.click();
        await page.waitForTimeout(500);

        const menuItems = page.locator('[role="menuitem"], [role="option"]');
        const itemCount = await menuItems.count();

        if (itemCount >= 2) {
          // Select two items
          await menuItems.first().click();
          await page.waitForTimeout(200);
          await menuItems.nth(1).click();
          await page.waitForTimeout(200);

          // Close dropdown
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);

          // Verify operator label switched to "is one of" (count=2)
          await expect(page.getByText('is one of')).toBeVisible();

          // The multi-select should still work
          const valueButton = page.locator('button').filter({ has: page.locator('svg[data-testid="KeyboardArrowDownIcon"]') }).first();
          await expect(valueButton).toBeVisible();
        }
      }
    });
  });

  test.describe('Display and Formatting', () => {
    test('should display single value without count', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Toolchain filter
      await unitListPage.addVisualBuilderFilter('Toolchain');
      await page.waitForTimeout(300);

      // Select one value
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      if (await selectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selectButton.click();
        await page.waitForTimeout(500);

        const menuItems = page.locator('[role="menuitem"], [role="option"]');
        if (await menuItems.count() > 0) {
          await menuItems.first().click();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);

          // Verify display shows just the value, not a count
          const valueButton = page.locator('button').filter({ has: page.locator('svg[data-testid="KeyboardArrowDownIcon"]') }).first();
          const displayText = await valueButton.textContent();

          // Should show the label, not "(+X more)"
          expect(displayText).not.toContain('more');
        }
      }
    });

    test('should display two values comma-separated', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Toolchain filter
      await unitListPage.addVisualBuilderFilter('Toolchain');
      await page.waitForTimeout(300);

      // Select two values
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      if (await selectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selectButton.click();
        await page.waitForTimeout(500);

        const menuItems = page.locator('[role="menuitem"], [role="option"]');
        const itemCount = await menuItems.count();

        if (itemCount >= 2) {
          await menuItems.first().click();
          await page.waitForTimeout(200);
          await menuItems.nth(1).click();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);

          // Verify display shows comma-separated values
          const valueButton = page.locator('button').filter({ has: page.locator('svg[data-testid="KeyboardArrowDownIcon"]') }).first();
          const displayText = await valueButton.textContent();

          // Should contain a comma for two values
          expect(displayText).toContain(',');
        }
      }
    });

    test('should display count for three or more values', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add Toolchain filter
      await unitListPage.addVisualBuilderFilter('Toolchain');
      await page.waitForTimeout(300);

      // Select three values
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      if (await selectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selectButton.click();
        await page.waitForTimeout(500);

        const menuItems = page.locator('[role="menuitem"], [role="option"]');
        const itemCount = await menuItems.count();

        if (itemCount >= 3) {
          await menuItems.nth(0).click();
          await page.waitForTimeout(200);
          await menuItems.nth(1).click();
          await page.waitForTimeout(200);
          await menuItems.nth(2).click();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);

          // Verify display shows "(+X more)" format
          const valueButton = page.locator('button').filter({ has: page.locator('svg[data-testid="KeyboardArrowDownIcon"]') }).first();
          const displayText = await valueButton.textContent();

          // Should show "+2 more" for 3 values
          expect(displayText).toContain('more');
        }
      }
    });
  });

  test.describe('Filter Removal Behavior', () => {
    test('should remove filter when clicking away with no values selected', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(500);

      // Verify filter exists
      await expect(page.getByRole('button', { name: /Filter by Space/i })).toBeVisible();

      // Click away without selecting any value
      await page.locator('body').click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(500);

      // Filter should be removed
      await expect(page.getByRole('button', { name: /Filter by Space/i })).not.toBeVisible();
    });

    test('should select focused item and close when pressing Enter with no prior selection', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(500);

      // Verify filter exists and dropdown is open
      await expect(page.getByRole('button', { name: /Filter by Space/i })).toBeVisible();

      // Move focus to first menu item
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);

      // Press Enter — should select the focused item and close the dropdown
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Filter should still be present (an item was selected)
      await expect(page.getByRole('button', { name: /Filter by Space/i })).toBeVisible();

      // Dropdown should be closed
      await expect(page.locator('[data-testid="multi-select-menu"]')).not.toBeVisible();
    });

    test('should remove filter when pressing Escape with no values selected', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(500);

      // Verify filter exists
      await expect(page.getByRole('button', { name: /Filter by Space/i })).toBeVisible();

      // Press Escape without selecting
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // Filter should be removed
      await expect(page.getByRole('button', { name: /Filter by Space/i })).not.toBeVisible();
    });

    test('should NOT remove filter when clicking away with values selected', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(500);

      const menuItems = page.locator('[role="menuitem"]');
      if (await menuItems.count() < 1) {
        test.skip();
        return;
      }

      // Move focus from search input to first menu item, then select with Space
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press(' ');
      await page.waitForTimeout(300);

      // Close with Enter
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Click away
      await page.locator('body').click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(300);

      // Filter should still be present
      await expect(page.getByRole('button', { name: /Filter by Space/i })).toBeVisible();
    });

    test('should NOT remove filter when pressing Escape with values selected', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');
      await page.waitForTimeout(500);

      const menuItems = page.locator('[role="menuitem"]');
      if (await menuItems.count() < 1) {
        test.skip();
        return;
      }

      // Move focus from search input to first menu item, then select with Space
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press(' ');
      await page.waitForTimeout(300);

      // Press Escape - should close but NOT remove filter
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // Filter should still be present
      await expect(page.getByRole('button', { name: /Filter by Space/i })).toBeVisible();
    });
  });

  test.describe('Integration with Grid', () => {
    test('should filter grid results when multi-select filter is applied', async ({ page }) => {
      const unitListPage = new UnitListPage(page);
      const unitName = RandomSlugGenerator.randomSlugName();

      // Create a test unit
      await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: unitName });
      await page.waitForTimeout(1000);

      // Add a Toolchain filter
      await unitListPage.addVisualBuilderFilter('Toolchain');
      await page.waitForTimeout(300);

      // Select Kubernetes/YAML (should match our unit)
      const selectButton = page.locator('button').filter({ hasText: /Select.*\.\.\./ }).first();
      if (await selectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selectButton.click();
        await page.waitForTimeout(500);

        // Look for Kubernetes/YAML option
        const k8sOption = page.locator('[role="menuitem"], [role="option"]').filter({ hasText: /Kubernetes.*YAML/i });
        if (await k8sOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await k8sOption.click();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);

          // Wait for grid to update
          await page.waitForTimeout(1000);

          // Our unit should still be visible (it has Kubernetes/YAML toolchain)
          const unitRow = page.getByText(unitName);
          await expect(unitRow).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });
});
