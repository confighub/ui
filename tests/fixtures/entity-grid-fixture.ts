// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Locator, Page, expect } from '@playwright/test';

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
   * Select multiple rows
   * @param names - Array of row names to select
   */
  async selectRows(names: string[]): Promise<void> {
    for (const name of names) {
      await this.selectRow(name);
    }
  }

  /**
   * Deselect a row by unchecking its checkbox
   * @param name - The name of the row to deselect
   */
  async deselectRow(name: string): Promise<void> {
    const row = await this.getRowByName(name);
    const checkbox = row.getByRole('checkbox');
    // Only click if currently checked
    if (await checkbox.isChecked()) {
      await checkbox.click();
    }
  }

  /**
   * Get the number of selected rows
   */
  async getSelectedRowCount(): Promise<number> {
    const checkedCheckboxes = await this.gridLocator
      .locator('input[type="checkbox"]:checked')
      .count();
    // Subtract 1 for the header checkbox
    return Math.max(0, checkedCheckboxes - 1);
  }

  /**
   * Select all rows
   */
  async selectAllRows(): Promise<void> {
    const headerCheckbox = this.gridLocator
      .locator('.MuiDataGrid-columnHeaderCheckbox input[type="checkbox"]')
      .first();
    if (!(await headerCheckbox.isChecked())) {
      await headerCheckbox.click();
    }
  }

  /**
   * Deselect all rows
   */
  async deselectAllRows(): Promise<void> {
    const headerCheckbox = this.gridLocator
      .locator('.MuiDataGrid-columnHeaderCheckbox input[type="checkbox"]')
      .first();
    if (await headerCheckbox.isChecked()) {
      await headerCheckbox.click();
    }
  }

  /**
   * Get the total number of rows in the grid.
   *
   * Returns 0 for a genuinely empty list: the grid is not mounted, so there are
   * no `[role="row"]` elements at all — not even the header row the subtraction
   * below accounts for.
   */
  async getRowCount(): Promise<number> {
    if (await this.hasEmptyState()) {
      return 0;
    }
    // Subtract header row; clamped so an unmounted grid can never report -1.
    return Math.max(0, (await this.gridLocator.locator('[role="row"]').count()) - 1);
  }

  /**
   * Check if a row exists
   * @param name - The name to search for
   */
  async rowExists(name: string): Promise<boolean> {
    try {
      await this.getRowByName(name);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open the grouped columns panel
   */
  async openColumnsPanel(): Promise<void> {
    await this.page.getByRole('button', { name: 'Select columns' }).click();
  }

  /**
   * Search for columns in the grouped columns panel
   * @param searchTerm - The search term to filter columns
   */
  async searchColumns(searchTerm: string): Promise<void> {
    const searchInput = this.page.getByPlaceholder('Search columns...');
    await searchInput.fill(searchTerm);
  }

  /**
   * Toggle a column's visibility
   * @param columnName - The exact name of the column to toggle
   */
  async toggleColumn(columnName: string): Promise<void> {
    await this.openColumnsPanel();
    const checkbox = this.page.locator('label').filter({ hasText: new RegExp(`^${columnName}$`) });
    await checkbox.click();
  }

  /**
   * Show a column (make it visible)
   * @param columnName - The name of the column to show
   */
  async showColumn(columnName: string): Promise<void> {
    await this.openColumnsPanel();
    const checkbox = this.page
      .locator('label')
      .filter({ hasText: new RegExp(`^${columnName}$`) })
      .locator('input[type="checkbox"]');
    await checkbox.check();
  }

  /**
   * Hide a column (make it invisible)
   * @param columnName - The name of the column to hide
   */
  async hideColumn(columnName: string): Promise<void> {
    await this.openColumnsPanel();
    const checkbox = this.page
      .locator('label')
      .filter({ hasText: new RegExp(`^${columnName}$`) })
      .locator('input[type="checkbox"]');
    await checkbox.uncheck();
  }

  /**
   * Get all visible column headers.
   *
   * Returns an empty list for a genuinely empty list rather than throwing: no
   * grid means no column headers, and that is a truthful answer callers can
   * assert on (e.g. `expect(cols).not.toContain('Name')`).
   */
  async getVisibleColumns(): Promise<string[]> {
    if (await this.hasEmptyState()) {
      return [];
    }
    const headers = await this.gridLocator.locator('[role="columnheader"]').allTextContents();
    return headers.filter((h) => h.trim() !== ''); // Filter out checkbox column
  }

  /**
   * Sort by a column
   * @param columnName - The name of the column to sort by
   */
  async sortByColumn(columnName: string): Promise<void> {
    const header = this.gridLocator.getByRole('columnheader', { name: columnName });
    await header.click();
  }

  /**
   * Get cell value
   * @param rowName - The name of the row
   * @param columnName - The name of the column
   */
  async getCellValue(rowName: string, columnName: string): Promise<string> {
    const row = await this.getRowByName(rowName);
    const cell = row.getByRole('gridcell', { name: columnName }).first();
    return await cell.textContent();
  }

  /**
   * Click on a cell (useful for edit actions)
   * @param rowName - The name of the row
   * @param columnName - The name of the column
   */
  async clickCell(rowName: string, columnName: string): Promise<void> {
    const row = await this.getRowByName(rowName);
    const cell = row.getByRole('gridcell').filter({ hasText: columnName }).first();
    await cell.click();
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

  /**
   * Check if the grid is empty.
   *
   * Two distinct empty states exist:
   * - Genuinely empty (unfiltered dataset has no rows): the grid is not mounted
   *   at all and a chrome-free empty state is rendered in its place.
   * - Filtered/searched to zero rows: the grid stays mounted and shows the
   *   "no results" overlay so filters can be cleared.
   */
  async isEmpty(): Promise<boolean> {
    const isVisible = (locator: Locator) =>
      locator
        .waitFor({ state: 'visible', timeout: 1000 })
        .then(() => true)
        .catch(() => false);

    const [hasEmptyState, hasNoRowsOverlay] = await Promise.all([
      isVisible(this.emptyStateLocator()),
      isVisible(this.gridLocator.locator('.MuiDataGrid-overlay')),
    ]);

    return hasEmptyState || hasNoRowsOverlay;
  }

  /**
   * Get the pagination info text (e.g., "1–25 of 100").
   *
   * Throws for a genuinely empty list: the grid — and with it the pagination
   * footer — is not mounted, so there is no text to read. There is no honest
   * string to return here (not even "0–0 of 0", which the empty state
   * deliberately does not render), so failing with a clear reason is better
   * than an opaque `textContent()` timeout.
   */
  async getPaginationInfo(): Promise<string> {
    if (await this.hasEmptyState()) {
      throw new Error(
        'Cannot read pagination info: the list is empty, so the chrome-free empty state is rendered instead of the grid and its pagination footer.',
      );
    }
    const paginationText = this.page.locator('.MuiTablePagination-displayedRows');
    return await paginationText.textContent();
  }

  /**
   * Go to next page
   */
  async goToNextPage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Go to next page' }).click();
  }

  /**
   * Go to previous page
   */
  async goToPreviousPage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Go to previous page' }).click();
  }

  /**
   * Change page size
   * @param size - The page size (25, 50, 100, 250)
   */
  async changePageSize(size: 25 | 50 | 100 | 250): Promise<void> {
    await this.page.getByRole('combobox', { name: 'Rows per page:' }).click();
    await this.page.getByRole('option', { name: size.toString() }).click();
  }

  // ============================================
  // Filter Methods (QueryBuilder)
  // ============================================

  /**
   * Open the filters panel (no-op with new QueryBuilder, always visible)
   *
   * Stays a no-op for a genuinely empty list too. It touches no locators, so it
   * cannot hang or fail there; the call that follows it (e.g.
   * {@link applyAdvancedFilter}) is where the missing QueryBuilder surfaces.
   * @deprecated QueryBuilder is always visible in the header
   */
  async openAdvancedFilters(): Promise<void> {
    // QueryBuilder is always visible in the header, no need to open
  }

  /**
   * Close the advanced filters panel (no-op with new QueryBuilder)
   * @deprecated QueryBuilder is always visible in the header
   */
  async closeAdvancedFilters(): Promise<void> {
    // QueryBuilder is always visible in the header, no need to close
  }

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

  /**
   * Clear all filters using the QueryBuilder's Clear all button
   */
  async clearFilters(): Promise<void> {
    // Use exact match to avoid matching "Clear all filters" button
    const clearButton = this.page.getByRole('button', { name: 'Clear all', exact: true });
    if (await clearButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clearButton.click();
      // Wait for filters to be cleared (Filter button reappears when no filters exist)
      await this.page.locator('button').filter({ hasText: /^Filter$/ }).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    }
  }

  /**
   * Assert that a filter error is visible
   * @param errorText - The error text to check for (partial match)
   */
  async expectFilterError(errorText: string): Promise<void> {
    await expect(this.page.getByText(errorText)).toBeVisible();
  }

  /**
   * Close the filter error message if visible
   */
  async closeFilterError(): Promise<void> {
    const closeButton = this.page.getByTestId('error-list-close-button');
    if (await closeButton.isVisible()) {
      await closeButton.click();
      // Wait for the error message (and its close button) to be dismissed
      await expect(closeButton).toBeHidden();
    }
  }
}
