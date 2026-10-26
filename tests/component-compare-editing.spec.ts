// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The compare view, driven through the real components in the harness at
// `tests/fixtures/compare-alignment/harness.tsx`. Each `data-state` pane there
// mounts the compare section in one situation: an editable grid, a blocked
// one, a protected cell, a reorderable selector row, two units, a deployment
// still being read, and a deployment that does not hold a unit.
//
// What is checked is what a user can and cannot do: a by-position row refuses
// an edit because index 2 in one deployment is not the same element as index 2
// in another, staging never writes, a refusal keeps the work, and a pane still
// waiting for configuration never prints a settled verdict.

import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const HARNESS = '/tests/fixtures/compare-alignment/harness.html';

let server: ViteDevServer;
let browser: Browser;
let origin: string;
let page: Page;

// One Vite server and one browser for the whole file; only the PAGE is fresh
// per test, because staged edits and column order are component state and one
// test's must not be visible to the next.
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
  page = await browser.newPage({ viewport: { width: 1400, height: 2600 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });
  expect(errors, 'the harness rendered without errors').toEqual([]);
});

test.afterEach(async () => {
  await page?.close();
});

const editable = () => page.locator('[data-state="editable"]');
const blocked = () => page.locator('[data-state="blocked"]');

/** An editable value cell — column 1. */
function firstEditableCell() {
  return editable().locator('[data-testid="compare-leaf-row"] [data-column="1"]').first();
}

async function stageEdit(value: string) {
  await firstEditableCell().click();
  await editable().getByTestId('compare-value-editor').locator('input').fill(value);
  await editable().getByTestId('compare-value-editor').locator('input').press('Enter');
}

test.describe('the inline editor', () => {
  test('a committed edit stages, and nothing is written until apply', async () => {
    await stageEdit('99');

    await expect(editable().locator('[data-fidelity="value-staged"]').first()).toBeVisible();
    await expect(editable().getByTestId('compare-staged-footer')).toBeVisible();

    const applies = await page.evaluate(() => (window as unknown as { recordedApplies: string[] }).recordedApplies);
    expect(applies, 'staging must not write').toEqual([]);
  });

  test('a refusal is named and its work stays staged', async () => {
    // The harness refuses `d1`, which is the column being edited.
    await stageEdit('99');
    await editable().getByTestId('compare-apply').click();

    const outcome = editable().getByTestId('compare-apply-outcome');
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText(/refused/i);
    await expect(outcome).toContainText(/still staged/i);
    // Kept, not discarded — the user does not lose work to a server refusal.
    await expect(editable().locator('[data-fidelity="value-staged"]').first()).toBeVisible();
  });
});

test.describe('a staged change always looks staged', () => {
  // The defect these close: the footer counted a staged change while the cell
  // still read `not set`, so Apply would have written something the user could
  // not see. Asserted on the DOM, because the model was right the whole time —
  // it was only the rendering that lied.

  /** The one cell in the harness whose value is absent but whose parent exists. */
  function notSetCell() {
    return editable()
      .locator('[data-testid="compare-leaf-row"] [data-column="1"]')
      .filter({ has: page.locator('[data-fidelity="value-absent"]') })
      .first();
  }

  test('setting a not-set cell shows as a staged add, not as still-unset', async () => {
    await expect(notSetCell()).toHaveCount(1);
    await notSetCell().click();
    await editable().getByTestId('compare-value-editor').locator('input').fill('true');
    await editable().getByTestId('compare-value-editor').locator('input').press('Enter');

    const staged = editable().locator('[data-fidelity="value-staged"]');
    await expect(staged).toHaveCount(1);
    // Green, because green already means present-only-here and an add is that.
    await expect(staged).toHaveAttribute('data-staged', 'add');
    await expect(staged).toHaveText('true');
    // And it must no longer read as absent.
    await expect(notSetCell()).toHaveCount(0);
  });

  test('the checkbox discards the change, as unchecking does in the shipped tree', async () => {
    await stageEdit('99');
    await expect(editable().getByTestId('compare-staged-footer')).toBeVisible();

    await editable().getByTestId('compare-staged-checkbox').click();
    await expect(editable().locator('[data-fidelity="value-staged"]')).toHaveCount(0);
    await expect(editable().getByTestId('compare-staged-footer')).toHaveCount(0);
  });

  test('staged edits inside a collapsed unit are not lost, and the footer still counts them', async () => {
    const units = page.locator('[data-state="reorder-units"]');
    const checkoutHeader = units.locator('[data-unit-slug="checkout"] [data-testid="compare-unit-header"]');

    await units.locator('[data-unit-slug="checkout"] [data-testid="compare-leaf-row"] [data-column="1"]').first().click();
    const editor = units.getByTestId('compare-value-editor');
    await editor.locator('input').fill('99');
    await editor.locator('input').press('Enter');
    await expect(units.getByTestId('compare-apply')).toHaveText(/Apply to 1 deployment/);

    await checkoutHeader.click();
    await expect(checkoutHeader).toHaveAttribute('aria-expanded', 'false');

    // The footer reads staged state, not the DOM the grid happens to have —
    // collapsing the unit that owns the edit must not touch either.
    await expect(units.getByTestId('compare-apply')).toHaveText(/Apply to 1 deployment/);
    await expect(units.getByTestId('compare-staged-footer')).toBeVisible();

    await checkoutHeader.click();
    await expect(units.locator('[data-fidelity="value-staged"]').first()).toBeVisible();
  });
});

test.describe('cells an edit treats differently', () => {
  test('a protected cell stays editable — kept on merge is not a lock', async () => {
    // `protectedPaths` means a merge must not overwrite it, which is the reason
    // you set it: so your own edit survives. Blocking the edit inverts that.
    const protectedPane = page.locator('[data-state="protected"]');
    const cell = protectedPane
      .locator('[data-column="1"]')
      .filter({ has: page.locator('[data-protected="true"]') })
      .first();
    await expect(cell.locator('[data-edit-blocked]')).toHaveCount(0);
    await cell.click();
    await expect(protectedPane.getByTestId('compare-value-editor')).toBeVisible();
  });

  test('a by-position cell opens nothing when clicked', async () => {
    const cell = blocked().locator('[data-edit-blocked="by-position"]').first();
    await expect(cell).toBeVisible();
    await expect(blocked().locator('[data-editable="true"]')).toHaveCount(0);

    await cell.click();
    await expect(blocked().getByTestId('compare-value-editor')).toHaveCount(0);
    await expect(blocked().getByTestId('compare-staged-footer')).toHaveCount(0);
  });
});

test.describe('reordering the compared deployments', () => {
  const reorder = () => page.locator('[data-state="reorder"]');

  /** Every `onReorder`/`onSelectionChange` call the harness has recorded so far. */
  function recordedSelections(): Promise<string[][]> {
    return page.evaluate(() => (window as unknown as { __compareSelections: string[][] }).__compareSelections);
  }

  /** The scoped `<style>` element the drag layer writes into, or '' before one exists. */
  function dragStyleText(): Promise<string> {
    return page.evaluate(
      () => document.querySelector('[data-state="reorder"] [data-compare-dnd] > style')?.textContent ?? '',
    );
  }

  /** Resolves after two animation frames, by which time layout effects and rAF work have run. */
  function nextFrames(): Promise<void> {
    return page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
  }

  test('clearing slot A moves the next deployment into it', async () => {
    await reorder().getByTestId('compare-selector-clear-a').click();

    await expect.poll(async () => (await recordedSelections()).at(-1)).toEqual(['dev-1', 'dev-2']);
    await expect(reorder().getByTestId('compare-column-a').first()).toContainText('dev-1');
  });

  test('keyboard drag: Space, ArrowRight, Space swaps A and B', async () => {
    await reorder().getByTestId('compare-column-a').first().focus();
    // The keyboard sensor finds the next column from droppable rects it
    // measures after the pick-up, so each key waits for the drag layer to show
    // its effect and then for the frames that measurement runs in.
    await page.keyboard.press('Space');
    await expect.poll(dragStyleText).toContain('compare-skel');
    await nextFrames();
    await page.keyboard.press('ArrowRight');
    await expect.poll(dragStyleText).toContain('data-compare-col="dev-1"] { background-color');
    await nextFrames();
    await page.keyboard.press('Space');

    await expect
      .poll(async () => (await recordedSelections()).at(-1))
      .toEqual(['dev-1', 'prod-us1', 'dev-2']);
  });
});

test.describe('what a pane says about deployments it has not read', () => {
  // A pane still waiting for configuration once printed "could not be read" and
  // "None of these deployments holds configuration" — settled verdicts about
  // data it had not received. A deployment that simply does not hold a unit
  // (`no-such-unit`) is a settled fact, not a read failure, and must never be
  // printed as one either. Asserted on rendered text, because the model was
  // right while the prose came from elsewhere.
  test('a loading pane gives no verdict, a settled one does, and a missing Unit is not a read failure', async () => {
    const inFlight = page.locator('[data-state="loading"]');
    const settled = page.locator('[data-state="settled-empty"]');
    const missing = page.locator('[data-state="missing-unit"]');

    await expect(inFlight.getByTestId('compare-skeleton-row')).not.toHaveCount(0);
    const inFlightText = await inFlight.innerText();
    for (const verdict of [/no configuration/i, /None of these deployments holds configuration/i, /fields agree/i, /0 differences/i]) {
      expect(inFlightText, `in-flight pane said: ${inFlightText}`).not.toMatch(verdict);
    }
    expect(inFlightText).toMatch(/reading/i);

    const settledText = await settled.innerText();
    expect(settledText).toMatch(/no configuration/i);
    expect(settledText).not.toMatch(/reading /i);
    await expect(settled.getByTestId('compare-skeleton-row')).toHaveCount(0);

    // `dev-1` holds 'checkout' but not 'billing', and answered for both.
    const missingText = await missing.innerText();
    expect(missingText).not.toMatch(/could not be read/i);
    expect(missingText).not.toMatch(/reading dev-1/i);
    await expect(
      missing.locator('[data-unit-slug="billing"] [data-testid="compare-unit-missing-note"]'),
    ).toHaveText('not in dev-1');
  });
});

test.describe('the words a pane uses for its columns', () => {
  // The View explorer mounts the same section over Units. Its wording comes
  // from a context whose default is the Components wording, so Components
  // must read exactly as it did, and the explorer must never say "deployment".
  test('Components says "deployment", word for word', async () => {
    const rules = page.locator('[data-state="rules"]');
    await expect(rules.getByTestId('compare-filter-differing')).toHaveAttribute(
      'title',
      'A field appears when the deployments do not all agree, including when some set it and others do not.',
    );
    await expect(rules.locator('[data-cell-kind="differs"]').first()).toHaveAttribute(
      'title',
      // A cell that refuses an edit says why first, then how it compares.
      'This list gives its elements no identity, so they could only be lined up by position. An edit here could write to a different element in another deployment. prod: differs between deployments',
    );
    await expect(rules.locator('[data-fidelity="value-absent"]').first()).toHaveAttribute(
      'title',
      'prod: not set here, where another deployment sets it',
    );
    await expect(rules.getByTestId('compare-unit-header')).toHaveCount(1);
    await expect(page.locator('[data-state="settled-empty"]').getByTestId('compare-empty')).toContainText(
      'None of these deployments holds configuration to compare.',
    );
  });

  test('the Unit noun says "Unit", and a pane without the unit header still shows its documents', async () => {
    const units = page.locator('[data-state="unit-noun"]');
    await expect(units.getByTestId('compare-filter-differing')).toHaveAttribute(
      'title',
      'A field appears when the Units do not all agree, including when some set it and others do not.',
    );
    await expect(units.locator('[data-cell-kind="differs"]').first()).toHaveAttribute('title', /^(?!.*deployment).*another Unit\. prod: differs between Units$/);
    await expect(units.locator('[data-fidelity="value-absent"]').first()).toHaveAttribute('title', 'prod: not set here, where another Unit sets it');
    await expect(units.getByTestId('compare-unit-header')).toHaveCount(0);
    await expect(units.getByTestId('compare-document-group')).not.toHaveCount(0);
    await expect(units.getByTestId('compare-leaf-row').first()).toBeVisible();
    expect(await units.innerText()).not.toMatch(/deployment/i);
    await expect(page.locator('[data-state="unit-noun-empty"]').getByTestId('compare-empty')).toContainText(
      'None of these Units holds configuration to compare.',
    );
  });
});
