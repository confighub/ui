// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test } from './fixtures/test';

import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import { WorkerDetailPage } from './fixtures/worker-detail-page';
import { WorkerListPage } from './fixtures/worker-list-page';

test.describe('worker list page', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
  test.use({ storageState: 'authentication.json' });

  test('should edit a worker', async ({ page }) => {
    const workerSlug = RandomSlugGenerator.randomSlugName();
    const editedWorkerSlug = RandomSlugGenerator.randomSlugName();

    const workerListPage = new WorkerListPage(page);
    const workerDetailPage = new WorkerDetailPage(page);

    await workerListPage.goto();
    await workerListPage.addWorker(workerSlug);

    // Edit the worker using the drawer
    await workerDetailPage.editWorker(workerSlug, editedWorkerSlug);

    await workerListPage.getRowByName(editedWorkerSlug);
  });

  test('should delete a worker', async ({ page }) => {
    const workerSlug = RandomSlugGenerator.randomSlugName();

    const workerListPage = new WorkerListPage(page);
    const workerDetailPage = new WorkerDetailPage(page);

    await workerListPage.goto();
    await workerListPage.addWorker(workerSlug);

    await workerDetailPage.checkWorkerByName(workerSlug);

    await workerDetailPage.deleteWorker();

    await workerListPage.expectNotToBeVisibleByText(workerSlug);
  });
});
