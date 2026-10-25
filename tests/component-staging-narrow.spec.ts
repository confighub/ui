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
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
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

    // Dev unit
    const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'narrow-config', ToolchainType: 'Kubernetes/YAML', TargetID: devTargetData.TargetID },
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
      data: { Slug: 'narrow-config', ToolchainType: 'Kubernetes/YAML', TargetID: prodTargetData.TargetID },
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

    // Wait for the narrowed upgradable rows to render. There should be exactly the
    // upgradable leaf rows (2), NOT all 10 data paths.
    const leafRows = page.getByTestId('component-leaf-row');
    await expect(leafRows).toHaveCount(UPGRADABLE_COUNT, { timeout: 15000 });

    // The Upgradable tab AUTO-SELECTS all upgradable rows on entry, so the stage
    // controls (checkboxes) start in the STAGED state.
    const pills = page.getByTestId('component-upgrade-pill');
    await expect(pills).toHaveCount(UPGRADABLE_COUNT, { timeout: 5000 });
    await expect(pills.first()).toHaveAttribute('data-staged', 'true', { timeout: 5000 });

    // Toggle the first row OFF then ON. The narrowed view must hold throughout —
    // staging/unstaging must NOT expand the unit to reveal its non-upgradable paths.
    const firstBox = pills.first().locator('input[type="checkbox"]');

    await firstBox.uncheck();
    await expect(pills.first()).toHaveAttribute('data-staged', 'false', { timeout: 5000 });
    await expect(leafRows).toHaveCount(UPGRADABLE_COUNT);

    await firstBox.check();
    await expect(pills.first()).toHaveAttribute('data-staged', 'true', { timeout: 5000 });

    // REGRESSION ASSERTION: the view stays narrowed (not expanded toward the full
    // unit's 10 paths) after toggling, and every row keeps its pill.
    await expect(leafRows).toHaveCount(UPGRADABLE_COUNT);
    await expect(pills).toHaveCount(UPGRADABLE_COUNT);
  });

  test('committing the staged batch keeps the just-committed rows visible (they do not vanish)', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    const upgradeBtn = page.getByTestId('component-upgrade-button');
    await expect(upgradeBtn).toBeVisible({ timeout: 10000 });

    // Wait for the narrowed upgradable rows (the 2 changed keys).
    const leafRows = page.getByTestId('component-leaf-row');
    await expect(leafRows).toHaveCount(UPGRADABLE_COUNT, { timeout: 15000 });

    // The Upgradable tab auto-selects all upgradable rows on entry, so they're
    // already staged. Confirm the stage controls are checked.
    await expect(page.getByTestId('component-upgrade-pill').first()).toHaveAttribute('data-staged', 'true', { timeout: 5000 });

    // Commit: clicking the footer Upgrade button performs the real PATCH + triggers
    // an RTK refetch immediately — there is no intermediate review step.
    await expect(upgradeBtn).toBeEnabled({ timeout: 5000 });
    await upgradeBtn.click();

    // After commit + refetch the committed paths drop out of upgradeFieldDiffs.
    // REGRESSION ASSERTION: the just-committed rows must STAY visible (not vanish).
    // The row count must NOT drop to 0 — the committed rows remain, now in a "done"
    // state with no upgrade pill (nothing left to stage on them).
    await expect(leafRows).toHaveCount(UPGRADABLE_COUNT, { timeout: 20000 });

    // Done state: the committed rows no longer offer an upgrade pill to stage.
    await expect(page.getByTestId('component-upgrade-pill')).toHaveCount(0, { timeout: 10000 });
  });

  // The Space settings sheet must not unmount the values tree: a staged edit
  // lives in that tree's state, so remounting it would silently drop the work.
  test('a staged treeview field edit survives opening and closing the Space settings sheet', async ({ page }) => {
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
    const inlineInput = page.getByTestId('field-edit-input');
    await expect(inlineInput).toBeVisible({ timeout: 5000 });
    await inlineInput.fill('k7-staged-in-treeview');
    await inlineInput.press('Enter');
    await expect(inlineInput).not.toBeVisible({ timeout: 5000 });

    // Confirm it actually staged (not written) before touching the sheet at all.
    await expect(page.locator('.pill-group.pill-staged').first()).toBeVisible({ timeout: 5000 });
    const upgradeBtn = page.getByTestId('component-upgrade-button');
    await expect(upgradeBtn).toBeEnabled({ timeout: 10000 });

    // Open the Space settings sheet, then close it again (nothing staged in
    // the SHEET itself, so this is a plain Close with no discard dialog).
    await page.getByTestId('component-space-settings-cog').click();
    await expect(page.getByTestId('space-settings-sheet')).toBeVisible();
    await page.getByTestId('component-space-settings-cog').click();
    await expect(page.getByTestId('space-settings-sheet')).not.toBeVisible();

    // The treeview's OWN staged edit must have survived the round trip.
    await expect(page.locator('.pill-group.pill-staged').first()).toBeVisible({ timeout: 5000 });
    await expect(upgradeBtn).toBeEnabled({ timeout: 5000 });
    await expect(page.getByText('k7-staged-in-treeview').first()).toBeVisible({ timeout: 5000 });
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
      return { spaceId, targetId: ((await targetResp.json()) as { TargetID: string }).TargetID };
    };
    const dev = await createSpaceWithTarget(devSlug, 'Dev');
    const prod = await createSpaceWithTarget(prodSlug, 'Prod');
    devSpaceId = dev.spaceId;
    prodSpaceId = prod.spaceId;

    const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'multidoc-config', ToolchainType: 'Kubernetes/YAML', TargetID: dev.targetId },
    });
    if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
    const devUnitId = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitId, body: buildMultiDocYaml(false) });

    const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
      params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitId },
      data: { Slug: 'multidoc-config', ToolchainType: 'Kubernetes/YAML', TargetID: prod.targetId },
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

    const addedRow = page.getByTestId('component-leaf-row').filter({ hasText: 'added' });
    await expect(addedRow).toHaveCount(1, { timeout: 15000 });
    await expect(addedRow.getByTestId('component-upgrade-pill')).toHaveAttribute('data-staged', 'true', { timeout: 5000 });
    await expect(addedRow).toContainText('added-upstream');
    await expect(page.getByTestId('component-upgrade-button')).toContainText('2');
  });

  test('upgrading only the added path writes it into the document it was added to', async ({ page }) => {
    await openProdPane(page);

    const addedRow = page.getByTestId('component-leaf-row').filter({ hasText: 'added' });
    await expect(addedRow.getByTestId('component-upgrade-pill')).toHaveAttribute('data-staged', 'true', { timeout: 15000 });
    // Unstaging the other change makes this a partial upgrade, which writes the staged
    // values into the Unit's data rather than running the server's upgrade.
    const changedRow = page.getByTestId('component-leaf-row').filter({ hasText: 'second-CHANGED' });
    await changedRow.getByTestId('component-upgrade-pill').locator('input[type="checkbox"]').uncheck();
    await expect(page.getByTestId('component-upgrade-button')).toContainText('1');
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
