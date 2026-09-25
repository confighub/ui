// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import { test } from './fixtures/test';

import { SpaceDetailPage } from './fixtures/space-detail-page';
import { SpaceListPage } from './fixtures/space-list-page';
import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('space detail page', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
  test.use({ storageState: 'authentication.json' });

  test('should add a space', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();
    const spaceListPage = new SpaceListPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);

    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);

    await spaceDetailPage.expectToBeVisibleByRole('link', spaceName);
  });

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
    test.setTimeout(60000)

    const spaceName = RandomSlugGenerator.randomSlugName();
    const triggerName = RandomSlugGenerator.randomSlugName();
    const spaceListPage = new SpaceListPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);

    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);

    await spaceListPage.goToSpaceDetailPageByName(spaceName);

    await spaceDetailPage.clickTriggersTab();

    await spaceDetailPage.addCelTrigger(triggerName);

    await spaceDetailPage.clickTriggersTab();

    await spaceDetailPage.expectToBeVisibleByText(triggerName);
  });
});
