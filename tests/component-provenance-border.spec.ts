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
  await expect(page.getByTestId(`app-tree-item-${appLabel}`)).toBeVisible({ timeout: 20000 });
  await page.getByTestId(`app-tree-item-${appLabel}`).click();
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
    // A Unit is released to its Space's release Target.
    await api.updateSpace({ spaceId: devSpaceId, space: { ReleaseTargetID: devTargetData.TargetID } });
    await api.updateSpace({ spaceId: prodSpaceId, space: { ReleaseTargetID: prodTargetData.TargetID } });

    // Dev unit, rev1: replicas="1", untouched="same".
    const devUnitResp = await hubApi.post(`/api/space/${devSpaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'prov-border-config', ToolchainType: 'Kubernetes/YAML' },
    });
    if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
    const devUnitData = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit;

    // Data is no longer a patchable Unit attribute (#5140) — written through
    // the dedicated PUT .../data endpoint, as raw text (not base64).
    await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: buildYaml('1', 'same') });

    // Clone dev → prod (upstream link) while dev is at rev1.
    const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
      params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitData.UnitID },
      data: { Slug: 'prov-border-config', ToolchainType: 'Kubernetes/YAML' },
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

    // The pane is ready: its scope chips are drawn (the footer shows only when something is staged).
  await expect(page.getByTestId('component-filter-all')).toBeVisible({ timeout: 10000 });

    // Gate on the dry-run having actually landed and having found the pending
    // upgrade — not a bare timeout, which would pass vacuously pre-dry-run.
    await expect(page.getByTestId('component-incoming-count')).toHaveText('1', { timeout: 20000 });

    // The pane opens on Incoming for a node with a real upgrade. The sheet has no provenance
    // border: a field this Unit set is bold, and the field keeps its own value in All while the
    // dry run is about to overwrite it.
    await page.getByTestId('component-filter-all').click();
    const replicas = page.locator('.bbody .v[data-path="data.replicas"]');
    await expect(replicas).toHaveText('3', { timeout: 15000 });
    await expect(replicas).toHaveClass(/\bhere\b/);
  });

  // T3 — a staged (uncommitted) manual edit must show the border IMMEDIATELY,
  // before commit — liveVariationKeys is built from committed data and cannot
  // see the edit yet, so this path is `hasStagedEdit`, not `liveVariationKeys`.
  // Reverting (unchecking the staged-edit pill) must drop the border again.
  test('a staged, uncommitted edit shows the border immediately, and losing it on revert', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
    await expect(prodNode).toBeVisible({ timeout: 10000 });
    await prodNode.click();

    // The pane is ready: its scope chips are drawn (the footer shows only when something is staged).
  await expect(page.getByTestId('component-filter-all')).toBeVisible({ timeout: 10000 });
    const allTab = page.getByTestId('component-filter-all');
    await expect(allTab).toBeVisible({ timeout: 10000 });
    await allTab.click();

    const untouched = page.locator('.bbody .v[data-path="data.untouched"]');
    await expect(untouched).toHaveText('same', { timeout: 15000 });
    // Sanity: unedited, this field matches upstream and is not a change.
    await expect(page.getByTestId('scope-changes')).toContainText('0');

    // Edit the value (deferred: nothing is written until the footer commits).
    await untouched.click();
    const editInput = page.getByTestId('field-editor-input');
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.fill('same-but-edited');
    await editInput.press('Enter');

    // The change shows the instant the edit is staged, before any commit, in the footer. The
    // Changes count is the Unreleased fields only, so it stays.
    await expect(untouched).toHaveClass(/staged/, { timeout: 10000 });
    await expect(page.getByTestId('component-upgrade-button')).toHaveText('Update 1');
    await expect(page.getByTestId('scope-changes')).toContainText('0');

    // Typing the value the Unit holds takes the staged edit back: the change clears again.
    await untouched.click();
    await page.getByTestId('field-editor-input').fill('same');
    await page.getByTestId('field-editor-input').press('Enter');
    await expect(untouched).not.toHaveClass(/staged/, { timeout: 10000 });
    await expect(page.getByTestId('component-upgrade-button')).toHaveCount(0);
  });
});

// ============================================================================
// "Kept on merge" chip (Layer 2) E2E
//
// The chip reads `variationEntry.liveFieldDiffs` (L2.3/L2.4 in
// ComponentSidePane.tsx), never the dry-run-tainted `fieldDiffs` the
// neighbouring "Local overrides" chip reads — the two can disagree.
//
// Protection is never assumed from setup: `Protected` defaults to false, so
// the fixture below writes an UNPROTECTED override with a plain
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
 * for the "Kept on merge" fixture. Its own pair rather than the T1/T3 fixture
 * above, because the chip's overrides need no pending upgrade.
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
  await api.uploadUnitData({ spaceId: devSpaceId, unitId: devUnitData.UnitID, body: devYaml });

  // Clone dev → prod (upstream link) while dev is at rev1. Dev never moves
  // again in this fixture — the chip's L/M/N come from `liveFieldDiffs`
  // (upstream HEAD vs. prod's current data), which needs no pending upgrade.
  const prodUnitResp = await hubApi.post(`/api/space/${prodSpaceId}/unit`, {
    params: { allow_exists: 'true', upstream_space_id: devSpaceId, upstream_unit_id: devUnitData.UnitID },
    data: { Slug: slug, ToolchainType: 'Kubernetes/YAML' },
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
  await expect(page.getByTestId(`app-tree-item-${appLabel}`)).toBeVisible({ timeout: 20000 });
  await page.getByTestId(`app-tree-item-${appLabel}`).click();
  const prodNode = page.locator('.react-flow__node').filter({ hasText: prodTargetSlug });
  await expect(prodNode).toBeVisible({ timeout: 10000 });
  await prodNode.click();
  // The pane is ready: its scope chips are drawn (the footer shows only when something is staged).
  await expect(page.getByTestId('component-filter-all')).toBeVisible({ timeout: 10000 });
  // The fixture below has no pending upgrade (dev never moves past prod's
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
  // chip must read 1 of 2 and be amber (risk).
  test('only a protected local override is kept on merge', async ({ page }) => {
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

    // The Kept on merge scope counts the protected override alone, and draws it alone.
    await expect(page.getByTestId('component-kept-on-merge-count')).toHaveText('1', { timeout: 15000 });
    await page.getByTestId('scope-kept').click();
    await expect(page.locator('.bbody .v[data-path="data.fieldB"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.bbody .v[data-path="data.fieldA"]')).toHaveCount(0);

    await api.deleteSpace(prodSpaceId, true).catch(() => {});
    await api.deleteSpace(devSpaceId, true).catch(() => {});
  });
});
