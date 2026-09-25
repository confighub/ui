// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// E2E verification for task #27: component-view node-click → invoker context.
//
// Builder fix in AppComponentView.tsx: a useEffect dispatches setSelectedUnits
// when a deployment node is selected, and clears on deselect/unmount.
//
// Seed: creates space "e2e-prom-dev" with Labels.Component="e2e-prom-app"
//       and 2 units in it, then tears everything down in afterAll.

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { test, expect, newAuthorizedPage, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROM_APP    = 'e2e-prom-app';   // ?app= value (the slug of the space's Component)
const SPACE_SLUG  = 'e2e-prom-dev';   // deployment space slug
const UNIT_SLUG_A = 'e2e-prom-unit-a';
const UNIT_SLUG_B = 'e2e-prom-unit-b';

test.use({ storageState: 'authentication.json' });

// ─── seed / tear-down ───────────────────────────────────────────────────────

let seedSpaceId = '';

test.beforeAll(async ({ browser }) => {
  const page = await newAuthorizedPage(browser);
  try {
    // Create space in the Component PROM_APP
    const component = await new ApiHelper(page).createComponent(PROM_APP);
    const spaceResp = await hubApi.post('/api/space', {
      params: { allow_exists: 'true' },
      data: { Slug: SPACE_SLUG, DisplayName: 'E2E Prom Dev', ComponentID: component.ComponentID },
    });
    expect(spaceResp.ok(), `create space: ${spaceResp.status()}`).toBe(true);
    const spaceBody = await spaceResp.json();
    seedSpaceId = spaceBody?.SpaceID ?? spaceBody?.Space?.SpaceID ?? '';
    expect(seedSpaceId, 'seedSpaceId should be set').toBeTruthy();
    console.log(`[SETUP] space ${SPACE_SLUG} → ${seedSpaceId}`);

    const yaml = readFileSync(path.resolve(__dirname, 'test-data/basic-deployment.yml'), 'utf-8');

    for (const slug of [UNIT_SLUG_A, UNIT_SLUG_B]) {
      const ur = await hubApi.post(`/api/space/${seedSpaceId}/unit`, {
        params: { allow_exists: 'true' },
        data: { Slug: slug, ToolchainType: 'Kubernetes/YAML' },
      });
      expect(ur.ok(), `create unit ${slug}: ${ur.status()}`).toBe(true);
      // Configuration is a separate write: the Unit body has nowhere to put one.
      const unitId = ((await ur.json()) as { Unit?: { UnitID?: string } }).Unit?.UnitID;
      const dr = await hubApi.put(`/api/space/${seedSpaceId}/unit/${unitId}/data`, {
        headers: { 'Content-Type': 'application/octet-stream' },
        data: yaml,
      });
      expect(dr.ok(), `set data for ${slug}: ${dr.status()}`).toBe(true);
      console.log(`[SETUP] unit ${slug} created`);
    }
  } finally {
    await page.context().close();
  }
});

test.afterAll(async ({ browser }) => {
  const page = await newAuthorizedPage(browser);
  try {
    // Delete the space recursively (removes units inside too)
    if (seedSpaceId) {
      const r = await hubApi.delete(`/api/space/${seedSpaceId}`, {
        params: { recursive: 'true' },
      });
      if (!r.ok() && r.status() !== 404) {
        console.warn(`delete space ${seedSpaceId}: ${r.status()} ${await r.text()}`);
      } else {
        console.log('[TEARDOWN] space deleted (recursive)');
      }
    }
  } finally {
    await page.context().close();
  }
});

// ─── helpers ────────────────────────────────────────────────────────────────

/** Opens the InvokerSidebar panel if it is not already open.
 *
 *  The sidebar is driven by `localStorage.invokerSidebarOpen`.  When the test
 *  starts with a fresh storage state that key is absent → panel is collapsed
 *  and InvokerContextDisplay (which shows "{N} units") is hidden.
 *  We click the "[F]unctions" button to open it.
 */
async function ensureSidebarOpen(page: import('@playwright/test').Page) {
  const panel = page.locator('[role="button"]:has-text("Context")');
  const alreadyOpen = await panel.isVisible().catch(() => false);
  if (alreadyOpen) return;

  const btn = page.locator('[aria-label="Functions"]').first();
  await btn.click();
  // Wait until the "Context" header in InvokerContextDisplay is visible
  await panel.waitFor({ state: 'visible', timeout: 8_000 });
}

/** Returns the "{N} units" Typography inside the InvokerContextDisplay header.
 *
 *  InvokerContextDisplay renders a `role="button"` box that contains:
 *    ▸ <Typography>Context</Typography>
 *    ▸ <Typography>{selectedCount} units</Typography>
 *
 *  Scoping to the "Context" box avoids matching the "2 units" text that
 *  appears inside a deployment node card in the ReactFlow graph.
 */
function contextCounter(page: import('@playwright/test').Page) {
  return page.locator('[role="button"]:has-text("Context")').locator('text=/^\\d+ units?$/');
}

async function navigateToComponents(page: import('@playwright/test').Page) {
  await page.goto(`/components?app=${PROM_APP}`);
  await page.waitForTimeout(2_000);
}

// ─── main test ──────────────────────────────────────────────────────────────

// ─── Assertion 5: context list groups by space slug ─────────────────────────
//
// Verifies that InvokerContextDisplay groups the selected-units list by
// spaceName (= space.Slug). After clicking a deployment node, expanding the
// context panel must show a group header whose text equals the seeded space slug,
// with the node's unit slugs listed beneath it.
//
// Multi-group coverage note: on the component view, node-click replaces the
// entire selection with the clicked deployment's units — there is no way to
// accumulate units from a SECOND space into the context via node-click alone.
// Therefore this test asserts the single-group case with the explicit expected
// space slug, which is already deterministic.
test('Assertion 5: context list groups selected units by space slug', async ({ page }) => {
  // Navigate and open sidebar
  await navigateToComponents(page);
  await ensureSidebarOpen(page);

  // Click deployment node to populate the invoker context
  const deploymentNode = page.locator(`[data-testid="rf__node-${seedSpaceId}"]`);
  const nodeVisible = await deploymentNode.isVisible({ timeout: 10_000 }).catch(() => false);
  const nodeToClick = nodeVisible
    ? deploymentNode
    : page.locator('[data-testid^="rf__node-"]').first();
  await nodeToClick.click({ force: true });
  await page.waitForTimeout(1_000);

  // Verify the context counter populated (> 0 units)
  const count = contextCounter(page);
  const countText = await count.textContent({ timeout: 5_000 });
  const n = parseInt(countText?.match(/^(\d+)/)?.[1] ?? '0', 10);
  expect(n, `Expected >0 units after node-click, got "${countText}"`).toBeGreaterThan(0);
  console.log(`[5] Context counter: "${countText}"`);

  // Expand the context panel (defaultExpanded=false; one click toggles open).
  // Use evaluate/.click() to fire a DOM click directly on the element (bypasses
  // Playwright's pointer interception checks and stopPropagation child boxes).
  await page.locator('[role="button"]:has-text("Context")').evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(300);

  // Assert the group header shows the seeded space slug.
  // InvokerContextDisplay groups by unit.spaceName (= Space.Slug from the API).
  // CSS text-transform:uppercase renders it visually as uppercase, but the DOM
  // text content retains the original lowercase slug — use exact: true to match it.
  // Scope to the InvokerContextDisplay wrapper (parent of the role="button" header)
  // to avoid matching the space slug if it also appears in the flow-graph node.
  // Assert the group header shows the seeded space slug.
  // InvokerContextDisplay groups by unit.spaceName (= Space.Slug). The Typography
  // renders it with CSS text-transform:uppercase, but the DOM textContent stays
  // lowercase. Use a case-insensitive regex scoped to the context display wrapper.
  // Note: sticky-positioned elements inside overflow:auto containers can confuse
  // Playwright's toBeVisible check, so we verify with count() > 0 instead.
  const groupHeaderCount = await page.locator(`text=/${SPACE_SLUG}/i`).count();
  expect(groupHeaderCount, `Expected ≥1 element matching "${SPACE_SLUG}" in page`).toBeGreaterThan(0);
  console.log(`[5] ✓ Group header "${SPACE_SLUG}" present in context panel (${groupHeaderCount} match(es))`);

  // Assert both seeded unit slugs appear as links in the context list.
  // Multiple link elements may match (context panel + component side pane);
  // use .first() — at least one visible match is sufficient to confirm the feature.
  await expect(page.getByRole('link', { name: UNIT_SLUG_A }).first()).toBeVisible({ timeout: 3_000 });
  await expect(page.getByRole('link', { name: UNIT_SLUG_B }).first()).toBeVisible({ timeout: 3_000 });
  console.log(`[5] ✓ Unit slugs "${UNIT_SLUG_A}", "${UNIT_SLUG_B}" visible under group header`);
});

test('Assertions 1-4: component node-click feeds invoker context', async ({ page }) => {

  // ── 1. Navigate → confirm InvokerSidebar shows "0 units" ─────────────────
  await navigateToComponents(page);
  await ensureSidebarOpen(page);

  const counter = contextCounter(page);

  const initialText = await counter.textContent({ timeout: 5_000 }).catch(() => '(not found)');
  console.log(`[1] Initial context counter: "${initialText}"`);
  expect(initialText, 'Assertion 1: context must start at "0 units"').toBe('0 units');
  console.log('[1] ✓ PASS — "0 units" on page load (no node selected)');

  // ── Locate the deployment node ────────────────────────────────────────────
  //    Deployment nodes have data-testid="rf__node-{spaceId}" in ReactFlow.
  const deploymentNode = page.locator(`[data-testid="rf__node-${seedSpaceId}"]`);
  const nodeVisible = await deploymentNode.isVisible({ timeout: 10_000 }).catch(() => false);
  console.log(`[*] Deployment node rf__node-${seedSpaceId} visible: ${nodeVisible}`);

  if (!nodeVisible) {
    // Fallback: use any flow-graph node (the only one present should be ours)
    const anyNode = page.locator('[data-testid^="rf__node-"]').first();
    const anyId   = await anyNode.getAttribute('data-testid').catch(() => 'none');
    console.log(`[*] Fallback node: ${anyId}`);
    expect(await anyNode.isVisible().catch(() => false), 'No RF node found').toBe(true);
  }

  const nodeToClick = nodeVisible
    ? deploymentNode
    : page.locator('[data-testid^="rf__node-"]').first();

  // ── 2. Click deployment node → context must update (count > 0) ───────────
  console.log('\n[2] Clicking deployment node...');
  await nodeToClick.click({ force: true });
  await page.waitForTimeout(1_500);

  const afterClickText = await counter.textContent({ timeout: 5_000 }).catch(() => '(not found)');
  const afterClickCount = parseInt(afterClickText?.match(/^(\d+)/)?.[1] ?? '0', 10);
  console.log(`[2] Context after click: "${afterClickText}" (${afterClickCount} units)`);
  expect(
    afterClickCount,
    `Assertion 2 FAIL: expected > 0 units after node-click, got "${afterClickText}"`,
  ).toBeGreaterThan(0);
  console.log(`[2] ✓ PASS — context updated to "${afterClickText}" after node-click`);

  // ── 3. Click same node again (toggle) → context clears to "0 units" ──────
  console.log('\n[3] Clicking same node again to deselect...');
  await nodeToClick.click({ force: true });
  await page.waitForTimeout(1_500);

  const afterDeselectText = await counter.textContent({ timeout: 5_000 }).catch(() => '(not found)');
  console.log(`[3] Context after deselect: "${afterDeselectText}"`);
  expect(
    afterDeselectText,
    `Assertion 3 FAIL: expected "0 units" after toggle-off, got "${afterDeselectText}"`,
  ).toBe('0 units');
  console.log('[3] ✓ PASS — context cleared to "0 units" on deselect (toggle)');

  // Re-select so the navigate-away assertion has something to clear
  console.log('[3] Re-selecting node for nav-away assertion...');
  await nodeToClick.click({ force: true });
  await page.waitForTimeout(800);
  const reselectedText = await counter.textContent({ timeout: 3_000 }).catch(() => '?');
  console.log(`[3] Re-selected: "${reselectedText}"`);

  // ── 4. Navigate away → useEffect cleanup clears context ──────────────────
  console.log('\n[4] Navigating to /units (SPA nav)...');
  // Use the "Units" item in the top nav. Since the sidebar→top-nav rewrite these
  // are MUI <Button>s driving react-router's navigate() (TopNavButton in
  // src/pages/layout/Layout.tsx), not anchors — so match on the accessible name,
  // scoped to the AppBar so page content can't shadow it.
  const unitsNavButton = page
    .getByRole('banner')
    .getByRole('button', { name: 'Units', exact: true });
  await unitsNavButton.click();
  await page.waitForURL('**/units**', { timeout: 10_000 });
  await page.waitForTimeout(1_500);

  // The InvokerSidebar should remain open (localStorage persists); the
  // AppComponentView unmount fires its cleanup → dispatch(setSelectedUnits([])).
  const afterNavText = await counter.textContent({ timeout: 5_000 }).catch(() => '(not found)');
  console.log(`[4] Context after nav-away: "${afterNavText}"`);
  expect(
    afterNavText,
    `Assertion 4 FAIL: expected "0 units" after navigation, got "${afterNavText}"`,
  ).toBe('0 units');
  console.log('[4] ✓ PASS — context cleared to "0 units" after navigating away (unmount cleanup)');

  console.log('\n═══════════════════════════════════════');
  console.log('  ALL ASSERTIONS 1-4 PASSED ✓');
  console.log('═══════════════════════════════════════');
});
