// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Components view's URL as a live, continuous mirror of selection —
// every page state deeplinkable and reload-safe, reversing the
// earlier "THIS VISIT ONLY" consume-and-strip behaviour. See
// `ui/docs/dev/components.md`'s "URL is the sole source of truth" section
// for the architecture: `AppsComponentLayout` is the only component that
// touches `useSearchParams`, and every write goes through one `updateParams`
// helper with `{ replace: true }` — the property this file's test
// proves (zero pushed history entries beyond the page's own initial
// navigation, no matter how many gestures happen in between).
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const APP_LABEL = `e2e-deeplink-${RandomSlugGenerator.randomSlugName()}`;

/**
 * The side pane's own header, `ComponentSidePane.tsx`'s `PaneHeader`, always
 * renders a `<Link href="/spaces/<SpaceID>">` naming the CURRENTLY SELECTED
 * deployment — unconditionally, unlike the Configuration/Releases tab bar
 * underneath it, which only renders when the selected deployment can release
 * (`releaseTargetId`). This fixture's bare Space (no Unit, no Target) does
 * not, so no tab testid ever exists for it —
 * but the header link does, and it names the specific Space id, which is
 * exactly what proves the RIGHT node got selected (not merely "some pane
 * opened"). Nothing else on the page links to `/spaces/<id>` for a
 * target-less, non-Base-badge-only Space (the node's own target-open link
 * only renders when `deployment.targets.length > 0`).
 */
function sidePaneLinkFor(page: Page, id: string) {
  return page.locator(`a[href="/spaces/${id}"]`);
}

test.describe('components view deeplinking', () => {
  test.use({ storageState: 'authentication.json' });

  // A bare Space (no unit) is sufficient to render as a flow-graph deployment
  // node — `buildComponentData` only requires the Component label.
  const spaceSlug = `e2e-deeplink-node-${RandomSlugGenerator.randomSlugName()}`;
  let spaceId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
    );
    const api = new ApiHelper(page);
    const space = await api.createSpace({
      space: { Slug: spaceSlug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E' } },
    });
    spaceId = (space as { SpaceID: string }).SpaceID;
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
      /* best-effort cleanup */
    }
    await context.close();
  });

  test('clicking a node writes ?space=<SpaceID>, reload re-opens its side pane, and the selections cost one goBack()', async ({
    page,
  }) => {
    // Selecting an app is a deliberate navigation and still a PUSH, so this
    // goes straight to the already-selected `?app=` URL rather than through
    // the nav tree: the one `page.goto` below is then the ONLY history entry
    // `goBack()` should have to undo.
    //
    // The baseline is `/spaces`, NOT `/`: the app's own router replaces `/`
    // with `/components` client-side, so a `/` baseline would land back on a
    // bare `/components` after Back — indistinguishable from the regression
    // this test exists to catch.
    await page.goto('/spaces');
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}`);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });

    // Fails if the click stops writing `?space=`: neither the URL poll nor
    // the pane header (which only renders once `selectedDeploymentIds`
    // derives from that param) would ever land on this Space's id.
    const node = page.locator(`.react-flow__node[data-id="${spaceId}"]`);
    await node.click();
    await expect(sidePaneLinkFor(page, spaceId)).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.get('space'), { timeout: 10000 })
      .toBe(spaceId);

    // Fails if a reload stops RESTORING the selection: a fresh mount that
    // ignores `?space=` renders no pane at all, so this link would never
    // appear — asserting the URL alone would miss that regression entirely.
    await page.reload();
    await expect(sidePaneLinkFor(page, spaceId)).toBeVisible({ timeout: 20000 });
    expect(new URL(page.url()).searchParams.get('space')).toBe(spaceId);

    // Deselect the node again.
    await node.click();
    await expect(sidePaneLinkFor(page, spaceId)).toHaveCount(0);

    // Every selection write used `{ replace: true }`, so one Back lands exactly
    // on `/spaces` — not on some other `/components` state.
    await page.goBack();
    await expect(page).toHaveURL(/\/spaces/, { timeout: 10000 });
  });
});
