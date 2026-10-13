// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Locator, type Page } from '@playwright/test';
import { test, expect } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ============================================================================
// Inline Variant Composer E2E Tests (Phase 1)
//
// Covers the on-canvas composer that replaces CreateVariantPane. There is
// no click-to-open button — matching the validated mockup
// (design-mockups/variant-creation/option-a-inline-canvas/index.html:
// .handle.source-side), the only entry points are dragging from a node's
// source handle (Phase 3, below) and the 'V' key while hovering a node
// (ComponentFlowGraph.tsx tracks hover, not focus, so tests use
// openComposerViaKeyboard rather than a plain keypress). A single name
// submits through useCreateVariantMutation unchanged and the new node
// appears, and a comma list creates every new name in one session.
//
// Each test uses its own dedicated Space(s) (not `.serial()`) so they can run
// out of order or concurrently across workers without racing each other.
// ============================================================================

const APP_LABEL = `e2e-composer-${RandomSlugGenerator.randomSlugName()}`;

/**
 * Navigate to the component page filtered by app label, wait for loading to
 * finish, then click the app in the navigation tree so the flow graph renders.
 */
async function navigateAndSelectApp(page: Page, appLabel: string): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(appLabel)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.getByText(appLabel)).toBeVisible({ timeout: 20000 });
  await page.getByText(appLabel).click();
}

/** A bare Space (no unit) is sufficient to render as a flow-graph deployment node — buildComponentData only requires the Component label. */
async function createBareSpace(api: ApiHelper, slug: string): Promise<string> {
  const space = await api.createSpace({ space: { Slug: slug, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Owner: 'E2E' } } });
  return (space as { SpaceID: string }).SpaceID;
}

/**
 * Opens the composer via the app's real 'V' keyboard shortcut — there is no
 * click-to-open button (see the file header). ComponentFlowGraph.tsx tracks
 * which node the 'V' handler targets via onNodeMouseEnter/onNodeMouseLeave
 * (hover), not focus, so a genuine hover is required before the keypress.
 *
 * This is the first time the 'V' path has ever actually been exercised
 * end-to-end — every earlier test drove the composer open through the
 * now-removed click button, and the button's own tooltip merely claimed
 * 'V' worked without anything checking it. A fresh mock-harness check
 * found two real things worth encoding here rather than discovering again
 * later:
 *
 * 1. A real `.hover()` (genuine simulated mouse movement) reaches React's
 *    synthetic mouseenter reliably; `dispatchEvent('mouseover')` alone is
 *    measurably less reliable at it (roughly 4/6 vs 7/8 in repeated runs)
 *    — likely because a raw dispatched event carries no `relatedTarget`
 *    for React's enter/leave delegation to reason about. `.hover()` is
 *    therefore the primary technique; `dispatchEvent` is only a fallback
 *    for when the node isn't actionable (panned off-screen — `.hover()`
 *    requires visibility, `dispatchEvent` does not).
 * 2. Even with `.hover()`, the very first interaction right after a page
 *    load can race the mount of ComponentFlowGraph's keydown listener and
 *    silently no-op — every attempt from the *second* interaction onward
 *    in the same session was reliable. One bounded retry absorbs that
 *    without masking a genuine failure to open (a real defect would still
 *    fail on the retry too).
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
  const anyComposer = page.locator('.react-flow__node[data-id^="__variant-composer__"]');
  if (!(await anyComposer.first().isVisible({ timeout: 2000 }).catch(() => false))) {
    await attempt();
  }
}

test.describe('inline variant composer', () => {
  test.use({ storageState: 'authentication.json' });

  test('pressing V while hovering a node opens the composer; a single name submits and the new node appears', async ({
    page,
  }) => {
    const api = new ApiHelper(page);
    const parentSlug = `e2e-composer-parent-${RandomSlugGenerator.randomSlugName()}`;
    const parentId = await createBareSpace(api, parentSlug);
    const variantName = RandomSlugGenerator.randomSlugName();

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
      await expect(parentNode).toBeVisible({ timeout: 10000 });

      // The keyboard entry point — never routes through the node's own
      // click/select handler, so the side pane must stay closed.
      await openComposerViaKeyboard(page, parentNode);

      const composer = page.locator(`.react-flow__node[data-id="__variant-composer__:${parentId}"]`);
      await expect(composer).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`.react-flow__node[data-id="__variant-landing-slot__:${parentId}"]`)).toBeVisible();

      // Opening the composer must not have selected the parent node (that
      // would route through onDeploymentToggle, which this is explicitly
      // not allowed to do) — the side pane never mounts.
      await expect(page.getByTestId('component-pane-tab-config')).toHaveCount(0);

      await composer.getByLabel('Variant name').fill(variantName);
      await composer.getByRole('button', { name: 'Create variant' }).click();

      // The composer closes and the new node appears, named after the
      // Variant label the mutation set (ComponentDeployment.displayName
      // falls back to Space.Labels.Variant).
      await expect(composer).toBeHidden({ timeout: 15000 });
      const newNode = page.locator('.react-flow__node').filter({ hasText: variantName });
      await expect(newNode).toBeVisible({ timeout: 15000 });

      const newSpaceId = await newNode.getAttribute('data-id');
      expect(newSpaceId).toBeTruthy();
      if (newSpaceId) {
        const created = await api.getSpaceById(newSpaceId);
        expect(created.Labels?.Variant).toBe(variantName);
        expect(created.Annotations?.UpstreamSpaceID).toBe(parentId);
        await api.deleteSpace(newSpaceId, true);
      }
    } finally {
      await api.deleteSpace(parentId, true).catch(() => {});
    }
  });

  // ==========================================================================
  // Phase 2 — N-at-once
  // ==========================================================================

  test('comma-list submits N variants in one composer session — one bulkCreateSpaces + one bulkCreateUnits call, N nodes appear, an existing sibling name is skipped not blocked', async ({
    page,
  }) => {
    const api = new ApiHelper(page);
    const parentSlug = `e2e-composer-nway-${RandomSlugGenerator.randomSlugName()}`;
    const parentId = await createBareSpace(api, parentSlug);
    const existingName = `nway-existing-${RandomSlugGenerator.randomSlugName()}`;
    const freshNameA = `nway-a-${RandomSlugGenerator.randomSlugName()}`;
    const freshNameB = `nway-b-${RandomSlugGenerator.randomSlugName()}`;
    const createdSpaceIds: string[] = [];

    // A pre-existing sibling variant — asking for its name again alongside
    // two fresh ones should create the two fresh ones and skip (not block
    // on) the existing one, per the design's "a taken name is information,
    // not a mistake" rule.
    //
    // Owner MUST match createBareSpace's ('E2E') — the sidebar tree groups
    // by Owner, and a space with no Owner renders under a SEPARATE
    // "Unassigned" group. With a mismatched Owner here, the same app label
    // text ends up rendered twice (once per group), which turns
    // navigateAndSelectApp's getByText(appLabel) into a strict-mode
    // violation the instant this test's data exists — confirmed live in CI,
    // where it failed on every retry, not flakily.
    const existingSpace = await api.createSpace({
      space: { Slug: `${parentSlug}-existing`, ComponentID: (await api.createComponent(APP_LABEL)).ComponentID, Labels: { Variant: existingName, Owner: 'E2E' } },
    });
    createdSpaceIds.push((existingSpace as { SpaceID: string }).SpaceID);

    const bulkCreateSpacesRequests: string[] = [];
    const bulkCreateUnitsRequests: string[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'POST') return;
      const url = req.url();
      // bulkCreateSpaces is `/api/_space` (the underscore-prefixed BULK
      // collection endpoint) — NOT `/api/space` (single-space CRUD, used
      // by e.g. createBareSpace above). Confirmed against
      // confighubapi.gen.ts's own query definition; a naive
      // `url.includes('/api/space')` check matches neither exactly and
      // would silently count 0 real requests either way.
      if (url.includes('/api/_space')) bulkCreateSpacesRequests.push(url);
      if (url.includes('/api/unit')) bulkCreateUnitsRequests.push(url);
    });

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
      await expect(parentNode).toBeVisible({ timeout: 10000 });
      await openComposerViaKeyboard(page, parentNode);

      const composer = page.locator(`.react-flow__node[data-id="__variant-composer__:${parentId}"]`);
      await expect(composer).toBeVisible({ timeout: 5000 });

      await composer.getByLabel('Variant name').fill(`${freshNameA}, ${existingName}, ${freshNameB}`);

      // The existing name renders struck through and labeled "exists ·
      // skipped" — collision-strikethrough, before submit.
      const existingRow = composer.locator('text=exists · skipped');
      await expect(existingRow).toBeVisible();

      // The button counts only the fresh names, not the total typed.
      await expect(composer.getByRole('button', { name: 'Create 2' })).toBeVisible();
      await composer.getByRole('button', { name: 'Create 2' }).click();

      // Both fresh names' rows settle to success; the composer then
      // auto-closes (overallPhase 'success' — no name was left unresolved).
      await expect(composer).toBeHidden({ timeout: 20000 });

      const nodeA = page.locator('.react-flow__node').filter({ hasText: freshNameA });
      const nodeB = page.locator('.react-flow__node').filter({ hasText: freshNameB });
      await expect(nodeA).toBeVisible({ timeout: 15000 });
      await expect(nodeB).toBeVisible({ timeout: 15000 });

      const spaceIdA = await nodeA.getAttribute('data-id');
      const spaceIdB = await nodeB.getAttribute('data-id');
      if (spaceIdA) createdSpaceIds.push(spaceIdA);
      if (spaceIdB) createdSpaceIds.push(spaceIdB);

      // One call each — not one bulkCreateSpaces/bulkCreateUnits PER name.
      expect(bulkCreateSpacesRequests.length).toBe(1);
      expect(bulkCreateUnitsRequests.length).toBe(1);
    } finally {
      for (const id of createdSpaceIds) await api.deleteSpace(id, true).catch(() => {});
      await api.deleteSpace(parentId, true).catch(() => {});
    }
  });

  // ==========================================================================
  // Phase 3 — drag-from-handle gesture
  //
  // onConnect structurally cannot fire for a drop on empty canvas (it needs a
  // valid target handle within connectionRadius, which empty canvas isn't) —
  // the mechanism is onConnectStart (captures the source
  // node/handle-type) + onConnectEnd (fires unconditionally on pointer-up,
  // raw DOM event only), disambiguated via document.elementFromPoint at the
  // release position rather than by whether onConnect fired (an invalid
  // on-node drop also skips onConnect). See ComponentFlowGraph.tsx's
  // handleConnectStart/handleConnectEnd.
  // ==========================================================================

  test('drag from a node\'s source handle onto empty canvas opens the composer, same as V', async ({ page }) => {
    const api = new ApiHelper(page);
    const parentSlug = `e2e-composer-drag-empty-${RandomSlugGenerator.randomSlugName()}`;
    const parentId = await createBareSpace(api, parentSlug);

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
      await expect(parentNode).toBeVisible({ timeout: 10000 });

      const sourceHandle = parentNode.locator('.react-flow__handle-right');
      const handleBox = await sourceHandle.boundingBox();
      const nodeBox = await parentNode.boundingBox();
      if (!handleBox || !nodeBox) throw new Error('handle/node bounding box not found');
      const viewportSize = page.viewportSize();
      if (!viewportSize) throw new Error('viewport size not available');

      // Drop well clear of the NODE (not just the handle) — but computed
      // from the actual viewport and the node's real bounds, not a fixed
      // "+500px" offset. A fixed right-side offset assumes there's 500px of
      // empty canvas past the handle, which isn't guaranteed: fitView's
      // placement of a single lone node varies by viewport width, and CI's
      // default 1280px viewport (narrower than the 1400px used in local
      // verification, which never surfaced this) placed this node close
      // enough to the right edge that handleBox.x + 500 landed OUTSIDE the
      // browser viewport entirely. A coordinate outside the viewport makes
      // document.elementFromPoint return null at the drop point (confirmed
      // live in CI) — handleConnectEnd correctly bails on a null element
      // (there's nothing there to disambiguate), so the composer never
      // opened. Deterministically, not flakily: the math was wrong, not
      // the timing.
      //
      // Prefer dropping to the right (matches the mockup's "clone lands in
      // the next lane" direction), but fall back to the left — using the
      // NODE's own box, not the handle's, so the drop point clears the
      // node's full width rather than landing back on it — when the node
      // sits too close to the viewport's right edge for the right side to
      // have room.
      const roomRight = viewportSize.width - (nodeBox.x + nodeBox.width);
      const dropX =
        roomRight >= 150
          ? Math.min(nodeBox.x + nodeBox.width + 100, viewportSize.width - 40)
          : Math.max(nodeBox.x - 100, 40);
      const dropY = handleBox.y + handleBox.height / 2;

      const doDrag = async () => {
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(dropX, dropY, { steps: 15 });
        await page.mouse.up();
      };
      await doDrag();

      const composer = page.locator(`.react-flow__node[data-id="__variant-composer__:${parentId}"]`);
      // Kept as a defensive measure against the class of first-interaction
      // mount-timing race documented on openComposerViaKeyboard above (a
      // real, separately-confirmed risk elsewhere in this suite) — but that
      // was NOT what caused this test's earlier CI failure; the off-viewport
      // drop point above was. One bounded retry costs nothing and still
      // can't mask a genuine failure to open, which would fail identically
      // on the retry too.
      if (!(await composer.isVisible({ timeout: 5000 }).catch(() => false))) {
        await doDrag();
      }
      await expect(composer).toBeVisible({ timeout: 5000 });
    } finally {
      await api.deleteSpace(parentId, true).catch(() => {});
    }
  });
});
