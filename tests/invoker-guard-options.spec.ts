// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';
import { UnitDetailPage } from './fixtures/unit-details-page';

/**
 * The function invoker's Options: a guarded write inside an initiative's
 * ChangeSet asks first as one outside does, and a function call saved as an Invocation keeps the
 * clearance and guard stated for it.
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

test.describe('the invoker states a clearance and guards', () => {
  let spaceId = '';
  let unitId = '';

  const unitData = async () => {
    const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/data`);
    if (!response.ok()) throw new Error(`unit data: ${response.status()}`);
    return response.text();
  };

  test.beforeEach(async () => {
    const slug = `invoker-guards-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, { data: deployment(2) }),
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
  });

  test.afterEach(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('inside a ChangeSet, a guarded run asks first, and cancelling leaves none open', async ({
    page,
  }) => {
    // An initiative is a View labelled as one, over a Filter of the Units in scope.
    const name = `Guarded ${Date.now()}`;
    const filterId = (
      await body<{ FilterID: string }>(
        await hubApi.post(`/api/space/${spaceId}/filter`, {
          data: { From: 'Unit', Slug: 'guarded', Where: `SpaceID = '${spaceId}'` },
        }),
        'filter',
      )
    ).FilterID;
    const viewId = (
      await body<{ ViewID: string }>(
        await hubApi.post(`/api/space/${spaceId}/view`, {
          data: {
            FilterID: filterId,
            Slug: 'guarded',
            DisplayName: name,
            Labels: { initiative: 'true', 'initiative-status': 'in_progress' },
          },
        }),
        'view',
      )
    ).ViewID;
    const changeSets = async () =>
      (
        await body<unknown[]>(
          await hubApi.get(`/api/space/${spaceId}/change_set`),
          'change sets',
        )
      ).length;
    const unitChangeSet = async () =>
      (
        await body<{ Unit: { ChangeSetID?: string | null } }>(
          await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`),
          'unit',
        )
      ).Unit.ChangeSetID ?? '';

    await page.goto(`/x/initiatives/${viewId}`);
    const row = page.getByRole('row').filter({ hasText: 'web' });
    await expect(row).toHaveCount(1, { timeout: 20000 });
    await row.getByRole('checkbox').check();

    const invoker = new UnitDetailPage(page);
    await invoker.selectFunctionByName('set-replicas');
    await invoker.fillNumberInputByName('Replicas', '5');

    // A dry run asked for is the preview: it says what the guard would withhold, without asking
    // and without a ChangeSet.
    const dryRun = page.getByRole('checkbox', { name: 'Dry Run', exact: true });
    await dryRun.check();
    await invoker.clickInvokeButton();
    await expect(page.getByTestId('withheld-by-guards')).toContainText(
      'Guards would withhold 1 change: spec.replicas.',
    );
    expect(await changeSets()).toBe(0);
    await dryRun.uncheck();

    await invoker.clickInvokeButton();
    const dialog = page.getByRole('dialog', { name: 'Guards withhold some of these changes' });
    await expect(dialog.getByTestId('guarded-changes')).toContainText('spec.replicas: 2 → 5');

    // Asking wrote nothing and opened no ChangeSet, and cancelling leaves it so.
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await changeSets()).toBe(0);
    expect(await unitChangeSet()).toBe('');
    expect(await unitData()).toContain('replicas: 2');

    // Cleared, it lands, in a ChangeSet that is closed again.
    await invoker.clickInvokeButton();
    await dialog.getByRole('checkbox', { name: 'Scale=RegionSpecific', exact: true }).check();
    await dialog.getByRole('button', { name: 'Run with clearance' }).click();
    await expect.poll(unitData).toContain('replicas: 5');
    await expect(page.getByTestId('withheld-by-guards')).toHaveCount(0);
    expect(await changeSets()).toBe(1);
    await expect.poll(unitChangeSet).toBe('');
  });

  test('saving an Invocation or a Trigger stores its clearance and guard; loading it restores them', async ({
    page,
  }) => {
    const invocationName = `guarded-call-${Date.now()}`;
    const invoker = new UnitDetailPage(page);
    await page.goto(`/units/${spaceId}/${unitId}`);
    await invoker.selectFunctionByName('set-replicas');
    await invoker.fillNumberInputByName('Replicas', '3');
    await page.getByTestId('invoker-write-options-toggle').click();
    await page.getByTestId('invoker-clearance-add').click();
    await page.getByTestId('invoker-clearance-key-0').fill('Scale');
    await page.getByTestId('invoker-clearance-operator-0').click();
    await page.getByRole('option', { name: 'In', exact: true }).click();
    await page.getByTestId('invoker-clearance-values-0').fill('RegionSpecific');
    const guardSection = page.getByTestId('guard-values-written');
    await guardSection.getByRole('checkbox', { name: 'Guard the values written' }).check();
    await guardSection.getByRole('textbox', { name: 'Guard key' }).fill('Release');
    await guardSection.getByRole('textbox', { name: 'Guard value' }).fill('Pinned');
    const inherited = guardSection.getByRole('checkbox', {
      name: 'Inherited by clones and downstream Units',
    });
    await inherited.check();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(invocationName);
    // An Invocation records no inherited guard, so it is not saved with one.
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(page.getByTestId('invoker-save-blocked')).toContainText('inherited guard');
    await expect(save).toBeDisabled();
    await inherited.uncheck();
    await save.click();

    type Stored = {
      Invocation: { Clearance?: unknown[]; Guards?: Record<string, string> };
    }[];
    const stored = async () =>
      (
        await body<Stored>(
          await hubApi.get(`/api/space/${spaceId}/invocation`, {
            params: { where: `Slug = '${invocationName}'` },
          }),
          'invocations',
        )
      )[0]?.Invocation;
    await expect.poll(async () => (await stored())?.Guards).toEqual({ Release: 'Pinned' });
    expect((await stored())?.Clearance).toEqual([
      { Key: 'Scale', Operator: 'In', Values: ['RegionSpecific'] },
      { Key: 'Release', Operator: 'In', Values: ['Pinned'] },
    ]);

    // Loaded back, the invoker states them again.
    await page.goto(`/units/${spaceId}/${unitId}`);
    await invoker.selectFunctionByName(invocationName);
    await page.getByTestId('invoker-write-options-toggle').click();
    await expect(page.getByTestId('invoker-clearance-key-0')).toHaveValue('Scale');
    await expect(page.getByTestId('invoker-clearance-values-0')).toHaveValue('RegionSpecific');
    await expect(page.getByTestId('invoker-clearance-key-1')).toHaveValue('Release');
    await expect(
      guardSection.getByRole('checkbox', { name: 'Guard the values written' }),
    ).toBeChecked();
    await expect(guardSection.getByRole('textbox', { name: 'Guard key' })).toHaveValue(
      'Release',
    );
    await expect(guardSection.getByRole('textbox', { name: 'Guard value' })).toHaveValue(
      'Pinned',
    );

    // Saved as a Trigger, the same clearance and guard are stored on it, the clearance once.
    const triggerName = `guarded-trigger-${Date.now()}`;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('tab', { name: 'Trigger', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(triggerName);
    await page.getByRole('checkbox', { name: 'Disabled', exact: true }).check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    type Triggers = {
      Trigger: { Clearance?: unknown[]; Guards?: Record<string, string> };
    }[];
    const trigger = async () =>
      (
        await body<Triggers>(
          await hubApi.get(`/api/space/${spaceId}/trigger`, {
            params: { where: `Slug = '${triggerName}'` },
          }),
          'triggers',
        )
      )[0]?.Trigger;
    await expect.poll(async () => (await trigger())?.Guards).toEqual({ Release: 'Pinned' });
    expect((await trigger())?.Clearance).toEqual([
      { Key: 'Scale', Operator: 'In', Values: ['RegionSpecific'] },
      { Key: 'Release', Operator: 'In', Values: ['Pinned'] },
    ]);
  });
});
