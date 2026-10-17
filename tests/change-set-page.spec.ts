// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The ChangeSet page: the list, one open ChangeSet's change, a review requested and given,
// the review going out of date when the change moves, and closing the ChangeSet.

import { type Page } from '@playwright/test';

import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';
import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

const deployment = (tag: string, replicas: number) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
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
          image: ghcr.io/acme/web:${tag}
`;

test.describe.configure({ mode: 'serial' });

test.describe('ChangeSet page', () => {
  test.use({ storageState: 'authentication.json' });

  let fixturePage: Page;
  let api: ApiHelper;
  let spaceId = '';
  let spaceSlug = '';
  let unitId = '';
  let changeSetId = '';
  let viewerId = '';
  const slug = 'review-me';

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    api = new ApiHelper(fixturePage);
    spaceSlug = `e2e-cs-${RandomSlugGenerator.randomSlugName()}`;
    const space = await api.createSpace({ space: { Slug: spaceSlug } as never });
    spaceId = (space as { SpaceID: string }).SpaceID;
    const unit = await api.createUnit({ spaceId, unit: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' } as never });
    unitId = unit.UnitID as string;
    await api.uploadUnitData({ spaceId, unitId, body: deployment('1.25.0', 2) });
    const changeSet = await api.createChangeSet({ spaceId, changeSet: { Slug: slug, Description: 'Roll web to 1.26' } as never });
    changeSetId = (changeSet as { ChangeSetID: string }).ChangeSetID;
    const attach = await hubApi.patch(`/api/space/${spaceId}/unit/${unitId}`, {
      params: { change_set_id: changeSetId },
      headers: MERGE_PATCH,
      data: { ChangeSetID: changeSetId },
    });
    expect(attach.ok(), await attach.text()).toBe(true);
    await api.uploadUnitData({ spaceId, unitId, body: deployment('1.26.0', 3), changeSetId });
    const revision = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}/revision`, { params: { where: 'RevisionNum = 1' } });
    viewerId = ((await revision.json()) as { Revision?: { UserID?: string } }[])[0]?.Revision?.UserID ?? '';
    expect(viewerId).not.toBe('');
  });

  test.afterAll(async () => {
    try {
      if (spaceId) await api.deleteSpace(spaceId, true);
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  test('the list shows the open ChangeSet and opens it', async ({ page }) => {
    await page.goto('/change-sets');
    await page.getByRole('searchbox', { name: 'Search ChangeSets' }).fill(spaceSlug);
    const row = page.getByTestId('change-sets-row');
    await expect(row).toHaveCount(1, { timeout: 30000 });
    await expect(row).toHaveAttribute('data-state', 'Open');
    await expect(row).toContainText('Roll web to 1.26');
    // The creator, the image the ChangeSet moves, and nothing reviewed yet.
    await expect(row.getByTestId('change-sets-row-creator')).not.toHaveText('—');
    await expect(row.getByTestId('change-set-row-image-change')).toHaveAttribute('data-status', 'some', { timeout: 30000 });
    await expect(row.getByTestId('change-sets-row-reviews')).toHaveText('No reviews yet');
    await expect(row.getByTestId('change-sets-row-reviewers')).toHaveCount(0);
    await expect(row.getByTestId('change-sets-row-action')).toHaveText('Open');
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/change-sets/${spaceSlug}/${slug}$`));
    await expect(page.getByRole('heading', { level: 1, name: slug, exact: true })).toBeVisible({ timeout: 30000 });
  });

  test('the page shows what the ChangeSet changed', async ({ page }) => {
    await page.goto(`/change-sets/${spaceSlug}/${slug}`);
    const summary = page.getByRole('region', { name: 'ChangeSet summary' });
    await expect(summary.getByTestId('change-set-description')).toHaveText('Roll web to 1.26', { timeout: 30000 });
    await expect(summary).toContainText('Open');
    await expect(summary.getByTestId('change-set-unit-count')).toHaveText('1 changed, open on 1');
    await expect(summary.getByTestId('change-set-creator')).not.toHaveText('—');
    const hero = summary.getByTestId('change-set-image-hero-row');
    await expect(hero).toHaveCount(1, { timeout: 30000 });
    await expect(hero).toContainText('web');
    await expect(hero).toContainText('In 1 Unit');
    await expect(hero).not.toContainText('at the source');
    const fullDiff = summary.getByTestId('change-set-full-diff');
    await expect(fullDiff).toContainText('Full diff');
    await expect(fullDiff).toHaveAttribute('data-expanded', 'true');
    await expect(fullDiff).toContainText('replicas');
  });

  test('a requested review is answered by an approval', async ({ page }) => {
    // A request of the viewer, which the page offers no control to make: nobody asks themselves.
    const read = await hubApi.get(`/api/space/${spaceId}/change_set/${changeSetId}`);
    const version = ((await read.json()) as { ChangeSet?: { Version?: number } }).ChangeSet?.Version;
    const patch = await hubApi.patch(`/api/space/${spaceId}/change_set/${changeSetId}`, {
      headers: MERGE_PATCH,
      data: { ReviewRequests: [{ UserID: viewerId }], Version: version },
    });
    expect(patch.ok(), await patch.text()).toBe(true);

    // Asked of the viewer and not yet given: the list offers Review.
    await page.goto('/change-sets');
    await page.getByRole('searchbox', { name: 'Search ChangeSets' }).fill(spaceSlug);
    const listed = page.getByTestId('change-sets-row');
    await expect(listed.getByTestId('change-sets-row-action')).toHaveText('Review', { timeout: 30000 });
    await expect(page.getByTestId('change-sets-card-requested')).toBeEnabled();

    await page.goto(`/change-sets/${spaceSlug}/${slug}`);
    const reviews = page.getByTestId('change-set-reviews');
    const request = reviews.getByTestId('review-request');
    await expect(request).toHaveCount(1, { timeout: 30000 });
    await expect(request).toHaveAttribute('data-reviewed', 'false');
    await expect(reviews.getByTestId('change-set-review-status')).toHaveText('No reviews yet');
    // The viewer wrote the change, and is told so.
    await expect(reviews.getByTestId('change-set-self-review')).toBeVisible();

    const form = reviews.getByTestId('review-form');
    await form.locator('[data-choice="Pass"]').click();
    await form.getByRole('textbox').fill('Checked the image and the replica count.');
    await form.getByTestId('review-submit').click();
    const confirm = page.getByTestId('change-set-decision-confirm');
    await expect(confirm).toContainText('1 Unit');
    await confirm.getByTestId('change-set-decision-confirm-button').click();
    await expect(confirm).toHaveCount(0);

    const decision = reviews.getByTestId('change-set-decision');
    await expect(decision).toHaveCount(1, { timeout: 30000 });
    await expect(decision).toHaveAttribute('data-result', 'Pass');
    await expect(decision).toHaveAttribute('data-current', 'true');
    await expect(decision).toContainText('Checked the image and the replica count.');
    await expect(reviews.getByTestId('change-set-review-status')).toHaveText('1 approval');
    await expect(request).toHaveAttribute('data-reviewed', 'true');

    // The list says the same: the review asked of the viewer is given.
    await page.goto('/change-sets');
    await page.getByRole('searchbox', { name: 'Search ChangeSets' }).fill(spaceSlug);
    const row = page.getByTestId('change-sets-row');
    await expect(row.getByTestId('change-sets-row-reviews')).toHaveText('1 approval', { timeout: 30000 });
    await expect(row.getByTestId('change-sets-row-reviewers')).toContainText('(you)');
    await expect(row.getByTestId('change-sets-row-action')).toHaveText('Open');
  });

  test('a later change leaves the approval out of date', async ({ page }) => {
    await api.uploadUnitData({ spaceId, unitId, body: deployment('1.26.1', 3), changeSetId });
    await page.goto(`/change-sets/${spaceSlug}/${slug}`);
    const reviews = page.getByTestId('change-set-reviews');
    const decision = reviews.getByTestId('change-set-decision');
    await expect(decision).toHaveAttribute('data-current', 'false', { timeout: 30000 });
    await expect(decision.getByTestId('change-set-decision-standing')).toContainText('Out of date');
    await expect(reviews.getByTestId('change-set-review-status')).toHaveText('1 out of date');
    await expect(reviews.getByTestId('review-request')).toHaveAttribute('data-reviewed', 'false');
  });

  test('closing the ChangeSet', async ({ page }) => {
    await page.goto(`/change-sets/${spaceSlug}/${slug}`);
    const summary = page.getByRole('region', { name: 'ChangeSet summary' });
    await summary.getByTestId('change-set-close').click({ timeout: 30000 });
    const dialog = page.getByTestId('change-set-close-dialog');
    await expect(dialog).toContainText('open on 1 Unit');
    await expect(dialog).toContainText('Reviews: 1 out of date');
    await dialog.getByTestId('change-set-close-confirm').click();
    await expect(dialog).toHaveCount(0, { timeout: 30000 });
    await expect(summary.getByTestId('change-set-close')).toHaveCount(0, { timeout: 30000 });
    await expect(summary).toContainText('Closed');
    // Closed, the change is still the one it made.
    await expect(summary.getByTestId('change-set-unit-count')).toHaveText('1 changed');
    await expect(summary.getByTestId('change-set-image-hero-row')).toHaveCount(1);

    const unit = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
    expect(((await unit.json()) as { Unit?: { ChangeSetID?: string } }).Unit?.ChangeSetID ?? null).toBeNull();
  });
});
