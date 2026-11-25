// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse, Page } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';

/**
 * Upgrading from the Unit list when some of the selected Units were never cloned. Those have no
 * upstream Unit to upgrade from, so the upgrade passes them over and says so, and a selection of
 * only those writes nothing.
 */

const deployment = (replicas: number) => `apiVersion: apps/v1
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
          image: nginx:1.27
`;

const body = async <T>(response: APIResponse, what: string): Promise<T> => {
  if (!response.ok())
    throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
};

test.describe('bulk upgrade of Units with no upstream Unit', () => {
  let spaceId = '';
  let spaceSlug = '';
  let upstreamId = '';
  let cloneId = '';
  const suffix = () => Math.random().toString(36).slice(2, 8);
  const cloneSlug = `clone-${suffix()}`;
  const soloSlug = `solo-${suffix()}`;

  const createUnit = async (slug: string, params?: Record<string, string>) =>
    (
      await body<{ Unit: { UnitID: string } }>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          params,
          data: { Slug: slug, ToolchainType: 'Kubernetes/YAML' },
        }),
        `unit ${slug}`,
      )
    ).Unit.UnitID;
  const setData = async (unitId: string, replicas: number) => {
    await body(
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, {
        data: deployment(replicas),
      }),
      'unit data',
    );
  };
  const data = async (unitId: string) => {
    const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/data`);
    if (!response.ok()) throw new Error(`unit data: ${response.status()}`);
    return response.text();
  };

  const openList = async (page: Page) => {
    await page.goto(`/units?filterWhere=${encodeURIComponent(`SpaceID = '${spaceId}'`)}`);
  };
  const select = async (page: Page, slug: string) => {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name: slug, exact: true }) });
    await row.getByRole('checkbox').check();
  };
  const upgrade = async (page: Page) => {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Upgrade', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirm Bulk Upgrade' });
    await dialog.getByRole('button', { name: 'Upgrade', exact: true }).click();
    return dialog;
  };

  test.beforeEach(async () => {
    spaceSlug = `bulk-upgrade-${Date.now()}-${suffix()}`;
    spaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: { Slug: spaceSlug, Labels: { Owner: 'E2E' } },
        }),
        'space',
      )
    ).SpaceID;
    upstreamId = await createUnit(`web-${suffix()}`);
    await setData(upstreamId, 2);
    cloneId = await createUnit(cloneSlug, {
      upstream_space_id: spaceId,
      upstream_unit_id: upstreamId,
    });
    const soloId = await createUnit(soloSlug);
    await setData(soloId, 1);
    // Something upstream for the clone to take.
    await setData(upstreamId, 5);
  });

  test.afterEach(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('upgrades the clones and names the Units it passed over', async ({ page }) => {
    await openList(page);
    await select(page, cloneSlug);
    await select(page, soloSlug);
    const dialog = await upgrade(page);

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('alert')).toContainText(
      `Not upgraded, with no upstream unit: ${spaceSlug}/${soloSlug}.`,
    );
    await expect.poll(() => data(cloneId)).toContain('replicas: 5');
  });

  test('a selection with no upstream Unit writes nothing and says why', async ({ page }) => {
    await openList(page);
    await select(page, soloSlug);
    const dialog = await upgrade(page);

    await expect(dialog).toContainText('This unit has no upstream unit to upgrade from.');
    await expect(dialog).toBeVisible();
  });
});
