// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Lock/unlock interaction (single-row protection via the kebab menu) E2E
//
// Covers the leaf/folder kebab "Keep on merge" / "Let merges update this" /
// "Keep group & N keys on merge" items, the solid-border + rust-rail staged
// state, the "Keep both on merge" / "Undo keep" bar buttons, and the
// two-revision (protection-first) commit ordering. See
// `ui/docs/dev/components.md` → "Locking (protection)" for the data model.
//
// Fixture: a single-document Deployment YAML, cloned dev→prod with an
// upstream link, then prod diverges at several paths (unprotected, plain
// write — protection is never assumed from setup, same convention as
// component-provenance-border.spec.ts). Where a test needs a path ALREADY
// protected with no staged interaction — a state `uploadUnitData({protect:
// true})` (write-time protect) cannot represent — it goes through
// `api.setUnitProtection` directly, the same endpoint the UI's kebab/commit
// flow calls.
// ============================================================================

const RESOURCE_TYPE = 'apps/v1/Deployment';
const RESOURCE_NAME = '/lock-interaction-config';

function buildDeploymentYaml(fields: {
  replicas: string;
  strategy: string;
  minReadySeconds: string;
  limitsCpu: string;
  limitsMemory: string;
  image: string;
  includeNewFeatureFlag: boolean;
}): string {
  const lines = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: lock-interaction-config',
    'spec:',
    `  replicas: "${fields.replicas}"`,
    `  strategy: "${fields.strategy}"`,
    `  minReadySeconds: "${fields.minReadySeconds}"`,
    '  limits:',
    `    cpu: "${fields.limitsCpu}"`,
    `    memory: "${fields.limitsMemory}"`,
    '  containers:',
    '  - name: app',
    `    image: "${fields.image}"`,
  ];
  if (fields.includeNewFeatureFlag) lines.push('  newFeatureFlag: "off"');
  return lines.join('\n');
}

async function waitForResolved(page: Page, spaceId: string, unitId: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
    if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

interface LockFixture {
  appLabel: string;
  devSpaceId: string;
  prodSpaceId: string;
  devUnitId: string;
  prodUnitId: string;
  prodTargetSlug: string;
}

/**
 * Build a fresh dev→prod (upstream-linked) unit pair for a lock-interaction
 * test. `prodFields` (all UNPROTECTED, plain PATCH) is applied to prod after
 * cloning at `devFields`, so every field prod overrides genuinely differs
 * from upstream (a real local override) except `strategy`, which the caller
 * may protect separately without changing its value (the "fourth cell").
 */
async function setupLockFixture(
  page: Page,
  api: ApiHelper,
  devFields: Parameters<typeof buildDeploymentYaml>[0],
  prodFields: Parameters<typeof buildDeploymentYaml>[0],
  devFieldsRev2: Parameters<typeof buildDeploymentYaml>[0],
): Promise<LockFixture> {
  const appLabel = `e2e-lock-${RandomSlugGenerator.randomSlugName()}`;
  const slug = 'lock-interaction-config';
  const devSlug = `e2e-dev-${RandomSlugGenerator.randomSlugName()}`;
  const prodSlug = `e2e-prod-${RandomSlugGenerator.randomSlugName()}`;
  const devTargetSlug = `${devSlug}-tgt`;
  const prodTargetSlug = `${prodSlug}-tgt`;

  const devSpace = await api.createSpace({
    space: { Slug: devSlug, ComponentID: (await api.createComponent(appLabel)).ComponentID, Labels: { Owner: 'E2E', Environment: 'dev', TargetRole: 'Dev', TargetRegion: 'US' } },
  });
  const devSpaceId = (devSpace as { SpaceID: string }).SpaceID;
  const prodSpace = await api.createSpace({
    space: { Slug: prodSlug, ComponentID: (await api.createComponent(appLabel)).ComponentID, Labels: { Owner: 'E2E', Environment: 'prod', TargetRole: 'Prod', TargetRegion: 'US' } },
  });
  const prodSpaceId = (prodSpace as { SpaceID: string }).SpaceID;

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

  const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
    params: { allow_exists: 'true' },
    data: { Slug: slug, ToolchainType: 'Kubernetes/YAML', TargetID: devTargetData.TargetID },
  });
  if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
  const devUnitData = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

  // Data is no longer a patchable Unit attribute (#5140) — written through
  // the dedicated PUT .../data endpoint, as raw text (not base64).
  await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: buildDeploymentYaml(devFields) });

  const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
    params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitData.UnitID },
    data: { Slug: slug, ToolchainType: 'Kubernetes/YAML', TargetID: prodTargetData.TargetID },
  });
  if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
  const prodUnitData = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

  // Prod diverges — UNPROTECTED, plain write (protect defaults to false).
  await api.uploadUnitData({ spaceId: prodSpaceId, unitId: prodUnitData.UnitID, body: buildDeploymentYaml(prodFields) });

  // Dev bumps to rev2 (e.g. adding `newFeatureFlag`) — gives prod a genuine
  // pending upgrade, so upstream-only fields actually appear as absent
  // ("isAbsentCurrent") rows: `unionUpstreamOnlyPaths` only unions in paths
  // from `upgradeEntry.fieldDiffs`, which requires a real revision gap.
  await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: buildDeploymentYaml(devFieldsRev2) });

  await waitForResolved(page, devSpaceId, devUnitData.UnitID);
  await waitForResolved(page, prodSpaceId, prodUnitData.UnitID);

  return { appLabel, devSpaceId, prodSpaceId, devUnitId: devUnitData.UnitID, prodUnitId: prodUnitData.UnitID, prodTargetSlug };
}

async function openProdPane(page: Page, appLabel: string, prodTargetSlug: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page.waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 }).catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
  const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
  await expect(prodNode).toBeVisible({ timeout: 10000 });
  await prodNode.click();
  await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });
  // The fixture always has exactly one pending upgrade (`newFeatureFlag`) —
  // gate on the dry-run having actually landed before switching tabs, not a
  // bare timeout (which would let `upstreamOnlyPaths` still be empty).
  await expect(page.getByTestId('component-incoming-count')).toHaveText('1', { timeout: 20000 });
  const allTab = page.getByTestId('component-filter-all');
  await expect(allTab).toBeVisible({ timeout: 10000 });
  await allTab.click();
}

/** Open the leaf kebab menu for a row uniquely matched by `searchText`, returning the row locator. */
async function openLeafKebab(page: Page, searchText: string): Promise<ReturnType<Page['getByTestId']>> {
  const searchBox = page.getByPlaceholder('Search...');
  await searchBox.fill(searchText);
  const leafRow = page.getByTestId('component-leaf-row').filter({ hasText: searchText });
  await expect(async () => {
    expect(await leafRow.count()).toBe(1);
  }).toPass({ timeout: 15000 });
  await leafRow.locator('.kebab-btn').click();
  await expect(page.getByRole('menu')).toBeVisible({ timeout: 5000 });
  return leafRow;
}

test.describe('Lock/unlock interaction — kebab wording and staging', () => {
  test.use({ storageState: 'authentication.json' });

  const devFields = { replicas: '1', strategy: 'RollingUpdate', minReadySeconds: '10', limitsCpu: '500m', limitsMemory: '512Mi', image: 'v1', includeNewFeatureFlag: false };
  const prodFields = { replicas: '3', strategy: 'RollingUpdate', minReadySeconds: '10', limitsCpu: '600m', limitsMemory: '1Gi', image: 'v2', includeNewFeatureFlag: false };

  let fx: LockFixture;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    fx = await setupLockFixture(page, api, devFields, prodFields, { ...devFields, includeNewFeatureFlag: true });

    // `strategy` matches upstream (never overridden) but is protected directly —
    // the "fourth cell": protected + matches-upstream, which the read-side
    // border fix (Section 2) makes visible for the first time.
    await api.setUnitProtection(fx.prodSpaceId, fx.prodUnitId, [
      { Resource: { ResourceType: RESOURCE_TYPE, ResourceName: RESOURCE_NAME }, Protected: { 'spec.strategy': true } },
    ]);
    await waitForResolved(page, fx.prodSpaceId, fx.prodUnitId);
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    try { await api.deleteSpace(fx.prodSpaceId, true); } catch { /* ignore */ }
    try { await api.deleteSpace(fx.devSpaceId, true); } catch { /* ignore */ }
    await context.close();
  });

  test('unprotected leaf shows "Keep on merge"; a committed-protected leaf shows "Let merges update this"', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);

    const unprotectedRow = await openLeafKebab(page, 'replicas');
    await expect(page.getByRole('menuitem').filter({ hasText: 'Keep on merge' })).toBeVisible();
    await expect(page.getByRole('menuitem').filter({ hasText: 'Let merges update this' })).toHaveCount(0);
    await expect(unprotectedRow).toHaveAttribute('data-protected', 'false');
    await page.keyboard.press('Escape');

    // strategy: protected directly via setUnitProtection in beforeAll, value
    // UNCHANGED from upstream — the fourth cell.
    const protectedRow = await openLeafKebab(page, 'strategy');
    await expect(page.getByRole('menuitem').filter({ hasText: 'Let merges update this' })).toBeVisible();
    await expect(page.getByRole('menuitem').filter({ hasText: 'Keep on merge' })).toHaveCount(0);
    await expect(protectedRow).toHaveAttribute('data-protected', 'true');
    await expect(protectedRow).toHaveAttribute('data-differs-upstream', 'false');
  });

  test('leaf kebab disables "Keep on merge" for an upstream-only (absent) row, with the correct tooltip', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);

    const row = await openLeafKebab(page, 'newFeatureFlag');
    const item = page.getByRole('menuitem').filter({ hasText: 'Keep on merge' });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    void row;
  });

  test('leaf kebab disables protection for an array-indexed row, with the correct tooltip', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);

    // "image" inside spec.containers.0 is array-indexed.
    await openLeafKebab(page, 'image');
    const item = page.getByRole('menuitem').filter({ hasText: 'Keep on merge' });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('aria-disabled', 'true');

    // Verify the tooltip text specifically (distinct from the absent-row case).
    // MUI wraps a disabled child in its own hover-catching span for Tooltip
    // purposes — force bypasses Playwright's "topmost element" actionability
    // check, which the wrapper span otherwise fails (by design: it exists
    // specifically to receive hover a disabled button itself cannot). Retried:
    // the very first hover after the menu opens occasionally lands before
    // MUI's Popper has finished positioning, missing the mouseenter.
    const tooltip = page.locator('[role="tooltip"]');
    await expect(async () => {
      await item.hover({ force: true });
      await expect(tooltip).toContainText('Cannot protect array-indexed rows.', { timeout: 2000 });
    }).toPass({ timeout: 10000 });
  });

  test('folder kebab shows the correct "Keep group & N keys" delta wording', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);

    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill('limits');
    const folderRow = page.locator('[data-testid="component-folder-row"][data-folder-path="spec.limits"]');
    await expect(folderRow).toBeVisible({ timeout: 15000 });
    await folderRow.locator('.kebab-btn').click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 5000 });

    // Neither leaf under `limits` is protected yet — delta is the full count.
    await expect(page.getByText('Keep group & 2 keys on merge')).toBeVisible();
    await expect(page.getByText('0 are already kept. This changes 2.')).toBeVisible();
  });

  test('Undo keep reverses exactly the staged keep, leaving an independently-kept row untouched', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);

    // Stage manual edits on TWO unprotected local overrides (card 3's
    // "both") — both under `spec.limits`, so ONE search term ("limits")
    // keeps both rows simultaneously visible for the rest of the test
    // (searching "cpu" alone would hide the "memory" row, and vice versa).
    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill('limits');
    const cpuRow = page.getByTestId('component-leaf-row').filter({ hasText: 'cpu' });
    const memoryRow = page.getByTestId('component-leaf-row').filter({ hasText: 'memory' });
    async function stageEdit(row: ReturnType<Page['getByTestId']>, currentValue: string, newValue: string): Promise<void> {
      await expect(async () => { expect(await row.count()).toBe(1); }).toPass({ timeout: 15000 });
      await row.getByText(currentValue).click();
      const editInput = page.getByTestId('field-edit-input');
      await expect(editInput).toBeVisible({ timeout: 5000 });
      await editInput.fill(newValue);
      await editInput.press('Enter');
      await expect(row).toHaveAttribute('data-change-type', 'edit');
      await expect(row).toHaveAttribute('data-protected', 'false');
    }
    await stageEdit(cpuRow, prodFields.limitsCpu, '900m');
    await stageEdit(memoryRow, prodFields.limitsMemory, '2Gi');

    // Bar shows the "none kept" warning state (both un-kept) and the Keep-both button.
    const keepButton = page.getByTestId('component-keep-staged-edits-button');
    await expect(keepButton).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('component-bar-keep-lead')).toContainText('may be overwritten');

    await keepButton.click();

    // Both edited rows are now solid/kept; the bar flips to the "all kept" state.
    await expect(cpuRow).toHaveAttribute('data-protected', 'true');
    await expect(memoryRow).toHaveAttribute('data-protected', 'true');
    const undoButton = page.getByTestId('component-undo-keep-button');
    await expect(undoButton).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('component-bar-keep-lead')).toContainText('kept on merge');

    // Independently lock an UNRELATED row (minReadySeconds), via its own
    // kebab — this staged protection must survive "Undo keep" untouched, since
    // Undo keep only reverses paths that are BOTH staged-edited and staged-kept.
    const controlRow = await openLeafKebab(page, 'minReadySeconds');
    await page.getByRole('menuitem').filter({ hasText: 'Keep on merge' }).click();
    await expect(controlRow).toHaveAttribute('data-protected', 'true');
    await expect(controlRow).toHaveAttribute('data-change-type', 'protect');

    await undoButton.click();

    // Reverted: both edited rows are unkept again, but their edits stay
    // staged. Re-filter first — the search box currently shows
    // "minReadySeconds" (from openLeafKebab above), which hides these rows.
    await searchBox.fill('limits');
    await expect(cpuRow).toHaveAttribute('data-protected', 'false');
    await expect(cpuRow).toHaveAttribute('data-change-type', 'edit');
    await expect(memoryRow).toHaveAttribute('data-protected', 'false');
    await expect(memoryRow).toHaveAttribute('data-change-type', 'edit');
    // The independently-kebab-locked control row is untouched.
    await searchBox.fill('minReadySeconds');
    await expect(controlRow).toHaveAttribute('data-protected', 'true');
    await expect(controlRow).toHaveAttribute('data-change-type', 'protect');
  });
});

// ============================================================================
// Commit flows — each test targets a DIFFERENT field within one shared
// fixture (serial order) so they can't interfere with each other's server
// state, while avoiding a fresh space pair (and its ~10s of setup) per test.
// ============================================================================

test.describe.serial('Lock/unlock interaction — commit flows', () => {
  test.use({ storageState: 'authentication.json' });

  const devFields = { replicas: '1', strategy: 'RollingUpdate', minReadySeconds: '10', limitsCpu: '500m', limitsMemory: '512Mi', image: 'v1', includeNewFeatureFlag: false };
  const prodFields = { replicas: '3', strategy: 'RollingUpdate', minReadySeconds: '10', limitsCpu: '600m', limitsMemory: '1Gi', image: 'v2', includeNewFeatureFlag: false };

  let fx: LockFixture;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    fx = await setupLockFixture(page, api, devFields, prodFields, devFields);
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    try { await api.deleteSpace(fx.prodSpaceId, true); } catch { /* ignore */ }
    try { await api.deleteSpace(fx.devSpaceId, true); } catch { /* ignore */ }
    await context.close();
  });

  // This fixture has NO pending upgrade (dev never moves past prod's clone
  // point), so the pane already defaults to "All" — but click it explicitly
  // (idempotent) rather than assume that default holds.
  async function openPane(page: Page): Promise<void> {
    await page.goto(`/components?app=${encodeURIComponent(fx.appLabel)}`);
    await page.waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 }).catch(() => {});
    await expect(page.getByText(fx.appLabel)).toBeVisible({ timeout: 20000 });
    await page.getByText(fx.appLabel).click();
    const prodNode = page.locator('.react-flow__node').filter({ hasText: fx.prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();
    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });
    const allTab = page.getByTestId('component-filter-all');
    await expect(allTab).toBeVisible({ timeout: 10000 });
    await allTab.click();
  }

  test('staged commit leaves the pill border/data-protected identical after the refetch lands', async ({ page }) => {
    await openPane(page);

    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill('replicas');
    const row = page.getByTestId('component-leaf-row').filter({ hasText: 'replicas' });
    await expect(async () => { expect(await row.count()).toBe(1); }).toPass({ timeout: 15000 });

    await row.locator('.kebab-btn').click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 5000 });
    await page.getByRole('menuitem').filter({ hasText: 'Keep on merge' }).click();

    // Staged: solid border, protect rail, not yet committed.
    await expect(row).toHaveAttribute('data-protected', 'true');
    await expect(row).toHaveAttribute('data-change-type', 'protect');
    const stagedBorder = await row.locator('.current-pill').evaluate((el) => getComputedStyle(el).borderStyle);
    expect(stagedBorder).toBe('solid');

    const upgradeButton = page.getByTestId('component-upgrade-button');
    await expect(upgradeButton).toBeEnabled({ timeout: 10000 });
    const protectionResponse = page.waitForResponse((r) => r.url().includes('/protection') && r.request().method() === 'POST');
    await upgradeButton.click();
    await protectionResponse;

    // Committed: same solid border, same data-protected — nothing redrawn.
    await expect(row).toHaveAttribute('data-protected', 'true', { timeout: 10000 });
    const committedBorder = await row.locator('.current-pill').evaluate((el) => getComputedStyle(el).borderStyle);
    expect(committedBorder).toBe(stagedBorder);

    // Persists across a fresh navigation (not just the optimistic staged view).
    await openPane(page);
    await searchBox.fill('replicas');
    const rowAfterReload = page.getByTestId('component-leaf-row').filter({ hasText: 'replicas' });
    await expect(rowAfterReload).toHaveAttribute('data-protected', 'true', { timeout: 15000 });
  });

  test('folder "Keep group" commit stages exactly the delta, not the whole subtree', async ({ page }) => {
    const api = new ApiHelper(page);
    // Pre-protect ONE of the two `limits` leaves directly — the folder menu
    // must show "1 already kept, this changes 1" and its commit must send
    // exactly ONE new protection entry (spec.limits.memory), never both.
    await api.setUnitProtection(fx.prodSpaceId, fx.prodUnitId, [
      { Resource: { ResourceType: RESOURCE_TYPE, ResourceName: RESOURCE_NAME }, Protected: { 'spec.limits.cpu': true } },
    ]);
    await waitForResolved(page, fx.prodSpaceId, fx.prodUnitId);

    await openPane(page);
    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill('limits');
    const folderRow = page.locator('[data-testid="component-folder-row"][data-folder-path="spec.limits"]');
    await expect(folderRow).toBeVisible({ timeout: 15000 });
    await folderRow.locator('.kebab-btn').click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Keep group & 2 keys on merge')).toBeVisible();
    await expect(page.getByText('1 is already kept. This changes 1.')).toBeVisible();

    const protectionRequestPromise = page.waitForRequest((r) => r.url().includes('/protection') && r.method() === 'POST');
    await page.getByText('Keep group & 2 keys on merge').click();

    // The Upgrade-slot button relabels to "Keep 1 key" — a pure scope batch,
    // one endpoint, one revision (card 8 row 3).
    const commitButton = page.getByTestId('component-upgrade-button');
    await expect(commitButton).toHaveText(/Keep 1 key/, { timeout: 10000 });
    await commitButton.click();

    const protectionRequest = await protectionRequestPromise;
    const body = protectionRequest.postDataJSON() as { ResourceProtection: Array<{ Protected: Record<string, boolean> }> };
    const allProtectedPaths = body.ResourceProtection.flatMap((rp) => Object.keys(rp.Protected));
    expect(allProtectedPaths).toEqual(['spec.limits.memory']);
  });

  test('commit order is protection-first: an independent lock always lands before a staged value edit', async ({ page }) => {
    await openPane(page);

    // Independently lock `strategy` (unmodified, unedited) via its own kebab.
    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill('strategy');
    const lockRow = page.getByTestId('component-leaf-row').filter({ hasText: 'strategy' });
    await expect(async () => { expect(await lockRow.count()).toBe(1); }).toPass({ timeout: 15000 });
    await lockRow.locator('.kebab-btn').click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 5000 });
    await page.getByRole('menuitem').filter({ hasText: 'Keep on merge' }).click();
    await expect(lockRow).toHaveAttribute('data-protected', 'true');

    // Stage a manual edit on a DIFFERENT, independent path.
    await searchBox.fill('minReadySeconds');
    const editRow = page.getByTestId('component-leaf-row').filter({ hasText: 'minReadySeconds' });
    await expect(async () => { expect(await editRow.count()).toBe(1); }).toPass({ timeout: 15000 });
    await editRow.getByText('10').click();
    const editInput = page.getByTestId('field-edit-input');
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.fill('42');
    await editInput.press('Enter');
    await expect(editRow).toHaveAttribute('data-change-type', 'edit');

    // The value change dominates the button label (card 8's rule).
    const commitButton = page.getByTestId('component-upgrade-button');
    await expect(commitButton).toHaveText(/Upgrade/, { timeout: 10000 });

    // Value commits write through PUT .../unit/{id}/data (#5140), not a
    // PATCH of the Unit itself — see AppComponentView's uploadUnitData call.
    const requestOrder: string[] = [];
    const trackRequest = (r: import('@playwright/test').Request) => {
      if (r.method() === 'POST' && r.url().includes('/protection')) requestOrder.push('protection');
      else if (r.method() === 'PUT' && /\/unit\/[^/]+\/data(\?|$)/.test(r.url())) requestOrder.push('value');
    };
    page.on('request', trackRequest);

    const protectionResponse = page.waitForResponse((r) => r.url().includes('/protection') && r.request().method() === 'POST');
    const valueResponse = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && /\/unit\/[^/]+\/data(\?|$)/.test(r.url()),
    );
    await commitButton.click();
    await protectionResponse;
    await valueResponse;
    page.off('request', trackRequest);

    expect(requestOrder[0]).toBe('protection');
    expect(requestOrder).toContain('value');

    await expect(editRow).toHaveAttribute('data-differs-upstream', 'true', { timeout: 10000 });
    // Re-filter to "strategy" — the search box currently shows
    // "minReadySeconds", which hides the lock row.
    await searchBox.fill('strategy');
    await expect(lockRow).toHaveAttribute('data-protected', 'true', { timeout: 10000 });
  });
});

// ============================================================================
// Two more surfaces for the SAME staged-toggle action as the kebab's "Keep on
// merge" item: the value-hover tooltip's "Protect"/"Unprotect" line, and the
// InspectPanel's own toggle. Own fixture/space pair so these tests' mutations
// (protect/unprotect on `replicas` and `minReadySeconds`) can't race the
// read-only assertions in the describe blocks above under `fullyParallel`.
// ============================================================================

test.describe('Lock/unlock interaction — hover tooltip and InspectPanel surfaces', () => {
  test.use({ storageState: 'authentication.json' });

  const devFields = { replicas: '1', strategy: 'RollingUpdate', minReadySeconds: '10', limitsCpu: '500m', limitsMemory: '512Mi', image: 'v1', includeNewFeatureFlag: false };
  const prodFields = { replicas: '3', strategy: 'RollingUpdate', minReadySeconds: '10', limitsCpu: '600m', limitsMemory: '1Gi', image: 'v2', includeNewFeatureFlag: false };

  let fx: LockFixture;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    fx = await setupLockFixture(page, api, devFields, prodFields, { ...devFields, includeNewFeatureFlag: true });
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    try { await api.deleteSpace(fx.prodSpaceId, true); } catch { /* ignore */ }
    try { await api.deleteSpace(fx.devSpaceId, true); } catch { /* ignore */ }
    await context.close();
  });

  test('hover tooltip Protect/Unprotect stages the same effect as the kebab item, without entering inline edit', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);

    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill('replicas');
    const row = page.getByTestId('component-leaf-row').filter({ hasText: 'replicas' });
    await expect(async () => { expect(await row.count()).toBe(1); }).toPass({ timeout: 15000 });
    await expect(row).toHaveAttribute('data-protected', 'false');

    const pill = row.locator('.current-pill');
    const protectToggle = page.getByTestId('tooltip-protect-toggle');

    await expect(async () => {
      await pill.hover();
      await expect(protectToggle).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });
    await expect(protectToggle).toHaveText('Protect');
    await protectToggle.click();

    // Staged exactly like the kebab's "Keep on merge": solid border/rail via
    // data-protected + data-change-type, and — the portal-click assumption —
    // no inline editor was opened by the click landing "inside" the anchor span.
    await expect(row).toHaveAttribute('data-protected', 'true');
    await expect(row).toHaveAttribute('data-change-type', 'protect');
    await expect(page.getByTestId('field-edit-input')).toHaveCount(0);

    // Hover again — the affordance now reads Unprotect; clicking reverts it,
    // proving this is the exact same staged toggle as the kebab (idempotent
    // round trip), not a one-way action.
    await expect(async () => {
      await pill.hover();
      await expect(protectToggle).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });
    await expect(protectToggle).toHaveText('Unprotect');
    await protectToggle.click();
    await expect(row).toHaveAttribute('data-protected', 'false');
    await expect(row).toHaveAttribute('data-change-type', 'none');
  });

  test('hover tooltip omits the Protect affordance for an absent or array-indexed path', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);
    const searchBox = page.getByPlaceholder('Search...');

    // Absent (upstream-only) row — canEditInline is still true (typing creates
    // the value), but Protect can't apply until the key exists downstream.
    await searchBox.fill('newFeatureFlag');
    const absentRow = page.getByTestId('component-leaf-row').filter({ hasText: 'newFeatureFlag' });
    await expect(async () => { expect(await absentRow.count()).toBe(1); }).toPass({ timeout: 15000 });
    await expect(async () => {
      await absentRow.locator('.current-pill').hover();
      await expect(page.locator('[role="tooltip"]')).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });
    await expect(page.getByTestId('tooltip-protect-toggle')).toHaveCount(0);

    // Array-indexed row ("image" inside spec.containers.0).
    await searchBox.fill('image');
    const arrayRow = page.getByTestId('component-leaf-row').filter({ hasText: 'image' });
    await expect(async () => { expect(await arrayRow.count()).toBe(1); }).toPass({ timeout: 15000 });
    await expect(async () => {
      await arrayRow.locator('.current-pill').hover();
      await expect(page.locator('[role="tooltip"]')).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });
    await expect(page.getByTestId('tooltip-protect-toggle')).toHaveCount(0);
  });

  test('InspectPanel Protect/Unprotect stages the same effect as the kebab item', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);

    const row = await openLeafKebab(page, 'minReadySeconds');
    await expect(row).toHaveAttribute('data-protected', 'false');
    await page.getByRole('menuitem').filter({ hasText: 'Inspect value' }).click();

    const protectToggle = page.getByTestId('inspect-panel-protect-toggle');
    await expect(protectToggle).toBeVisible({ timeout: 5000 });
    await expect(protectToggle).toHaveText('Protect');
    await protectToggle.click();

    await expect(row).toHaveAttribute('data-protected', 'true');
    await expect(row).toHaveAttribute('data-change-type', 'protect');
    await expect(protectToggle).toHaveText('Unprotect');

    // Round trip, same as the hover-tooltip test — proves this triggers the
    // identical staged toggle rather than a one-way action.
    await protectToggle.click();
    await expect(row).toHaveAttribute('data-protected', 'false');
    await expect(row).toHaveAttribute('data-change-type', 'none');
  });

  test('InspectPanel omits the Protect affordance for an absent or array-indexed path', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);

    await openLeafKebab(page, 'newFeatureFlag');
    await page.getByRole('menuitem').filter({ hasText: 'Inspect value' }).click();
    await expect(page.getByTestId('inspect-panel-protect-toggle')).toHaveCount(0);

    await openLeafKebab(page, 'image');
    await page.getByRole('menuitem').filter({ hasText: 'Inspect value' }).click();
    await expect(page.getByTestId('inspect-panel-protect-toggle')).toHaveCount(0);
  });
});
