// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse, Page } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';

/**
 * Restoring a Revision is a write like any other: where guards would withhold part of it, the
 * person is asked first, and a restore that lands without some of its changes says so.
 */

const deployment = (replicas: number, image: string) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: ${replicas}
  template:
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

const SCALE_CLEARANCE = JSON.stringify([
  { Key: 'Scale', Operator: 'In', Values: ['RegionSpecific'] },
]);

test.describe('restoring a Revision of a guarded Unit', () => {
  let spaceId = '';
  let unitId = '';
  /** The Revision that set the guard, holding two replicas of nginx:1.27. */
  let guardedRevisionNum = 0;

  const unitData = async () => {
    const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/data`);
    if (!response.ok()) throw new Error(`unit data: ${response.status()}`);
    return response.text();
  };

  test.beforeEach(async () => {
    const slug = `guarded-restore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    spaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', { data: { Slug: slug, Labels: { Owner: 'E2E' } } }),
        'space',
      )
    ).SpaceID;
    unitId = (
      await body<{ Unit: { UnitID: string } }>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          data: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' },
        }),
        'unit',
      )
    ).Unit.UnitID;
    await body(
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, {
        data: deployment(2, 'nginx:1.27'),
      }),
      'unit data',
    );
    await body(
      await hubApi.post(`/api/space/${spaceId}/unit/${unitId}/guard`, {
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
    guardedRevisionNum = (
      await body<{ Unit: { HeadRevisionNum: number } }>(
        await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`),
        'unit',
      )
    ).Unit.HeadRevisionNum;
    // Scaled since, cleared for the guard, and the image bumped.
    await body(
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, {
        data: deployment(5, 'nginx:1.28'),
        params: { clearance: SCALE_CLEARANCE },
      }),
      'unit data',
    );
  });

  test.afterEach(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  const restore = async (page: Page, revisionNum = guardedRevisionNum) => {
    await page.goto(
      `/units/${spaceId}/${unitId}?tab=2&revisionViewer=true&revision=${revisionNum}&viewMode=single`,
    );
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
  };

  test('asks first, and says what a restore without clearance withheld', async ({ page }) => {
    await restore(page);
    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });
    await expect(dialog.getByTestId('guarded-changes')).toContainText('spec.replicas: 5 → 2');
    await expect(
      dialog.getByRole('button', { name: 'Restore with clearance' }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Restore without them' }).click();

    await expect(page.getByTestId('withheld-by-guards')).toContainText(
      'Guards withheld 1 change: spec.replicas.',
    );
    await expect.poll(unitData).toContain('nginx:1.27');
    expect(await unitData()).toContain('replicas: 5');

    // Cleared for the guard, the rest of the restore lands.
    await restore(page);
    await dialog.getByRole('checkbox', { name: 'Scale=RegionSpecific', exact: true }).check();
    await dialog.getByRole('button', { name: 'Restore with clearance' }).click();
    await expect.poll(unitData).toContain('replicas: 2');
    await expect(page.getByTestId('withheld-by-guards')).toHaveCount(0);
  });

  test('cancelled, nothing is restored', async ({ page }) => {
    await restore(page);
    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    const data = await unitData();
    expect(data).toContain('replicas: 5');
    expect(data).toContain('nginx:1.28');
  });

  // The Revision before the guard has none on the path. A restore to it is checked against the
  // guard the path has now, so it asks, and without a clearance neither the value nor the guard's
  // removal lands.
  test('a restore to before the guard was set asks for it too', async ({ page }) => {
    const scaleGuard = async () =>
      (
        await body<{
          Unit: {
            PathAnnotations?: {
              PathAnnotationMap?: Record<string, { Guard?: Record<string, string> }>;
            }[];
          };
        }>(await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`), 'unit')
      ).Unit.PathAnnotations?.[0]?.PathAnnotationMap?.['spec.replicas']?.Guard?.Scale;

    await restore(page, guardedRevisionNum - 1);
    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });
    const changes = dialog.getByTestId('guarded-changes');
    await expect(changes).toContainText('spec.replicas: 5 → 2');
    await expect(changes).toContainText('spec.replicas: its guards');
    await dialog.getByRole('button', { name: 'Restore without them' }).click();
    await expect(page.getByTestId('withheld-by-guards')).toContainText(
      'Guards withheld 2 changes: spec.replicas.',
    );
    await expect.poll(unitData).toContain('nginx:1.27');
    expect(await unitData()).toContain('replicas: 5');
    expect(await scaleGuard()).toBe('RegionSpecific');

    await restore(page, guardedRevisionNum - 1);
    await dialog.getByRole('checkbox', { name: 'Scale=RegionSpecific', exact: true }).check();
    await dialog.getByRole('button', { name: 'Restore with clearance' }).click();
    await expect.poll(unitData).toContain('replicas: 2');
    await expect.poll(scaleGuard).toBeUndefined();
  });
});
