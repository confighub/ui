// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What the pane SAYS while a deployment's configuration is still arriving.
//
// WHY THIS IS ASSERTED AGAINST RENDERED TEXT. The bug survived three rounds
// because every spec asserted the model while the prose came from elsewhere.
// With nothing read there are no rows, so there are no cells — and the per-cell
// vocabulary that `unanswerable.ts` was built to police was never consulted at
// all. The empty state and the strip note were reached by a path that never
// asked whether anything was still in flight, and printed a verdict:
//
//   "cubbychat-base and cubbychat-base-dev could not be read"
//   "None of these deployments holds configuration to compare."
//
// Both false while a request is outstanding, and both the exact mirror of the
// original defect — then a settled state printed the transient word forever,
// here a transient state prints settled words.
//
// `unansweredColumns` (asserted here as "no configuration") is only ever a
// genuine read failure, `empty-unit`. A deployment that simply does not hold
// the unit (`no-such-unit`) is tracked separately, in `missingUnitColumns`
// (see `component-compare-unanswerable.pure.spec.ts`), and is never printed
// as a failure. A settled state must print ITS verdict, and a transient one
// must never borrow it.
//
// So these assertions are on the DOM, in a browser, and they name the forbidden
// sentences literally.

import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const HARNESS = '/tests/fixtures/compare-alignment/harness.html';

/** Sentences that assert a settled fact. None may appear while anything is in flight. */
const VERDICTS = [
  /no configuration/i,
  /None of these deployments holds configuration/i,
  /fields agree/i,
  /0 differences/i,
];

let server: ViteDevServer;
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  server = await createServer({ configFile: 'vite.config.ts', server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('vite did not report a port');
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1200, height: 1800 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`http://localhost:${address.port}${HARNESS}`, { waitUntil: 'networkidle' });
  expect(errors, 'the harness rendered without errors').toEqual([]);
});

test.afterAll(async () => {
  await browser?.close();
  await server?.close();
});

const inFlight = () => page.locator('[data-state="loading"]');
const settled = () => page.locator('[data-state="settled-empty"]');

test.describe('while a deployment is still being read', () => {
  test('the harness really is in the two states this spec claims', async () => {
    // Coverage first: an empty pass would otherwise satisfy every assertion below.
    await expect(inFlight()).toHaveCount(1);
    await expect(settled()).toHaveCount(1);
    await expect(inFlight().getByTestId('compare-filter-strip')).toHaveCount(1);
    const settledText = await settled().innerText();
    expect(settledText, 'the settled pane must still give its verdict').toMatch(
      /no configuration|None of these deployments holds configuration/i,
    );
  });

  test('no settled sentence is asserted', async () => {
    const text = await inFlight().innerText();
    for (const verdict of VERDICTS) {
      expect(text, `in-flight pane said: ${text}`).not.toMatch(verdict);
    }
  });

  test('it says what it is waiting for, in the present tense', async () => {
    const text = await inFlight().innerText();
    expect(text).toMatch(/reading/i);
    // Named, so the wait has a visible subject rather than being a bare spinner.
    expect(text).toContain('cubbychat-base');
  });

  test('something renders, so the pane reads as busy rather than broken', async () => {
    // Twenty seconds of an empty pane is its own defect, before any wording.
    await expect(inFlight().getByTestId('compare-skeleton-row')).not.toHaveCount(0);
    await expect(inFlight().getByTestId('compare-loading')).toHaveAttribute('aria-busy', 'true');
  });

  test('no count is printed as a number, because none is known', async () => {
    // `Differing 0` is a claim about configuration the pane has not read.
    const strip = inFlight().getByTestId('compare-filter-strip');
    await expect(strip.getByTestId('compare-filter-differing')).toHaveText(/—/);
    await expect(strip.getByTestId('compare-filter-all')).toHaveText(/—/);
    await expect(strip.getByTestId('compare-unverifiable-count')).toHaveCount(0);
  });

  test('a settled column still gets its verdict, so the fix did not just silence everything', async () => {
    const text = await settled().innerText();
    expect(text).toMatch(/no configuration/i);
    expect(text).not.toMatch(/reading /i);
    await expect(settled().getByTestId('compare-skeleton-row')).toHaveCount(0);
  });
});
