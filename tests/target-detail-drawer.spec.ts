// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { TargetDetailPage } from './fixtures/target-detail-page';
import { TargetListPage } from './fixtures/target-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('target detail drawer', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
  test.use({ storageState: 'authentication.json' });

  // ── Seed data ────────────────────────────────────────────────────────────
  // A real Bridge Worker only reports the ProviderType/ToolchainType it
  // supports once an actual worker process connects and reports ProvidedInfo
  // — something a UI e2e test cannot produce (see AddTargetDrawer.tsx:
  // ProviderType/ToolchainType selects stay empty, and "Create Target" stays
  // disabled, until a worker has connected). So a fresh worker created via
  // WorkerListPage.addWorker() can never back a Target through the "Add
  // Target" UI flow. Separately, TargetListPage's toolbar has no persistent
  // "Add Target" button at all (it only appears in the chrome-free empty
  // state, EmptyTargetList.tsx, which stops rendering once the org has any
  // Target) — filed as a product bug, see #4939.
  //
  // Seed a server-hosted worker + OCI Target via API instead: server-hosted
  // workers are Ready immediately with no external process (see
  // api-helper.ts's createOciTarget doc), mirroring target-list-page.spec.ts
  // and component-release.spec.ts. That unblocks testing what this file is
  // actually meant to cover — the target *detail drawer's* edit/delete
  // behavior — independent of the still-real "Add Target" gaps above.
  const seedSlug = `e2e-target-drawer-${RandomSlugGenerator.randomSlugName()}`;
  const seedWorkerSlug = `${seedSlug}-worker`;
  let seedSpaceId: string;
  let seedBridgeWorkerId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();

    try {
      // Visit a page first to ensure user/org is provisioned.
      await page.goto('/');
      await page.waitForResponse(
        (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
      );

      const api = new ApiHelper(page);
      const space = await api.createSpace({ space: { Slug: seedSlug } });
      seedSpaceId = (space as { SpaceID: string }).SpaceID;

      const workerResponse = await hubApi.post(
        `/api/space/${seedSpaceId}/bridge_worker`,
        {
          params: { allow_exists: 'true' },
          data: { Slug: seedWorkerSlug, ProvidedInfo: { IsServerWorker: true } },
        },
      );
      if (!workerResponse.ok()) {
        throw new Error(
          `Failed to create seed bridge worker: ${workerResponse.status()} ${await workerResponse.text()}`,
        );
      }
      const worker = (await workerResponse.json()) as { BridgeWorkerID: string };
      seedBridgeWorkerId = worker.BridgeWorkerID;
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!seedSpaceId) return;

    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();

    try {
      await page.goto('/');
      await page.waitForResponse(
        (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
      );
      // Recursive: takes the seeded worker and any targets down with the Space.
      await new ApiHelper(page).deleteSpace(seedSpaceId, true);
    } catch {
      // Best effort — a leaked seed Space must not fail an otherwise green run.
    } finally {
      await context.close();
    }
  });

  test('should edit a target', async ({ page }) => {
    const targetName = `${seedSlug}-edit-${RandomSlugGenerator.randomSlugName()}`;
    const editedTargetName = RandomSlugGenerator.randomSlugName();

    const api = new ApiHelper(page);
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    await api.createOciTarget({
      spaceId: seedSpaceId,
      slug: targetName,
      bridgeWorkerId: seedBridgeWorkerId,
    });

    const targetListPage = new TargetListPage(page);
    const targetDetailPage = new TargetDetailPage(page);

    await targetListPage.goto();
    // Narrow the grid to just this seeded target so the exact-label row click
    // in editTarget() doesn't miss a virtualized/off-screen row on an org with
    // many pre-existing targets.
    await targetListPage.filterTargets(`Slug = '${targetName}'`);

    await targetListPage.editTarget({
      targetName,
      newTargetName: editedTargetName,
    });

    // editTarget() doesn't wait for the update to land, so the drawer (and its
    // backdrop) can still be closing when the next step runs and intercept
    // pointer events. Wait for it to fully close first.
    await expect(page.locator('.MuiBackdrop-root')).toHaveCount(0, { timeout: 10000 });

    // Editing the target's Name changes its Slug, so the `Slug = targetName`
    // filter above no longer matches it — start again from an unfiltered list and
    // filter by the new name before asserting it's visible in the grid. Not Clear
    // all: right after the drawer closes, clearing the filters can build the URL
    // from the location before the close, bringing back `edit=` and reopening the
    // drawer.
    await targetListPage.goto();
    await targetListPage.filterTargets(`Slug = '${editedTargetName}'`);

    await targetDetailPage.expectToBeVisibleByText(editedTargetName);
  });

  test('should delete a target', async ({ page }) => {
    const targetName = `${seedSlug}-delete-${RandomSlugGenerator.randomSlugName()}`;

    const api = new ApiHelper(page);
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    await api.createOciTarget({
      spaceId: seedSpaceId,
      slug: targetName,
      bridgeWorkerId: seedBridgeWorkerId,
    });

    const targetDetailPage = new TargetDetailPage(page);
    const targetListPage = new TargetListPage(page);

    await targetListPage.goto();
    await targetListPage.filterTargets(`Slug = '${targetName}'`);

    await targetListPage.selectRow(targetName);

    await targetDetailPage.deleteTarget();

    await targetListPage.expectNotToBeVisibleByText(targetName);
  });

  // test('should show an error when editing a target with non matching provider type and toolchain type', async ({
  //   page,
  // }) => {
  //   const workerName = RandomSlugGenerator.randomSlugName();
  //   const targetName = RandomSlugGenerator.randomSlugName();
  //   const editedTargetName = RandomSlugGenerator.randomSlugName();

  //   const targetDetailPage = new TargetDetailPage(page);
  //   const targetListPage = new TargetListPage(page);
  //   const workerListPage = new WorkerListPage(page);

  //   await workerListPage.goto();
  //   await workerListPage.addWorker(workerName);

  //   await targetListPage.goto();
  //   await targetListPage.addTarget({ targetName, workerName });

  //   await targetListPage.editTarget({
  //     targetName,
  //     newTargetName: editedTargetName,
  //     providerType: 'FluxOCIWriter',
  //     toolchainType: 'OpenTofu/HCL',
  //   });

  //   await targetDetailPage.expectToBeVisibleByText(
  //     'Error: For FluxOCIWriter provider, Toolchain Type must be Kubernetes/YAML.',
  //   );
  // });
});
