// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

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

  test('should show an attribute values list: get-provided', async ({ page }) => {
    const name = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);

    await unitListPage.createUnitViaAPI({ unitType: 'todo-app-load-balancer', slug: name });

    await unitListPage.invokeFunctionByNameWithParameters({
      name,
      functionName: 'get-provided',
      params: [],
    });

    // todo-app-load-balancer has 3 provided attributes, each with a resource-name field
    await unitListPage.expectToHaveCount('resource-name', 3);
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

  test('should create a unit via the UI and open its detail page', async ({ page }) => {
    test.setTimeout(90000);
    const unitName = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);

    await unitListPage.createUnitViaUI({
      spaceSlug: 'default',
      slug: unitName,
      unitType: 'basic-deployment',
    });

    await expect(await unitListPage.getRowByName(unitName)).toBeVisible();

    await unitListPage.goToUnitDetailPageByName(unitName);
    await expect(page.getByText(unitName)).toBeVisible();
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

      await expect(page.getByPlaceholder("Slug LIKE '%prod%'")).toBeVisible();
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

    test('should allow adding multiple label filters', async ({ page }) => {
      const queryBuilder = page.locator('[data-testid="query-builder"]');
      const labelsRemoveButtons = queryBuilder.locator('button[aria-label="Remove Labels filter"]');

      await page
        .locator('button')
        .filter({ hasText: /^Filter$/ })
        .click();
      const labelsMenuItem = page.locator('[role="menuitem"]').filter({ hasText: 'Labels' });
      await labelsMenuItem.click();
      await expect(labelsRemoveButtons).toHaveCount(1);

      // Labels stays in the menu after one label filter exists
      await page.locator('button[aria-label="Add filter"]').click();
      await labelsMenuItem.click();
      await expect(labelsRemoveButtons).toHaveCount(2);
    });

    // A filter chip used to vanish when its operator changed before a value was set:
    // the value input's ClickAwayListener removed the filter on the operator click.
    test('filter chip should persist after changing operator before setting a value', async ({
      page,
    }) => {
      const unitListPage = new UnitListPage(page);

      await unitListPage.addVisualBuilderFilter('Space');

      const filterChipButton = page.getByRole('button', { name: /Filter by Space/i });
      await expect(filterChipButton).toBeVisible({ timeout: 5000 });

      const filterRow = filterChipButton.locator('..');
      const operatorButton = filterRow
        .locator('button[aria-haspopup="listbox"]:not([aria-label])')
        .first();
      await operatorButton.click();

      const isNotOption = page
        .locator('.MuiPopper-root [role="menuitem"]')
        .filter({ hasText: /^is not$/ });
      await isNotOption.click();

      await expect(filterChipButton).toBeVisible({ timeout: 3000 });
      await expect(operatorButton).toContainText('is not');
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

      // The auto-waiting assertion waits for the invocation result
      await expect(page.getByText('Passed').first()).toBeVisible();
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

    test('should show the change in each resource that has the changed path', async ({ page }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const unitListPage = new UnitListPage(page);

      // Both IngressRoutes hold the search value at spec.routes.0.match.
      await unitListPage.createUnitViaAPI({ unitType: 'two-ingress-routes', slug });

      await unitListPage.invokeFunctionByNameWithParameters({
        name: slug,
        functionName: 'search-replace',
        params: [
          { name: 'Search-value', value: 'old.example.com' },
          { name: 'Replace-value', value: 'new.example.com' },
        ],
        role: 'textbox',
      });

      await expect(page.locator('#root')).toContainText('2 fields changed');
      const resources = page.getByTestId('config-diff-resource');
      await expect(resources).toHaveCount(2);
      await expect(resources.filter({ hasText: 'default/web' })).toContainText('new.example.com');
      await expect(resources.filter({ hasText: 'default/api' })).toContainText('new.example.com');
    });

    test('should show a deleted resource whose paths another resource also has', async ({ page }) => {
      const slug = RandomSlugGenerator.randomSlugName();
      const unitListPage = new UnitListPage(page);

      // The IngressRoute left behind has every path the deleted one had, so a diff of the
      // Unit's paths alone, without the resource each belongs to, finds nothing changed.
      await unitListPage.createUnitViaAPI({ unitType: 'two-ingress-routes', slug });

      await unitListPage.invokeFunctionByNameWithParameters({
        name: slug,
        functionName: 'delete-resource',
        params: [
          { name: 'Resource-type', value: 'traefik.io/v1alpha1/IngressRoute' },
          { name: 'Resource-name', value: 'default/web' },
        ],
        role: 'textbox',
      });

      await expect(page.locator('#root')).toContainText('1 field changed');
      const resources = page.getByTestId('config-diff-resource');
      await expect(resources).toHaveCount(1);
      await expect(resources).toContainText('default/web');
      await expect(resources).toContainText('deleted');
    });
  });

  test.describe('Table Grouping', () => {
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
