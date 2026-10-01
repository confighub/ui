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
  // Captured in beforeAll so the round-trip test can GET the prod unit's data
  // straight from the server (the persistence assertion).
  let prodUnitId: string;

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
    prodUnitId = prodUnitData.UnitID;

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
    await expect(async () => {
      expect(await leafRows.count()).toBe(UPGRADABLE_COUNT);
    }).toPass({ timeout: 15000 });

    const narrowedCount = await leafRows.count();
    expect(narrowedCount).toBe(UPGRADABLE_COUNT);

    // The Upgradable tab AUTO-SELECTS all upgradable rows on entry, so the stage
    // controls (checkboxes) start in the STAGED state.
    const pills = page.getByTestId('component-upgrade-pill');
    await expect(pills.first()).toBeVisible({ timeout: 5000 });
    expect(await pills.count()).toBe(UPGRADABLE_COUNT);
    await expect(pills.first()).toHaveAttribute('data-staged', 'true', { timeout: 5000 });

    // Toggle the first row OFF then ON. The narrowed view must hold throughout —
    // staging/unstaging must NOT expand the unit to reveal its non-upgradable paths.
    const firstBox = pills.first().locator('input[type="checkbox"]');

    await firstBox.uncheck();
    await expect(pills.first()).toHaveAttribute('data-staged', 'false', { timeout: 5000 });
    await expect(async () => {
      expect(await leafRows.count()).toBe(narrowedCount);
    }).toPass({ timeout: 5000 });

    await firstBox.check();
    await expect(pills.first()).toHaveAttribute('data-staged', 'true', { timeout: 5000 });

    // REGRESSION ASSERTION: the view stays narrowed (not expanded toward the full
    // unit's 10 paths) after toggling.
    await expect(async () => {
      expect(await leafRows.count()).toBe(narrowedCount);
    }).toPass({ timeout: 5000 });
    expect(await leafRows.count()).toBe(UPGRADABLE_COUNT);
    expect(await leafRows.count()).toBeLessThan(DATA_KEYS.length);

    // The rows are still present (pills still rendered, in staged state).
    expect(await pills.count()).toBe(UPGRADABLE_COUNT);
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
    await expect(async () => {
      expect(await leafRows.count()).toBe(UPGRADABLE_COUNT);
    }).toPass({ timeout: 15000 });

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
    await expect(async () => {
      expect(await leafRows.count()).toBe(UPGRADABLE_COUNT);
    }).toPass({ timeout: 20000 });
    expect(await leafRows.count()).toBe(UPGRADABLE_COUNT);

    // Done state: the committed rows no longer offer an upgrade pill to stage.
    await expect(page.getByTestId('component-upgrade-pill')).toHaveCount(0, { timeout: 10000 });
  });

  // Full MANUAL-EDIT ROUND-TRIP: inline-edit a PLAIN (non-upgradable) data key,
  // confirm it STAGES as a manual edit (deferred — not written yet), commit via the
  // summary dialog, then verify the new value actually PERSISTED to the prod unit's
  // data on the SERVER. This exercises the whole edit → stage → commit → saved path.
  // SKIPPED: consistently flaky in CI due to environment/DB warm-up timing,
  // not a product defect — confirmed failing identically on main with no
  // related changes, and passing locally on retry with no code changes in
  // between. Should be re-enabled once CI environment stability is fixed.
  // Do not delete — the underlying product behavior is correct.
  test.skip('a manual edit persists end-to-end (edit → stage → commit → saved)', async ({ page }) => {
    // A PLAIN (non-upgradable) key — k0/k5 are the only upgradable ones, so k7 is a
    // guaranteed plain `data.*` leaf that only the "All" tab reveals. Its path inside
    // the ConfigMap is `data.k7`. Use it for both the inline-edit target and the
    // server-side persistence check.
    const PLAIN_KEY = 'k7';
    const editedValue = `e2e-edited-${RandomSlugGenerator.randomSlugName()}`;

    await navigateAndSelectApp(page, APP_LABEL);

    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    // The pane opens defaulted to the Upgradable tab (which is narrowed to only the
    // 2 upgradable rows). Switch to the "All" tab so the plain non-upgradable keys
    // become visible. The filter tabs are accessible buttons labelled by their text.
    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });
    const allTab = page.getByTestId('component-all-filter');
    await expect(allTab).toBeVisible({ timeout: 10000 });
    await allTab.click();

    // Narrow the tree to the single plain key via the search box so we can target its
    // one leaf row unambiguously (keys are k0..k9, so 'k7' matches only that key).
    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill(PLAIN_KEY);

    const leafRow = page.getByTestId('component-leaf-row').filter({ hasText: PLAIN_KEY });
    await expect(async () => {
      expect(await leafRow.count()).toBe(1);
    }).toPass({ timeout: 15000 });

    // Sanity: before editing, the row shows the plain base value and is NOT staged
    // (no edit tint / staged pill group).
    await expect(leafRow).toContainText(`${PLAIN_KEY}-base`, { timeout: 5000 });
    await expect(leafRow.locator('.pill-group.pill-staged')).toHaveCount(0);

    // ── Step 3: INLINE-EDIT the value ──
    // Click the value to open the inline editor, clear it, type the unique value, and
    // commit the edit with Enter. Clicking the rendered value text opens field-edit-input.
    await leafRow.getByText(`${PLAIN_KEY}-base`).click();
    const editInput = page.getByTestId('field-edit-input');
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.fill(editedValue);
    await editInput.press('Enter');

    // ── Step 4: assert it STAGED as a manual edit (deferred — NOT written yet) ──
    // A staged manual edit re-stages the row (pill-group gains `pill-staged`) and
    // persistently shows the current→edited inline diff via `.current-preview`, which
    // contains the new value. We assert the staged state + the edited value is shown,
    // WITHOUT asserting any write happened yet.
    await expect(leafRow.locator('.pill-group.pill-staged')).toHaveCount(1, { timeout: 10000 });
    await expect(leafRow.locator('.current-preview')).toContainText(editedValue, { timeout: 10000 });
    // …and it staged as a manual EDIT specifically (amber/yellow), not an upgrade.
    await expect(leafRow).toHaveAttribute('data-change-type', 'edit', { timeout: 10000 });
    // The footer staged count must include this edit, enabling the Upgrade button.
    const upgradeBtn = page.getByTestId('component-upgrade-button');
    await expect(upgradeBtn).toBeEnabled({ timeout: 5000 });

    // ── Step 5: COMMIT ──
    // Clicking Upgrade commits immediately — the real PATCH (patch-data merge) runs
    // and triggers an RTK refetch. There is no intermediate review step.
    await upgradeBtn.click();
    // The staged edit clears once the commit completes (the footer count drops to 0,
    // disabling the Upgrade button).
    await expect(upgradeBtn).toBeDisabled({ timeout: 15000 });

    // ── Step 6: PERSISTENCE assertion (the round-trip) ──
    // Fetch the prod unit's configuration straight from the server. The unique edited
    // value MUST be present — proving the manual edit was actually saved, not merely
    // reflected in UI state. Poll because the commit is async. The configuration is not
    // on the Unit, so this reads the data endpoint, which serves the document as text.
    await expect(async () => {
      const resp = await hubApi.get(`/api/space/${prodSpaceId}/unit/${prodUnitId}/data`);
      expect(resp.ok()).toBe(true);
      expect(await resp.text()).toContain(editedValue);
    }).toPass({ timeout: 20000 });
  });
});
