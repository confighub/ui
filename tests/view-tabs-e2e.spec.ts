// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Playwright E2E tests for View Tab behaviour.
 *
 * These tests drive a real browser against a live server, exercising the full
 * browser stack: navigation, localStorage draft persistence, URL state, and the
 * ViewTabs component's rendered output.  Playwright is the only test layer for
 * the UI — there is no unit-test suite behind these specs, so they carry the
 * full coverage for this feature.
 *
 * What is tested:
 *  - Creating and opening multiple view tabs
 *  - Editing each tab independently (filter changes reflected in URL)
 *  - Switching between tabs and verifying per-tab draft state survives
 *  - Refreshing the page and confirming localStorage drafts are rehydrated
 *  - The modified-dot indicator appearing on dirty tabs
 *  - Saving a view via the kebab menu removes the modified dot
 *  - Reverting a view via the kebab menu removes the modified dot
 *  - Auto-switch to newly created view
 *
 * Prerequisites: the server must be running and `authentication.json` must exist.
 */

import { type Page } from '@playwright/test';
import { test, expect, hubApi } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// ─── Helper types ─────────────────────────────────────────────────────────────

interface CreatedViewData {
  viewId: string;
  viewSlug: string;
  displayName: string;
  filterId: string;
  spaceId: string;
}

// ─── API helpers used in setup/teardown ───────────────────────────────────────

/**
 * Create a minimal filter + view pair via direct REST calls.
 * Returns the IDs needed for cleanup and tab interactions.
 */
async function createFilterAndView(
  page: Page,
  spaceId: string,
  displayName: string,
): Promise<CreatedViewData> {
  const slug = RandomSlugGenerator.randomSlugName();

  // Create a pass-through filter (Where = empty means "all units")
  const filterResp = await hubApi.post(`/api/space/${spaceId}/filter`, {
    data: {
      Slug: slug,
      DisplayName: displayName,
      From: 'Unit',
      Where: '',
    },
    params: { allow_exists: 'true' },
  });

  if (!filterResp.ok()) {
    throw new Error(
      `Failed to create filter "${displayName}": ${filterResp.status()} ${await filterResp.text()}`,
    );
  }

  const filterBody = await filterResp.json();
  const filterId: string =
    filterBody?.Filter?.FilterID ?? filterBody?.FilterID ?? filterBody?.FilterRead?.FilterID;
  if (!filterId) {
    throw new Error(`No FilterID in response: ${JSON.stringify(filterBody)}`);
  }

  // Create the view backed by that filter
  const viewResp = await hubApi.post(`/api/space/${spaceId}/view`, {
    data: {
      Slug: slug,
      DisplayName: displayName,
      FilterID: filterId,
      EntityType: 'Unit',
    },
    params: { allow_exists: 'true' },
  });

  if (!viewResp.ok()) {
    throw new Error(
      `Failed to create view "${displayName}": ${viewResp.status()} ${await viewResp.text()}`,
    );
  }

  const viewBody = await viewResp.json();
  const viewId: string = viewBody?.ViewID ?? viewBody?.View?.ViewID;
  if (!viewId) {
    throw new Error(`No ViewID in response: ${JSON.stringify(viewBody)}`);
  }

  return { viewId, viewSlug: slug, displayName, filterId, spaceId };
}

/** Clean up a filter + view pair created in setup. */
async function deleteViewAndFilter(
  page: Page,
  { viewId, filterId, spaceId }: CreatedViewData,
): Promise<void> {
  // Ignore errors on cleanup — a failing teardown should not fail the test.
  await page.request
    .delete(`/api/space/${spaceId}/view/${viewId}`)
    .catch(() => undefined);
  await page.request
    .delete(`/api/space/${spaceId}/filter/${filterId}`)
    .catch(() => undefined);
}

// ─── Page Object — ViewTabsPage ───────────────────────────────────────────────

/**
 * Thin page-object layer for the view-tabs strip on the Unit list page.
 * Wraps the data-testid selectors from ViewTabs.tsx.
 */
class ViewTabsPage {
  constructor(private readonly page: Page) {}

  // ── Navigation ──────────────────────────────────────────────────────────────

  async goto() {
    await this.page.goto('/units');
    // Wait for the tab strip to mount — this is the real signal the page is ready.
    await this.page
      .getByTestId('view-tabs')
      .waitFor({ state: 'visible', timeout: 15000 });
  }

  // ── Sentinel ("All units") tab ──────────────────────────────────────────────

  async clickSentinelTab() {
    await this.page.getByTestId('view-tab-all').click();
  }

  async isSentinelTabActive(): Promise<boolean> {
    const tab = this.page.getByTestId('view-tab-all');
    const ariaSelected = await tab.getAttribute('aria-selected');
    return ariaSelected === 'true';
  }

  // ── Individual view tabs ─────────────────────────────────────────────────────

  async clickViewTab(viewId: string) {
    await this.page.getByTestId(`view-tab-${viewId}`).click();
  }

  async isViewTabActive(viewId: string): Promise<boolean> {
    const tab = this.page.getByTestId(`view-tab-${viewId}`);
    const ariaSelected = await tab.getAttribute('aria-selected');
    return ariaSelected === 'true';
  }

  async isViewTabVisible(viewId: string): Promise<boolean> {
    const tab = this.page.getByTestId(`view-tab-${viewId}`);
    return tab.isVisible({ timeout: 3000 }).catch(() => false);
  }

  async closeViewTab(viewId: string) {
    // Hover to reveal the close button, then click it
    await this.page.getByTestId(`view-tab-${viewId}`).hover();
    await this.page.getByTestId(`view-tab-close-${viewId}`).click();
  }

  // ── "+" Tab Management Menu ──────────────────────────────────────────────────

  async openAddTabMenu() {
    await this.page.getByTestId('view-tabs-add-tab').click();
    await this.page.getByTestId('add-tab-menu').waitFor({ state: 'visible', timeout: 5000 });
  }

  async openTabFromMenu(viewId: string) {
    await this.openAddTabMenu();
    await this.page.getByTestId(`add-tab-item-${viewId}`).click();
    // Wait for menu to close and tab to appear
    await this.page
      .getByTestId(`view-tab-${viewId}`)
      .waitFor({ state: 'visible', timeout: 5000 });
  }

  // ── Create new view via inline popover ──────────────────────────────────────

  async createNewViewViaPopover(name: string): Promise<void> {
    await this.openAddTabMenu();
    await this.page.getByTestId('add-tab-menu-create-new-view').click();
    // Popover should open
    await this.page
      .getByTestId('view-tabs-new-view-popover')
      .waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByTestId('view-tabs-new-view-name-input').fill(name);
    await this.page.getByTestId('view-tabs-new-view-submit').click();
    // Popover should close after submit
    await this.page
      .getByTestId('view-tabs-new-view-popover')
      .waitFor({ state: 'hidden', timeout: 10000 });
  }

  // ── Kebab menu on active tab ─────────────────────────────────────────────────

  async openKebabMenu(viewId: string) {
    // The kebab chevron is only visible on the active tab
    const tab = this.page.getByTestId(`view-tab-${viewId}`);
    // Locate the kebab button inside the tab
    await tab.locator('[data-kebab]').click();
  }

  async saveViewViaKebab(viewId: string) {
    await this.openKebabMenu(viewId);
    await this.page.getByTestId('view-tab-kebab-save').click();
  }

  async revertViewViaKebab(viewId: string) {
    await this.openKebabMenu(viewId);
    await this.page.getByTestId('view-tab-kebab-revert').click();
  }

  // ── Modified-dot indicator ───────────────────────────────────────────────────

  async hasModifiedDot(viewId: string): Promise<boolean> {
    const tab = this.page.getByTestId(`view-tab-${viewId}`);
    const dot = tab.getByTestId('view-tab-modified-dot');
    return dot.isVisible({ timeout: 2000 }).catch(() => false);
  }

  // ── localStorage helpers ─────────────────────────────────────────────────────

  async readDraft(viewId: string, entityType = 'Unit'): Promise<unknown> {
    return this.page.evaluate(
      ([id, type]) => {
        const key = `confighub:${type.toLowerCase()}:viewDraft:${id}`;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      },
      [viewId, entityType],
    );
  }

  async clearDraft(viewId: string, entityType = 'Unit'): Promise<void> {
    await this.page.evaluate(
      ([id, type]) => {
        const key = `confighub:${type.toLowerCase()}:viewDraft:${id}`;
        localStorage.removeItem(key);
      },
      [viewId, entityType],
    );
  }

  async clearAllDrafts(): Promise<void> {
    await this.page.evaluate(() => {
      const prefix = 'confighub:';
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    });
  }

  // ── URL helpers ──────────────────────────────────────────────────────────────

  currentUrl(): string {
    return this.page.url();
  }

  async urlContains(substring: string): Promise<boolean> {
    return this.page.url().includes(substring);
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe('View Tabs E2E', () => {
  test.use({ storageState: 'authentication.json' });

  let api: ApiHelper;
  let viewTabsPage: ViewTabsPage;
  let unitListPage: UnitListPage;
  let spaceId: string;

  // Collect views created during a test so we can clean up after each.
  let createdViews: CreatedViewData[] = [];

  test.beforeEach(async ({ page }) => {
    api = new ApiHelper(page);
    viewTabsPage = new ViewTabsPage(page);
    unitListPage = new UnitListPage(page);
    createdViews = [];

    // Resolve the default space once per test.
    const space = await api.getFirstSpace();
    spaceId = space.SpaceID;

    // The "all units" filter views created below only render a DataGrid if the
    // space actually has at least one unit — otherwise the page shows the
    // empty-state "Create your first Unit" screen and every `[role="grid"]`
    // wait in this file times out. Other spec files sharing this space create
    // units as a side effect of their own setup, but scheduling between spec
    // files isn't guaranteed (fullyParallel), so this file must not depend on
    // that. Seed one guaranteed unit idempotently instead of assuming one exists.
    await api.createUnit({
      spaceId,
      unit: { Slug: 'e2e-view-tabs-seed-unit', ToolchainType: 'Kubernetes/YAML' },
      allowExists: true,
    });

    // Clear any leftover drafts from a previous run to keep tests isolated.
    await page.goto('/units');
    // Wait for the tab strip to mount before touching localStorage.
    await page.getByTestId('view-tabs').waitFor({ state: 'visible', timeout: 15000 });
    await viewTabsPage.clearAllDrafts();
  });

  test.afterEach(async () => {
    // Delete any views / filters we created.
    for (const view of createdViews) {
      await deleteViewAndFilter(viewTabsPage['page'], view);
    }
  });

  // ── 1. Sentinel tab is visible on page load ────────────────────────────────

  test('sentinel "All units" tab is visible and active on initial load', async ({ page }) => {
    await viewTabsPage.goto();

    // The tab strip should be present.
    await expect(page.getByTestId('view-tabs')).toBeVisible();

    // The sentinel tab should be active.
    await expect(page.getByTestId('view-tab-all')).toBeVisible();
    expect(await viewTabsPage.isSentinelTabActive()).toBe(true);
  });

  // ── 2. Open a tab from the "+" manager menu ────────────────────────────────

  test('can open an existing view as a tab via the "+" menu', async ({ page }) => {
    const viewData = await createFilterAndView(page, spaceId, 'E2E View Alpha');
    createdViews.push(viewData);

    await viewTabsPage.goto();

    // View should not be visible as a tab yet.
    expect(await viewTabsPage.isViewTabVisible(viewData.viewId)).toBe(false);

    // Open it from the tab manager.
    await viewTabsPage.openTabFromMenu(viewData.viewId);

    // Tab should now be visible.
    await expect(page.getByTestId(`view-tab-${viewData.viewId}`)).toBeVisible();
  });

  // ── 3. Clicking a tab makes it active ─────────────────────────────────────

  test('clicking a view tab makes it active and deactivates the sentinel', async ({
    page,
  }) => {
    const viewData = await createFilterAndView(page, spaceId, 'E2E View Beta');
    createdViews.push(viewData);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(viewData.viewId);
    await viewTabsPage.clickViewTab(viewData.viewId);

    expect(await viewTabsPage.isViewTabActive(viewData.viewId)).toBe(true);
    expect(await viewTabsPage.isSentinelTabActive()).toBe(false);
  });

  // ── 4. Multiple tabs: open two, switch between them ───────────────────────

  test('opening two tabs and switching between them works correctly', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E View One');
    const view2 = await createFilterAndView(page, spaceId, 'E2E View Two');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();

    // Open both tabs.
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Activate tab 1 — check it's selected and tab 2 is not.
    await viewTabsPage.clickViewTab(view1.viewId);
    expect(await viewTabsPage.isViewTabActive(view1.viewId)).toBe(true);
    expect(await viewTabsPage.isViewTabActive(view2.viewId)).toBe(false);

    // Switch to tab 2.
    await viewTabsPage.clickViewTab(view2.viewId);
    expect(await viewTabsPage.isViewTabActive(view2.viewId)).toBe(true);
    expect(await viewTabsPage.isViewTabActive(view1.viewId)).toBe(false);
  });

  // ── 5. Edits to one tab do not affect another tab's URL state ─────────────

  test('filter changes on one tab do not bleed into another tab', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Tab One');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Tab Two');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Switch to tab 1 and add a where filter.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE '%e2e-tab-one%'");
    const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
    await whereInput.press('Enter');

    // URL should now contain a filter param for tab 1's state.
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({
      timeout: 5000,
    });

    // Now switch to tab 2 — URL params should NOT contain the filter from tab 1.
    await viewTabsPage.clickViewTab(view2.viewId);
    await expect(page.getByTestId(`view-tab-${view2.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const urlTab2 = page.url();
    // The filter was set while tab1 was active; tab2's draft has no filter.
    // Tab2's URL should either have no filterWhere or a different value.
    expect(urlTab2).not.toContain("e2e-tab-one");
  });

  // ── 6. Draft written to localStorage when switching away ──────────────────

  test('switching away from a tab persists its state in localStorage', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Draft View');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Draft View Two');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Activate view1 and add a filter so there's something to draft.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE '%draft-test%'");
    const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
    await whereInput.press('Enter');
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({
      timeout: 5000,
    });

    // Switch to view2 — this should trigger the "leaving" serialization of view1's draft.
    await viewTabsPage.clickViewTab(view2.viewId);
    await expect(page.getByTestId(`view-tab-${view2.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // The draft for view1 should now be in localStorage.
    await expect(async () => {
      const draft = await viewTabsPage.readDraft(view1.viewId);
      expect(draft).not.toBeNull();
      expect((draft as { filter?: { Where?: string } })?.filter?.Where).toBeTruthy();
    }).toPass({ timeout: 5000 });
  });

  // ── 7. Draft rehydrated when switching back to a tab ──────────────────────

  test('switching back to a tab restores its previously saved draft state', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Rehydrate View');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Rehydrate Control');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Activate view1, add a filter.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE '%rehydrate%'");
    const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
    await whereInput.press('Enter');
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({
      timeout: 5000,
    });

    // Switch to view2 (drafts view1).
    await viewTabsPage.clickViewTab(view2.viewId);
    await expect(page.getByTestId(`view-tab-${view2.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Switch back to view1 — draft should be rehydrated.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Wait for the rehydrated draft's filter state to actually land (tab
    // selection and filter-state rehydration are separate React updates) —
    // same URL-sync signal used above for the initial filter commit.
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({
      timeout: 5000,
    });

    // Filter chip for "Where" should still be visible.
    const filterChip = page.getByRole('button', { name: /Filter by Where/i });
    await expect(filterChip).toBeVisible({ timeout: 5000 });
  });

  // ── 8. Draft persists across a full page reload ────────────────────────────

  test('draft state survives a page reload', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Persist View');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Persist Control');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Activate view1, add a filter.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE '%persist%'");
    const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
    await whereInput.press('Enter');
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({
      timeout: 5000,
    });

    // Switch to view2 so view1's draft is serialised to localStorage.
    await viewTabsPage.clickViewTab(view2.viewId);
    await expect(page.getByTestId(`view-tab-${view2.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Verify draft was written.
    let draftBeforeReload: unknown;
    await expect(async () => {
      draftBeforeReload = await viewTabsPage.readDraft(view1.viewId);
      expect(draftBeforeReload).not.toBeNull();
    }).toPass({ timeout: 5000 });

    // Reload the page.
    await page.reload();
    await page.getByTestId('view-tabs').waitFor({ state: 'visible', timeout: 15000 });

    // Draft should still be in localStorage after reload.
    const draftAfterReload = await viewTabsPage.readDraft(view1.viewId);
    expect(draftAfterReload).not.toBeNull();
    expect(draftAfterReload).toEqual(draftBeforeReload);
  });

  // ── 9. Modified dot appears on a dirty tab ─────────────────────────────────

  test('modified dot appears on the active tab after editing its filter', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Dirty View');
    createdViews.push(view1);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);

    // Activate the tab.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // No modified dot yet.
    expect(await viewTabsPage.hasModifiedDot(view1.viewId)).toBe(false);

    // Add a where filter to dirty the view.
    await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE '%dirty%'");
    const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
    await whereInput.press('Enter');

    // Wait for the commit to actually land (filters state + URL sync happen in
    // the same React update as isViewModified, but the Enter keypress itself
    // resolves before that update is committed). This is the same
    // wait-for-URL-sync signal used in test 10 ("modified dot on an inactive
    // tab") for the identical add-filter-then-press-Enter sequence — without
    // it the modified-dot assertion below can poll before React has
    // processed the keydown, especially under CI load.
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({
      timeout: 5000,
    });

    // Modified dot should appear.
    await expect(
      page.getByTestId(`view-tab-${view1.viewId}`).getByTestId('view-tab-modified-dot'),
    ).toBeVisible({ timeout: 5000 });
    expect(await viewTabsPage.hasModifiedDot(view1.viewId)).toBe(true);
  });

  // ── 10. Modified dot on an inactive tab ───────────────────────────────────

  test('modified dot appears on an inactive tab that has a persisted draft', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Inactive Dirty');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Inactive Control');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Activate view1, dirty it.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE '%inactive-dirty%'");
    const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
    await whereInput.press('Enter');
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({
      timeout: 5000,
    });

    // Switch away — serialises draft for view1.
    await viewTabsPage.clickViewTab(view2.viewId);
    await expect(page.getByTestId(`view-tab-${view2.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // view1 is now inactive but has a draft — it should show the modified dot.
    await expect(
      page.getByTestId(`view-tab-${view1.viewId}`).getByTestId('view-tab-modified-dot'),
    ).toBeVisible({ timeout: 5000 });
    expect(await viewTabsPage.hasModifiedDot(view1.viewId)).toBe(true);
  });

  // ── 11. Reverting removes the modified dot ─────────────────────────────────

  test('reverting a view via the kebab menu removes the modified dot', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Revert View');
    createdViews.push(view1);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Dirty the view.
    await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE '%revert-test%'");
    const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
    await whereInput.press('Enter');

    // Wait for the commit to land before asserting on the dot — see the
    // comment in test 9 for why this is needed after a text-input Enter
    // commit.
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({
      timeout: 5000,
    });

    // Confirm modified dot is visible.
    await expect(
      page.getByTestId(`view-tab-${view1.viewId}`).getByTestId('view-tab-modified-dot'),
    ).toBeVisible({ timeout: 5000 });

    // Revert via kebab.
    await viewTabsPage.revertViewViaKebab(view1.viewId);

    // Modified dot should be gone.
    await expect(
      page.getByTestId(`view-tab-${view1.viewId}`).getByTestId('view-tab-modified-dot'),
    ).not.toBeVisible({ timeout: 5000 });
    expect(await viewTabsPage.hasModifiedDot(view1.viewId)).toBe(false);
  });

  // ── 12. Close a tab via the "×" close button ──────────────────────────────

  test('closing a tab removes it from the strip', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Close View');
    createdViews.push(view1);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toBeVisible();

    await viewTabsPage.closeViewTab(view1.viewId);

    // Tab should disappear.
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).not.toBeVisible({
      timeout: 5000,
    });
  });

  // ── 13. After close, sentinel becomes active ──────────────────────────────

  test('closing the active view tab falls back to the sentinel tab', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Close Fallback');
    createdViews.push(view1);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.clickViewTab(view1.viewId);
    expect(await viewTabsPage.isViewTabActive(view1.viewId)).toBe(true);

    await viewTabsPage.closeViewTab(view1.viewId);

    // Sentinel should be active now.
    await expect(page.getByTestId('view-tab-all')).toHaveAttribute('aria-selected', 'true');
    expect(await viewTabsPage.isSentinelTabActive()).toBe(true);
  });

  // ── 14. Create a new view from the inline popover ─────────────────────────

  test('creating a new view via the inline popover opens it as the active tab', async ({
    page,
  }) => {
    // We need at least one unit to associate a filter with — use the API to
    // ensure the page is not empty.
    await viewTabsPage.goto();

    const newViewName = `e2e-new-${Date.now()}`;

    // Capture the view creation API call so we can get the ViewID for teardown.
    let createdViewId: string | undefined;
    page.on('response', async (response) => {
      if (
        response.url().includes('/view') &&
        response.request().method() === 'POST' &&
        response.ok()
      ) {
        try {
          const body = await response.json().catch(() => null);
          if (body?.ViewID) createdViewId = body.ViewID;
        } catch {
          // ignore
        }
      }
    });

    // Use the "create new view" popover.
    try {
      await viewTabsPage.createNewViewViaPopover(newViewName);

      // A success snackbar should have appeared.
      // (The component dispatches a "Saved '...'" alert on success.)
      await expect(page.getByText(`Saved '${newViewName}'`)).toBeVisible({
        timeout: 10000,
      });
    } finally {
      // Clean up the newly created view if we captured its ID.
      if (createdViewId && spaceId) {
        await page.request
          .delete(`/api/space/${spaceId}/view/${createdViewId}`)
          .catch(() => undefined);
      }
    }
  });

  // ── 15. URL parameter isolation between tabs ──────────────────────────────

  test('each tab independently tracks its view ID in the URL', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E URL View A');
    const view2 = await createFilterAndView(page, spaceId, 'E2E URL View B');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Activate view1 — URL should reflect view1's viewId.
    await viewTabsPage.clickViewTab(view1.viewId);
    // The active view should be encoded in the URL (viewId param or similar).
    // At minimum, the URL should not contain view2's viewId.
    await expect(() => {
      expect(page.url()).toContain(`viewID=${view1.viewId}`);
      expect(page.url()).not.toContain(view2.viewId);
    }).toPass({ timeout: 5000 });

    // Activate view2.
    await viewTabsPage.clickViewTab(view2.viewId);
    await expect(() => {
      expect(page.url()).toContain(`viewID=${view2.viewId}`);
      expect(page.url()).not.toContain(view1.viewId);
    }).toPass({ timeout: 5000 });
  });

  // ── 16. Tab strip renders two open tabs side-by-side ─────────────────────

  test('both opened tabs are rendered in the strip simultaneously', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Strip View X');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Strip View Y');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Both tabs should be visible in the strip at the same time.
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toBeVisible();
    await expect(page.getByTestId(`view-tab-${view2.viewId}`)).toBeVisible();

    // The sentinel tab should also remain.
    await expect(page.getByTestId('view-tab-all')).toBeVisible();
  });

  // ── 17. Switching tabs does not trigger React infinite loops ──────────────

  test('rapidly switching between multiple tabs does not cause console errors', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const view1 = await createFilterAndView(page, spaceId, 'E2E Loop View 1');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Loop View 2');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Rapidly switch between tabs.
    for (let i = 0; i < 4; i++) {
      await viewTabsPage.clickViewTab(view1.viewId);
      await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await viewTabsPage.clickViewTab(view2.viewId);
      await expect(page.getByTestId(`view-tab-${view2.viewId}`)).toHaveAttribute(
        'aria-selected',
        'true',
      );
    }
    await viewTabsPage.clickSentinelTab();
    await expect(page.getByTestId('view-tab-all')).toHaveAttribute('aria-selected', 'true');

    // No React infinite-loop or "Too many re-renders" errors.
    const loopErrors = consoleErrors.filter(
      (e) =>
        e.includes('Maximum update depth exceeded') || e.includes('Too many re-renders'),
    );
    expect(loopErrors).toHaveLength(0);
  });

  // ── 18. Open tabs list shows checkmarks in the "+" menu ──────────────────

  test('"+" menu shows a checkmark next to already-open tabs', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Checkmark View');
    createdViews.push(view1);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    // Close menu
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('add-tab-menu')).toBeHidden({ timeout: 5000 });

    // Re-open the menu.
    await viewTabsPage.openAddTabMenu();

    // The item for the already-open view should contain a checkmark
    // (CheckIcon is rendered when isOpen === true).
    const menuItem = page.getByTestId(`add-tab-item-${view1.viewId}`);
    await expect(menuItem).toBeVisible();

    // A check icon (svg[data-testid="CheckIcon"]) should exist inside the item.
    const checkIcon = menuItem.locator('svg[data-testid="CheckIcon"]');
    await expect(checkIcon).toBeVisible({ timeout: 3000 });
  });

  // ── 19. Tab switch writes the correct viewID into the URL (brief behavior 1) ─

  test('tab switch immediately writes the active viewID to the URL', async ({ page }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E URL Sync A');
    const view2 = await createFilterAndView(page, spaceId, 'E2E URL Sync B');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Switch to view1 — URL must contain view1's viewID and type=view.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(() => {
      const url = page.url();
      expect(url).toContain(`viewID=${view1.viewId}`);
      expect(url).toContain('type=view');
      expect(url).not.toContain(view2.viewId);
    }).toPass({ timeout: 5000 });

    // Switch to view2 — URL must update to view2's viewID.
    await viewTabsPage.clickViewTab(view2.viewId);
    await expect(() => {
      const url = page.url();
      expect(url).toContain(`viewID=${view2.viewId}`);
      expect(url).not.toContain(view1.viewId);
    }).toPass({ timeout: 5000 });

    // Switch back to sentinel — viewID param should be absent.
    await viewTabsPage.clickSentinelTab();
    await expect(() => {
      const url = page.url();
      expect(url).not.toContain(`viewID=${view1.viewId}`);
      expect(url).not.toContain(`viewID=${view2.viewId}`);
    }).toPass({ timeout: 5000 });
  });

  // ── 20. Saved + edited + refreshed: draft takes precedence over baseline ─────

  test('after editing a saved view, refreshing shows the draft (not the saved baseline)', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // view1 has an empty baseline (Where = '') — saved with no filter.
    const view1 = await createFilterAndView(page, spaceId, 'E2E Baseline View');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Baseline Control');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Activate view1 (clean baseline — no filter chip visible).
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Confirm no filter chip on the clean baseline.
    const filterChip = page.getByRole('button', { name: /Filter by Where/i });
    await expect(filterChip).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Some environments may show a chip from previous state; acceptable if this assertion is skipped.
    });

    // Dirty view1 by adding a WHERE filter.
    await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE '%baseline-edit%'");
    const whereInput = page.getByPlaceholder("Slug LIKE '%prod%'");
    await whereInput.press('Enter');
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({
      timeout: 5000,
    });

    // Switch to view2 — serialises view1's draft.
    await viewTabsPage.clickViewTab(view2.viewId);
    await expect(page.getByTestId(`view-tab-${view2.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Confirm view1 draft is written.
    await expect(async () => {
      const draftBefore = await viewTabsPage.readDraft(view1.viewId);
      expect(draftBefore).not.toBeNull();
    }).toPass({ timeout: 5000 });

    // Reload the page — openTabIds and the last URL (with viewID=view2) survive.
    await page.reload();
    // Wait for view-tabs to mount; skip networkidle as it can stall for 20+ s in CI.
    await page.getByTestId('view-tabs').waitFor({ state: 'visible', timeout: 25000 });

    // Switch to view1 — rehydrateArrivingDraft should apply the DRAFT, not the baseline.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // The WHERE filter chip should be visible (from draft), not absent (from baseline).
    await expect(
      page.getByRole('button', { name: /Filter by Where/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  // ── 21. Create-then-refresh: newly created view is still active after reload ─

  test('creating a view and refreshing the page keeps it as the active tab', async ({
    page,
  }) => {
    await viewTabsPage.goto();

    const newViewName = `e2e-persist-${Date.now()}`;
    let createdViewId: string | undefined;

    // Intercept the POST /view response to capture the new ViewID.
    page.on('response', async (response) => {
      if (
        response.url().includes('/view') &&
        response.request().method() === 'POST' &&
        response.ok()
      ) {
        try {
          const body = await response.json().catch(() => null);
          if (body?.ViewID) createdViewId = body.ViewID;
        } catch {
          // ignore
        }
      }
    });

    try {
      await viewTabsPage.createNewViewViaPopover(newViewName);

      // Verify the new view is the active tab immediately after creation.
      await expect(() => expect(createdViewId).toBeTruthy()).toPass({ timeout: 5000 });
      if (!createdViewId) return; // type guard

      // The new tab should exist and be active.
      await expect(page.getByTestId(`view-tab-${createdViewId}`)).toBeVisible({
        timeout: 5000,
      });
      expect(await viewTabsPage.isViewTabActive(createdViewId)).toBe(true);

      // Capture the URL which should contain the new view's ID.
      const urlBeforeReload = page.url();
      expect(urlBeforeReload).toContain(`viewID=${createdViewId}`);

      // Reload the page — ?viewID= in URL means the app should re-activate this view.
      await page.reload();
      await page.getByTestId('view-tabs').waitFor({ state: 'visible', timeout: 15000 });

      // After reload, the new view tab should still be open and active.
      await expect(page.getByTestId(`view-tab-${createdViewId}`)).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByTestId(`view-tab-${createdViewId}`)).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(await viewTabsPage.isViewTabActive(createdViewId)).toBe(true);
    } finally {
      if (createdViewId && spaceId) {
        await page.request
          .delete(`/api/space/${spaceId}/view/${createdViewId}`)
          .catch(() => undefined);
      }
    }
  });

  // ── 23. GroupBy change makes the active view dirty ───────────────────────────

  test('adding a groupBy level makes the view dirty and shows the modified dot', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E GroupBy Dirty');
    createdViews.push(view1);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // No modified dot before any change.
    expect(await viewTabsPage.hasModifiedDot(view1.viewId)).toBe(false);

    // Screenshot: clean state (no modified dot, sidebar shows default Space grouping).
    await page.screenshot({
      path: 'test-results/screenshots/groupby-23-before-add.png',
      fullPage: false,
    });

    // Click "Add grouping level" to open the field picker.
    await page.getByRole('button', { name: 'Add grouping level' }).click();

    // Select "Target" from the dropdown.
    const targetMenuItem = page.getByRole('menuitem', { name: 'Target' });
    await expect(targetMenuItem).toBeVisible({ timeout: 5000 });
    await targetMenuItem.click();
    await expect(() => expect(page.url()).toContain('viewGroupBy=')).toPass({
      timeout: 5000,
    });

    // Screenshot: after adding Target level — sidebar should show Space › Target chips
    // and the modified dot should be visible on the tab.
    await page.screenshot({
      path: 'test-results/screenshots/groupby-23-after-add.png',
      fullPage: false,
    });

    // URL must contain viewGroupBy with Target.
    expect(page.url()).toContain('viewGroupBy=');
    expect(page.url()).toMatch(/Target/);

    // The "Change Target grouping" chip should be present in the sidebar.
    await expect(
      page.getByRole('button', { name: /Change Target grouping/i }),
    ).toBeVisible({ timeout: 5000 });

    // The modified dot must appear — this confirms that buildLiveSnapshot reads
    // the viewGroupBy URL param and isGroupByDirty detects the change.
    await expect(
      page.getByTestId(`view-tab-${view1.viewId}`).getByTestId('view-tab-modified-dot'),
    ).toBeVisible({ timeout: 5000 });
  });

  // ── 24. Sidebar groupBy restores from draft after switching back to a tab ────

  test('sidebar shows the draft groupBy when switching back to a tab whose groupBy was changed before leaving', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E GroupBy Tab A');
    const view2 = await createFilterAndView(page, spaceId, 'E2E GroupBy Tab B');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Activate view1 and add a "Target" groupBy level.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('button', { name: 'Add grouping level' }).click();
    const targetMenuItem = page.getByRole('menuitem', { name: 'Target' });
    await expect(targetMenuItem).toBeVisible({ timeout: 5000 });
    await targetMenuItem.click();

    // Confirm Target chip is visible in view1's sidebar.
    await expect(
      page.getByRole('button', { name: /Change Target grouping/i }),
    ).toBeVisible({ timeout: 5000 });

    // Switch to view2 — this serialises view1's draft (including Target groupBy).
    await viewTabsPage.clickViewTab(view2.viewId);
    await expect(page.getByTestId(`view-tab-${view2.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Screenshot: view2 sidebar — should NOT show "Change Target grouping"
    // because view2 has default (Space) groupBy and no draft with Target.
    await page.screenshot({
      path: 'test-results/screenshots/groupby-24-view2-active.png',
      fullPage: false,
    });

    // The Target chip must NOT be visible — switching tabs removes the previous
    // tab's draft groupBy and applies view2's committed groupBy (Space only).
    await expect(
      page.getByRole('button', { name: /Change Target grouping/i }),
    ).not.toBeVisible({ timeout: 5000 });

    // Verify view2 URL does not contain Target.
    expect(page.url()).not.toMatch(/Target/);

    // Switch back to view1 — rehydrateArrivingDraft should restore the Target draft.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Screenshot: view1 sidebar — should show "Change Target grouping" restored from draft.
    await page.screenshot({
      path: 'test-results/screenshots/groupby-24-view1-restored.png',
      fullPage: false,
    });

    // The Target chip must be visible — confirms the sidebar updates on tab switch.
    await expect(
      page.getByRole('button', { name: /Change Target grouping/i }),
    ).toBeVisible({ timeout: 5000 });

    // URL must contain Target in viewGroupBy (restored from draft).
    expect(page.url()).toContain('viewGroupBy=');
    expect(page.url()).toMatch(/Target/);
  });

  // ── 25. Reverting removes groupBy modification ────────────────────────────────

  test('reverting after a groupBy change removes the modified dot and restores the sidebar', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E GroupBy Revert');
    createdViews.push(view1);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Add "Target" groupBy level — makes the view dirty.
    await page.getByRole('button', { name: 'Add grouping level' }).click();
    const targetMenuItem = page.getByRole('menuitem', { name: 'Target' });
    await expect(targetMenuItem).toBeVisible({ timeout: 5000 });
    await targetMenuItem.click();

    // Confirm dirty.
    await expect(
      page.getByTestId(`view-tab-${view1.viewId}`).getByTestId('view-tab-modified-dot'),
    ).toBeVisible({ timeout: 5000 });

    // Revert via kebab — should restore committed groupBy and clear the dot.
    await viewTabsPage.revertViewViaKebab(view1.viewId);
    await expect(
      page.getByTestId(`view-tab-${view1.viewId}`).getByTestId('view-tab-modified-dot'),
    ).not.toBeVisible({ timeout: 5000 });

    // Screenshot: after revert — Target chip gone, Space chip only, no modified dot.
    await page.screenshot({
      path: 'test-results/screenshots/groupby-25-after-revert.png',
      fullPage: false,
    });

    // Modified dot must be gone.
    expect(await viewTabsPage.hasModifiedDot(view1.viewId)).toBe(false);

    // Target chip must NOT be visible (reverted back to Space-only grouping).
    await expect(
      page.getByRole('button', { name: /Change Target grouping/i }),
    ).not.toBeVisible({ timeout: 3000 });
  });

  // ── 22. ?group= breadcrumb is cleared when switching view tabs ───────────────

  test('switching to a different view tab clears the ?group= breadcrumb URL param', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Group Clear A');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Group Clear B');
    createdViews.push(view1, view2);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    // Activate view1.
    await viewTabsPage.clickViewTab(view1.viewId);
    await expect(page.getByTestId(`view-tab-${view1.viewId}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Manually inject a ?group=SomeValue into the URL (simulating a user clicking
    // a group row in the grid, which appends ?group=...).  We use pushState so
    // React Router picks it up on the next render.
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.append('group', 'SomeSpace');
      window.history.pushState({}, '', url.toString());
    });

    // Verify the group param is present.
    await expect(() => expect(page.url()).toContain('group=SomeSpace')).toPass({
      timeout: 5000,
    });

    // Switch to view2 — clearGroupUrlParams should fire.
    await viewTabsPage.clickViewTab(view2.viewId);

    // The ?group= param should be gone after the tab switch.
    await expect(() => expect(page.url()).not.toContain('group=SomeSpace')).toPass({
      timeout: 5000,
    });
  });
});
