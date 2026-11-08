// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse } from '@playwright/test';

import { SOURCE_STAGE_ID } from '../src/pages/x/apps/change-order/changeOrderStages';
import { createChangeWorkflow } from './fixtures/change-order-fixture';
import { expect, hubApi, test } from './fixtures/test';

/**
 * The clearance and guards of the Invocation an Invoke ChangeOrder runs, stated on the
 * ChangeOrder's page. Each promotion reads the Invocation afresh, so what is stated there lands
 * in the stages promoted after it.
 *
 * Seeded: a base Space holding the Invocation (set-replicas 5) and a two-stage workflow, and a
 * Space per stage whose Unit guards spec.replicas with Scale=RegionSpecific.
 */

const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: nginx:1.27
`;

const body = async <T>(response: APIResponse, what: string): Promise<T> => {
  if (!response.ok()) throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
};

interface Seed {
  label: string;
  baseSlug: string;
  baseId: string;
  invocationId: string;
  orderSlug: string;
  /** The Unit each stage's Space holds, guarded at spec.replicas. */
  units: Record<'one' | 'two', { spaceId: string; unitId: string }>;
  spaceIds: string[];
}

async function seed(page: import('@playwright/test').Page): Promise<Seed> {
  const label = `e2e-coclr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const spaceIds: string[] = [];
  const space = async (slug: string, labels: Record<string, string>) => {
    const id = (await body<{ SpaceID: string }>(await hubApi.post('/api/space', { data: { Slug: slug, Labels: { Owner: 'E2E', ...labels } } }), 'space')).SpaceID;
    spaceIds.push(id);
    return id;
  };
  const baseSlug = `${label}-base`;
  const baseId = await space(baseSlug, {});
  const units = {} as Seed['units'];
  for (const stage of ['one', 'two'] as const) {
    const spaceId = await space(`${label}-${stage}`, { Stage: `${label}-${stage}` });
    const unitId = (
      await body<{ Unit: { UnitID: string } }>(await hubApi.post(`/api/space/${spaceId}/unit`, { data: { Slug: 'api', ToolchainType: 'Kubernetes/YAML' } }), 'unit')
    ).Unit.UnitID;
    await body(await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, { data: deployment }), 'data');
    await body(
      await hubApi.post(`/api/space/${spaceId}/unit/${unitId}/guard`, {
        data: { ResourceGuards: [{ Resource: { ResourceType: 'apps/v1/Deployment', ResourceNameWithoutScope: 'api' }, Set: { 'spec.replicas': { Scale: 'RegionSpecific' } } }] },
      }),
      'guard',
    );
    units[stage] = { spaceId, unitId };
  }
  const invocationId = (
    await body<{ InvocationID: string }>(
      await hubApi.post(`/api/space/${baseId}/invocation`, {
        data: {
          Slug: 'set-replicas-5',
          ToolchainType: 'Kubernetes/YAML',
          FunctionInvocations: [{ FunctionName: 'set-replicas', Arguments: [{ ParameterName: 'replicas', Value: '5' }] }],
        },
      }),
      'invocation',
    )
  ).InvocationID;
  const workflowId = await createChangeWorkflow(page, baseId, {
    Slug: 'line',
    Stages: [
      { Name: 'one', WhereSpace: `Labels.Stage = '${label}-one'` },
      { Name: 'two', WhereSpace: `Labels.Stage = '${label}-two'` },
    ],
  });
  const orderSlug = 'scale-out';
  await body(
    await hubApi.post(`/api/space/${baseId}/change_order`, {
      data: {
        Slug: orderSlug,
        UpdateType: 'Invoke',
        InvocationID: invocationId,
        ChangeWorkflowID: workflowId,
        InScopeSpaceIDs: [units.one.spaceId, units.two.spaceId],
      },
    }),
    'change order',
  );
  return { label, baseSlug, baseId, invocationId, orderSlug, units, spaceIds };
}

test.describe('a ChangeOrder Invocation guarded in a stage', () => {
  let s: Seed | undefined;

  test.beforeEach(async ({ page }) => {
    s = await seed(page);
  });

  test.afterEach(async () => {
    for (const spaceId of [...(s?.spaceIds ?? [])].reverse()) {
      await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true', detach: 'true' } }).catch(() => undefined);
    }
  });

  const invocation = async (seeded: Seed) =>
    (await body<{ Invocation: { Clearance?: unknown; Guards?: unknown } }>(await hubApi.get(`/api/space/${seeded.baseId}/invocation/${seeded.invocationId}`), 'invocation'))
      .Invocation;
  const unitData = async (unit: { spaceId: string; unitId: string }) => {
    const response = await hubApi.get(`/api/space/${unit.spaceId}/unit/${unit.unitId}/data`);
    if (!response.ok()) throw new Error(`unit data: ${response.status()}`);
    return response.text();
  };
  const promote = async (seeded: Seed, stage: 'one' | 'two') => {
    const changeOrder = await body<{ ChangeOrder: { ChangeOrderID: string } }[]>(
      await hubApi.get(`/api/space/${seeded.baseId}/change_order`, { params: { where: `Slug = '${seeded.orderSlug}'` } }),
      'change order',
    );
    await body(
      await hubApi.post('/api/promote', { data: { ChangeOrderID: changeOrder[0]?.ChangeOrder.ChangeOrderID, WhereSpace: `SpaceID = '${seeded.units[stage].spaceId}'` } }),
      `promote ${stage}`,
    );
  };
  const openSource = async (page: import('@playwright/test').Page, seeded: Seed) => {
    await page.goto(`/change-orders/${seeded.baseSlug}/${seeded.orderSlug}/${SOURCE_STAGE_ID}`);
    await expect(page.getByTestId('change-order-invocation-source')).toBeVisible({ timeout: 30000 });
  };

  test('the guard named, the Invocation cleared for it, and the next stage takes the change', async ({ page }) => {
    if (s === undefined) throw new Error('no seed');
    // Promoted without a clearance: the guard withholds the change, and stage one counts as done.
    await promote(s, 'one');
    expect(await unitData(s.units.one)).toContain('replicas: 2');

    await openSource(page, s);
    await expect(page.getByTestId('change-order-invocation-clearance')).toHaveText('None');
    const withheld = page.getByTestId('change-order-invocation-withheld');
    await expect(withheld).toContainText('Scale=RegionSpecific', { timeout: 30000 });
    await withheld.getByRole('button', { name: 'Clear the Invocation for it', exact: true }).click();

    const form = page.getByRole('form', { name: 'Invocation clearance and guards' });
    await expect(form.getByTestId('invocation-clearance-key-0')).toHaveValue('Scale');
    await expect(form.getByTestId('invocation-clearance-values-0')).toHaveValue('RegionSpecific');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).toBeHidden();
    await expect(page.getByTestId('change-order-invocation-clearance')).toHaveText('Scale=RegionSpecific');
    await expect(withheld).toBeHidden();
    expect((await invocation(s)).Clearance).toEqual([{ Key: 'Scale', Operator: 'In', Values: ['RegionSpecific'] }]);

    // The promotion into stage two reads the Invocation as it is now, and lands the change.
    await promote(s, 'two');
    expect(await unitData(s.units.two)).toContain('replicas: 5');
    expect(await unitData(s.units.one)).toContain('replicas: 2');
  });

  test('the Full diff plans again once the Invocation is cleared', async ({ page }) => {
    if (s === undefined) throw new Error('no seed');
    await openSource(page, s);
    // Nothing promoted yet: the source's diff names the guard that would keep the field.
    const guardKeeps = page.getByText(/Guard Scale=RegionSpecific in .*keeps spec\.replicas/);
    await expect(guardKeeps.first()).toBeVisible({ timeout: 30000 });

    await page
      .getByTestId('change-order-invocation-withheld')
      .getByRole('button', { name: 'Clear the Invocation for it', exact: true })
      .click();
    const form = page.getByRole('form', { name: 'Invocation clearance and guards' });
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).toBeHidden();
    // Without a reload, the diff no longer says the guard keeps the field.
    await expect(guardKeeps).toHaveCount(0, { timeout: 30000 });
  });

  test('a guard the Invocation records asks for the clearance covering it', async ({ page }) => {
    if (s === undefined) throw new Error('no seed');
    await openSource(page, s);
    await page.getByRole('button', { name: 'Edit clearance and guards', exact: true }).click();
    const form = page.getByRole('form', { name: 'Invocation clearance and guards' });
    await form.getByTestId('invocation-guards-add').click();
    await form.getByTestId('invocation-guards-key-0').fill('Owner');
    await form.getByTestId('invocation-guards-value-0').fill('Platform');
    const notCleared = form.getByTestId('invocation-guards-not-cleared');
    await expect(notCleared).toContainText('Owner=Platform');
    await notCleared.getByRole('button', { name: 'Clear the Invocation for its guards', exact: true }).click();
    await expect(notCleared).toBeHidden();
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).toBeHidden();
    await expect(page.getByTestId('change-order-invocation-guards')).toHaveText('Owner=Platform');
    const stored = await invocation(s);
    expect(stored.Guards).toEqual({ Owner: 'Platform' });
    expect(stored.Clearance).toEqual([{ Key: 'Owner', Operator: 'In', Values: ['Platform'] }]);
  });

  test('once every Space in scope has run it, the Invocation is not offered for editing', async ({ page }) => {
    if (s === undefined) throw new Error('no seed');
    await promote(s, 'one');
    await promote(s, 'two');
    await openSource(page, s);
    await expect(page.getByTestId('change-order-invocation-clearance')).toHaveText('None');
    await expect(page.getByRole('button', { name: 'Edit clearance and guards', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('change-order-invocation-withheld')).toHaveCount(0);
  });
});
