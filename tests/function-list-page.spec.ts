// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const deploymentType = 'todo-app-load-balancer';
const name = RandomSlugGenerator.randomSlugName();

test.describe('function list page', () => {
  test.use({ storageState: 'authentication.json' });

  test.beforeEach(async ({ page }, testInfo) => {
    // Skip setup for tests that handle their own
    if (testInfo.title.includes('upgrade')) {
      return;
    }

    const unitListPage = new UnitListPage(page);
    await unitListPage.goto();
    await page.getByTestId('refresh-button').click();
  });

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();

    const unitListPage = new UnitListPage(page);
    await unitListPage.createUnitViaAPI({ unitType: deploymentType, slug: name });

    await context.close();
  });

  test('should show an attribute values list: get-provided', async ({ page }) => {
    const unitListPage = new UnitListPage(page);
    const functionName = 'get-provided';

    // Invoke the get-resources function which returns attribute values
    await unitListPage.invokeFunctionByNameWithParameters({
      name: name,
      functionName,
      params: [],
    });

    // Verify attribute value data is displayed (look for common Kubernetes resource fields)
    // todo-app-load-balancer has 3 provided attributes, each with a resource-name field
    await unitListPage.expectToHaveCount('resource-name', 3);
  });

  test('should filter validation results', async ({ page }) => {
    const unitListPage = new UnitListPage(page);
    const functionName = 'vet-cel';

    // The fixture's Deployment has 1 replica, so the unit fails this check.
    await unitListPage.invokeFunctionByNameWithParameters({
      name: name,
      functionName,
      params: [{ name: 'Expression', value: "r.kind != 'Deployment' || r.spec.replicas >= 2" }],
      role: 'textbox',
    });

    // Assert that the validation shows one failed
    await expect(page.getByText('Failed', { exact: true })).toBeVisible();
  });

  // Comment this out for now and find out why it fails
  // test('should update link', async ({ page }) => {
  //   const unitListPage = new UnitListPage(page);

  //   const fromSlug = RandomSlugGenerator.randomSlugName();
  //   const toSlug = RandomSlugGenerator.randomSlugName();
  //   const initialLinkSlug = RandomSlugGenerator.randomSlugName();
  //   const updatedLinkSlug = RandomSlugGenerator.randomSlugName();

  //   // Create units using the test data files
  //   await unitListPage.addUnit('basic-deployment', fromSlug);
  //   await unitListPage.addUnit('namespace', toSlug);

  //   // Both new unit rows should be present before selecting them
  //   await expect(page.getByText(fromSlug)).toBeVisible();
  //   await expect(page.getByText(toSlug)).toBeVisible();

  //   // Select both units
  //   await unitListPage.checkRowByName(fromSlug);
  //   await unitListPage.checkRowByName(toSlug);

  //   // Create initial link
  //   await unitListPage.selectMoreItemsOptionByName('Link');

  //   // Fill in the link name
  //   const createModal = page.getByRole('dialog', { name: 'Link Units' });
  //   await expect(createModal).toBeVisible();
  //   await page.getByRole('textbox', { name: 'Link Name' }).fill(initialLinkSlug);
  //   await page.getByRole('button', { name: 'Add' }).click();

  //   // Wait for link creation to complete (modal closing is the observable signal)
  //   await expect(createModal).not.toBeVisible({ timeout: 5000 });

  //   // Navigate to one of the units to see the links table
  //   // Go back to the units list first
  //   await unitListPage.goto();
  //   await unitListPage.goToUnitDetailPageByRowClick(fromSlug);

  //   // Wait for the unit detail page grid to render
  //   await expect(page.locator('[role="grid"]').first()).toBeVisible();

  //   // Navigate to the Links tab (if there is one) or find the links table
  //   const linksTab = page.getByRole('tab', { name: 'Links' });
  //   if (await linksTab.isVisible({ timeout: 2000 }).catch(() => false)) {
  //     await linksTab.click();
  //     await expect(page.getByRole('row').filter({ hasText: initialLinkSlug })).toBeVisible();
  //   }

  //   // Find the edit icon for our link in the links table
  //   const linkRow = page.getByRole('row').filter({ hasText: initialLinkSlug });
  //   const editIcon = linkRow.locator('[data-testid="ModeEditIcon"]');
  //   await editIcon.click();

  //   // Verify update modal is visible
  //   const updateModal = page.getByRole('dialog', {
  //     name: new RegExp(`Update ${initialLinkSlug}`, 'i'),
  //   });
  //   await expect(updateModal).toBeVisible();

  //   // Update the link name
  //   const linkNameField = updateModal.getByRole('textbox', { name: 'Link Name' });
  //   await linkNameField.clear();
  //   await linkNameField.fill(updatedLinkSlug);

  //   // Submit the update
  //   await updateModal.getByRole('button', { name: 'Update' }).click();

  //   // Verify update was successful
  //   await expect(updateModal).not.toBeVisible({ timeout: 5000 });

  //   // Check for success message
  //   await expect(
  //     page.getByText(`Updated link ${updatedLinkSlug} successfully.`),
  //   ).toBeVisible();

  //   // Verify the updated link name is displayed
  //   await expect(page.getByText(updatedLinkSlug).first()).toBeVisible();

  //   // Verify the old link name is not displayed
  //   await expect(page.getByText(initialLinkSlug, { exact: true })).not.toBeVisible();
  // });
});
