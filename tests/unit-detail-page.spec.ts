// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { UnitDetailPage } from './fixtures/unit-details-page';
import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import { Unit } from '@confighub/rtk-query';

const deploymentType = 'todo-app-load-balancer';
const name = RandomSlugGenerator.randomSlugName();
let spaceId: string | undefined;

let createdUnit: Unit | null = null;

test.describe('unit detail page', () => {
  test.use({ storageState: 'authentication.json' });

  test.beforeEach(async ({ page }, testInfo) => {
    // Skip setup for tests that handle their own
    if (testInfo.title.includes('upgrade')) {
      return;
    }

    const unitListPage = new UnitListPage(page);
    await unitListPage.goto();
    await page.getByTestId('refresh-button').click();
    await unitListPage.goToUnitDetailPageByRowClick(name);
  });

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();

    const unitListPage = new UnitListPage(page);
    createdUnit = await unitListPage.createUnitViaAPI({ unitType: deploymentType, slug: name });

    // The Space the Unit was created in. A second look at the Space list need not find it
    // first: the list has no defined order, and creating the Unit can rewrite its Space's row.
    spaceId = createdUnit.SpaceID;

    await context.close();
  });

  // General Tests

  test('should display unit data', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);

    await unitDetailPage.expectToBeVisibleByText(name);

    // The configuration is not on the Unit -- the Config tab reads it from the Unit's data
    // endpoint -- so this is what proves it arrived, rather than that the page rendered.
    await page.getByRole('tab', { name: 'Config' }).click();
    await expect(page.getByText('Kubernetes/YAML Configuration')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('nginx-config').first()).toBeVisible({ timeout: 10000 });
  });

  // Dashboard Tests

  test('should display activity timeline', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);

    // Verify activity timeline is visible
    await unitDetailPage.expectToBeVisibleByText('Activity');
  });

  test('should display username in revisions table not Automated', async ({ page }) => {
    // Navigate to the Revisions tab
    await page.getByRole('tab', { name: 'Revisions' }).click();

    // Wait for the revisions grid and its user avatars to render before reading content
    const avatars = page.locator('[class*="MuiAvatar"]');
    await expect(avatars.first()).toBeVisible({ timeout: 5000 });

    // Check that the page does NOT contain "Automated" text
    // which would indicate the bug where usernames were not displayed
    const pageContent = await page.textContent('body');

    // The bug would cause "Automated" to appear in the Edited By column
    // This test would fail if the bug exists
    expect(pageContent).not.toContain('Automated');
  });

  // TODO: this is flaky
  test.skip('should show a new revision on the dashboard', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);

    await unitDetailPage.updateConfigReplicas('2');

    // Verify new activity appears - use more flexible selector (auto-waits)
    await expect(
      page.getByRole('region').getByRole('list').getByText('Update replicas'),
    ).toBeVisible({ timeout: 10000 });
  });

  // TODO:
  test.skip('should restore a revision and create a new revision', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);

    // First create a change to have multiple revisions
    await unitDetailPage.updateConfigReplicas('3');

    // Navigate to the Revisions tab
    await page.getByRole('tab', { name: 'Revisions' }).click();

    // Wait for revisions table to load with at least the header + data rows
    await page.waitForSelector('[role="grid"]');
    const checkboxes = page.locator('[role="row"] input[type="checkbox"]');
    await expect(checkboxes.nth(2)).toBeVisible();

    // Select the second revision (older one) to restore
    await checkboxes.nth(2).click(); // Skip header checkbox, select second data row

    // Click Restore button
    await page.getByRole('button', { name: 'Restore' }).click();

    // Wait for restore drawer to open
    await page.waitForSelector('text=/Restore from revision number/');

    // Click the Confirm button in the drawer
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Wait for success message
    await expect(page.locator('text=Revision applied successfully')).toBeVisible({
      timeout: 10000,
    });

    // Reload to see the new revision
    await page.reload();
    await page.waitForSelector('[role="grid"]');

    // Check that a new revision was created with restore description
    const restoredRevisionText = await page.locator('text=/Restored revision/').first();
    await expect(restoredRevisionText).toBeVisible({ timeout: 10000 });
  });

  test('should refresh dashboard data', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);

    // Click refresh button
    await page.getByTestId('refresh-button').click();

    // Verify dashboard is still functional (auto-waits)
    await unitDetailPage.expectToBeVisibleByText('Activity');
  });

  // Function Invocation Tests

  // There is no dedicated results tab any more (the Function Invocations and
  // Attributes tabs were removed and nothing replaced them), so validation
  // pass/fail is asserted directly off the /function/invoke response instead
  // of off rendered UI text.

  // Success on a FunctionInvocationsResponse entry means only that the function executed
  // without error -- a vet-* function that detects a violation still reports Success: true.
  // The pass/fail verdict lives in the ValidationResult output, base64-encoded on the wire,
  // which decodes to a JSON array whose first entry carries Passed.
  const expectValidationFailed = (invocationResult: { Outputs?: Record<string, string> }) => {
    const encoded =
      invocationResult?.Outputs?.['ValidationResult'] ??
      invocationResult?.Outputs?.['ValidationResultList'];
    expect(encoded).toBeTruthy();
    const results = JSON.parse(Buffer.from(encoded as string, 'base64').toString('utf-8'));
    expect(results?.[0]?.Passed).toBe(false);
  };

  // The Overview dashboard (Dashboard.tsx) fires its own background `get-resources`
  // /function/invoke POST every time the unit reloads, independent of anything the
  // test does. A predicate that only checks the URL/method races against that call and
  // can capture its response -- whose Outputs only ever has ResourceList -- instead of
  // the vet-* invocation the test actually triggered by clicking Invoke. Matching on the
  // request body's FunctionName pins the wait to the invocation under test.
  const waitForFunctionInvokeResponse = (page: Page, functionName: string) =>
    page.waitForResponse((resp) => {
      if (!resp.url().includes('/function/invoke') || resp.request().method() !== 'POST') {
        return false;
      }
      const postData = resp.request().postData();
      return !!postData && postData.includes(`"FunctionName":"${functionName}"`);
    });

  test('should execute a validation function: vet-celexpr successfully', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);
    const functionName = 'vet-celexpr';

    const [response] = await Promise.all([
      waitForFunctionInvokeResponse(page, functionName),
      unitDetailPage.invokeFunctionByNameWithParameters({
        functionName,
        // `fullyParallel: true` (playwright.config.ts) means the 'set-replicas' test can
        // mutate this same shared unit's replicas concurrently with this test, so a
        // threshold like "replicas < 3" is not deterministic (the fixture starts at
        // replicas: 1, which already satisfies < 3 and would pass validation before any
        // mutation lands). "< 0" can never hold, so the Deployment always fails this
        // check regardless of its current replica count.
        params: [
          { name: 'validation-expr', value: 'r.kind != "Deployment" || r.spec.replicas < 0' },
        ],
      }),
    ]);

    // /function/invoke responds with a JSON array of FunctionInvocationsResponse,
    // one entry per unit invoked on.
    const body = await response.json();
    expectValidationFailed(body?.[0]);
  });

  test('should execute a validation function: vet-cel', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);
    const functionName = 'vet-cel';

    const [response] = await Promise.all([
      waitForFunctionInvokeResponse(page, functionName),
      unitDetailPage.invokeFunctionByNameWithParameters({
        functionName,
        // "< 0" can never hold, for the same reason as in the vet-celexpr test above.
        params: [{ name: 'expression', value: "r.kind != 'Deployment' || r.spec.replicas < 0" }],
      }),
    ]);

    const body = await response.json();
    expectValidationFailed(body?.[0]);
  });

  test('should execute a mutation function: set-replicas', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);
    const functionName = 'set-replicas';

    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/function/invoke') && resp.request().method() === 'POST',
      ),
      unitDetailPage.invokeFunctionByNameWithParameters({
        functionName,
        params: [{ name: 'Replicas', value: '5', type: 'number' }],
      }),
    ]);

    // Mutations recorded by the invocation still show up in the Mutations tab.
    await unitDetailPage.goToMutationsTab();
    await unitDetailPage.expectToBeVisibleByText(functionName);
  });

  // Upgrade Unit Tests
  // TODO: Fix later
  test.skip('should upgrade units', async ({ page }) => {
    if (process.env.CI) {
      // Increase timeout from default 30 seconds on CI
      test.setTimeout(60000);
    }

    const unitListPage = new UnitListPage(page);

    const upstreamName = RandomSlugGenerator.randomSlugName();
    const downstreamName = RandomSlugGenerator.randomSlugName();

    const clonedName = `${downstreamName}${upstreamName}`;

    // Create upstream unit
    await unitListPage.createUnitViaAPI({ unitType: deploymentType, slug: upstreamName });

    // Create downstream unit
    await unitListPage.goto();
    // After cloning, wait for the unit to appear in the list
    await unitListPage.cloneUnit({slug: upstreamName, slugClone: downstreamName});
    await expect(page.getByText(downstreamName)).toBeVisible({ timeout: 10000 });
    await unitListPage.goto();

    // Navigate to upstream unit and update it
    await unitListPage.goToUnitDetailPageByRowClick(upstreamName);

    // Update upstream unit replicas to 2
    const unitDetailPage = new UnitDetailPage(page);
    await unitDetailPage.updateConfigReplicas('2');

    // Wait for the cloned unit to be visible
    await unitListPage.goto();
    await expect(page.getByText(downstreamName)).toBeVisible({ timeout: 10000 });

    // Then navigate to it — wait for the upgrade chip that confirms the page loaded
    await unitListPage.goToUnitDetailPageByRowClick(clonedName);
    await expect(page.getByTestId('upgrade-needed-chip')).toBeVisible({ timeout: 10000 });

    // Cancel upgrade of downstream unit via menu
    await unitDetailPage.selectMoreItemsOptionByName('Upgrade');
    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await cancelButton.click();
    await expect(cancelButton).toBeHidden();

    // Upgrade downstream unit via upgrade chip
    await page.getByTestId('upgrade-needed-chip').click();
    const confirmButton = page.getByRole('button', { name: 'Confirm' });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Check that diff text is visible
    await expect(page.getByText('Diff', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('replicas: 1', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('replicas: 2', { exact: true }).first()).toBeVisible();
  });

  test('should invoke a function: ensure-context', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);

    await unitDetailPage.invokeEnsurecontextFunction('true');

    // The tree view renders 'confighub.com/UnitSlug' split across DOM nodes;
    // check for the partial text that appears in a single element.
    await unitDetailPage.expectToHaveCount('com/UnitSlug', 1);
  });

  test('should show a form error when invoking a function with no selection: ensure-context', async ({
    page,
  }) => {
    const unitDetailPage = new UnitDetailPage(page);

    await unitDetailPage.invokeEnsurecontextFunction();

    await unitDetailPage.expectToBeVisibleByText('Add-context is required');
  });

  test('should use unit toolchain type as default in function sidebar', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);
    const unitListPage = new UnitListPage(page);

    // Update the unit's toolchain type via API
    await unitListPage.updateUnitViaAPI({
      existingUnit: createdUnit!,
      spaceId: spaceId!,
      unitSlug: name,
      toolchainType: 'ConfigHub/YAML',
    });

    // Click refresh to reload the data and wait for the unit fetch to complete
    const unitRefetch = page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.url().includes('/unit') && r.request().method() === 'GET',
    );
    await page.getByTestId('refresh-button').click();
    await unitRefetch;

    // Open the invoker sidebar - toolchain filter should auto-set to the unit's toolchain
    await unitDetailPage.openInvokerSidebar();

    // Verify sidebar is open with function search visible
    await expect(page.getByPlaceholder('Search functions')).toBeVisible({ timeout: 5000 });

    // The toolchain filter pills should include 'ConfigHub/YAML' as the active filter
    await expect(page.getByText('ConfigHub/YAML').first()).toBeVisible({ timeout: 5000 });
  });
});
