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
  // TargetListPage's toolbar has no persistent "Add Target" button (it only
  // appears in the chrome-free empty state, EmptyTargetList.tsx, which stops
  // rendering once the org has any Target) — filed as a product bug, see
  // #4939. So each test seeds its Target via the API, in a Space afterAll
  // deletes, and exercises what this file covers: the target *detail drawer's*
  // edit/delete behavior.
  const seedSlug = `e2e-target-drawer-${RandomSlugGenerator.randomSlugName()}`;
  let seedSpaceId: string;

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
      // Recursive: takes any seeded targets down with the Space.
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
    await api.createTarget({
      spaceId: seedSpaceId,
      slug: targetName,
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

  test('should show, grant and revoke worker access to a target', async ({ page }) => {
    const targetName = `${seedSlug}-access-${RandomSlugGenerator.randomSlugName()}`;
    const workerSlug = `${seedSlug}-worker`;
    const workerLabel = `${seedSlug}/${workerSlug}`;

    const api = new ApiHelper(page);
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const workerResponse = await hubApi.post(`/api/space/${seedSpaceId}/bridge_worker`, {
      params: { allow_exists: 'true' },
      data: { Slug: workerSlug },
    });
    expect(workerResponse.ok()).toBeTruthy();
    const botUserId = ((await workerResponse.json()) as { UserID: string }).UserID;
    const target = await api.createTarget({ spaceId: seedSpaceId, slug: targetName });

    // The grants the worker's bot user holds on the target, read back from the server.
    const grants = async () => {
      const response = await hubApi.get(`/api/space/${seedSpaceId}/target/${target.TargetID}`);
      const permissions = ((await response.json()) as {
        Target: { Permissions?: Record<string, { UserIDs?: Record<string, boolean> }> };
      }).Target.Permissions;
      return ['View', 'ViewChildren'].filter((action) => permissions?.[action]?.UserIDs?.[botUserId]);
    };
    const saveAndWait = () =>
      Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/target/') && ['PUT', 'PATCH'].includes(r.request().method()),
        ),
        page.getByRole('button', { name: 'Update Target' }).click(),
      ]);

    const targetListPage = new TargetListPage(page);
    const accessSelect = page.getByTestId('target-worker-access-select');

    await targetListPage.goto();
    await targetListPage.filterTargets(`Slug = '${targetName}'`);
    await targetListPage.goToDetailPageByRowClick(targetName);

    // No worker has access yet.
    await expect(accessSelect).toContainText('None');
    await accessSelect.click();
    await page.getByRole('option', { name: workerLabel }).click();
    await page.keyboard.press('Escape');
    await saveAndWait();
    await expect(page.locator('.MuiBackdrop-root')).toHaveCount(0, { timeout: 10000 });
    expect(await grants()).toEqual(['View', 'ViewChildren']);

    // Reopened, the drawer shows the worker that has access, and deselecting it revokes both.
    await targetListPage.goto();
    await targetListPage.filterTargets(`Slug = '${targetName}'`);
    await targetListPage.goToDetailPageByRowClick(targetName);
    await expect(accessSelect).toContainText(workerLabel);
    await accessSelect.click();
    await page.getByRole('option', { name: workerLabel }).click();
    await page.keyboard.press('Escape');
    await expect(accessSelect).toContainText('None');
    await saveAndWait();
    await expect(page.locator('.MuiBackdrop-root')).toHaveCount(0, { timeout: 10000 });
    expect(await grants()).toEqual([]);
  });

  test('should delete a target', async ({ page }) => {
    const targetName = `${seedSlug}-delete-${RandomSlugGenerator.randomSlugName()}`;

    const api = new ApiHelper(page);
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    await api.createTarget({
      spaceId: seedSpaceId,
      slug: targetName,
    });

    const targetDetailPage = new TargetDetailPage(page);
    const targetListPage = new TargetListPage(page);

    await targetListPage.goto();
    await targetListPage.filterTargets(`Slug = '${targetName}'`);

    await targetListPage.selectRow(targetName);

    await targetDetailPage.deleteTarget();

    await targetListPage.expectNotToBeVisibleByText(targetName);
  });
});
