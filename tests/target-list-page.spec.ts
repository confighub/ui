// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test } from './fixtures/test';

import { TargetListPage } from './fixtures/target-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('target list page', () => {
  test.use({ storageState: 'authentication.json' });

  test('should add and delete a target', async ({ page }) => {
    const targetName = RandomSlugGenerator.randomSlugName();

    const targetListPage = new TargetListPage(page);

    await targetListPage.goto();
    await targetListPage.addTarget({ targetName });
    await targetListPage.expectToBeVisibleByText(targetName);

    // Narrow the grid to this target so the row click does not miss a
    // virtualized row on an org with many Targets.
    await targetListPage.filterTargets(`Slug = '${targetName}'`);
    await targetListPage.deleteTarget(targetName);
    await targetListPage.expectNotToBeVisibleByText(targetName);
  });
});
