// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test } from './fixtures/test';

import { SpaceDetailPage } from './fixtures/space-detail-page';
import { SpaceListPage } from './fixtures/space-list-page';
import { TriggerDetailPage } from './fixtures/trigger-detail-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('trigger detail page', () => {
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
});
