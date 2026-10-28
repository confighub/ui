// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Locator, Page, Route } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';
import { type ExplorerSeed, LONG_TASK_BUDGET_MS, openExplorer, seedExplorer, viewsNamed } from './fixtures/view-explorer-seed';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * Picking rows in a Units table, to compare them: the checkbox track, ⇧ for
 * a range, ⌘ to toggle one row, `x` on the focused row, the header checkbox,
 * the selection bar, and Esc. The selection is per tab, counts only the rows
 * shown, and is not part of the view.
 */

const rows = (page: Page) => page.getByTestId('vx-row');
const bar = (page: Page) => page.getByTestId('vx-selection-bar');
const count = (page: Page) => page.getByTestId('vx-selection-count');
const status = (page: Page) => page.getByTestId('vx-selection-status');
const opacity = (l: Locator) => l.evaluate((el) => getComputedStyle(el).opacity);
/** Where a cell's text starts: its left edge plus its padding. */
const textLeft = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));

async function cleanUp(name: string) {
  for (const v of await viewsNamed(name)) {
    await hubApi.delete(`/api/space/${v.View.SpaceID}/view/${v.View.ViewID}`);
    if (v.View.FilterID) await hubApi.delete(`/api/space/${v.View.SpaceID}/filter/${v.View.FilterID}`);
  }
}

test.describe('view explorer row selection', () => {
  test.use({ storageState: 'authentication.json' });

  let seed: ExplorerSeed;
  let problems: string[];
  let names: string[];

  // A seeded Unit's row, found by its UnitID: the slug alone could also be part of the Space's random slug.
  const row = (page: Page, slug: string) => page.locator(`[data-testid="vx-row"][data-row-id="${seed.units.find((u) => u.slug === slug)?.id}"]`);
  const nameCell = (page: Page, slug: string) => row(page, slug).locator('[data-column="Slug"]');
  const pick = (page: Page, slug: string) => row(page, slug).getByTestId('vx-row-pick');
  const pickedSlugs = async (page: Page) => {
    const ids = await page.locator('[data-testid="vx-row"][data-picked="true"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.rowId));
    return seed.units.filter((u) => ids.includes(u.id)).map((u) => u.slug).sort();
  };

  const view = async (options: { groupBy?: string } = {}) => {
    const name = `Selection ${RandomSlugGenerator.randomSlugName()}`;
    names.push(name);
    return (await seed.createView({ name, ...options })).viewId;
  };

  test.beforeEach(async ({ page }) => {
    problems = [];
    names = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    seed = await seedExplorer(page);
  });

  test.afterEach(async () => {
    for (const name of names) await cleanUp(name);
    await seed.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('the checkbox shows on hover and stays on a picked row; a click picks without opening the drawer', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${await view()}`);
    await expect(rows(page)).toHaveCount(3);
    await page.mouse.move(0, 0);
    expect(await opacity(pick(page, 'alpha'))).toBe('0');
    // Hidden from sight only: it keeps its name.
    await expect(pick(page, 'alpha').getByRole('checkbox', { name: 'Select alpha' })).toBeAttached();

    await row(page, 'alpha').hover();
    await expect.poll(() => opacity(pick(page, 'alpha'))).toBe('1');
    await pick(page, 'alpha').click();
    await expect(row(page, 'alpha')).toHaveAttribute('data-picked', 'true');
    await expect(page.getByTestId('vx-row-panel')).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toHaveAttribute('role', 'toolbar');
    await expect(count(page)).toHaveText(/^1 of \d+ selected$/);
    // Said by a live region that was there before the first row was picked.
    await expect(status(page)).toHaveText('1 selected');
    await expect(row(page, 'alpha').getByTestId('vx-row-slot')).toHaveText('A');

    await page.mouse.move(0, 0);
    await expect.poll(() => opacity(pick(page, 'alpha'))).toBe('1');
    expect(await opacity(pick(page, 'beta'))).toBe('0');

    // A plain click on a row still opens the drawer.
    await nameCell(page, 'beta').click();
    await expect(page.getByTestId('vx-row-panel')).toContainText('beta');
    await expect(row(page, 'beta')).toHaveAttribute('data-picked', 'false');
    // Picking is not a change to the view.
    await expect(page.locator('[data-testid="vx-tab"][data-active]')).not.toHaveAttribute('data-dirty', 'true');
  });

  test('⇧-click picks a range over the rows on screen, skipping a folded group; ⌘-click toggles one', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${await view({ groupBy: 'Slug' })}`);
    await expect(rows(page)).toHaveCount(3);
    // The group headers move right with the checkbox track: a header starts where the Unit names do.
    const chevron = page.locator('[data-testid="vx-group-row"][data-group-key="Slug=alpha"]').getByTestId('vx-group-toggle').locator('svg');
    expect(Math.abs((await chevron.boundingBox())!.x - (await textLeft(nameCell(page, 'alpha'))))).toBeLessThanOrEqual(2);
    // Fold the middle group: beta is off screen.
    await page.locator('[data-testid="vx-group-row"][data-group-key="Slug=beta"]').getByTestId('vx-group-toggle').click();
    await expect(rows(page)).toHaveCount(2);

    await pick(page, 'alpha').click();
    await nameCell(page, 'gamma').click({ modifiers: ['Shift'] });
    expect(await pickedSlugs(page)).toEqual(['alpha', 'gamma']);
    await expect(count(page)).toHaveText(/^2 of \d+ selected$/);
    await expect(page.getByTestId('vx-row-panel')).toHaveCount(0);
    // ⇧-click selects no text on the way.
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');

    await page.locator('[data-testid="vx-group-row"][data-group-key="Slug=beta"]').getByTestId('vx-group-toggle').click();
    await expect(rows(page)).toHaveCount(3);
    await expect(row(page, 'beta')).toHaveAttribute('data-picked', 'false');
    // Letters follow table order, not the order rows were picked in.
    await expect(row(page, 'alpha').getByTestId('vx-row-slot')).toHaveText('A');
    await expect(row(page, 'gamma').getByTestId('vx-row-slot')).toHaveText('B');

    // On the row, not its name link: ⌘-click on the link opens the Unit in a new tab.
    await nameCell(page, 'beta').click({ modifiers: ['ControlOrMeta'], position: { x: 3, y: 3 } });
    expect(await pickedSlugs(page)).toEqual(['alpha', 'beta', 'gamma']);
    await expect(row(page, 'beta').getByTestId('vx-row-slot')).toHaveText('B');
    await expect(row(page, 'gamma').getByTestId('vx-row-slot')).toHaveText('C');
    await nameCell(page, 'alpha').click({ modifiers: ['ControlOrMeta'], position: { x: 3, y: 3 } });
    expect(await pickedSlugs(page)).toEqual(['beta', 'gamma']);
    await expect(row(page, 'beta').getByTestId('vx-row-slot')).toHaveText('A');

    // ⇧-click on a picked row unpicks the range from the anchor (alpha, the row last clicked).
    await nameCell(page, 'beta').click({ modifiers: ['Shift'] });
    expect(await pickedSlugs(page)).toEqual(['gamma']);
  });

  test('x picks the focused row, the header checkbox picks every shown row, Clear and Esc empty it', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${await view()}`);
    await expect(rows(page)).toHaveCount(3);

    await row(page, 'beta').focus();
    await page.keyboard.press('x');
    await expect(row(page, 'beta')).toHaveAttribute('data-picked', 'true');
    await page.keyboard.press('x');
    await expect(row(page, 'beta')).toHaveAttribute('data-picked', 'false');
    await page.keyboard.press('x');

    const all = page.getByTestId('vx-pick-all').getByRole('checkbox', { name: 'Select all 3 Units' });
    await expect(all).toHaveAttribute('data-indeterminate', 'true');
    await all.click();
    await expect(all).toBeChecked();
    await expect(count(page)).toHaveText(/^3 of \d+ selected$/);
    await all.click();
    await expect(bar(page)).toHaveCount(0);

    await all.click();
    await page.getByTestId('vx-selection-clear').click();
    await expect(bar(page)).toHaveCount(0);
    expect(await pickedSlugs(page)).toEqual([]);
    await expect(status(page)).toHaveText('No rows selected');

    await pick(page, 'gamma').click();
    await expect(count(page)).toHaveText(/^1 of \d+ selected$/);
    await row(page, 'gamma').focus();
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCount(0);
    expect(await pickedSlugs(page)).toEqual([]);

    // With the drawer open and focus in it, x picks the open row.
    await nameCell(page, 'alpha').click();
    await expect(page.getByTestId('vx-row-panel')).toBeFocused();
    await page.keyboard.press('x');
    await expect(row(page, 'alpha')).toHaveAttribute('data-picked', 'true');
  });

  test('the selection counts only the rows shown, and each tab keeps its own', async ({ page }) => {
    // Wide enough for the lens column to stand open beside the rows.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${await view()}`);
    await expect(rows(page)).toHaveCount(3);
    await pick(page, 'alpha').click();
    await pick(page, 'gamma').click();
    await expect(count(page)).toHaveText(/^2 of \d+ selected$/);

    // gamma is a payments Unit: a filter on checkout hides it, and it no longer counts.
    const addFilter = page.getByRole('combobox', { name: 'Add a filter' });
    await addFilter.click();
    await addFilter.fill('app:checkout');
    await expect(page.getByTestId('vx-readback')).toContainText('app:checkout');
    await addFilter.press('Enter');
    await expect(rows(page)).toHaveCount(2);
    await expect(count(page)).toHaveText(/^1 of \d+ selected$/);
    await row(page, 'alpha').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(rows(page)).toHaveCount(3);
    await expect(count(page)).toHaveText(/^2 of \d+ selected$/);

    // A new tab starts with nothing picked; going back finds the first tab's selection.
    await page.keyboard.press('n');
    await expect(page.locator('[data-testid="vx-tab"][data-active]')).not.toContainText(names[0]);
    await expect(bar(page)).toHaveCount(0);
    await page.getByTestId('vx-tab').filter({ hasText: names[0] }).click();
    await expect(page.locator('[data-testid="vx-tab"][data-active]')).toContainText(names[0]);
    await expect(count(page)).toHaveText(/^2 of \d+ selected$/);
    expect(await pickedSlugs(page)).toEqual(['alpha', 'gamma']);

    // While rows are picked, the selection bar stands in place of the layout and entity pickers.
    await expect(page.getByTestId('vx-entity')).toHaveCount(0);
    await expect(page.getByTestId('vx-layout-board')).toHaveCount(0);
    // Board has no track and no selection bar, so the pickers come back.
    await row(page, 'alpha').focus();
    await page.keyboard.press('b');
    await expect(page.getByTestId('vx-table')).toHaveCount(0);
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-layout-board')).toHaveAttribute('aria-pressed', 'true');

    // Spaces have no checkbox track and no selection bar; back on a Units table the selection is there.
    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    await expect(page.getByTestId('vx-entity')).toHaveText(/Spaces/);
    await page.getByTestId('vx-layout-table').click();
    await expect(page.getByTestId('vx-table')).toBeVisible();
    await expect(page.getByTestId('vx-row-pick')).toHaveCount(0);
    await expect(page.getByTestId('vx-pick-all')).toHaveCount(0);
    await expect(bar(page)).toHaveCount(0);
    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Units' }).click();
    await expect(count(page)).toHaveText(/^2 of \d+ selected$/);
  });

  test('on "All units", the view a first change forks to keeps the selection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // "All units" lists every Unit of the organization; only this spec's are kept, so its rows are on screen.
    await page.route(/\/api\/unit(\?|$)/, async (route: Route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const all = (await response.json()) as Array<{ Unit?: { SpaceID?: string } }>;
      await route.fulfill({ response, json: all.filter((u) => u.Unit?.SpaceID === seed.spaceId) });
    });
    await openExplorer(page, '/x/view-explorer', '3 of 3');
    const active = page.locator('[data-testid="vx-tab"][data-active]');
    await expect(active).toContainText('All units');
    await pick(page, 'alpha').click();
    await pick(page, 'gamma').click();
    await expect(count(page)).toHaveText(/^2 of \d+ selected$/);

    const addFilter = page.getByRole('combobox', { name: 'Add a filter' });
    await addFilter.click();
    await addFilter.fill('app:checkout');
    await expect(page.getByTestId('vx-readback')).toContainText('app:checkout');
    await addFilter.press('Enter');
    await expect(rows(page)).toHaveCount(2);
    await expect(active).not.toContainText('All units');
    await expect(count(page)).toHaveText(/^1 of \d+ selected$/);

    await row(page, 'alpha').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(rows(page)).toHaveCount(3);
    await expect(count(page)).toHaveText(/^2 of \d+ selected$/);
    expect(await pickedSlugs(page)).toEqual(['alpha', 'gamma']);
  });

  test('⇧-click on a value still adds to the cell popover, and picks nothing', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${await view()}`);
    await expect(rows(page)).toHaveCount(3);
    const value = (slug: string) => row(page, slug).locator('[data-vx-value="Labels.app"]').first();
    await value('alpha').click();
    const popover = page.getByTestId('vx-cell-popover');
    await expect(popover.getByTestId('vx-cell-popover-value')).toHaveText(['checkout']);
    await value('gamma').click({ modifiers: ['Shift'] });
    await expect(popover.getByTestId('vx-cell-popover-value')).toHaveCount(2);
    expect(await pickedSlugs(page)).toEqual([]);
    await expect(bar(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
  });

  test('picking rows in 5,000 Units has no long task', async ({ page }) => {
    test.skip(!!process.env.SLOW_MODE, 'timing budgets are not meaningful under SLOW_MODE');
    const now = Date.now();
    const units = Array.from({ length: 5000 }, (_, i) => ({
      Unit: {
        UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        Slug: `unit-${String(i).padStart(4, '0')}`,
        SpaceID: `space-${i % 25}`,
        ToolchainType: 'Kubernetes/YAML',
        Labels: { app: `app-${i % 40}` },
        HeadRevisionNum: 5,
        LastReleasedRevisionNum: 5,
        UpdatedAt: new Date(now - i * 60_000).toISOString(),
        CreatedAt: new Date(now - i * 120_000).toISOString(),
      },
      Space: { SpaceID: `space-${i % 25}`, Slug: `perf-space-${String(i % 25).padStart(2, '0')}` },
    }));
    const body = JSON.stringify(units);
    await page.route(/\/api\/unit(\?|$)/, (route: Route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body }) : route.continue(),
    );
    await page.addInitScript(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
    });
    await openExplorer(page, '/x/view-explorer', '5000 of 5000');
    await page.waitForTimeout(500);
    await page.evaluate(() => ((window as unknown as { __longTasks: number[] }).__longTasks = []));

    const picks = rows(page).getByTestId('vx-row-pick');
    for (let i = 0; i < 6; i++) await picks.nth(i).click();
    await expect(count(page)).toHaveText(/^6 of \d+ selected$/);
    await rows(page).nth(10).locator('[data-column="Slug"]').click({ modifiers: ['Shift'] });
    await expect(count(page)).toHaveText(/^11 of \d+ selected$/);
    await page.getByTestId('vx-pick-all').getByRole('checkbox').click();
    await expect(count(page)).toHaveText(/^5000 of \d+ selected$/);
    await page.getByTestId('vx-selection-clear').click();
    await expect(bar(page)).toHaveCount(0);

    const tasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
    expect(tasks.filter((ms) => ms >= LONG_TASK_BUDGET_MS).map(Math.round), 'long tasks while picking rows (ms)').toEqual([]);
  });
});
