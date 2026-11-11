// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse } from '@playwright/test';

import { unitBlameHref } from '../src/pages/unit-detail/unitDetailHrefs';
import { expect, hubApi, test } from './fixtures/test';

/**
 * The Blame tab of a Unit a ChangeSet is open on. A ChangeSet locks the Units it is open on, so
 * every action of the tab, each of which creates a Revision, waits for the person to acknowledge
 * that the changes will be part of the ChangeSet, and then names it.
 */

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

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

type UnitResponse = {
  Unit: {
    UnitID: string;
    HeadRevisionID?: string;
    ValidationErrors?: Record<string, boolean>;
  };
};

test.describe('Blame tab: a Unit in a ChangeSet', () => {
  let spaceId = '';
  let spaceSlug = '';
  let unitId = '';
  let changeSetId = '';
  let changeSetSlug = '';

  const unit = async () =>
    body<UnitResponse>(await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`), 'unit');
  const settled = async () =>
    expect
      .poll(async () =>
        Object.keys((await unit()).Unit.ValidationErrors ?? {}).includes('awaiting/triggers'),
      )
      .toBe(false);
  const headRevision = async () => {
    const head = (await unit()).Unit.HeadRevisionID;
    return body<{ Revision: { ChangeSetID?: string } }>(
      await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/revision/${head}`),
      'revision',
    );
  };

  test.beforeAll(async () => {
    spaceSlug = `blame-cs-lock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    spaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: { Slug: spaceSlug, Labels: { Owner: 'E2E' } },
        }),
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
    changeSetSlug = 'hold';
    changeSetId = (
      await body<{ ChangeSetID: string }>(
        await hubApi.post(`/api/space/${spaceId}/change_set`, {
          data: { Slug: changeSetSlug, DisplayName: changeSetSlug },
        }),
        'change set',
      )
    ).ChangeSetID;
    await body(
      await hubApi.patch(`/api/space/${spaceId}/unit/${unitId}`, {
        params: { change_set_id: changeSetId },
        headers: MERGE_PATCH,
        data: { ChangeSetID: changeSetId },
      }),
      'open the change set',
    );
  });

  test.afterAll(async () => {
    if (spaceId) {
      await hubApi
        .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('the actions wait for the ChangeSet to be acknowledged, then name it', async ({
    page,
  }) => {
    await page.goto(unitBlameHref(spaceId, unitId, 'spec.replicas'));
    const blame = page.getByTestId('blame-tab');
    const row = blame.getByRole('row').filter({ hasText: 'spec.replicas' });
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await row.getByRole('checkbox').check();
    await page.keyboard.press('Escape');

    const acknowledgement = page.getByTestId('blame-change-set');
    await expect(acknowledgement).toContainText(
      'This Unit is in a ChangeSet, which locks it. Confirm the changes you make here will be part of it.',
    );
    const keep = blame.getByRole('button', { name: 'Keep on merge', exact: true });
    await expect(keep).toBeDisabled();
    await expect(blame.getByRole('button', { name: 'Set guard', exact: true })).toBeDisabled();

    await acknowledgement
      .getByRole('checkbox', { name: `${spaceSlug}/${changeSetSlug}` })
      .check();

    await expect(keep).toBeEnabled();
    await keep.click();
    await expect(
      page.getByText('The selected fields and resources are kept on merge', { exact: true }),
    ).toBeVisible();
    expect((await headRevision()).Revision.ChangeSetID).toBe(changeSetId);
  });
});
