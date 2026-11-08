// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse, Page } from '@playwright/test';

import { unitBlameHref } from '../src/pages/unit-detail/unitDetailHrefs';
import { expect, hubApi, test } from './fixtures/test';

/**
 * Editing guards from the Blame tab: recording one with the value written, setting one inherited,
 * changing the guards at a path that already has some, which needs a clearance for them, and
 * making a guard inherited or local.
 */

const DEPLOYMENT = 'apps/v1/Deployment';
const RESOURCE_NAME = 'default/web';

const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 2
  minReadySeconds: 5
  revisionHistoryLimit: 10
  progressDeadlineSeconds: 600
  strategy:
    type: Recreate
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

type Annotations = Record<string, Record<string, string>>;

type UnitResponse = {
  Unit: {
    UnitID: string;
    ValidationErrors?: Record<string, boolean>;
    PathAnnotations?: {
      Resource?: { ResourceName?: string };
      PathAnnotationMap?: Record<string, Annotations>;
    }[];
  };
};

test.describe('Blame tab: editing guards', () => {
  let spaceId = '';
  let unitId = '';

  const unit = async () =>
    body<UnitResponse>(await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`), 'unit');
  // A write queues a trigger pass, which can cut a Revision of its own; the next write waits for
  // it, or it races it and is refused for a stale head.
  const settled = async () =>
    expect
      .poll(async () =>
        Object.keys((await unit()).Unit.ValidationErrors ?? {}).includes('awaiting/triggers'),
      )
      .toBe(false);
  /** The annotations recorded at one path of the Deployment, as the Unit stores them. */
  const annotationsAt = async (path: string): Promise<Annotations> =>
    (await unit()).Unit.PathAnnotations?.find(
      (entry) => entry.Resource?.ResourceName === RESOURCE_NAME,
    )?.PathAnnotationMap?.[path] ?? {};
  const unitData = async () => {
    const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/data`);
    if (!response.ok()) throw new Error(`unit data: ${response.status()}`);
    return response.text();
  };
  const setGuards = async (set: Record<string, Record<string, string>>) => {
    await body(
      await hubApi.post(`/api/space/${spaceId}/unit/${unitId}/guard`, {
        data: {
          ResourceGuards: [
            { Resource: { ResourceType: DEPLOYMENT, ResourceName: RESOURCE_NAME }, Set: set },
          ],
        },
      }),
      'guard',
    );
    await settled();
  };
  /** Opens the Blame tab at one field and selects it. */
  const selectField = async (page: Page, path: string) => {
    await page.goto(unitBlameHref(spaceId, unitId, path));
    const blame = page.getByTestId('blame-tab');
    const row = blame.getByRole('row').filter({ hasText: path });
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await row.getByRole('checkbox').check();
    // A row click also opens the field's drawer, which is not what these tests are about.
    await page.keyboard.press('Escape');
    return blame;
  };

  test.beforeAll(async () => {
    const slug = `blame-guard-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    spaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', { data: { Slug: slug, Labels: { Owner: 'E2E' } } }),
        'space',
      )
    ).SpaceID;
    unitId = (
      await body<UnitResponse>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          data: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' },
        }),
        'unit',
      )
    ).Unit.UnitID;
    await body(
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, { data: deployment }),
      'unit data',
    );
    await settled();
  });

  test.afterAll(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('Set value records the guard it is asked to on the value written', async ({ page }) => {
    const blame = await selectField(page, 'spec.replicas');
    await blame.getByRole('button', { name: 'Set value', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Set value' });
    await dialog.getByRole('textbox', { name: 'Value (YAML)' }).fill('4');
    const set = dialog.getByRole('button', { name: 'Set value', exact: true });
    await dialog
      .getByRole('checkbox', { name: 'Guard the values written', exact: true })
      .check();
    // A guard needs a key.
    await expect(set).toBeDisabled();
    await dialog.getByRole('textbox', { name: 'Guard key' }).fill('Scale');
    await dialog.getByRole('textbox', { name: 'Guard value' }).fill('RegionSpecific');
    await set.click();
    await expect(page.getByText('spec.replicas set', { exact: true })).toBeVisible();

    await expect.poll(unitData).toContain('replicas: 4');
    const recorded = await annotationsAt('spec.replicas');
    expect(recorded.Guard).toEqual({ Scale: 'RegionSpecific' });
    expect(recorded.GuardInherited ?? {}).toEqual({});
  });

  test('Set guard records an inherited guard', async ({ page }) => {
    const blame = await selectField(page, 'spec.minReadySeconds');
    await blame.getByRole('button', { name: 'Set guard', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Set guard' });
    await dialog.getByRole('textbox', { name: 'Key', exact: true }).fill('Owner');
    await dialog.getByRole('textbox', { name: 'Value', exact: true }).fill('Platform');
    await dialog
      .getByRole('checkbox', { name: 'Inherited by clones and downstream Units', exact: true })
      .check();
    // The path has no guards yet, so there is nothing to acknowledge.
    await expect(dialog.getByTestId('guard-acknowledgements')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Set guard', exact: true }).click();
    await expect(
      page.getByText('Guard Owner set on the selected fields', { exact: true }),
    ).toBeVisible();

    const recorded = await annotationsAt('spec.minReadySeconds');
    expect(recorded.Guard).toEqual({ Owner: 'Platform' });
    expect(Object.keys(recorded.GuardInherited ?? {})).toEqual(['Owner']);
  });

  test("Set guard where the path has guards asks for them, and not for an ancestor's", async ({
    page,
  }) => {
    await setGuards({
      'spec.strategy': { Team: 'Web' },
      'spec.strategy.type': { RunAsRoot: 'LegacyImage' },
    });
    const blame = await selectField(page, 'spec.strategy.type');
    await blame.getByRole('button', { name: 'Set guard', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Set guard' });
    await dialog.getByRole('textbox', { name: 'Key', exact: true }).fill('Scale');
    await dialog.getByRole('textbox', { name: 'Value', exact: true }).fill('Fixed');
    const acknowledgements = dialog.getByTestId('guard-acknowledgements');
    const acknowledge = acknowledgements.getByRole('checkbox', {
      name: 'RunAsRoot=LegacyImage',
      exact: true,
    });
    await expect(acknowledge).toBeVisible();
    // The edit writes the path's own guards, so its ancestor's are not disturbed.
    await expect(acknowledgements.getByRole('checkbox')).toHaveCount(1);
    const submit = dialog.getByRole('button', { name: 'Set guard', exact: true });
    await expect(submit).toBeDisabled();
    await acknowledge.check();
    await submit.click();
    await expect(
      page.getByText('Guard Scale set on the selected fields', { exact: true }),
    ).toBeVisible();

    expect((await annotationsAt('spec.strategy.type')).Guard).toEqual({
      RunAsRoot: 'LegacyImage',
      Scale: 'Fixed',
    });
  });

  test('Make inherited and Make local switch whether a guard is inherited', async ({
    page,
  }) => {
    await setGuards({ 'spec.progressDeadlineSeconds': { RunAsRoot: 'LegacyImage' } });
    let blame = await selectField(page, 'spec.progressDeadlineSeconds');
    await expect(
      blame.getByRole('button', { name: 'Make local', exact: true }),
    ).toBeDisabled();
    await blame.getByRole('button', { name: 'Make inherited', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Make inherited' });
    let submit = dialog.getByRole('button', { name: 'Make inherited', exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByRole('checkbox', { name: 'RunAsRoot=LegacyImage', exact: true }).check();
    await submit.click();
    await expect(
      page.getByText('Guard RunAsRoot is inherited by clones and downstream Units', {
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        Object.keys(
          (await annotationsAt('spec.progressDeadlineSeconds')).GuardInherited ?? {},
        ),
      )
      .toEqual(['RunAsRoot']);
    await settled();

    blame = await selectField(page, 'spec.progressDeadlineSeconds');
    await expect(
      blame.getByRole('button', { name: 'Make inherited', exact: true }),
    ).toBeDisabled();
    await blame.getByRole('button', { name: 'Make local', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Make local' });
    submit = dialog.getByRole('button', { name: 'Make local', exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByRole('checkbox', { name: 'RunAsRoot=LegacyImage', exact: true }).check();
    await submit.click();
    await expect(
      page.getByText('Guard RunAsRoot stays with this Unit', { exact: true }),
    ).toBeVisible();
    const recorded = await annotationsAt('spec.progressDeadlineSeconds');
    expect(recorded.Guard).toEqual({ RunAsRoot: 'LegacyImage' });
    expect(recorded.GuardInherited ?? {}).toEqual({});
  });
});
