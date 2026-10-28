// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// The Component view's local overrides and blocked upstream deletions are keyed
// per document, from the server: the overrides from POST /diff of the upstream
// to the Unit, a blocked deletion from the merge conflict the dry run reports.
//
// Each describe makes a dev Unit of two documents that share paths, and a prod
// Unit cloned from it that changes one document locally.
//
// - Prod overrides a label in one document only: only that document's row has
//   the differs-from-upstream border, and the local-overrides scope shows that
//   row alone. Keyed on the bare path, the other document's copy of the label
//   was marked too.
// - Dev deletes the label from both documents, which prod changed in one: the
//   deletion is blocked in that document only, and passes through in the other.
// ============================================================================

const UNIT_SLUG = 'web';

interface Chain {
  devSpaceId: string;
  prodSpaceId: string;
  prodUnitId: string;
  prodTargetSlug: string;
}

/**
 * What a describe made, recorded as it is made, so a setup that fails part-way is
 * still cleaned up. Deleting a Space leaves its Component, and the org has a
 * Component quota, so the Component is deleted too, after its Spaces.
 */
interface Created {
  componentId?: string;
  spaceIds: string[];
}

interface ChainData {
  /** dev's first configuration, which prod is cloned from. */
  devV1: string;
  /** prod's own configuration, written after the clone. */
  prod: string;
  /** dev's next configuration, if prod is to be one upgrade behind. */
  devV2?: string;
}

async function createChain(page: Page, appLabel: string, data: ChainData, created: Created): Promise<Chain> {
  const api = new ApiHelper(page);
  const devSlug = `e2e-dev-${RandomSlugGenerator.randomSlugName()}`;
  const prodSlug = `e2e-prod-${RandomSlugGenerator.randomSlugName()}`;

  const createSpaceWithTarget = async (slug: string, role: 'Dev' | 'Prod'): Promise<{ spaceId: string; targetId: string }> => {
    // Both Spaces are in the one Component the app label names.
    created.componentId ??= (await api.createComponent(appLabel)).ComponentID;
    const space = await api.createSpace({
      space: {
        Slug: slug,
        ComponentID: created.componentId,
        Labels: { Owner: 'E2E', Environment: role.toLowerCase(), TargetRole: role, TargetRegion: 'US' },
      },
    });
    const spaceId = (space as { SpaceID: string }).SpaceID;
    created.spaceIds.push(spaceId);
    const targetResp = await hubApi.post(`/api/space/${spaceId}/target`, {
      params: { allow_exists: 'true' },
      data: { Slug: `${slug}-tgt`, Labels: { TargetRole: role, TargetRegion: 'US' } },
    });
    if (!targetResp.ok()) throw new Error(`${role} target: ${targetResp.status()} ${await targetResp.text()}`);
    return { spaceId, targetId: ((await targetResp.json()) as { TargetID: string }).TargetID };
  };
  const dev = await createSpaceWithTarget(devSlug, 'Dev');
  const prod = await createSpaceWithTarget(prodSlug, 'Prod');

  const devUnitResp = await hubApi.post(`/api/space/${dev.spaceId}/unit`, {
    params: { allow_exists: 'true' },
    data: { Slug: UNIT_SLUG, ToolchainType: 'Kubernetes/YAML', TargetID: dev.targetId },
  });
  if (!devUnitResp.ok()) throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
  const devUnitId = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;
  await api.uploadUnitData({ spaceId: dev.spaceId, unitId: devUnitId, body: data.devV1 });

  const prodUnitResp = await hubApi.post(`/api/space/${prod.spaceId}/unit`, {
    params: { allow_exists: 'true', upstream_space_id: dev.spaceId, upstream_unit_id: devUnitId },
    data: { Slug: UNIT_SLUG, ToolchainType: 'Kubernetes/YAML', TargetID: prod.targetId },
  });
  if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
  const prodUnitId = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;

  // Prod's own change, recorded as a local mutation of the paths it changes.
  await api.uploadUnitData({ spaceId: prod.spaceId, unitId: prodUnitId, body: data.prod });
  if (data.devV2 !== undefined) await api.uploadUnitData({ spaceId: dev.spaceId, unitId: devUnitId, body: data.devV2 });

  // Wait for the resolve processor to clear awaiting/triggers ValidationErrors.
  for (const [spaceId, unitId] of [
    [dev.spaceId, devUnitId],
    [prod.spaceId, prodUnitId],
  ]) {
    for (let i = 0; i < 100; i++) {
      const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
      if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return { devSpaceId: dev.spaceId, prodSpaceId: prod.spaceId, prodUnitId, prodTargetSlug: `${prodSlug}-tgt` };
}

async function withApiPage<T>(browser: Parameters<typeof newAuthorizedContext>[0], run: (page: Page) => Promise<T>): Promise<T> {
  const context = await newAuthorizedContext(browser);
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    return await run(page);
  } finally {
    await context.close();
  }
}

async function deleteCreated(browser: Parameters<typeof newAuthorizedContext>[0], created: Created): Promise<void> {
  if (!created.componentId && created.spaceIds.length === 0) return;
  // Best effort: a leaked fixture must not fail an otherwise green run.
  await withApiPage(browser, async (page) => {
    const api = new ApiHelper(page);
    // Downstream first: a Space whose Units are upstream of another Space's cannot be deleted.
    for (const spaceId of [...created.spaceIds].reverse()) await api.deleteSpace(spaceId, true).catch(() => undefined);
    if (created.componentId) await api.deleteComponent(created.componentId).catch(() => undefined);
  });
}

async function openProdPane(page: Page, appLabel: string, chain: Chain): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  const treeItem = page.getByTestId(`app-tree-item-${appLabel}`);
  await expect(treeItem).toBeVisible({ timeout: 20000 });
  await treeItem.click();
  const prodNode = page.locator('.react-flow__node').filter({ hasText: chain.prodTargetSlug });
  await expect(prodNode).toBeVisible({ timeout: 10000 });
  await prodNode.click();
}

/** A ConfigMap and a Service that share `metadata.labels.app` and, when given, `metadata.labels.tier`. */
function twoDocuments(labels: { configMapApp: string; serviceApp: string; configMapTier?: string; serviceTier?: string }): string {
  const labelLines = (app: string, tier: string | undefined) => [
    '  labels:',
    `    app: ${app}`,
    ...(tier !== undefined ? [`    tier: ${tier}`] : []),
  ];
  return [
    'apiVersion: v1',
    'kind: ConfigMap',
    'metadata:',
    '  name: web',
    ...labelLines(labels.configMapApp, labels.configMapTier),
    'data:',
    '  greeting: hello',
    '---',
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    '  name: web',
    ...labelLines(labels.serviceApp, labels.serviceTier),
    'spec:',
    '  ports:',
    '    - port: 80',
  ].join('\n');
}

test.describe('a local override of a path two documents share, in one of them', () => {
  test.use({ storageState: 'authentication.json' });

  const appLabel = `e2e-variation-shared-${RandomSlugGenerator.randomSlugName()}`;
  let chain: Chain | undefined;
  const created: Created = { spaceIds: [] };

  test.beforeAll(async ({ browser }) => {
    chain = await withApiPage(browser, (page) =>
      createChain(page, appLabel, {
        devV1: twoDocuments({ configMapApp: 'web', serviceApp: 'web' }),
        prod: twoDocuments({ configMapApp: 'web', serviceApp: 'web-local' }),
      }, created));
  });

  test.afterAll(async ({ browser }) => {
    await deleteCreated(browser, created);
  });

  test('marks only that document\'s row as differing from upstream', async ({ page }) => {
    await openProdPane(page, appLabel, chain!);

    // Nothing to upgrade, so the pane shows every row.
    const serviceRow = page.getByTestId('component-leaf-row').filter({ hasText: 'web-local' });
    await expect(serviceRow).toHaveCount(1, { timeout: 15000 });
    await expect(serviceRow).toHaveAttribute('data-differs-upstream', 'true', { timeout: 15000 });
    const differing = page.locator('[data-testid="component-leaf-row"][data-differs-upstream="true"]');
    await expect(differing).toHaveCount(1);
    await expect(page.getByTestId('component-local-overrides-count')).toHaveText('1');
  });

  test('the local-overrides scope shows that row alone', async ({ page }) => {
    await openProdPane(page, appLabel, chain!);

    await expect(page.getByTestId('component-local-overrides-count')).toHaveText('1', { timeout: 15000 });
    await page.getByTestId('component-scope-local-overrides').click();

    const leafRows = page.getByTestId('component-leaf-row');
    await expect(leafRows).toHaveCount(1, { timeout: 10000 });
    await expect(leafRows.first()).toContainText('web-local');
    await expect(page.getByTestId('component-folder-row').filter({ hasText: 'Service web' })).toHaveCount(1);
    await expect(page.getByTestId('component-folder-row').filter({ hasText: 'ConfigMap web' })).toHaveCount(0);
  });
});

test.describe('an upstream deletion blocked in one document of a multi-document Unit', () => {
  test.use({ storageState: 'authentication.json' });

  const appLabel = `e2e-variation-blocked-${RandomSlugGenerator.randomSlugName()}`;
  let chain: Chain | undefined;
  const created: Created = { spaceIds: [] };

  test.beforeAll(async ({ browser }) => {
    chain = await withApiPage(browser, (page) =>
      createChain(page, appLabel, {
        devV1: twoDocuments({ configMapApp: 'web', serviceApp: 'web', configMapTier: 'base', serviceTier: 'base' }),
        // Prod changes the ConfigMap's tier, so the merge keeps it when dev deletes it.
        prod: twoDocuments({ configMapApp: 'web', serviceApp: 'web', configMapTier: 'local', serviceTier: 'base' }),
        devV2: twoDocuments({ configMapApp: 'web', serviceApp: 'web' }),
      }, created));
    // The merge keeps a local change against an upstream deletion, and reports it as a
    // Subtracted conflict, only with subtraction on; it is off by default.
    const links = await hubApi.get(`/api/space/${chain!.prodSpaceId}/link`, {
      params: { where: `FromUnitID = '${chain!.prodUnitId}'` },
    });
    if (!links.ok()) throw new Error(`prod link: ${links.status()} ${await links.text()}`);
    const linkId = ((await links.json()) as { Link: { LinkID: string } }[])[0]?.Link.LinkID;
    if (!linkId) throw new Error('prod link: not found');
    const patched = await hubApi.patch(`/api/space/${chain!.prodSpaceId}/link/${linkId}`, {
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: { MergeEnableSubtraction: true },
    });
    if (!patched.ok()) throw new Error(`prod link subtraction: ${patched.status()} ${await patched.text()}`);
  });

  test.afterAll(async ({ browser }) => {
    await deleteCreated(browser, created);
  });

  test('is blocked in that document only, and accepting it deletes the key from both', async ({ page }) => {
    await openProdPane(page, appLabel, chain!);
    await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });

    // The Service's deletion and the ConfigMap's blocked one: two changes.
    await expect(page.getByTestId('component-incoming-count')).toHaveText('2', { timeout: 20000 });
    const tierRows = page.getByTestId('component-leaf-row').filter({ hasText: 'tier' });
    await expect(tierRows).toHaveCount(2, { timeout: 15000 });

    // The rows are in document order: the ConfigMap's, then the Service's.
    const configMapRow = tierRows.nth(0);
    const serviceRow = tierRows.nth(1);
    await expect(configMapRow).toContainText('local');
    await expect(configMapRow.locator('.upgrade-pill-blocked')).toHaveCount(1);
    await expect(serviceRow).toContainText('base');
    await expect(serviceRow.locator('.upgrade-pill-blocked')).toHaveCount(0);
    await expect(serviceRow).toHaveAttribute('data-change-type', 'delete');

    // Entering Incoming staged both; the commit accepts the blocked deletion too.
    await expect(page.getByTestId('component-upgrade-button')).toContainText('2');
    await page.getByTestId('component-upgrade-button').click();

    await expect(async () => {
      const resp = await hubApi.get(`/api/space/${chain!.prodSpaceId}/unit/${chain!.prodUnitId}/data`);
      const documents = (await resp.text()).split(/^---$/m);
      expect(documents).toHaveLength(2);
      expect(documents[0]).toContain('kind: ConfigMap');
      expect(documents[0]).not.toContain('tier');
      expect(documents[1]).toContain('kind: Service');
      expect(documents[1]).not.toContain('tier');
    }).toPass({ timeout: 20000 });
  });
});
