// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Locator, Page } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';
import { type ExplorerSeed, openExplorer, seedExplorer, viewsNamed } from './fixtures/view-explorer-seed';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The Functions panel lists the Units picked in a Units table, in table
 * order, and the two lists never disagree: a Unit taken out in the panel is
 * unpicked in the table, and "deselect all" there clears the selection.
 * Compare mode does not change the list. Another tab has its own list, and
 * leaving the page empties it. Plain keys and Esc pressed in the panel are not
 * the explorer's; ⌘S still is. The toolbar keeps every selection action on
 * screen when the panel makes it narrow. No function is run.
 */

const sidebar = (page: Page) => page.getByTestId('invoker-sidebar');
const contextHeader = (page: Page) => sidebar(page).locator('[role="button"][aria-expanded]:has-text("Context")');
const counter = (page: Page) => contextHeader(page).locator('text=/^\\d+ units?$/');
const panelUnits = (page: Page) => sidebar(page).getByTestId('invoker-context-unit');
const panelButton = (page: Page) => sidebar(page).getByTestId('invoker-functions-button');
const bar = (page: Page) => page.getByTestId('vx-selection-bar');
const count = (page: Page) => page.getByTestId('vx-selection-count');
const activeTab = (page: Page) => page.locator('[data-testid="vx-tab"][data-active]');

async function cleanUp(name: string) {
  for (const v of await viewsNamed(name)) {
    await hubApi.delete(`/api/space/${v.View.SpaceID}/view/${v.View.ViewID}`);
    if (v.View.FilterID) await hubApi.delete(`/api/space/${v.View.SpaceID}/filter/${v.View.FilterID}`);
  }
}

/** Unfold the panel's list of Units, if it is folded. A DOM click misses the header's buttons, which stop the click. */
async function unfoldContext(page: Page) {
  await expect(contextHeader(page)).toBeVisible();
  if ((await contextHeader(page).getAttribute('aria-expanded')) !== 'true') await contextHeader(page).evaluate((el) => (el as HTMLElement).click());
  await expect(contextHeader(page)).toHaveAttribute('aria-expanded', 'true');
}

/**
 * How many times the picked rows or the panel's list change over `frames`
 * animation frames. A write going back and forth between the two would change
 * them on every frame; settled, they do not change at all.
 */
async function changesOver(page: Page, frames = 30): Promise<number> {
  return page.evaluate(async (n) => {
    let changes = 0;
    const observer = new MutationObserver((records) => {
      changes += records.length;
    });
    const header = [...document.querySelectorAll('[data-testid="invoker-sidebar"] [role="button"][aria-expanded]')].find((el) => el.textContent?.includes('Context'));
    if (header?.parentElement) observer.observe(header.parentElement, { subtree: true, childList: true, characterData: true });
    const results = document.querySelector('[data-testid="vx-results"]');
    if (results) observer.observe(results, { subtree: true, attributes: true, attributeFilter: ['data-picked'] });
    for (let i = 0; i < n; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    observer.disconnect();
    return changes;
  }, frames);
}

/** The element's right edge is inside the toolbar's. */
async function insideToolbar(page: Page, el: Locator) {
  await expect(el).toBeVisible();
  const toolbar = (await page.getByTestId('vx-toolbar').boundingBox())!;
  const box = (await el.boundingBox())!;
  expect(box.x + box.width, 'inside the toolbar').toBeLessThanOrEqual(toolbar.x + toolbar.width);
  expect(box.width, 'drawn').toBeGreaterThan(0);
}

test.describe('view explorer selection in the Functions panel', () => {
  test.use({ storageState: 'authentication.json' });

  let seed: ExplorerSeed;
  let problems: string[];
  let names: string[];

  const idOf = (slug: string) => seed.units.find((u) => u.slug === slug)?.id ?? '';
  const row = (page: Page, slug: string) => page.locator(`[data-testid="vx-row"][data-row-id="${idOf(slug)}"]`);
  const pick = (page: Page, slug: string) => row(page, slug).getByTestId('vx-row-pick');
  const pickedSlugs = async (page: Page) => {
    const ids = await page.locator('[data-testid="vx-row"][data-picked="true"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.rowId));
    return seed.units.filter((u) => ids.includes(u.id)).map((u) => u.slug);
  };
  /** The panel's Units, by slug, as it lists them. */
  const listed = async (page: Page) => {
    const ids = await panelUnits(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.unitId ?? ''));
    return ids.map((id) => seed.units.find((u) => u.id === id)?.slug ?? id);
  };
  /** The given Units in the table's order (the view keeps the server's order, which is not by slug). */
  const inTableOrder = async (page: Page, slugs: string[]) => {
    const ids = await page.getByTestId('vx-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.rowId ?? ''));
    return ids.map((id) => seed.units.find((u) => u.id === id)?.slug ?? '').filter((slug) => slugs.includes(slug));
  };
  const removeInPanel = (page: Page, slug: string) =>
    panelUnits(page).and(page.locator(`[data-unit-id="${idOf(slug)}"]`)).getByRole('button', { name: 'Remove from selection' }).click();
  const addFilter = async (page: Page, text: string) => {
    const input = page.getByRole('combobox', { name: 'Add a filter' });
    await input.click();
    await input.fill(text);
    await expect(page.getByTestId('vx-readback')).toContainText(text);
    await input.press('Enter');
  };

  const openView = async (page: Page) => {
    const name = `Functions ${RandomSlugGenerator.randomSlugName()}`;
    names.push(name);
    const { viewId } = await seed.createView({ name });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(page.getByTestId('vx-row')).toHaveCount(3);
  };

  test.beforeEach(async ({ page }) => {
    problems = [];
    names = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:|Maximum update depth/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    // Each test opens the panel itself.
    await page.addInitScript(() => window.localStorage.setItem('invokerSidebarOpen', 'false'));
    await page.setViewportSize({ width: 1440, height: 900 });
    seed = await seedExplorer(page);
  });

  test.afterEach(async () => {
    for (const name of names) await cleanUp(name);
    await seed.remove();
    expect(problems, 'no console errors, React warnings or update loops').toEqual([]);
  });

  test('f opens the panel with the picked Units in table order; it follows the selection, and a removal there unpicks the row', async ({ page }) => {
    await openView(page);
    await pick(page, 'gamma').click();
    await pick(page, 'alpha').click();
    await expect(count(page)).toHaveText('2 of 3 selected');

    await page.keyboard.press('f');
    await expect(panelButton(page)).toHaveAttribute('aria-expanded', 'true');
    await unfoldContext(page);
    await expect(counter(page)).toHaveText('2 units');
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'gamma']));

    await pick(page, 'beta').click();
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'beta', 'gamma']));
    await pick(page, 'alpha').click();
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['beta', 'gamma']));
    await expect(counter(page)).toHaveText('2 units');

    await removeInPanel(page, 'gamma');
    await expect(row(page, 'gamma')).toHaveAttribute('data-picked', 'false');
    await expect(count(page)).toHaveText('1 of 3 selected');
    await expect.poll(() => listed(page)).toEqual(['beta']);
    // Settled: no write goes back and forth.
    expect(await changesOver(page)).toBe(0);
    expect(await pickedSlugs(page)).toEqual(['beta']);

    await pick(page, 'alpha').click();
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'beta']));
    expect(await changesOver(page)).toBe(0);
    await sidebar(page).getByLabel('Deselect all units').click();
    await expect(bar(page)).toHaveCount(0);
    expect(await pickedSlugs(page)).toEqual([]);
    // An empty slice gives the panel no Units; its own list starts empty.
    await expect(counter(page)).toHaveText('0 units');
  });

  test('× on the last shown Unit unpicks that row only: rows a filter hides stay picked', async ({ page }) => {
    await openView(page);
    for (const slug of ['alpha', 'beta', 'gamma']) await pick(page, slug).click();
    await bar(page).getByTestId('vx-selection-functions').click();
    await unfoldContext(page);
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'beta', 'gamma']));

    // Only alpha is a web Unit.
    await addFilter(page, 'tier:web');
    await expect(page.getByTestId('vx-row')).toHaveCount(1);
    await expect.poll(() => listed(page)).toEqual(['alpha']);
    await removeInPanel(page, 'alpha');
    await expect(bar(page)).toHaveCount(0);
    await expect(counter(page)).toHaveText('0 units');

    await row(page, 'alpha').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('vx-row')).toHaveCount(3);
    await expect(count(page)).toHaveText('2 of 3 selected');
    expect(await pickedSlugs(page)).toEqual(['beta', 'gamma']);
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['beta', 'gamma']));
  });

  test('the Functions button in the selection bar opens the panel with the selection', async ({ page }) => {
    await openView(page);
    await pick(page, 'alpha').click();
    await pick(page, 'beta').click();
    const functions = bar(page).getByTestId('vx-selection-functions');
    await expect(functions).toHaveText('Functionsf');
    await expect(functions).toHaveAccessibleName('Run Functions on 2 selected Units');
    await expect(functions.locator('kbd')).toHaveText('f');
    await expect(panelButton(page)).toHaveAttribute('aria-expanded', 'false');

    await functions.click();
    await expect(panelButton(page)).toHaveAttribute('aria-expanded', 'true');
    await unfoldContext(page);
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'beta']));
    // A second click keeps it open.
    await functions.click();
    await expect(panelButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'beta']));
  });

  test('compare mode keeps the table selection in the panel, not the compared Units', async ({ page }) => {
    await openView(page);
    await pick(page, 'alpha').click();
    await pick(page, 'beta').click();
    await bar(page).getByTestId('vx-selection-functions').click();
    await unfoldContext(page);
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'beta']));

    await page.getByTestId('vx-selection-compare').click();
    await expect(page.getByTestId('vx-compare')).toBeVisible();
    await expect(page.getByTestId('unit-slot-b')).toBeVisible();
    // B leaves the comparison; the selection, and so the panel, keep it.
    await page.getByTestId('unit-slot-clear-b').click();
    await expect(page.getByTestId('unit-slot-b')).toHaveCount(0);
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'beta']));

    // A removal in the panel while comparing unpicks the row behind the comparison.
    await removeInPanel(page, 'beta');
    await expect.poll(() => listed(page)).toEqual(['alpha']);
    await page.getByRole('button', { name: 'Back to table' }).click();
    await expect(page.getByTestId('vx-compare')).toHaveCount(0);
    await expect(count(page)).toHaveText('1 of 3 selected');
    expect(await pickedSlugs(page)).toEqual(['alpha']);
  });

  test('each tab, and a view with no selection, has its own list; leaving the page empties it', async ({ page }) => {
    await openView(page);
    await pick(page, 'alpha').click();
    await pick(page, 'gamma').click();
    await bar(page).getByTestId('vx-selection-functions').click();
    await unfoldContext(page);
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'gamma']));

    // A new tab has nothing picked, so the panel has no Units from the page.
    await row(page, 'alpha').focus();
    await page.keyboard.press('n');
    await expect(activeTab(page)).not.toContainText(names[0]);
    await expect(counter(page)).toHaveText('0 units');
    await page.getByTestId('vx-tab').filter({ hasText: names[0] }).click();
    await expect(activeTab(page)).toContainText(names[0]);
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'gamma']));

    // A Board has no selection.
    await row(page, 'alpha').focus();
    await page.keyboard.press('b');
    await expect(page.getByTestId('vx-table')).toHaveCount(0);
    await expect(counter(page)).toHaveText('0 units');
    await page.keyboard.press('t');
    await expect(page.getByTestId('vx-table')).toBeVisible();
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'gamma']));

    // The Spaces list writes nothing to the panel, so its 0 is the explorer's cleanup.
    await page.getByRole('banner').getByRole('button', { name: 'Explorers', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Spaces', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/x/view-explorer'));
    await expect(counter(page)).toHaveText('0 units');
  });

  test('a route change hands the panel to the next page, and back, without wiping either', async ({ page }) => {
    await openView(page);
    await pick(page, 'alpha').click();
    await pick(page, 'gamma').click();
    await bar(page).getByTestId('vx-selection-functions').click();
    await unfoldContext(page);
    await expect.poll(() => listed(page)).toEqual(await inTableOrder(page, ['alpha', 'gamma']));

    // A route change in the app, as a link makes: the Unit page puts its own Unit in the panel.
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/units/${seed.spaceId}/${idOf('beta')}`);
    await page.waitForURL(`**/units/${seed.spaceId}/${idOf('beta')}`);
    await expect(counter(page)).toHaveText('1 unit');
    await unfoldContext(page);
    await expect.poll(() => listed(page)).toEqual(['beta']);
    // The explorer's cleanup ran before the Unit page wrote: nothing wipes the Unit page's list.
    expect(await changesOver(page)).toBe(0);
    await expect(counter(page)).toHaveText('1 unit');

    await page.goBack();
    await expect(page.getByTestId('vx-row')).toHaveCount(3);
    // The selection lives for the visit; the Unit page's cleanup and the explorer agree on none.
    await expect(counter(page)).toHaveText('0 units');
    await pick(page, 'beta').click();
    await unfoldContext(page);
    await expect.poll(() => listed(page)).toEqual(['beta']);
    // The Unit page warns of a duplicate key on its own, without the explorer: not this change's.
    problems = problems.filter((p) => !(p.includes('two children with the same key') && p.includes('UnitDetailPage')));
  });

  test('keys pressed in the panel are not the explorer’s: Esc keeps the selection, c starts no comparison; ⌘S still saves', async ({ page }) => {
    await openView(page);
    await pick(page, 'alpha').click();
    await pick(page, 'beta').click();
    await bar(page).getByTestId('vx-selection-functions').click();
    const search = sidebar(page).getByTestId('invoker-function-search').locator('input');
    await search.click();
    await search.fill('set');
    await page.keyboard.press('Escape');
    await expect(count(page)).toHaveText('2 of 3 selected');

    // ⌘S in a panel field is the page's Save, not the browser's "Save Page As".
    await page.evaluate(() => {
      const w = window as Window & { saveKey?: boolean };
      window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 's' && (e.metaKey || e.ctrlKey)) w.saveKey = e.defaultPrevented;
      });
    });
    await search.focus();
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => page.evaluate(() => (window as Window & { saveKey?: boolean }).saveKey)).toBe(true);

    await panelButton(page).focus();
    await page.keyboard.press('c');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vx-compare')).toHaveCount(0);
    await expect(count(page)).toHaveText('2 of 3 selected');

    // On the page, Esc still clears the selection, and the panel's list with it.
    await row(page, 'alpha').focus();
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCount(0);
    await expect(counter(page)).toHaveText('0 units');
  });

  test('a toolbar the panel makes narrow keeps Clear, Compare, Functions and Save on screen', async ({ page }) => {
    await openView(page);
    // A filter makes a change to save; alpha and beta are the checkout Units.
    await addFilter(page, 'app:checkout');
    await expect(page.getByTestId('vx-row')).toHaveCount(2);
    // Out of the filter field, so its suggestions close.
    await row(page, 'alpha').focus();
    await expect(page.locator('[data-vx-lens-layer]')).toHaveCount(0);
    const toolbarHeight = async () => (await page.getByTestId('vx-toolbar').boundingBox())!.height;
    const plainHeight = await toolbarHeight();
    await pick(page, 'alpha').click();
    await pick(page, 'beta').click();
    const clear = bar(page).getByTestId('vx-selection-clear');
    const compare = bar(page).getByTestId('vx-selection-compare');
    const functions = bar(page).getByTestId('vx-selection-functions');
    const save = page.getByTestId('vx-save-button-wrap').getByRole('button');

    // Wide, with no panel: the full labels, and the pickers stand aside for the selection.
    await expect(count(page)).toHaveText('2 of 2 selected');
    await expect(compare.getByText('Compare', { exact: true })).toBeVisible();
    await expect(functions.getByText('Functions', { exact: true })).toBeVisible();
    await expect(page.getByTestId('vx-layout-table')).toHaveCount(0);
    await expect(page.getByTestId('vx-entity')).toHaveCount(0);
    await expect(page.getByTestId('vx-count')).toHaveCount(0);
    for (const el of [clear, compare, functions, save]) await insideToolbar(page, el);

    // The panel takes room: everything stays on screen, at 1440 and at 1100.
    await functions.click();
    await expect(panelButton(page)).toHaveAttribute('aria-expanded', 'true');
    for (const el of [clear, compare, functions, save]) await insideToolbar(page, el);
    await page.setViewportSize({ width: 1100, height: 800 });
    for (const el of [clear, compare, functions, save]) await insideToolbar(page, el);
    await expect(clear).toHaveAccessibleName('Clear selection');
    await expect(compare).toHaveAccessibleName('Compare 2 selected Units');
    await expect(functions).toHaveAccessibleName('Run Functions on 2 selected Units');
    await expect(count(page)).toHaveAttribute('aria-label', '2 of 2 Units selected');
    // One row, as high as with nothing picked: the table under it does not move.
    expect(await toolbarHeight()).toBe(plainHeight);

    // With no selection, the pickers and the row count come back, smaller.
    await clear.click();
    await expect(bar(page)).toHaveCount(0);
    await insideToolbar(page, page.getByTestId('vx-layout-board'));
    await expect(page.getByTestId('vx-layout-board')).toHaveAccessibleName('Board');
    await insideToolbar(page, page.getByTestId('vx-count'));
    await expect(page.getByTestId('vx-count')).toHaveAttribute('title', /^2 of \d+ units$/);
    await insideToolbar(page, save);
  });
});
