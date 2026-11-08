// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';
import { UnitDetailPage } from './fixtures/unit-details-page';

/**
 * The function invoker's Options: why the change is made, which becomes the description of the
 * Revision it makes, and the open ChangeSet to make it in, which the Units join for the write.
 */

const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 2
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

test.describe('the invoker’s Options', () => {
  let spaceId = '';
  let spaceSlug = '';
  let unitId = '';
  let changeSetId = '';

  const unit = async () =>
    (
      await body<{ Unit: { ChangeSetID?: string; HeadRevisionID: string } }>(
        await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`),
        'unit',
      )
    ).Unit;
  const headRevision = async () =>
    (
      await body<{ Revision: { Description?: string; ChangeSetID?: string } }>(
        await hubApi.get(
          `/api/space/${spaceId}/unit/${unitId}/revision/${(await unit()).HeadRevisionID}`,
        ),
        'revision',
      )
    ).Revision;

  test.beforeEach(async () => {
    spaceSlug = `invoker-options-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    spaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: { Slug: spaceSlug, Labels: { Owner: 'E2E' } },
        }),
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
      await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, { data: deployment }),
      'unit data',
    );
    changeSetId = (
      await body<{ ChangeSetID: string }>(
        await hubApi.post(`/api/space/${spaceId}/change_set`, { data: { Slug: 'rollout' } }),
        'change set',
      )
    ).ChangeSetID;
  });

  test.afterEach(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('a run records its change description and is made in the ChangeSet chosen', async ({
    page,
  }) => {
    await page.goto(`/units/${spaceId}/${unitId}`);
    const unitPage = new UnitDetailPage(page);
    await unitPage.selectFunctionByName('set-replicas');
    await unitPage.fillNumberInputByName('Replicas', '4');

    await page.getByTestId('invoker-write-options-toggle').click();
    await page.getByTestId('invoker-change-description').fill('Scale for the holiday peak');
    await page.getByTestId('invoker-change-set').getByRole('combobox').click();
    await page.getByRole('option', { name: `${spaceSlug}/rollout`, exact: true }).click();
    // Collapsed, the Options still say what the run carries.
    await page.getByTestId('invoker-write-options-toggle').click();
    await expect(page.getByTestId('invoker-options-summary')).toHaveText(
      `Description · ChangeSet ${spaceSlug}/rollout`,
    );

    // A dry run writes nothing, so the Unit does not join the ChangeSet for it.
    const dryRun = page.getByRole('checkbox', { name: 'Dry Run', exact: true });
    await dryRun.check();
    await page.getByTestId('invoker-invoke-button').click();
    await expect(
      page.getByText('All invocations succeeded', { exact: true }).first(),
    ).toBeVisible();
    expect((await unit()).ChangeSetID ?? '').toBe('');

    await dryRun.uncheck();
    await page.getByTestId('invoker-invoke-button').click();
    await expect.poll(async () => (await unit()).ChangeSetID).toBe(changeSetId);
    // The Unit joins the ChangeSet just before the run, which is a Revision of its own, so the
    // run's Revision is waited for. The server adds the functions that made the change after it.
    await expect
      .poll(async () => (await headRevision()).Description)
      .toMatch(/^Scale for the holiday peak/);
    expect((await headRevision()).ChangeSetID).toBe(changeSetId);
  });
});
