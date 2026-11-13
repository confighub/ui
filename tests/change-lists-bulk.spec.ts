// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Page } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The ChangeSets list narrowed to the ChangeSets of one rollout by their annotation, as the
 * Validation page links to them, then reviewed and labeled in bulk: the No approvals card, the
 * row checkboxes, Request review and Update.
 */

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

const deployment = (tag: string) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      containers:
        - name: web
          image: nginx:${tag}
`;

interface ChangeSetFields {
  ChangeSetID: string;
  Slug: string;
  Labels?: Record<string, string>;
  ReviewRequests?: { UserID: string }[];
}

const readChangeSet = async (spaceId: string, changeSetId: string): Promise<ChangeSetFields> => {
  const response = await hubApi.get(`/api/space/${spaceId}/change_set/${changeSetId}`);
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { ChangeSet: ChangeSetFields }).ChangeSet;
};

const rowOf = (page: Page, slug: string) => page.locator('[data-testid="change-sets-row"]', { has: page.getByRole('link', { name: `Open ChangeSet ${slug}` }) });

test.describe('ChangeSets of one rollout', () => {
  test.use({ storageState: 'authentication.json' });

  const spaces: { spaceId: string; spaceSlug: string; changeSetId: string }[] = [];
  let trigger = '';
  const slug = `rollout-${RandomSlugGenerator.randomSlugName()}`;

  test.beforeEach(async ({ page }) => {
    const api = new ApiHelper(page);
    trigger = `e2e-system/${RandomSlugGenerator.randomSlugName()}`;
    spaces.length = 0;
    // The same rollout in two Spaces, each a ChangeSet that changed a Unit, annotated with the Trigger.
    for (const suffix of ['dev', 'prod']) {
      const spaceSlug = `e2e-rollout-${RandomSlugGenerator.randomSlugName()}-${suffix}`;
      const spaceId = (await api.createSpace({ space: { Slug: spaceSlug } as never })).SpaceID as string;
      const unitId = (await api.createUnit({ spaceId, unit: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' } as never })).UnitID as string;
      await api.uploadUnitData({ spaceId, unitId, body: deployment('1.25.0') });
      const changeSet = await api.createChangeSet({ spaceId, changeSet: { Slug: slug, Annotations: { Trigger: trigger } } as never });
      const changeSetId = (changeSet as { ChangeSetID: string }).ChangeSetID;
      const attach = await hubApi.patch(`/api/space/${spaceId}/unit/${unitId}`, {
        params: { change_set_id: changeSetId },
        headers: MERGE_PATCH,
        data: { ChangeSetID: changeSetId },
      });
      expect(attach.ok(), await attach.text()).toBe(true);
      await api.uploadUnitData({ spaceId, unitId, body: deployment('1.26.0'), changeSetId });
      spaces.push({ spaceId, spaceSlug, changeSetId });
    }
  });

  test.afterEach(async ({ page }) => {
    const api = new ApiHelper(page);
    for (const { spaceId } of spaces) await api.deleteSpace(spaceId, true);
  });

  test('the annotation narrows the list to the rollout, which is reviewed and labeled in bulk', async ({ page }) => {
    await page.goto(`/change-sets?${new URLSearchParams({ filterWhere: `Annotations.Trigger = '${trigger}'` }).toString()}`);
    await expect(page.locator('[data-testid="change-sets-row"]')).toHaveCount(2, { timeout: 20000 });
    for (const { spaceSlug } of spaces) await expect(rowOf(page, slug).filter({ hasText: spaceSlug })).toHaveCount(1);

    // Neither change has been approved, so both are still to be reviewed.
    const unapproved = page.getByTestId('change-sets-card-unapproved');
    await expect(unapproved).toContainText('2', { timeout: 20000 });
    await unapproved.click();
    await expect(page.locator('[data-testid="change-sets-row"]')).toHaveCount(2);

    // Check every row shown, and ask a reviewer for all of them.
    await page.getByRole('checkbox', { name: 'Select every ChangeSets row shown' }).check();
    await page.getByTestId('console-bulk-request-review').click();
    const dialog = page.getByTestId('bulk-request-review-dialog');
    const candidate = dialog.getByTestId('review-request-candidate').first();
    const reviewerId = (await candidate.getAttribute('data-user-id')) ?? '';
    expect(reviewerId).not.toBe('');
    await candidate.getByRole('checkbox').check();
    await dialog.getByTestId('review-request-send').click();
    await expect(dialog).toBeHidden();
    for (const { spaceId, changeSetId } of spaces) {
      await expect
        .poll(async () => (await readChangeSet(spaceId, changeSetId)).ReviewRequests?.map((r) => r.UserID))
        .toEqual([reviewerId]);
    }

    // And label them all.
    await page.getByTestId('console-bulk-update').click();
    await page.getByRole('button', { name: 'Add label' }).click();
    await page.getByLabel('Key', { exact: true }).last().fill('rollout');
    await page.getByLabel('Value', { exact: true }).last().fill('rorf');
    await page.getByRole('button', { name: 'Update ChangeSets', exact: true }).click();
    for (const { spaceId, changeSetId } of spaces) {
      await expect.poll(async () => (await readChangeSet(spaceId, changeSetId)).Labels?.rollout).toBe('rorf');
    }
  });
});

interface ChangeOrderFields {
  ChangeOrderID: string;
  Labels?: Record<string, string>;
  ReviewRequests?: { UserID: string; Stage?: string }[];
}

const readChangeOrder = async (spaceId: string, changeOrderId: string): Promise<ChangeOrderFields> => {
  const response = await hubApi.get(`/api/space/${spaceId}/change_order/${changeOrderId}`);
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { ChangeOrder: ChangeOrderFields }).ChangeOrder;
};

test.describe('ChangeOrders of one rollout', () => {
  test.use({ storageState: 'authentication.json' });

  const orders: { spaceId: string; changeOrderId: string; slug: string }[] = [];
  let trigger = '';

  test.beforeEach(async ({ page }) => {
    const api = new ApiHelper(page);
    trigger = `e2e-system/${RandomSlugGenerator.randomSlugName()}`;
    orders.length = 0;
    for (const suffix of ['dev', 'prod']) {
      const spaceSlug = `e2e-rollout-${RandomSlugGenerator.randomSlugName()}-${suffix}`;
      const spaceId = (await api.createSpace({ space: { Slug: spaceSlug } as never })).SpaceID as string;
      const slug = `rollout-${suffix}-${RandomSlugGenerator.randomSlugName()}`;
      const created = (await api.createChangeOrder({
        spaceId,
        changeOrder: { Slug: slug, InScopeSpaceIDs: [spaceId], Annotations: { Trigger: trigger } } as never,
      })) as { ChangeOrderID: string };
      orders.push({ spaceId, changeOrderId: created.ChangeOrderID, slug });
    }
  });

  test.afterEach(async ({ page }) => {
    const api = new ApiHelper(page);
    for (const { spaceId } of orders) await api.deleteSpace(spaceId, true);
  });

  test('the annotation narrows the list to the rollout, which is reviewed and labeled in bulk', async ({ page }) => {
    await page.goto(`/change-orders?${new URLSearchParams({ filterWhere: `Annotations.Trigger = '${trigger}'` }).toString()}`);
    const rows = page.locator('[data-change-order-slug]');
    await expect(rows).toHaveCount(2, { timeout: 20000 });

    // Nothing has approved either of them.
    await expect(page.getByTestId('change-order-exception-unapproved')).toContainText('2', { timeout: 20000 });

    await page.getByRole('checkbox', { name: 'Select every ChangeOrders row shown' }).check();
    await page.getByTestId('console-bulk-request-review').click();
    const dialog = page.getByTestId('bulk-request-review-dialog');
    const candidate = dialog.getByTestId('review-request-candidate').first();
    const reviewerId = (await candidate.getAttribute('data-user-id')) ?? '';
    await candidate.getByRole('checkbox').check();
    await dialog.getByTestId('review-request-send').click();
    await expect(dialog).toBeHidden();
    // Neither has reached a stage, so the review asked for is of its own Space.
    for (const { spaceId, changeOrderId } of orders) {
      await expect
        .poll(async () => (await readChangeOrder(spaceId, changeOrderId)).ReviewRequests?.map((r) => [r.UserID, r.Stage ?? '']))
        .toEqual([[reviewerId, '']]);
    }

    await page.getByTestId('console-bulk-update').click();
    await page.getByRole('button', { name: 'Add label' }).click();
    await page.getByLabel('Key', { exact: true }).last().fill('rollout');
    await page.getByLabel('Value', { exact: true }).last().fill('rorf');
    await page.getByRole('button', { name: 'Update ChangeOrders', exact: true }).click();
    for (const { spaceId, changeOrderId } of orders) {
      await expect.poll(async () => (await readChangeOrder(spaceId, changeOrderId)).Labels?.rollout).toBe('rorf');
    }
  });
});
