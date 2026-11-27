// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import type { UnitGuardRequest } from '@confighub/rtk-query';
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
// kept with no staged interaction — a state `uploadUnitData({protect:
// true})` (write-time keep) cannot represent — it goes through
// `api.setUnitGuard` directly, the same endpoint the UI's kebab/commit flow
// calls to set the Override guard.
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
  // A Unit is released to its Space's release Target.
  await api.updateSpace({ spaceId: devSpaceId, space: { ReleaseTargetID: devTargetData.TargetID } });
  await api.updateSpace({ spaceId: prodSpaceId, space: { ReleaseTargetID: prodTargetData.TargetID } });

  const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
    params: { allow_exists: 'true' },
    data: { Slug: slug, ToolchainType: 'Kubernetes/YAML' },
  });
  if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
  const devUnitData = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

  // Data is no longer a patchable Unit attribute (#5140) — written through
  // the dedicated PUT .../data endpoint, as raw text (not base64).
  await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: buildDeploymentYaml(devFields) });

  const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
    params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitData.UnitID },
    data: { Slug: slug, ToolchainType: 'Kubernetes/YAML' },
  });
  if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
  const prodUnitData = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

  // Prod diverges — UNPROTECTED, plain write (protect defaults to false).
  await api.uploadUnitData({ spaceId: prodSpaceId, unitId: prodUnitData.UnitID, body: buildDeploymentYaml(prodFields) });

  // Dev bumps to rev2 (e.g. adding `newFeatureFlag`) — gives prod a genuine
  // pending upgrade, so upstream-only fields actually appear as absent
  // ("isAbsentCurrent") rows: the tree adds a row with no value of the unit's own
  // only for a key of the upgrade diff, which requires a real revision gap.
  await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: buildDeploymentYaml(devFieldsRev2) });

  await waitForResolved(page, devSpaceId, devUnitData.UnitID);
  await waitForResolved(page, prodSpaceId, prodUnitData.UnitID);

  return { appLabel, devSpaceId, prodSpaceId, devUnitId: devUnitData.UnitID, prodUnitId: prodUnitData.UnitID, prodTargetSlug };
}

async function openProdPane(page: Page, appLabel: string, prodTargetSlug: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page.waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 }).catch(() => {});
  // The trail names the Component too, so the tree item is found by its test id.
  const treeItem = page.getByTestId(`app-tree-item-${appLabel}`);
  await expect(treeItem).toBeVisible({ timeout: 20000 });
  await treeItem.click();
  const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
  await expect(prodNode).toBeVisible({ timeout: 10000 });
  await prodNode.click();
  // The pane is ready: its scope chips are drawn (the footer shows only when something is staged).
  await expect(page.getByTestId('component-filter-all')).toBeVisible({ timeout: 10000 });
  // The fixture always has exactly one pending upgrade (`newFeatureFlag`) —
  // gate on the dry-run having actually landed before switching tabs, not a
  // bare timeout (which would let `upstreamOnlyPaths` still be empty).
  await expect(page.getByTestId('component-incoming-count')).toHaveText('1', { timeout: 20000 });
  const allTab = page.getByTestId('component-filter-all');
  await expect(allTab).toBeVisible({ timeout: 10000 });
  await allTab.click();
}

// The sheet's fields are found by their path; a kept field carries a lock after its value.
const sheetField = (page: Page, path: string) => page.locator(`.bbody .v[data-path="${path}"]`);
const keptMark = (page: Page, path: string) =>
  page.locator('.vm', { has: page.locator(`.v[data-path="${path}"]`) }).locator('[data-testid^="field-kept-"]');
async function keepViaCluster(page: Page, path: string): Promise<void> {
  await sheetField(page, path).hover();
  await page.getByTestId('field-action-keep').click();
}
async function stageValue(page: Page, path: string, newValue: string): Promise<void> {
  await sheetField(page, path).click();
  const input = page.getByTestId('field-editor-input');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(newValue);
  await input.press('Enter');
  await expect(sheetField(page, path)).toHaveClass(/staged/);
}

test.describe('Lock/unlock interaction — Undo keep', () => {
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

  test('Undo keep reverses exactly the staged keep, leaving an independently-kept field untouched', async ({ page }) => {
    await openProdPane(page, fx.appLabel, fx.prodTargetSlug);

    // Stage manual edits on TWO unprotected local overrides (card 3's "both").
    await stageValue(page, 'spec.limits.cpu', '900m');
    await stageValue(page, 'spec.limits.memory', '2Gi');

    // The bar shows the "none kept" warning state (both un-kept) and the Keep-both button.
    const keepButton = page.getByTestId('component-keep-staged-edits-button');
    await expect(keepButton).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('component-bar-keep-lead')).toContainText('may be overwritten');

    await keepButton.click();

    // Both edited fields are now kept; the bar flips to the "all kept" state.
    await expect(keptMark(page, 'spec.limits.cpu')).toBeVisible();
    await expect(keptMark(page, 'spec.limits.memory')).toBeVisible();
    const undoButton = page.getByTestId('component-undo-keep-button');
    await expect(undoButton).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('component-bar-keep-lead')).toContainText('kept on merge');

    // Independently keep an UNRELATED field (minReadySeconds) from its own hover cluster: this
    // staged keep must survive "Undo keep", which only reverses fields both edited and kept.
    await keepViaCluster(page, 'spec.minReadySeconds');
    await expect(keptMark(page, 'spec.minReadySeconds')).toBeVisible();

    await undoButton.click();

    // Reverted: both edited fields are unkept again, but their edits stay staged.
    await expect(keptMark(page, 'spec.limits.cpu')).toHaveCount(0);
    await expect(keptMark(page, 'spec.limits.memory')).toHaveCount(0);
    await expect(sheetField(page, 'spec.limits.cpu')).toHaveClass(/staged/);
    await expect(sheetField(page, 'spec.limits.memory')).toHaveClass(/staged/);
    // The independently kept field is untouched.
    await expect(keptMark(page, 'spec.minReadySeconds')).toBeVisible();
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
    await expect(page.getByTestId(`app-tree-item-${fx.appLabel}`)).toBeVisible({ timeout: 20000 });
    await page.getByTestId(`app-tree-item-${fx.appLabel}`).click();
    const prodNode = page.locator('.react-flow__node').filter({ hasText: fx.prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();
    // The pane is ready: its scope chips are drawn (the footer shows only when something is staged).
  await expect(page.getByTestId('component-filter-all')).toBeVisible({ timeout: 10000 });
    const allTab = page.getByTestId('component-filter-all');
    await expect(allTab).toBeVisible({ timeout: 10000 });
    await allTab.click();
  }

  test('a staged keep is written by the footer and stays kept after the refetch lands', async ({ page }) => {
    await openPane(page);

    await keepViaCluster(page, 'spec.replicas');
    // Staged: the lock in rust, not yet committed.
    await expect(keptMark(page, 'spec.replicas')).toBeVisible();

    const upgradeButton = page.getByTestId('component-upgrade-button');
    await expect(upgradeButton).toBeEnabled({ timeout: 10000 });
    const protectionResponse = page.waitForResponse((r) => r.url().includes('/guard') && r.request().method() === 'POST');
    await upgradeButton.click();
    await protectionResponse;

    // Committed: the same lock, nothing redrawn.
    await expect(keptMark(page, 'spec.replicas')).toBeVisible({ timeout: 10000 });

    // Persists across a fresh navigation (not just the optimistic staged view).
    await openPane(page);
    await expect(keptMark(page, 'spec.replicas')).toBeVisible({ timeout: 15000 });
  });

  test('folder "Keep group" commit stages exactly the delta, not the whole subtree', async ({ page }) => {
    const api = new ApiHelper(page);
    // Pre-protect ONE of the two `limits` leaves directly — the folder menu
    // must show "1 already kept, this changes 1" and its commit must send
    // exactly ONE new protection entry (spec.limits.memory), never both.
    await api.setUnitGuard(fx.prodSpaceId, fx.prodUnitId, {
      ResourceGuards: [
        { Resource: { ResourceType: RESOURCE_TYPE, ResourceName: RESOURCE_NAME }, Set: { 'spec.limits.cpu': { Override: 'Upstream' } } },
      ],
    });
    await waitForResolved(page, fx.prodSpaceId, fx.prodUnitId);

    await openPane(page);
    // Hover the Limits block label: "Keep this block on merge" stages only the delta (1 key).
    const limits = page.locator('.blk', { has: page.locator('.v[data-path="spec.limits.cpu"]') });
    await expect(limits).toBeVisible({ timeout: 15000 });
    await expect(keptMark(page, 'spec.limits.cpu')).toBeVisible();
    await expect(keptMark(page, 'spec.limits.memory')).toHaveCount(0);
    await limits.scrollIntoViewIfNeeded();
    // The block's own row label: a value's hover card hides the block's actions.
    await limits.locator('.blabel').hover();

    const protectionRequestPromise = page.waitForRequest((r) => r.url().includes('/guard') && r.method() === 'POST');
    await limits.getByTestId('block-action-keep').click();

    // The Upgrade-slot button relabels to "Keep 1 key" — a pure scope batch,
    // one endpoint, one revision (card 8 row 3).
    const commitButton = page.getByTestId('component-upgrade-button');
    await expect(commitButton).toHaveText(/Keep 1 key/, { timeout: 10000 });
    await commitButton.click();

    const protectionRequest = await protectionRequestPromise;
    const body = protectionRequest.postDataJSON() as UnitGuardRequest;
    const keptPaths = (body.ResourceGuards ?? []).flatMap((rg) => Object.keys(rg.Set ?? {}));
    expect(keptPaths).toEqual(['spec.limits.memory']);
    expect(body.ResourceGuards?.[0]?.Set?.['spec.limits.memory']).toEqual({ Override: 'Upstream' });
  });

  // A value write goes first: a lock set before it would withhold a staged edit of the path it
  // keeps. Both land either way.
  test('commit order: a staged value edit lands before the locks committed with it', async ({ page }) => {
    await openPane(page);

    // Independently keep `strategy` (unmodified, unedited) from its hover cluster.
    await keepViaCluster(page, 'spec.strategy');
    await expect(keptMark(page, 'spec.strategy')).toBeVisible();

    // Stage a manual edit on a DIFFERENT, independent path.
    await stageValue(page, 'spec.minReadySeconds', '42');

    // The value change dominates the button label (card 8's rule).
    const commitButton = page.getByTestId('component-upgrade-button');
    await expect(commitButton).toHaveText(/Update/, { timeout: 10000 });

    // Value commits write through PUT .../unit/{id}/data (#5140), not a
    // PATCH of the Unit itself — see AppComponentView's uploadUnitData call.
    const requestOrder: string[] = [];
    const trackRequest = (r: import('@playwright/test').Request) => {
      if (r.method() === 'POST' && r.url().includes('/guard')) requestOrder.push('protection');
      else if (r.method() === 'PUT' && /\/unit\/[^/]+\/data(\?|$)/.test(r.url())) requestOrder.push('value');
    };
    page.on('request', trackRequest);

    const protectionResponse = page.waitForResponse((r) => r.url().includes('/guard') && r.request().method() === 'POST');
    const valueResponse = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && /\/unit\/[^/]+\/data(\?|$)/.test(r.url()),
    );
    await commitButton.click();
    await protectionResponse;
    await valueResponse;
    page.off('request', trackRequest);

    expect(requestOrder[0]).toBe('value');
    expect(requestOrder).toContain('protection');

    await expect(sheetField(page, 'spec.minReadySeconds')).toHaveText('42', { timeout: 10000 });
    await expect(keptMark(page, 'spec.strategy')).toBeVisible({ timeout: 10000 });
  });
});
