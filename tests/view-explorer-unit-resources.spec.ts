// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The View Explorer drawer shows resources as the resource explorer's Overview or as YAML: for a
 * Unit row, the Unit's resources on its Resources tab, as on the unit detail page; for a Resource
 * row, the resource itself.
 */

const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: web
          image: nginx:1.25
`;

const service = `apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  ports:
    - port: 80
`;

test.describe('view explorer unit resources', () => {
  test.use({ storageState: 'authentication.json' });

  let viewId = '';
  let resourceViewId = '';

  test.beforeEach(async ({ page }) => {
    const api = new ApiHelper(page);
    const space = await api.createSpace({ space: { Slug: RandomSlugGenerator.randomSlugName() } });
    const spaceId = space.SpaceID!;
    const unit = await api.createUnit({
      spaceId,
      unit: { Slug: 'multi', ToolchainType: 'Kubernetes/YAML' },
    });
    await api.uploadUnitData({
      spaceId,
      unitId: unit.UnitID!,
      body: [deployment, service].join('---\n'),
    });

    // A view of the Units of this Space alone, so the table has the one row.
    const filterResponse = await hubApi.post(`/api/space/${spaceId}/filter`, {
      data: { Slug: 'units', From: 'Unit', Where: `SpaceID = '${spaceId}'` },
    });
    expect(filterResponse.ok(), await filterResponse.text()).toBeTruthy();
    const filter = await filterResponse.json();
    const viewResponse = await hubApi.post(`/api/space/${spaceId}/view`, {
      data: { Slug: 'units', FilterID: filter.FilterID, Of: 'Unit', Columns: [{ Name: 'Slug' }] },
    });
    expect(viewResponse.ok(), await viewResponse.text()).toBeTruthy();
    viewId = (await viewResponse.json()).ViewID;

    const resourceFilterResponse = await hubApi.post(`/api/space/${spaceId}/filter`, {
      data: { Slug: 'resources', From: 'Resource', Where: `SpaceID = '${spaceId}'` },
    });
    expect(resourceFilterResponse.ok(), await resourceFilterResponse.text()).toBeTruthy();
    const resourceFilter = await resourceFilterResponse.json();
    const resourceViewResponse = await hubApi.post(`/api/space/${spaceId}/view`, {
      data: {
        Slug: 'resources',
        FilterID: resourceFilter.FilterID,
        Of: 'Resource',
        Columns: [{ Name: 'ResourceType' }, { Name: 'ResourceName' }],
      },
    });
    expect(resourceViewResponse.ok(), await resourceViewResponse.text()).toBeTruthy();
    resourceViewId = (await resourceViewResponse.json()).ViewID;
  });

  test('a Unit row shows its resources as an Overview or as YAML', async ({ page }) => {
    await page.goto(`/x/view-explorer?view=${viewId}`);
    await page.getByText('multi', { exact: true }).first().click();
    await page.getByRole('tab', { name: 'Resources' }).click();

    const tab = page.getByTestId('unit-resources');
    const items = tab.getByRole('list', { name: 'Resources' }).getByRole('button');
    await expect(items).toHaveCount(2, { timeout: 15000 });

    // The first resource, Deployment by kind, as an Overview.
    await expect(tab.getByTestId('unit-resource-name')).toHaveText('web');
    await expect(tab.getByText('nginx:1.25').first()).toBeVisible();

    await tab.getByRole('button', { name: 'YAML' }).click();
    await expect(page.locator('div.monaco-editor')).toContainText('kind: Deployment', {
      timeout: 15000,
    });

    await items.nth(1).click();
    await expect(page.locator('div.monaco-editor')).toContainText('kind: Service', {
      timeout: 15000,
    });
  });

  test('a Resource row shows the resource as an Overview or as YAML', async ({ page }) => {
    await page.goto(`/x/view-explorer?view=${resourceViewId}`);
    await page.getByText('apps/v1/Deployment', { exact: true }).first().click();

    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 15000 },
    );
    await expect(page.getByText('nginx:1.25').first()).toBeVisible({ timeout: 15000 });

    await page.getByRole('tab', { name: 'YAML' }).click();
    await expect(page.locator('div.monaco-editor')).toContainText('kind: Deployment', {
      timeout: 15000,
    });

    // Its columns are the row and the resource, so there is no Details tab.
    await expect(page.getByRole('tab', { name: 'Details' })).toHaveCount(0);

    // Where the resource lives, with its Unit linked to the Unit's Resources tab, opened on it,
    // as is the drawer's own link to the resource's detail page.
    const unitResourcesHref = /^\/units\/[0-9a-f-]{36}\/[0-9a-f-]{36}\?tab=5&resource=[0-9a-f-]{36}$/;
    const context = page.getByTestId('resource-context');
    await expect(context.getByRole('link', { name: 'multi' })).toHaveAttribute(
      'href',
      unitResourcesHref,
    );
    await expect(context).toContainText('Kubernetes/YAML');
    await expect(page.getByRole('link', { name: 'Open full detail page' })).toHaveAttribute(
      'href',
      unitResourcesHref,
    );
  });
});
