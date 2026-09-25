// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Components view's URL as a live, continuous mirror of selection —
// every page state deeplinkable and reload-safe, reversing the
// earlier "THIS VISIT ONLY" consume-and-strip behaviour. See
// `ui/docs/dev/components.md`'s "URL is the sole source of truth" section
// for the architecture: `AppsComponentLayout` is the only component that
// touches `useSearchParams`, and every write goes through one `updateParams`
// helper with `{ replace: true }` — the property this file's last test
// exists to prove (zero pushed history entries beyond the page's own initial
// navigation, no matter how many gestures happen in between).
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const APP_LABEL = `e2e-deeplink-${RandomSlugGenerator.randomSlugName()}`;

/**
 * Navigate to the component page filtered by app label, wait for loading to
 * finish, then click the app in the navigation tree so the flow graph renders.
 */
async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel).first()).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).first().click();
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
}

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

  test('a bookmarked ?mode=custom link still renders the graph', async ({ page }) => {
    // Saved links can carry a `mode` param the page does not read. It must
    // be ignored: the graph renders as normal, with no layout toggle.
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}&mode=custom`);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator(`.react-flow__node[data-id="${spaceId}"]`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Custom' })).toHaveCount(0);
  });

  test('clicking a node writes ?space=<SpaceID>; reload re-opens that node\'s side pane', async ({
    page,
  }) => {
    await navigateAndSelectApp(page, APP_LABEL);

    // Fails if the click stops writing `?space=`: neither the URL poll nor
    // the pane header (which only renders once `selectedDeploymentIds`
    // derives from that param) would ever land on this Space's id.
    await page.locator(`.react-flow__node[data-id="${spaceId}"]`).click();
    await expect(sidePaneLinkFor(page, spaceId)).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.get('space'), { timeout: 10000 })
      .toBe(spaceId);

    // Fails if a reload stops RESTORING the selection: a fresh mount that
    // ignores `?space=` renders no pane at all (Slide's `in` is gated on
    // `selectedDeploymentIds.size > 0`), so this link would never appear —
    // asserting the URL alone would miss that regression entirely.
    await page.reload();
    await expect(sidePaneLinkFor(page, spaceId)).toBeVisible({ timeout: 20000 });
    expect(new URL(page.url()).searchParams.get('space')).toBe(spaceId);
  });

  test('no history spam — several selections (no app switch) collapse to one goBack()', async ({
    page,
  }) => {
    // Selecting an app is a deliberate navigation and deliberately still a
    // PUSH (out of scope for the replace-everywhere rule, which answers a
    // question about rapid in-page gestures — node clicks — not
    // about switching which component app is open). So this test does NOT
    // go through `navigateAndSelectApp`'s nav-tree click, which would itself
    // push: it goes straight to the already-selected `?app=` URL, making the
    // one `page.goto` below the ONLY history entry `goBack()` should have to
    // undo. If a selection write ever started pushing too, the
    // URL after `goBack()` would still contain `/components` — this must
    // still fail in that case, not just in the app-switch case.
    //
    // The baseline is `/spaces`, NOT `/`: the app's own router replaces `/`
    // with `/components` client-side (`<Navigate to='/components' replace
    // />`), so a `/` baseline would land back on a bare `/components` after
    // Back — indistinguishable from the very regression this test exists to
    // catch. `/spaces` is a real, non-redirecting route.
    await page.goto('/spaces');
    await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}`);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });

    await page.locator(`.react-flow__node[data-id="${spaceId}"]`).click();
    await expect(sidePaneLinkFor(page, spaceId)).toBeVisible({ timeout: 15000 });

    // Deselect the node again.
    await page.locator(`.react-flow__node[data-id="${spaceId}"]`).click();
    await expect(sidePaneLinkFor(page, spaceId)).toHaveCount(0);

    // Every write above used `{ replace: true }` — none of it pushed its own
    // history entry. One Back from here must land exactly on `/spaces`, the
    // single real navigation that preceded it — not unwind through the
    // gestures one at a time, and not land on some other `/components` state.
    await page.goBack();
    await expect(page).toHaveURL(/\/spaces/, { timeout: 10000 });
  });
});
