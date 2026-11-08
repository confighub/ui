// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse, Page } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';
import { UnitListPage } from './fixtures/unit-list-page';

/**
 * Upgrading a Unit whose guards would withhold part of what comes from upstream. The person is
 * asked first, and an upgrade that lands without some of the upstream changes says so.
 */

const deployment = (replicas: number, image: string) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ${image}
`;

const body = async <T>(response: APIResponse, what: string): Promise<T> => {
  if (!response.ok())
    throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
};

const chooseMore = async (page: Page, item: string) => {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
};

test.describe('upgrading a guarded Unit', () => {
  let spaceId = '';
  let spaceSlug = '';
  let upstreamId = '';
  let cloneId = '';
  // Unique across the organization, so the Unit list finds this clone and no other.
  let cloneSlug = '';

  const data = async (unitId: string) => {
    const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/data`);
    if (!response.ok()) throw new Error(`unit data: ${response.status()}`);
    return response.text();
  };
  const setUpstream = async (replicas: number, image: string) => {
    await body(
      await hubApi.put(`/api/space/${spaceId}/unit/${upstreamId}/data`, {
        data: deployment(replicas, image),
      }),
      'unit data',
    );
  };

  test.beforeEach(async () => {
    spaceSlug = `guarded-upgrade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    spaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: { Slug: spaceSlug, Labels: { Owner: 'E2E' } },
        }),
        'space',
      )
    ).SpaceID;
    upstreamId = (
      await body<{ Unit: { UnitID: string } }>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          data: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' },
        }),
        'unit',
      )
    ).Unit.UnitID;
    await setUpstream(2, 'nginx:1.27');
    cloneSlug = `web-prod-${Math.random().toString(36).slice(2, 10)}`;
    cloneId = (
      await body<{ Unit: { UnitID: string } }>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          params: { upstream_space_id: spaceId, upstream_unit_id: upstreamId },
          data: { Slug: cloneSlug, ToolchainType: 'Kubernetes/YAML' },
        }),
        'clone',
      )
    ).Unit.UnitID;
    // The clone's replica count is what it is for a reason an upgrade has to be cleared for.
    await body(
      await hubApi.post(`/api/space/${spaceId}/unit/${cloneId}/guard`, {
        data: {
          ResourceGuards: [
            {
              Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'default/web' },
              Set: { 'spec.replicas': { Scale: 'RegionSpecific' } },
            },
          ],
        },
      }),
      'guard',
    );
    await setUpstream(7, 'nginx:1.28');
  });

  test.afterEach(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('Upgrade asks first, and says what the guards withheld', async ({ page }) => {
    await page.goto(`/units/${spaceId}/${cloneId}`);
    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });

    // Upgraded without the guarded change: the rest lands, and the page says what did not.
    await chooseMore(page, 'Upgrade');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog.getByTestId('guarded-changes')).toContainText('spec.replicas: 2 → 7');
    await expect(
      dialog.getByRole('button', { name: 'Upgrade with clearance' }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Upgrade without them' }).click();
    await expect(page.getByTestId('withheld-by-guards')).toContainText(
      'Guards withheld 1 change: spec.replicas.',
    );
    await expect.poll(() => data(cloneId)).toContain('nginx:1.28');
    expect(await data(cloneId)).toContain('replicas: 2');

    // A later upstream change, cleared, lands.
    await setUpstream(8, 'nginx:1.28');
    await page.reload();
    await chooseMore(page, 'Upgrade');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog.getByTestId('guarded-changes')).toContainText('spec.replicas: 2 → 8');
    await dialog.getByRole('checkbox', { name: 'Scale=RegionSpecific', exact: true }).check();
    await dialog.getByRole('button', { name: 'Upgrade with clearance' }).click();
    await expect.poll(() => data(cloneId)).toContain('replicas: 8');
    await expect(page.getByTestId('withheld-by-guards')).toHaveCount(0);
  });

  test('Push Downstream asks first, and says what the guards withheld', async ({ page }) => {
    await page.goto(`/units/${spaceId}/${upstreamId}`);
    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });

    await chooseMore(page, 'Push Downstream');
    await expect(dialog.getByTestId('guarded-changes')).toContainText('spec.replicas: 2 → 7');
    await dialog.getByRole('button', { name: 'Upgrade without them' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Downstream units' }),
    ).toContainText(`Guards withheld 1 change in ${spaceSlug}/${cloneSlug}`);
    await expect.poll(() => data(cloneId)).toContain('nginx:1.28');
    expect(await data(cloneId)).toContain('replicas: 2');
  });

  test('Upgrade from the Unit list asks first, and says what the guards withheld', async ({
    page,
  }) => {
    const unitList = new UnitListPage(page);
    await unitList.goto();
    await unitList.selectRow(cloneSlug);
    await unitList.selectMoreItemsOptionByName('Upgrade');
    await page.getByRole('button', { name: 'Upgrade', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });
    await expect(dialog.getByTestId('guarded-changes')).toContainText('spec.replicas: 2 → 7');
    await dialog.getByRole('button', { name: 'Upgrade without them' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Units upgraded' })).toContainText(
      `Guards withheld 1 change in ${spaceSlug}/${cloneSlug}`,
    );
    await expect.poll(() => data(cloneId)).toContain('nginx:1.28');
    expect(await data(cloneId)).toContain('replicas: 2');
  });
});
