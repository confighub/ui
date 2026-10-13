// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import { WorkerDetailPage } from './fixtures/worker-detail-page';
import { WorkerListPage } from './fixtures/worker-list-page';

test.describe('bridge worker list page', () => {
  test.use({ storageState: 'authentication.json' });

  test('should edit a worker', async ({ page }) => {
    const workerSlug = RandomSlugGenerator.randomSlugName();
    const editedWorkerSlug = RandomSlugGenerator.randomSlugName();

    const workerListPage = new WorkerListPage(page);
    const workerDetailPage = new WorkerDetailPage(page);

    await workerListPage.goto();
    await workerListPage.addWorker(workerSlug);

    await workerDetailPage.editWorker(workerSlug, editedWorkerSlug);

    await workerListPage.getRowByName(editedWorkerSlug);
  });

  test('should add delete gates to bridge workers and prevent deletion', async ({ page }) => {
    const workerName = RandomSlugGenerator.randomSlugName();
    const deleteGate = 'production-protection';

    const workerListPage = new WorkerListPage(page);

    await workerListPage.goto();
    await workerListPage.addWorker(workerName);
    await workerListPage.getRowByName(workerName);

    await workerListPage.editWorkerWithDeleteGates({
      workerName,
      deleteGates: [deleteGate],
    });

    await workerListPage.attemptDeleteWorkerByNameExpectingError(
      workerName,
      'Error: outstanding DeleteGates',
    );

    // The gate kept the worker
    await workerListPage.getRowByName(workerName);
  });

  test('should keep the edit drawer in the URL across a reload and keep the filter on close', async ({
    page,
  }) => {
    const workerName = RandomSlugGenerator.randomSlugName();
    const workerListPage = new WorkerListPage(page);
    const drawerHeading = page.getByRole('heading', { name: 'Edit Bridge Worker' });
    const workerLink = page.locator('[data-field="Slug"] a', { hasText: workerName });

    await workerListPage.goto();
    await workerListPage.addWorker(workerName);
    await workerListPage.ensureDrawersClosed();

    await workerListPage.filterWorkers(`Slug = '${workerName}'`);
    await expect(page).toHaveURL(/filterWhere=/, { timeout: 5000 });

    await workerLink.click();
    await expect(drawerHeading).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/edit=/);
    await expect(page).toHaveURL(/filterWhere=/);

    // The drawer opens again after a reload, once the worker data has loaded
    await page.reload();
    await expect(drawerHeading).toBeVisible({ timeout: 10000 });

    await page.keyboard.press('Escape');
    await expect(drawerHeading).not.toBeVisible();
    await expect(page).not.toHaveURL(/edit=/);
    await expect(page).toHaveURL(/filterWhere=/);
  });
});
