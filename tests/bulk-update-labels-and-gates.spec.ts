// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';

import {
  addBulkRowToAll,
  addBulkRows,
  bulkLabelValue,
  changeBulkLabel,
  removeBulkRow,
} from './fixtures/bulk-metadata';
import { EntityGridFixture } from './fixtures/entity-grid-fixture';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// The Update action of the Spaces and Targets pages: it adds, changes and removes the labels and
// delete gates of every selected entity.

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

interface Entity {
  Slug: string;
  Labels?: Record<string, string>;
  DeleteGates?: Record<string, boolean>;
}

/**
 * Two entities' starting labels and gates: tier and keep are shared, owner differs, and only the
 * first has region and backup.
 */
const STARTING = [
  {
    Labels: { tier: 'web', owner: 'alice', region: 'us' },
    DeleteGates: { keep: true, backup: true },
  },
  { Labels: { tier: 'web', owner: 'bob' }, DeleteGates: { keep: true } },
];

const ok = async (response: { ok(): boolean; text(): Promise<string> }) => {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response;
};

const rowOf = (page: Page, slug: string) =>
  page.locator('.MuiDataGrid-row', { hasText: slug });

/** Narrows the page's list to `prefix` and selects the rows of `slugs`. */
const select = async (page: Page, prefix: string, slugs: string[]) => {
  // The toolbar is remounted until the list has loaded.
  await new EntityGridFixture(page).waitForGridReady();
  await page.getByPlaceholder('Search…').fill(prefix);
  for (const slug of slugs) {
    await expect(rowOf(page, slug)).toBeVisible({ timeout: 15000 });
    await rowOf(page, slug).locator('.MuiDataGrid-cellCheckbox input').check();
  }
};

/**
 * In the open Update drawer: tier changed to api, owner (two values) removed, region put on both,
 * team=core added; the gate keep removed, backup put on both, and manual-review added.
 */
const editLabelsAndGates = async (page: Page, entityName: string) => {
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.getByTestId('bulk-labels-section')).toBeVisible();
  await expect(await bulkLabelValue(page, 'owner')).toHaveAttribute('placeholder', '2 values');
  await changeBulkLabel(page, 'tier', 'api');
  await removeBulkRow(page, 'labels', 'owner');
  await addBulkRowToAll(page, 'labels', 'region');
  await addBulkRows(page, 'labels', { team: 'core' });
  await removeBulkRow(page, 'delete-gates', 'keep');
  await addBulkRowToAll(page, 'delete-gates', 'backup');
  await addBulkRows(page, 'delete-gates', ['manual-review']);
  await page.getByRole('button', { name: `Update ${entityName}` }).click();
  await expect(page.getByRole('button', { name: `Update ${entityName}` })).toBeHidden();
};

/** What the edit leaves on each entity, as [Slug, labels, gates]. */
const summary = (entities: Entity[]) =>
  entities
    .map((e) => [
      e.Slug,
      {
        tier: e.Labels?.tier,
        owner: e.Labels?.owner,
        region: e.Labels?.region,
        team: e.Labels?.team,
      },
      e.DeleteGates ?? {},
    ])
    .sort();

const EDITED = { tier: 'api', owner: undefined, region: 'us', team: 'core' };
const EDITED_GATES = { backup: true, 'manual-review': true };

test.describe('bulk Update of labels and delete gates', () => {
  test('updates the labels and delete gates of the selected Spaces', async ({ page }) => {
    const base = `bulkmeta-${RandomSlugGenerator.randomSlugName()}`;
    const slugs = [`${base}-a`, `${base}-b`];
    const ids: string[] = [];
    try {
      for (const [i, slug] of slugs.entries()) {
        const response = await ok(
          await hubApi.post('/api/space', { data: { Slug: slug, ...STARTING[i] } }),
        );
        ids.push(((await response.json()) as { SpaceID: string }).SpaceID);
      }
      const spaces = async () => {
        const response = await ok(
          await hubApi.get('/api/space', { params: { where: `Slug LIKE '${base}-%'` } }),
        );
        return ((await response.json()) as Array<{ Space: Entity }>).map((s) => s.Space);
      };

      await page.goto('/spaces');
      await select(page, base, slugs);
      await editLabelsAndGates(page, 'Spaces');

      await expect
        .poll(async () => summary(await spaces()))
        .toEqual(slugs.map((slug) => [slug, EDITED, EDITED_GATES]));
    } finally {
      for (const id of ids) {
        await hubApi.patch(`/api/space/${id}`, {
          headers: MERGE_PATCH,
          data: { DeleteGates: null },
        });
        await hubApi.delete(`/api/space/${id}`, { params: { recursive: 'true' } });
      }
    }
  });

  test('updates the labels and delete gates of the selected Targets', async ({ page }) => {
    const base = `bulkmeta-${RandomSlugGenerator.randomSlugName()}`;
    const slugs = [`${base}-a`, `${base}-b`];
    const space = await ok(await hubApi.post('/api/space', { data: { Slug: base } }));
    const spaceId = ((await space.json()) as { SpaceID: string }).SpaceID;
    try {
      for (const [i, slug] of slugs.entries()) {
        await ok(
          await hubApi.post(`/api/space/${spaceId}/target`, {
            data: { Slug: slug, ...STARTING[i] },
          }),
        );
      }
      const targets = async () => {
        const response = await ok(await hubApi.get(`/api/space/${spaceId}/target`));
        return ((await response.json()) as Array<{ Target: Entity }>).map((t) => t.Target);
      };

      await page.goto('/targets');
      await select(page, base, slugs);
      await editLabelsAndGates(page, 'Targets');

      await expect
        .poll(async () => summary(await targets()))
        .toEqual(slugs.map((slug) => [slug, EDITED, EDITED_GATES]));
    } finally {
      await hubApi.patch('/api/target', {
        headers: MERGE_PATCH,
        params: { where: `SpaceID = '${spaceId}'` },
        data: { DeleteGates: null },
      });
      await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } });
    }
  });
});
