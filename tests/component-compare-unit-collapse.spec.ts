// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Collapsing a unit header in the compare view — `ComponentCompareSection.tsx`
// — driven through the real components via the `data-state="reorder-units"`
// harness pane (two units, 'checkout' and 'billing', so a test can check that
// collapsing one does not move the other).
//
// THE PART WORTH THE MOST CARE IS EVERYTHING THIS TOGGLE SHARES WITH OTHER
// FEATURES. The single scroll container, the shared column tracks, staged
// edits, and the drag layer's own DOM-measuring FLIP all predate this toggle
// and must not notice it exists — a unit collapsing is a row count changing,
// nothing else.

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

test.beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });
  expect(errors, 'the harness rendered without errors').toEqual([]);
  await page.locator('[data-state="reorder-units"]').scrollIntoViewIfNeeded();
});

test.afterEach(async () => {
  await page?.close();
});

const units = () => page.locator('[data-state="reorder-units"]');

function unitHeader(slug: string) {
  return units().locator(`[data-unit-slug="${slug}"] [data-testid="compare-unit-header"]`);
}

function unitDocumentGroups(slug: string) {
  return units().locator(`[data-unit-slug="${slug}"] [data-testid="compare-document-group"]`);
}

test.describe('a unit header toggles its own content', () => {
  test('clicking it hides the rows and flips aria-expanded, clicking again shows them', async () => {
    const header = unitHeader('checkout');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    const before = await unitDocumentGroups('checkout').count();
    expect(before, 'the fixture must actually have content to hide').toBeGreaterThan(0);

    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(unitDocumentGroups('checkout')).toHaveCount(0);
    // The name and the count survive the collapse — that is the whole point
    // of keeping them in the button rather than the content underneath it.
    await expect(header).toContainText('checkout');
    await expect(header).toContainText('F');

    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(unitDocumentGroups('checkout')).toHaveCount(before);
  });

  test('aria-controls names a real element while expanded, and is absent while collapsed', async () => {
    const header = unitHeader('checkout');
    const contentId = await header.getAttribute('aria-controls');
    expect(contentId, 'expanded header must have aria-controls').toBeTruthy();
    // Scoped to this pane: the harness mounts several `ComponentCompareSection`s
    // that also happen to hold a unit called 'checkout', so the id is only
    // unique within one mount — exactly as it is in the real app, which never
    // mounts more than one at a time.
    await expect(units().locator(`#${contentId}`)).toHaveCount(1);

    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    // The content element is gone, not just hidden — pointing aria-controls
    // at it would name an id nothing on the page has.
    await expect(header).not.toHaveAttribute('aria-controls', /.+/);
  });

  test('keyboard: Enter and Space both toggle it, same as any button', async () => {
    const header = unitHeader('billing');
    await header.focus();

    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Space');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  test('the two units collapse independently', async () => {
    await unitHeader('checkout').click();
    await expect(unitHeader('checkout')).toHaveAttribute('aria-expanded', 'false');
    await expect(unitHeader('billing')).toHaveAttribute('aria-expanded', 'true');
    await expect(unitDocumentGroups('billing')).not.toHaveCount(0);
  });
});

test.describe('collapsing one unit does not disturb another', () => {
  test('the other unit\'s column tracks do not move', async () => {
    const billingHeadA = units()
      .locator('[data-unit-slug="billing"] [data-testid="compare-column-a"]')
      .first();
    const before = await billingHeadA.boundingBox();
    expect(before).toBeTruthy();

    await unitHeader('checkout').click();
    await expect(unitHeader('checkout')).toHaveAttribute('aria-expanded', 'false');

    const after = await billingHeadA.boundingBox();
    expect(after).toBeTruthy();
    // Vertical position may shift — 'checkout' sat above 'billing' and just
    // lost its rows. The column's own x and width — what the shared tracks
    // control — must not.
    expect(after?.x).toBeCloseTo(before?.x ?? -1, 0);
    expect(after?.width).toBeCloseTo(before?.width ?? -1, 0);
  });
});

test.describe('the drag layer still works around a collapsed unit', () => {
  test('a column drag still swaps with one unit collapsed', async () => {
    await unitHeader('checkout').click();
    await expect(unitHeader('checkout')).toHaveAttribute('aria-expanded', 'false');

    const source = units().locator('[data-compare-surface="selectors"][data-compare-col="prod-us1"]');
    const target = units().locator('[data-compare-surface="selectors"][data-compare-col="dev-2"]');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('slots did not render');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    await expect(units().getByTestId('compare-column-a').first()).toContainText('dev-2');
  });

  test('a column drag still works with BOTH units collapsed — nothing but the selectors survive in the DOM', async () => {
    await unitHeader('checkout').click();
    await unitHeader('billing').click();
    await expect(unitHeader('checkout')).toHaveAttribute('aria-expanded', 'false');
    await expect(unitHeader('billing')).toHaveAttribute('aria-expanded', 'false');
    // With no unit expanded there is no grid and no image row left to render
    // at all — the FLIP has only the selector row's own columns to measure.
    await expect(units().locator('[data-compare-surface="grid"]')).toHaveCount(0);
    await expect(units().locator('[data-compare-surface="image"]')).toHaveCount(0);

    const source = units().locator('[data-compare-surface="selectors"][data-compare-col="prod-us1"]');
    const target = units().locator('[data-compare-surface="selectors"][data-compare-col="dev-1"]');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('slots did not render');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    // No grid head exists to read the new order from — only the selector
    // slot itself, the one surface still in the DOM.
    await expect(units().getByTestId('compare-selector-label-a')).toHaveText('dev-1');
  });
});

test.describe('staged edits inside a collapsed unit', () => {
  test('are not lost, and the footer still counts them', async () => {
    const cell = units()
      .locator('[data-unit-slug="checkout"] [data-testid="compare-leaf-row"] [data-column="1"]')
      .first();
    await cell.click();
    const editor = units().getByTestId('compare-value-editor');
    await editor.locator('input').fill('99');
    await editor.locator('input').press('Enter');

    await expect(units().getByTestId('compare-apply')).toHaveText(/Apply to 1 deployment/);

    await unitHeader('checkout').click();
    await expect(unitHeader('checkout')).toHaveAttribute('aria-expanded', 'false');

    // The footer reads staged state, not the DOM the grid happens to have —
    // collapsing the unit that owns the edit must not touch either.
    await expect(units().getByTestId('compare-apply')).toHaveText(/Apply to 1 deployment/);
    await expect(units().getByTestId('compare-staged-footer')).toBeVisible();

    await unitHeader('checkout').click();
    await expect(units().locator('[data-fidelity="value-staged"]').first()).toBeVisible();
  });
});
