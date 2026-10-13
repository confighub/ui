// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Space settings sheet E2E: a label deleted in the sheet is really deleted on
// the server. That the sheet leaves a staged treeview edit alone is covered in
// component-staging-narrow.spec.ts, which already has a stageable fixture.
// ============================================================================

const APP_LABEL = `e2e-spacesettings-${RandomSlugGenerator.randomSlugName()}`;

async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
}

test.describe('space settings sheet', () => {
  test.use({ storageState: 'authentication.json' });

  const spaceSlug = `e2e-space-settings-${RandomSlugGenerator.randomSlugName()}`;
  const targetSlug = `${spaceSlug}-tgt`;

  let spaceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());

    const api = new ApiHelper(page);

    const space = await api.createSpace({
      space: { Slug: spaceSlug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Variant: spaceSlug } },
    });
    spaceId = (space as { SpaceID: string }).SpaceID;

    const targetResp = await hubApi.post(`/api/space/${spaceId}/target`, {
      params: { allow_exists: 'true' },
      data: { Slug: targetSlug },
    });
    if (!targetResp.ok()) throw new Error(`Failed to create target: ${targetResp.status()} ${await targetResp.text()}`);
    const targetId = ((await targetResp.json()) as { TargetID: string }).TargetID;

    const unitResp = await hubApi.post(`/api/space/${spaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'unit-1', ToolchainType: 'Kubernetes/YAML', TargetID: targetId },
    });
    if (!unitResp.ok()) throw new Error(`Failed to create unit: ${unitResp.status()} ${await unitResp.text()}`);

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    try {
      await api.deleteSpace(spaceId, true);
    } catch {
      /* ignore */
    }
    await context.close();
  });

  // Regression guard: `patchSpace` sends `application/merge-patch+json`
  // (RFC 7396). A deleted map key must be re-sent with an explicit JSON
  // `null` for the backend to actually drop it — a key simply absent from
  // the patch body means "leave it alone," not "delete it." The fixture
  // Space above carries `Owner: 'E2E'`, a plain user-authored label (not
  // `Variant`, which the rename row above owns and `RESERVED_LABEL_KEYS`
  // filters out of this row), so it renders as a deletable chip in
  // `LabelsRow`. `Stage`/`PreviousStage` no longer have a dedicated row
  // either — the ChangeWorkflow entity owns rollout staging now — so they are
  // ordinary chips here, exactly like `Owner`.
  test('deleting a Label persists after Save, confirmed via a fresh server fetch', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const node = page.locator('.react-flow__node').filter({ hasText: targetSlug });
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();

    const cog = page.getByTestId('component-space-settings-cog');
    await expect(cog).toBeVisible();
    await cog.click();
    const sheet = page.getByTestId('space-settings-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Owner', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Remove label Owner=E2E' }).click();
    await expect(sheet.getByText('Owner', { exact: true })).not.toBeVisible();

    const saveButton = page.getByTestId('space-settings-save');
    await expect(saveButton).toBeEnabled();
    const patchResponse = page.waitForResponse(
      (r) => r.url().includes(`/api/space/${spaceId}`) && r.request().method() === 'PATCH',
    );
    await saveButton.click();
    await patchResponse;

    // Fresh fetch straight from the server (not the browser's RTK Query
    // cache) is the only proof that the deletion actually persisted, rather
    // than merely having been dropped from local/optimistic state.
    const api = new ApiHelper(page);
    const freshSpace = await api.getSpaceById(spaceId);
    expect(freshSpace.Labels?.Owner).toBeUndefined();
  });
});
