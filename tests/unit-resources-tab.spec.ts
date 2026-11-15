// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ApiHelper } from './fixtures/api-helper';
import { expect, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The unit detail page's Resources tab: the resources in the Unit's configuration, each shown
 * as the resource explorer's Overview or as YAML, with the selection and the view in the URL.
 */

const RESOURCES_TAB = 5;

const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
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
  selector:
    app: web
  ports:
    - port: 80
`;

const configMap = (name: string) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
data:
  greeting: hello
`;

// The record ConfigHub's installer keeps of an install: AppConfig/YAML, not Kubernetes, with an
// Overview of its own.
const installerRecord = `configHub:
  configSchema: InstallerRecord
  configName: installer
package:
  name: web-app
  installerMetadata:
    version: 1.2.0
  spec:
    bases:
    - name: default
      path: bases/default
      default: true
    components:
    - name: ingress
      path: components/ingress
      description: |
        Serve the app at the hostname.
    - name: metrics
      path: components/metrics
    inputs:
    - name: hostname
      type: string
      default: ""
    - name: region
      type: string
      default: us-east-1
selection:
  base: default
  components:
  - ingress
inputs:
  namespace: web
  values:
    hostname: web.example.com
    region: us-west-2
source:
  ref: oci://ghcr.io/example/packages/web-app:1.2.0
`;

const appSettings = `configHub:
  configSchema: AppSettings
  configName: settings
greeting: hello
`;

test.describe('unit resources tab', () => {
  test.use({ storageState: 'authentication.json' });

  let spaceId = '';
  let multiId = '';
  let singleId = '';

  test.beforeEach(async ({ page }) => {
    const api = new ApiHelper(page);
    const space = await api.createSpace({ space: { Slug: RandomSlugGenerator.randomSlugName() } });
    spaceId = space.SpaceID!;

    const multi = await api.createUnit({
      spaceId,
      unit: { Slug: 'multi', ToolchainType: 'Kubernetes/YAML' },
    });
    multiId = multi.UnitID!;
    await api.uploadUnitData({
      spaceId,
      unitId: multiId,
      body: [deployment, service, configMap('settings')].join('---\n'),
    });

    const single = await api.createUnit({
      spaceId,
      unit: { Slug: 'single', ToolchainType: 'Kubernetes/YAML' },
    });
    singleId = single.UnitID!;
    await api.uploadUnitData({ spaceId, unitId: singleId, body: configMap('only') });
  });

  test('lists the resources and shows the selected one as an Overview or as YAML', async ({
    page,
  }) => {
    await page.goto(`/units/${spaceId}/${multiId}?tab=${RESOURCES_TAB}`);

    const tab = page.getByTestId('unit-resources');
    const list = tab.getByRole('list', { name: 'Resources' });
    const items = list.getByRole('button');
    await expect(items).toHaveCount(3, { timeout: 15000 });
    // Sorted by kind.
    await expect(items.nth(0)).toContainText('ConfigMap');
    await expect(items.nth(1)).toContainText('Deployment');
    await expect(items.nth(2)).toContainText('Service');

    // The first resource is shown, as an Overview.
    const name = page.getByTestId('unit-resource-name');
    await expect(name).toHaveText('settings');
    await expect(tab.getByRole('button', { name: 'Overview' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('greeting', { exact: true })).toBeVisible();

    await items.nth(1).click();
    await expect(name).toHaveText('web');
    await expect(page.getByText('Containers', { exact: true })).toBeVisible();
    await expect(page.getByText('nginx:1.25').first()).toBeVisible();
    await expect(page).toHaveURL(/[?&]resource=[0-9a-f-]{36}/);

    await tab.getByRole('button', { name: 'YAML' }).click();
    const editor = page.locator('div.monaco-editor');
    await expect(editor).toContainText('kind: Deployment', { timeout: 15000 });
    await expect(page).toHaveURL(/[?&]resourceView=yaml/);

    // The URL is enough to come back to the same resource and view.
    await page.reload();
    await expect(name).toHaveText('web', { timeout: 15000 });
    await expect(page.locator('div.monaco-editor')).toContainText('kind: Deployment', {
      timeout: 15000,
    });

    // The view stays YAML from one resource to the next.
    await items.nth(2).click();
    await expect(page.locator('div.monaco-editor')).toContainText('kind: Service', {
      timeout: 15000,
    });
  });

  test('a Unit with one resource shows it without a list', async ({ page }) => {
    await page.goto(`/units/${spaceId}/${singleId}?tab=${RESOURCES_TAB}`);

    await expect(page.getByTestId('unit-resource-name')).toHaveText('only', { timeout: 15000 });
    await expect(page.getByText('greeting', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Resources' })).toHaveCount(0);
  });

  test('the list follows a change to the configuration', async ({ page }) => {
    await page.goto(`/units/${spaceId}/${singleId}?tab=${RESOURCES_TAB}`);
    await expect(page.getByTestId('unit-resource-name')).toHaveText('only', { timeout: 15000 });

    const api = new ApiHelper(page);
    await api.uploadUnitData({
      spaceId,
      unitId: singleId,
      body: [configMap('only'), configMap('another')].join('---\n'),
    });
    await page.getByTestId('refresh-button').click();

    const items = page.getByRole('list', { name: 'Resources' }).getByRole('button');
    await expect(items).toHaveCount(2, { timeout: 15000 });
    await expect(items.nth(0)).toContainText('another');
  });

  test('an installer record has an Overview; other AppConfig is shown as YAML', async ({
    page,
  }) => {
    const api = new ApiHelper(page);
    const record = await api.createUnit({
      spaceId,
      unit: { Slug: 'installer', ToolchainType: 'AppConfig/YAML' },
    });
    await api.uploadUnitData({ spaceId, unitId: record.UnitID!, body: installerRecord });
    const settings = await api.createUnit({
      spaceId,
      unit: { Slug: 'settings', ToolchainType: 'AppConfig/YAML' },
    });
    await api.uploadUnitData({ spaceId, unitId: settings.UnitID!, body: appSettings });

    await page.goto(`/units/${spaceId}/${record.UnitID}?tab=${RESOURCES_TAB}`);
    const tab = page.getByTestId('unit-resources');
    await expect(tab.getByRole('button', { name: 'Overview' })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 15000 },
    );
    await expect(tab.getByText('Installed Package', { exact: true })).toBeVisible();
    await expect(tab.getByText('oci://ghcr.io/example/packages/web-app:1.2.0')).toBeVisible();
    // Every package component, with the selected one marked.
    const ingress = tab.getByRole('row').filter({ hasText: 'ingress' });
    await expect(ingress).toContainText('yes');
    await expect(ingress).toContainText('Serve the app at the hostname.');
    await expect(tab.getByRole('row').filter({ hasText: 'metrics' })).not.toContainText('yes');
    // Each input's answer beside its default.
    const region = tab.getByRole('row').filter({ hasText: 'region' });
    await expect(region).toContainText('us-west-2');
    await expect(region).toContainText('us-east-1');
    // A record has no Kubernetes metadata to show.
    await expect(tab.getByText('Metadata', { exact: true })).toHaveCount(0);

    await page.goto(`/units/${spaceId}/${settings.UnitID}?tab=${RESOURCES_TAB}`);
    await expect(page.locator('div.monaco-editor')).toContainText('greeting: hello', {
      timeout: 15000,
    });
    await expect(tab.getByRole('button', { name: 'Overview' })).toHaveCount(0);
  });
});
