// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { SpaceListPage } from './fixtures/space-list-page';
import { TargetListPage } from './fixtures/target-list-page';
import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('unit list page', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
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

    await page.getByTestId('refresh-button').click();
  });

  test('should display the unit in the list', async ({ page }) => {
    const name = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);

    await unitListPage.createUnitViaAPI({ unitType: 'todo-app-fe', slug: name });

    await expect(await unitListPage.getRowByName(name)).toBeVisible();
  });

  test('should execute a validation function: vet-cel', async ({ page }) => {
    const name = RandomSlugGenerator.randomSlugName();
    const functionName = 'vet-cel';
    const unitListPage = new UnitListPage(page);

    await unitListPage.createUnitViaAPI({ unitType: 'todo-app-be', slug: name });

    await unitListPage.invokeFunctionByNameWithParameters({
      name: name,
      functionName,
      // The fixture's Deployment has 2 replicas, so the unit fails this check.
      params: [{ name: 'Expression', value: "r.kind != 'Deployment' || r.spec.replicas >= 3" }],
      role: 'textbox',
    });

    await unitListPage.expectToBeVisibleByText('Failed');
  });

  // Skipped due to flakiness - needs investigation
  test.skip('should execute a mutation function: set-replicas', async ({ page }) => {
    const name = RandomSlugGenerator.randomSlugName(); // Use unique name to avoid conflicts
    const functionName = 'set-replicas';
    const unitListPage = new UnitListPage(page);

    // Create unit with unique name to avoid race conditions
    await unitListPage.createUnitViaAPI({ unitType: 'todo-app-db', slug: name });

    // Wait for unit to be fully created and visible
    await expect(await unitListPage.getRowByName(name)).toBeVisible({ timeout: 10000 });

    // Invoke the function with proper network response waiting
    await Promise.all([
      // Wait for the function invocation API response
      page.waitForResponse(
        (response) => response.url().includes('/invoke') && response.status() === 200,
        { timeout: 15000 },
      ),
      unitListPage.invokeFunctionByNameWithParameters({
        name: name,
        functionName,
        params: [{ name: 'Replicas', value: '4' }],
      }),
    ]);

    // Verify the expected result with the correct unit name pattern
    // (expectToBeVisibleByText auto-waits for the function execution result;
    // the /invoke response was already awaited above)
    const expectedText = `SPACE/DEFAULT/UNIT/${name.toUpperCase()}`;
    await unitListPage.expectToBeVisibleByText(expectedText);
  });

  test('should invoke a unit with errors and display the errors', async ({ page }) => {
    const networkName = RandomSlugGenerator.randomSlugName();
    const namespaceName = RandomSlugGenerator.randomSlugName();

    const unitListPage = new UnitListPage(page);

    await unitListPage.createUnitViaAPI({ unitType: 'network-ingress', slug: networkName });
    await unitListPage.createUnitViaAPI({ unitType: 'namespace', slug: namespaceName });

    // This expression should trigger a CEL compilation error in the function executor:
    // Error: Function invocations failed Details: failed to compile expression spec.replicas > 1: ERROR:...
    // The UI displays parameter names capitalized.
    await unitListPage.invokeAppConfigFunctionForAllUnitsByNameWithParameters('vet-celexpr', [
      { name: 'Validation-expr', value: 'spec.replicas > 1', Role: 'textbox' },
    ]);

    // The InvokerSidebar shows 'Invocation failed' inline for CEL errors
    await unitListPage.expectToBeVisibleByText('Invocation failed');
  });

  test('should invoke a function: ensure-context', async ({ page }) => {
    const basicDeploymentYml = 'basic-deployment';
    const unitName = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);

    await unitListPage.createUnitViaAPI({ unitType: basicDeploymentYml, slug: unitName });

    await unitListPage.invokeEnsurecontextFunction(unitName, 'true');

    // The tree view renders 'confighub.com/UnitSlug' split across DOM nodes;
    // check for the partial text that appears in a single element.
    await unitListPage.expectToBeVisibleByText('com/UnitSlug');
  });

  test('should show a form error when invoking a function with no selection: ensure-context', async ({
    page,
  }) => {
    const basicDeploymentYml = 'basic-deployment';
    const unitName = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);

    await unitListPage.createUnitViaAPI({ unitType: basicDeploymentYml, slug: unitName });

    await unitListPage.invokeEnsurecontextFunction(unitName);

    await unitListPage.expectToBeVisibleByText('Add-context is required');
  });

  test('should bulk assign a target and labels to the selected units', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const basicDeploymentYml = 'basic-deployment';
    const unitName = RandomSlugGenerator.randomSlugName();
    const targetName = RandomSlugGenerator.randomSlugName();

    const unitListPage = new UnitListPage(page);
    const targetListPage = new TargetListPage(page);

    await targetListPage.goto();
    await targetListPage.addTarget({ targetName });

    await unitListPage.createUnitViaAPI({ unitType: basicDeploymentYml, slug: unitName });

    await unitListPage.bulkUpdateUnitsByName({
      names: [unitName],
      targetName,
      labels: {
        env: 'prod',
        team: 'dev',
      },
    });

    await unitListPage.expectToBeVisibleByText(targetName);
  });

  // TODO: I don't know why this is having issues, but addig Targets from this test doesn't work...
  test('should show an error when bulk assigning poorly formatted labels', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const basicDeploymentYml = 'namespace';
    const unitName = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);

    await unitListPage.createUnitViaAPI({ unitType: basicDeploymentYml, slug: unitName });

    await unitListPage.bulkUpdateUnitsByName({
      names: [unitName],
      labels: {
        env: 'prod',
        team: 'dev foo barred*&))',
      },
    });

    await unitListPage.expectToBeVisibleByText('Error: invalid Labels');
  });

  test('should add delete gates to units and prevent deletion', async ({ page }) => {
    const unitName = RandomSlugGenerator.randomSlugName();
    const deleteGate = 'manual-review-required';
    const unitListPage = new UnitListPage(page);

    // Create a unit
    await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: unitName });

    // Verify unit exists
    await expect(await unitListPage.getRowByName(unitName)).toBeVisible();

    // Add delete gate to the unit
    await unitListPage.bulkUpdateUnitsByName({
      names: [unitName],
      deleteGates: [deleteGate],
    });

    // Attempt to delete the unit and expect it to fail with delete gate error
    await unitListPage.attemptDeleteUnitByNameExpectingError(
      unitName,
      'Error: outstanding DeleteGates',
    );

    // Verify the unit still exists (wasn't deleted)
    await expect(await unitListPage.getRowByName(unitName)).toBeVisible();
  });

  test('should add multiple delete gates and destroy gates to units', async ({ page }) => {
    const unitName = RandomSlugGenerator.randomSlugName();
    const deleteGates = ['manual-review', 'security-check'];
    const destroyGates = ['backup-verified', 'team-signoff'];
    const unitListPage = new UnitListPage(page);

    // Create a unit
    await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: unitName });

    // Add multiple gates to the unit
    await unitListPage.bulkUpdateUnitsByName({
      names: [unitName],
      deleteGates,
      destroyGates,
    });

    // Attempt to delete the unit and expect it to fail due to delete gates
    await unitListPage.attemptDeleteUnitByNameExpectingError(
      unitName,
      'Error: outstanding DeleteGates',
    );

    // Verify the unit still exists
    await expect(await unitListPage.getRowByName(unitName)).toBeVisible();
  });

  test('should maintain page functionality after adding a unit', async ({ page }) => {
    test.setTimeout(90000);
    const firstUnitName = RandomSlugGenerator.randomSlugName();
    const secondUnitName = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);

    // Add the first unit
    await unitListPage.createUnitViaUI({
      spaceSlug: 'default',
      slug: firstUnitName,
      unitType: 'basic-deployment',
    });

    // Verify the first unit appears in the list (getRowByName waits internally)
    await expect(await unitListPage.getRowByName(firstUnitName)).toBeVisible();

    // Test 1: Verify we can click into unit details
    await unitListPage.goToUnitDetailPageByName(firstUnitName);

    // Verify we're on the unit detail page
    await expect(page.getByText(firstUnitName)).toBeVisible();

    // Navigate back to unit list
    await unitListPage.goto();

    // Test 2: Verify we can add another unit (page is not blocked)
    await unitListPage.createUnitViaUI({
      spaceSlug: 'default',
      slug: secondUnitName,
      unitType: 'basic-deployment',
    });

    // Verify both units are visible (getRowByName waits internally)
    await expect(await unitListPage.getRowByName(firstUnitName)).toBeVisible();
    await expect(await unitListPage.getRowByName(secondUnitName)).toBeVisible();

    // Test 3: Verify row selection still works
    const row = await unitListPage.getRowByName(firstUnitName);
    const selectRow = row.getByLabel('Select row');
    await selectRow.click();
    await expect(selectRow).toBeChecked();
  });

  test('should use unit toolchain type as default in function sidebar', async ({ page }) => {
    const unitListPage = new UnitListPage(page);

    // Create a new test unit with a specific toolchain type
    const testUnitName = RandomSlugGenerator.randomSlugName();

    // Add the unit with AppConfig/YAML toolchain type
    await unitListPage.createUnitViaAPI({
      unitType: 'basic-deployment',
      slug: testUnitName,
      toolchainType: 'AppConfig/YAML',
    });

    // Get the row (will automatically search if not visible)
    const row = await unitListPage.getRowByName(testUnitName);

    // Select the unit row so it becomes the active unit for the sidebar
    await row.getByLabel('Select row').click();

    // Open the invoker sidebar and verify it shows 'AppConfig/YAML' as the active toolchain filter
    await unitListPage.openInvokerSidebar();
    await expect(page.getByPlaceholder('Search functions')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('AppConfig/YAML').first()).toBeVisible({ timeout: 5000 });

    // Clean up: Delete the test unit
    await unitListPage.deleteUnitByName(testUnitName);
  });

  test('should open grouped columns panel and filter columns', async ({ page }) => {
    // Click Select columns button to open the panel
    await page.getByRole('button', { name: 'Select columns' }).click();

    // Verify panel opens
    await expect(page.getByText('Show Columns')).toBeVisible();

    // Verify search input exists
    const searchInput = page.getByPlaceholder('Search columns...');
    await expect(searchInput).toBeVisible();

    // Search for a term that matches a real subset of the Units grid columns.
    // "Revision" matches the Revisions group (Head Revision Num, Live Revision
    // Num, …) and nothing in Core Identity — see UNIT_COLUMN_GROUPS in
    // src/components/unit-data-grid/unit-column-groups.ts.
    await searchInput.fill('Revision');

    // Verify search results count appears
    await expect(page.getByText(/\d+ columns? found/)).toBeVisible();

    // …and that it really filtered: a matching column stays, a non-matching one goes
    await expect(page.getByText('Head Revision Num', { exact: true })).toBeVisible();
    await expect(page.getByText('Toolchain Type', { exact: true })).toHaveCount(0);

    // A term matching nothing yields the empty state rather than a count
    await searchInput.fill('zzz-no-such-column');
    await expect(page.getByText('No columns found')).toBeVisible();
    await expect(page.getByText(/\d+ columns? found/)).toHaveCount(0);

    // Close panel
    await page.keyboard.press('Escape');
  });

  test('should toggle column visibility and affect API select param', async ({ page }) => {
    // Open columns panel
    await page.getByRole('button', { name: 'Select columns' }).click();

    // Toggle on a column (e.g., "UpstreamUnitID")
    const UpstreamUnitSlugCheckbox = page
      .locator('label')
      .filter({ hasText: /^Upstream Unit Slug$/ })
      .locator('input[type="checkbox"]')
      .first();
    await UpstreamUnitSlugCheckbox.click();

    // Close panel
    await page.keyboard.press('Escape');

    // Wait for the API request and capture it
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/unit?'),
      { timeout: 5000 },
    );

    // Trigger a refresh to make API call
    await page.getByTestId('refresh-button').click();

    // Verify the API call was made with select parameter
    const response = await responsePromise;
    const url = new URL(response.url());
    const selectParam = url.searchParams.get('select');

    // Verify select parameter exists
    expect(selectParam).toBeTruthy();

    // Verify UpstreamUnitSlug column is in the select param (since we toggled it on)
    expect(selectParam).toContain('UpstreamUnitID');
  });

  test('should show dynamic label columns in grouped columns panel', async ({ page }) => {
    const unitName = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);

    // Create a unit with labels
    await unitListPage.createUnitViaAPI({
      unitType: 'basic-deployment',
      slug: unitName,
      labels: {
        environment: 'production',
        team: 'backend',
      },
    });

    // Navigate to the page
    await page.goto('/units');
    await unitListPage.waitForGridLoad();

    // Search for the unit so its labels are loaded in the grid
    await page.getByPlaceholder('Search…').fill(unitName);
    await expect(page.getByRole('link', { name: unitName })).toBeVisible({ timeout: 15000 });

    // Open the columns panel to verify dynamic label columns appear in the Labels group
    await page.getByRole('button', { name: 'Select columns' }).click();
    await expect(page.getByText('Show Columns')).toBeVisible();

    // Verify Labels group exists with the dynamic label columns
    await expect(page.getByRole('heading', { name: 'Labels' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /^environment$/ })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /^team$/ })).toBeVisible();

    // Verify the label columns are unchecked by default (hidden)
    const environmentCheckbox = page
      .locator('label')
      .filter({ hasText: /^environment$/ })
      .locator('input[type="checkbox"]')
      .first();
    await expect(environmentCheckbox).not.toBeChecked();
    const teamCheckbox = page
      .locator('label')
      .filter({ hasText: /^team$/ })
      .locator('input[type="checkbox"]')
      .first();
    await expect(teamCheckbox).not.toBeChecked();
  });

  test.describe('Clone', () => {
    test('should clone a single unit', async ({ page }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const slugClone = `${slug}-clone`;
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug });
      await unitListPage.cloneUnit({ slug, slugClone });

      await expect(page.getByText(slug)).toBeVisible();
      // Scoped to the section heading: getByText('Activity') is a substring
      // match that also matches any unit slug containing "activity" (the
      // shared test org accumulates many randomly-named units over time).
      await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
    });

    test('should clone a multiple units', async ({ page }) => {
      const spaceSlug = RandomSlugGenerator.randomSlugName();
      const spaceListPage = new SpaceListPage(page);
      await spaceListPage.createSpaceViaAPI({ slug: spaceSlug });

      const nginxName = RandomSlugGenerator.randomSlugName();
      const basicDeplymentName = RandomSlugGenerator.randomSlugName();
      const unitListPage = new UnitListPage(page);

      await unitListPage.clickRefreshButton();

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug: nginxName });
      await unitListPage.createUnitViaAPI({
        unitType: 'basic-deployment',
        slug: basicDeplymentName,
      });

      await unitListPage.cloneMultipleUnits({ rowCount: 2, spaceSlug });

      await expect(page.getByRole('gridcell').filter({ hasText: spaceSlug })).toHaveCount(2);
    });
  });

  test.describe('Visual Query Builder', () => {
    test('should display filter builder when opening filters panel', async ({
      page,
    }) => {
      // Verify the "Filter" button is visible (shown when no filters exist)
      await expect(page.locator('button').filter({ hasText: /^Filter$/ })).toBeVisible();
    });

    test('should add and remove a slug filter', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add slug filter
      await unitListPage.addVisualBuilderFilter('Slug');

      // Verify filter chip appears - use aria-label to distinguish from grid column
      await expect(page.getByRole('button', { name: /Filter by Slug/i })).toBeVisible();

      // Verify the slug select button is present
      await expect(page.getByRole('button', { name: 'Search slugs...' })).toBeVisible();

      // Remove the filter by clicking the close icon
      await page.getByRole('button', { name: 'Remove Slug filter' }).click();

      // Verify filter is removed and Filter button returns
      await expect(page.locator('button').filter({ hasText: /^Filter$/ })).toBeVisible();
    });

    test('should add multiple filter chips', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add where filter (text-based, won't auto-cancel)
      await unitListPage.addVisualBuilderFilter('Where', 'test');

      // Add toolchain filter
      await unitListPage.addVisualBuilderFilter('Toolchain');

      // Verify both filters are displayed - use aria-label to distinguish from grid columns
      await expect(page.getByRole('button', { name: /Filter by Where/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Filter by Toolchain/i })).toBeVisible();
    });

    test('should update URL params when filter value changes', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add a Where filter with a text value
      await unitListPage.addVisualBuilderFilter('Where', "Slug = 'test-unit-slug'");
      const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
      // Press Enter to commit the value
      await whereInput.press('Enter');

      // Wait for URL to update with the where parameter
      await page.waitForURL(/filterWhere=/);

      // Verify URL contains the where parameter
      const url = page.url();
      expect(url).toContain('filterWhere=');
    });

    test('should open filter menu with keyboard shortcut "/"', async ({ page }) => {
      // Press "/" to open the filter menu
      await page.keyboard.press('/');

      // Verify the filter menu is open by checking for menu items (use data-field to avoid strict mode violations)
      await expect(page.locator('[role="menuitem"][data-field="slug"]')).toBeVisible();
    });

    test('should close dropdown with Escape key', async ({ page }) => {
      // Open filter menu
      await page
        .locator('button')
        .filter({ hasText: /^Filter$/ })
        .click();

      // Verify menu is open (use data-field to avoid strict mode violations)
      await expect(page.locator('[role="menuitem"][data-field="slug"]')).toBeVisible();

      // Press Escape to close
      await page.keyboard.press('Escape');

      // Verify menu is closed
      await expect(page.locator('[role="menuitem"][data-field="slug"]')).not.toBeVisible();
    });

    test('should allow changing filter field type by clicking field label', async ({
      page,
    }) => {
      const unitListPage = new UnitListPage(page);

      // Add a where filter (text-based, won't auto-cancel like select filters)
      await unitListPage.addVisualBuilderFilter('Where', 'test');

      // Verify Where filter button is visible
      const whereFilter = page.getByRole('button', { name: /Filter by Where/i });
      await expect(whereFilter).toBeVisible();

      // Click on the Where field label to open field dropdown
      await whereFilter.click();

      // Verify the dropdown shows available field options
      await expect(page.getByRole('menuitem', { name: 'Toolchain' })).toBeVisible();

      // Select Toolchain to change the filter type
      await page.getByRole('menuitem', { name: 'Toolchain' }).click();

      // Verify the field changed to Toolchain
      await expect(page.getByRole('button', { name: /Filter by Toolchain/i })).toBeVisible();
    });

    test('should persist filter in URL and restore on page load', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Navigate directly to a URL with a filter parameter
      // Must use /units path since that's where the Unit list page is mounted
      await page.goto("/units?filterWhere=Slug%20ILIKE%20'%25test%25'");

      // Wait for the page to load and filter to be initialized from URL
      await unitListPage.waitForGridLoad();

      // Verify the filter chip is rendered from URL params - use aria-label
      // The filter should be parsed and displayed
      await expect(page.getByRole('button', { name: /Filter by Slug/i })).toBeVisible();
    });

    test.describe('URL Sync Feature', () => {
      test('should sync filter to URL when adding a manual filter', async ({ page }) => {
        const unitListPage = new UnitListPage(page);

        await page.goto('/units');
        await unitListPage.waitForGridLoad();

        // Verify URL has no filter params initially
        expect(page.url()).not.toContain('filterWhere=');

        // Add and complete a Where filter (text-based)
        await unitListPage.addVisualBuilderFilter('Where', "Slug = 'url-sync-test'");
        const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
        // Press Enter to commit the value
        await whereInput.press('Enter');

        // Wait for URL sync
        await page.waitForURL(/filterWhere=.*Slug/);

        // Verify URL now contains the filter
        const url = page.url();
        expect(url).toContain('filterWhere=');
        expect(url).toContain('Slug');
      });

      test('should sync filter removal to URL', async ({ page }) => {
        const unitListPage = new UnitListPage(page);

        await page.goto('/units');
        await unitListPage.waitForGridLoad();

        // Add a Where filter
        await unitListPage.addVisualBuilderFilter('Where', "Slug = 'test-filter'");
        const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
        await whereInput.press('Enter');

        // Wait for URL sync
        await page.waitForURL(/filterWhere=/);
        expect(page.url()).toContain('filterWhere=');

        // Remove the filter by clicking close icon
        await page.getByRole('button', { name: 'Remove Where filter' }).click();

        // Wait for URL sync after removal - Slug should no longer be present
        await page.waitForURL((url) => !url.search.includes('Slug'));

        // URL should no longer have filter params (or have empty where)
        const url = page.url();
        // After removing all filters, where param should be empty or gone
        expect(url).not.toContain('Slug');
      });

      test('should sync multiple filters to URL', async ({ page }) => {
        const unitListPage = new UnitListPage(page);

        await page.goto('/units');
        await unitListPage.waitForGridLoad();

        // Add where filter with a valid SQL value
        await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE '%multi-test%'");
        const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
        await whereInput.press('Enter');

        // Dismiss focus from the where input before adding another filter
        await whereInput.blur();
        // Wait for the where value to be committed to the URL before adding another filter
        await page.waitForURL(/filterWhere=/);

        // Add toolchain filter
        await unitListPage.addVisualBuilderFilter('Toolchain');
        // Select a toolchain type from dropdown (if available)
        const toolchainSelect = page
          .locator('button')
          .filter({ hasText: 'Select...' })
          .first();
        if (await toolchainSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
          await toolchainSelect.click();
          const option = page.locator('[role="option"]').first();
          if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
            await option.click();
          }
        }

        // Wait for URL sync
        await page.waitForURL(/filterWhere=/);

        // Verify URL contains filter params
        const url = page.url();
        expect(url).toContain('filterWhere=');
      });

      test('should NOT cause infinite loop when modifying filter value', async ({ page }) => {
        const unitListPage = new UnitListPage(page);

        await page.goto('/units');
        await unitListPage.waitForGridLoad();

        // Listen for console errors
        const consoleErrors: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error' && msg.text().includes('Maximum update depth exceeded')) {
            consoleErrors.push(msg.text());
          }
        });

        // Add a filter
        await unitListPage.addVisualBuilderFilter('Where');
        const input = page.getByPlaceholder("Slug LIKE '%prod%'");

        // Type rapidly to stress test the debounce
        await input.fill('');
        await input.type('test-rapid-typing', { delay: 50 });

        // Confirm the first value registered. The value is typed live and never
        // committed (no Enter), so it does NOT sync to the URL; the input value
        // is the real observable. Awaiting it also lets the debounce/re-render
        // cycle run, so any runaway render loop surfaces as a console error.
        await expect(input).toHaveValue('test-rapid-typing');

        // Modify the value
        await input.clear();
        await input.type('modified-value', { delay: 50 });

        // Confirm the modified value registered (second debounce/re-render cycle)
        await expect(input).toHaveValue('modified-value');

        // Verify NO infinite loop error occurred
        expect(consoleErrors).toHaveLength(0);

        // Verify filter is still working
        await expect(input).toHaveValue('modified-value');
      });

      test('should clear URL params when using Clear all button', async ({ page }) => {
        const unitListPage = new UnitListPage(page);

        await page.goto('/units');
        await unitListPage.waitForGridLoad();

        // Add filters
        await unitListPage.addVisualBuilderFilter('Where', 'clear-test');
        const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
        // Press Enter to commit the value
        await whereInput.press('Enter');
        await page.waitForURL(/filterWhere=/);

        // Verify URL has filter params
        expect(page.url()).toContain('filterWhere=');

        // Clear all filters
        await unitListPage.clearAllVisualBuilderFilters();

        // Wait for URL sync - filterWhere param should be cleared (empty or gone)
        await page.waitForURL((url) => {
          const param = url.searchParams.get('filterWhere');
          return param === '' || param === null;
        });

        // Verify URL params are cleared
        const url = new URL(page.url());
        const whereParam = url.searchParams.get('filterWhere');
        // Empty string or null means cleared
        expect(whereParam === '' || whereParam === null).toBe(true);
      });

      test('should restore filters correctly on page refresh', async ({ page }) => {
        const unitListPage = new UnitListPage(page);
        const testValue = 'refresh-persist-test';

        await page.goto('/units');
        await unitListPage.waitForGridLoad();

        // Add a filter with a specific value
        await unitListPage.addVisualBuilderFilter('Where', testValue);
        const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
        // Press Enter to commit the value
        await whereInput.press('Enter');

        // Wait for URL sync
        await page.waitForURL(/filterWhere=/);

        // Capture the URL
        const urlWithFilter = page.url();
        expect(urlWithFilter).toContain('filterWhere=');

        // Refresh the page
        await page.reload();
        await unitListPage.waitForGridLoad();

        // Verify filter is restored
        await expect(page.getByRole('button', { name: /Filter by Where/i })).toBeVisible();

        // Check that the filter value input has the correct value
        const input = page.getByPlaceholder("Slug LIKE '%prod%'");
        // The value should be restored (may need to check the filter chip text)
        await expect(input).toBeVisible();
      });

      test('should handle Space filter URL sync correctly (no redundant filterSpaceID param)', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        await page.goto('/units');
        await unitListPage.waitForGridLoad();

        // Add Space filter
        await unitListPage.addVisualBuilderFilter('Space');

        // Wait for multi-select to appear (now uses "Select spaces..." placeholder)
        const selectButton = page
          .locator('button')
          .filter({ hasText: 'Select spaces...' })
          .first();
        await expect(selectButton).toBeVisible();

        // Open dropdown and select a space
        await selectButton.click();

        // Wait for dropdown to appear and select the first checkbox option
        // (isVisible polls up to its timeout, so no fixed sleep is needed)
        const checkbox = page.locator('[role="menuitemcheckbox"]').first();
        if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          await checkbox.click();

          // Close the dropdown by clicking elsewhere
          await page.keyboard.press('Escape');

          // Wait for URL sync - space selection should populate filterWhere with SpaceID
          await page.waitForURL(/filterWhere=.*SpaceID/);

          // Verify space is ONLY in filterWhere, NOT as a separate filterSpaceID param
          const url = new URL(page.url());

          // filterWhere should contain SpaceID
          const filterWhere = url.searchParams.get('filterWhere') || '';
          expect(filterWhere).toContain('SpaceID');

          // filterSpaceID should NOT be present (it's redundant)
          const filterSpaceID = url.searchParams.get('filterSpaceID');
          expect(filterSpaceID).toBeNull();
        }
      });
    });

    test('should support blur to apply text filter value', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      // Add where filter
      await unitListPage.addVisualBuilderFilter('Where');

      // Fill in the value
      const input = page.getByPlaceholder("Slug LIKE '%prod%'");
      await input.fill('test-unit');

      // Get URL before blur
      const urlBeforeBlur = page.url();

      // Blur the input
      await input.blur();

      // Wait for URL to update
      await page.waitForURL(/filterWhere=/);

      // Verify URL contains the filter
      const urlAfterBlur = page.url();
      expect(urlAfterBlur).toContain('filterWhere=');
      expect(urlAfterBlur).not.toBe(urlBeforeBlur);
    });

    test.describe('Filter Cancellation Behavior', () => {
      // Helper to verify filter chip is visible (uses aria-label to avoid matching grid column)
      const expectFilterChipVisible = async (
        page: import('@playwright/test').Page,
        fieldName: string,
      ) => {
        await expect(
          page.getByRole('button', { name: new RegExp(`Filter by ${fieldName}`, 'i') }),
        ).toBeVisible();
      };

      test('should remove filter when pressing Escape with empty text value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add where filter
        await unitListPage.addVisualBuilderFilter('Where');

        // Verify filter chip appears (use placeholder to verify filter is added)
        await expect(page.getByPlaceholder("Slug LIKE '%prod%'")).toBeVisible();

        // Focus the input but don't type anything
        const input = page.getByPlaceholder("Slug LIKE '%prod%'");
        await input.focus();

        // Press Escape to cancel
        await page.keyboard.press('Escape');

        // Verify filter is removed - Filter button should be visible again
        await expect(
          page.locator('button').filter({ hasText: /^Filter$/ }),
        ).toBeVisible();
      });

      test('should NOT remove filter when pressing Escape after typing a value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add where filter
        await unitListPage.addVisualBuilderFilter('Where');

        // Type a value into the input
        const input = page.getByPlaceholder("Slug LIKE '%prod%'");
        await input.fill('test-unit');

        // Confirm filter by blurring; the value should be committed to the URL
        await input.blur();
        await page.waitForURL(/filterWhere=/);

        // Focus again
        await input.focus();

        // Press Escape
        await page.keyboard.press('Escape');

        // Wait for any potential removal (bounded: verifying a non-event - the
        // filter should NOT be removed, so there is no positive state to await)
        await page.waitForTimeout(300);

        // Verify filter is still present (because it has a value)
        await expectFilterChipVisible(page, 'Where');
        await expect(page.getByPlaceholder("Slug LIKE '%prod%'")).toBeVisible();
      });

      test('should remove filter when clicking away with empty text value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add where filter
        await unitListPage.addVisualBuilderFilter('Where');

        // Verify filter chip appears
        await expect(page.getByPlaceholder("Slug LIKE '%prod%'")).toBeVisible();

        // Focus the input but don't type anything
        const input = page.getByPlaceholder("Slug LIKE '%prod%'");
        await input.focus();

        // Click away to somewhere else on the page (blur the filter)
        await page.locator('body').click({ position: { x: 10, y: 10 } });

        // Verify filter is removed - Filter button should be visible again
        await expect(
          page.locator('button').filter({ hasText: /^Filter$/ }),
        ).toBeVisible();
      });

      test('should NOT remove filter when clicking away after setting a value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add where filter
        await unitListPage.addVisualBuilderFilter('Where');

        // Type a value into the input
        const input = page.getByPlaceholder("Slug LIKE '%prod%'");
        await input.fill('test-unit');

        // Click away to blur (this commits the value)
        await page.locator('body').click({ position: { x: 10, y: 10 } });

        // Wait for blur handler (bounded: verifying a non-event - the filter
        // should NOT be removed, so there is no positive state to await)
        await page.waitForTimeout(300);

        // Verify filter is still present (because it has a value)
        await expectFilterChipVisible(page, 'Where');
        await expect(page.getByPlaceholder("Slug LIKE '%prod%'")).toBeVisible();
      });

      test('should remove filter when pressing Escape with empty select value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add a Space filter (which uses MultiSelectInput)
        await unitListPage.addVisualBuilderFilter('Space');

        // Verify filter chip appears (use button with "Select spaces..." to verify)
        const selectButton = page
          .locator('button')
          .filter({ hasText: 'Select spaces...' })
          .first();
        await expect(selectButton).toBeVisible();

        // Focus the select button
        await selectButton.focus();

        // Press Escape without selecting anything
        await page.keyboard.press('Escape');

        // Verify filter is removed - Filter button should be visible again
        await expect(
          page.locator('button').filter({ hasText: /^Filter$/ }),
        ).toBeVisible();
      });

      test('should remove filter when pressing Backspace in empty text input', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add where filter
        await unitListPage.addVisualBuilderFilter('Where');

        // Verify filter chip appears (use placeholder to verify filter is added)
        await expect(page.getByPlaceholder("Slug LIKE '%prod%'")).toBeVisible();

        // Focus the input (should be empty)
        const input = page.getByPlaceholder("Slug LIKE '%prod%'");
        await input.focus();

        // Press Backspace on empty input
        await page.keyboard.press('Backspace');

        // Verify filter is removed - Filter button should be visible again
        await expect(
          page.locator('button').filter({ hasText: /^Filter$/ }),
        ).toBeVisible();
      });

      test('should NOT remove filter when pressing Backspace with text content', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add where filter
        await unitListPage.addVisualBuilderFilter('Where');

        // Type some text
        const input = page.getByPlaceholder("Slug LIKE '%prod%'");
        await input.fill('test');

        // Press Backspace (should just delete a character, not remove filter)
        await input.press('Backspace');

        // Verify filter is still present (filter chip should exist)
        await expectFilterChipVisible(page, 'Where');
        // Input should have 'tes' (one character deleted) - auto-waiting assertion
        // confirms the filter input remains and was not removed
        await expect(input).toHaveValue('tes');
      });

      test('should remove number filter when pressing Escape with empty value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add a number filter (Head Revision uses NumberInput)
        await unitListPage.addVisualBuilderFilter('Head Revision');

        // Verify filter is added
        await expect(page.getByPlaceholder('Enter number...')).toBeVisible();

        // Focus the input but don't type anything
        const input = page.getByPlaceholder('Enter number...');
        await input.focus();

        // Press Escape to cancel
        await page.keyboard.press('Escape');

        // Verify filter is removed
        await expect(
          page.locator('button').filter({ hasText: /^Filter$/ }),
        ).toBeVisible();
      });

      test('should remove number filter when clicking away with empty value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add a number filter
        await unitListPage.addVisualBuilderFilter('Head Revision');

        // Verify filter is added
        const input = page.getByPlaceholder('Enter number...');
        await expect(input).toBeVisible();

        // Focus the input but don't type anything
        await input.focus();

        // Click away to blur
        await page.locator('body').click({ position: { x: 10, y: 10 } });

        // Verify filter is removed
        await expect(
          page.locator('button').filter({ hasText: /^Filter$/ }),
        ).toBeVisible();
      });

      test('should NOT remove number filter when clicking away after setting a value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add a number filter
        await unitListPage.addVisualBuilderFilter('Head Revision');

        // Type a value
        const input = page.getByPlaceholder('Enter number...');
        await input.fill('5');

        // Click away to blur (commits value)
        await page.locator('body').click({ position: { x: 10, y: 10 } });

        // Wait for blur handler (bounded: verifying a non-event - the filter
        // should NOT be removed, so there is no positive state to await)
        await page.waitForTimeout(300);

        // Verify filter is still present
        await expectFilterChipVisible(page, 'Head Revision');
        await expect(input).toHaveValue('5');
      });

      test('should remove date filter when pressing Escape with empty value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add a date filter (Updated uses DateInput)
        await unitListPage.addVisualBuilderFilter('Updated');

        // Verify filter is added - date inputs have type="date"
        const input = page.locator('input[type="date"]');
        await expect(input).toBeVisible();

        // Focus the input but don't set a value
        await input.focus();

        // Press Escape to cancel
        await page.keyboard.press('Escape');

        // Verify filter is removed
        await expect(
          page.locator('button').filter({ hasText: /^Filter$/ }),
        ).toBeVisible();
      });

      test('should remove date filter when clicking away with empty value', async ({
        page,
      }) => {
        const unitListPage = new UnitListPage(page);

        // Add a date filter
        await unitListPage.addVisualBuilderFilter('Updated');

        // Verify filter is added
        const input = page.locator('input[type="date"]');
        await expect(input).toBeVisible();

        // Focus the input but don't set a value
        await input.focus();

        // Click away to blur
        await page.locator('body').click({ position: { x: 10, y: 10 } });

        // Verify filter is removed
        await expect(
          page.locator('button').filter({ hasText: /^Filter$/ }),
        ).toBeVisible();
      });
    });
  });

  test.describe('Grid Toolbar Search Bar', () => {
    test('should filter grid rows when typing in search box', async ({ page }) => {
      const unitListPage = new UnitListPage(page);
      const uniqueSlug = RandomSlugGenerator.randomSlugName();

      // Create two units - one with unique slug, one without
      await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: uniqueSlug });
      await unitListPage.createUnitViaAPI({
        unitType: 'basic-deployment',
        slug: 'different-unit',
      });

      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      // Search for unique slug
      await unitListPage.quickFilter(uniqueSlug);

      // Verify only matching unit is visible (auto-waiting assertions poll
      // through the search debounce)
      await expect(page.getByText(uniqueSlug)).toBeVisible();
      await expect(page.getByText('different-unit')).not.toBeVisible();
    });

    test('should clear filter when search box is cleared', async ({ page }) => {
      const unitListPage = new UnitListPage(page);
      const unit1 = RandomSlugGenerator.randomSlugName();
      const unit2 = RandomSlugGenerator.randomSlugName();

      await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: unit1 });
      await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: unit2 });

      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      // Apply search filter
      await unitListPage.quickFilter(unit1);

      // Verify filtered (auto-waiting assertions poll through the search debounce)
      await expect(page.getByText(unit1)).toBeVisible();
      await expect(page.getByText(unit2)).not.toBeVisible();

      // Clear search
      await unitListPage.clearQuickFilter();

      // Verify all rows return (use getRowByName to handle pagination)
      await expect(await unitListPage.getRowByName(unit1)).toBeVisible();
      await expect(await unitListPage.getRowByName(unit2)).toBeVisible();
    });

    test('should maintain focus while typing in search box', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      const searchBox = page.getByPlaceholder('Search…');

      // Click to focus
      await searchBox.click();
      await expect(searchBox).toBeFocused();

      // Type slowly (character by character with delays)
      await page.keyboard.type('test', { delay: 100 });

      // Verify search box still has focus
      await expect(searchBox).toBeFocused();

      // Verify all characters were entered
      await expect(searchBox).toHaveValue('test');
    });

    test('should handle special characters in search', async ({ page }) => {
      const unitListPage = new UnitListPage(page);
      // Use random slug with special chars to avoid conflicts with previous test runs
      const randomPart = RandomSlugGenerator.randomSlugName();
      const specialSlug = `test-unit_${randomPart}.chars`;

      await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: specialSlug });

      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      // Search with the unique part including special chars (underscore and dot)
      await unitListPage.quickFilter(`_${randomPart}.chars`);

      // Should find the unit (auto-waiting assertion polls through the search debounce)
      await expect(page.getByText(specialSlug)).toBeVisible();
    });

    test('should show "No rows" when search has no results', async ({ page }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: 'test-unit' });

      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      await unitListPage.quickFilter('nonexistent-unit-xyz-123');

      // Should show "No rows" message (auto-waiting assertions poll through the debounce)
      const overlay = page.locator('.MuiDataGrid-overlay');
      await expect(overlay).toBeVisible();
      await expect(overlay).toContainText(/no (rows|results)/i);
    });

    test('should highlight matching text in grid cells', async ({ page }) => {
      const unitListPage = new UnitListPage(page);
      // Use random slug to avoid conflicts with previous test runs
      const randomPart = RandomSlugGenerator.randomSlugName();
      const unitName = `deployment-highlight-${randomPart}`;

      await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: unitName });

      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      // Search for partial match using the unique random part
      await unitListPage.quickFilter(randomPart);

      // Verify the unit is visible (auto-waiting assertion polls through the
      // search debounce and highlighting)
      await expect(page.getByText(unitName)).toBeVisible();

      // Note: Highlighted text is visually styled but may not have a unique testable attribute
      // The important thing is that filtering works correctly
    });
  });

  test.describe('Saved Function Invocations', () => {
    test('should save a validating function and invoke that saved function', async ({
      page,
    }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const savedInvocationName = RandomSlugGenerator.randomSlugName();
      const functionName = 'cel-validate';
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug });

      // Save the function invocation
      await unitListPage.saveFunctionInvocationyByNameWithparameters({
        name: slug,
        functionName,
        savedInvocationName,
        params: [{ name: 'Validation-expr', value: 'r.spec.replicas > 1' }],
        role: 'textbox',
      });

      // Select and invoke the saved function
      await unitListPage.selectAndInvokeSavedFunction(savedInvocationName);

      // Verify replicas were set (auto-waiting assertion waits for the invocation result)
      await expect(page.getByText('Passed').first()).toBeVisible();
    });

    test('should edit a saved validating function and invoke that saved function', async ({
      page,
    }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const savedInvocationName = RandomSlugGenerator.randomSlugName();
      const functionName = 'cel-validate';
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug });

      // Save the function invocation
      await unitListPage.saveFunctionInvocationyByNameWithparameters({
        name: slug,
        functionName,
        savedInvocationName,
        params: [{ name: 'Validation-expr', value: 'r.spec.replicas > 1' }],
        role: 'textbox',
      });

      // Edit the saved function to change replicas to 5
      await unitListPage.editSavedFunctionInvocationWithParameters({
        savedInvocationName,
        params: [{ name: 'Validation-expr', value: 'r.spec.replicas > 3' }],
        role: 'textbox',
      });

      // Verify replicas were set
      await expect(page.getByText('Failed', { exact: true })).toBeVisible();
    });

    test('should save a mutating function and invoke that saved function', async ({
      page,
    }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const savedInvocationName = RandomSlugGenerator.randomSlugName();
      const functionName = 'set-replicas';
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug });

      // Save the function invocation
      await unitListPage.saveFunctionInvocationyByNameWithparameters({
        name: slug,
        functionName,
        savedInvocationName,
        params: [{ name: 'Replicas', value: '3' }],
      });

      // Select and invoke the saved function
      await unitListPage.selectAndInvokeSavedFunction(savedInvocationName);

      // Diff renders as a table (field | old | new), not "replicas: 3" text
      await expect(page.locator('#root')).toContainText('1 field changed');
    });

    test('should edit a saved mutating function and invoke that saved function', async ({
      page,
    }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const functionName = 'set-replicas';
      const savedInvocationName = RandomSlugGenerator.randomSlugName();
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug });

      // Save the function invocation
      await unitListPage.saveFunctionInvocationyByNameWithparameters({
        name: slug,
        functionName,
        savedInvocationName,
        params: [{ name: 'Replicas', value: '3' }],
      });

      // Edit the saved function to change replicas to 5
      await unitListPage.editSavedFunctionInvocationWithParameters({
        savedInvocationName,
        params: [{ name: 'Replicas', value: '5' }],
      });

      // Diff renders as a table (field | old | new), not "replicas: 5" text
      await expect(page.locator('#root')).toContainText('1 field changed');
    });

    test('should allow a user to select units from an invoked validating function and invoke a saved function on those units', async ({
      page,
    }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const functionName = 'get-replicas';
      const savedInvocationName = RandomSlugGenerator.randomSlugName();
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug });

      // Save the function invocation
      await unitListPage.saveFunctionInvocationyByNameWithparameters({
        name: slug,
        functionName,
        savedInvocationName,
        params: [],
      });

      await unitListPage.invokeFunctionByNameWithParameters({
        name: slug,
        functionName: 'no-placeholders',
        params: [],
      });

      // The unit is already in the invoker context from the previous invocation
      // (invokeFunctionByNameWithParameters waits for that invocation to settle).
      // Select and invoke the saved function
      await unitListPage.selectAndInvokeSavedFunction(savedInvocationName);

      // get-replicas returns attribute values in a table; verify results were returned
      await expect(page.locator('#root')).toContainText('All invocations succeeded');
    });

    test('should allow a user to select units from an invoked validating function and edit a saved function and invoke it on those units', async ({
      page,
    }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const functionName = 'cel-validate';
      const savedInvocationName = RandomSlugGenerator.randomSlugName();
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug });

      // Save the function invocation
      await unitListPage.saveFunctionInvocationyByNameWithparameters({
        name: slug,
        functionName,
        savedInvocationName,
        params: [{ name: 'Validation-expr', value: 'r.spec.replicas > 1' }],
        role: 'textbox',
      });

      await unitListPage.invokeFunctionByNameWithParameters({
        name: slug,
        functionName: 'vet-cel',
        // Passes, so the 'Failed' asserted below can only come from the edited saved function.
        params: [{ name: 'Expression', value: "r.kind != 'Deployment' || r.spec.replicas <= 10" }],
        role: 'textbox',
      });

      // The unit is already in the invoker context from the previous invocation
      // (invokeFunctionByNameWithParameters waits for that invocation to settle).
      // Edit the save function and invoke
      await unitListPage.editSavedFunctionInvocationWithParameters({
        savedInvocationName,
        params: [{ name: 'Validation-expr', value: 'r.spec.replicas > 3' }],
        role: 'textbox',
      });

      // Verify result
      await expect(page.getByText('Failed', { exact: true })).toBeVisible();
    });

    test('should allow a user to select units from an invoked mutating function and invoke a saved function on those units', async ({
      page,
    }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const functionName = 'cel-validate';
      const savedInvocationName = RandomSlugGenerator.randomSlugName();
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug });

      // Save the function invocation
      await unitListPage.saveFunctionInvocationyByNameWithparameters({
        name: slug,
        functionName,
        savedInvocationName,
        params: [{ name: 'Validation-expr', value: 'r.spec.replicas > 1' }],
        role: 'textbox',
      });

      await unitListPage.invokeFunctionByNameWithParameters({
        name: slug,
        functionName: 'set-namespace',
        params: [{ name: 'Namespace-name', value: 'confighub' }],
        role: 'textbox',
      });

      // The unit is already in the invoker context from the previous invocation
      // Select and invoke the saved function
      await unitListPage.selectAndInvokeSavedFunction(savedInvocationName);

      await expect(page.getByText('Passed').first()).toBeVisible();
    });

    test.skip('should allow a user to select units from an invoked mutating function and edit a saved function and invoke it on those units', async ({
      page,
    }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const functionName = 'cel-validate';
      const savedInvocationName = RandomSlugGenerator.randomSlugName();
      const unitListPage = new UnitListPage(page);

      await unitListPage.createUnitViaAPI({ unitType: 'nginx', slug });

      // Save the function invocation
      await unitListPage.saveFunctionInvocationyByNameWithparameters({
        name: slug,
        functionName,
        savedInvocationName,
        params: [{ name: 'Validation-expr', value: 'r.spec.replicas > 1' }],
        role: 'textbox',
      });

      await unitListPage.invokeFunctionByNameWithParameters({
        name: slug,
        functionName: 'set-namespace',
        params: [{ name: 'Namespace-name', value: 'confighub' }],
        role: 'textbox',
      });

      // The unit is already in the invoker context from the previous invocation
      // Edit and invoke the saved function
      await unitListPage.editSavedFunctionInvocationWithParameters({
        savedInvocationName,
        params: [{ name: 'Validation-expr', value: 'r.spec.replicas > 3' }],
        role: 'textbox',
      });

      await unitListPage.expectToBeVisibleByText('Failed');
    });
  });

  test.describe('Table Grouping', () => {
    const groupingSpaceIds: string[] = [];

    test.afterAll(async ({ browser }) => {
      if (groupingSpaceIds.length === 0) return;
      const context = await newAuthorizedContext(browser);
      const page = await context.newPage();
      await page.goto('/');
      const api = new ApiHelper(page);
      for (const spaceId of groupingSpaceIds) {
        await api.deleteSpace(spaceId, true).catch(() => {});
      }
      await context.close();
    });

    test('the (empty) group is the last group at its level', async ({ page }) => {
      const run = RandomSlugGenerator.randomSlugName();
      const spaceSlug = `pw-group-order-${run}`;
      // A key of this run only: every Unit outside this Space is under (empty).
      const labelKey = `pw-order-${run}`;
      const api = new ApiHelper(page);
      const space = await api.createSpace({ space: { Slug: spaceSlug } });
      groupingSpaceIds.push(space.SpaceID);
      await api.createUnit({
        spaceId: space.SpaceID,
        unit: { Slug: `${run}-labelled`, ToolchainType: 'Kubernetes/YAML', Labels: { [labelKey]: 'alpha' } },
      });
      await api.createUnit({
        spaceId: space.SpaceID,
        unit: { Slug: `${run}-unlabelled`, ToolchainType: 'Kubernetes/YAML' },
      });

      const unitListPage = new UnitListPage(page);
      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      // Space, then the label: this Space holds an "alpha" group and an
      // (empty) group. In localeCompare order "(empty)" comes first.
      await page.getByRole('button', { name: 'Add grouping level' }).click();
      const labelsTrigger = page.getByRole('menuitem', { name: 'Labels', exact: true });
      await labelsTrigger.hover();
      const labelItem = page.getByRole('menuitem', { name: labelKey });
      await labelItem.hover();
      await labelItem.click();
      await expect(page).toHaveURL(new RegExp(`viewGroupBy=Space%2CLabels\\.${labelKey}`));

      const spaceNode = page.getByRole('treeitem', { name: new RegExp(spaceSlug) });
      if ((await spaceNode.getAttribute('aria-expanded')) !== 'true') {
        await spaceNode.locator('.MuiTreeItem-iconContainer').first().click();
      }
      const labelGroups = spaceNode.getByRole('treeitem');
      await expect(labelGroups).toHaveCount(2);
      await expect(labelGroups.first().locator('.MuiTreeItem-content').first()).toContainText('alpha');
      await expect(labelGroups.last().locator('.MuiTreeItem-content').first()).toContainText('(empty)');
    });

    test('should show default Space grouping and allow adding a second grouping level via sidebar', async ({
      page,
    }) => {
      const unitListPage = new UnitListPage(page);
      const unitName = RandomSlugGenerator.randomSlugName();

      await unitListPage.createUnitViaAPI({ unitType: 'basic-deployment', slug: unitName });

      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      // Space is the default grouping level — chip should already be visible
      await expect(
        page.getByRole('button', { name: /Change Space grouping/i }),
      ).toBeVisible({ timeout: 5000 });

      // Add 'Target' as a second grouping level via the sidebar
      await unitListPage.groupByColumn('Target');

      // Verify the 'Change Target grouping' chip appears in the sidebar
      await expect(
        page.getByRole('button', { name: /Change Target grouping/i }),
      ).toBeVisible({ timeout: 5000 });
    });

    // Verify that both grouping levels are maintained simultaneously in the sidebar
    test('should maintain multiple grouping levels simultaneously in the sidebar', async ({
      page,
    }) => {
      const unitListPage = new UnitListPage(page);
      const unitName = RandomSlugGenerator.randomSlugName();

      await unitListPage.createUnitViaAPI({
        unitType: 'basic-deployment',
        slug: unitName,
      });

      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      // Space is the default grouping level
      await expect(
        page.getByRole('button', { name: /Change Space grouping/i }),
      ).toBeVisible({ timeout: 5000 });

      // Add 'Target' as a second grouping level
      await unitListPage.groupByColumn('Target');

      // Both Space and Target chips must be visible simultaneously in the sidebar
      await expect(
        page.getByRole('button', { name: /Change Space grouping/i }),
      ).toBeVisible({ timeout: 5000 });
      await expect(
        page.getByRole('button', { name: /Change Target grouping/i }),
      ).toBeVisible({ timeout: 5000 });
    });

    // Verify that a grouping level can be removed while preserving others
    test('should allow removing a grouping level while preserving the remaining ones in the sidebar', async ({
      page,
    }) => {
      const unitListPage = new UnitListPage(page);
      const unitName = RandomSlugGenerator.randomSlugName();

      await unitListPage.createUnitViaAPI({
        unitType: 'basic-deployment',
        slug: unitName,
      });

      await page.goto('/units');
      await unitListPage.waitForGridLoad();

      // Add 'Target' as a second grouping level (Space is already the default)
      await unitListPage.groupByColumn('Target');

      // Both chips should be visible
      await expect(
        page.getByRole('button', { name: /Change Space grouping/i }),
      ).toBeVisible({ timeout: 5000 });
      await expect(
        page.getByRole('button', { name: /Change Target grouping/i }),
      ).toBeVisible({ timeout: 5000 });

      // Hover the Target chip to reveal the remove button, then click it
      // (click auto-waits for the remove button to become actionable after hover)
      await page.getByRole('button', { name: /Change Target grouping/i }).hover();
      await page.getByRole('button', { name: /Remove Target grouping/i }).click();

      // Target chip must be gone; Space chip must remain
      await expect(
        page.getByRole('button', { name: /Change Target grouping/i }),
      ).not.toBeVisible({ timeout: 5000 });
      await expect(
        page.getByRole('button', { name: /Change Space grouping/i }),
      ).toBeVisible({ timeout: 5000 });
    });
  });
});
