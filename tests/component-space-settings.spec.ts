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
  // The tree's own item: the page's trail can name the Component too.
  const item = page.getByTestId(`app-tree-item-${appLabel}`);
  await expect(item).toBeVisible({ timeout: 20000 });
  await item.click();
}

test.describe('space settings sheet', () => {
  test.use({ storageState: 'authentication.json' });
  // In order: the last test archives the fixture Space the first one edits.
  test.describe.configure({ mode: 'default' });

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
    // A Unit is released to its Space's release Target.
    await api.updateSpace({ spaceId, space: { ReleaseTargetID: targetId } });

    const unitResp = await hubApi.post(`/api/space/${spaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: { Slug: 'unit-1', ToolchainType: 'Kubernetes/YAML' },
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

    const settingsTab = page.getByTestId('component-pane-tab-settings');
    await expect(settingsTab).toBeVisible();
    await settingsTab.click();
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

  // Last, since it archives the fixture Space. Archive can be undone, so it needs no typed slug;
  // a permanent delete still does.
  test('the delete row archives the variant without typing its slug', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);
    const node = page.locator('.react-flow__node').filter({ hasText: targetSlug });
    await expect(node).toBeVisible({ timeout: 10000 });
    await node.click();
    await page.getByTestId('component-pane-tab-settings').click();
    await expect(page.getByTestId('space-settings-sheet')).toBeVisible();

    await page.getByTestId('space-settings-delete-open').click();
    const confirm = page.getByTestId('space-settings-delete-confirm');
    await expect(page.getByRole('radio', { name: /^Archive/ })).toBeChecked();
    await expect(confirm).toHaveText(`Archive ${spaceSlug}`);
    await page.getByRole('radio', { name: /^Delete permanently/ }).check();
    await expect(confirm).toBeDisabled();
    await page.getByRole('radio', { name: /^Archive/ }).check();
    await expect(confirm).toBeEnabled();

    const deleteResponse = page.waitForResponse(
      (r) => r.url().includes(`/api/space/${spaceId}`) && r.request().method() === 'DELETE',
    );
    await confirm.click();
    expect((await deleteResponse).ok()).toBeTruthy();
    const archived = await hubApi.get(`/api/space/${spaceId}`);
    expect(archived.ok(), await archived.text()).toBeTruthy();
    expect(((await archived.json()) as { Space: { HiddenReason?: string } }).Space.HiddenReason).toBe('Archived');
  });
});
