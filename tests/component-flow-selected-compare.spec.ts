// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// A deployment in the side pane's comparison (URL `compare=`), not just the
// one the pane is open on (URL `space=`), must read as selected on the flow
// graph: the same border the open node gets, told apart only by its letter
// badge — every compared variant is equal, not a highlighted original plus
// unmarked extras.
// ============================================================================

const APP_LABEL = `e2e-flowselect-${RandomSlugGenerator.randomSlugName()}`;

/** A bare Space (no unit) is sufficient to render as a flow-graph deployment node. */
async function createBareSpace(api: ApiHelper, slug: string): Promise<string> {
  const space = await api.createSpace({ space: { Slug: slug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E' } } });
  return (space as { SpaceID: string }).SpaceID;
}

/**
 * Navigate straight to the graph with `space`/`compare` already set, rather
 * than driving the selection through node clicks — the URL is the view's
 * sole source of truth for both (see `AppsComponentLayout.tsx`), so this is
 * both the simplest and the most stable way to reach a given comparison.
 */
async function gotoWithSelection(
  page: Page,
  appLabel: string,
  openId: string,
  compareIds: string[],
): Promise<void> {
  const params = new URLSearchParams({ app: appLabel, space: openId });
  if (compareIds.length > 0) params.set('compare', compareIds.join(','));
  await page.goto(`/components?${params.toString()}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
}

test.describe('flow graph selected state for a compared node', () => {
  test.use({ storageState: 'authentication.json' });

  const aSlug = `e2e-fs-a-${RandomSlugGenerator.randomSlugName()}`;
  const bSlug = `e2e-fs-b-${RandomSlugGenerator.randomSlugName()}`;
  let aId: string;
  let bId: string;
  const allSpaceIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);

    aId = await createBareSpace(api, aSlug);
    bId = await createBareSpace(api, bSlug);
    allSpaceIds.push(aId, bId);

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
    for (const spaceId of allSpaceIds) {
      try {
        await api.deleteSpace(spaceId, true);
      } catch {
        /* ignore */
      }
    }
    await context.close();
  });

  test('a compared node matches the open node\'s selected border, and neither does when nothing is compared', async ({ page }) => {
    // ── Nothing compared: only the open node (A) reads as selected ──
    await gotoWithSelection(page, APP_LABEL, aId, []);

    const nodeA = page.locator(`[data-testid="flow-node-${aId}"]`);
    const nodeB = page.locator(`[data-testid="flow-node-${bId}"]`);
    await expect(nodeA).toBeVisible({ timeout: 10000 });
    await expect(nodeB).toBeVisible({ timeout: 10000 });

    await expect(nodeA).toHaveAttribute('data-selected', 'true');
    await expect(nodeB).toHaveAttribute('data-selected', 'false');
    await expect(page.locator('[data-testid="node-compare-letter"]')).toHaveCount(0);

    const unselectedColor = await nodeB.evaluate((el) => getComputedStyle(el).borderColor);
    const openColor = await nodeA.evaluate((el) => getComputedStyle(el).borderColor);
    expect(unselectedColor).not.toBe(openColor);

    // ── B joins the comparison: both nodes now read as selected, alike ──
    await gotoWithSelection(page, APP_LABEL, aId, [bId]);
    await expect(nodeA).toBeVisible({ timeout: 10000 });
    await expect(nodeB).toBeVisible({ timeout: 10000 });

    await expect(nodeA).toHaveAttribute('data-selected', 'true');
    await expect(nodeB).toHaveAttribute('data-selected', 'true');

    const aBorder = await nodeA.evaluate((el) => getComputedStyle(el).borderColor);
    const bBorder = await nodeB.evaluate((el) => getComputedStyle(el).borderColor);
    // The exact point of this test: a compare slot gets the SAME border as
    // the open node, not a lesser or different one.
    expect(bBorder).toBe(aBorder);
    expect(bBorder).toBe(openColor);
    expect(bBorder).not.toBe(unselectedColor);

    // Each still carries its own letter, so A and B stay tellable apart.
    const flowNodeA = page.locator(`.react-flow__node[data-id="${aId}"]`);
    const flowNodeB = page.locator(`.react-flow__node[data-id="${bId}"]`);
    await expect(flowNodeA.getByTestId('node-compare-letter')).toHaveText('A');
    await expect(flowNodeB.getByTestId('node-compare-letter')).toHaveText('B');
  });
});
