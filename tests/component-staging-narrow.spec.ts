// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Component staging regression E2E
//
// Guards the bug: in the "Upgradable" filter tab the tree is narrowed to ONLY
// the upgradable rows. Staging one item (clicking its upgrade pill) must KEEP
// that narrowed view — it must NOT expand the unit to reveal all its
// (non-upgradable) paths.
//
// Creates an upgradable component chain via API: a dev unit whose data has MANY
// keys but only a FEW change between rev1 and rev2, cloned downstream into prod
// with an upstream link. Prod therefore shows a small set of available upgrades
// among many unchanged paths, so "narrowed" is meaningfully different from
// "whole unit expanded".
// ============================================================================

const APP_LABEL = `e2e-stage-narrow-${RandomSlugGenerator.randomSlugName()}`;

// rev1: 10 data keys. rev2: same 10 keys, but only TWO change (k0, k5).
// So prod (cloned at rev1) has exactly 2 upgradable leaf rows out of 10 paths.
const DATA_KEYS = Array.from({ length: 10 }, (_, i) => `k${i}`);
function buildYaml(changed: Set<number>): string {
  const lines = ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: narrow-config', 'data:'];
  DATA_KEYS.forEach((key, i) => {
    const v = changed.has(i) ? `${key}-CHANGED` : `${key}-base`;
    lines.push(`  ${key}: "${v}"`);
  });
  return lines.join('\n');
}
const YAML_V1 = buildYaml(new Set()); // all base
const YAML_V2 = buildYaml(new Set([0, 5])); // k0 and k5 changed → 2 upgradable paths
const UPGRADABLE_COUNT = 2;

async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  // The trail names the Component too, so the tree item is found by its test id.
  const treeItem = page.getByTestId(`app-tree-item-${appLabel}`);
  await expect(treeItem).toBeVisible({ timeout: 20000 });
  await treeItem.click();
}

test.describe('component staging keeps the Upgradable narrowed view', () => {
  test.use({ storageState: 'authentication.json' });

  const devSlug = `e2e-dev-${RandomSlugGenerator.randomSlugName()}`;
  const prodSlug = `e2e-prod-${RandomSlugGenerator.randomSlugName()}`;
  const devTargetSlug = `${devSlug}-tgt`;
  const prodTargetSlug = `${prodSlug}-tgt`;

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

    const devSpace = await api.createSpace({
      space: {
        Slug: devSlug,
        ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Environment: 'dev', TargetRole: 'Dev', TargetRegion: 'US' },
      },
    });
    devSpaceId = (devSpace as { SpaceID: string }).SpaceID;

    const prodSpace = await api.createSpace({
      space: {
        Slug: prodSlug,
        ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Environment: 'prod', TargetRole: 'Prod', TargetRegion: 'US' },
      },
    });
    prodSpaceId = (prodSpace as { SpaceID: string }).SpaceID;

    const devTargetResp = await hubApi.post(`/api/space/${devSpaceId}/target`, {
      params: { allow_exists: 'true' },
      data: { Slug: devTargetSlug, Labels: { TargetRole: 'Dev', TargetRegion: 'US' } },
    });
    if (!devTargetResp.ok()) throw new Error(`dev target: ${devTargetResp.status()} ${await devTargetResp.text()}`);
    const devTargetData = (await devTargetResp.json()) as { TargetID: string };

    const prodTargetResp = await hubApi.post(`/api/space/${prodSpaceId}/target`, {
      params: { allow_exists: 'true' },
      data: { Slug: prodTargetSlug, Labels: { TargetRole: 'Prod', TargetRegion: 'US' } },
    });
    if (!prodTargetResp.ok()) throw new Error(`prod target: ${prodTargetResp.status()} ${await prodTargetResp.text()}`);
    const prodTargetData = (await prodTargetResp.json()) as { TargetID: string };
    // A Unit is released to its Space's release Target.
    await api.updateSpace({ spaceId: devSpaceId, space: { ReleaseTargetID: devTargetData.TargetID } });
    await api.updateSpace({ spaceId: prodSpaceId, space: { ReleaseTargetID: prodTargetData.TargetID } });

    // Dev unit
    const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'narrow-config', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
    // POST /api/space/{spaceId}/unit returns UnitCreateOrUpdateResponseRead (config
    // Data and MutationSources split into their own APIs, #5140) — the created Unit
    // is under `.Unit`, not the response body itself.
    const devUnitData = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

    // rev1 data (all base). Data is no longer a patchable Unit attribute (#5140) —
    // written through the dedicated PUT .../data endpoint, as raw text (not base64).
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: YAML_V1 });

    // Clone dev → prod (upstream link) while dev is at rev1
    const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
      params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitData.UnitID },
      data: { Slug: 'narrow-config', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
    // Same wrapper-unwrap fix as devUnitData above.
    const prodUnitData = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

    // Bump dev to rev2 (only k0 + k5 change) → prod now has exactly 2 upgradable paths.
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: YAML_V2 });

    // Wait for the resolve processor to clear awaiting/triggers ValidationErrors.
    for (const [spaceId, unitId] of [
      [devSpaceId, devUnitData.UnitID],
      [prodSpaceId, prodUnitData.UnitID],
    ]) {
      for (let i = 0; i < 100; i++) {
        const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
        if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }

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

  test('staging an item in the Upgradable tab keeps the narrowed view', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    // Open the prod side pane (prod is the downstream unit with available upgrades).
    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    // The side pane is open with upstream changes → Upgrade button present. The
    // pane defaults to the Upgradable filter for a node with upgrades, so the tree
    // is narrowed to the upgradable rows.
    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });

    // Incoming draws exactly the incoming fields (2), NOT all the Unit's fields.
    const ticks = page.locator('[data-testid^="incoming-tick-"]');
    await expect(ticks).toHaveCount(UPGRADABLE_COUNT, { timeout: 15000 });

    // Entering Incoming ticks every incoming field, so the ticks start checked.
    const firstBox = ticks.first().locator('input');
    await expect(firstBox).toBeChecked({ timeout: 5000 });

    // Toggle the first field OFF then ON. The scope must hold throughout: unticking must NOT
    // draw the Unit's other fields.
    await firstBox.uncheck();
    await expect(firstBox).not.toBeChecked({ timeout: 5000 });
    await expect(ticks).toHaveCount(UPGRADABLE_COUNT);

    await firstBox.check();
    await expect(firstBox).toBeChecked({ timeout: 5000 });
    await expect(ticks).toHaveCount(UPGRADABLE_COUNT);
  });

  test('committing the staged batch keeps the just-committed rows visible (they do not vanish)', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    const upgradeBtn = page.getByTestId('component-upgrade-button');
    await expect(upgradeBtn).toBeVisible({ timeout: 10000 });

    // Wait for the incoming fields (the 2 changed keys); entering Incoming ticked them.
    const ticks = page.locator('[data-testid^="incoming-tick-"]');
    await expect(ticks).toHaveCount(UPGRADABLE_COUNT, { timeout: 15000 });
    await expect(ticks.first().locator('input')).toBeChecked({ timeout: 5000 });

    // Commit: clicking the footer button performs the real PATCH and refetches immediately.
    await expect(upgradeBtn).toBeEnabled({ timeout: 5000 });
    await upgradeBtn.click();

    // After the commit nothing is incoming any more: the scope says so, and All draws the
    // written values.
    await expect(page.getByTestId('scope-empty')).toHaveText('Nothing incoming', { timeout: 20000 });
    await expect(ticks).toHaveCount(0);
  });

  // The Space settings sheet must not drop a staged edit: it lives in the pane's staging store.
  test('a staged field edit survives opening and closing the Space settings sheet', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    // The DEV node, not prod: dev has no upstream of its own, so its field
    // renders as a single plain current-value pill rather than a
    // before→after upgrade-diff pair, and clicking it opens the manual inline
    // editor rather than staging an upgrade.
    const devNode = page.locator('.react-flow__node').filter({ hasText: devTargetSlug });
    await expect(devNode).toBeVisible({ timeout: 10000 });
    await devNode.click();

    await expect(page.getByText('k7-base').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('k7-base').first().click();
    const inlineInput = page.getByTestId('field-editor-input');
    await expect(inlineInput).toBeVisible({ timeout: 5000 });
    await inlineInput.fill('k7-staged-in-sheet');
    await inlineInput.press('Enter');
    await expect(inlineInput).not.toBeVisible({ timeout: 5000 });

    // Confirm it actually staged (not written) before touching the sheet at all.
    const stagedMark = page.locator('[data-testid^="field-staged-"]');
    await expect(stagedMark.first()).toBeVisible({ timeout: 5000 });
    const upgradeBtn = page.getByTestId('component-upgrade-button');
    await expect(upgradeBtn).toBeEnabled({ timeout: 10000 });

    // Open the Settings tab, then go back to Configuration (nothing staged in
    // the SHEET itself, so there is no discard dialog).
    await page.getByTestId('component-pane-tab-settings').click();
    await expect(page.getByTestId('space-settings-sheet')).toBeVisible();
    await page.getByTestId('component-pane-tab-config').click();
    await expect(page.getByTestId('space-settings-sheet')).not.toBeVisible();

    // The staged edit lives in the pane's staging store: it must have survived the round trip.
    await expect(stagedMark.first()).toBeVisible({ timeout: 5000 });
    await expect(upgradeBtn).toBeEnabled({ timeout: 5000 });
    await expect(page.getByText('k7-staged-in-sheet').first()).toBeVisible({ timeout: 5000 });
  });
});

// A path only upstream has belongs to no document of the downstream Unit, so the tree
// draws it in the last one. With more than one document, its row reads its staged
// state by that document's stage key, which the auto-stage has to use too: otherwise
// the row starts unstaged and shows the downstream's "no value" in place of the
// incoming one.
test.describe('component staging in a multi-document Unit', () => {
  test.use({ storageState: 'authentication.json' });

  const appLabel = `e2e-stage-multidoc-${RandomSlugGenerator.randomSlugName()}`;
  const devSlug = `e2e-dev-${RandomSlugGenerator.randomSlugName()}`;
  const prodSlug = `e2e-prod-${RandomSlugGenerator.randomSlugName()}`;
  const prodTargetSlug = `${prodSlug}-tgt`;

  // Two ConfigMaps with no data key in common. Upstream rev2 adds data.added to the
  // second and changes its data.k1.
  const buildMultiDocYaml = (rev2: boolean): string =>
    [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: first',
      'data:',
      '  k0: "first-base"',
      '---',
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      '  name: second',
      'data:',
      `  k1: "${rev2 ? 'second-CHANGED' : 'second-base'}"`,
      ...(rev2 ? ['  added: "added-upstream"'] : []),
    ].join('\n');

  let devSpaceId: string;
  let prodSpaceId: string;
  let prodUnitId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);

    const createSpaceWithTarget = async (slug: string, role: 'Dev' | 'Prod'): Promise<{ spaceId: string; targetId: string }> => {
      const space = await api.createSpace({
        space: {
          Slug: slug,
          ComponentID: (await api.createComponent(appLabel)).ComponentID,
          Labels: { Owner: 'E2E', Environment: role.toLowerCase(), TargetRole: role, TargetRegion: 'US' },
        },
      });
      const spaceId = (space as { SpaceID: string }).SpaceID;
      const targetResp = await hubApi.post(`/api/space/${spaceId}/target`, {
        params: { allow_exists: 'true' },
        data: { Slug: `${slug}-tgt`, Labels: { TargetRole: role, TargetRegion: 'US' } },
      });
      if (!targetResp.ok()) throw new Error(`${role} target: ${targetResp.status()} ${await targetResp.text()}`);
      const targetId = ((await targetResp.json()) as { TargetID: string }).TargetID;
      // A Unit is released to its Space's release Target.
      await api.updateSpace({ spaceId, space: { ReleaseTargetID: targetId } });
      return { spaceId, targetId };
    };
    const dev = await createSpaceWithTarget(devSlug, 'Dev');
    const prod = await createSpaceWithTarget(prodSlug, 'Prod');
    devSpaceId = dev.spaceId;
    prodSpaceId = prod.spaceId;

    const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'multidoc-config', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
    const devUnitId = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitId, body: buildMultiDocYaml(false) });

    const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
      params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitId },
      data: { Slug: 'multidoc-config', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
    prodUnitId = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;

    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitId, body: buildMultiDocYaml(true) });

    for (const [spaceId, unitId] of [
      [devSpaceId, devUnitId],
      [prodSpaceId, prodUnitId],
    ]) {
      for (let i = 0; i < 100; i++) {
        const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
        if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }

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

  async function openProdPane(page: Page): Promise<void> {
    await navigateAndSelectApp(page, appLabel);
    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();
    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });
  }

  test('a path only upstream has starts staged, showing its incoming value', async ({ page }) => {
    await openProdPane(page);

    // The added key and the changed one: two ticks, both ticked, the added one showing its value.
    const ticks = page.locator('[data-testid^="incoming-tick-"]');
    await expect(ticks).toHaveCount(2, { timeout: 15000 });
    await expect(ticks.first().locator('input')).toBeChecked({ timeout: 5000 });
    await expect(page.locator('.inc').filter({ hasText: 'added-upstream' })).toHaveCount(1);
    await expect(page.getByTestId('component-upgrade-button')).toHaveText('Upgrade 2');
  });

  test('upgrading only the added path writes it into the document it was added to', async ({ page }) => {
    await openProdPane(page);

    await expect(page.locator('.inc').filter({ hasText: 'added-upstream' }).locator('input')).toBeChecked({ timeout: 15000 });
    // Unticking the other change makes this a partial upgrade, which writes the ticked values
    // into the Unit's data rather than running the server's upgrade.
    await page.locator('.inc').filter({ hasText: 'second-CHANGED' }).locator('input[type="checkbox"]').uncheck();
    await expect(page.getByTestId('component-upgrade-button')).toHaveText('Upgrade 1');
    await page.getByTestId('component-upgrade-button').click();

    await expect(async () => {
      const resp = await hubApi.get(`/api/space/${prodSpaceId}/unit/${prodUnitId}/data`);
      const documents = (await resp.text()).split(/^---$/m);
      expect(documents).toHaveLength(2);
      expect(documents[0]).not.toContain('added');
      expect(documents[1]).toContain('added: added-upstream');
      expect(documents[1]).toContain('second-base');
    }).toPass({ timeout: 20000 });
  });
});
