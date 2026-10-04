// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Live Status Peek E2E Test
//
// Creates one release-enabled deployment Space, publishes a Release, and
// reports a live status on it the way argobot does — a merge-patch of the
// Release's `LiveStatus`. Asserts the hover peek on the node's live status
// chips names the Release the status is about, with its manifest digest
// abbreviated rather than cut down to its algorithm prefix.
//
// Regression guard for truncating the WHOLE digest to a short-hash width,
// which yields the algorithm prefix and none of the hash ("sha256:"). See
// `formatDigest` in liveStatus.ts.
// ============================================================================

const APP_LABEL = `e2e-livestatus-${RandomSlugGenerator.randomSlugName()}`;

/** What the peek must show: the Release's number, then its digest with the hash abbreviated. */
const EXPECTED_RELEASE_LINE = /release 1 · sha256:[0-9a-f]{12}(?![0-9a-f])/;

/**
 * Navigate to the component page filtered by app label, wait for loading to
 * finish, then click the app in the navigation tree so the flow graph renders.
 * (Mirrors component-release.spec.ts's navigateAndSelectApp.)
 */
async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
}

test.describe('component view live status peek', () => {
  test.use({ storageState: 'authentication.json' });

  const spaceSlug = `e2e-live-${RandomSlugGenerator.randomSlugName()}`;
  const targetSlug = `${spaceSlug}-tgt`;

  let spaceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();

    // Visit a page first to ensure user/org is provisioned.
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );

    const api = new ApiHelper(page);

    const space = await api.createSpace({
      space: {
        Slug: spaceSlug,
        ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Environment: 'staging' },
      },
    });
    spaceId = (space as { SpaceID: string }).SpaceID;

    // A live status belongs to a Release, so the Space publishes through a
    // release Target.
    const target = await api.createTarget({ spaceId, slug: targetSlug });
    const targetId = (target as { TargetID: string }).TargetID;
    await api.updateSpace({ spaceId, space: { ReleaseTargetID: targetId } });

    // A Release bundles the Units assigned to the release Target.
    const unitResp = await hubApi.post(`/api/space/${spaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: {
        Slug: 'test-config',
        ToolchainType: 'Kubernetes/YAML',
        TargetID: targetId,
      },
    });
    if (!unitResp.ok()) {
      throw new Error(`Failed to create unit: ${unitResp.status()} ${await unitResp.text()}`);
    }
    const unitId = ((await unitResp.json()) as { Unit: { UnitID: string } }).Unit.UnitID;
    await api.uploadUnitData({
      spaceId,
      unitId,
      body: ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: test-config'].join('\n'),
    });

    await api.publishRelease({ spaceId });
    const listed = await hubApi.get(`/api/space/${spaceId}/release`, {
      params: { where: 'Published = true' },
    });
    if (!listed.ok()) {
      throw new Error(`Failed to list releases: ${listed.status()} ${await listed.text()}`);
    }
    const releaseId = ((await listed.json()) as { Release?: { ReleaseID?: string } }[])[0]?.Release
      ?.ReleaseID;
    if (!releaseId) throw new Error('The published Release was not listed');

    // The status a reporter would have written back, by the same merge-patch
    // argobot makes.
    const reported = await hubApi.patch(`/api/space/${spaceId}/release/${releaseId}`, {
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: {
        LiveStatus: {
          Reporter: 'argobot',
          DataSource: spaceSlug,
          Sync: 'Synced',
          Health: 'Healthy',
          Operation: 'Succeeded',
          Message: 'successfully synced',
          ObservedAt: '2026-01-01T00:00:00Z',
        },
      },
    });
    if (!reported.ok()) {
      throw new Error(`Failed to report live status: ${reported.status()} ${await reported.text()}`);
    }

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);
    try {
      await api.deleteSpace(spaceId, true);
    } catch {
      /* ignore */
    }
    await context.close();
  });

  test('the live status peek names the Release and its digest, not just the algorithm prefix', async ({
    page,
  }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const node = page.locator('.react-flow__node').filter({ hasText: spaceSlug });
    await expect(node).toBeVisible({ timeout: 10000 });

    // ArgoCD reported both axes, so the node carries both of Argo's own words
    // as separate chips (see `LiveStateChip`); either peek names the Release,
    // so assert on both.
    for (const label of ['Healthy', 'Synced']) {
      await node.getByText(label, { exact: true }).hover();

      const peek = page.getByRole('tooltip');
      await expect(peek).toBeVisible({ timeout: 5000 });
      await expect(peek).toContainText(EXPECTED_RELEASE_LINE);

      // Move off the chip so the next iteration's peek is a fresh one.
      await page.mouse.move(0, 0);
      await expect(peek).toHaveCount(0, { timeout: 5000 });
    }
  });
});
