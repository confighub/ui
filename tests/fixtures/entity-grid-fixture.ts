// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Locator, Page } from '@playwright/test';

import { applyCpuThrottling } from './slow-mode';

/**
 * Generic fixture for interacting with EntityDataGrid-based tables
 * Provides common operations for all entity grids (Targets, Triggers, Workers, Spaces, Units)
 */
export class EntityGridFixture {
  private throttleApplied = false;

  constructor(
    protected page: Page,
    protected gridLocator?: Locator,
  ) {
    // Default to finding the grid by role
    this.gridLocator = gridLocator || page.locator('[role="grid"]');
  }

  /**
   * Locator for the chrome-free empty state.
   *
   * When a list's *unfiltered* dataset has no rows, EntityDataGrid renders this
   * container instead of mounting the grid: there is no `[role="grid"]`, no
   * toolbar, no column headers and no pagination footer. Filtering or searching
   * a non-empty list down to zero rows is a different state — there the grid
   * stays mounted and shows the no-rows overlay, so the filters can be cleared.
   */
  protected emptyStateLocator(): Locator {
    return this.page.getByTestId('entity-grid-empty-state');
  }

  /**
   * Whether the chrome-free empty state is rendered in place of the grid.
   *
   * Deliberately a `count()` snapshot rather than a visibility wait, so callers
   * on the normal grid-mounted path pay nothing for the check.
   */
  protected async hasEmptyState(): Promise<boolean> {
    return (await this.emptyStateLocator().count()) > 0;
  }

  /**
   * Wait until the list has settled into one of its two shapes — the mounted
   * grid, or the chrome-free empty state that replaces it — whichever renders.
   *
   * @returns true when the grid is mounted, false when the empty state replaced it
   */
  protected async waitForGridOrEmptyState(): Promise<boolean> {
    await this.gridLocator.or(this.emptyStateLocator()).first().waitFor({ state: 'visible' });
    return (await this.gridLocator.count()) > 0;
  }

  /**
   * Apply CPU throttling if SLOW_MODE is set (once per fixture instance).
   * Called automatically by applyAdvancedFilter; can also be called manually.
   */
  private async ensureThrottling(): Promise<void> {
    if (!this.throttleApplied) {
      await applyCpuThrottling(this.page);
      this.throttleApplied = true;
    }
  }

  /**
   * Get a row by a specific cell text
   * @param columnName - The accessible name of the column (e.g., 'Name', 'Slug')
   * @param value - The text value to search for
   */
  async getRowByCellValue(columnName: string, value: string): Promise<Locator> {
    // First try exact match by role
    const exactCell = this.gridLocator.getByRole('gridcell', { name: value });
    const exactCount = await exactCell.count();

    if (exactCount > 0) {
      return exactCell.locator('xpath=ancestor::div[@role="row"]').first();
    }

    // If exact match fails (likely due to HighlightedCell), use text content filter
    // This handles cases where text is wrapped in highlighting spans
    const rows = this.gridLocator.locator('[role="row"]');
    const matchingRow = rows.filter({
      has: this.page.locator('[role="gridcell"]', { hasText: value })
    }).first();

    const matchCount = await matchingRow.count();
    if (matchCount === 0) {
      throw new Error(`No row found with cell value: ${value}`);
    }

    return matchingRow;
  }

  /**
   * Get a row by name (assumes first column is 'Name' or 'Slug')
   * @param name - The name/slug to search for
   */
  async getRowByName(name: string): Promise<Locator> {
    return this.getRowByCellValue('Name', name).catch(() =>
      this.getRowByCellValue('Slug', name),
    );
  }

  /**
   * Select a row by checking its checkbox
   * @param name - The name of the row to select
   */
  async selectRow(name: string): Promise<void> {
    const row = await this.getRowByName(name);
    const checkbox = row.getByRole('checkbox');
    await checkbox.waitFor({ state: 'visible' });

    // Use click() instead of check() for MUI checkboxes
    const wasChecked = await checkbox.isChecked();
    if (!wasChecked) {
      await checkbox.click();
      // Wait for the checkbox to be checked
      await checkbox.waitFor({ state: 'attached' });
      await checkbox.evaluate((el: HTMLInputElement) => el.checked);
    }
  }

  /**
   * Wait for the grid to finish loading.
   *
   * Resolves as soon as the list has rendered either the grid or the chrome-free
   * empty state, so a genuinely empty list settles instead of waiting out the
   * timeout on a `[role="grid"]` that will never be mounted.
   */
  async waitForGridReady(): Promise<void> {
    const gridMounted = await this.waitForGridOrEmptyState();
    if (!gridMounted) {
      // No grid, therefore no loading overlay to wait on.
      return;
    }
    // Wait for loading overlay to disappear
    await this.page.waitForSelector('.MuiDataGrid-overlay', { state: 'hidden', timeout: 5000 }).catch(() => {
      // It's okay if there's no overlay
    });
  }

  /**
   * Filter using the quick filter search box.
   *
   * Throws for a genuinely empty list: the search box lives in the grid toolbar,
   * which is not rendered, so there is nothing to filter. Failing fast beats the
   * opaque `fill()` timeout a test author would otherwise have to diagnose.
   * @param searchTerm - The term to search for
   */
  async quickFilter(searchTerm: string): Promise<void> {
    if (await this.hasEmptyState()) {
      throw new Error(
        `Cannot quick filter for "${searchTerm}": the list is empty, so the chrome-free empty state is rendered instead of the grid and its toolbar search box.`,
      );
    }
    const searchBox = this.page.getByPlaceholder('Search…');
    await searchBox.fill(searchTerm);
  }

  /**
   * Clear the quick filter
   */
  async clearQuickFilter(): Promise<void> {
    const searchBox = this.page.getByPlaceholder('Search…');
    await searchBox.clear();
  }

  // ============================================
  // Filter Methods (QueryBuilder)
  // ============================================

  /**
   * Apply a filter using the QueryBuilder WHERE clause field
   * @param filterText - The WHERE clause filter text
   * @param _placeholder - Deprecated, ignored (was entity-specific placeholder)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async applyAdvancedFilter(filterText: string, _placeholder: string): Promise<void> {
    await this.ensureThrottling();
    // Wait for the grid to render and the loading overlay to disappear
    await this.page.waitForSelector('[role="grid"]', { timeout: 15000 });
    // Wait for the loading overlay to disappear (if present)
    const loadingOverlay = this.page.locator('.MuiDataGrid-overlayWrapper .MuiCircularProgress-root');
    await loadingOverlay.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

    // Click Filter or + button to add a new filter
    const filterButton = this.page.locator('button').filter({ hasText: /^Filter$/ });
    const addButton = this.page.getByLabel('Add filter');

    // Wait for the filter button to be visible (confirms toolbar is rendered and ready)
    const filterButtonVisible = await filterButton.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    if (filterButtonVisible) {
      await filterButton.click();
    } else if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addButton.click();
    } else {
      await this.page.locator('button').filter({ hasText: 'Filter' }).first().click();
    }

    // Wait for the menu to actually appear
    const whereMenuItem = this.page.locator('[role="menuitem"]').filter({ hasText: 'Where' }).first();
    await whereMenuItem.waitFor({ state: 'visible', timeout: 10000 });
    await whereMenuItem.click();

    // Wait for the Where input field to appear and fill it
    const whereInput = this.page.getByPlaceholder("Slug LIKE '%prod%'");
    await whereInput.waitFor({ state: 'visible', timeout: 10000 });
    await whereInput.clear();
    await whereInput.fill(filterText);

    // Press Enter to commit the filter value
    await whereInput.press('Enter');

    // Wait for the filter to take effect by checking that the "Clear all" button appears
    // This confirms the filter was committed and the QueryBuilder updated
    await this.page.getByRole('button', { name: 'Clear all', exact: true }).waitFor({ state: 'visible', timeout: 15000 });

    // Close any open menus by pressing Escape
    await this.page.keyboard.press('Escape');
    // Wait for menus to close
    await this.page.locator('[data-filter-menu]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}
