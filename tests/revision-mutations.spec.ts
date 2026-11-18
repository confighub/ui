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

test.describe('revision mutations', () => {
  test.use({ storageState: 'authentication.json' });

  let spaceId = '';
  let unitId = '';
  const triggerSlug = RandomSlugGenerator.randomSlugName();

  // A Space with a set-pod-defaults trigger, so the Unit's revision carries
  // mutations for the revision viewer to show.
  test.beforeAll(async ({ browser }) => {
    const page = await newAuthorizedPage(browser);
    try {
      const api = new ApiHelper(page);
      spaceId = (await api.createSpace({ space: { Slug: RandomSlugGenerator.randomSlugName() } })).SpaceID as string;

      const trigger = await hubApi.post(`/api/space/${spaceId}/trigger`, {
        data: {
          Slug: triggerSlug,
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

  test('the revision viewer shows the function, Trigger and changes of each mutation in a revision', async ({ page }) => {
    const unitDetailPage = new UnitDetailPage(page);

    await page.goto(`/units/${spaceId}/${unitId}`);
    const drawer = await unitDetailPage.openHeadRevisionMutations();

    const mutation = drawer.getByTestId('revision-mutation').filter({ hasText: 'set-pod-defaults' });
    await expect(mutation).toHaveCount(1, { timeout: 15000 });
    await expect(mutation.getByRole('link', { name: triggerSlug })).toBeVisible();
    await expect(mutation).toContainText('pod-security=true');

    // The paths the Trigger set, by resource, from the revision's mutation sources.
    const changes = mutation.getByTestId('revision-mutation-changes');
    await expect(changes).toContainText('Deployment', { timeout: 15000 });
    await expect(changes).toContainText('securityContext');
  });
});
