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
    HeadRevisionNum: number;
    Conflicts?: { Reason: string; Path?: string }[];
    PathAnnotations?: {
      PathAnnotationMap?: Record<string, Record<string, Record<string, string>>>;
    }[];
  };
};

test.describe('Blame tab: dismissing a conflict for good', () => {
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
  const setData = async (unitId: string, replicas: number, protect = false) => {
    await body(
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, {
        params: protect ? { protect: 'true' } : {},
        data: deployment(replicas),
      }),
      'unit data',
    );
    await settled(unitId);
  };
  const upgrade = async () => {
    await body(
      await hubApi.patch(`/api/space/${spaceId}/unit/${variantId}`, {
        headers: MERGE_PATCH,
        params: { upgrade: 'true' },
        data: {},
      }),
      'upgrade',
    );
    await settled(variantId);
  };
  const variant = async () =>
    body<UnitResponse>(await hubApi.get(`/api/space/${spaceId}/unit/${variantId}`), 'unit');

  test.beforeAll(async () => {
    const slug = `blame-dismiss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    // The variant keeps its own replica count, so the upgrade withholds the base's.
    await setData(variantId, 7, true);
    await setData(baseId, 9);
    await upgrade();
    const conflicts = (await variant()).Unit.Conflicts ?? [];
    expect(conflicts.map((conflict) => conflict.Path)).toEqual(['spec.replicas']);
  });

  test.afterAll(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('a conflict dismissed for good stays dismissed when the next merge reports it', async ({
    page,
  }) => {
    await page.goto(unitBlameHref(spaceId, variantId, 'spec.replicas'));
    const blame = page.getByTestId('blame-tab');
    const row = blame.getByRole('row').filter({ hasText: 'spec.replicas' });
    await expect(row).toHaveCount(1);
    await row.getByRole('checkbox').check();
    // A row click also opens the field's drawer, which is not what this test is about.
    await page.keyboard.press('Escape');

    await blame.getByRole('button', { name: 'Dismiss conflicts', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Dismiss conflicts' });
    await expect(dialog.getByTestId('dismiss-conflicts-list')).toContainText('spec.replicas');
    await dialog
      .getByRole('checkbox', { name: 'Also dismiss them whenever a later merge reports them' })
      .check();
    await dialog.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(
      page.getByText('Dismissed 1 conflict, and later merges will dismiss them too'),
    ).toBeVisible();

    // Recorded on the Unit, and applied by the next merge that reports the same conflict.
    let unit = (await variant()).Unit;
    expect(unit.Conflicts ?? []).toEqual([]);
    const dismissals = (unit.PathAnnotations ?? []).flatMap((entry) =>
      Object.values(entry.PathAnnotationMap ?? {}).map(
        (annotations) => annotations.ConflictDismissal,
      ),
    );
    expect(dismissals.filter(Boolean)).toHaveLength(1);

    await setData(baseId, 11);
    const before = unit.HeadRevisionNum;
    await upgrade();
    unit = (await variant()).Unit;
    expect(unit.Conflicts ?? []).toEqual([]);
    expect(unit.HeadRevisionNum).toBe(before + 2);

    // The row is flagged, and the field's drawer says what is dismissed there and where.
    await page.reload();
    const dismissedRow = blame.getByRole('row').filter({ hasText: 'spec.replicas' });
    await expect(dismissedRow.getByText('Conflicts dismissed', { exact: true })).toBeVisible();
    await dismissedRow.getByRole('gridcell').nth(2).click();
    const drawerLine = page.getByText(/^(ProtectedPath|Subtracted), at spec\.replicas$/);
    await expect(drawerLine).toBeVisible();
    await page.keyboard.press('Escape');

    // Undismissed, the next merge reports the conflict again.
    await dismissedRow.getByRole('checkbox').check();
    await page.keyboard.press('Escape');
    await blame.getByRole('button', { name: 'Undismiss conflicts', exact: true }).click();
    const undismiss = page.getByRole('dialog', { name: 'Undismiss conflicts' });
    await expect(undismiss.getByTestId('undismiss-conflicts-list')).toContainText(
      'spec.replicas',
    );
    await undismiss.getByRole('button', { name: 'Undismiss', exact: true }).click();
    await expect(page.getByText(/^Removed 1 conflict dismissal;/)).toBeVisible();

    await setData(baseId, 12);
    await upgrade();
    unit = (await variant()).Unit;
    expect((unit.Conflicts ?? []).map((conflict) => conflict.Path)).toEqual(['spec.replicas']);
  });
});
