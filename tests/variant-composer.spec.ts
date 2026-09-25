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
// appears; the
// counter-scale mechanism that keeps the composer legible at any zoom (with
// a control proving a real deploymentNode DOES shrink at the same zoom —
// this exact mechanism silently never worked through several earlier
// mockup builds, so it gets a real assertion, not a screenshot); and a
// multi-root fixture, since multi-root components are common
// (treeCenterLayout.ts's own docstring says so) and any single-root
// assumption in the landing-slot/composer positioning would break there.
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

/** Repeatedly clicks the ReactFlow "zoom out" control until it's disabled —
 *  i.e. the viewport is clamped at ComponentFlowGraph's `minZoom={0.3}` —
 *  giving a deterministic, known zoom regardless of the starting fit-to-view
 *  level. 25 iterations comfortably clears the distance from any starting
 *  zoom (fitView typically lands well above 0.3 for a two/three-node graph). */
async function zoomToMinimum(page: Page): Promise<void> {
  const zoomOutButton = page.locator('.react-flow__controls-zoomout');
  for (let i = 0; i < 25; i++) {
    if (await zoomOutButton.isDisabled()) break;
    await zoomOutButton.click();
  }
  await expect(zoomOutButton).toBeDisabled({ timeout: 5000 });
}

/** Raw `transform: translate(Xpx, Ypx) scale(Z)` inline style off ReactFlow's own viewport element. */
async function readViewportTransform(page: Page): Promise<string> {
  return page.locator('.react-flow__viewport').evaluate((el) => (el as HTMLElement).style.transform);
}

/** Parses `readViewportTransform`'s output into numbers, for zoom-equality / pan-distance assertions. */
function parseViewportTransform(raw: string): { x: number; y: number; zoom: number } {
  const match = raw.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/);
  if (!match) throw new Error(`unrecognized viewport transform: "${raw}"`);
  return { x: parseFloat(match[1]), y: parseFloat(match[2]), zoom: parseFloat(match[3]) };
}

/**
 * A node's OWN flow-space position — `.react-flow__node`'s inline
 * `transform: translate(Xpx, Ypx)` — which is independent of
 * `.react-flow__viewport`'s separate pan/zoom transform applied to its
 * ancestor. Use this, not `boundingBox()`, for "did this node's LAYOUT
 * position change" assertions: `boundingBox()` returns screen-space
 * coordinates, which legitimately shift under a real, intentional viewport
 * pan (e.g. nudge-into-view) even though nothing about the node's own flow
 * position moved. Conflating the two is exactly what made the multi-root
 * test flaky in CI — a nudge on the composer's own root panned the whole
 * canvas, shifting the unrelated root's SCREEN position while its actual
 * layout position never changed.
 */
async function readNodeFlowPosition(node: Locator): Promise<{ x: number; y: number }> {
  const raw = await node.evaluate((el) => (el as HTMLElement).style.transform);
  const match = raw.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  if (!match) throw new Error(`unrecognized node transform: "${raw}"`);
  return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
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
 *    for when the node isn't actionable (panned off-screen — the nudge
 *    test — `.hover()` requires visibility, `dispatchEvent` does not).
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

  test('counter-scale: the composer stays full size at minimum zoom while a real node shrinks (control)', async ({
    page,
  }) => {
    const api = new ApiHelper(page);
    const parentSlug = `e2e-composer-cscale-${RandomSlugGenerator.randomSlugName()}`;
    const parentId = await createBareSpace(api, parentSlug);

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
      await expect(parentNode).toBeVisible({ timeout: 10000 });

      await openComposerViaKeyboard(page, parentNode);
      const composer = page.locator(`.react-flow__node[data-id="__variant-composer__:${parentId}"]`);
      await expect(composer).toBeVisible({ timeout: 5000 });

      await zoomToMinimum(page);

      // A check that can only pass has not been tested: the control proves
      // the harness is actually discriminating at this zoom level, not just
      // reporting a constant.
      const controlBox = await parentNode.boundingBox();
      expect(controlBox).not.toBeNull();
      if (controlBox) {
        // Authored at 240 CSS px; at minZoom=0.3 that's ~72px. Assert it has
        // materially shrunk (well under its authored width) rather than
        // pinning an exact px value the renderer/DPR could nudge.
        expect(controlBox.width).toBeLessThan(150);
      }

      // The composer, however, must still measure its full authored width
      // (COMPOSER_WIDTH = 480, composerLayout.ts) regardless of the canvas
      // zoom — the counter-scale (`transform: scale(1/zoom)` in
      // ComposerNode.tsx, read reactively via ReactFlow's `useStore` on
      // `transform[2]`) exists specifically to cancel out the pane's own
      // `scale(zoom)` for this one element.
      //
      // IMPORTANT: measure the element the transform is actually ON
      // (data-testid="composer-scale-root", ComposerNode.tsx's own root
      // Box), NOT `composer` (the outer `.react-flow__node` wrapper React
      // Flow auto-sizes). A CSS transform never changes what a parent
      // measures as its child's layout size, so the wrapper reports
      // COMPOSER_WIDTH * zoom regardless of whether the counter-scale is
      // applied at all — asserting against it can't distinguish broken from
      // working. (Confirmed: with the counter-scale transform commented out
      // in ComposerNode.tsx, the wrapper still reported ~480*zoom while
      // composer-scale-root correctly dropped to ~480*zoom too — i.e. the
      // wrapper is uninformative either way. Only composer-scale-root
      // tracks the actual rendered size.)
      const composerScaleRoot = composer.getByTestId('composer-scale-root');
      const composerBox = await composerScaleRoot.boundingBox();
      expect(composerBox).not.toBeNull();
      if (composerBox) {
        expect(composerBox.width).toBeGreaterThan(440);
        expect(composerBox.width).toBeLessThan(520);
      }
    } finally {
      await api.deleteSpace(parentId, true).catch(() => {});
    }
  });

  test('multi-root: opening the composer on one root never moves an unrelated root', async ({ page }) => {
    const api = new ApiHelper(page);
    const rootASlug = `e2e-composer-roota-${RandomSlugGenerator.randomSlugName()}`;
    const rootBSlug = `e2e-composer-rootb-${RandomSlugGenerator.randomSlugName()}`;
    const rootAId = await createBareSpace(api, rootASlug);
    const rootBId = await createBareSpace(api, rootBSlug);

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const rootANode = page.locator(`.react-flow__node[data-id="${rootAId}"]`);
      const rootBNode = page.locator(`.react-flow__node[data-id="${rootBId}"]`);
      await expect(rootANode).toBeVisible({ timeout: 10000 });
      await expect(rootBNode).toBeVisible({ timeout: 10000 });

      // Flow-space position, not boundingBox() — see readNodeFlowPosition's
      // own comment. Opening the composer can legitimately nudge the
      // viewport (composerLayout's landing slot may fall outside the
      // multi-root layout's default fit), which shifts every node's SCREEN
      // position together without moving any of them relative to each
      // other or to the graph's own coordinate space. That's the real
      // invariant this test is for; boundingBox() can't tell the two apart
      // and flagged a pure pan as if a node had moved (confirmed live in CI:
      // both roots' on-screen X shifted by the same ~370px, matching a pan,
      // not a relayout).
      const rootBPosBefore = await readNodeFlowPosition(rootBNode);
      const rootAPosBefore = await readNodeFlowPosition(rootANode);

      // Open the composer on root A only.
      await openComposerViaKeyboard(page, rootANode);
      const composer = page.locator(`.react-flow__node[data-id="__variant-composer__:${rootAId}"]`);
      await expect(composer).toBeVisible({ timeout: 5000 });

      // The unrelated root (B) must not have moved at all — the composer/
      // landing-slot ghost nodes are positioned entirely downstream of
      // computeLayout's own output (composerLayout.ts) and never feed back
      // into it, so a second root sharing this component must be
      // unaffected regardless of array order.
      const rootBPosAfter = await readNodeFlowPosition(rootBNode);
      const rootAPosAfter = await readNodeFlowPosition(rootANode);
      expect(rootBPosAfter.x).toBeCloseTo(rootBPosBefore.x, 0);
      expect(rootBPosAfter.y).toBeCloseTo(rootBPosBefore.y, 0);
      // Root A (the composer's own parent) is likewise untouched — only the
      // ghost nodes appear; no existing node re-centers while composing.
      expect(rootAPosAfter.x).toBeCloseTo(rootAPosBefore.x, 0);
      expect(rootAPosAfter.y).toBeCloseTo(rootAPosBefore.y, 0);

      // Cancel leaves both roots exactly as they were.
      await composer.getByRole('button', { name: 'Cancel' }).click();
      await expect(composer).toBeHidden({ timeout: 5000 });
      const rootBPosFinal = await readNodeFlowPosition(rootBNode);
      expect(rootBPosFinal.x).toBeCloseTo(rootBPosBefore.x, 0);
      expect(rootBPosFinal.y).toBeCloseTo(rootBPosBefore.y, 0);
    } finally {
      await api.deleteSpace(rootAId, true).catch(() => {});
      await api.deleteSpace(rootBId, true).catch(() => {});
    }
  });

  test('nudge-into-view: a composer whose landing position falls off-screen pans the viewport the minimum distance to show it (pure pan, zoom unchanged)', async ({
    page,
  }) => {
    const api = new ApiHelper(page);
    const parentSlug = `e2e-composer-nudge-off-${RandomSlugGenerator.randomSlugName()}`;
    const parentId = await createBareSpace(api, parentSlug);

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
      await expect(parentNode).toBeVisible({ timeout: 10000 });

      // Pan the canvas so the parent — and therefore the composer's landing
      // slot, one lane to its right (computeLandingSlotPosition,
      // composerLayout.ts) — is pushed toward/past the viewport edge. A
      // plain left-drag on the empty pane background pans the whole graph
      // (ReactFlow's default panOnDrag), the same gesture a user panning
      // around a large graph would make.
      const pane = page.locator('.react-flow__pane');
      const paneBox = await pane.boundingBox();
      if (!paneBox) throw new Error('pane bounding box not found');
      await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(paneBox.x + paneBox.width / 2 - 900, paneBox.y + paneBox.height / 2, { steps: 20 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      const before = parseViewportTransform(await readViewportTransform(page));

      // The node itself may now sit outside the actual browser viewport
      // (that is the whole point of this test) — openComposerViaKeyboard
      // uses dispatchEvent rather than a real pointer move specifically so
      // this still works: Playwright's `.hover()`/real mouse APIs refuse to
      // target coordinates outside the viewport, even with `force: true`.
      await openComposerViaKeyboard(page, parentNode);

      const composer = page.locator(`.react-flow__node[data-id="__variant-composer__:${parentId}"]`);
      await expect(composer).toBeVisible({ timeout: 5000 });
      // setViewport's own animation duration (the nudge effect in
      // ComponentFlowGraph.tsx) is 200ms; give it margin to finish before
      // reading the settled value.
      await page.waitForTimeout(400);

      const after = parseViewportTransform(await readViewportTransform(page));

      expect(after.x === before.x && after.y === before.y).toBe(false);
      // Zoom must be exactly unchanged — this is what proves the nudge is a
      // pure pan via setViewport, not a setCenter/fitView reframe (which
      // would also rescale). This is the assertion that would catch someone
      // later "fixing" a nudge bug by reaching for fitView.
      expect(after.zoom).toBeCloseTo(before.zoom, 5);

      // Measure composer-scale-root, not the outer `.react-flow__node`
      // wrapper — see the counter-scale test above for why the wrapper is
      // uninformative about the composer's actual rendered box.
      const composerScaleRoot = composer.getByTestId('composer-scale-root');
      const composerBox = await composerScaleRoot.boundingBox();
      const viewportSize = page.viewportSize();
      expect(composerBox).not.toBeNull();
      expect(viewportSize).not.toBeNull();
      if (composerBox && viewportSize) {
        expect(composerBox.x).toBeGreaterThanOrEqual(-1);
        expect(composerBox.y).toBeGreaterThanOrEqual(-1);
        expect(composerBox.x + composerBox.width).toBeLessThanOrEqual(viewportSize.width + 1);
        expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(viewportSize.height + 1);
      }
    } finally {
      await api.deleteSpace(parentId, true).catch(() => {});
    }
  });

  test('nudge-into-view: a composer that already fits leaves the viewport untouched', async ({ page }) => {
    const api = new ApiHelper(page);
    const parentSlug = `e2e-composer-nudge-vis-${RandomSlugGenerator.randomSlugName()}`;
    const parentId = await createBareSpace(api, parentSlug);

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
      await expect(parentNode).toBeVisible({ timeout: 10000 });

      // Testing "already visible" against the page's own fresh fitView
      // state is a trap: a lone node's fitView zooms in tight (~1.5x for a
      // single 240x84 card), and at that zoom the composer's 480-wide
      // landing slot genuinely does not fit beside it — so a naive version
      // of this test would silently exercise the OFF-SCREEN case instead
      // (confirmed empirically while writing this test). Hand-picking a
      // "roomier" zoom and deriving by hand whether the composer fits (from
      // NODE_WIDTH/STAGE_GAP/COMPOSER_WIDTH/margins) is fragile and not
      // authoritative — computeNudgeIntoView (composerLayout.ts) is the
      // authority on what counts as visible, not arithmetic reproduced
      // here. So instead: open once and let it nudge for real if it needs
      // to, cancel, then reopen the SAME parent. The second open computes
      // against a position the app itself already decided was sufficient,
      // which is a genuine already-visible case by construction — do not
      // "simplify" this back to a single open against the fresh fitView
      // state, it will silently stop testing what this test claims to.
      await openComposerViaKeyboard(page, parentNode);
      const firstComposer = page.locator(`.react-flow__node[data-id="__variant-composer__:${parentId}"]`);
      await expect(firstComposer).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(400); // let the first (possibly real) nudge animation finish

      await firstComposer.getByRole('button', { name: 'Cancel' }).click();
      await expect(firstComposer).toBeHidden({ timeout: 5000 });
      await page.waitForTimeout(200);

      const before = await readViewportTransform(page);

      await openComposerViaKeyboard(page, parentNode);
      const secondComposer = page.locator(`.react-flow__node[data-id="__variant-composer__:${parentId}"]`);
      await expect(secondComposer).toBeVisible({ timeout: 5000 });
      // Margin for a nudge to fire IF the mechanism were wrongly triggering
      // one on an already-visible composer — same 200ms duration as above.
      await page.waitForTimeout(400);

      const after = await readViewportTransform(page);

      // Exact string equality, not "close to": computeNudgeIntoView returns
      // null (untouched) when the composer is already visible, so nothing
      // should call setViewport at all — the transform string must be
      // byte-identical, not merely close.
      expect(after).toBe(before);
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

  test("N>1 with an uneven per-space Step 2 outcome — only the short space's card shows failed, attributed by success count, not by a failed item's (misattributed) SpaceID", async ({
    page,
  }) => {
    const api = new ApiHelper(page);
    const parentSlug = `e2e-composer-uneven-${RandomSlugGenerator.randomSlugName()}`;
    const parentId = await createBareSpace(api, parentSlug);
    // Two real source units — expectedUnitCount will be 2 for every destination.
    await api.createUnit({ spaceId: parentId, unit: { Slug: 'cfg-a', ToolchainType: 'Kubernetes/YAML' } });
    await api.createUnit({ spaceId: parentId, unit: { Slug: 'cfg-b', ToolchainType: 'Kubernetes/YAML' } });

    const keepName = `uneven-keep-${RandomSlugGenerator.randomSlugName()}`;
    const breakName = `uneven-break-${RandomSlugGenerator.randomSlugName()}`;
    const createdSpaceIds: string[] = [];

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
      await expect(parentNode).toBeVisible({ timeout: 10000 });
      await openComposerViaKeyboard(page, parentNode);
      const composer = page.locator(`.react-flow__node[data-id="__variant-composer__:${parentId}"]`);
      await expect(composer).toBeVisible({ timeout: 5000 });

      // expectedUnitCount (AppComponentView.tsx's composerUpstreamInfo)
      // comes from unitsByDeployment, a separate, slower-loading query than
      // the one the node itself renders from — the node can be visible
      // (spaces load fast) while the units list backing expectedUnitCount
      // is still empty. Confirmed live in CI: with expectedUnitCount
      // resolved to 0, `successCount < expectedUnitCount` is false for
      // EVERY destination regardless of what Step 2 returns, so both rows
      // reach 'success', overallPhase becomes 'success' instead of
      // 'partialFailure', and the composer auto-closes — which is why the
      // failure surfaced as breakRow's locator finding zero elements
      // (its parent, the composer, was gone), not a wrong data-phase
      // value. The Namespace field's own helper text is a direct, already
      // -rendered signal for this: it reads "No Kubernetes units detected"
      // until hasK8sUnits flips true, which happens on the SAME data this
      // test needs settled. Wait for it explicitly rather than a fixed
      // delay guessing at the query's actual timing.
      await expect(composer.getByText('Applied to Kubernetes units in this variant.')).toBeVisible({
        timeout: 10000,
      });

      // Intercept Step 1 (bulkCreateSpaces POST /api/_space) PURELY TO
      // OBSERVE it — the real request passes through unmodified — so
      // breakSpaceId is known BEFORE Step 2 ever fires, from the same
      // response the frontend itself reads. The previous version of this
      // test instead made a SEPARATE page.request.get('/api/space') call
      // from inside the Step 2 handler to look the ID up after the fact;
      // against a real backend that extra call is one more thing that can
      // fail (auth headers a raw page.request call doesn't carry, timing,
      // anything), and if it throws inside an unguarded route handler the
      // intercepted request never resolves — the browser's fetch just
      // hangs, which is exactly the "stuck on data-phase=cloning" timeout
      // this test hit in CI. Capturing the ID from data already in hand
      // removes the failure mode instead of guarding around it.
      let breakSpaceId = '';
      let keepSpaceId = '';
      // Matched by pathname, not a glob string: bulkCreateSpaces sends
      // where/variantLabels as QUERY PARAMETERS (see confighubapi.gen.ts's
      // bulkCreateSpaces `params`), so the real request URL is
      // `/api/_space?where=...&variant_labels=...`. Playwright's glob
      // patterns anchor to the end of the string ('**/api/_space' compiles
      // to `...\/api\/_space$'), so a literal glob here would silently
      // never match and this interception would be a permanent no-op —
      // exactly what happened before this fix (confirmed via CI trace: the
      // request went straight to the real backend, unintercepted).
      await page.route((url) => url.pathname.endsWith('/api/_space'), async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        try {
          const response = await route.fetch();
          const body = (await response.json()) as Array<{ Space?: { SpaceID?: string; Labels?: Record<string, string> } }>;
          for (const item of body) {
            const variant = item.Space?.Labels?.Variant;
            if (variant === breakName) breakSpaceId = item.Space?.SpaceID ?? '';
            if (variant === keepName) keepSpaceId = item.Space?.SpaceID ?? '';
          }
          return route.fulfill({ response });
        } catch {
          // Never let observation-only interception hang the real request —
          // pass it through unmodified so at worst the corruption below
          // can't find breakSpaceId and this test fails on a clear,
          // immediate assertion instead of a silent timeout.
          return route.continue();
        }
      });

      // Intercept Step 2 (bulkCreateUnits POST /api/unit) and fulfill it
      // with a FULLY SYNTHETIC response — no route.fetch() to the real
      // backend at all. An earlier version of this test let the real
      // request through and rewrote its response, and got the frontend
      // stuck indefinitely on data-phase="cloningUnits". That was traced
      // (via a CI trace's captured network log) to the route glob
      // ('**/api/unit') never matching in the first place — bulkCreateUnits
      // appends where/whereSpace as query params, and Playwright's glob
      // patterns are end-anchored, so the real, unintercepted request went
      // straight to the backend and cloned everything successfully,
      // leaving nothing to ever produce the `unitCloneFailed` row this test
      // asserts on. Fixed by matching on pathname (see below) instead of a
      // literal glob. Kept as a fully synthetic response (not a rewritten
      // real one) because this test is about frontend attribution logic
      // given a known response shape, not about verifying the real
      // bulkCreateUnits call. Two real source units (cfg-a, cfg-b) were
      // created above, so expectedUnitCount is exactly 2 for every
      // destination.
      //
      // The shape mirrors the EXACT real misattribution the plan's §4
      // documents (internal/views/bulk_handlers.go's nine
      // toErrorResponse(sourceEntity, err) call sites all use the upstream
      // unit's identity, never the destination's): every failure item
      // carries the UPSTREAM space's SpaceID, indistinguishable from each
      // other by SpaceID alone. If the client attributed failure by reading
      // a failed item's Unit.SpaceID, it would misattribute (or attribute
      // to nothing, since that ID is the upstream, not `keepName`'s or
      // `breakName`'s destination). The fix (count successes per REAL
      // destination SpaceID, compare against expected) must still
      // correctly — and only — mark `breakName`'s card failed.
      //
      // Matched by pathname, not a glob string — same reason as the
      // `/api/_space` route above: bulkCreateUnits sends where/whereSpace as
      // query parameters, so a literal '**/api/unit' glob (end-anchored)
      // never matches the real `/api/unit?where=...&where_space=...` URL.
      await page.route((url) => url.pathname.endsWith('/api/unit'), async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const success = (spaceId: string, slug: string) => ({ Unit: { SpaceID: spaceId, Slug: slug } });
        const failure = (slug: string) => ({
          Error: { Message: 'simulated unit clone failure' },
          Unit: { SpaceID: parentId, Slug: slug },
        });
        const body = [
          success(keepSpaceId, 'cfg-a'),
          success(keepSpaceId, 'cfg-b'),
          failure('cfg-a'),
          failure('cfg-b'),
        ];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });

      await composer.getByLabel('Variant name').fill(`${keepName}, ${breakName}`);
      await composer.getByRole('button', { name: 'Create 2' }).click();

      const keepRow = composer.getByTestId(`composer-status-row-${keepName}`);
      const breakRow = composer.getByTestId(`composer-status-row-${breakName}`);
      await expect(keepRow).toHaveAttribute('data-phase', 'success', { timeout: 15000 });
      await expect(breakRow).toHaveAttribute('data-phase', 'unitCloneFailed', { timeout: 15000 });

      // The composer stays open (overallPhase 'partialFailure') so the
      // failed row is visible, not silently swallowed by an auto-close.
      await expect(composer).toBeVisible();

      expect(breakSpaceId).toBeTruthy();
      if (breakSpaceId) createdSpaceIds.push(breakSpaceId);

      // keepName's node exists on the canvas once the composer's local
      // state refetches — this proves the OTHER space genuinely completed
      // and isn't held hostage by breakName's failure. keepSpaceId was
      // already captured reliably from Step 1's own response above; no
      // second lookup needed for cleanup.
      //
      // Scoped to .react-flow__node-deploymentNode specifically, not just
      // .react-flow__node — the composer itself is a react-flow__node too
      // (type composerNode) and stays open here (see the assertion above),
      // and its own per-space status row renders keepName's text, so an
      // unscoped filter resolves to both nodes and trips Playwright's
      // strict-mode violation.
      const keepNode = page.locator('.react-flow__node-deploymentNode').filter({ hasText: keepName });
      await expect(keepNode).toBeVisible({ timeout: 15000 });
      if (keepSpaceId) createdSpaceIds.push(keepSpaceId);
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

  test('drag from a node\'s source handle onto ANOTHER node never opens the composer (and stays a no-op)', async ({
    page,
  }) => {
    const api = new ApiHelper(page);
    const aSlug = `e2e-composer-drag-node-a-${RandomSlugGenerator.randomSlugName()}`;
    const bSlug = `e2e-composer-drag-node-b-${RandomSlugGenerator.randomSlugName()}`;
    const aId = await createBareSpace(api, aSlug);
    const bId = await createBareSpace(api, bSlug);

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const nodeA = page.locator(`.react-flow__node[data-id="${aId}"]`);
      const nodeB = page.locator(`.react-flow__node[data-id="${bId}"]`);
      await expect(nodeA).toBeVisible({ timeout: 10000 });
      await expect(nodeB).toBeVisible({ timeout: 10000 });

      const sourceHandle = nodeA.locator('.react-flow__handle-right');
      const handleBox = await sourceHandle.boundingBox();
      const targetBox = await nodeB.boundingBox();
      if (!handleBox || !targetBox) throw new Error('bounding boxes not found');

      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(500); // give it every chance to (wrongly) open before asserting absence

      const composer = page.locator('.react-flow__node[data-id^="__variant-composer__"]');
      await expect(composer).toHaveCount(0);
      // The drop lands on node B — the existing onNodeClick path
      // (side-pane select) is a DIFFERENT gesture this drag must not
      // accidentally trigger either.
      await expect(page.getByTestId('component-pane-tab-config')).toHaveCount(0);
    } finally {
      await api.deleteSpace(aId, true).catch(() => {});
      await api.deleteSpace(bId, true).catch(() => {});
    }
  });

  test('a plain click (no drag) on a node\'s source handle does not open the composer', async ({
    page,
  }) => {
    const api = new ApiHelper(page);
    const parentSlug = `e2e-composer-click-no-drag-${RandomSlugGenerator.randomSlugName()}`;
    const parentId = await createBareSpace(api, parentSlug);

    try {
      await navigateAndSelectApp(page, APP_LABEL);

      const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
      await expect(parentNode).toBeVisible({ timeout: 10000 });

      const sourceHandle = parentNode.locator('.react-flow__handle-right');
      const handleBox = await sourceHandle.boundingBox();
      if (!handleBox) throw new Error('source handle bounding box not found');

      const cx = handleBox.x + handleBox.width / 2;
      const cy = handleBox.y + handleBox.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.up(); // zero movement between down and up
      await page.waitForTimeout(500);

      const composer = page.locator('.react-flow__node[data-id^="__variant-composer__"]');
      await expect(composer).toHaveCount(0);
    } finally {
      await api.deleteSpace(parentId, true).catch(() => {});
    }
  });
});
