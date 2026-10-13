// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Playwright E2E tests for View Tab behaviour on the Unit list page.
 *
 * Playwright is the only test layer for the UI, so these specs carry the
 * coverage for this feature:
 *  - Per-tab draft state: an edit on one tab does not bleed into another, is
 *    restored on switching back, and survives a page reload
 *  - The modified-dot indicator on active and inactive dirty tabs
 *  - Reverting a view (filter and groupBy changes) via the kebab menu
 *  - Creating a view in the inline popover, which stays active after a reload
 *  - Closing the active tab falls back to the "All units" tab
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

  async goto() {
    await this.page.goto('/units');
    // Wait for the tab strip to mount — this is the real signal the page is ready.
    await this.page.getByTestId('view-tabs').waitFor({ state: 'visible', timeout: 15000 });
  }

  tab(viewId: string) {
    return this.page.getByTestId(`view-tab-${viewId}`);
  }

  modifiedDot(viewId: string) {
    return this.tab(viewId).getByTestId('view-tab-modified-dot');
  }

  async activateViewTab(viewId: string) {
    await this.tab(viewId).click();
    await expect(this.tab(viewId)).toHaveAttribute('aria-selected', 'true');
  }

  async closeViewTab(viewId: string) {
    // Hover to reveal the close button, then click it
    await this.tab(viewId).hover();
    await this.page.getByTestId(`view-tab-close-${viewId}`).click();
  }

  async openAddTabMenu() {
    await this.page.getByTestId('view-tabs-add-tab').click();
    await this.page.getByTestId('add-tab-menu').waitFor({ state: 'visible', timeout: 5000 });
  }

  async openTabFromMenu(viewId: string) {
    await this.openAddTabMenu();
    await this.page.getByTestId(`add-tab-item-${viewId}`).click();
    await this.tab(viewId).waitFor({ state: 'visible', timeout: 5000 });
  }

  async createNewViewViaPopover(name: string): Promise<void> {
    await this.openAddTabMenu();
    await this.page.getByTestId('add-tab-menu-create-new-view').click();
    await this.page
      .getByTestId('view-tabs-new-view-popover')
      .waitFor({ state: 'visible', timeout: 5000 });
    await this.page.getByTestId('view-tabs-new-view-name-input').fill(name);
    await this.page.getByTestId('view-tabs-new-view-submit').click();
    await this.page
      .getByTestId('view-tabs-new-view-popover')
      .waitFor({ state: 'hidden', timeout: 10000 });
  }

  async revertViewViaKebab(viewId: string) {
    // The kebab chevron is only visible on the active tab
    await this.tab(viewId).locator('[data-kebab]').click();
    await this.page.getByTestId('view-tab-kebab-revert').click();
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe('View Tabs E2E', () => {
  test.use({ storageState: 'authentication.json' });

  let viewTabsPage: ViewTabsPage;
  let unitListPage: UnitListPage;
  let spaceId: string;

  // Collect views created during a test so we can clean up after each.
  let createdViews: CreatedViewData[] = [];

  test.beforeEach(async ({ page }) => {
    const api = new ApiHelper(page);
    viewTabsPage = new ViewTabsPage(page);
    unitListPage = new UnitListPage(page);
    createdViews = [];

    const space = await api.getFirstSpace();
    spaceId = space.SpaceID;

    // The "all units" filter views created below only render a DataGrid if the
    // space has at least one unit — otherwise the page shows the empty-state
    // "Create your first Unit" screen and every grid wait times out. Seed one
    // guaranteed unit idempotently instead of relying on other spec files.
    await api.createUnit({
      spaceId,
      unit: { Slug: 'e2e-view-tabs-seed-unit', ToolchainType: 'Kubernetes/YAML' },
      allowExists: true,
    });
  });

  test.afterEach(async ({ page }) => {
    for (const view of createdViews) {
      await deleteViewAndFilter(page, view);
    }
  });

  async function addWhereFilter(page: Page, value: string) {
    await unitListPage.addVisualBuilderFilter('Where', value);
    await page.getByPlaceholder("Slug LIKE '%prod%'").press('Enter');
    // The Enter keypress resolves before React commits the filter; the URL
    // sync is the signal that the filter (and isViewModified) has landed.
    await expect(() => expect(page.url()).toContain('filterWhere=')).toPass({ timeout: 5000 });
  }

  async function addTargetGrouping(page: Page) {
    await page.getByRole('button', { name: 'Add grouping level' }).click();
    const targetMenuItem = page.getByRole('menuitem', { name: 'Target' });
    await expect(targetMenuItem).toBeVisible({ timeout: 5000 });
    await targetMenuItem.click();
    await expect(page.getByRole('button', { name: /Change Target grouping/i })).toBeVisible({
      timeout: 5000,
    });
  }

  test('a draft stays on its own tab, is restored on switching back, and survives a reload', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const marker = `e2e-draft-${RandomSlugGenerator.randomSlugName()}`;
    const view1 = await createFilterAndView(page, spaceId, 'E2E Draft View');
    const view2 = await createFilterAndView(page, spaceId, 'E2E Draft Control');
    createdViews.push(view1, view2);
    const whereChip = page.getByRole('button', { name: /Filter by Where/i });

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.openTabFromMenu(view2.viewId);

    await viewTabsPage.activateViewTab(view1.viewId);
    await expect(() => expect(page.url()).toContain(`viewID=${view1.viewId}`)).toPass({
      timeout: 5000,
    });
    await expect(viewTabsPage.modifiedDot(view1.viewId)).toBeHidden();

    await addWhereFilter(page, `Slug LIKE '%${marker}%'`);
    await expect(viewTabsPage.modifiedDot(view1.viewId)).toBeVisible({ timeout: 5000 });

    // Switching away keeps view1's edit off view2, and marks view1 as dirty
    // although it is no longer active.
    await viewTabsPage.activateViewTab(view2.viewId);
    await expect(() => {
      expect(page.url()).toContain(`viewID=${view2.viewId}`);
      expect(page.url()).not.toContain(marker);
    }).toPass({ timeout: 5000 });
    await expect(viewTabsPage.modifiedDot(view1.viewId)).toBeVisible({ timeout: 5000 });

    // Switching back restores view1's draft.
    await viewTabsPage.activateViewTab(view1.viewId);
    await expect(() => expect(page.url()).toContain(marker)).toPass({ timeout: 5000 });
    await expect(whereChip).toBeVisible({ timeout: 5000 });

    // After a reload, the draft (not the saved, filter-less baseline) is applied.
    await viewTabsPage.activateViewTab(view2.viewId);
    await page.reload();
    await page.getByTestId('view-tabs').waitFor({ state: 'visible', timeout: 25000 });
    await viewTabsPage.activateViewTab(view1.viewId);
    await expect(whereChip).toBeVisible({ timeout: 10000 });
  });

  test('reverting a view removes the modified dot for filter and groupBy changes', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Revert View');
    createdViews.push(view1);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.activateViewTab(view1.viewId);

    await addWhereFilter(page, "Slug LIKE '%revert-test%'");
    await expect(viewTabsPage.modifiedDot(view1.viewId)).toBeVisible({ timeout: 5000 });
    await viewTabsPage.revertViewViaKebab(view1.viewId);
    await expect(viewTabsPage.modifiedDot(view1.viewId)).toBeHidden({ timeout: 5000 });

    await addTargetGrouping(page);
    await expect(viewTabsPage.modifiedDot(view1.viewId)).toBeVisible({ timeout: 5000 });
    await viewTabsPage.revertViewViaKebab(view1.viewId);
    await expect(viewTabsPage.modifiedDot(view1.viewId)).toBeHidden({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Change Target grouping/i })).toBeHidden({
      timeout: 3000,
    });
  });

  test('a view created in the inline popover is active and stays active after a reload', async ({
    page,
  }) => {
    await viewTabsPage.goto();

    const newViewName = `e2e-new-${RandomSlugGenerator.randomSlugName()}`;
    let createdViewId: string | undefined;

    // Capture the new ViewID from the POST /view response for teardown.
    page.on('response', async (response) => {
      if (
        response.url().includes('/view') &&
        response.request().method() === 'POST' &&
        response.ok()
      ) {
        const body = await response.json().catch(() => null);
        if (body?.ViewID) createdViewId = body.ViewID;
      }
    });

    try {
      await viewTabsPage.createNewViewViaPopover(newViewName);
      await expect(page.getByText(`Saved '${newViewName}'`)).toBeVisible({ timeout: 10000 });

      await expect.poll(() => createdViewId, { timeout: 5000 }).toBeTruthy();
      const viewId = String(createdViewId);

      await expect(viewTabsPage.tab(viewId)).toHaveAttribute('aria-selected', 'true', {
        timeout: 5000,
      });
      expect(page.url()).toContain(`viewID=${viewId}`);

      await page.reload();
      await page.getByTestId('view-tabs').waitFor({ state: 'visible', timeout: 15000 });

      await expect(viewTabsPage.tab(viewId)).toHaveAttribute('aria-selected', 'true', {
        timeout: 5000,
      });
    } finally {
      if (createdViewId && spaceId) {
        await page.request
          .delete(`/api/space/${spaceId}/view/${createdViewId}`)
          .catch(() => undefined);
      }
    }
  });

  test('closing the active view tab removes it and falls back to the "All units" tab', async ({
    page,
  }) => {
    const view1 = await createFilterAndView(page, spaceId, 'E2E Close Fallback');
    createdViews.push(view1);

    await viewTabsPage.goto();
    await viewTabsPage.openTabFromMenu(view1.viewId);
    await viewTabsPage.activateViewTab(view1.viewId);

    await viewTabsPage.closeViewTab(view1.viewId);

    await expect(viewTabsPage.tab(view1.viewId)).toBeHidden({ timeout: 5000 });
    await expect(page.getByTestId('view-tab-all')).toHaveAttribute('aria-selected', 'true');
  });
});
