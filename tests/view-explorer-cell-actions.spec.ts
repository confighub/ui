// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Locator, Page } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import {
  type ExplorerSeed,
  openExplorer,
  seedExplorer,
  viewsNamed,
} from './fixtures/view-explorer-seed';

/**
 * Touching the data: a click on a value offers Only this · Exclude · Group by ·
 * Sort; ⇧-click picks several values; the new lens is announced by a chip that
 * flies to it (to its rail dot when the column is collapsed); and a column
 * header dropped on the Group section groups the rows.
 */

const rows = (page: Page) => page.getByTestId('vx-row');
const popover = (page: Page) => page.getByTestId('vx-cell-popover');
const lensRows = (page: Page) => page.getByTestId('vx-lens');
const header = (page: Page, column: string) =>
  page.locator(`[data-testid="vx-header"][data-column="${column}"]`);
const valueIn = (page: Page, slug: string, field: string) =>
  rows(page).filter({ hasText: slug }).locator(`[data-vx-value="${field}"]`).first();

/**
 * Record every fly-in chip that takes off, by its lens id. A flight lasts about
 * half a second, which a slow machine can finish between two polls of an
 * assertion, so the page records it as it happens.
 */
async function recordFlights(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { vxFlights: string[] };
    w.vxFlights = [];
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (
          el.dataset?.testid === 'vx-fly-in' &&
          el.dataset.flying === 'true' &&
          el.dataset.lensId
        )
          w.vxFlights.push(el.dataset.lensId);
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-flying'],
    });
  });
  return () => page.evaluate(() => (window as unknown as { vxFlights: string[] }).vxFlights);
}

/**
 * Nothing left over takes clicks where a cell is: a closed popover or a
 * landed fly-in chip must not stay mounted (even invisible) over the data.
 */
async function nothingCovers(page: Page, target: Locator) {
  await expect(popover(page)).toHaveCount(0);
  await expect(page.getByTestId('vx-fly-in')).toHaveCount(0);
  await expect(
    page.locator('.MuiPopover-root, .MuiPopper-root:has([data-testid="vx-cell-popover"])'),
  ).toHaveCount(0);
  const box = await target.boundingBox();
  if (!box) throw new Error('target not on screen');
  const hit = await target.evaluate(
    (el, p) => {
      const at = document.elementFromPoint(p.x, p.y);
      return !!at && (el === at || el.contains(at));
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit, 'a click on the cell reaches the cell').toBe(true);
}

async function cleanUp(name: string) {
  for (const v of await viewsNamed(name)) {
    await hubApi.delete(`/api/space/${v.View.SpaceID}/view/${v.View.ViewID}`);
    if (v.View.FilterID)
      await hubApi.delete(`/api/space/${v.View.SpaceID}/filter/${v.View.FilterID}`);
  }
}

test.describe('view explorer cell actions', () => {
  test.use({ storageState: 'authentication.json' });

  let seed: ExplorerSeed;
  let problems: string[];
  let name: string;
  let viewId: string;

  test.beforeEach(async ({ page }) => {
    problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text())))
        problems.push(`${m.type()}: ${m.text()}`);
    });
    seed = await seedExplorer(page);
    name = `Cells ${RandomSlugGenerator.randomSlugName()}`;
    viewId = (
      await seed.createView({
        name,
        columns: [
          { Name: 'Slug' },
          { Name: 'Space' },
          { Name: 'ToolchainType' },
          { Name: 'Labels.app' },
          { Name: 'Labels.tier' },
        ],
      })
    ).viewId;
  });

  test.afterEach(async () => {
    await cleanUp(name);
    await seed.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('Only this adds a lens, a chip flies to it, and the rows narrow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);
    const before = await lensRows(page).count();
    const flights = await recordFlights(page);

    await valueIn(page, 'gamma', 'Labels.app').click();
    await expect(popover(page)).toBeVisible();
    await expect(popover(page).getByTestId('vx-cell-popover-value')).toHaveText(['payments']);
    await popover(page)
      .getByRole('menuitem', { name: /Only this/ })
      .click();

    await expect(popover(page)).toHaveCount(0);
    await expect.poll(flights).toHaveLength(1);
    await expect(lensRows(page)).toHaveCount(before + 1);
    await expect(lensRows(page).last()).toContainText('payments');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('gamma');
    await expect(page.getByTestId('vx-fly-in')).toHaveCount(0);
    await nothingCovers(page, valueIn(page, 'gamma', 'Labels.tier'));
  });

  test('⇧-click picks several values, and E excludes them all', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);

    await valueIn(page, 'alpha', 'Labels.tier').click();
    await valueIn(page, 'beta', 'Labels.tier').click({ modifiers: ['Shift'] });
    await expect(popover(page).getByTestId('vx-cell-popover-value')).toHaveText([
      'web',
      'api',
    ]);
    // The chips stay on one line: the popover does not grow when a value is added.
    const tops = await popover(page)
      .getByTestId('vx-cell-popover-value')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    await expect(page.locator('[data-vx-selected="true"]')).toHaveCount(2);
    await expect(
      popover(page).getByRole('menuitem', { name: /Exclude these 2/ }),
    ).toBeVisible();

    await page.keyboard.press('e');
    await expect(popover(page)).toHaveCount(0);
    await expect(page.locator('[data-vx-selected="true"]')).toHaveCount(0);
    // The lens row shows the first value and "+1" for the rest.
    await expect(lensRows(page).last()).toContainText('web');
    await expect(lensRows(page).last()).toContainText('+1');
    await expect(rows(page)).toHaveCount(0);
  });

  test('a ⇧-click on a picked value drops it; Esc and a click elsewhere close the popover', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await valueIn(page, 'alpha', 'Labels.app').click();
    await valueIn(page, 'gamma', 'Labels.app').click({ modifiers: ['Shift'] });
    await expect(popover(page).getByTestId('vx-cell-popover-value')).toHaveCount(2);
    await valueIn(page, 'gamma', 'Labels.app').click({ modifiers: ['Shift'] });
    await expect(popover(page).getByTestId('vx-cell-popover-value')).toHaveText(['checkout']);
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    await nothingCovers(page, valueIn(page, 'gamma', 'Labels.app'));

    await valueIn(page, 'beta', 'Labels.tier').click();
    await expect(popover(page)).toBeVisible();
    await page.getByTestId('vx-toolbar').click({ position: { x: 5, y: 5 } });
    await expect(popover(page)).toHaveCount(0);
    await nothingCovers(page, valueIn(page, 'alpha', 'Labels.tier'));
    // The cell takes a click at once: the popover opens again.
    await valueIn(page, 'alpha', 'Labels.tier').click();
    await expect(popover(page)).toBeVisible();
  });

  test('a layout key or a tab switch drops the selection; it does not come back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await valueIn(page, 'alpha', 'Labels.app').click();
    await expect(popover(page)).toBeVisible();
    await page.keyboard.press('b');
    await expect(popover(page)).toHaveCount(0);
    await page.keyboard.press('t');
    await expect(rows(page)).toHaveCount(3);
    await expect(popover(page)).toHaveCount(0);
    await expect(page.locator('[data-vx-selected="true"]')).toHaveCount(0);

    await valueIn(page, 'alpha', 'Labels.app').click();
    await expect(popover(page)).toBeVisible();
    await page.keyboard.press('[');
    await expect(popover(page)).toHaveCount(0);
    // Back to this view by name: other specs running at the same time add tabs,
    // so `]` may not land on it.
    await page.getByTestId('vx-tab').filter({ hasText: name }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(popover(page)).toHaveCount(0);
    await nothingCovers(page, valueIn(page, 'alpha', 'Labels.app'));
  });

  test('the keyboard reaches the popover, and focus never falls to the page body', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    const cell = valueIn(page, 'alpha', 'Labels.app');
    const focusIn = (testId: string) =>
      page.evaluate(
        (id) => !!document.activeElement?.closest(`[data-testid="${id}"]`),
        testId,
      );

    // Opened from the keyboard: focus moves into the menu; arrows move; Esc gives it back to the cell.
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(popover(page)).toBeVisible();
    await expect.poll(() => focusIn('vx-cell-popover')).toBe(true);
    await expect(popover(page).getByRole('menuitem', { name: /Only this/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(popover(page).getByRole('menuitem', { name: /Exclude/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    await expect(cell).toBeFocused();

    // Opened with the mouse: ArrowDown from the cell enters the menu; Tab leaves and closes it.
    await cell.click();
    await page.keyboard.press('ArrowDown');
    await expect(popover(page).getByRole('menuitem', { name: /Only this/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(popover(page)).toHaveCount(0);
    await expect(cell).toBeFocused();

    // After an action the rows change; focus goes to the table, not the body.
    await cell.click();
    await popover(page)
      .getByRole('menuitem', { name: /Exclude/ })
      .click();
    await expect(rows(page)).toHaveCount(1);
    await expect.poll(() => focusIn('vx-table')).toBe(true);
    // A value, with its normal focus ring; not the row, whose focus style is the selection outline.
    await expect
      .poll(() =>
        page.evaluate(() => document.activeElement?.hasAttribute('data-vx-value') ?? false),
      )
      .toBe(true);
  });

  test('Sort is reached with the arrow keys', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await valueIn(page, 'alpha', 'Labels.tier').focus();
    await page.keyboard.press('Enter');
    const descending = popover(page).getByRole('menuitem', { name: /Sort descending/ });
    for (
      let i = 0;
      i < 6 && !(await descending.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(descending).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(header(page, 'Labels.tier')).toHaveAttribute('aria-sort', 'descending');
  });

  test('in Board, focus stays in the layout after an action', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);
    const focusIn = (testId: string) =>
      page.evaluate(
        (id) => !!document.activeElement?.closest(`[data-testid="${id}"]`),
        testId,
      );

    await page.keyboard.press('b');
    const boardValue = page.getByTestId('vx-board').locator('[data-vx-value]').first();
    await boardValue.click();
    await popover(page)
      .getByRole('menuitem', { name: /Exclude/ })
      .click();
    await expect.poll(() => focusIn('vx-board')).toBe(true);
  });

  test('G groups by the column, and the sort buttons sort it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await valueIn(page, 'alpha', 'Labels.app').click();
    await page.keyboard.press('g');
    await expect(page.getByTestId('vx-group-row')).toHaveCount(2);

    await valueIn(page, 'beta', 'Labels.tier').click();
    await popover(page)
      .getByRole('menuitem', { name: /Sort descending/ })
      .click();
    await expect(header(page, 'Labels.tier')).toHaveAttribute('aria-sort', 'descending');
  });

  test('a group header value opens the same popover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await valueIn(page, 'alpha', 'Labels.app').click();
    await page.keyboard.press('g');
    const groups = page.getByTestId('vx-group-row');
    await expect(groups).toHaveCount(2);

    await groups
      .filter({ hasText: 'payments' })
      .locator('[data-vx-value="Labels.app"]')
      .click();
    await expect(popover(page).getByTestId('vx-cell-popover-value')).toHaveText(['payments']);
    await expect(groups).toHaveCount(2);
    await popover(page)
      .getByRole('menuitem', { name: /Exclude/ })
      .click();
    await expect(groups).toHaveCount(1);
    await expect(rows(page)).toHaveCount(2);
  });

  test('a header dropped on Group groups the rows, and no header stays highlighted', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);

    const from = await header(page, 'ToolchainType').boundingBox();
    const to = await page.getByTestId('vx-group-drop').boundingBox();
    if (!from || !to) throw new Error('no boxes');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, {
      steps: 4,
    });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 });
    await page.mouse.up();

    await expect(page.getByTestId('vx-group-level')).toHaveCount(1);
    await expect(page.getByTestId('vx-group-level').first()).toHaveAttribute(
      'data-field',
      'ToolchainType',
    );
    await expect(page.getByTestId('vx-group-row')).toHaveCount(1);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.mouse.move(5, 5);
    const lit = await page.getByTestId('vx-header').evaluateAll((els) =>
      els
        .filter((el) => {
          const s = getComputedStyle(el);
          return (
            s.boxShadow !== 'none' ||
            (s.transform !== 'none' && s.transform !== '') ||
            s.zIndex === '2'
          );
        })
        .map((el) => (el as HTMLElement).dataset.column),
    );
    expect(lit, 'no header stays highlighted after the drop').toEqual([]);
  });

  test('at 1280 the chip flies to the lens dot on the collapsed rail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('vx-lens-rail')).toBeVisible();
    const dots = await page.getByTestId('vx-rail-dot').count();
    const flights = await recordFlights(page);

    await valueIn(page, 'beta', 'Labels.tier').click();
    await popover(page)
      .getByRole('menuitem', { name: /Only this/ })
      .click();
    await expect.poll(flights).toHaveLength(1);
    const [lensId] = await flights();
    const fly = page.getByTestId('vx-fly-in');
    await expect(page.getByTestId('vx-rail-dot')).toHaveCount(dots + 1);
    await expect(
      page.locator(`[data-testid="vx-rail-dot"][data-lens-id="${lensId}"]`),
    ).toBeVisible();
    await expect(fly).toHaveCount(0);
    await expect(rows(page)).toHaveCount(2);
  });

  test('on "All units" a cell action opens a temporary tab', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openExplorer(page, '/x/view-explorer');
    // Other specs leave Units called gamma; take this test's own.
    const ownGamma = rows(page)
      .filter({ hasText: 'gamma' })
      .filter({ hasText: seed.spaceSlug })
      .locator('[data-vx-value="Space"]')
      .first();
    const tabs = page.getByTestId('vx-tab');
    await expect(tabs.first()).toHaveAttribute('data-active', 'true');
    const count = await tabs.count();
    await expect(ownGamma).toBeVisible();

    await ownGamma.click();
    await popover(page)
      .getByRole('menuitem', { name: /Only this/ })
      .click();
    await expect(tabs).toHaveCount(count + 1);
    await expect(tabs.first()).not.toHaveAttribute('data-active', 'true');
    await expect(rows(page)).toHaveCount(3);
    await expect(lensRows(page).last()).toContainText(seed.spaceSlug);
  });
});
