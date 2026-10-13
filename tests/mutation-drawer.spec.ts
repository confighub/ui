// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { test, expect, hubApi, newAuthorizedPage } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { UnitDetailPage } from './fixtures/unit-details-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('mutations tab', () => {
  test.use({ storageState: 'authentication.json' });

  let spaceId = '';
  let unitId = '';

  // A Space with a set-pod-defaults trigger, so the Unit's revision carries
  // mutations for the drawer to show.
  test.beforeAll(async ({ browser }) => {
    const page = await newAuthorizedPage(browser);
    try {
      const api = new ApiHelper(page);
      spaceId = (await api.createSpace({ space: { Slug: RandomSlugGenerator.randomSlugName() } })).SpaceID as string;

      const trigger = await hubApi.post(`/api/space/${spaceId}/trigger`, {
        data: {
          Slug: RandomSlugGenerator.randomSlugName(),
          Event: 'Mutation',
          ToolchainType: 'Kubernetes/YAML',
          FunctionName: 'set-pod-defaults',
          Arguments: ['pod-security', 'automount-service-account-token', 'security-context', 'resources', 'probes'].map(
            (name) => ({ ParameterName: name, Value: 'true' }),
          ),
        },
      });
      if (!trigger.ok()) throw new Error(`create trigger: ${trigger.status()} ${await trigger.text()}`);

      const unit = await api.createUnit({
        spaceId,
        unit: { Slug: RandomSlugGenerator.randomSlugName(), ToolchainType: 'Kubernetes/YAML' },
      });
      unitId = unit.UnitID as string;
      const yaml = readFileSync(path.resolve(__dirname, 'test-data/todo-app-fe.yml'), 'utf-8');
      await api.uploadUnitData({ spaceId, unitId, body: yaml });
    } finally {
      await page.context().close();
    }
  });

  test.afterAll(async ({ browser }) => {
    const page = await newAuthorizedPage(browser);
    try {
      if (spaceId) {
        await new ApiHelper(page).deleteSpace(spaceId, true).catch((e) => console.warn(`cleanup: Space ${spaceId}: ${e}`));
      }
    } finally {
      await page.context().close();
    }
  });

  test('should open the mutation drawer with a resource tab bar and the revision configuration', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);

    await page.goto(`/units/${spaceId}/${unitId}`);
    await unitDetailPage.goToRevisionsTab();
    await unitDetailPage.checkRowInTableByName('Head');
    await unitDetailPage.goToMutationDetailsDrawer();

    // Scope every assertion to the drawer's paper: the unit detail page keeps its
    // own tab bar and configuration editor mounted behind the drawer, so a
    // page-wide lookup would match those instead.
    const mutationDrawer = page.locator('.MuiDrawer-root .MuiDrawer-paper');

    // The tab bar carries one tab per resource in the unit (todo-app-fe is a
    // Deployment plus a Service).
    await expect(mutationDrawer.getByRole('tab', { name: /Deployment\s*\/todo-app/ })).toBeVisible();
    await expect(mutationDrawer.getByRole('tab', { name: /Service\s*\/todo-app/ })).toBeVisible();

    // Selecting a tab drives the configuration editor, which renders that resource.
    await mutationDrawer.getByRole('tab', { name: /Deployment\s*\/todo-app/ }).click();
    const editorLines = mutationDrawer.locator('div.monaco-editor .view-lines');
    await expect(editorLines).toBeVisible();
    await expect(editorLines).toContainText('kind: Deployment');
    await expect(editorLines).toContainText('todo-app');
  });
});
