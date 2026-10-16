// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import { test, expect } from './fixtures/test';

import { SpaceDetailPage } from './fixtures/space-detail-page';
import { SpaceListPage } from './fixtures/space-list-page';
import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('space detail page', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
  test.use({ storageState: 'authentication.json' });

  test('should show an error when trying to delete a space with units', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();
    const spaceListPage = new SpaceListPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);
    const unitListPage = new UnitListPage(page);

    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);

    await unitListPage.goto();
    await unitListPage.createUnitViaAPI({
      unitType: 'crm-app',
      slug: RandomSlugGenerator.randomSlugName(),
      spaceSlug: spaceName,
    });

    await spaceListPage.goto();
    await spaceListPage.goToSpaceDetailPageByName(spaceName);

    await spaceDetailPage.deleteSpace();
    // A Space that still holds anything is refused before anything is deleted, with what it
    // holds: here, the one Unit.
    await spaceDetailPage.expectToBeVisibleByText('Error:');
    await spaceDetailPage.expectToBeVisibleByText(`Cannot delete Space ${spaceName}: it still contains 1 Unit.`);
  });

  test('should display delete a space', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();
    const spaceListPage = new SpaceListPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);

    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);

    await spaceListPage.goToSpaceDetailPageByName(spaceName);
    await spaceDetailPage.deleteSpace();

    await spaceListPage.expectToNotBeVisibleByRole('link', spaceName);
  });

  test('should edit a space', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();
    const spaceListPage = new SpaceListPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);

    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);

    await spaceListPage.goToSpaceDetailPageByName(spaceName);
    await spaceDetailPage.editSpace(spaceName);

    await spaceDetailPage.expectToBeVisibleByLabel('breadcrumb', spaceName);
  });

  test('should add a trigger', async ({ page }) => {
    test.setTimeout(60000);

    const spaceName = RandomSlugGenerator.randomSlugName();
    const triggerName = RandomSlugGenerator.randomSlugName();
    const spaceListPage = new SpaceListPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);

    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);

    await spaceListPage.goToSpaceDetailPageByName(spaceName);

    await spaceDetailPage.clickTriggersTab();

    const createResponse = page.waitForResponse(
      (response) => response.url().includes('/trigger') && response.request().method() === 'POST',
    );
    await spaceDetailPage.addCelTrigger(triggerName);
    expect((await createResponse).ok()).toBe(true);

    // The drawer closes on success; the table then refetches, which can take
    // longer than the default expect timeout under CI load.
    await expect(page.getByRole('button', { name: 'Create Trigger' })).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole('link', { name: triggerName })).toBeVisible({ timeout: 15000 });
  });
});
