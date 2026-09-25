// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// E2E tests for the context-add (Add-unit popover) grouping behavior (tasks #13–15, #31).
//
// Behavior A (group-node click populates invoker context on /unit-dashboard/) was
// a unit-dashboard node-click feature that was reverted; those tests have been removed.
//
// Remaining behaviors:
//
//   B) Add-unit Autocomplete: the popover groups by the dashboard GroupBy dimension
//      and shows ≥2 DISTINCT group headers (not all "Ungrouped").
//      Two app-label groups are seeded to guarantee deterministic ≥2 groups.
//
//   C) Group header checkbox bulk-adds ALL units in the group to the invoker
//      context and the popover STAYS OPEN during the toggle (Requirement C).
//
//   D) GroupBy switching changes the dropdown grouping dimension.
//      Seeds 2 spaces × 2 distinct app labels so BOTH App and Space modes
//      produce explicit, named group headers without relying on ambient data.
//      Self-contained beforeAll/afterAll — does not depend on CI org state.
//
// Seed (shared, for B + C):
//   ch-e2e-flow-unit-a   app=ch-e2e-testapp      } one App group
//   ch-e2e-flow-unit-b   app=ch-e2e-testapp      }
//   ch-e2e-flow-unit-c   app=ch-e2e-testapp-2      separate App group
//
// Seed (Optional D, separate):
//   space e2e-optd-space-a + unit (app=e2e-optd-app-a)
//   space e2e-optd-space-b + unit (app=e2e-optd-app-b)

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Shared seed labels (for B + C)
const APP_LABEL   = 'ch-e2e-testapp';
const APP_LABEL_2 = 'ch-e2e-testapp-2';
const SLUG_A = 'ch-e2e-flow-unit-a';
const SLUG_B = 'ch-e2e-flow-unit-b';
const SLUG_C = 'ch-e2e-flow-unit-c';

// Optional D seed labels (distinct slugs/spaces to avoid collision)
const OPTD_SPACE_A    = 'e2e-optd-space-a';
const OPTD_SPACE_B    = 'e2e-optd-space-b';
const OPTD_APP_A      = 'e2e-optd-app-a';
const OPTD_APP_B      = 'e2e-optd-app-b';
const OPTD_UNIT_SLUG_A = 'e2e-optd-unit-a';
const OPTD_UNIT_SLUG_B = 'e2e-optd-unit-b';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getFirstSpaceId(): Promise<string> {
  const resp = await hubApi.get('/api/space');
  if (!resp.ok()) throw new Error(`/api/space failed: ${resp.status()}`);
  const spaces = await resp.json();
  if (!spaces?.length) throw new Error('No spaces found in the system');
  return spaces[0].Space.SpaceID as string;
}

async function createTestUnit(
  page: import('@playwright/test').Page,
  spaceId: string,
  slug: string,
  appLabel: string,
): Promise<string> {
  const yamlData = readFileSync(path.resolve(__dirname, 'test-data/basic-deployment.yml'), 'utf-8');
  const resp = await hubApi.post(`/api/space/${spaceId}/unit`, {
    params: { allow_exists: 'true' },
    data: { Slug: slug, ToolchainType: 'Kubernetes/YAML', Labels: { app: appLabel } },
  });
  if (!resp.ok()) throw new Error(`Failed to create ${slug}: ${resp.status()} ${await resp.text()}`);
  const body = await resp.json();
  const unitId = body.Unit?.UnitID as string;
  // Configuration is a separate write: the Unit body has nowhere to put one.
  const dataResp = await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, {
    headers: { 'Content-Type': 'application/octet-stream' },
    data: yamlData,
  });
  if (!dataResp.ok())
    throw new Error(`Failed to set data for ${slug}: ${dataResp.status()} ${await dataResp.text()}`);
  return unitId;
}

async function deleteUnit(page: import('@playwright/test').Page, unitId: string): Promise<void> {
  const resp = await hubApi.delete(`/api/unit/${unitId}`);
  if (!resp.ok() && resp.status() !== 404) console.warn(`Failed to delete unit ${unitId}: ${resp.status()}`);
}

/** Create a space and return its ID. */
async function createSpace(
  page: import('@playwright/test').Page,
  slug: string,
): Promise<string> {
  const resp = await hubApi.post('/api/space', {
    params: { allow_exists: 'true' },
    data: { Slug: slug, DisplayName: slug },
  });
  if (!resp.ok()) throw new Error(`Failed to create space ${slug}: ${resp.status()} ${await resp.text()}`);
  const body = await resp.json();
  return (body?.SpaceID ?? body?.Space?.SpaceID) as string;
}

/** Delete a space (recursive to remove units). */
async function deleteSpace(page: import('@playwright/test').Page, spaceId: string): Promise<void> {
  const resp = await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } });
  if (!resp.ok() && resp.status() !== 404) console.warn(`Failed to delete space ${spaceId}: ${resp.status()}`);
}

// SPA-navigate to /units from any page so Redux state (groupBy, selectedUnits) is preserved.
// The top nav renders each destination as an MUI <Button> that calls react-router's
// navigate() (see TopNavButton in src/pages/layout/Layout.tsx) — there is no <a href>
// to click, so target the nav button by its accessible name, scoped to the AppBar.
async function spaNavigateToUnits(page: import('@playwright/test').Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Units', exact: true }).click();
  await page.waitForURL('**/units**', { timeout: 10_000 });
  await page.mouse.move(400, 300);
  await page.waitForTimeout(600);
}

/**
 * Open the InvokerSidebar on /units and open the Add-unit popover.
 *
 * IMPORTANT: The "Functions" button TOGGLES the sidebar (open ↔ closed).
 * Calling this helper when the sidebar is already open would close it and
 * leave "Add unit" unreachable.
 *
 * We check localStorage (not isVisible) to detect sidebar state.
 * The InvokerSidebar always renders its panel content in the DOM and collapses
 * via `width: 0; overflow: hidden`, so isVisible() returns true regardless.
 *
 * Returns the search input locator.
 */
async function openAddUnitPopover(page: import('@playwright/test').Page) {
  // The "Functions" button TOGGLES the sidebar (open ↔ closed).
  // We detect sidebar state via localStorage rather than isVisible().
  // The InvokerSidebar always renders its panel content in the DOM (it uses
  // `width: 0; overflow: hidden` to collapse, not conditional rendering), so
  // `isVisible()` on the "Add unit" button returns true in BOTH states because
  // the button's explicit MUI size gives it a non-zero bounding box even when
  // clipped. localStorage is the authoritative source.
  const isSidebarOpen = await page.evaluate(
    () => window.localStorage.getItem('invokerSidebarOpen') === 'true',
  );
  if (!isSidebarOpen) {
    // Exact name: the sidebar also contains a "Saved Functions" accordion header,
    // which a /Functions/i regex matches too (strict-mode violation).
    const functionsBtn = page.getByRole('button', { name: 'Functions', exact: true });
    await expect(functionsBtn).toBeVisible({ timeout: 8_000 });
    await functionsBtn.click({ force: true });
    // Allow the CSS width transition (MUI enteringScreen ≈ 225 ms) to complete
    // before trying to click a button inside the now-expanding panel.
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  await expect(page.getByText('Add a unit')).toBeVisible({ timeout: 5_000 });
  const searchInput = page.getByPlaceholder('Search units...');
  await expect(searchInput).toBeVisible({ timeout: 5_000 });
  // Allow units to finish loading (lazy fetch starts when popover opens)
  await page.waitForTimeout(2_000);
  await searchInput.click();
  await expect(page.locator('[role="listbox"]')).toBeVisible({ timeout: 10_000 });
  return searchInput;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Context-add grouping: Add-unit popover follows dashboard GroupBy', () => {
  test.use({ storageState: 'authentication.json' });

  // ── Shared seed for Behavior B + C ──────────────────────────────────────
  let spaceId: string;
  let unitIdA: string;
  let unitIdB: string;
  let unitIdC: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    spaceId = await getFirstSpaceId();
    unitIdA = await createTestUnit(page, spaceId, SLUG_A, APP_LABEL);
    unitIdB = await createTestUnit(page, spaceId, SLUG_B, APP_LABEL);
    unitIdC = await createTestUnit(page, spaceId, SLUG_C, APP_LABEL_2);
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    if (unitIdA) await deleteUnit(page, unitIdA);
    if (unitIdB) await deleteUnit(page, unitIdB);
    if (unitIdC) await deleteUnit(page, unitIdC);
    await context.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PREFLIGHT: confirm :5173 serves THIS worktree's code
  // ─────────────────────────────────────────────────────────────────────────
  test('PREFLIGHT — worktree code is live: GroupBy selector present on dashboard', async ({ page }) => {
    await page.goto('/unit-dashboard');
    await expect(page.locator('[aria-label^="Grouping:"]')).toBeVisible({ timeout: 15_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BEHAVIOR B: Add-unit popover shows ≥2 DISTINCT group headers
  // ─────────────────────────────────────────────────────────────────────────
  test('Behavior B — Add-unit popover shows ≥2 distinct group headers (App groupBy)', async ({
    page,
  }) => {
    await page.goto('/unit-dashboard');
    await page.locator('[aria-label^="Grouping:"]').click();
    await page.getByRole('menuitem', { name: /^App$/ }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15_000 });
    await spaNavigateToUnits(page);
    await openAddUnitPopover(page);
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });

    const groupHeaders = page.locator('[role="listbox"] .MuiListSubheader-root');
    await expect(groupHeaders.first()).toBeVisible({ timeout: 5_000 });
    const headerCount = await groupHeaders.count();
    expect(headerCount, `Expected ≥2 group headers but got ${headerCount}`).toBeGreaterThanOrEqual(2);

    const allHeaderTexts = await groupHeaders.allTextContents();
    const hasLabel1 = allHeaderTexts.some((t) => t.includes(APP_LABEL) && !t.includes(APP_LABEL_2));
    const hasLabel2 = allHeaderTexts.some((t) => t.includes(APP_LABEL_2));
    expect(hasLabel1, `"${APP_LABEL}" group header missing. Headers: ${JSON.stringify(allHeaderTexts)}`).toBe(true);
    expect(hasLabel2, `"${APP_LABEL_2}" group header missing. Headers: ${JSON.stringify(allHeaderTexts)}`).toBe(true);

    const cleanedTexts = allHeaderTexts.map((t) => t.replace(/\d+\/\d+/, '').trim());
    const allUngrouped = cleanedTexts.every((t) => t === 'Ungrouped');
    expect(allUngrouped, `All headers are "Ungrouped" — App groupBy not applied`).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BEHAVIOR C: Group header checkbox bulk-adds ALL units in that group
  // ─────────────────────────────────────────────────────────────────────────
  test('Behavior C — group header checkbox bulk-adds units to invoker context; popover stays open', async ({
    page,
  }) => {
    await page.goto('/unit-dashboard');
    await page.locator('[aria-label^="Grouping:"]').click();
    await page.getByRole('menuitem', { name: /^App$/ }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15_000 });
    await spaNavigateToUnits(page);
    await openAddUnitPopover(page);
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });

    const groupHeaders = page.locator('[role="listbox"] .MuiListSubheader-root');
    const testappHeader = groupHeaders
      .filter({ hasText: APP_LABEL })
      .filter({ hasNotText: APP_LABEL_2 })
      .first();
    await expect(testappHeader).toBeVisible({ timeout: 5_000 });
    await expect(testappHeader).toContainText('0/2', { timeout: 5_000 });

    await testappHeader.click();

    await expect(page.getByText('2 units')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder('Search units...')).toBeVisible();

    await page.getByPlaceholder('Search units...').click();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[role="listbox"]')).toBeVisible({ timeout: 5_000 });
    await expect(testappHeader).not.toBeVisible({ timeout: 3_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OPTIONAL D: GroupBy switching changes the dropdown grouping dimension.
  //
  // Self-seeded: 2 dedicated spaces (e2e-optd-space-a/-b), each with one unit
  // carrying a unique app label (e2e-optd-app-a/-b).  Both App and Space
  // groupBy therefore produce deterministic, named group headers regardless of
  // the CI org's ambient state.
  //
  // Previous failure cause: openAddUnitPopover always clicked "Functions",
  // toggling the sidebar closed on the second call → "Add unit" vanished →
  // 60 s timeout × 3 retries.  That helper is now idempotent (only clicks
  // "Functions" when the panel is actually closed).
  // ─────────────────────────────────────────────────────────────────────────
  test.describe('Optional D — GroupBy selector switches dropdown grouping dimension', () => {
    let optdSpaceIdA = '';
    let optdSpaceIdB = '';

    test.beforeAll(async ({ browser }) => {
      const context = await newAuthorizedContext(browser);
      const page = await context.newPage();
      optdSpaceIdA = await createSpace(page, OPTD_SPACE_A);
      await createTestUnit(page, optdSpaceIdA, OPTD_UNIT_SLUG_A, OPTD_APP_A);
      optdSpaceIdB = await createSpace(page, OPTD_SPACE_B);
      await createTestUnit(page, optdSpaceIdB, OPTD_UNIT_SLUG_B, OPTD_APP_B);
      console.log(`[OPTD SETUP] space-a=${optdSpaceIdA}, space-b=${optdSpaceIdB}`);
      await context.close();
    });

    test.afterAll(async ({ browser }) => {
      const context = await newAuthorizedContext(browser);
      const page = await context.newPage();
      if (optdSpaceIdA) await deleteSpace(page, optdSpaceIdA);
      if (optdSpaceIdB) await deleteSpace(page, optdSpaceIdB);
      await context.close();
    });

    test('GroupBy App shows app-label headers; GroupBy Space shows space-slug headers', async ({ page }) => {
      // ── Part 1: App groupBy ─────────────────────────────────────────────
      await page.goto('/unit-dashboard');
      await page.locator('[aria-label^="Grouping:"]').click();
      await page.getByRole('menuitem', { name: /^App$/ }).click();
      await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15_000 });
      await spaNavigateToUnits(page);

      await openAddUnitPopover(page);
      await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });

      const groupHeaders = page.locator('[role="listbox"] .MuiListSubheader-root');
      await expect(groupHeaders.first()).toBeVisible({ timeout: 5_000 });
      const appHeaderTexts = await groupHeaders.allTextContents();

      // ASSERT: both seeded app-label groups are present
      const hasOptdAppA = appHeaderTexts.some((t) => t.includes(OPTD_APP_A));
      const hasOptdAppB = appHeaderTexts.some((t) => t.includes(OPTD_APP_B));
      expect(hasOptdAppA, `App groupBy: "${OPTD_APP_A}" header missing. Got: ${JSON.stringify(appHeaderTexts)}`).toBe(true);
      expect(hasOptdAppB, `App groupBy: "${OPTD_APP_B}" header missing. Got: ${JSON.stringify(appHeaderTexts)}`).toBe(true);
      console.log(`[OPTD] App mode headers: ${JSON.stringify(appHeaderTexts)}`);

      // Close "Add a unit" popover but keep the sidebar OPEN for the next call.
      // (Escape closes the MUI Popover; the sidebar panel stays visible.)
      await page.keyboard.press('Escape');

      // ── Part 2: Space groupBy ───────────────────────────────────────────
      // IMPORTANT: GroupBySelector is checkbox-based with TOGGLE semantics.
      // The Redux initial state is 'space', so after page.goto('/unit-dashboard')
      // the Space checkbox is ALREADY CHECKED. Clicking Space would DESELECT it → 'none'.
      // Fix: open the dropdown and first click App (Space → App, Space unchecked),
      // then immediately click Space (App → Space). The dropdown stays open between
      // clicks because handleToggle does NOT call handleClose.
      await page.goto('/unit-dashboard');
      await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15_000 });
      await page.locator('[aria-label^="Grouping:"]').click();
      await page.getByRole('menuitem', { name: /^App$/ }).click();   // 'space' → 'app'
      // Dropdown stays open — handleToggle never calls handleClose.
      await page.getByRole('menuitem', { name: /^Space$/ }).click(); // 'app' → 'space'
      await page.keyboard.press('Escape');                            // close the dropdown
      // Confirm 'space' is active before navigating
      await expect(page.locator('[aria-label^="Grouping:"]')).toHaveAttribute('aria-label', /Space/, { timeout: 5_000 });
      await spaNavigateToUnits(page);

      // openAddUnitPopover is idempotent — won't toggle-close an open sidebar.
      await openAddUnitPopover(page);
      await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });

      const spaceGroupHeaders = page.locator('[role="listbox"] .MuiListSubheader-root');
      // Wait for at least one header before reading all
      await expect(spaceGroupHeaders.first()).toBeVisible({ timeout: 8_000 });
      const spaceHeaderTexts = await spaceGroupHeaders.allTextContents();
      console.log(`[OPTD] Space mode headers: ${JSON.stringify(spaceHeaderTexts)}`);

      // ASSERT: both seeded space slugs appear as group headers
      const hasOptdSpaceA = spaceHeaderTexts.some((t) => t.includes(OPTD_SPACE_A));
      const hasOptdSpaceB = spaceHeaderTexts.some((t) => t.includes(OPTD_SPACE_B));
      expect(hasOptdSpaceA, `Space groupBy: "${OPTD_SPACE_A}" header missing. Got: ${JSON.stringify(spaceHeaderTexts)}`).toBe(true);
      expect(hasOptdSpaceB, `Space groupBy: "${OPTD_SPACE_B}" header missing. Got: ${JSON.stringify(spaceHeaderTexts)}`).toBe(true);

      // ASSERT: app-label headers are absent — proving the dimension changed
      const hasOptdAppAUnderSpace = spaceHeaderTexts.some((t) => t.includes(OPTD_APP_A));
      expect(
        hasOptdAppAUnderSpace,
        `Space groupBy must NOT show app-label "${OPTD_APP_A}" as a header`,
      ).toBe(false);
    });
  });
});
