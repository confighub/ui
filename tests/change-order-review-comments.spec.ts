// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * Review comments on a ChangeOrder's diffs, driven the way a person drives them, against a live
 * server, over data this file seeds for itself:
 *
 *     base ──▶ dev (Stage=dev)        one workflow stage, dev
 *
 * The base has one change waiting (replicas 2 → 4), and the ChangeOrder carries it. A comment on
 * "At the source" is anchored to the base's Revision at the end of the change; one on what the
 * dev stage writes, to the dev Unit's head, which the dry run runs on. Every comment names the
 * ChangeOrder, and the page reads them by it alone.
 */
import { type Page } from '@playwright/test';

import { reviewCommentCopy as copy } from '../src/pages/change-orders/review-comments/reviewCommentCopy';
import { ApiHelper } from './fixtures/api-helper';
import { createChangeWorkflow } from './fixtures/change-order-fixture';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

const deployment = (replicas: number, owner = 'payments') => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    owner: ${owner}
spec:
  replicas: ${replicas}
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
          image: ghcr.io/acme/review-api:1.0.0
`;

interface ReviewSeed {
  label: string;
  componentId: string;
  baseSlug: string;
  baseSpaceId: string;
  baseApiId: string;
  devSpaceId: string;
  devApiId: string;
  changeOrderSlug: string;
  changeOrderId: string;
  spaceIds: string[];
}

const idOf = (created: unknown, field: string) => (created as Record<string, string>)[field];

async function seedReview(page: Page): Promise<ReviewSeed> {
  const api = new ApiHelper(page);
  const label = `e2e-review-${RandomSlugGenerator.randomSlugName()}`;
  const spaceIds: string[] = [];
  const component = await api.createComponent(label);
  const seed: Partial<ReviewSeed> = { label, componentId: component.ComponentID as string, spaceIds };
  try {
    const platformId = idOf(await api.createSpace({ space: { Slug: `${label}-platform`, Labels: { Owner: 'E2E' } } as never }), 'SpaceID');
    spaceIds.push(platformId);
    const workflowId = await createChangeWorkflow(page, platformId, { Slug: `${label}-line`, Stages: [{ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" }] });

    const baseSlug = `${label}-base`;
    const baseSpaceId = idOf(await api.createSpace({ space: { Slug: baseSlug, ComponentID: seed.componentId, Labels: { Owner: 'E2E' } } as never }), 'SpaceID');
    spaceIds.push(baseSpaceId);
    const baseApiId = idOf(await api.createUnit({ spaceId: baseSpaceId, unit: { Slug: 'api', ToolchainType: 'Kubernetes/YAML' } as never }), 'UnitID');
    await api.uploadUnitData({ spaceId: baseSpaceId, unitId: baseApiId, body: deployment(2) });

    const devSpaceId = idOf(
      await api.createSpace({
        space: {
          Slug: `${label}-dev`,
          DisplayName: 'dev',
          ComponentID: seed.componentId,
          Labels: { Owner: 'E2E', Stage: 'dev' },
          // What makes it a variant a promotion can reach.
          Annotations: { UpstreamSpaceID: baseSpaceId },
        } as never,
      }),
      'SpaceID',
    );
    spaceIds.push(devSpaceId);
    const clone = await hubApi.post('/api/unit', { params: { where: `SpaceID = '${baseSpaceId}'`, where_space: `SpaceID = '${devSpaceId}'` }, headers: MERGE_PATCH, data: {} });
    if (!clone.ok()) throw new Error(`clone: ${clone.status()} ${await clone.text()}`);
    const [devApi] = await api.listUnits({ where: `SpaceID = '${devSpaceId}' AND Slug = 'api'`, select: 'UnitID,Slug' });
    const devApiId = devApi?.Unit?.UnitID ?? '';

    await api.uploadUnitData({ spaceId: baseSpaceId, unitId: baseApiId, body: deployment(4) });
    const changeOrderSlug = `${label}-co`;
    const created = await api.createChangeOrder({
      spaceId: baseSpaceId,
      changeOrder: { Slug: changeOrderSlug, Description: 'replicas 4', ChangeWorkflowID: workflowId, InScopeSpaceIDs: [devSpaceId] } as never,
    });
    return {
      label,
      componentId: seed.componentId as string,
      baseSlug,
      baseSpaceId,
      baseApiId,
      devSpaceId,
      devApiId,
      changeOrderSlug,
      changeOrderId: idOf(created, 'ChangeOrderID'),
      spaceIds,
    };
  } catch (error) {
    await teardownReview(seed);
    throw error;
  }
}

/** Never throws: it runs after a failure, and must not replace it. It says what it left behind. */
async function teardownReview(seed: Partial<ReviewSeed> | undefined): Promise<void> {
  if (seed === undefined) return;
  const failures: string[] = [];
  for (const spaceId of [...(seed.spaceIds ?? [])].reverse()) {
    const response = await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true', detach: 'true' } }).catch(() => undefined);
    if (!response?.ok()) failures.push(`Space ${spaceId}: ${response?.status() ?? 'no response'}`);
  }
  if (seed.componentId !== undefined) {
    const response = await hubApi.delete(`/api/component/${seed.componentId}`).catch(() => undefined);
    if (!response?.ok()) failures.push(`Component ${seed.componentId}: ${response?.status() ?? 'no response'}`);
  }
  if (failures.length > 0) console.warn(`[change-order-review-comments] teardown left behind:\n  ${failures.join('\n  ')}`);
}

interface StoredComment {
  ReviewCommentID: string;
  UnitID: string;
  RevisionNum: number;
  Path?: string;
  Text: string;
  ReplyToID?: string;
  ChangeOrderID?: string;
}

async function commentsOf(changeOrderId: string): Promise<StoredComment[]> {
  const response = await hubApi.get('/api/review_comment', { params: { where: `ChangeOrderID = '${changeOrderId}'` } });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { ReviewComment: StoredComment }[]).map((row) => row.ReviewComment);
}

async function headOf(spaceId: string, unitId: string): Promise<number> {
  const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
  return ((await response.json()) as { Unit: { HeadRevisionNum: number } }).Unit.HeadRevisionNum;
}

/** The row of a path in the diff it is drawn in: `source` is "At the source", `stage` the dev stage's card. */
const row = (page: Page, path: string, where: 'source' | 'stage') => page.locator(`[data-comment-path="${path}"]`).nth(where === 'source' ? 0 : 1);

async function startThread(page: Page, path: string, where: 'source' | 'stage', text: string) {
  await row(page, path, where).hover();
  await row(page, path, where).getByTestId('review-add-line').click();
  const composer = page.getByTestId('review-new-thread-composer');
  await composer.getByRole('textbox').fill(text);
  await composer.getByRole('button', { name: copy.comment, exact: true }).click();
  await expect(composer).toHaveCount(0);
}

test.describe('ChangeOrder review comments', () => {
  test.use({ viewport: { width: 1360, height: 900 } });

  let fx: ReviewSeed;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    fixturePage = await (await newAuthorizedContext(browser)).newPage();
    fx = await seedReview(fixturePage);
  });

  test.afterAll(async () => {
    await teardownReview(fx);
    await fixturePage?.context().close();
  });

  async function openChangeOrder(page: Page, stage = 'dev') {
    await page.goto(`/change-orders/${fx.baseSlug}/${fx.changeOrderSlug}/${stage}`);
    await expect(row(page, 'spec.replicas', 'source')).toBeVisible({ timeout: 30_000 });
  }

  test('a comment on "At the source" is anchored to the end of the change; a reply, an edit and a delete follow it', async ({ page }) => {
    await openChangeOrder(page);
    await startThread(page, 'spec.replicas', 'source', 'Why **4**?');

    const thread = page.getByTestId('review-thread').first();
    await expect(thread.getByTestId('review-comment')).toHaveCount(1);
    await expect(thread.locator('strong')).toHaveText('4');
    const [first] = await commentsOf(fx.changeOrderId);
    expect(first).toMatchObject({ UnitID: fx.baseApiId, Path: 'spec.replicas', ChangeOrderID: fx.changeOrderId });
    expect(first.RevisionNum).toBe(await headOf(fx.baseSpaceId, fx.baseApiId));

    // Reply, sent with Ctrl+Enter.
    await thread.getByTestId('review-reply-open').click();
    await page.getByTestId('review-reply-composer').getByRole('textbox').fill('Load test says 4.');
    await page.keyboard.press('Control+Enter');
    await expect(thread.getByTestId('review-comment')).toHaveCount(2);
    const reply = (await commentsOf(fx.changeOrderId)).find((c) => c.ReplyToID === first.ReviewCommentID);
    expect(reply?.ChangeOrderID).toBe(fx.changeOrderId);

    // Edit the reply.
    const second = thread.getByTestId('review-comment').nth(1);
    await second.getByRole('button', { name: copy.more }).click();
    await page.getByRole('menuitem', { name: copy.edit }).click();
    await second.getByRole('textbox').fill('Load test says 4, at p99 < 200ms.');
    await second.getByRole('button', { name: copy.update }).click();
    await expect(second).toContainText('p99 < 200ms');

    // Delete it.
    await second.getByRole('button', { name: copy.more }).click();
    await page.getByRole('menuitem', { name: copy.delete }).click();
    await page.getByRole('dialog').getByRole('button', { name: copy.delete }).click();
    await expect(thread.getByTestId('review-comment')).toHaveCount(1);
  });

  test('a comment on what the dev stage writes is anchored to the dev head, and is Outdated once dev moves on', async ({ page }) => {
    await openChangeOrder(page);
    await page.getByRole('button', { name: 'Open' }).click();
    await startThread(page, 'spec.replicas', 'stage', 'Is 4 right for dev?');
    const stored = (await commentsOf(fx.changeOrderId)).find((c) => c.UnitID === fx.devApiId);
    expect(stored?.RevisionNum).toBe(await headOf(fx.devSpaceId, fx.devApiId));
    await expect(page.getByTestId('review-thread-outdated')).toHaveCount(0);

    // dev changes on its own: the thread was made at a Revision the dry run no longer runs on.
    await new ApiHelper(page).uploadUnitData({ spaceId: fx.devSpaceId, unitId: fx.devApiId, body: deployment(2, 'dev-team') });
    await openChangeOrder(page);
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByTestId('review-thread').filter({ hasText: 'Is 4 right for dev?' }).getByTestId('review-thread-outdated')).toBeVisible();
  });

  test('every conversation is listed below; one folds to a line and opens again', async ({ page }) => {
    await openChangeOrder(page);
    await startThread(page, 'spec.replicas', 'source', 'Listed below too.');
    const conversation = page.getByTestId('review-conversation');
    await expect(conversation.getByTestId('review-conversation-thread').first()).toBeVisible({ timeout: 30_000 });
    await expect(conversation).toContainText('spec.replicas');

    // Folded, the thread no longer shows its text: it is found by its id.
    const threadId = await page.getByTestId('review-thread').filter({ hasText: 'Listed below too.' }).getAttribute('id');
    const thread = page.locator(`#${threadId}`);
    await thread.getByRole('button', { name: copy.hide }).click();
    await expect(thread.getByTestId('review-comment')).toHaveCount(0);
    await expect(thread).toContainText('by');
    await thread.getByRole('button', { name: copy.show }).click();
    await expect(thread.getByTestId('review-comment').first()).toBeVisible();
  });

  test('Preview shows the Markdown as it will read, and Cancel discards the comment', async ({ page }) => {
    await openChangeOrder(page);
    await row(page, 'spec.replicas', 'source').hover();
    await row(page, 'spec.replicas', 'source').getByTestId('review-add-line').click();
    const composer = page.getByTestId('review-new-thread-composer');
    await composer.getByRole('textbox').fill('Use `kubectl rollout status`, _then_ check max_conn_pool');
    await composer.getByRole('tab', { name: copy.preview }).click();
    await expect(composer.locator('code')).toHaveText('kubectl rollout status');
    // `_` is italics only at a word's edges: a name with underscores stays as written.
    await expect(composer.locator('em')).toHaveText('then');
    await expect(composer).toContainText('max_conn_pool');
    await composer.getByRole('button', { name: copy.cancel }).click();
    await expect(composer).toHaveCount(0);
  });

  // Last: it moves the base on, which the tests above do not expect.
  test('a comment on "At the source" stays on the end of the change after the base moves past it', async ({ page }) => {
    const endOfChange = await headOf(fx.baseSpaceId, fx.baseApiId);
    await new ApiHelper(page).uploadUnitData({ spaceId: fx.baseSpaceId, unitId: fx.baseApiId, body: deployment(6) });
    expect(await headOf(fx.baseSpaceId, fx.baseApiId)).toBeGreaterThan(endOfChange);

    await openChangeOrder(page);
    await startThread(page, 'spec.replicas', 'source', 'Made after the base moved on.');
    const stored = (await commentsOf(fx.changeOrderId)).find((c) => c.Text === 'Made after the base moved on.');
    expect(stored).toMatchObject({ UnitID: fx.baseApiId, RevisionNum: endOfChange });
    await expect(page.getByTestId('review-thread').filter({ hasText: 'Made after the base moved on.' }).getByTestId('review-thread-outdated')).toHaveCount(0);
  });
});
