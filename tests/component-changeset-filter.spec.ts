// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// The side pane's ChangeSet filter draws what an open ChangeSet changed in each
// Unit, from the server's diff of the Revision before the ChangeSet to the head,
// keyed per document.
//
// Each describe makes one Space with a Target and a Unit at v1, opens a
// ChangeSet on the Unit, and writes v2 in it, as change-set-page.spec.ts does.
//
// - Two documents share a path and the ChangeSet changes it in only one: that
//   document's row alone is changed, and the count is 1. A diff keyed on the
//   bare path showed it in both documents.
// - An env var is inserted in the middle of the list: one added element, count
//   1. A diff that matched elements by index showed every later element as
//   changed.
// ============================================================================

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

interface ChangeSetUnit {
  spaceId: string;
  unitId: string;
  targetSlug: string;
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

/** A Unit at `v1`, then `v2` written in a ChangeSet that stays open. */
async function createChangeSetUnit(page: Page, appLabel: string, v1: string, v2: string, created: Created): Promise<ChangeSetUnit> {
  const api = new ApiHelper(page);
  const slug = `e2e-csf-${RandomSlugGenerator.randomSlugName()}`;
  created.componentId = (await api.createComponent(appLabel)).ComponentID;
  const space = await api.createSpace({
    space: {
      Slug: slug,
      ComponentID: created.componentId,
      Labels: { Owner: 'E2E', Environment: 'dev', TargetRole: 'Dev', TargetRegion: 'US' },
    },
  });
  const spaceId = (space as { SpaceID: string }).SpaceID;
  created.spaceIds.push(spaceId);
  const targetSlug = `${slug}-tgt`;
  const targetResp = await hubApi.post(`/api/space/${spaceId}/target`, {
    params: { allow_exists: 'true' },
    data: { Slug: targetSlug, Labels: { TargetRole: 'Dev', TargetRegion: 'US' } },
  });
  if (!targetResp.ok()) throw new Error(`target: ${targetResp.status()} ${await targetResp.text()}`);
  const targetId = ((await targetResp.json()) as { TargetID: string }).TargetID;

  const unitResp = await hubApi.post(`/api/space/${spaceId}/unit`, {
    params: { allow_exists: 'true' },
    data: { Slug: 'web', ToolchainType: 'Kubernetes/YAML', TargetID: targetId },
  });
  if (!unitResp.ok()) throw new Error(`unit: ${unitResp.status()} ${await unitResp.text()}`);
  const unitId = ((await unitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;
  await api.uploadUnitData({ spaceId, unitId, body: v1 });

  const changeSet = await api.createChangeSet({ spaceId, changeSet: { Slug: `${slug}-cs`, Description: 'E2E ChangeSet' } as never });
  const changeSetId = (changeSet as { ChangeSetID: string }).ChangeSetID;
  const attach = await hubApi.patch(`/api/space/${spaceId}/unit/${unitId}`, {
    params: { change_set_id: changeSetId },
    headers: MERGE_PATCH,
    data: { ChangeSetID: changeSetId },
  });
  if (!attach.ok()) throw new Error(`attach: ${attach.status()} ${await attach.text()}`);
  await api.uploadUnitData({ spaceId, unitId, body: v2, changeSetId });

  // Wait for the resolve processor to clear awaiting/triggers ValidationErrors.
  for (let i = 0; i < 100; i++) {
    const resp = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
    if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  return { spaceId, unitId, targetSlug };
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
    for (const spaceId of created.spaceIds) await api.deleteSpace(spaceId, true).catch(() => undefined);
    if (created.componentId) await api.deleteComponent(created.componentId).catch(() => undefined);
  });
}

/** Opens the node's pane and selects its ChangeSet filter, once the ChangeSet's diff has landed. */
async function openChangeSetFilter(page: Page, appLabel: string, fixture: ChangeSetUnit): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  const treeItem = page.getByTestId(`app-tree-item-${appLabel}`);
  await expect(treeItem).toBeVisible({ timeout: 20000 });
  await treeItem.click();
  const node = page.locator('.react-flow__node').filter({ hasText: fixture.targetSlug });
  await expect(node).toBeVisible({ timeout: 10000 });
  await node.click();
  const filter = page.getByTestId('component-filter-changeset');
  await expect(filter).toBeVisible({ timeout: 15000 });
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('component-changeset-count')).not.toHaveText('…', { timeout: 15000 });
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

test.describe('a ChangeSet that changes a path two documents share, in one of them', () => {
  test.use({ storageState: 'authentication.json' });

  const appLabel = `e2e-changeset-filter-shared-${RandomSlugGenerator.randomSlugName()}`;
  let fixture: ChangeSetUnit | undefined;
  const created: Created = { spaceIds: [] };

  test.beforeAll(async ({ browser }) => {
    fixture = await withApiPage(browser, (page) =>
      createChangeSetUnit(page, appLabel, twoDocuments('web', 'web'), twoDocuments('web', 'web-svc'), created));
  });

  test.afterAll(async ({ browser }) => {
    await deleteCreated(browser, created);
  });

  test('shows only that document\'s row as changed, and the count is 1', async ({ page }) => {
    await openChangeSetFilter(page, appLabel, fixture!);

    const leafRows = page.getByTestId('component-leaf-row');
    await expect(leafRows).toHaveCount(1, { timeout: 15000 });
    await expect(leafRows.first()).toContainText('web-svc');
    await expect(leafRows.first()).not.toHaveAttribute('data-change-type', 'none');
    // The narrowed tree holds the Service's document only.
    await expect(page.getByTestId('component-folder-row').filter({ hasText: 'Service web' })).toHaveCount(1);
    await expect(page.getByTestId('component-folder-row').filter({ hasText: 'Deployment web' })).toHaveCount(0);
    await expect(page.getByTestId('component-changeset-count')).toHaveText('1');
    // Read-only: nothing to stage.
    await expect(page.getByTestId('component-upgrade-pill').locator('input[type="checkbox"]')).toHaveCount(0);
  });
});

test.describe('a ChangeSet that inserts an env var in the middle of the list', () => {
  test.use({ storageState: 'authentication.json' });

  const appLabel = `e2e-changeset-filter-env-${RandomSlugGenerator.randomSlugName()}`;
  let fixture: ChangeSetUnit | undefined;
  const created: Created = { spaceIds: [] };

  test.beforeAll(async ({ browser }) => {
    fixture = await withApiPage(browser, (page) =>
      createChangeSetUnit(
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
    await openChangeSetFilter(page, appLabel, fixture!);

    // XRAY's name and value, both new, and nothing else.
    const leafRows = page.getByTestId('component-leaf-row');
    await expect(leafRows).toHaveCount(2, { timeout: 15000 });
    await expect(leafRows.filter({ hasText: /XRAY/ })).toHaveCount(1);
    await expect(leafRows.filter({ hasText: 'xray-value' })).toHaveCount(1);
    for (const row of await leafRows.all()) await expect(row).toHaveAttribute('data-change-type', 'add');
    for (const name of ['ALPHA', 'BRAVO', 'CHARLIE']) {
      await expect(leafRows.filter({ hasText: name })).toHaveCount(0);
    }
    await expect(page.getByTestId('component-changeset-count')).toHaveText('1');
  });
});
