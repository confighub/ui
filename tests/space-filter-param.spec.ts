// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ApiHelper } from './fixtures/api-helper';
import { expect, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The list pages a Space's counts link to keep their Space filter in the URL (`?space=<slug>`):
 * a link opens them filtered to the Space, and choosing every Space takes it out again.
 */
test.describe('space filter in the URL', () => {
  test.use({ storageState: 'authentication.json' });

  let spaceSlug = '';

  test.beforeEach(async ({ page }) => {
    spaceSlug = RandomSlugGenerator.randomSlugName();
    await new ApiHelper(page).createSpace({ space: { Slug: spaceSlug } });
  });

  for (const path of ['/change-orders', '/change-sets', '/channels', '/change-workflows']) {
    test(`${path} opens filtered to the Space in its URL`, async ({ page }) => {
      await page.goto(`${path}?space=${spaceSlug}`);
      // The new Space holds none of them, and the select still names it.
      const select = page.getByLabel('Space', { exact: true });
      await expect(select).toHaveValue(spaceSlug, { timeout: 20000 });

      await select.selectOption({ index: 0 });
      await expect.poll(() => new URL(page.url()).searchParams.has('space')).toBe(false);
    });
  }

  test('/releases lists the Releases of the Space in its URL', async ({ page }) => {
    await page.goto(`/releases?space=${spaceSlug}`);
    const releases = page.getByTestId('component-releases');
    await expect(releases.getByRole('heading', { name: spaceSlug })).toBeVisible({ timeout: 20000 });
    await expect(releases).toContainText('0 Releases in the last 30 days');
  });
});
