// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { SpaceDetailPage } from './fixtures/space-detail-page';
import { SpaceListPage } from './fixtures/space-list-page';
import { TriggerDetailPage } from './fixtures/trigger-detail-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('trigger detail page', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
  test.use({ storageState: 'authentication.json' });

  test.beforeEach(async ({ page }) => {
    const spaceListPage = new SpaceListPage(page);

    await spaceListPage.goto();
  });

  test('should edit a trigger', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();
    const triggerName = RandomSlugGenerator.randomSlugName();
    const editTriggerName = RandomSlugGenerator.randomSlugName();

    const triggerDetailPage = new TriggerDetailPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);
    const spaceListPage = new SpaceListPage(page);

    await spaceListPage.addSpace(spaceName);
    await spaceListPage.goToSpaceDetailPageByName(spaceName);

    await spaceDetailPage.clickTriggersTab();
    await spaceDetailPage.addValidatedTrigger(triggerName);
    await triggerDetailPage.editTrigger(triggerName, editTriggerName);

    await spaceDetailPage.clickTriggersTab();

    await triggerDetailPage.expectToBeVisibileByText(editTriggerName);
  });

  test.skip('should delete a trigger', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();
    const triggerName = RandomSlugGenerator.randomSlugName();

    const triggerDetailPage = new TriggerDetailPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);
    const spaceListPage = new SpaceListPage(page);

    await spaceListPage.addSpace(spaceName);
    await spaceListPage.goToSpaceDetailPageByName(spaceName);

    await spaceDetailPage.clickTriggersTab();
    await spaceDetailPage.addValidatedTrigger(triggerName);

    await spaceDetailPage.clickTriggersTab();

    await triggerDetailPage.deleteTrigger(triggerName);

    await spaceDetailPage.expectNotToBeVisibleByRole('link', triggerName);
  });

  test('should add delete gates to triggers and prevent deletion', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();
    const triggerName = RandomSlugGenerator.randomSlugName();
    const deleteGate = 'production-protection';

    const triggerDetailPage = new TriggerDetailPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);
    const spaceListPage = new SpaceListPage(page);

    await spaceListPage.addSpace(spaceName);
    await spaceListPage.goToSpaceDetailPageByName(spaceName);

    await spaceDetailPage.clickTriggersTab();
    await spaceDetailPage.addValidatedTrigger(triggerName);

    await spaceDetailPage.clickTriggersTab();

    // Verify trigger exists
    await expect(page.getByRole('row', { name: triggerName })).toBeVisible();

    // Add delete gate to the trigger
    await triggerDetailPage.editTriggerWithDeleteGates({
      triggerName,
      deleteGates: [deleteGate],
    });

    // Attempt to delete the trigger and expect it to fail with delete gate error
    await triggerDetailPage.attemptDeleteTriggerByNameExpectingError(
      triggerName,
      'Error: outstanding DeleteGates',
    );

    // Verify the trigger still exists (wasn't deleted)
    await expect(page.getByRole('row', { name: triggerName })).toBeVisible();
  });
});
