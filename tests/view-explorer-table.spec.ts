// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page, Route } from '@playwright/test';

import { COLUMN_WIDTHS_ANNOTATION } from '../src/pages/x/view-explorer/model/annotations';
import { expect, hubApi, test } from './fixtures/test';
import { type ExplorerSeed, readView, seedExplorer, viewsNamed, openExplorer, LONG_TASK_BUDGET_MS } from './fixtures/view-explorer-seed';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The View Explorer's table: the header menu (sort, group, move, hide), header
 * drag, column resize, group headers that fold, the row drawer, and a smooth
 * scroll through thousands of rows.
 */

const rows = (page: Page) => page.getByTestId('vx-row');
const groupRows = (page: Page) => page.getByTestId('vx-group-row');
const header = (page: Page, column: string) => page.locator(`[data-testid="vx-header"][data-column="${column}"]`);
const headerOrder = (page: Page) => page.getByTestId('vx-header').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.column));
const tabNamed = (page: Page, name: string) => page.getByTestId('vx-tab').filter({ hasText: name });
const saveButton = (page: Page) => page.getByTestId('vx-save-actions').getByRole('button', { name: /^Save(\s*⌘S)?$/ });
const nameCell = (page: Page, slug: string) => rows(page).filter({ hasText: slug }).locator('[data-column="Slug"]');

async function menu(page: Page, column: string, item: string | RegExp) {
  await header(page, column).getByRole('button', { name: /column menu$/ }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function cleanUp(name: string) {
  for (const v of await viewsNamed(name)) {
    await hubApi.delete(`/api/space/${v.View.SpaceID}/view/${v.View.ViewID}`);
    if (v.View.FilterID) await hubApi.delete(`/api/space/${v.View.SpaceID}/filter/${v.View.FilterID}`);
  }
}

test.describe('view explorer table', () => {
  test.use({ storageState: 'authentication.json' });

  let seed: ExplorerSeed;
  let problems: string[];
  let name: string;
  let viewId: string;

  test.beforeEach(async ({ page }) => {
    problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    seed = await seedExplorer(page);
    name = `Table ${RandomSlugGenerator.randomSlugName()}`;
    viewId = (await seed.createView({ name })).viewId;
  });

  test.afterEach(async () => {
    await cleanUp(name);
    await seed.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('sorting from the header menu makes a draft and saves OrderBy', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);

    await menu(page, 'Slug', 'Sort descending');
    await expect(rows(page).first()).toContainText('gamma');
    await expect(header(page, 'Slug')).toHaveAttribute('aria-sort', 'descending');
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');

    await saveButton(page).click();
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true');
    const saved = await readView(seed.spaceId, viewId);
    expect(saved.View.OrderBy).toBe('Slug');
    expect(saved.View.OrderByDirection).toBe('DESC');
  });

  test('columns move and hide from the header menu, and ⌘Z undoes', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);
    expect(await headerOrder(page)).toEqual(['Slug', 'Space', 'Labels.app']);

    await menu(page, 'Labels.app', 'Move left');
    await expect.poll(() => headerOrder(page)).toEqual(['Slug', 'Labels.app', 'Space']);

    await menu(page, 'Space', 'Hide column');
    await expect.poll(() => headerOrder(page)).toEqual(['Slug', 'Labels.app']);

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => headerOrder(page)).toEqual(['Slug', 'Labels.app', 'Space']);
  });

  test('a header dragged onto another moves the column', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);
    const from = (await header(page, 'Labels.app').boundingBox())!;
    const to = (await header(page, 'Slug').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => headerOrder(page)).toEqual(['Labels.app', 'Slug', 'Space']);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('a resized column keeps its width after save and reload', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);
    const before = (await header(page, 'Slug').boundingBox())!;
    const edge = (await header(page, 'Slug').getByTestId('vx-resize').boundingBox())!;
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2 + 90, edge.y + edge.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await header(page, 'Slug').boundingBox())!.width)).toBeGreaterThan(before.width + 70);
    await expect(page.getByRole('menu')).toHaveCount(0);

    await saveButton(page).click();
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true');
    const saved = await readView(seed.spaceId, viewId);
    const widths = String(saved.View.Annotations?.[COLUMN_WIDTHS_ANNOTATION] ?? '');
    const width = Number(/(?:^|,)Slug:(\d+)/.exec(widths)?.[1]);
    expect(width).toBeGreaterThan(before.width + 70);

    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);
    await expect.poll(async () => Math.round((await header(page, 'Slug').boundingBox())!.width)).toBe(width);
  });

  test('grouping shows group headers with counts that fold', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);

    await menu(page, 'Labels.app', 'Group by app');
    await expect(groupRows(page)).toHaveCount(2);
    const checkout = groupRows(page).filter({ hasText: 'checkout' });
    await expect(checkout.getByTestId('vx-group-count')).toHaveText('2');
    await expect(groupRows(page).filter({ hasText: 'payments' }).getByTestId('vx-group-count')).toHaveText('1');
    await expect(header(page, 'Labels.app').getByLabel('grouped')).toBeVisible();

    // Header, 2 group headers and 3 rows; each row knows its place.
    await expect(page.getByTestId('vx-table')).toHaveAttribute('aria-rowcount', '6');
    await expect(rows(page).first()).toHaveAttribute('aria-rowindex', '3');

    await checkout.click();
    await expect(checkout.getByTestId('vx-group-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(rows(page)).toHaveCount(1);
    await checkout.click();
    await expect(rows(page)).toHaveCount(3);

    // The keyboard folds a group too.
    await checkout.getByTestId('vx-group-toggle').focus();
    await page.keyboard.press('Enter');
    await expect(rows(page)).toHaveCount(1);
    await page.keyboard.press('Space');
    await expect(rows(page)).toHaveCount(3);

    await menu(page, 'Slug', 'Add as group level');
    await expect(groupRows(page)).toHaveCount(5);
  });

  test('a row opens the drawer below the toolbar, ⌘-click on its name link opens the Unit in a new tab without picking it, and ⌘↵ opens the Unit page', async ({ page, context }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await nameCell(page, 'alpha').click();
    const drawer = page.getByTestId('vx-row-panel');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('alpha');
    const toolbar = (await page.getByTestId('vx-toolbar').boundingBox())!;
    const paper = (await drawer.boundingBox())!;
    expect(paper.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height - 1);
    await expect(rows(page).filter({ hasText: 'alpha' })).toHaveAttribute('data-selected', 'true');
    // The drawer is not modal: what is beside it stays in the accessibility tree.
    await expect(page.getByRole('button', { name: 'Add a column' })).toBeVisible();
    await expect(drawer).toBeFocused();
    // The table stays usable beside the panel, and ↓ / ↑ move the panel to the next row.
    const table = (await page.getByTestId('vx-table').boundingBox())!;
    expect(paper.x).toBeGreaterThanOrEqual(table.x + table.width - 1);
    expect(paper.width).toBeLessThanOrEqual(481);
    const order = await rows(page).locator('[data-column="Slug"]').allInnerTexts();
    const next = order[order.indexOf('alpha') + 1] ?? order[order.indexOf('alpha') - 1];
    await page.keyboard.press(order.indexOf('alpha') < order.length - 1 ? 'ArrowDown' : 'ArrowUp');
    await expect(drawer).toContainText(next);
    // Focus stays in the panel when its row changes, so the next key works too.
    await expect(drawer).toBeFocused();
    await expect(rows(page).filter({ hasText: next })).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press(order.indexOf('alpha') < order.length - 1 ? 'ArrowUp' : 'ArrowDown');
    await expect(drawer).toContainText('alpha');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(rows(page).filter({ hasText: 'alpha' })).toBeFocused();

    // Even in a Units table, where ⌘-click on the rest of the row picks it, ⌘-click on the name
    // link is the browser's: it opens the Unit page in a new tab, and the row stays unpicked.
    const beta = rows(page).filter({ hasText: 'beta' });
    const unit = seed.units.find((u) => u.slug === 'beta')!;
    const link = nameCell(page, 'beta').getByRole('link', { name: 'beta' });
    await expect(link).toHaveAttribute('href', new RegExp(unit.id));
    const tab = context.waitForEvent('page');
    await link.click({ modifiers: ['ControlOrMeta'] });
    const newTab = await tab;
    await expect.poll(() => newTab.url()).toContain(unit.id);
    await newTab.close();
    await expect(beta).toHaveAttribute('data-picked', 'false');
    await expect(page.getByTestId('vx-selection-bar')).toHaveCount(0);
    await expect(drawer).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/x/view-explorer');

    const opened = context.waitForEvent('page');
    await beta.focus();
    await page.keyboard.press('ControlOrMeta+Enter');
    const detail = await opened;
    await expect.poll(() => detail.url()).toContain(unit.id);
    // The Unit page offers the way back to the same explorer tab.
    const back = detail.getByRole('link', { name: 'View explorer', exact: true });
    await expect(back).toBeVisible();
    await back.click();
    await expect.poll(() => new URL(detail.url()).pathname).toBe('/x/view-explorer');
    expect(new URL(detail.url()).searchParams.get('view')).toBe(viewId);
    await expect(detail.locator('[data-testid="vx-tab"][data-active="true"]')).toContainText(name);
    await detail.close();
  });

  test('⌘/Ctrl+Enter on a row opens the Unit page; a ⌘/Ctrl-click on the row outside its name link picks it, and opens the page of a Space', async ({ page, context }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    const unit = seed.units.find((u) => u.slug === 'beta')!;
    const row = rows(page).filter({ hasText: 'beta' });
    const expectUnitPage = async (opened: Promise<Page>) => {
      const detail = await opened;
      await expect.poll(() => detail.url()).toContain(unit.id);
      // Same URL as the name link: it carries the way back to this explorer tab.
      expect(new URL(detail.url()).searchParams.has('explorer')).toBe(true);
      await detail.close();
    };

    await row.focus();
    let opened = context.waitForEvent('page');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expectUnitPage(opened);

    // The padding of a cell other than the name: the row's own area, not the link or a value.
    // In a Units table that ⌘-click picks the row.
    const otherCell = row.locator('[role="cell"][data-column]:not([data-column="Slug"])').first();
    await otherCell.click({ modifiers: ['ControlOrMeta'], position: { x: 3, y: 3 } });
    await expect(row).toHaveAttribute('data-picked', 'true');
    await expect(page.getByTestId('vx-row-panel')).toBeHidden();
    await otherCell.click({ modifiers: ['ControlOrMeta'], position: { x: 3, y: 3 } });
    await expect(row).toHaveAttribute('data-picked', 'false');

    // A Spaces table has no picking, so there the same ⌘-click opens the row's page.
    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    const spaceRow = rows(page).first();
    await expect(spaceRow).toBeVisible();
    const spaceHref = await spaceRow.getByRole('link').first().getAttribute('href');
    expect(spaceHref).toBeTruthy();
    const spaceCell = spaceRow.locator('[role="cell"][data-column]').nth(1);
    opened = context.waitForEvent('page');
    await spaceCell.click({ modifiers: ['ControlOrMeta'], position: { x: 3, y: 3 } });
    const spacePage = await opened;
    await expect.poll(() => new URL(spacePage.url()).pathname).toBe(new URL(spaceHref!, 'http://x').pathname);
    await spacePage.close();
    await expect(page.getByTestId('vx-row-panel')).toBeHidden();
  });

  test('Save stays usable while the drawer is open, and the drawer closes on another entity', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await menu(page, 'Slug', 'Sort descending');
    await nameCell(page, 'alpha').click();
    const drawer = page.getByTestId('vx-row-panel');
    await expect(drawer).toBeVisible();

    await saveButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true');
    await expect(drawer).toBeVisible();

    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    await expect(drawer).toBeHidden();
  });

  test('the keyboard opens a header menu, resizes a column, and leaves values to themselves', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);

    await header(page, 'Slug').getByRole('button', { name: /column menu$/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Sort ascending' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    const edge = header(page, 'Slug').getByTestId('vx-resize');
    const before = Number(await edge.getAttribute('aria-valuenow'));
    // Holding the key repeats it; its release commits the width as one step.
    await edge.focus();
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.up('ArrowRight');
    await expect(edge).toHaveAttribute('aria-valuenow', String(before + 24));
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    // ⌘Z is a page shortcut: wait until nothing has focus, then wait for its result (not for time).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page.locator(':focus')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(edge).toHaveAttribute('aria-valuenow', String(before), { timeout: 15_000 });
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true', { timeout: 15_000 });

    // Enter on a value or a status chip is theirs; it does not open the row.
    await page.getByTestId('vx-add-column').click();
    await page.getByRole('menuitem', { name: 'Status', exact: true }).click();
    const alpha = rows(page).filter({ hasText: 'alpha' });
    await alpha.locator('[data-vx-value="Labels.app"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('vx-row-panel')).toBeHidden();
    await page.keyboard.press('Escape');
    await alpha.locator('[data-vx-status]').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('vx-row-panel')).toBeHidden();
  });

  test('a click on a resize edge changes nothing', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);
    await header(page, 'Slug').getByTestId('vx-resize').click();
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true');
    await header(page, 'Slug').getByTestId('vx-resize').dblclick();
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true');

    // On the built-in tab, a click on the edge does not open a temporary tab.
    await openExplorer(page, '/x/view-explorer');
    await expect(page.locator('[data-testid="vx-header"][data-column="Slug"]')).toBeVisible();
    await header(page, 'Slug').getByTestId('vx-resize').click();
    await expect(page.locator('[data-testid="vx-tab"][data-tab-kind="temp"]')).toHaveCount(0);
  });

  test('columns are sized to their content: names get the room, revisions read as r2, the + list scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);

    await page.getByTestId('vx-add-column').click();
    const list = page.getByTestId('vx-add-column-list');
    expect((await list.boundingBox())!.height).toBeLessThanOrEqual(360);
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    // The headings of the Units page's Columns panel, in its order, each field under its own.
    await expect(list.getByTestId('vx-add-column-heading')).toContainText(['Core Identity', 'Status & Health', 'Revisions', 'Timestamps']);
    await expect(list.getByRole('menuitem', { name: 'Target', exact: true })).toHaveAttribute('data-group', 'Core Identity');
    await expect(list.getByRole('menuitem', { name: 'Released revision', exact: true })).toHaveAttribute('data-group', 'Revisions');
    await expect(list.getByRole('menuitem', { name: 'Created', exact: true })).toHaveAttribute('data-group', 'Timestamps');
    // A search leaves only the headings with a match.
    await page.getByPlaceholder('Find a field').fill('released revision');
    await expect(list.getByTestId('vx-add-column-heading')).toHaveText(['Revisions']);
    await page.getByPlaceholder('Find a field').fill('');
    await page.getByRole('menuitem', { name: 'Status', exact: true }).click();
    await page.getByTestId('vx-add-column').click();
    await page.getByRole('menuitem', { name: 'Released revision', exact: true }).click();

    // The Space column has the room it needs; the status column only what its chip needs.
    const spaceCell = rows(page).first().locator('[data-column="Space"]');
    expect(await spaceCell.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await header(page, 'Status').boundingBox())!.width).toBeLessThanOrEqual(200);

    // Never released: a dash, under a short header.
    await expect(header(page, 'LastReleasedRevisionNum')).toContainText('Released');
    await expect(rows(page).first().locator('[data-column="LastReleasedRevisionNum"]')).toHaveText('—');
  });

  test('a Spaces view leaves out a Component column no Space fills', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    await expect(header(page, 'Slug')).toBeVisible();
    const anyComponent = await hubApi.get('/api/space', { params: { where: 'ComponentID IS NOT NULL', select: 'SpaceID' } });
    const someHaveOne = ((await anyComponent.json()) as unknown[]).length > 0;
    await expect(header(page, 'Component')).toHaveCount(someHaveOne ? 1 : 0);

    // The headings of the Spaces page's Columns panel.
    await page.getByTestId('vx-add-column').click();
    const fieldList = page.getByTestId('vx-add-column-list');
    await expect(fieldList.getByTestId('vx-add-column-heading')).toContainText(['Core Identity', 'Units', 'Timestamps']);
    await expect(fieldList.getByRole('menuitem', { name: 'Unlinked units', exact: true })).toHaveAttribute('data-group', 'Units');
    await page.keyboard.press('Escape');
    await expect(fieldList).toBeHidden();
    test.skip(someHaveOne, 'a Space on this server has a Component, so the column is shown');

    // The left-out column is still part of the view: "+" does not offer it again.
    await page.getByTestId('vx-add-column').click();
    await expect(page.getByTestId('vx-add-column-list').getByRole('menuitem', { name: 'Component', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Moves are among the columns on screen: Move left passes over the left-out column.
    const shown = await headerOrder(page);
    await menu(page, shown[1]!, 'Move left');
    await expect.poll(() => headerOrder(page)).toEqual([shown[1], shown[0], ...shown.slice(2)]);
  });

  test('a computed column keeps its definition through a width reset, hide and add back, and Save as new', async ({ page }) => {
    const source = `Replicas ${RandomSlugGenerator.randomSlugName()}`;
    const copy = `Copy ${RandomSlugGenerator.randomSlugName()}`;
    const view = await seed.createView({
      name: source,
      columns: [
        { Name: 'Slug' },
        { Name: 'Replicas', ColumnType: 'DataPath', DataType: 'int', ColumnSource: { DataPath: { Path: 'spec.replicas', WhereResource: "ResourceType = 'apps/v1/Deployment'" } } },
      ],
    });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(rows(page)).toHaveCount(3);

    // A width, then the double-click reset.
    const edge = header(page, 'Replicas').getByTestId('vx-resize');
    await edge.focus();
    await page.keyboard.down('ArrowRight');
    await page.keyboard.up('ArrowRight');
    await expect(tabNamed(page, source)).toHaveAttribute('data-dirty', 'true');
    await edge.dblclick();

    // Hidden, then added back from this view's own columns.
    await menu(page, 'Replicas', 'Hide column');
    await expect(header(page, 'Replicas')).toHaveCount(0);
    await page.getByTestId('vx-add-column').click();
    await page.getByTestId('vx-add-column-list').getByRole('menuitem', { name: 'Replicas', exact: true }).click();
    await expect(header(page, 'Replicas')).toBeVisible();
    // Back exactly as saved, definition included: nothing to save.
    await expect(tabNamed(page, source)).not.toHaveAttribute('data-dirty', 'true');

    await menu(page, 'Slug', 'Sort descending');
    await page.getByTestId('vx-save-actions').getByRole('button', { name: 'Save as new' }).click();
    await page.getByRole('textbox', { name: 'Name for the new view' }).fill(copy);
    await page.getByTestId('vx-name-card').getByRole('button', { name: 'Save view' }).click();
    await expect(page.getByText(`Saved “${copy}” in confighub-system.`)).toBeVisible();

    const [saved] = await viewsNamed(copy);
    const read = await readView(saved.View.SpaceID, saved.View.ViewID);
    const replicas = (read.View.Columns as Array<{ Name: string; ColumnSource?: { DataPath?: { Path?: string } } }>).find((c) => c.Name === 'Replicas');
    expect(replicas?.ColumnSource?.DataPath?.Path).toBe('spec.replicas');
    // Leave the page first: it may still be reading the views the save touched, and a read of one deleted under it
    // fails with a 404 that the console check counts.
    await page.goto('about:blank');
    await cleanUp(copy);
    await cleanUp(source);
  });

  test('the toolbar switches layout and entity', async ({ page }) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('vx-count')).toContainText('3 of');

    // The layouts are Table, Board and Matrix; there is no List.
    await expect(page.getByRole('group', { name: 'Layout' }).getByRole('button')).toHaveText(['Table', 'Board', 'Matrix']);
    await page.getByTestId('vx-layout-board').click();
    await expect(page.getByTestId('vx-table')).toHaveCount(0);
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    await page.getByTestId('vx-layout-table').click();
    await expect(rows(page)).toHaveCount(3);

    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    await expect(page.getByTestId('vx-entity')).toHaveText(/Spaces/);
    await expect(page.getByTestId('vx-count')).toContainText(/spaces?$/);
    expect((await headerOrder(page))[0]).toBe('Slug');
  });
});

test.describe('view explorer table at scale', () => {
  test.use({ storageState: 'authentication.json' });

  /** 5,000 Units in 25 Spaces, served instead of the real Units list. */
  function units(count: number) {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => {
      const space = `perf-space-${String(i % 25).padStart(2, '0')}`;
      const head = 5 + (i % 30);
      return {
        Unit: {
          UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          Slug: `unit-${String(i).padStart(4, '0')}`,
          SpaceID: `space-${i % 25}`,
          TargetID: i % 7 === 0 ? '' : `target-${i % 3}`,
          ToolchainType: i % 5 === 0 ? 'OpenTofu/HCL' : 'Kubernetes/YAML',
          Labels: { app: `app-${i % 40}`, tier: i % 2 ? 'api' : 'web' },
          HeadRevisionNum: head,
          LastReleasedRevisionNum: i % 3 === 0 ? head - 1 : head,
          UpstreamRevisionNum: 0,
          UpdatedAt: new Date(now - i * 60_000).toISOString(),
          CreatedAt: new Date(now - i * 120_000).toISOString(),
        },
        Space: { SpaceID: `space-${i % 25}`, Slug: space },
        Target: i % 7 === 0 ? undefined : { TargetID: `target-${i % 3}`, Slug: `k8s-${i % 3}` },
      };
    });
  }

  /** Scroll the table to the end, a step per frame, and return the long tasks seen while doing it. */
  async function scrollThrough(page: Page): Promise<number[]> {
    await page.waitForTimeout(500);
    await page.evaluate(() => ((window as unknown as { __longTasks: number[] }).__longTasks = []));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const el = document.querySelector('[data-testid="vx-table"]') as HTMLElement;
          let frames = 0;
          const step = () => {
            el.scrollTop += 240;
            frames++;
            if (frames < 240 && el.scrollTop + el.clientHeight < el.scrollHeight) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        }),
    );
    const tasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
    // Only tasks over the budget count: a shared CI runner makes some short ones long.
    return tasks.filter((ms) => ms >= LONG_TASK_BUDGET_MS).map((ms) => Math.round(ms));
  }

  test('inside a long group, its header and its parent stay pinned under the column header', async ({ page }) => {
    const ariaHidden: string[] = [];
    page.on('console', (m: ConsoleMessage) => {
      if (/aria-hidden/i.test(m.text())) ariaHidden.push(m.text());
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    const body = JSON.stringify(units(5000));
    await page.route(/\/api\/unit(\?|$)/, (route: Route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body }) : route.continue(),
    );
    await openExplorer(page, '/x/view-explorer', '5000 of 5000');
    // Target, then Space: some 57 Units in each Space of a Target, far more than fit on screen.
    for (const field of ['Target', 'Space']) {
      await page.getByTestId('vx-group-add').click();
      await page.getByRole('menuitem', { name: field, exact: true }).click();
    }
    await expect(page.getByTestId('vx-group-level')).toHaveCount(2);
    const pinned = page.getByTestId('vx-pinned-group-row');
    await expect(pinned).toHaveCount(0);
    const outer = await groupRows(page).nth(0).getAttribute('data-group-key');
    const inner = await groupRows(page).nth(1).getAttribute('data-group-key');
    expect(inner?.startsWith(`${outer}/`)).toBe(true);

    // Twenty rows into the first Space.
    const table = page.getByTestId('vx-table');
    await table.evaluate((el) => (el.scrollTop = 2 * 36 + 20 * 38));
    await expect(pinned).toHaveCount(2);
    await expect(pinned.nth(0)).toHaveAttribute('data-group-key', outer!);
    await expect(pinned.nth(1)).toHaveAttribute('data-group-key', inner!);
    const columnHeader = (await table.locator('[role="row"][aria-rowindex="1"]').boundingBox())!;
    const first = (await pinned.nth(0).boundingBox())!;
    const second = (await pinned.nth(1).boundingBox())!;
    expect(Math.abs(first.y - (columnHeader.y + columnHeader.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(second.y - (first.y + 36))).toBeLessThanOrEqual(1);
    // What is pinned is what is on top: no row shows through or covers it.
    const onTop = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
      { x: second.x + second.width - 20, y: second.y + second.height / 2 },
    );
    expect(onTop).toBe('vx-pinned-group-row');

    // Moved right by the checkbox track like the rows, the pinned headers start where the Unit names do.
    const nameLeft = await rows(page)
      .first()
      .locator('[data-column="Slug"]')
      .evaluate((el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));
    const pinnedChevron = (await pinned.nth(0).getByTestId('vx-pinned-group-toggle').locator('svg').boundingBox())!;
    expect(Math.abs(pinnedChevron.x - nameLeft)).toBeLessThanOrEqual(2);

    // The copy's buttons are named apart from the row's own.
    await expect(pinned.nth(1).getByTestId('vx-pinned-group-toggle')).toHaveAccessibleName(/\(pinned\)$/);
    // Folding from the pinned copy folds the group and brings its own header back into place.
    await pinned.nth(1).getByTestId('vx-pinned-group-toggle').click();
    await expect(groupRows(page).and(page.locator(`[data-group-key="${inner}"]`))).toHaveAttribute('data-collapsed', 'true');
    await expect(pinned).toHaveCount(0);
    expect(ariaHidden).toEqual([]);
  });

  test('5,000 rows scroll with no long task, flat and grouped', async ({ page }) => {
    // A budget measures the machine as much as the page: under SLOW_MODE's artificial
    // CPU throttle it measures the throttle, so it is checked only without one (CI runs without).
    test.skip(!!process.env.SLOW_MODE, 'timing budgets are not meaningful under SLOW_MODE');
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    const body = JSON.stringify(units(5000));
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
    expect(await rows(page).count()).toBeLessThan(80);
    expect(await scrollThrough(page), 'long tasks while scrolling flat rows (ms)').toEqual([]);
    expect(await rows(page).count()).toBeLessThan(80);

    // Grouped by Space: 25 group headers among the rows.
    await page.getByTestId('vx-table').evaluate((el) => (el.scrollTop = 0));
    await menu(page, 'Space', 'Group by Space');
    await expect(groupRows(page).first()).toBeVisible();
    expect(await scrollThrough(page), 'long tasks while scrolling grouped rows (ms)').toEqual([]);
    expect(await rows(page).count() + (await groupRows(page).count())).toBeLessThan(80);
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });
});
