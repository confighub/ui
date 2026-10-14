// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Page } from '@playwright/test';
import { WorkerListPage } from './worker-list-page';

export class WorkerDetailPage {
  constructor(public readonly page: Page) {}

  async goToWorkerDetailPage(workerSlug: string) {
    const workerListPage = new WorkerListPage(this.page);

    // Click on the worker name in the table to open edit drawer
    await workerListPage.goToDetailPageByRowClick(workerSlug);
  }

  async editWorker(oldname: string, newName: string) {
    await this.goToWorkerDetailPage(oldname);
    // Click on the worker name to open edit drawer (uses underlined text click pattern)
    await this.page.getByRole('textbox', { name: 'Name' }).fill(newName);

    // Click Update Bridge Worker button
    await this.page.getByRole('button', { name: 'Update Bridge Worker' }).click();

    // Wait for drawer to close
    await this.page.waitForTimeout(1000);
  }
}
