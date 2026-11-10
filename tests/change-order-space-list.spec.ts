// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The shared Space list in a browser, with 55 Spaces and no ChangeOrder behind it: a failure
// line for 54 failing Spaces, and the opened list with its filter, its Group by choice and
// its focus. The page is `fixtures/space-list-harness.tsx`, served by the dev server and
// opened through a route of this spec. It needs the UI's dev server (it skips itself under
// `vite preview`) and no ConfigHub server.
//
// KEEP IT AS A MANUAL ACCESSIBILITY CHECK. CI serves the built app with `vite preview`, so this
// spec skips itself there and never runs in CI. `change-order-space-list.pure.spec.ts` is the
// guard CI runs.
//
// What this does not cover: the Stage log itself, which builds its failure line from the
// same list and needs a real ChangeOrder (see `change-order-stage-card.spec.ts`).

import { expect, test, type Page } from '@playwright/test';

const PATH = '/__space-list-harness';

async function openHarness(page: Page, query = '') {
  await page.route(`**${PATH}*`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      // The dev server's React plugin expects the preamble that its own index page carries.
      body: `<!doctype html><html><body><div id="root"></div>
<script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>
<script type="module" src="/tests/fixtures/space-list-harness.tsx"></script></body></html>`,
    }),
  );
  await page.goto(PATH + query);
}

async function openPanelAt(page: Page, line: 'all-line' | 'bottom-line') {
  await page.getByTestId(line).getByTestId('space-list-more').click();
  const panel = page.getByRole('dialog', { name: '55 Spaces' });
  await expect(panel).toBeVisible();
  await page.waitForTimeout(400);
  await panel.getByLabel('Group by').selectOption('');
  return panel;
}

test.describe('the Space list with 55 Spaces', () => {
  // `vite preview` serves the built app only, with no module for the harness to import.
  test.beforeEach(async ({ request }) => {
    const response = await request.get('/@react-refresh');
    test.skip(!(response.headers()['content-type'] ?? '').includes('javascript'), 'needs the UI dev server (`npm run dev`), not `vite preview`');
  });

  test('a failure line for 54 Spaces names three and counts the rest', async ({ page }) => {
    await openHarness(page);
    const line = page.getByTestId('failure-line');
    await expect(line.getByRole('link')).toHaveCount(3);
    const more = line.getByRole('button', { name: '+51 more: Show all 54 Spaces' });
    await expect(more).toHaveText('+51 more');
    await expect(line).not.toContainText('prod50');
  });

  test('opens a panel with a count, a filter, a Group by choice and a way back', async ({ page }) => {
    await openHarness(page);
    const line = page.getByTestId('all-line');
    await expect(line.getByRole('link')).toHaveCount(3);
    const button = line.getByTestId('space-list-more');
    await expect(button).toHaveAccessibleName('+52 more: Show all 55 Spaces');
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await button.click();
    // At once, before the open transition ends (it runs for about 300 ms; it is not switched off here):
    // the popover's focus trap puts focus on the dialog first, and the filter must already have taken it.
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('space-list-filter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = page.getByRole('dialog', { name: '55 Spaces' });
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('space-list-count')).toHaveText('55 Spaces');
    // Focus goes to the filter box, so a person can type at once, and stays there: the popover's
    // own focus handling must not take it back to the dialog.
    const filter = panel.getByLabel('Filter Spaces');
    await expect(filter).toBeFocused();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('space-list-filter');

    // Region is the default choice: four groups, each a button that says how many Spaces it holds.
    const groupBy = panel.getByLabel('Group by');
    await expect(groupBy).toHaveValue('Region');
    await expect(groupBy.locator('option')).toHaveText(['None', 'Region · 4 values']);
    const headers = panel.getByTestId('space-list-group');
    await expect(headers).toHaveCount(4);
    await expect(headers.first()).toHaveText(/^ap-southeast · 13 Spaces/);
    await expect(headers.first()).toHaveAttribute('aria-expanded', 'false');
    await headers.first().click();
    await expect(headers.first()).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('link')).toHaveCount(13);

    // None is one flat list of every Space.
    await groupBy.selectOption('');
    await expect(panel.getByTestId('space-list-group')).toHaveCount(0);
    await expect(panel.getByRole('link')).toHaveCount(55);

    // The filter keeps what matches, and says how many.
    await filter.fill('eu-west');
    await expect(panel.getByTestId('space-list-count')).toHaveText('14 of 55 Spaces');
    await expect(panel.getByRole('link')).toHaveCount(14);
    await filter.fill('no-such-space');
    await expect(panel.getByText('No Space matches.')).toBeVisible();

    // Escape closes the panel and returns focus to the button.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('opened from the keyboard, focus is on the filter at once, and Escape returns it to the button', async ({ page }) => {
    await openHarness(page);
    const button = page.getByTestId('all-line').getByTestId('space-list-more');
    await button.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('space-list-filter');
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
  });

  test('inside a dialog: the panel opens above it, and Escape closes only the panel and returns focus to the button', async ({ page }) => {
    await openHarness(page, '?dialog=1');
    const dialog = page.getByTestId('dialog-body');
    const button = dialog.getByTestId('space-list-more');
    await button.click();
    const panel = page.getByRole('dialog', { name: '55 Spaces' });
    await expect(panel).toBeVisible();
    // The panel is on top of the dialog: what lies at its filter box is the panel.
    const box = await panel.getByLabel('Filter Spaces').boundingBox();
    const topIsPanel = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="dialog"]')?.getAttribute('aria-label'), { x: box!.x + 4, y: box!.y + 4 });
    expect(topIsPanel).toBe('55 Spaces');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(dialog).toBeVisible();
    await expect(button).toBeFocused();
  });

  test('a filter keeps the group headers in the tab order', async ({ page }) => {
    await openHarness(page);
    await page.getByTestId('all-line').getByTestId('space-list-more').click();
    const panel = page.getByRole('dialog', { name: '55 Spaces' });
    await panel.getByLabel('Filter Spaces').fill('us-east');
    const header = panel.getByTestId('space-list-group');
    await expect(header).toHaveCount(1);
    await expect(header).toHaveAttribute('aria-disabled', 'true');
    // Still focusable: a filter must not take the header out of the tab order.
    await header.focus();
    await expect(header).toBeFocused();
  });

  for (const height of [900, 600]) {
    for (const line of ['all-line', 'bottom-line'] as const) {
      test(`the panel stays inside a ${height}px window, opened from ${line}, and its list scrolls`, async ({ page }) => {
        await page.setViewportSize({ width: 1200, height });
        await openHarness(page);
        const panel = await openPanelAt(page, line);
        const box = await panel.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(height);
        // The list scrolls inside the panel instead of growing the panel past the window.
        const scroll = panel.getByTestId('space-list-scroll');
        expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        // The panel does not cover the button that opened it.
        const button = await page.getByTestId(line).getByTestId('space-list-more').boundingBox();
        expect(box!.y >= button!.y + button!.height - 1 || box!.y + box!.height <= button!.y + 1).toBe(true);
      });
    }
  }

  test('no row looks hovered or focused when the list opens', async ({ page }) => {
    await openHarness(page);
    const panel = await openPanelAt(page, 'all-line');
    await page.mouse.move(2, 2);
    const first = panel.getByRole('link').first();
    expect(await first.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none');
    expect(await first.evaluate((el) => el === document.activeElement)).toBe(false);
  });
});
