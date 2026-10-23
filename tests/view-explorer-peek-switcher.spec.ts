// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page } from '@playwright/test';

import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import type { Lens, ViewDef } from '../src/pages/x/view-explorer/model/types';
import { encodeDraftParam } from '../src/pages/x/view-explorer/model/view-codec';
import { matchesWordPrefixes } from '../src/pages/x/view-explorer/switcher/match';
import { expect, test } from './fixtures/test';
import { hubApi } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import {
  type ExplorerSeed,
  openExplorer,
  seedExplorer,
  viewsNamed,
} from './fixtures/view-explorer-seed';

/**
 * Peeks (a slice of the view in a card: deeper and Back, Add as filter, Pin as
 * draft), the ⌘P view switcher, and the "?" shortcut map.
 */

const rows = (page: Page) => page.getByTestId('vx-row');
const activeTab = (page: Page) => page.locator('[data-testid="vx-tab"][data-active]');
/**
 * No closed layer is left on the page: on a busy page a closed MUI menu or
 * popover can keep its invisible root mounted, and that root takes every click.
 * Tooltips are left out (their poppers never take clicks).
 */
async function expectNoLayers(page: Page) {
  await expect(
    page.locator('.MuiPopover-root, .MuiDialog-root, .MuiMenu-root, .MuiModal-root'),
  ).toHaveCount(0, {
    timeout: 5000,
  });
  await expect(page.locator('.MuiPopper-root:not(.MuiTooltip-popper)')).toHaveCount(0, {
    timeout: 5000,
  });
}

const peek = (page: Page) => page.getByTestId('vx-peek');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const uniqueName = (prefix: string) => `${prefix} ${RandomSlugGenerator.randomSlugName()}`;

function draftOf(seed: ExplorerSeed, lenses: Lens[], patch: Partial<ViewDef> = {}): ViewDef {
  const columns = [
    { name: 'Slug' },
    { name: 'Space' },
    { name: 'Labels.app' },
    { name: 'Labels.tier' },
  ];
  const space: Lens = {
    id: 'space',
    enabled: true,
    kind: 'field',
    field: 'Space',
    op: 'is',
    values: [seed.spaceSlug],
  };
  return {
    ...defaultViewDef('Unit'),
    columns,
    sort: { column: 'Slug', dir: 'ASC' },
    lenses: [space, ...lenses],
    ...patch,
  };
}

async function cleanUp(name: string) {
  for (const v of await viewsNamed(name)) {
    await hubApi.delete(`/api/space/${v.View.SpaceID}/view/${v.View.ViewID}`);
    if (v.View.FilterID)
      await hubApi.delete(`/api/space/${v.View.SpaceID}/filter/${v.View.FilterID}`);
  }
}

test('view names match by word prefix', () => {
  expect(matchesWordPrefixes('Payments in prod', 'pay prod')).toBe(true);
  expect(matchesWordPrefixes('Payments in prod', 'pro')).toBe(true);
  expect(matchesWordPrefixes('Payments in prod', 'ments')).toBe(false);
  expect(matchesWordPrefixes('vx-demo-unreleased-prod', 'unrel')).toBe(true);
  expect(matchesWordPrefixes('Anything', '')).toBe(true);
});

test.describe('view explorer peeks, switcher and shortcuts', () => {
  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  let seed: ExplorerSeed;
  let problems: string[];

  test.beforeEach(async ({ page }) => {
    problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text())))
        problems.push(`${m.type()}: ${m.text()}`);
    });
    seed = await seedExplorer(page);
  });

  test.afterEach(async () => {
    await seed.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  async function openGrouped(page: Page) {
    const view = await seed.createView({ name: uniqueName('Peek') });
    await openExplorer(
      page,
      `/x/view-explorer?view=${view.viewId}&d=${encodeDraftParam(draftOf(seed, [], { groupBy: ['Labels.app', 'Labels.tier'] }))}`,
    );
    await expect(rows(page)).toHaveCount(3);
    return view;
  }

  test('a group count peeks at its slice; deeper and Back; Esc closes', async ({ page }) => {
    await openGrouped(page);
    await page.getByRole('button', { name: /^Peek at 2 in app checkout/ }).click();
    await expect(peek(page)).toBeVisible();
    await expect(page.getByTestId('vx-peek-count')).toHaveText('2');
    await expect(page.getByTestId('vx-peek-row')).toHaveCount(2);
    // The peek's cells are plain text: nothing in them looks or acts like a control.
    await expect(page.getByTestId('vx-peek-table').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('vx-peek-conditions')).toContainText('checkout');

    await page.getByTestId('vx-peek-subgroup').filter({ hasText: 'web' }).click();
    await expect(page.getByTestId('vx-peek-count')).toHaveText('1');
    await page.getByTestId('vx-peek-back').click();
    await expect(page.getByTestId('vx-peek-count')).toHaveText('2');

    await page.keyboard.press('Escape');
    await expect(peek(page)).toHaveCount(0);
    await expectNoLayers(page);
    await expect(rows(page)).toHaveCount(3);
  });

  test('P pins the slice as a temporary tab with the lower group level; the view stays clean', async ({
    page,
  }) => {
    const view = await openGrouped(page);
    await page.getByRole('button', { name: /^Peek at 2 in app checkout/ }).click();
    await expect(peek(page)).toBeVisible();
    await page.keyboard.press('p');
    await expect(peek(page)).toHaveCount(0);
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', 'temp');
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByTestId('vx-group-level')).toHaveCount(1);
    await expect(page.getByTestId('vx-group-level').first()).toHaveAttribute(
      'data-field',
      'Labels.tier',
    );

    // The source view is as it was: one lens, all three rows, both group levels.
    await page.getByTestId('vx-tab').filter({ hasText: view.name }).click();
    await expect(page.getByTestId('vx-lens')).toHaveCount(1);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('vx-group-level')).toHaveCount(2);
  });

  test('Add as filter narrows the view itself', async ({ page }) => {
    await openGrouped(page);
    await page.getByRole('button', { name: /^Peek at 2 in app checkout/ }).click();
    await page.getByTestId('vx-peek-add').click();
    await expect(peek(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByTestId('vx-lens').filter({ hasText: 'checkout' })).toHaveCount(1);
    await expect(page.getByTestId('vx-group-level')).toHaveCount(1);
    // The filter and the grouping change together, so one undo puts both back.
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press(`${mod}+z`);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('vx-lens').filter({ hasText: 'checkout' })).toHaveCount(0);
    await expect(page.getByTestId('vx-group-level')).toHaveCount(2);
  });

  test('⌘P finds a view by word prefix, opens it, and ⌥Enter pins it', async ({ page }) => {
    const name = uniqueName('Switcher target');
    await seed.createView({ name });
    await openExplorer(page, '/x/view-explorer');
    await expect(page.getByTestId('vx-tab').first()).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 400 } });

    await page.keyboard.press(`${mod}+p`);
    const input = page.getByTestId('vx-switcher-input');
    await expect(input).toBeFocused();
    await input.fill(name.split(' ').slice(1).join(' '));
    await expect(page.getByTestId('vx-switcher-item')).toHaveCount(1);
    // ⌥Enter moves it to the other section (a new view may start pinned: the newest views are pinned by default).
    const pinnedSection = page.getByTestId('vx-switcher-pinned');
    const wasPinned = (await pinnedSection.getByText(name).count()) > 0;
    const activeBefore = await input.getAttribute('aria-activedescendant');
    await input.press('Alt+Enter');
    await expect(pinnedSection.getByText(name)).toHaveCount(wasPinned ? 0 : 1);
    // The highlight stays on the same view as it moves to the other section.
    await expect(input).toHaveAttribute('aria-activedescendant', activeBefore ?? '');
    await expect(page.locator(`[id="${activeBefore}"]`)).toContainText(name);
    // A click on the pin mark keeps the focus in the input.
    await page.getByTestId('vx-switcher-pin').first().click();
    await expect(input).toBeFocused();
    await page.getByTestId('vx-switcher-pin').first().click();
    await expect(pinnedSection.getByText(name)).toHaveCount(wasPinned ? 0 : 1);
    await input.press('Alt+Enter');
    await expect(pinnedSection.getByText(name)).toHaveCount(wasPinned ? 1 : 0);
    await input.press('Enter');
    await expect(page.getByTestId('vx-switcher')).toHaveCount(0);
    await expect(activeTab(page)).toContainText(name);

    // Keys typed straight after the click land in the switcher, not on the page.
    await page.getByTestId('vx-more-views').click();
    await page.keyboard.type('unre');
    await expect(page.getByTestId('vx-switcher-input')).toHaveValue('unre');
    await expect(activeTab(page)).toContainText(name);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vx-switcher')).toHaveCount(0);
    await expectNoLayers(page);
    await cleanUp(name);
  });

  test('the switcher is a named dialog with a listbox of plain options in labelled groups', async ({
    page,
  }) => {
    // A view of its own, so the list is not empty in a fresh organization.
    const listed = uniqueName('Listed');
    await seed.createView({ name: listed });
    await openExplorer(page, '/x/view-explorer');
    await expect(page.getByTestId('vx-tab').first()).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press(`${mod}+p`);
    await expect(page.getByRole('dialog', { name: 'Open a view' })).toBeVisible();
    const list = page.getByRole('listbox', { name: 'Views' });
    await expect(
      list
        .getByRole('group', { name: 'All shared views' })
        .or(list.getByRole('group', { name: 'Pinned by you' }))
        .first(),
    ).toBeVisible();
    await expect(list.getByRole('option').first()).toBeVisible();
    await expect(list.getByRole('option').getByRole('button')).toHaveCount(0);
    // While it is open, page shortcuts do not act: `n` is typed into the box.
    const kind = await activeTab(page).getAttribute('data-tab-kind');
    await page.keyboard.press('n');
    await expect(page.getByTestId('vx-switcher-input')).toHaveValue('n');
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', kind ?? '');
  });

  test('a peek ends when the view changes, with no warning', async ({ page }) => {
    await openGrouped(page);
    await page.getByRole('button', { name: /^Peek at 2 in app checkout/ }).click();
    await expect(peek(page)).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await expect(peek(page)).toHaveCount(0);
    await page.getByRole('button', { name: /^Peek at 2 in app checkout/ }).click();
    await expect(peek(page)).toBeVisible();
    await page.keyboard.press(']');
    await expect(peek(page)).toHaveCount(0);
    await page.keyboard.press('[');
    await expect(rows(page)).toHaveCount(3);
    await expect(peek(page)).toHaveCount(0);
  });

  test('? lists the shortcuts the page has now', async ({ page }) => {
    await openExplorer(page, '/x/view-explorer');
    await expect(page.getByTestId('vx-tab').first()).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('?');
    const map = page.getByTestId('vx-shortcut-map');
    await expect(map).toBeVisible();
    for (const label of [
      'Save the view',
      'Open a view',
      'Add a filter',
      'Show the keyboard shortcuts',
    ]) {
      await expect(map.getByTestId('vx-shortcut').filter({ hasText: label })).toHaveCount(1);
    }
    // Keys that act only while something is open are listed too.
    await expect(
      map.getByTestId('vx-shortcut').filter({ hasText: 'Pin the open peek' }),
    ).toHaveCount(1);
    await expect(
      map.getByTestId('vx-shortcut').filter({ hasText: 'Close the open peek' }),
    ).toHaveCount(1);
    // While the map is open, page shortcuts do not act.
    const kind = await activeTab(page).getAttribute('data-tab-kind');
    await page.keyboard.press('n');
    await expect(map).toBeVisible();
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', kind ?? '');
    await page.keyboard.press('Escape');
    await expect(map).toHaveCount(0);
    await expectNoLayers(page);
  });
});
