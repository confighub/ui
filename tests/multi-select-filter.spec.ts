// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { test, expect, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * A select filter with two values becomes an `IN` clause in the URL. The URL is
 * the only place the filter survives a reload, so the reload must rebuild the
 * same filter and the grid must show only the Units in the selected Spaces.
 */
test.describe('Multi-select filter (IN operator)', () => {
  const spaceIds: string[] = [];

  test.afterAll(async () => {
    for (const spaceId of spaceIds) {
      await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } }).catch(() => {});
    }
  });

  test('two Space values filter the grid with IN and survive a reload', async ({ page }) => {
    const run = `pw-ms-${RandomSlugGenerator.randomSlugName()}`;
    const api = new ApiHelper(page);

    const spaceSlugs = [`${run}-in-a`, `${run}-in-b`, `${run}-out`];
    const unitSlugs = [`${run}-u1`, `${run}-u2`, `${run}-u3`];
    for (const [i, slug] of spaceSlugs.entries()) {
      const space = await api.createSpace({ space: { Slug: slug } });
      // createSpace throws when the response has no SpaceID.
      const spaceId = space.SpaceID as string;
      spaceIds.push(spaceId);
      await api.createUnit({
        spaceId,
        unit: { Slug: unitSlugs[i], ToolchainType: 'Kubernetes/YAML' },
      });
    }
    const [selectedA, selectedB] = spaceIds;

    // The Space options load with the page, so open it after the Spaces exist.
    const unitListPage = new UnitListPage(page);
    await unitListPage.goto();
    await unitListPage.addVisualBuilderFilter('Space');

    const menu = page.getByTestId('multi-select-menu');
    await menu.getByPlaceholder('Search...').fill(`${run}-in`);
    const optionA = menu.getByRole('menuitem').filter({ hasText: spaceSlugs[0] });
    const optionB = menu.getByRole('menuitem').filter({ hasText: spaceSlugs[1] });
    await optionA.click();
    await optionB.click();
    // Escape from an option closes the menu and keeps the filter; from the
    // search field it would only clear the search text.
    await optionB.press('Escape');
    await expect(menu).toBeHidden();

    const whereParam = () => new URL(page.url()).searchParams.get('filterWhere') ?? '';
    await expect.poll(whereParam).toMatch(/SpaceID IN \(/);
    expect(whereParam()).toContain(selectedA);
    expect(whereParam()).toContain(selectedB);

    await page.reload();

    const spaceChip = page.getByRole('button', { name: /Filter by Space/i }).locator('..');
    await expect(
      spaceChip.locator('button[aria-haspopup="listbox"]:not([aria-label])').first(),
    ).toContainText('is one of');

    const row = (slug: string) => page.getByRole('row').filter({ hasText: slug });
    await expect(row(unitSlugs[0])).toBeVisible();
    await expect(row(unitSlugs[1])).toBeVisible();
    await expect(row(unitSlugs[2])).toBeHidden();
  });
});
