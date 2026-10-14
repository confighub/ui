// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class TargetDetailPage {
  constructor(public readonly page: Page) {}

  async expectToBeVisibleByText(text: string) {
    await expect(this.page.getByText(text)).toBeVisible();
  }
}
