// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Component pane: the Overview view and the variant summary
//
// The pane's third view shows each resource of a unit the way the resource
// explorer and the Unit's Resources tab do, and the deployment selectors' line
// under a variant counts its resources beside its units.
//
// Fixture: a dev Space with one unit holding a Deployment and a Service,
// cloned into a prod Space, so the prod node has another deployment to compare
// to and the selectors show.
// ============================================================================

const APP_LABEL = `e2e-overview-${RandomSlugGenerator.randomSlugName()}`;
const IMAGE = 'nginx:1.27.0';

const YAML = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: overview-web',
  'spec:',
  '  replicas: 2',
  '  template:',
  '    spec:',
  '      containers:',
  '      - name: web',
  `        image: ${IMAGE}`,
  '---',
  'apiVersion: v1',
  'kind: Service',
  'metadata:',
  '  name: overview-web',
  'spec:',
  '  ports:',
  '  - port: 80',
].join('\n');

async function openNode(page: Page, slug: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  const node = page.locator('.react-flow__node').filter({ hasText: slug });
  await expect(node).toBeVisible({ timeout: 20000 });
  await node.click();
}

test.describe('component pane Overview view', () => {
  test.use({ storageState: 'authentication.json' });

  const devSlug = `e2e-dev-${RandomSlugGenerator.randomSlugName()}`;
  const prodSlug = `e2e-prod-${RandomSlugGenerator.randomSlugName()}`;

  let devSpaceId: string;
  let prodSpaceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);
    const componentId = (await api.createComponent(APP_LABEL)).ComponentID;

    devSpaceId = ((await api.createSpace({
      space: { Slug: devSlug, ComponentID: componentId, Labels: { Owner: 'E2E', Environment: 'dev' } },
    })) as { SpaceID: string }).SpaceID;
    prodSpaceId = ((await api.createSpace({
      space: { Slug: prodSlug, ComponentID: componentId, Labels: { Owner: 'E2E', Environment: 'prod' } },
    })) as { SpaceID: string }).SpaceID;

    const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
      data: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
    const devUnitId = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitId, body: YAML });

    const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
      params: { upstream_space_id: devSpaceId, upstream_unit_id: devUnitId },
      data: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);
    try { await api.deleteSpace(prodSpaceId, true); } catch { /* ignore */ }
    try { await api.deleteSpace(devSpaceId, true); } catch { /* ignore */ }
    await context.close();
  });

  test('the variant summary counts resources beside units', async ({ page }) => {
    await openNode(page, prodSlug);
    await expect(page.getByTestId('compare-selector-meta-a')).toHaveText('1 unit · 2 resources', { timeout: 15000 });
  });

  test('Overview shows each resource in its friendly view, without search', async ({ page }) => {
    await openNode(page, prodSlug);
    await expect(page.getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 15000 });

    await page.getByTestId('component-search').locator('input').fill('replicas');
    await page.getByTestId('component-view-overview').click();

    // The search is cleared and disabled, and the tree gives way to the resources.
    const search = page.getByTestId('component-search').locator('input');
    await expect(search).toBeDisabled();
    await expect(search).toHaveValue('');
    await expect(page.getByTestId('component-leaf-row')).toHaveCount(0);
    await expect(page.getByTestId('component-scope-local-overrides')).toHaveCount(0);

    const resources = page.getByTestId('component-overview-resource');
    await expect(resources).toHaveCount(2, { timeout: 15000 });
    // Sorted by kind; with several resources, each waits for a click.
    await expect(resources.nth(0)).toContainText('Deployment');
    await expect(resources.nth(1)).toContainText('Service');
    await expect(resources.nth(0)).toHaveAttribute('aria-expanded', 'false');

    await resources.nth(0).click();
    const section = page.getByTestId('component-overview-section');
    await expect(section.getByText('Containers')).toBeVisible();
    await expect(section.getByText(IMAGE)).toBeVisible();

    await page.getByTestId('component-view-tree').click();
    await expect(page.getByTestId('component-leaf-row').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('component-search').locator('input')).toBeEnabled();
  });
});
