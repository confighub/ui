// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { TargetListPage } from './fixtures/target-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import { WorkerListPage } from './fixtures/worker-list-page';

test.describe('target list page', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
  test.use({ storageState: 'authentication.json' });

  // ── Seed data ────────────────────────────────────────────────────────────
  // The filter and URL-sync tests below need the Targets list to be non-empty.
  // When the *unfiltered* list has zero rows, EntityDataGrid renders the
  // chrome-free empty state instead of mounting the grid: no toolbar, no
  // column headers, and — since the QueryBuilder is rendered inside the
  // toolbar — no filter UI at all. Those tests would then be asserting against
  // a page that cannot be filtered, and would fail waiting for a "Filter" or
  // "Clear all" button that is never rendered.
  //
  // Every target-creating test in this file is skipped (a worker must run
  // before it validates, which the UI cannot do), so the list is empty in CI
  // unless another spec happens to have targets alive at that moment. Seed one
  // through the API instead: a server-hosted worker backing an OCI Target is
  // Ready immediately with no external bridge process, mirroring
  // component-release.spec.ts and test/scripts/test-setup.sh's
  // `cub worker create --is-server-worker` + `cub target create --provider OCI`.
  //
  // The seed lives in its own Space that afterAll deletes recursively, so
  // repeat runs and other specs are unaffected.
  const seedSlug = `e2e-target-list-${RandomSlugGenerator.randomSlugName()}`;
  const seedWorkerSlug = `${seedSlug}-worker`;
  const seedTargetSlug = `${seedSlug}-target`;
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

      await api.createOciTarget({
        spaceId: seedSpaceId,
        slug: seedTargetSlug,
        bridgeWorkerId: worker.BridgeWorkerID,
      });
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
      // Recursive: takes the seeded worker and target down with the Space.
      await new ApiHelper(page).deleteSpace(seedSpaceId, true);
    } catch {
      // Best effort — a leaked seed Space must not fail an otherwise green run.
    } finally {
      await context.close();
    }
  });

  // A Target needs no worker, so the form can be driven end to end without a worker
  // process to validate against; the defaults (OCI/Any) are what the server accepts.
  test('should add a target without a worker', async ({ page }) => {
    const targetName = RandomSlugGenerator.randomSlugName();

    const targetListPage = new TargetListPage(page);

    await targetListPage.goto();
    await targetListPage.addTarget({ targetName });

    await targetListPage.expectToBeVisibleByText(targetName);
  });

  test('should delete a target', async ({ page }) => {
    const targetName = RandomSlugGenerator.randomSlugName();

    const targetListPage = new TargetListPage(page);

    await targetListPage.goto();
    await targetListPage.addTarget({ targetName });

    await targetListPage.deleteTarget(targetName);

    await targetListPage.expectNotToBeVisibleByText(targetName);
  });

  // Workers require running first to be validated.  We can't run workers in the UI so creating a target will always break because a worker hasn't been run and validated yet.
  test.skip('should filter the target list', async ({ page }) => {
    const workerName = RandomSlugGenerator.randomSlugName();
    const targetName = RandomSlugGenerator.randomSlugName();
    const providerType = 'ConfigMap';
    const additionalTargetname = RandomSlugGenerator.randomSlugName();

    const targetListPage = new TargetListPage(page);
    const workerListPage = new WorkerListPage(page);

    await workerListPage.goto();
    await workerListPage.addWorker(workerName);

    await targetListPage.goto();
    await targetListPage.addTarget({ targetName, workerName });
    await targetListPage.addTarget({
      targetName: additionalTargetname,
      providerType,
      workerName,
    });

    await targetListPage.filterTargets(`ProviderType = 'ConfigMap'`);

    await targetListPage.expectNotToBeVisibleByText(targetName);
    await targetListPage.expectToBeVisibleByText(additionalTargetname);
  });

  // Workers require running first to be validated.  We can't run workers in the UI so creating a target will always break because a worker hasn't been run and validated yet.
  test.skip('should show an error when filtering the target list with an invalid query', async ({
    page,
  }) => {
    const workerName = RandomSlugGenerator.randomSlugName();
    const targetName = RandomSlugGenerator.randomSlugName();

    const targetListPage = new TargetListPage(page);
    const workerListPage = new WorkerListPage(page);

    await workerListPage.goto();
    await workerListPage.addWorker(workerName);

    await targetListPage.goto();
    await targetListPage.addTarget({ targetName, workerName });

    await targetListPage.filterTargets(`Provider Type === 'ConfigMap'`);

    await targetListPage.expectToBeVisibleByText(
      'Error: unrecognized attribute name `Provider`',
    );
  });

  // Workers require running first to be validated.  We can't run workers in the UI so creating a target will always break because a worker hasn't been run and validated yet.
  test.skip('should add delete gates to targets and prevent deletion', async ({ page }) => {
    const workerName = RandomSlugGenerator.randomSlugName();
    const targetName = RandomSlugGenerator.randomSlugName();
    const deleteGate = 'production-protection';

    const targetListPage = new TargetListPage(page);
    const workerListPage = new WorkerListPage(page);

    // Create a worker first
    await workerListPage.goto();
    await workerListPage.addWorker(workerName);

    // Create a target
    await targetListPage.goto();
    await targetListPage.addTarget({ targetName, workerName });

    // Verify target exists
    await expect(page.getByRole('row', { name: targetName })).toBeVisible();

    // Add delete gate to the target
    await targetListPage.editTargetWithDeleteGates({
      targetName,
      deleteGates: [deleteGate],
    });

    // Attempt to delete the target and expect it to fail with delete gate error
    await targetListPage.attemptDeleteTargetByNameExpectingError(
      targetName,
      'Error: outstanding DeleteGates',
    );

    // Verify the target still exists (wasn't deleted)
    await expect(page.getByRole('row', { name: targetName })).toBeVisible();
  });

  test('should show empty state when filter matches nothing', async ({ page }) => {
    const targetListPage = new TargetListPage(page);

    await targetListPage.goto();

    // Apply filter that matches nothing
    await targetListPage.filterTargets(`Slug = 'nonexistent-target-12345'`);

    // Verify the filtered empty state is shown
    await expect(page.getByText('No matching targets')).toBeVisible();

    // Click clear filters button in the empty state
    await page.getByRole('button', { name: 'Clear all filters' }).click();

    // Wait for data to reload — empty state should disappear
    await expect(page.getByText('No matching targets')).not.toBeVisible();
  });

  test('should clear filters and reset form', async ({ page }) => {
    const targetListPage = new TargetListPage(page);

    await targetListPage.goto();

    // Add a filter using QueryBuilder
    await targetListPage.filterTargets(`Slug = 'test'`);

    // Verify filter is applied (Clear all button visible means filters exist)
    await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();

    // Clear filters
    await targetListPage.clearFilters();

    // Verify filters are cleared — Filter button reappears when no filters exist
    await expect(page.locator('button').filter({ hasText: /^Filter$/ })).toBeVisible();
  });

  // URL Sync Tests
  test.describe('URL sync', () => {
    test('should update URL when filter is added', async ({ page }) => {
      const targetListPage = new TargetListPage(page);

      await targetListPage.goto();

      // Apply a filter
      await targetListPage.filterTargets(`Slug = 'test-target'`);

      // Verify URL contains the filter param (filterWhere is the URL param name)
      await expect(page).toHaveURL(/filterWhere=/);
    });

    test('should restore filters from URL on page load', async ({ page }) => {
      // Navigate directly to URL with filter params (filterWhere is the URL param name)
      await page.goto('/targets?filterWhere=Slug%20%3D%20%27test-filter-target%27');

      // Verify the filter is displayed in QueryBuilder (Clear all button should be visible)
      await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();
    });

    test('should clear URL params when filters cleared', async ({ page }) => {
      // Start with filters in URL (filterWhere is the URL param name)
      await page.goto('/targets?filterWhere=Slug%20%3D%20%27test%27');

      // Wait for filter to be restored from URL
      await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();

      // Clear filters
      const targetListPage = new TargetListPage(page);
      await targetListPage.clearFilters();

      // Verify URL no longer contains filter params
      await expect(page).not.toHaveURL(/filterWhere=/);
    });

    test('should preserve filter state on page refresh', async ({ page }) => {
      const targetListPage = new TargetListPage(page);

      await targetListPage.goto();

      // Apply a filter
      await targetListPage.filterTargets(`Slug = 'refresh-test'`);

      // Wait for URL to update
      await expect(page).toHaveURL(/filterWhere=/);

      // Refresh the page
      await page.reload();

      // Verify the filter is still applied (Clear all button should be visible)
      await expect(page.getByRole('button', { name: 'Clear all', exact: true })).toBeVisible();
    });
  });
});
