// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Space settings sheet E2E tests (design-mockups/variant-settings/BUILD-PLAN.md)
//
// Two describe blocks:
//  - 'space settings sheet' — a minimal single-target/single-unit Space,
//    exercising the sheet's general open/close behavior (rename, labels,
//    show-more, delete rows all have their own coverage or are simple enough
//    not to need it here — this block is deliberately just the cog smoke
//    test).
//  - 'space settings sheet — mount invariant' — a SEPARATE dev/prod chain
//    with a real upstream diff (mirrors component-page.spec.ts's fixture
//    recipe), because proving the mount invariant requires something
//    genuinely stageable in the TREEVIEW, which the plain fixture above has
//    no upstream link to produce. This is the actual rule-9 regression guard
//    BUILD-PLAN's verification section asks for: stage a treeview field
//    edit, open the settings sheet, close it, assert the staged edit
//    survived. An earlier version of this file's header claimed this
//    coverage while the only mount-related test opened/closed the sheet with
//    nothing staged anywhere — a claimed guard with no actual guard is worse
//    than no test, since it discourages anyone from adding the real one.
//
// This file used to also cover a "Unit targets" row (a `bulkPatchUnits`
// fan-out with 207 partial-failure handling, including a test that forced a
// heterogeneous partial failure via `page.route` interception, since RTK
// `.unwrap()` resolves 207 as success and no happy-path setup can produce
// that state). That row was cut from the feature entirely in review ("Get
// rid of the units target section completely."), so those tests — and the
// two-Target/three-Unit fixture that existed only to give that row's
// enumeration something non-trivial to show — were deleted along with it.
// ============================================================================

const APP_LABEL = `e2e-spacesettings-${RandomSlugGenerator.randomSlugName()}`;

async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
}

test.describe('space settings sheet', () => {
  test.use({ storageState: 'authentication.json' });

  const spaceSlug = `e2e-space-settings-${RandomSlugGenerator.randomSlugName()}`;
  const targetSlug = `${spaceSlug}-tgt`;

  let spaceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());

    const api = new ApiHelper(page);

    const space = await api.createSpace({
      space: { Slug: spaceSlug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Variant: spaceSlug } },
    });
    spaceId = (space as { SpaceID: string }).SpaceID;

    const targetResp = await hubApi.post(`/api/space/${spaceId}/target`, {
      params: { allow_exists: 'true' },
      data: { Slug: targetSlug },
    });
    if (!targetResp.ok()) throw new Error(`Failed to create target: ${targetResp.status()} ${await targetResp.text()}`);
    const targetId = ((await targetResp.json()) as { TargetID: string }).TargetID;

    const unitResp = await hubApi.post(`/api/space/${spaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'unit-1', ToolchainType: 'Kubernetes/YAML', TargetID: targetId },
    });
    if (!unitResp.ok()) throw new Error(`Failed to create unit: ${unitResp.status()} ${await unitResp.text()}`);

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    try {
      await api.deleteSpace(spaceId, true);
    } catch {
      /* ignore */
    }
    await context.close();
  });

  test('cog opens and closes the sheet, and does not affect the pane otherwise', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    // navigateAndSelectApp only opens the app's flow graph — it does not
    // select a deployment, so the side pane (and the cog inside it) doesn't
    // exist yet. Every test in component-page.spec.ts clicks the actual
    // node first; this one has to as well.
    const node = page.locator('.react-flow__node').filter({ hasText: targetSlug });
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();

    const cog = page.getByTestId('component-space-settings-cog');
    await expect(cog).toBeVisible();

    await cog.click();
    await expect(page.getByTestId('space-settings-sheet')).toBeVisible();

    await page.getByTestId('space-settings-discard').click(); // "Close" when nothing is staged
    await expect(page.getByTestId('space-settings-sheet')).not.toBeVisible();
  });

  // Regression guard: `patchSpace` sends `application/merge-patch+json`
  // (RFC 7396). A deleted map key must be re-sent with an explicit JSON
  // `null` for the backend to actually drop it — a key simply absent from
  // the patch body means "leave it alone," not "delete it." The fixture
  // Space above carries `Owner: 'E2E'`, a plain user-authored label (not
  // `Variant`, which the rename row above owns and `RESERVED_LABEL_KEYS`
  // filters out of this row), so it renders as a deletable chip in
  // `LabelsRow`. `Stage`/`PreviousStage` no longer have a dedicated row
  // either — the ChangeWorkflow entity owns rollout staging now — so they are
  // ordinary chips here, exactly like `Owner`.
  test('deleting a Label persists after Save, confirmed via a fresh server fetch', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const node = page.locator('.react-flow__node').filter({ hasText: targetSlug });
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();

    const cog = page.getByTestId('component-space-settings-cog');
    await expect(cog).toBeVisible();
    await cog.click();
    const sheet = page.getByTestId('space-settings-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Owner', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Remove label Owner=E2E' }).click();
    await expect(sheet.getByText('Owner', { exact: true })).not.toBeVisible();

    const saveButton = page.getByTestId('space-settings-save');
    await expect(saveButton).toBeEnabled();
    const patchResponse = page.waitForResponse(
      (r) => r.url().includes(`/api/space/${spaceId}`) && r.request().method() === 'PATCH',
    );
    await saveButton.click();
    await patchResponse;

    // Fresh fetch straight from the server (not the browser's RTK Query
    // cache) is the only proof that the deletion actually persisted, rather
    // than merely having been dropped from local/optimistic state.
    const api = new ApiHelper(page);
    const freshSpace = await api.getSpaceById(spaceId);
    expect(freshSpace.Labels?.Owner).toBeUndefined();
  });
});

// ============================================================================
// Mount invariant (rule 9 regression guard) — the actual test BUILD-PLAN.md's
// commit 1 exists to protect, and the one this file previously CLAIMED to
// cover without actually doing so.
// ============================================================================
test.describe('space settings sheet — mount invariant', () => {
  test.use({ storageState: 'authentication.json' });

  const APP_LABEL_MOUNT = `e2e-spacesettings-mount-${RandomSlugGenerator.randomSlugName()}`;
  const devSlug = `e2e-mount-dev-${RandomSlugGenerator.randomSlugName()}`;
  const prodSlug = `e2e-mount-prod-${RandomSlugGenerator.randomSlugName()}`;
  const devTargetSlug = `${devSlug}-tgt`;
  const prodTargetSlug = `${prodSlug}-tgt`;

  let devSpaceId: string;
  let prodSpaceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);

    const devSpace = await api.createSpace({
      space: { Slug: devSlug, ComponentID: (await api.createComponent(APP_LABEL_MOUNT)).ComponentID, Labels: { Owner: 'E2E', Environment: 'dev' } },
    });
    devSpaceId = (devSpace as { SpaceID: string }).SpaceID;
    const prodSpace = await api.createSpace({
      space: { Slug: prodSlug, ComponentID: (await api.createComponent(APP_LABEL_MOUNT)).ComponentID, Labels: { Owner: 'E2E', Environment: 'prod' } },
    });
    prodSpaceId = (prodSpace as { SpaceID: string }).SpaceID;

    const devTargetResp = await hubApi.post(`/api/space/${devSpaceId}/target`, {
      params: { allow_exists: 'true' },
      data: { Slug: devTargetSlug },
    });
    if (!devTargetResp.ok()) throw new Error(`Failed to create dev target: ${devTargetResp.status()} ${await devTargetResp.text()}`);
    const devTargetId = ((await devTargetResp.json()) as { TargetID: string }).TargetID;

    const prodTargetResp = await hubApi.post(`/api/space/${prodSpaceId}/target`, {
      params: { allow_exists: 'true' },
      data: { Slug: prodTargetSlug },
    });
    if (!prodTargetResp.ok()) throw new Error(`Failed to create prod target: ${prodTargetResp.status()} ${await prodTargetResp.text()}`);
    const prodTargetId = ((await prodTargetResp.json()) as { TargetID: string }).TargetID;

    const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'mount-config', ToolchainType: 'Kubernetes/YAML', TargetID: devTargetId },
    });
    if (!devUnitResp.ok()) throw new Error(`Failed to create dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
    // POST /api/space/{spaceId}/unit returns UnitCreateOrUpdateResponseRead (config
    // Data and MutationSources split into their own APIs, #5140) — the created Unit
    // is under `.Unit`, not the response body itself.
    const devUnitId = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;

    const yamlV1 = ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: mount-config', 'data:', '  image: app:v1'].join('\n');
    const yamlV2 = ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: mount-config', 'data:', '  image: app:v2'].join('\n');

    // Data is no longer a patchable Unit attribute (#5140) — written through the
    // dedicated PUT .../data endpoint, as raw text (not base64).
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitId, body: yamlV1 });

    // Clone dev unit into prod (creates the upstream link) BEFORE dev moves to
    // v2, so prod starts one revision behind — a real upgradable diff, not a
    // simulated one.
    const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
      params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitId },
      data: { Slug: 'mount-config', ToolchainType: 'Kubernetes/YAML', TargetID: prodTargetId },
    });
    if (!prodUnitResp.ok()) throw new Error(`Failed to create prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
    // Same wrapper-unwrap fix as devUnitId above.
    const prodUnitId = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;

    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitId, body: yamlV2 });

    // Wait for the async resolve processor to clear "awaiting/triggers" (mirrors component-page.spec.ts).
    for (const [spaceId, unitId] of [[devSpaceId, devUnitId], [prodSpaceId, prodUnitId]] as const) {
      for (let i = 0; i < 100; i++) {
        const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
        if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    try {
      await api.deleteSpace(prodSpaceId, true);
    } catch {
      /* ignore */
    }
    try {
      await api.deleteSpace(devSpaceId, true);
    } catch {
      /* ignore */
    }
    await context.close();
  });

  test('a staged treeview field edit survives opening and closing the Space settings sheet', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL_MOUNT);

    // The DEV node, not prod: dev has no upstream of its own, so its field
    // renders as a single plain current-value pill ("app:v2") rather than a
    // before→after upgrade-diff pair. Manual inline edit — the interaction
    // this invariant actually needs to protect — click-to-edits the plain
    // value; live-verified this is where that affordance lives (clicking the
    // "before" side of an upgrade-diff pair on prod is a different
    // interaction, staging the upgrade itself, not a manual edit).
    const devNode = page.locator('.react-flow__node').filter({ hasText: devTargetSlug });
    await expect(devNode).toBeVisible({ timeout: 10000 });
    await devNode.click();

    // Manual inline edit — a deliberate, single-field staged pick (distinct
    // from "select all"), matching components.md rule 8: stage, don't write.
    await expect(page.getByText('app:v2').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('app:v2').first().click();
    const inlineInput = page.getByTestId('field-edit-input');
    await expect(inlineInput).toBeVisible({ timeout: 5000 });
    await inlineInput.fill('app:v3-staged-in-treeview');
    await inlineInput.press('Enter');
    await expect(inlineInput).not.toBeVisible({ timeout: 5000 });

    // Confirm it actually staged (not written) before touching the sheet at all.
    await expect(page.locator('.pill-group.pill-staged').first()).toBeVisible({ timeout: 5000 });
    const upgradeBtn = page.getByTestId('component-upgrade-button');
    await expect(upgradeBtn).toBeEnabled({ timeout: 10000 });

    // THE INVARIANT: open the Space settings sheet — this must NOT unmount
    // ComponentValuesSection / PaneContent (BUILD-PLAN commit 1, step 1).
    await page.getByTestId('component-space-settings-cog').click();
    await expect(page.getByTestId('space-settings-sheet')).toBeVisible();

    // ...then close it again (nothing staged in the SHEET itself, so this is
    // a plain Close, no discard-confirmation dialog).
    await page.getByTestId('component-space-settings-cog').click();
    await expect(page.getByTestId('space-settings-sheet')).not.toBeVisible();

    // The treeview's OWN staged edit must have survived the round trip.
    await expect(page.locator('.pill-group.pill-staged').first()).toBeVisible({ timeout: 5000 });
    await expect(upgradeBtn).toBeEnabled({ timeout: 5000 });
    await expect(page.getByText('app:v3-staged-in-treeview').first()).toBeVisible({ timeout: 5000 });
  });
});
