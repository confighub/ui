// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Component pane: the Units row
//
// The pane lists the units a Release of the variant's Space publishes
// (Unit.Releasable) unless All units is chosen, and hidden units only when
// Include hidden is.
//
// Fixture: a Space with no release Target holding a Kubernetes unit, which a
// Release would publish once the Space has a release Target, an AppConfig unit,
// which none would, and a hidden Kubernetes unit.
// ============================================================================

const APP_LABEL = `e2e-unit-scope-${RandomSlugGenerator.randomSlugName()}`;

const YAML = [
  'apiVersion: v1',
  'kind: ConfigMap',
  'metadata:',
  '  name: unit-scope',
  'data:',
  '  key: value',
].join('\n');

test.describe('component pane Units row', () => {
  test.use({ storageState: 'authentication.json' });

  const spaceSlug = `e2e-scope-${RandomSlugGenerator.randomSlugName()}`;
  let componentId: string;
  let spaceId: string;
  const unitIds: Record<'releasable' | 'appConfig' | 'hidden', string> = { releasable: '', appConfig: '', hidden: '' };

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);
    componentId = (await api.createComponent(APP_LABEL)).ComponentID;
    spaceId = ((await api.createSpace({
      space: { Slug: spaceSlug, ComponentID: componentId, Labels: { Owner: 'E2E', Environment: 'dev' } },
    })) as { SpaceID: string }).SpaceID;

    const createUnit = async (data: Record<string, string>): Promise<string> => {
      const resp = await hubApi.post(`/api/space/${spaceId}/unit`, { data });
      if (!resp.ok()) throw new Error(`unit ${data.Slug}: ${resp.status()} ${await resp.text()}`);
      return ((await resp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;
    };
    unitIds.releasable = await createUnit({ Slug: 'web', ToolchainType: 'Kubernetes/YAML' });
    unitIds.appConfig = await createUnit({ Slug: 'settings', ToolchainType: 'AppConfig/Properties' });
    unitIds.hidden = await createUnit({ Slug: 'archived', ToolchainType: 'Kubernetes/YAML', HiddenReason: 'Archived' });
    await api.uploadUnitData({ spaceId, unitId: unitIds.releasable, body: YAML });
    await api.uploadUnitData({ spaceId, unitId: unitIds.hidden, body: YAML });

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
    try { await api.deleteSpace(spaceId, true); } catch { /* ignore */ }
    try { await api.deleteComponent(componentId); } catch { /* ignore */ }
    await context.close();
  });

  const unitLink = (page: Page, unitId: string) => page.locator(`a[href="/units/${spaceId}/${unitId}"]`);

  test('lists releasable units by default, and the rest on request', async ({ page }) => {
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}`);
    const node = page.locator('.react-flow__node').filter({ hasText: spaceSlug });
    await expect(node).toBeVisible({ timeout: 20000 });
    await node.click();

    await expect(page.getByTestId('component-units-releasable')).toHaveAttribute('aria-pressed', 'true');
    await expect(unitLink(page, unitIds.releasable)).toBeVisible({ timeout: 15000 });
    await expect(unitLink(page, unitIds.appConfig)).toHaveCount(0);
    await expect(unitLink(page, unitIds.hidden)).toHaveCount(0);

    await page.getByTestId('component-units-all').click();
    await expect(unitLink(page, unitIds.appConfig)).toBeVisible();
    await expect(unitLink(page, unitIds.releasable)).toBeVisible();
    await expect(unitLink(page, unitIds.hidden)).toHaveCount(0);

    await page.getByTestId('component-units-include-hidden').click();
    await expect(page.getByTestId('component-units-include-hidden')).toHaveAttribute('aria-pressed', 'true');
    await expect(unitLink(page, unitIds.hidden)).toBeVisible({ timeout: 15000 });

    // The hidden unit is a Kubernetes unit, which is releasable; the AppConfig one is not.
    await page.getByTestId('component-units-releasable').click();
    await expect(unitLink(page, unitIds.appConfig)).toHaveCount(0);
    await expect(unitLink(page, unitIds.hidden)).toBeVisible();

    await page.getByTestId('component-units-include-hidden').click();
    await expect(unitLink(page, unitIds.hidden)).toHaveCount(0);
  });
});
