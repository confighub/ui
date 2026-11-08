// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, newAuthorizedContext, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * An upstream change a guard holds back, in a Variant's drawer. It is listed under Incoming and
 * counted, as a clearance lands it, but never ticked for the person; its hover names the guard;
 * ticked, Upgrade asks with the guard dialog every guarded write uses.
 */

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
async function createUpgradableChain(
  page: Page,
  appLabel: string,
  v1: string,
  v2: string,
  created: Created,
): Promise<Chain> {
  const api = new ApiHelper(page);
  const devSlug = `e2e-dev-${RandomSlugGenerator.randomSlugName()}`;
  const prodSlug = `e2e-prod-${RandomSlugGenerator.randomSlugName()}`;

  const createSpaceWithTarget = async (
    slug: string,
    role: 'Dev' | 'Prod',
  ): Promise<{ spaceId: string; targetId: string }> => {
    // Both Spaces are in the one Component the app label names.
    created.componentId ??= (await api.createComponent(appLabel)).ComponentID;
    const space = await api.createSpace({
      space: {
        Slug: slug,
        ComponentID: created.componentId,
        Labels: {
          Owner: 'E2E',
          Environment: role.toLowerCase(),
          TargetRole: role,
          TargetRegion: 'US',
        },
      },
    });
    const spaceId = (space as { SpaceID: string }).SpaceID;
    created.spaceIds.push(spaceId);
    const targetResp = await hubApi.post(`/api/space/${spaceId}/target`, {
      params: { allow_exists: 'true' },
      data: { Slug: `${slug}-tgt`, Labels: { TargetRole: role, TargetRegion: 'US' } },
    });
    if (!targetResp.ok())
      throw new Error(`${role} target: ${targetResp.status()} ${await targetResp.text()}`);
    const targetId = ((await targetResp.json()) as { TargetID: string }).TargetID;
    // A Unit is released to its Space's release Target.
    await api.updateSpace({ spaceId, space: { ReleaseTargetID: targetId } });
    return { spaceId, targetId };
  };
  const dev = await createSpaceWithTarget(devSlug, 'Dev');
  const prod = await createSpaceWithTarget(prodSlug, 'Prod');

  const devUnitResp = await hubApi.post(`/api/space/${dev.spaceId}/unit`, {
    params: { allow_exists: 'true' },
    data: { Slug: UNIT_SLUG, ToolchainType: 'Kubernetes/YAML' },
  });
  if (!devUnitResp.ok())
    throw new Error(`dev unit: ${devUnitResp.status()} ${await devUnitResp.text()}`);
  const devUnitId = ((await devUnitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;
  await api.uploadUnitData({ spaceId: dev.spaceId, unitId: devUnitId, body: v1 });

  const prodUnitResp = await hubApi.post(`/api/space/${prod.spaceId}/unit`, {
    params: {
      allow_exists: 'true',
      upstream_space_id: dev.spaceId,
      upstream_unit_id: devUnitId,
    },
    data: { Slug: UNIT_SLUG, ToolchainType: 'Kubernetes/YAML' },
  });
  if (!prodUnitResp.ok())
    throw new Error(`prod unit: ${prodUnitResp.status()} ${await prodUnitResp.text()}`);
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

  return {
    devSpaceId: dev.spaceId,
    prodSpaceId: prod.spaceId,
    prodUnitId,
    prodTargetSlug: `${prodSlug}-tgt`,
  };
}

async function withApiPage<T>(
  browser: Parameters<typeof newAuthorizedContext>[0],
  run: (page: Page) => Promise<T>,
): Promise<T> {
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

async function deleteCreated(
  browser: Parameters<typeof newAuthorizedContext>[0],
  created: Created,
): Promise<void> {
  if (!created.componentId && created.spaceIds.length === 0) return;
  // Best effort: a leaked fixture must not fail an otherwise green run.
  await withApiPage(browser, async (page) => {
    const api = new ApiHelper(page);
    // Downstream first: a Space whose Units are upstream of another Space's cannot be deleted.
    for (const spaceId of [...created.spaceIds].reverse())
      await api.deleteSpace(spaceId, true).catch(() => undefined);
    if (created.componentId)
      await api.deleteComponent(created.componentId).catch(() => undefined);
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

const deployment = (replicas: number, image: string) =>
  [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: web',
    'spec:',
    `  replicas: ${replicas}`,
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
    `          image: ${image}`,
  ].join('\n');

test.describe('a guarded change in the Variant drawer', () => {
  test.use({ storageState: 'authentication.json' });

  let appLabel = '';
  let chain: Chain | undefined;
  let created: Created = { spaceIds: [] };

  const prodData = async () => {
    const response = await hubApi.get(
      `/api/space/${chain!.prodSpaceId}/unit/${chain!.prodUnitId}/data`,
    );
    if (!response.ok()) throw new Error(`prod data: ${response.status()}`);
    return response.text();
  };

  test.beforeEach(async ({ browser }) => {
    appLabel = `e2e-guarded-upgrade-${RandomSlugGenerator.randomSlugName()}`;
    created = { spaceIds: [] };
    chain = await withApiPage(browser, async (page) => {
      const c = await createUpgradableChain(
        page,
        appLabel,
        deployment(1, 'nginx:1.27'),
        deployment(1, 'nginx:1.27'),
        created,
      );
      // The production Variant's replica count is what it is for a reason an upgrade has to be
      // cleared for, inherited from where the guard was set.
      const guard = await hubApi.post(
        `/api/space/${c.prodSpaceId}/unit/${c.prodUnitId}/guard`,
        {
          data: {
            ResourceGuards: [
              {
                Resource: {
                  ResourceType: 'apps/v1/Deployment',
                  ResourceNameWithoutScope: 'web',
                },
                SetInherited: { 'spec.replicas': { Scale: 'RegionSpecific' } },
              },
            ],
          },
        },
      );
      if (!guard.ok()) throw new Error(`guard: ${guard.status()} ${await guard.text()}`);
      const devUnits = (await (
        await hubApi.get(`/api/space/${c.devSpaceId}/unit`)
      ).json()) as { Unit: { UnitID: string } }[];
      const update = await hubApi.put(
        `/api/space/${c.devSpaceId}/unit/${devUnits[0].Unit.UnitID}/data`,
        {
          data: deployment(10, 'nginx:1.28'),
        },
      );
      if (!update.ok()) throw new Error(`dev data: ${update.status()} ${await update.text()}`);
      return c;
    });
  });

  test.afterEach(async ({ browser }) => {
    await deleteCreated(browser, created);
  });

  const replicasRow = (page: Page) =>
    page.getByTestId('component-leaf-row').filter({ hasText: 'replicas' });
  const dialog = (page: Page) =>
    page.getByRole('dialog', { name: 'Guards withhold some of these changes' });

  test('is listed and counted, unticked, and its hover names the guard', async ({ page }) => {
    await openProdPane(page, appLabel, chain!);
    await expect(page.getByTestId('component-incoming-count')).toHaveText('2', {
      timeout: 15000,
    });
    await expect(replicasRow(page)).toHaveCount(1);
    await expect(replicasRow(page).getByTestId('component-upgrade-pill')).toHaveAttribute(
      'data-staged',
      'false',
    );
    // Upgrade counts what is ticked: the image. Select all ticks no guarded change, so with the
    // image ticked it has nothing left to offer.
    await expect(page.getByTestId('component-upgrade-button')).toContainText('1');
    await expect(page.getByTestId('component-select-all-button')).toHaveCount(0);

    await replicasRow(page).getByTestId('component-upgrade-pill').hover();
    await expect(page.getByRole('tooltip')).toContainText(
      'guard Scale=RegionSpecific (inherited) keeps it',
    );
  });

  test('left unticked, Upgrade lands the rest and asks nothing', async ({ page }) => {
    await openProdPane(page, appLabel, chain!);
    await expect(page.getByTestId('component-incoming-count')).toHaveText('2', {
      timeout: 15000,
    });
    await page.getByTestId('component-upgrade-button').click();
    await expect.poll(prodData, { timeout: 15000 }).toContain('nginx:1.28');
    expect(await prodData()).toContain('replicas: 1');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('ticked, Upgrade asks, and cleared it lands', async ({ page }) => {
    await openProdPane(page, appLabel, chain!);
    await expect(replicasRow(page)).toHaveCount(1, { timeout: 15000 });
    await replicasRow(page).getByRole('checkbox').click();
    await expect(page.getByTestId('component-upgrade-button')).toContainText('2');
    await page.getByTestId('component-upgrade-button').click();

    await expect(dialog(page).getByTestId('guarded-changes')).toContainText(
      'spec.replicas: 1 → 10',
    );
    await dialog(page)
      .getByRole('checkbox', { name: 'Scale=RegionSpecific', exact: true })
      .check();
    await dialog(page).getByRole('button', { name: 'Upgrade with clearance' }).click();
    await expect.poll(prodData, { timeout: 15000 }).toContain('replicas: 10');
    expect(await prodData()).toContain('nginx:1.28');
  });

  test('ticked and upgraded without it, the value is kept and the row is not marked done', async ({
    page,
  }) => {
    await openProdPane(page, appLabel, chain!);
    await expect(replicasRow(page)).toHaveCount(1, { timeout: 15000 });
    await replicasRow(page).getByRole('checkbox').click();
    await page.getByTestId('component-upgrade-button').click();
    await dialog(page).getByRole('button', { name: 'Upgrade without them' }).click();
    await expect.poll(prodData, { timeout: 15000 }).toContain('nginx:1.28');
    expect(await prodData()).toContain('replicas: 1');
    // The row still offers the change rather than showing it as written.
    await expect(replicasRow(page).getByTestId('component-upgrade-pill')).toHaveAttribute(
      'data-staged',
      'false',
      { timeout: 15000 },
    );
  });
});
