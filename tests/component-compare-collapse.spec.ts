// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Folding the compare slots away under their "Compare" header —
// `CompareCollapsible.tsx`, driven through the real components via the
// `data-state="collapse"` harness pane (`tests/fixtures/compare-alignment/harness.tsx`).
// The Releases tab uses the same component around its two release selectors.

import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const HARNESS = '/tests/fixtures/compare-alignment/harness.html';

let server: ViteDevServer;
let browser: Browser;
let origin: string;
let page: Page;

test.beforeAll(async () => {
  server = await createServer({ configFile: 'vite.config.ts', server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('vite did not report a port');
  origin = `http://localhost:${address.port}`;
  browser = await chromium.launch();
});

test.afterAll(async () => {
  await browser?.close();
  await server?.close();
});

// Each test gets a page in a new browser context, so its localStorage is empty
// and the section starts expanded.
test.beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });
  expect(errors, 'the harness rendered without errors').toEqual([]);
  await pane().scrollIntoViewIfNeeded();
});

test.afterEach(async () => {
  await page?.close();
});

const pane = () => page.locator('[data-state="collapse"]');
const header = () => pane().getByRole('button', { name: 'Compare', exact: true });
const selectors = () => pane().getByTestId('compare-selectors');
const section = () => pane().getByTestId('component-compare-section');

function focusIsInSlotRow(): Promise<boolean> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-state="collapse"] [data-testid="compare-selectors"]');
    return !!row && row.contains(document.activeElement);
  });
}

test('starts expanded, with a header button that names and controls the slot row', async () => {
  await expect(header()).toHaveAttribute('aria-expanded', 'true');
  await expect(header()).toHaveAttribute('data-testid', 'component-compare-header');
  await expect(selectors()).toBeVisible();

  const controls = await header().getAttribute('aria-controls');
  expect(controls, 'the header names the region it folds').toBeTruthy();
  await expect(pane().locator(`[id="${controls}"]`).getByTestId('compare-selectors')).toHaveCount(1);
});

test('folding hides the slot row and gives its height to the grid; unfolding brings it back', async () => {
  const before = await section().boundingBox();
  const rowHeight = (await selectors().boundingBox())?.height ?? 0;
  expect(before).not.toBeNull();
  expect(rowHeight).toBeGreaterThan(0);

  await header().click();
  await expect(header()).toHaveAttribute('aria-expanded', 'false');
  await expect(selectors()).toBeHidden();
  // Folded, nothing in the row can take focus: Tab from the header skips past it.
  await header().focus();
  await page.keyboard.press('Tab');
  await expect(header()).not.toBeFocused();
  expect(await focusIsInSlotRow(), 'focus did not go into the folded slot row').toBe(false);

  await expect
    .poll(async () => (await section().boundingBox())?.height ?? 0)
    .toBeGreaterThan(before!.height + rowHeight / 2);

  await header().click();
  await expect(header()).toHaveAttribute('aria-expanded', 'true');
  await expect(selectors()).toBeVisible();
  // The control for the check above: unfolded, the same Tab does land in the row.
  await header().focus();
  await page.keyboard.press('Tab');
  expect(await focusIsInSlotRow(), 'focus went into the unfolded slot row').toBe(true);
  await expect.poll(async () => Math.round((await section().boundingBox())?.height ?? 0)).toBe(Math.round(before!.height));
});

test('the keyboard folds it too', async () => {
  await header().focus();
  await page.keyboard.press('Enter');
  await expect(header()).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(header()).toHaveAttribute('aria-expanded', 'true');
});

test('the folded state survives a reload', async () => {
  await header().click();
  await expect(header()).toHaveAttribute('aria-expanded', 'false');

  await page.reload({ waitUntil: 'networkidle' });
  await pane().scrollIntoViewIfNeeded();
  await expect(header()).toHaveAttribute('aria-expanded', 'false');
  await expect(selectors()).toBeHidden();
});
