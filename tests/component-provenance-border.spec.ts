// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Provenance border (Layer 1) E2E
//
// Guards the fix in entryBuilders.ts:buildVariationEntries — the value border
// reads `variationEntry.liveFieldDiffs`, a set built from upstream HEAD vs. the
// unit's CURRENT COMMITTED data (never the dry-run). Before this fix the border
// would have read the dry-run-tainted `fieldDiffs`, which goes EMPTY the moment
// an unprotected local override is about to be overwritten by a landed dry-run
// — exactly the case this border exists to flag.
//
// Fixture: a dev unit with two fields (`replicas`, `untouched`), cloned
// downstream to prod with an upstream link. Prod locally overrides `replicas`
// (unprotected) while `untouched` is left alone. Dev then bumps `replicas`
// again, so prod has a pending, unblocked upgrade on the exact path it diverged
// on. Once the dry-run lands, the pending merge would overwrite prod's
// `replicas` back to dev's value — so post-merge the two are equal and the
// OLD (dry-run-based) diff set goes empty, while prod's CURRENT committed data
// still differs from upstream right now.
// ============================================================================

const APP_LABEL = `e2e-prov-border-${RandomSlugGenerator.randomSlugName()}`;

function buildYaml(replicas: string, untouched: string): string {
  return [
    'apiVersion: v1',
    'kind: ConfigMap',
    'metadata:',
    '  name: prov-border-config',
    'data:',
    `  replicas: "${replicas}"`,
    `  untouched: "${untouched}"`,
  ].join('\n');
}

async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
}

test.describe('provenance border (differs-from-upstream) survives a landed dry-run', () => {
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

    // Dev unit, rev1: replicas="1", untouched="same".
    const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'prov-border-config', ToolchainType: 'Kubernetes/YAML', TargetID: devTargetData.TargetID },
    });
    if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
    const devUnitData = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

    // Data is no longer a patchable Unit attribute (#5140) — written through
    // the dedicated PUT .../data endpoint, as raw text (not base64).
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: buildYaml('1', 'same') });

    // Clone dev → prod (upstream link) while dev is at rev1.
    const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
      params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitData.UnitID },
      data: { Slug: 'prov-border-config', ToolchainType: 'Kubernetes/YAML', TargetID: prodTargetData.TargetID },
    });
    if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
    const prodUnitData = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

    // Prod diverges: replicas set to "3" locally, WITHOUT protect. untouched is
    // left alone at "same" — the plain-case comparison path.
    await api.uploadUnitData({ spaceId: prodSpaceId, unitId: prodUnitData.UnitID, body: buildYaml('3', 'same') });

    // Dev bumps to rev2: replicas="5". Prod now has a pending upgrade on the
    // exact path it diverged on — the dry-run will overwrite 3 with 5.
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: buildYaml('5', 'same') });

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

  // T1 — THE regression test. Pre-fix this is "false": the dry-run merges 5
  // over the unprotected 3, post-upgrade data equals upstream, and the path
  // leaves the (dry-run-based) fieldDiffs set. Post-fix, liveFieldDiffs compares
  // upstream against prod's CURRENT committed data (still 3) and the path stays.
  test('an unprotected override about to be overwritten by a landed dry-run still shows the border', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });

    // Gate on the dry-run having actually landed and having found the pending
    // upgrade — not a bare timeout, which would pass vacuously pre-dry-run.
    await expect(page.getByTestId('component-incoming-count')).toHaveText('1', { timeout: 20000 });

    // The pane defaults to the Incoming/Upgradable filter for a node with a real
    // upgrade, which is already narrowed to upgradable rows — so `replicas`
    // showing here also proves it is simultaneously listed as upgradable.
    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill('replicas');

    const leafRow = page.getByTestId('component-leaf-row').filter({ hasText: 'replicas' });
    await expect(async () => {
      expect(await leafRow.count()).toBe(1);
    }).toPass({ timeout: 15000 });

    await expect(leafRow).toHaveAttribute('data-differs-upstream', 'true', { timeout: 10000 });
  });

  // T2 — plain case: `untouched` never diverged from upstream (both are "same"),
  // so it must render with NO border.
  test('a path that never diverged from upstream shows no border', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });
    const allTab = page.getByTestId('component-filter-all');
    await expect(allTab).toBeVisible({ timeout: 10000 });
    await allTab.click();

    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill('untouched');

    const leafRow = page.getByTestId('component-leaf-row').filter({ hasText: 'untouched' });
    await expect(async () => {
      expect(await leafRow.count()).toBe(1);
    }).toPass({ timeout: 15000 });

    await expect(leafRow).toHaveAttribute('data-differs-upstream', 'false', { timeout: 10000 });
  });

  // T3 — a staged (uncommitted) manual edit must show the border IMMEDIATELY,
  // before commit — liveVariationPaths is built from committed data and cannot
  // see the edit yet, so this path is `hasStagedEdit`, not `liveVariationPaths`.
  // Reverting (unchecking the staged-edit pill) must drop the border again.
  test('a staged, uncommitted edit shows the border immediately, and losing it on revert', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });
    const allTab = page.getByTestId('component-filter-all');
    await expect(allTab).toBeVisible({ timeout: 10000 });
    await allTab.click();

    const searchBox = page.getByPlaceholder('Search...');
    await searchBox.fill('untouched');

    const leafRow = page.getByTestId('component-leaf-row').filter({ hasText: 'untouched' });
    await expect(async () => {
      expect(await leafRow.count()).toBe(1);
    }).toPass({ timeout: 15000 });

    // Sanity: unedited, this path matches upstream — no border.
    await expect(leafRow).toHaveAttribute('data-differs-upstream', 'false', { timeout: 10000 });

    // Inline-edit the value (deferred — nothing written until commit).
    await leafRow.getByText('same').click();
    const editInput = page.getByTestId('field-edit-input');
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.fill('same-but-edited');
    await editInput.press('Enter');

    // The border must appear the instant the edit is staged, before any commit.
    await expect(leafRow.locator('.pill-group.pill-staged')).toHaveCount(1, { timeout: 10000 });
    await expect(leafRow).toHaveAttribute('data-differs-upstream', 'true', { timeout: 10000 });

    // Revert the staged edit (uncheck its pill) — the border must clear again.
    // A plain click (not .uncheck()) on the checkbox's own visible box, rather
    // than the input, avoids Playwright's post-action "wait for navigation"
    // actionability check hanging on this MUI-wrapped control.
    const pill = leafRow.getByTestId('component-upgrade-pill');
    await pill.locator('input[type="checkbox"]').click({ force: true });
    await expect(leafRow).toHaveAttribute('data-differs-upstream', 'false', { timeout: 10000 });
  });

  // T4 — no-regression on the counts the dry-run-tainted sets still drive. This
  // fixture yields exactly one real upgradable field (`replicas`: 3 → 5) and
  // zero local overrides / local-only paths under those (unchanged) sets — the
  // guard fix in buildVariationEntries must not have drifted any of them.
  test('the Local overrides / Local only / Incoming counts are unaffected by the border fix', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('component-incoming-count')).toHaveText('1', { timeout: 20000 });

    const allTab = page.getByTestId('component-filter-all');
    await expect(allTab).toBeVisible({ timeout: 10000 });
    await allTab.click();

    await expect(page.getByTestId('component-local-overrides-count')).toHaveText('0', { timeout: 10000 });
    await expect(page.getByTestId('component-local-only-count')).toHaveText('0', { timeout: 10000 });
    // Re-assert the Incoming count is still 1 in this view (it does not depend
    // on the active Scope filter tab).
    await expect(page.getByTestId('component-incoming-count')).toHaveText('1', { timeout: 5000 });
  });
});

// ============================================================================
// "Kept on merge" chip (Layer 2) E2E
//
// The chip reads `variationEntry.liveFieldDiffs` (L2.3/L2.4 in
// ComponentSidePane.tsx), never the dry-run-tainted `fieldDiffs` the
// neighbouring "Local overrides" chip reads — the two can disagree, which is
// exactly why the chip's own tooltip is built from L/M (both liveFieldDiffs-
// sourced), never from the "Local overrides" count.
//
// Protection is never assumed from setup: `Protected` defaults to false, so
// every fixture below writes an UNPROTECTED override with a plain
// `api.uploadUnitData` and a PROTECTED one via `api.uploadUnitData({protect:
// true})` explicitly — nothing here relies on a path having come out already
// protected.
// ============================================================================

async function waitForResolved(page: Page, spaceId: string, unitId: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
    if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

interface L2Fixture {
  appLabel: string;
  devSpaceId: string;
  prodSpaceId: string;
  devUnitId: string;
  prodUnitId: string;
  prodTargetSlug: string;
}

/**
 * Build a fresh dev→prod (upstream-linked) unit pair seeded with `devYaml`,
 * for a "Kept on merge" fixture. Each L2 test gets its OWN pair (rather than
 * sharing the T1-T4 fixture above) because they need distinct resource shapes
 * (a plain multi-scalar ConfigMap for T5, a Deployment with a container array
 * for T7) that would only obscure each other if combined.
 */
async function setupL2Fixture(page: Page, api: ApiHelper, devYaml: string): Promise<L2Fixture> {
  const appLabel = `e2e-kept-on-merge-${RandomSlugGenerator.randomSlugName()}`;
  const slug = 'kept-on-merge-config';
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
  await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: devYaml });

  // Clone dev → prod (upstream link) while dev is at rev1. Dev never moves
  // again in these fixtures — the chip's L/M/N come from `liveFieldDiffs`
  // (upstream HEAD vs. prod's current data), which needs no pending upgrade.
  const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
    params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitData.UnitID },
    data: { Slug: slug, ToolchainType: 'Kubernetes/YAML', TargetID: prodTargetData.TargetID },
  });
  if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
  const prodUnitData = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

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
  // Neither fixture below has a pending upgrade (dev never moves past prod's
  // clone point), so the pane already defaults to the "All" tab — but click it
  // explicitly (idempotent) rather than assume that default holds.
  const allTab = page.getByTestId('component-filter-all');
  await expect(allTab).toBeVisible({ timeout: 10000 });
  await allTab.click();
}

test.describe('Kept on merge chip (L2)', () => {
  test.use({ storageState: 'authentication.json' });

  // T5 — protected path. Two scalar local overrides in prod: fieldA
  // unprotected (plain write), fieldB protected (via `protect: true`). The
  // chip must read 1 of 2 and be amber (risk), and — since L === M here (both
  // overrides are checkable, nothing excluded) — the tooltip's array-path
  // disclosure sentence must be ABSENT (it would be noise).
  test('a protected local override counts toward N; an unprotected one does not', async ({ page }) => {
    const api = new ApiHelper(page);
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());

    const devYaml = ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: kept-on-merge-config', 'data:', '  fieldA: "1"', '  fieldB: "1"'].join('\n');
    const { appLabel, devSpaceId, prodSpaceId, prodUnitId, prodTargetSlug } = await setupL2Fixture(page, api, devYaml);

    // fieldA: unprotected override (plain write, protect defaults to false).
    // Data is no longer a patchable Unit attribute (#5140) — written through
    // the dedicated PUT .../data endpoint, as raw text (not base64).
    await api.uploadUnitData({
      spaceId: prodSpaceId,
      unitId: prodUnitId,
      body: ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: kept-on-merge-config', 'data:', '  fieldA: "3"', '  fieldB: "1"'].join('\n'),
    });
    // fieldB: protected override — fieldA is unchanged by this write, so it
    // keeps its prior (unprotected) record.
    await api.uploadUnitData({
      spaceId: prodSpaceId,
      unitId: prodUnitId,
      body: ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: kept-on-merge-config', 'data:', '  fieldA: "3"', '  fieldB: "30"'].join('\n'),
      protect: true,
    });
    await waitForResolved(page, prodSpaceId, prodUnitId);

    await openProdPane(page, appLabel, prodTargetSlug);

    const chip = page.getByTestId('component-kept-on-merge-chip');
    await expect(chip).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('component-kept-on-merge-count')).toHaveText('1 of 2');
    await expect(chip).toHaveAttribute('data-risk', 'true');

    // Tooltip: L === M (2 === 2), so the array-path disclosure sentence must
    // be absent — it would be noise on a fixture with nothing excluded.
    await chip.hover();
    const tooltip = page.locator('[role="tooltip"]');
    await expect(tooltip).toContainText('A merge from upstream will keep 1 of these 2 values and overwrite the rest.');
    await expect(tooltip).not.toContainText('can be checked');

    await api.deleteSpace(prodSpaceId, true).catch(() => {});
    await api.deleteSpace(devSpaceId, true).catch(() => {});
  });

  // T6 — ancestor/resource inheritance (ladder rungs 2 and 3). NOT constructed
  // through the API in this pass: `yamlkit.recordAddedSubtree`
  // (public/core/configkit/yamlkit/mutations.go) recurses into every newly
  // added mapping node and records one mutation per LEAF, never one at the
  // subtree's own root — so "add a new nested object" does not produce an
  // ancestor-level PathMutationMap entry to inherit from. The only path that
  // logs a mutation at a non-leaf key is a scalar-to-map TYPE change on an
  // existing field, which has no realistic construction against a normal
  // Kubernetes resource without corrupting its schema. Leaving this as
  // test.fixme per the plan's own fallback rather than forcing a fixture that
  // doesn't actually exercise the ladder.
  test.fixme(
    'a path protected only via an ancestor entry, or the resource-level flag, counts toward N',
    async () => {},
  );

  // T7 — array exclusion. One array-indexed override
  // (spec.template.spec.containers.0.image) plus one scalar override
  // (spec.replicas), both unprotected. The chip must read "… of 1", never
  // "… of 2" and never "0 of 2" — the array path is excluded from BOTH N and
  // M. Since L (2) > M (1) here, the tooltip's disclosure sentence must be
  // PRESENT.
  test('an array-indexed override is excluded from both N and M', async ({ page }) => {
    const api = new ApiHelper(page);
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());

    const buildDeploymentYaml = (replicas: string, image: string) => [
      'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: kept-on-merge-config',
      'spec:', `  replicas: "${replicas}"`, '  template:', '    spec:', '      containers:',
      '      - name: app', `        image: "${image}"`,
    ].join('\n');

    const devYaml = buildDeploymentYaml('1', 'v1');
    const { appLabel, devSpaceId, prodSpaceId, prodUnitId, prodTargetSlug } = await setupL2Fixture(page, api, devYaml);

    // Unprotected overrides on BOTH a scalar path (spec.replicas) and an
    // array-indexed path (spec.template.spec.containers.0.image).
    await api.uploadUnitData({ spaceId: prodSpaceId, unitId: prodUnitId, body: buildDeploymentYaml('3', 'v2') });
    await waitForResolved(page, prodSpaceId, prodUnitId);

    await openProdPane(page, appLabel, prodTargetSlug);

    const chip = page.getByTestId('component-kept-on-merge-chip');
    await expect(chip).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('component-kept-on-merge-count')).toHaveText('0 of 1');

    await chip.hover();
    const tooltip = page.locator('[role="tooltip"]');
    await expect(tooltip).toContainText('1 of 2 local overrides can be checked. Values inside lists are not checked yet.');

    await api.deleteSpace(prodSpaceId, true).catch(() => {});
    await api.deleteSpace(devSpaceId, true).catch(() => {});
  });
});
