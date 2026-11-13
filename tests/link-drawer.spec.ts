// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { LinkRead } from '@confighub/rtk-query';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The Link drawer on a Unit's Links tab: it shows a Link and edits the fields of its type, such
 * as the guards it records and the clearance it writes with, and it creates Links.
 */

const LINKS_TAB = 3;

const getLink = async (spaceId: string, linkId: string): Promise<LinkRead> => {
  const response = await hubApi.get(`/api/space/${spaceId}/link/${linkId}`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { Link: LinkRead }).Link;
};

const listLinks = async (spaceId: string): Promise<LinkRead[]> => {
  const response = await hubApi.get(`/api/space/${spaceId}/link`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as Array<{ Link: LinkRead }>).map((row) => row.Link);
};

test.describe('link drawer', () => {
  test.use({ storageState: 'authentication.json' });

  let spaceId = '';
  let spaceSlug = '';
  let appId = '';
  let nsId = '';
  let nsSlug = '';

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
  });

  test('a Link is given guards and the clearance to write over them', async ({ page }) => {
    const apiHelper = new ApiHelper(page);
    const created = await apiHelper.createLink({
      spaceId,
      link: {
        Slug: 'app-to-ns',
        FromUnitID: appId,
        ToUnitID: nsId,
        ToSpaceID: spaceId,
        UpdateType: 'NeedsProvides',
        AutoUpdate: false,
      },
    });
    const linkId = created.LinkID!;

    await page.goto(`/units/${spaceId}/${appId}?tab=${LINKS_TAB}`);
    await page.getByTestId('link-details-app-to-ns').click();
    const drawer = page.getByTestId('link-drawer');
    await expect(drawer.getByRole('heading', { name: 'app-to-ns', exact: true })).toBeVisible();
    await expect(drawer.getByText('NeedsProvides', { exact: true })).toBeVisible();

    // A guard the Link is not cleared for would withhold its own next write, so the form says so
    // and offers the clearance that covers it. Saved as it is, the server refuses it.
    await drawer.getByTestId('link-guards-add').click();
    await drawer.getByTestId('link-guards-key-0').fill('owner');
    await drawer.getByTestId('link-guards-value-0').fill('ns-link');
    await expect(drawer.getByTestId('link-guards-not-cleared')).toContainText('owner=ns-link');
    await drawer.getByTestId('link-save').click();
    await expect(drawer).toContainText('which the clearance does not cover');
    await drawer.getByTestId('link-clear-guards').click();
    await expect(drawer.getByTestId('link-guards-not-cleared')).toHaveCount(0);
    await expect(drawer.getByTestId('link-clearance-key-0')).toHaveValue('owner');
    await expect(drawer.getByTestId('link-clearance-values-0')).toHaveValue('ns-link');

    await drawer.getByTestId('link-protect').getByRole('checkbox').check();
    await drawer.getByTestId('link-save').click();
    await expect(drawer).toBeHidden();

    await expect
      .poll(async () => {
        const link = await getLink(spaceId, linkId);
        return { Guards: link.Guards, Clearance: link.Clearance, Protect: link.Protect, AutoUpdate: link.AutoUpdate };
      })
      .toEqual({
        Guards: { owner: 'ns-link' },
        Clearance: [{ Key: 'owner', Operator: 'In', Values: ['ns-link'] }],
        Protect: true,
        AutoUpdate: false,
      });

    // Opened again, the drawer shows what was saved.
    await page.getByTestId('link-details-app-to-ns').click();
    await expect(drawer.getByTestId('link-guards-key-0')).toHaveValue('owner');
    await expect(drawer.getByTestId('link-clearance-operator-0')).toContainText('In');
  });

  test('a merge Link is offered its merge settings and not guards', async ({ page }) => {
    const apiHelper = new ApiHelper(page);
    await apiHelper.createLink({
      spaceId,
      link: {
        Slug: 'app-merges-ns',
        FromUnitID: appId,
        ToUnitID: nsId,
        ToSpaceID: spaceId,
        UpdateType: 'MergeUnits',
        AutoUpdate: false,
      },
    });
    await page.goto(`/units/${spaceId}/${appId}?tab=${LINKS_TAB}`);
    await page.getByTestId('link-details-app-merges-ns').click();
    const drawer = page.getByTestId('link-drawer');
    await expect(drawer.getByTestId('link-where-mutation')).toBeVisible();
    await expect(drawer.getByTestId('link-squash')).toBeVisible();
    await expect(drawer.getByTestId('link-guards-add')).toHaveCount(0);
    await expect(drawer.getByTestId('link-clearance-add')).toBeVisible();
  });

  test('Make current moves the merged revisions to the Units\' heads', async ({ page }) => {
    const apiHelper = new ApiHelper(page);
    const created = await apiHelper.createLink({
      spaceId,
      link: {
        Slug: 'app-merges-ns',
        FromUnitID: appId,
        ToUnitID: nsId,
        ToSpaceID: spaceId,
        UpdateType: 'MergeUnits',
        AutoUpdate: false,
      },
    });
    const linkId = created.LinkID!;
    // A new revision of the upstream Unit that the Link has not merged.
    await apiHelper.uploadUnitData({
      spaceId,
      unitId: nsId,
      body: 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ns\n',
    });
    const unitHead = async (unitId: string) => {
      const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
      return ((await response.json()) as { Unit: { HeadRevisionNum: number } }).Unit.HeadRevisionNum;
    };
    const upstreamHead = await unitHead(nsId);
    const downstreamHead = await unitHead(appId);
    expect((await getLink(spaceId, linkId)).UpstreamLastMergedRevisionNum ?? 0).toBeLessThan(upstreamHead);

    await page.goto(`/units/${spaceId}/${appId}?tab=${LINKS_TAB}`);
    await page.getByTestId('link-details-app-merges-ns').click();
    const drawer = page.getByTestId('link-drawer');
    await drawer.getByTestId('link-make-current').click();
    const dialog = page.getByTestId('link-make-current-dialog');
    await expect(dialog.getByTestId('link-make-current-revisions')).toContainText(String(upstreamHead));
    await expect(dialog.getByTestId('link-make-current-skips')).toBeVisible();
    await dialog.getByTestId('link-make-current-confirm').click();
    await expect(dialog).toBeHidden();

    await expect
      .poll(async () => {
        const link = await getLink(spaceId, linkId);
        return [link.UpstreamLastMergedRevisionNum, link.DownstreamLastMergedRevisionNum];
      })
      .toEqual([upstreamHead, downstreamHead]);
    await expect(drawer.getByText('Upstream last merged revision').locator('..')).toContainText(String(upstreamHead));
  });

  test('checked Links are deleted with Delete', async ({ page }) => {
    const apiHelper = new ApiHelper(page);
    for (const [slug, updateType] of [
      ['first-link', 'MergeUnits'],
      ['second-link', 'UpgradeUnit'],
    ] as const) {
      await apiHelper.createLink({
        spaceId,
        link: { Slug: slug, FromUnitID: appId, ToUnitID: nsId, ToSpaceID: spaceId, UpdateType: updateType, AutoUpdate: false },
      });
    }
    await page.goto(`/units/${spaceId}/${appId}?tab=${LINKS_TAB}`);
    // The Delete button is shown only once the Links have loaded, which can take longer than an
    // assertion waits by default.
    await expect(page.getByRole('row', { name: /first-link/ })).toBeVisible({ timeout: 20000 });
    const deleteButton = page.getByTestId('links-delete').getByRole('button');
    await expect(deleteButton).toBeDisabled();

    await page.getByRole('row', { name: /first-link/ }).getByRole('checkbox').check();
    await expect(deleteButton).toHaveText('Delete Link');
    await deleteButton.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

    await expect.poll(async () => (await listLinks(spaceId)).map((link) => link.Slug)).toEqual(['second-link']);
    await expect(page.getByTestId('link-details-first-link')).toHaveCount(0);
    await expect(page.getByTestId('link-details-second-link')).toBeVisible();
    await expect(deleteButton).toBeDisabled();
  });

  test('a Link is created from the Links tab to a Unit picked by name', async ({ page }) => {
    await page.goto(`/units/${spaceId}/${appId}?tab=${LINKS_TAB}`);
    await page.getByTestId('links-add-link').click();
    const drawer = page.getByTestId('link-drawer');
    await expect(drawer.getByRole('heading', { name: 'New Link', exact: true })).toBeVisible();

    await drawer.getByTestId('link-to-unit').getByRole('combobox').fill(nsSlug);
    await page.getByRole('option', { name: `${spaceSlug}/${nsSlug}`, exact: true }).click();
    await drawer.getByRole('combobox', { name: 'Update type' }).click();
    await page.getByRole('option', { name: 'None', exact: true }).click();
    // A Link of type None resolves nothing, so it has no resolution or writes to set.
    await expect(drawer.getByTestId('link-auto-update')).toHaveCount(0);
    await drawer.getByTestId('link-slug').fill('app-needs-ns');
    await drawer.getByTestId('link-save').click();
    await expect(drawer).toBeHidden();

    await expect
      .poll(async () =>
        (await listLinks(spaceId)).map((link) => ({
          Slug: link.Slug,
          FromUnitID: link.FromUnitID,
          ToUnitID: link.ToUnitID,
          UpdateType: link.UpdateType,
        })),
      )
      .toEqual([{ Slug: 'app-needs-ns', FromUnitID: appId, ToUnitID: nsId, UpdateType: 'None' }]);
    await expect(page.getByTestId('link-details-app-needs-ns')).toBeVisible();
  });
});
