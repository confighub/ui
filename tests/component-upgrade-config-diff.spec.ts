// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// The Component view's upgrade rows come from the server's Diff of the upgrade
// dry run, keyed per document.
//
// Each describe makes an upgradable pair the way component-staging-narrow.spec.ts
// does: a dev Unit at rev1, a prod Unit cloned from it, then dev moved to rev2.
// The prod pane then shows what upgrading prod would change.
//
// - Two documents share a path and upstream changes it in only one: the row is
//   upgradable in that document alone, and the count is 1. A diff keyed on the
//   bare path showed it in both documents, or in the wrong one.
// - An env var is inserted in the middle of the list: one added element, count 1.
//   A diff that matched elements by index showed every later element as changed.
// - Two documents change the same path and only one row is staged: the commit
//   writes that document alone.
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

/** dev at `v1`, prod cloned from it, then dev at `v2`; prod is one upgrade behind. */
async function createUpgradableChain(page: Page, appLabel: string, v1: string, v2: string, created: Created): Promise<Chain> {
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
  await api.uploadUnitData({ spaceId: dev.spaceId, unitId: devUnitId, body: v1 });

  const prodUnitResp = await hubApi.post(`/api/space/${prod.spaceId}/unit`, {
    params: { allow_exists: 'true', upstream_space_id: dev.spaceId, upstream_unit_id: devUnitId },
    data: { Slug: UNIT_SLUG, ToolchainType: 'Kubernetes/YAML', TargetID: prod.targetId },
  });
  if (!prodUnitResp.ok()) throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
  const prodUnitId = ((await prodUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;

  await api.uploadUnitData({ spaceId: dev.spaceId, unitId: devUnitId, body: v2 });

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

/** Opens the prod node's pane, which starts on the Incoming tab with every upgradable row staged. */
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
  await expect(page.getByTestId('component-upgrade-button')).toBeVisible({ timeout: 10000 });
}

function deploymentYaml(appLabelValue: string, env: string[]): string {
  return [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: web',
    '  labels:',
    `    app: ${appLabelValue}`,
    'spec:',
    '  replicas: 1',
    '  selector:',
    '    matchLabels:',
    '      tier: web',
    '  template:',
    '    metadata:',
    '      labels:',
    '        tier: web',
    '    spec:',
    '      containers:',
    '        - name: web',
    '          image: nginx:1.27',
    ...(env.length > 0 ? ['          env:', ...env.flatMap((name) => [`            - name: ${name}`, `              value: "${name.toLowerCase()}-value"`])] : []),
  ].join('\n');
}

function serviceYaml(appLabelValue: string): string {
  return [
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    '  name: web',
    '  labels:',
    `    app: ${appLabelValue}`,
    'spec:',
    '  ports:',
    '    - port: 80',
  ].join('\n');
}

const twoDocuments = (deploymentApp: string, serviceApp: string) =>
  `${deploymentYaml(deploymentApp, [])}\n---\n${serviceYaml(serviceApp)}`;

test.describe('a path two documents share, changed upstream in one', () => {
  test.use({ storageState: 'authentication.json' });

  const appLabel = `e2e-upgrade-diff-shared-${RandomSlugGenerator.randomSlugName()}`;
  let chain: Chain | undefined;
  const created: Created = { spaceIds: [] };

  test.beforeAll(async ({ browser }) => {
    chain = await withApiPage(browser, (page) =>
      createUpgradableChain(page, appLabel, twoDocuments('web', 'web'), twoDocuments('web', 'web-svc'), created));
  });

  test.afterAll(async ({ browser }) => {
    await deleteCreated(browser, created);
  });

  test('only that document\'s row is upgradable, and the count is 1', async ({ page }) => {
    await openProdPane(page, appLabel, chain!);

    const leafRows = page.getByTestId('component-leaf-row');
    await expect(leafRows).toHaveCount(1, { timeout: 15000 });
    await expect(leafRows.first()).toContainText('web-svc');
    await expect(leafRows.first().getByTestId('component-upgrade-pill')).toHaveAttribute('data-staged', 'true', { timeout: 5000 });
    // The narrowed tree holds the Service's document only.
    await expect(page.getByTestId('component-folder-row').filter({ hasText: 'Service web' })).toHaveCount(1);
    await expect(page.getByTestId('component-folder-row').filter({ hasText: 'Deployment web' })).toHaveCount(0);
    await expect(page.getByTestId('component-upgrade-button')).toContainText('1');

    // In All, the Deployment's copy of the path is drawn, and nothing marks it.
    await page.getByTestId('component-filter-all').click();
    await expect(page.getByTestId('component-folder-row').filter({ hasText: 'Deployment web' })).toHaveCount(1, { timeout: 10000 });
    await expect(page.getByTestId('component-upgrade-pill')).toHaveCount(1, { timeout: 10000 });
  });
});

test.describe('an env var inserted in the middle of the list upstream', () => {
  test.use({ storageState: 'authentication.json' });

  const appLabel = `e2e-upgrade-diff-env-${RandomSlugGenerator.randomSlugName()}`;
  let chain: Chain | undefined;
  const created: Created = { spaceIds: [] };

  test.beforeAll(async ({ browser }) => {
    chain = await withApiPage(browser, (page) =>
      createUpgradableChain(
        page,
        appLabel,
        deploymentYaml('web', ['ALPHA', 'BRAVO', 'CHARLIE']),
        deploymentYaml('web', ['ALPHA', 'XRAY', 'BRAVO', 'CHARLIE']),
        created,
      ));
  });

  test.afterAll(async ({ browser }) => {
    await deleteCreated(browser, created);
  });

  test('is one added element, and the elements after it are not changed', async ({ page }) => {
    await openProdPane(page, appLabel, chain!);

    // XRAY's name and value, both new, and nothing else.
    const leafRows = page.getByTestId('component-leaf-row');
    await expect(leafRows).toHaveCount(2, { timeout: 15000 });
    await expect(leafRows.filter({ hasText: /XRAY/ })).toHaveCount(1);
    await expect(leafRows.filter({ hasText: 'xray-value' })).toHaveCount(1);
    for (const row of await leafRows.all()) await expect(row).toHaveAttribute('data-change-type', 'add');
    await expect(page.getByTestId('component-upgrade-button')).toContainText('1');

    // In All, BRAVO and CHARLIE are drawn where they are, with no upgrade on them.
    await page.getByTestId('component-filter-all').click();
    await expect(page.getByTestId('component-leaf-row').filter({ hasText: 'charlie-value' })).toHaveCount(1, { timeout: 10000 });
    await expect(page.getByTestId('component-upgrade-pill')).toHaveCount(2, { timeout: 10000 });
    for (const name of ['ALPHA', 'BRAVO', 'CHARLIE']) {
      const row = page.getByTestId('component-leaf-row').filter({ hasText: name });
      await expect(row.getByTestId('component-upgrade-pill')).toHaveCount(0);
    }
  });
});

test.describe('staging one document\'s row of a path two documents change', () => {
  test.use({ storageState: 'authentication.json' });

  const appLabel = `e2e-upgrade-diff-commit-${RandomSlugGenerator.randomSlugName()}`;
  let chain: Chain | undefined;
  const created: Created = { spaceIds: [] };

  test.beforeAll(async ({ browser }) => {
    chain = await withApiPage(browser, (page) =>
      createUpgradableChain(page, appLabel, twoDocuments('web', 'web'), twoDocuments('web-dep', 'web-svc'), created));
  });

  test.afterAll(async ({ browser }) => {
    await deleteCreated(browser, created);
  });

  test('commits the upgrade to that document alone', async ({ page }) => {
    await openProdPane(page, appLabel, chain!);

    const leafRows = page.getByTestId('component-leaf-row');
    await expect(leafRows).toHaveCount(2, { timeout: 15000 });
    await expect(page.getByTestId('component-upgrade-button')).toContainText('2');

    // Leave the Deployment's change out; the Service's stays staged. The rows are in
    // document order, and an unstaged row hides its incoming value, so they are taken
    // by position once their values are confirmed.
    const deploymentRow = leafRows.nth(0);
    const serviceRow = leafRows.nth(1);
    await expect(deploymentRow).toContainText('web-dep');
    await expect(serviceRow).toContainText('web-svc');
    await deploymentRow.getByTestId('component-upgrade-pill').locator('input[type="checkbox"]').uncheck();
    await expect(deploymentRow.getByTestId('component-upgrade-pill')).toHaveAttribute('data-staged', 'false');
    await expect(serviceRow.getByTestId('component-upgrade-pill')).toHaveAttribute('data-staged', 'true');
    await expect(page.getByTestId('component-upgrade-button')).toContainText('1');

    await page.getByTestId('component-upgrade-button').click();

    await expect(async () => {
      const resp = await hubApi.get(`/api/space/${chain!.prodSpaceId}/unit/${chain!.prodUnitId}/data`);
      const documents = (await resp.text()).split(/^---$/m);
      expect(documents).toHaveLength(2);
      expect(documents[0]).toContain('kind: Deployment');
      expect(documents[0]).toMatch(/app: web\s*$/m);
      expect(documents[0]).not.toContain('web-dep');
      expect(documents[1]).toContain('kind: Service');
      expect(documents[1]).toContain('app: web-svc');
    }).toPass({ timeout: 20000 });
  });
});
