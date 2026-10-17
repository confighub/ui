// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The ChangeOrder detail page names the ChangeSet its change was made in, with that
// ChangeSet's Description, above the diff. The fixture's default interval makes the change
// inside a ChangeSet and closes it before the ChangeOrder is created.

import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { type ChangeOrderFixture, buildChangeOrderFixture } from './fixtures/change-order-fixture';

test.describe('ChangeOrder detail — the ChangeSets the change was made in', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const fixtureContext = await newAuthorizedContext(browser);
    fixturePage = await fixtureContext.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    await fixturePage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await expect
      .poll(
        async () => (await hubApi.get('/api/space', { params: { limit: 1 } })).status(),
        { timeout: 60000, intervals: [1000] }
      )
      .toBe(200);
    fx = await buildChangeOrderFixture(fixturePage, { resources: 'minimal' });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  test('shows the closed ChangeSet and its Description', async ({ page }) => {
    await page.goto(fx.changeOrderPath);
    const region = page.getByRole('region', { name: 'ChangeSets', exact: true });
    await expect(region).toBeVisible({ timeout: 30000 });
    const changeSet = region.getByTestId('change-order-change-set');
    await expect(changeSet).toHaveCount(1);
    await expect(changeSet.getByTestId('change-order-change-set-slug')).toHaveText(`${fx.appLabel}-changeset`);
    await expect(changeSet).toContainText('Closed');
    await expect(changeSet.getByTestId('change-order-change-set-description')).toHaveText('Release v0.2.20');

    // The slug opens the ChangeSet's own page.
    await changeSet.getByTestId('change-order-change-set-slug').click();
    await expect(page).toHaveURL(new RegExp(`/change-sets/[^/]+/${fx.appLabel}-changeset$`));
    await expect(page.getByRole('heading', { level: 1, name: `${fx.appLabel}-changeset`, exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('change-set-description')).toHaveText('Release v0.2.20');
  });
});
