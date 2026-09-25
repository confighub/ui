// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Live-status Peek E2E Test
//
// Creates one deployment Space carrying a realistic `confighub.com/live-status`
// annotation — the shape argobot writes, whose `revision` is the OCI digest
// Argo pulled (`sha256:<64 hex>`) — and asserts the hover peek on the node's
// live-status chips shows the hash itself.
//
// Regression guard for the peek truncating the WHOLE revision string to a
// short-SHA width, which for a digest yields the algorithm prefix and none of
// the hash ("revision: sha256:"). See `formatLiveRevision` in liveStatus.ts.
// ============================================================================

const APP_LABEL = `e2e-livestatus-${RandomSlugGenerator.randomSlugName()}`;

const LIVE_STATUS_ANNOTATION = 'confighub.com/live-status';

/** A real OCI digest, the form argobot reports for an Argo app synced from an OCI source. */
const REVISION = 'sha256:4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1';

/** What the peek must show: the algorithm kept whole, the hash abbreviated. */
const EXPECTED_REVISION_LINE = 'revision: sha256:4f4fb700ef54';

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

test.describe('component view live-status peek', () => {
  test.use({ storageState: 'authentication.json' });

  const spaceSlug = `e2e-live-${RandomSlugGenerator.randomSlugName()}`;
  const workerSlug = `e2e-live-worker-${RandomSlugGenerator.randomSlugName()}`;
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

    // The live-status annotation a reporter would have written back. Set by
    // merge-patch (the same call argobot makes) rather than at create time.
    await api.updateSpace({
      spaceId,
      space: {
        Annotations: {
          [LIVE_STATUS_ANNOTATION]: JSON.stringify({
            source: 'argobot',
            app: spaceSlug,
            syncStatus: 'Synced',
            healthStatus: 'Healthy',
            operationPhase: 'Succeeded',
            revision: REVISION,
            message: 'successfully synced',
            observedAt: '2026-01-01T00:00:00Z',
          }),
        },
      },
    });

    // A Target (reached via a Unit's TargetID) is what makes the Space a
    // Deployment rather than a Base — `buildComponentData` drops live status
    // entirely for a Base, so without one no chip renders at all.
    const workerResp = await hubApi.post(`/api/space/${spaceId}/bridge_worker`, {
      params: { allow_exists: 'true' },
      data: {
        Slug: workerSlug,
        ProvidedInfo: {
          BridgeWorkerInfo: {
            SupportedConfigTypes: [
              { ProviderType: 'Kubernetes', ToolchainType: 'Kubernetes/YAML', LiveStateType: 'Kubernetes/YAML' },
            ],
          },
        },
      },
    });
    if (!workerResp.ok()) {
      throw new Error(
        `Failed to create bridge worker: ${workerResp.status()} ${await workerResp.text()}`,
      );
    }
    const workerData = (await workerResp.json()) as { BridgeWorkerID: string };

    const targetResp = await hubApi.post(`/api/space/${spaceId}/target`, {
      params: { allow_exists: 'true' },
      data: {
        Slug: targetSlug,
        BridgeWorkerID: workerData.BridgeWorkerID,
        ToolchainType: 'Kubernetes/YAML',
        ProviderType: 'Kubernetes',
      },
    });
    if (!targetResp.ok()) {
      throw new Error(`Failed to create target: ${targetResp.status()} ${await targetResp.text()}`);
    }
    const targetData = (await targetResp.json()) as { TargetID: string };

    const unitResp = await hubApi.post(`/api/space/${spaceId}/unit`, {
      params: { allow_exists: 'true' },
      data: {
        Slug: 'test-config',
        ToolchainType: 'Kubernetes/YAML',
        TargetID: targetData.TargetID,
      },
    });
    if (!unitResp.ok()) {
      throw new Error(`Failed to create unit: ${unitResp.status()} ${await unitResp.text()}`);
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

  test('the live-status peek shows the synced revision hash, not just its algorithm prefix', async ({
    page,
  }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    const node = page.locator('.react-flow__node').filter({ hasText: spaceSlug });
    await expect(node).toBeVisible({ timeout: 10000 });

    // ArgoCD reported both axes, so the node carries both of Argo's own words
    // as separate chips (see `LiveStateChip`); either peek carries the
    // revision, so assert on both.
    for (const label of ['Healthy', 'Synced']) {
      await node.getByText(label, { exact: true }).hover();

      const peek = page.getByRole('tooltip');
      await expect(peek).toBeVisible({ timeout: 5000 });
      await expect(peek).toContainText(EXPECTED_REVISION_LINE);

      // Move off the chip so the next iteration's peek is a fresh one.
      await page.mouse.move(0, 0);
      await expect(peek).toHaveCount(0, { timeout: 5000 });
    }
  });
});
