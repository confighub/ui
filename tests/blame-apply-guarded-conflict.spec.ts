// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse } from '@playwright/test';

import { unitBlameHref } from '../src/pages/unit-detail/unitDetailHrefs';
import { expect, hubApi, test } from './fixtures/test';

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

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

type UnitResponse = {
  Unit: {
    UnitID: string;
    ValidationErrors?: Record<string, boolean>;
    Conflicts?: { Reason: string; Path?: string }[];
    PathAnnotations?: {
      PathAnnotationMap?: Record<string, Record<string, Record<string, string>>>;
    }[];
  };
};

test.describe('Blame tab: applying a conflict a guard withheld', () => {
  let spaceId = '';
  let baseId = '';
  let variantId = '';

  // A write queues a trigger pass, which can cut a Revision of its own; the next write waits for
  // it, or it races it and is refused for a stale head.
  const settled = async (unitId: string) =>
    expect
      .poll(async () => {
        const unit = await body<UnitResponse>(
          await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`),
          'unit',
        );
        return Object.keys(unit.Unit.ValidationErrors ?? {}).includes('awaiting/triggers');
      })
      .toBe(false);
  const setData = async (unitId: string, replicas: number) => {
    await body(
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, {
        data: deployment(replicas),
      }),
      'unit data',
    );
    await settled(unitId);
  };
  const variant = async () =>
    body<UnitResponse>(await hubApi.get(`/api/space/${spaceId}/unit/${variantId}`), 'unit');
  const variantData = async () => {
    const response = await hubApi.get(`/api/space/${spaceId}/unit/${variantId}/data`);
    if (!response.ok()) throw new Error(`unit data: ${response.status()}`);
    return response.text();
  };

  test.beforeAll(async () => {
    const slug = `blame-guarded-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    spaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', { data: { Slug: slug, Labels: { Owner: 'E2E' } } }),
        'space',
      )
    ).SpaceID;
    baseId = (
      await body<UnitResponse>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          data: { Slug: 'base', ToolchainType: 'Kubernetes/YAML' },
        }),
        'base unit',
      )
    ).Unit.UnitID;
    await setData(baseId, 2);
    variantId = (
      await body<UnitResponse>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          params: { upstream_space_id: spaceId, upstream_unit_id: baseId },
          data: { Slug: 'variant', ToolchainType: 'Kubernetes/YAML' },
        }),
        'variant unit',
      )
    ).Unit.UnitID;
    await settled(variantId);
    // The variant states two reasons for its replica count. The upgrade is cleared for one of
    // them, so the conflict names only the other, but applying it is checked against both.
    await body(
      await hubApi.post(`/api/space/${spaceId}/unit/${variantId}/guard`, {
        data: {
          ResourceGuards: [
            {
              Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'default/web' },
              Set: { 'spec.replicas': { Scale: 'RegionSpecific', owner: 'local' } },
            },
          ],
        },
      }),
      'guard',
    );
    await settled(variantId);
    await setData(baseId, 9);
    await body(
      await hubApi.patch(`/api/space/${spaceId}/unit/${variantId}`, {
        headers: MERGE_PATCH,
        params: {
          upgrade: 'true',
          clearance: JSON.stringify([{ Key: 'owner', Operator: 'Exists' }]),
        },
        data: {},
      }),
      'upgrade',
    );
    await settled(variantId);
    const conflicts = (await variant()).Unit.Conflicts ?? [];
    expect(conflicts.map((conflict) => conflict.Reason)).toEqual(['Guarded']);
  });

  test.afterAll(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('the apply waits for the guard to be acknowledged, and leaves the guard in place', async ({
    page,
  }) => {
    await page.goto(unitBlameHref(spaceId, variantId, 'spec.replicas'));
    const blame = page.getByTestId('blame-tab');
    const row = blame.getByRole('row').filter({ hasText: 'spec.replicas' });
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await row.getByRole('checkbox').check();
    // A row click also opens the field's drawer, which is not what this test is about.
    await page.keyboard.press('Escape');

    await blame.getByRole('button', { name: 'Apply conflicts', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Apply withheld upstream changes' });
    const guards = dialog.getByTestId('apply-conflicts-guards');
    const acknowledge = guards.getByRole('checkbox', {
      name: 'Scale=RegionSpecific',
      exact: true,
    });
    const acknowledgeOwner = guards.getByRole('checkbox', {
      name: 'owner=local',
      exact: true,
    });
    await expect(acknowledge).toBeVisible();
    await expect(acknowledgeOwner).toBeVisible();
    // The preview is of the change the guard withheld.
    await expect(dialog.getByText('9', { exact: true }).first()).toBeVisible();
    const apply = dialog.getByRole('button', { name: 'Apply', exact: true });
    await expect(apply).toBeDisabled();

    await acknowledge.check();
    await expect(apply).toBeDisabled();
    await acknowledgeOwner.check();
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(page.getByText('Applied 1 withheld change', { exact: true })).toBeVisible();

    await settled(variantId);
    expect(await variantData()).toContain('replicas: 9');
    const unit = (await variant()).Unit;
    expect(unit.Conflicts ?? []).toEqual([]);
    // Clearing a guard is not removing it: the next upgrade is withheld by it again.
    const guard = (unit.PathAnnotations ?? [])
      .map((entry) => entry.PathAnnotationMap?.['spec.replicas']?.Guard?.Scale)
      .find(Boolean);
    expect(guard).toBe('RegionSpecific');
  });
});
