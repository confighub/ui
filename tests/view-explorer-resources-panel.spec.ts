// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { expectOverlaysGone, openExplorer } from './fixtures/view-explorer-seed';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The row panel's Resources tab: one bar names the resource on show and steps
 * through the rest (‹ ›, ← →, a dropdown grouped by kind), and the resource
 * itself gets the rest of the panel.
 */

const doc = (kind: string, apiVersion: string, name: string, namespace?: string, extra = '') =>
  `apiVersion: ${apiVersion}
kind: ${kind}
metadata:
  name: ${name}${namespace ? `\n  namespace: ${namespace}` : ''}
${extra}`;

const deployment = (name: string) =>
  doc('Deployment', 'apps/v1', name, 'shop', `spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: ${name}
          image: nginx:1.25
`);

/** Eleven resources of five kinds: the dropdown gets its search box past eight. */
const MANY = [
  deployment('api'),
  deployment('web'),
  doc('Service', 'v1', 'api', 'shop', 'spec:\n  ports:\n    - port: 80\n'),
  doc('Service', 'v1', 'web', 'shop', 'spec:\n  ports:\n    - port: 80\n'),
  doc('ConfigMap', 'v1', 'api-config', 'shop', 'data:\n  a: "1"\n'),
  doc('ConfigMap', 'v1', 'web-config', 'shop', 'data:\n  b: "2"\n'),
  doc('ConfigMap', 'v1', 'flags', 'shop', 'data:\n  c: "3"\n'),
  doc('ServiceAccount', 'v1', 'api', 'shop'),
  doc('ServiceAccount', 'v1', 'web', 'shop'),
  doc('Ingress', 'networking.k8s.io/v1', 'web', 'shop', 'spec:\n  rules:\n    - host: shop.example.com\n'),
  doc('Ingress', 'networking.k8s.io/v1', 'api', 'shop', 'spec:\n  rules:\n    - host: api.example.com\n'),
].join('---\n');

const PAIR = [deployment('solo'), doc('Service', 'v1', 'solo', 'shop', 'spec:\n  ports:\n    - port: 80\n')].join('---\n');

const panel = (page: Page) => page.getByTestId('vx-row-panel');
const position = (page: Page) => page.getByTestId('vx-resource-position');
const resourceName = (page: Page) => page.getByTestId('vx-resource-bar').getByTestId('unit-resource-name');

async function openResources(page: Page, unit: string, count: number) {
  await page.getByTestId('vx-row').filter({ hasText: unit }).locator('[data-column="Slug"]').click();
  const tab = panel(page).getByRole('tab', { name: `Resources (${count})` });
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  await expect(position(page)).toHaveText(`1 of ${count}`, { timeout: 15_000 });
}

test.describe('view explorer row panel resources', () => {
  test.use({ storageState: 'authentication.json', viewport: { width: 1280, height: 800 } });

  let spaceId = '';
  let viewId = '';
  let problems: string[];
  /** Set by a test that opens the YAML editor: see `isMonacoDevLoaderError`. */
  let opensEditor = false;

  /**
   * Monaco's loader throws these in the Vite dev server the first time an editor loads, on
   * every page that shows YAML (the untouched Resource-row YAML view does too): errors whose
   * stack is in monaco-editor or its path-browserify shim, and the stackless window ErrorEvent
   * raised with them. They are accepted only in a test that opens the editor.
   */
  const isMonacoDevLoaderError = (e: Error) =>
    /monaco|vs\/loader|@monaco-editor|path-browserify/.test(e.stack ?? '') || (e.message === 'ErrorEvent' && !e.stack);

  test.beforeEach(async ({ page }) => {
    problems = [];
    opensEditor = false;
    page.on('pageerror', (e) => {
      if (!(opensEditor && isMonacoDevLoaderError(e))) problems.push(`pageerror: ${e.message}`);
    });
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    const api = new ApiHelper(page);
    const space = await api.createSpace({ space: { Slug: `vx-res-${RandomSlugGenerator.randomSlugName()}` } });
    spaceId = space.SpaceID!;
    for (const [slug, body, toolchain] of [
      ['many', MANY, 'Kubernetes/YAML'],
      ['pair', PAIR, 'Kubernetes/YAML'],
      ['settings', 'checkout.timeout=30\ncheckout.retries=3\n', 'AppConfig/Properties'],
    ] as const) {
      const unit = await api.createUnit({ spaceId, unit: { Slug: slug, ToolchainType: toolchain } });
      await api.uploadUnitData({ spaceId, unitId: unit.UnitID!, body });
    }
    const filter = await hubApi.post(`/api/space/${spaceId}/filter`, { data: { Slug: 'units', From: 'Unit', Where: `SpaceID = '${spaceId}'` } });
    expect(filter.ok(), await filter.text()).toBeTruthy();
    const view = await hubApi.post(`/api/space/${spaceId}/view`, {
      data: { Slug: 'units', DisplayName: `Resources ${RandomSlugGenerator.randomSlugName()}`, FilterID: (await filter.json()).FilterID, Of: 'Unit', Columns: [{ Name: 'Slug' }] },
    });
    expect(view.ok(), await view.text()).toBeTruthy();
    viewId = (await view.json()).ViewID;
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(page.getByTestId('vx-row')).toHaveCount(3);
  });

  test.afterEach(async () => {
    for (const kind of ['view', 'filter', 'unit'] as const) {
      const list = await hubApi.get(`/api/space/${spaceId}/${kind}`);
      if (!list.ok()) continue;
      for (const item of (await list.json()) as Array<Record<string, Record<string, string>>>) {
        const entity = item[kind === 'view' ? 'View' : kind === 'filter' ? 'Filter' : 'Unit'];
        const id = entity?.[kind === 'view' ? 'ViewID' : kind === 'filter' ? 'FilterID' : 'UnitID'];
        if (id) await hubApi.delete(`/api/space/${spaceId}/${kind}/${id}`);
      }
    }
    await hubApi.delete(`/api/space/${spaceId}`);
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('the bar steps through the resources; the detail has the panel', async ({ page }) => {
    await openResources(page, 'many', 11);
    // By kind, then name: ConfigMap api-config comes first; line 2 has its apiVersion only.
    await expect(resourceName(page)).toHaveText('api-config');
    await expect(page.getByTestId('vx-resource-version')).toHaveText('v1');

    await page.getByTestId('vx-resource-next').click();
    await expect(position(page)).toHaveText('2 of 11');
    // The arrow keys step while the bar has focus (the › button has it now).
    await page.keyboard.press('ArrowRight');
    await expect(position(page)).toHaveText('3 of 11');
    await page.keyboard.press('ArrowLeft');
    await expect(position(page)).toHaveText('2 of 11');
    await page.getByTestId('vx-resource-prev').click();
    await page.getByTestId('vx-resource-prev').click();
    await expect(position(page)).toHaveText('11 of 11');

    // The resource is the panel's main area, not a strip under a list.
    const detail = (await page.getByTestId('vx-resource-detail').boundingBox())!;
    const box = (await panel(page).boundingBox())!;
    expect(detail.height).toBeGreaterThan(box.height * 0.6);

    // Its labels are in the panel's type, not tiny capitals.
    await page.getByTestId('vx-resource-next').click();
    await expect(position(page)).toHaveText('1 of 11');
    const sectionTitle = page.getByTestId('vx-resource-detail').locator('.MuiTypography-overline').first();
    await expect(sectionTitle).toHaveCSS('text-transform', 'none');

    opensEditor = true;
    await page.getByRole('button', { name: 'YAML' }).click();
    await expect(page.locator('div.monaco-editor')).toContainText('kind: ConfigMap', { timeout: 15_000 });
  });

  test('the dropdown lists the resources by kind, filters, and closes cleanly', async ({ page }) => {
    await openResources(page, 'many', 11);
    await page.getByTestId('vx-resource-picker').click();
    const menu = page.getByTestId('vx-resource-menu');
    const headers = await menu.locator('.MuiListSubheader-root').allInnerTexts();
    expect(headers.map((h) => h.replace(/\s+/g, ' ').trim())).toEqual(['ConfigMap 3', 'Deployment 2', 'Ingress 2', 'Service 2', 'ServiceAccount 2']);

    await page.getByRole('textbox', { name: 'Find a resource' }).fill('ingress');
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expectOverlaysGone(page);
    await expect(resourceName(page)).toHaveText('web');
    await expect(page.getByTestId('vx-resource-bar')).toContainText('Ingress');
  });

  test('the selection stays with its row while the panel is open, and a new row starts at its first resource', async ({ page }) => {
    // Bodies are fetched once for a row, not again on each return to the tab.
    const bodyFetches: string[] = [];
    page.on('request', (req) => {
      if (/\/api\/resource\?/.test(req.url()) && req.url().includes('raw_data=true')) bodyFetches.push(req.url());
    });
    await openResources(page, 'many', 11);
    await page.getByTestId('vx-resource-next').click();
    await page.getByTestId('vx-resource-next').click();
    await expect(position(page)).toHaveText('3 of 11');

    // Away to Details and back: still the third.
    await panel(page).getByRole('tab', { name: 'Details' }).click();
    await panel(page).getByRole('tab', { name: 'Resources (11)' }).click();
    await expect(position(page)).toHaveText('3 of 11');
    expect(bodyFetches).toHaveLength(1);

    // Another row starts at its first resource, and so does this one when it is opened again.
    await openResources(page, 'pair', 2);
    await openResources(page, 'many', 11);
    await expect(resourceName(page)).toHaveText('api-config');
  });

  test('non-Kubernetes data is named after its Unit and format, never NoName', async ({ page }) => {
    await page.getByTestId('vx-row').filter({ hasText: 'settings' }).locator('[data-column="Slug"]').click();
    await panel(page).getByRole('tab', { name: 'Resources (1)' }).click();
    const bar = page.getByTestId('vx-resource-bar');
    await expect(bar).toContainText('settings · Properties');
    await expect(page.getByTestId('vx-resource-version')).toHaveText('AppConfig/Properties');
    await expect(bar).not.toContainText('NoName');
    await expect(bar).not.toContainText('NoSchema');
    // One resource: no steps, no dropdown.
    await expect(page.getByTestId('vx-resource-next')).toHaveCount(0);
    await expect(page.getByTestId('vx-resource-position')).toHaveCount(0);
  });

  test('a Unit with no resources says so calmly', async ({ page }) => {
    await page.route(/\/api\/resource(\?|$)/, (route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : route.continue(),
    );
    await page.getByTestId('vx-row').filter({ hasText: 'many' }).locator('[data-column="Slug"]').click();
    await panel(page).getByRole('tab', { name: 'Resources (0)' }).click();
    await expect(page.getByTestId('vx-resources-empty')).toContainText('No resources');
    await expect(page.getByTestId('vx-resource-bar')).toHaveCount(0);
  });

  test('a resource list that cannot be read shows no count, and says so', async ({ page }) => {
    await page.route(/\/api\/resource(\?|$)/, (route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"Message":"boom"}' }) : route.continue(),
    );
    // The failed requests are the point of this test; the console reports them.
    page.on('console', () => undefined);
    await page.getByTestId('vx-row').filter({ hasText: 'many' }).locator('[data-column="Slug"]').click();
    const tab = panel(page).getByRole('tab', { name: 'Resources', exact: true });
    await expect(tab).toBeVisible({ timeout: 15_000 });
    await tab.click();
    await expect(panel(page).getByRole('alert')).toContainText('resources');
    await expect(panel(page).getByRole('tab', { name: /Resources \(/ })).toHaveCount(0);
    problems = problems.filter((p) => !/500|Failed to load resource/.test(p));
  });
});
