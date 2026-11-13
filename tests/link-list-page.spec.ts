// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { LinkRead } from '@confighub/rtk-query';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The organization's Links page (/links): every Link, filtered with the filter builder, added with
 * both of its Units picked, updated in bulk and deleted.
 */

const listLinks = async (spaceId: string): Promise<LinkRead[]> => {
  const response = await hubApi.get(`/api/space/${spaceId}/link`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as Array<{ Link: LinkRead }>).map((row) => row.Link);
};

test.describe('link list page', () => {
  test.use({ storageState: 'authentication.json' });

  let spaceId = '';
  let spaceSlug = '';
  let appId = '';
  let nsId = '';
  let nsSlug = '';
  // The page filtered to the test's Space, through the filter the Space's Links count links with
  let spaceLinksPath = '';

  test.beforeEach(async ({ page }) => {
    const apiHelper = new ApiHelper(page);
    spaceSlug = RandomSlugGenerator.randomSlugName();
    const space = await apiHelper.createSpace({ space: { Slug: spaceSlug } });
    spaceId = space.SpaceID!;
    nsSlug = `ns-${RandomSlugGenerator.randomSlugName()}`;
    const app = await apiHelper.createUnit({ spaceId, unit: { Slug: 'app', ToolchainType: 'Kubernetes/YAML' } });
    const ns = await apiHelper.createUnit({ spaceId, unit: { Slug: nsSlug, ToolchainType: 'Kubernetes/YAML' } });
    appId = app.UnitID!;
    nsId = ns.UnitID!;
    spaceLinksPath = `/links?${new URLSearchParams({ filterWhere: `SpaceID = '${spaceId}'` }).toString()}`;
  });

  test('the filter builder narrows the Links, and Update sets Auto Update on the checked ones', async ({ page }) => {
    const apiHelper = new ApiHelper(page);
    for (const [slug, updateType] of [
      ['merges', 'MergeUnits'],
      ['needs', 'NeedsProvides'],
    ] as const) {
      await apiHelper.createLink({
        spaceId,
        link: { Slug: slug, FromUnitID: appId, ToUnitID: nsId, ToSpaceID: spaceId, UpdateType: updateType, AutoUpdate: false },
      });
    }

    await page.goto(spaceLinksPath);
    await expect(page.getByTestId('link-details-merges')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('link-details-needs')).toBeVisible();
    // The Space filter reads back from the URL as a block naming the Space.
    await expect(page.locator('[data-filter-chip]').first()).toContainText(spaceSlug);

    // Update Type is a filter of the builder.
    await page.getByRole('button', { name: 'Add filter' }).click();
    await page.locator('[role="menuitem"][data-field="updateType"]').click();
    await page.getByRole('menuitem', { name: 'MergeUnits' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('link-details-needs')).toHaveCount(0);
    await expect(page.getByTestId('link-details-merges')).toBeVisible();

    await page.getByRole('row', { name: /merges/ }).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await page.getByTestId('bulk-link-auto-update').getByRole('button', { name: 'On', exact: true }).click();
    await page.getByRole('button', { name: 'Update Links', exact: true }).click();

    await expect
      .poll(async () => Object.fromEntries((await listLinks(spaceId)).map((link) => [link.Slug, link.AutoUpdate])))
      .toEqual({ merges: true, needs: false });
  });

  test('a read the server refuses is shown as an error, not as no Links', async ({ page }) => {
    await page.goto(`/links?${new URLSearchParams({ filterWhere: "NoSuchAttribute = 'x'" }).toString()}`);
    await expect(page.getByTestId('links-read-error')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/No matching links/i)).toHaveCount(0);
  });

  test('Add creates a Link between two Units picked by name, and Delete deletes the checked one', async ({ page }) => {
    await page.goto(spaceLinksPath);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByTestId('link-drawer');
    await drawer.getByTestId('link-from-unit').getByRole('combobox').fill('app');
    await page.getByRole('option', { name: `${spaceSlug}/app`, exact: true }).click();
    await drawer.getByTestId('link-to-unit').getByRole('combobox').fill(nsSlug);
    await page.getByRole('option', { name: `${spaceSlug}/${nsSlug}`, exact: true }).click();
    await drawer.getByRole('combobox', { name: 'Update type' }).click();
    await page.getByRole('option', { name: 'None', exact: true }).click();
    await drawer.getByTestId('link-slug').fill('app-to-ns');
    await drawer.getByTestId('link-save').click();
    await expect(drawer).toBeHidden();

    await expect
      .poll(async () => (await listLinks(spaceId)).map((link) => ({ Slug: link.Slug, FromUnitID: link.FromUnitID, ToUnitID: link.ToUnitID })))
      .toEqual([{ Slug: 'app-to-ns', FromUnitID: appId, ToUnitID: nsId }]);
    await expect(page.getByTestId('link-details-app-to-ns')).toBeVisible();

    await page.getByRole('row', { name: /app-to-ns/ }).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => (await listLinks(spaceId)).length).toBe(0);
    await expect(page.getByTestId('link-details-app-to-ns')).toHaveCount(0);
  });
});
