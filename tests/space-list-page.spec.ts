// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { SpaceListPage } from './fixtures/space-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('space list page', () => {
  test.use({ storageState: 'authentication.json' });

  test('should add a space and navigate to its detail page', async ({ page }) => {
    const spaceName = RandomSlugGenerator.randomSlugName();

    const spaceListPage = new SpaceListPage(page);

    await spaceListPage.goto();
    await spaceListPage.addSpace(spaceName);
    await spaceListPage.getRowByName(spaceName);

    await spaceListPage.goToSpaceDetailPageByName(spaceName);

    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(spaceName);
  });
});
