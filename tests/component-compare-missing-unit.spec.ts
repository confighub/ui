// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A deployment that simply does not hold one of the compared units — the
// `data-state="missing-unit"` harness pane (`dev-1` holds 'checkout' but not
// 'billing'; `prod-us1` holds both).
//
// `compareUnits` in `ComponentSidePane.tsx` unions units across every
// selected deployment, so a deployment that holds only SOME of them gets
// `unavailable: 'no-such-unit'` for the rest. That is a settled, unremarkable
// fact, not a read failure, and must never be printed as one. `dev-1` here
// answered perfectly for BOTH units; nothing on this pane may say otherwise.

import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const HARNESS = '/tests/fixtures/compare-alignment/harness.html';

let server: ViteDevServer;
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  server = await createServer({ configFile: 'vite.config.ts', server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('vite did not report a port');
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`http://localhost:${address.port}${HARNESS}`, { waitUntil: 'networkidle' });
  expect(errors, 'the harness rendered without errors').toEqual([]);
});

test.afterAll(async () => {
  await browser?.close();
  await server?.close();
});

const pane = () => page.locator('[data-state="missing-unit"]');

test.describe('a deployment that does not hold one of the compared units', () => {
  test('is never told it could not be read — it answered fine', async () => {
    const text = await pane().innerText();
    expect(text).not.toMatch(/could not be read/i);
    // The whole point being guarded: `dev-1` is a real, answering deployment.
    expect(text).not.toMatch(/reading dev-1/i);
  });

  test("the 'billing' unit header names which deployment does not hold it", async () => {
    const note = pane().locator('[data-unit-slug="billing"] [data-testid="compare-unit-missing-note"]');
    await expect(note).toHaveText('not in dev-1');
  });

  test("the 'checkout' unit carries no such note — both deployments hold it", async () => {
    const note = pane().locator('[data-unit-slug="checkout"] [data-testid="compare-unit-missing-note"]');
    await expect(note).toHaveCount(0);
  });

  test("the 'checkout' comparison works normally alongside the missing 'billing' unit", async () => {
    const checkout = pane().locator('[data-unit-slug="checkout"]');
    await expect(checkout.getByTestId('compare-document-group')).not.toHaveCount(0);
    // `replicas` genuinely differs (3 vs 1) between the two fixtures — a real
    // comparison result, not swallowed by the unrelated missing unit.
    await expect(checkout.getByTestId('compare-leaf-row')).not.toHaveCount(0);
  });

  test("the 'billing' unit's own cell still says 'no unit' for the deployment that lacks it", async () => {
    const billing = pane().locator('[data-unit-slug="billing"]');
    await expect(billing.locator('[data-fidelity="value-unanswerable"]').first()).toBeVisible();
  });
});
