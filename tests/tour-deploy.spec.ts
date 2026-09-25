// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Locator, type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Guided-tour "Deploy to dev" (id `deploy-and-release`, chapter 4 of the
// original tutorial content) — `deployAndReleaseSteps`
// (tours/chapters/deployAndRelease.tsx) is registered as a real
// `TourDefinition` via `defineTour` at module scope, imported for that side
// effect by `tours/index.ts`. The first test below drives it through the
// real `?tour=deploy-and-release` entry point to prove the registration and
// its "take the earlier tour first" hint actually reach the UI. The rest of
// this spec drives the exact same gesture sequence and testid/selector chain
// each TourStep names, in the same order, proving those anchors and advance
// conditions correspond to a real, working flow — see deployAndRelease.tsx's
// own docstring for the full reasoning behind each selector.
//
// Chapter 5 ("publish a release") is not in this tour — see
// deployAndRelease.tsx's docstring for why it was relocated to the very end
// of the whole 5-tour sequence instead. Its own coverage lives in
// tour-ownership.spec.ts. The real release mechanics (Releases tab, publish,
// release lane) are covered independently by component-release.spec.ts,
// which does set a real release target.
// ============================================================================

const TOUR_ID = 'deploy-and-release';

const APP_LABEL = `e2e-tour-deploy-${RandomSlugGenerator.randomSlugName()}`;

async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
}

/**
 * Opens the inline variant composer via the app's real entry point — hover
 * the node, then press 'V'. Mirrors variant-composer.spec.ts's
 * `openComposerViaKeyboard`: the composer-open handle has no click handler
 * at all (see deployAndRelease.tsx's docstring), so chapter 4's own first
 * step cannot be a `click` advance either — this is the same reason.
 */
async function openComposerViaKeyboard(page: Page, node: Locator): Promise<void> {
  const attempt = async () => {
    try {
      await node.hover({ timeout: 2000 });
    } catch {
      await node.dispatchEvent('mouseover');
    }
    await page.waitForTimeout(150);
    await page.keyboard.press('v');
  };
  await attempt();
  if (!(await page.getByTestId('composer-variant-name-input').isVisible({ timeout: 2000 }).catch(() => false))) {
    await attempt();
  }
}

test.describe('tour chapter 4 — make a dev variant', () => {
  test.use({ storageState: 'authentication.json' });

  const baseSlug = `e2e-tour-deploy-base-${RandomSlugGenerator.randomSlugName()}`;

  let baseSpaceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());

    const api = new ApiHelper(page);

    // The base — no Target on any unit or on the Space itself: this
    // matches what this tour's own chapter 4 ever produces (chapter 5,
    // which used to need a release target here, no longer lives in this
    // tour — see the header comment).
    const base = await api.createSpace({
      space: { Slug: baseSlug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E', Environment: 'base' } },
    });
    baseSpaceId = (base as { SpaceID: string }).SpaceID;

    const createdUnit = await api.createUnit({
      spaceId: baseSpaceId,
      unit: { Slug: 'test-config', ToolchainType: 'Kubernetes/YAML' },
    });
    const unitData = { UnitID: createdUnit.UnitID as string };

    const yaml = ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: test-config', 'data:', '  replicas: "1"'].join('\n');
    await api.uploadUnitData({ spaceId: baseSpaceId, unitId: unitData.UnitID, body: yaml });

    for (let i = 0; i < 100; i++) {
      const resp = await hubApi.get(`/api/space/${baseSpaceId}/unit/${unitData.UnitID}`);
      if (resp.ok() && !(await resp.text()).includes('awaiting/triggers')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse((r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok());
    const api = new ApiHelper(page);
    try {
      await api.deleteSpace(baseSpaceId, true);
    } catch {
      /* ignore */
    }
    await context.close();
  });

  test('launches via ?tour=deploy-and-release with its own title, step count, and "take the earlier tour" hint', async ({ page }) => {
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}&tour=${TOUR_ID}`);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});

    const tooltip = page.getByTestId('tour-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 20000 });
    await expect(tooltip).toContainText('1 of 6');
    await expect(tooltip).toContainText('Want this to deploy for real?');
    // The hint that a user landing here out of order should take the
    // earlier tour first.
    await expect(tooltip).toContainText('Explore your component');

    await tooltip.getByRole('button', { name: 'Exit' }).click();
    await expect(tooltip).toHaveCount(0);
  });

  test('chapter 4 selectors: base-scoped composer handle opens the composer, dev is created with no target', async ({ page }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    // ── data-variant identification (the "hard part") ── scoped to the
    // card itself: the new always-present `flow-node-select-target` strip
    // (added so a click-to-select is safe — see BASE_NODE_CSS below) carries
    // the same `data-variant="base"` attribute for its own lookup, so a bare
    // `[data-variant="base"]` now matches both the card and the strip.
    const baseNode = page.locator('[data-variant="base"]:not([data-testid="flow-node-select-target"])');
    await expect(baseNode).toHaveCount(1);
    await expect(baseNode).toBeVisible({ timeout: 10000 });

    const baseHandle = page.locator('[data-handle-variant="base"]');
    await expect(baseHandle).toHaveCount(1);

    // ── variant-open-composer: hover + 'V', NOT a click ──
    await openComposerViaKeyboard(page, baseNode);
    const nameInput = page.getByTestId('composer-variant-name-input');
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    // ── variant-name ── `composer-variant-name-input` is MUI TextField's
    // testid, which lands on the outer FormControl div, not the real
    // <input> nested inside it.
    await nameInput.locator('input').fill('dev');

    // ── variant-no-target: this step never interacts with the Select at
    // all (that IS the point — ComposerNode's `targetId` state initializes
    // to '', MenuItem value="" = "No target", and this test simply never
    // clicks it). Verified for real below, once the variant exists: its
    // cloned unit(s) must carry no TargetID.
    const targetSelect = page.getByTestId('composer-target-select');
    await expect(targetSelect).toBeVisible();

    // ── variant-submit ──
    await page.getByTestId('composer-submit-button').click();

    // ── variant-wait-success: the chapter's real advance target ──
    // NOT `composer-status-row-dev[data-phase="success"]`: confirmed here
    // live that the composer unmounts itself very shortly after a fully
    // successful submit (variant-composer.spec.ts asserts the same —
    // `await expect(composer).toBeHidden(...)` right after Create), closely
    // enough behind the 'success' write that this assertion caught
    // 'cloning' -> 'cloningUnits' -> element removed without ever observing
    // 'success' in between. The dev node appearing in the graph is the
    // durable proof of the same success and is what deployAndRelease.tsx's
    // advance now actually watches for instead.
    const devNode = page.locator('[data-variant="dev"]:not([data-testid="flow-node-select-target"])');
    await expect(devNode).toBeVisible({ timeout: 20000 });

    // And it was cloned with NO Target — the constraint chapter 4 exists to
    // enforce. `.react-flow__node` (reactflow's own wrapper) carries the
    // Space id as `data-id` (flow-graph/flowLayout.ts:126); `[data-variant]`
    // is stamped on NodeContainer, one level inside it.
    const devFlowNode = page.locator('.react-flow__node').filter({ has: devNode });
    const devSpaceId = await devFlowNode.first().getAttribute('data-id');
    expect(devSpaceId).toBeTruthy();
    if (devSpaceId) {
      const api = new ApiHelper(page);
      const devUnits = await hubApi.get(`/api/space/${devSpaceId}/unit`, { params: { select: 'UnitID,TargetID' } });
      const units = (await devUnits.json()) as { TargetID?: string }[];
      for (const u of units) expect(u.TargetID ?? '').toBe('');
      await api.deleteSpace(devSpaceId, true).catch(() => {});
    }
  });
});
