// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page, Route } from '@playwright/test';

import { expect, hubApi, newAuthorizedPage, test } from './fixtures/test';
import { type PanelSeed, seedPanel } from './fixtures/view-explorer-panel-seed';
import { LONG_TASK_BUDGET_MS, openExplorer } from './fixtures/view-explorer-seed';

/**
 * The View explorer's row panel of a Unit: the Summary tab, its verdict for
 * each state, the counts of the Unit's group, the panel's keys (j/k to move,
 * ⇧J/⇧K to the next or previous Unit that needs attention), showing the row
 * in the table as the panel moves, and where Esc gives focus back.
 */

const rows = (page: Page) => page.getByTestId('vx-row');
const rowOf = (page: Page, slug: string) =>
  rows(page).filter({ has: page.locator('[data-column="Slug"]').getByText(slug, { exact: true }) });
const panel = (page: Page) => page.getByTestId('vx-row-panel');
const title = (page: Page) => panel(page).getByTestId('vx-drawer-title');
const headline = (page: Page) => panel(page).getByTestId('vx-unit-headline');
const slugOrder = (page: Page) => rows(page).locator('[data-column="Slug"]').allInnerTexts();
const primary = (page: Page) => panel(page).getByTestId('vx-unit-primary');
const action = (page: Page, id: string) => panel(page).getByTestId('vx-unit-actions').locator(`[data-action="${id}"]`);
const details = (page: Page) => panel(page).getByTestId('vx-unit-details');
const open = (page: Page, slug: string) => rowOf(page, slug).locator('[data-column="Slug"]').click();
const sidebar = (page: Page) => page.getByTestId('invoker-sidebar');
const contextHeader = (page: Page) => sidebar(page).locator('[role="button"][aria-expanded]:has-text("Context")');
const functionsCount = (page: Page) => contextHeader(page).locator('text=/^\\d+ units?$/');

/** Where screenshots go, when asked for. */
const SHOTS = process.env.VX_PANEL_SHOTS;

/** A screenshot, once the page's fade-in and the dialog's have ended. */
async function shot(page: Page, name: string) {
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${SHOTS}/${name}` });
}

/** The read of one Unit, as the panel asks for it: its own path, whatever the query. */
const unitRead = (spaceId: string, unitId: string) => (url: URL) => url.pathname === `/api/space/${spaceId}/unit/${unitId}`;

/** Answer the panel's read of a Unit with the real answer, changed. */
async function changeUnitRead(page: Page, spaceId: string, unitId: string, change: (body: Record<string, unknown> & { Unit: Record<string, unknown> }) => void) {
  await page.route(unitRead(spaceId, unitId), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    change(body);
    await route.fulfill({ response, json: body });
  });
}

async function unitHead(spaceId: string, unitId: string): Promise<number> {
  return (await unitOnServer(spaceId, unitId)).HeadRevisionNum ?? 0;
}

async function unitOnServer(
  spaceId: string,
  unitId: string,
): Promise<{
  HeadRevisionNum?: number;
  LastReleasedRevisionNum?: number;
  ValidationErrors?: Record<string, boolean>;
  ValidationTriggerIDs?: Record<string, string>;
}> {
  const response = await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`);
  return ((await response.json()) as { Unit?: Record<string, never> }).Unit ?? {};
}

/** The explorer's own list of Units (not the panel's read of one), as the universe asks for it. */
const isUnitList = (url: URL) => url.pathname === '/api/unit';

/** Every headline and live-region text the panel shows from now on, in order, as the page draws them. */
async function recordPanelTexts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __vxTexts: { headline: string[]; status: string[] } };
    w.__vxTexts = { headline: [], status: [] };
    const note = () => {
      const h = document.querySelector('[data-testid="vx-unit-headline"]')?.textContent ?? '';
      const st = document.querySelector('[data-testid="vx-row-panel-status"]')?.textContent ?? '';
      if (h && w.__vxTexts.headline.at(-1) !== h) w.__vxTexts.headline.push(h);
      if (w.__vxTexts.status.at(-1) !== st) w.__vxTexts.status.push(st);
    };
    note();
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __vxTexts: { headline: string[]; status: string[] } }).__vxTexts);
}

/** Every request that is not a read, from now on: what the panel's dialogs send. */
function recordWrites(page: Page): { method: string; path: string; params: URLSearchParams }[] {
  const writes: { method: string; path: string; params: URLSearchParams }[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (r.method() !== 'GET' && url.pathname.startsWith('/api/')) writes.push({ method: r.method(), path: url.pathname, params: url.searchParams });
  });
  return writes;
}

const isDryRun = (w: { method: string; path: string; params: URLSearchParams }) =>
  w.method === 'PATCH' && w.path === '/api/unit' && w.params.get('dry_run') === 'true' && w.params.get('upgrade') === 'true';

async function unfoldContext(page: Page) {
  const header = page.getByTestId('invoker-sidebar').locator('[role="button"][aria-expanded]:has-text("Context")');
  await expect(header).toBeVisible();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.evaluate((el) => (el as HTMLElement).click());
  await expect(header).toHaveAttribute('aria-expanded', 'true');
}

test.describe('the row panel of a Unit', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'authentication.json' });

  let seed: PanelSeed;
  let problems: string[];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await newAuthorizedPage(browser);
    try {
      seed = await seedPanel(page);
    } finally {
      await page.context().close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!seed) return;
    const page = await newAuthorizedPage(browser);
    try {
      await seed.remove();
    } finally {
      await page.context().close();
    }
  });

  test.beforeEach(async ({ page }) => {
    problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    await openExplorer(page, `/x/view-explorer?view=${seed.viewId}`, /^6 of \d+ units$/);
  });

  test.afterEach(async () => {
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('a Unit opens on its Summary, with no Details tab; a Space keeps Details', async ({ page }) => {
    await rowOf(page, 'ok').locator('[data-column="Slug"]').click();
    await expect(panel(page)).toHaveAttribute('aria-label', 'Row details: ok');
    await expect(panel(page).getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
    await expect(panel(page).getByRole('tab', { name: 'Details' })).toHaveCount(0);
    await expect(panel(page).getByRole('tab', { name: /^Resources/ })).toBeVisible();
    await expect(panel(page).getByTestId('vx-unit-sub')).toContainText(`Space ${seed.spaceA.slug}`);
    await expect(panel(page).getByTestId('vx-unit-sub')).toContainText(`Target ${seed.spaceA.slug}-t`);
    await expect(panel(page).getByRole('link', { name: 'Open Unit page' })).toHaveAttribute('href', new RegExp(`/units/${seed.spaceA.id}/${seed.unitIds.ok}`));
    await page.keyboard.press('Escape');

    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    await rows(page).filter({ hasText: seed.spaceA.slug }).first().locator('[data-column="Slug"]').click();
    await expect(panel(page).getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    await expect(panel(page).getByRole('tab', { name: 'Summary' })).toHaveCount(0);
  });

  test('the verdict names the state: a failing gate, unreleased revisions, an upgrade, nothing to do', async ({ page }) => {
    if (SHOTS) await page.setViewportSize({ width: 1440, height: 900 });
    await rowOf(page, 'gated').locator('[data-column="Slug"]').click();
    await expect(headline(page)).toHaveText(/^Blocked: rev \d+ cannot release$/);
    await expect(panel(page).getByTestId('vx-unit-verdict')).toHaveAttribute('data-tone', 'gated');
    await expect(panel(page).getByTestId('vx-unit-verdict')).toContainText(/never released · head \d+/);
    const gate = panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="gate"]');
    // Named by its own name, with its Trigger under it; its own Space, which the header shows, is left out.
    const gateParts = seed.gateName.split('/');
    await expect(gate).toContainText(`Gate ${gateParts.at(-1)}`);
    await expect(gate.getByTestId('vx-unit-subject-context')).toHaveText(gateParts.slice(1, -1).join('/'));
    await expect(gate.getByTestId('vx-unit-subject-context')).toHaveAttribute('title', seed.gateName);
    await expect(panel(page).getByTestId('vx-unit-status').getByRole('heading')).toHaveText('Why it is not released');
    // The Unit records the Trigger behind its gate, so the way on is to check the gate again.
    await expect(primary(page)).toHaveText(/^Check again/);
    await expect(primary(page)).toBeEnabled();
    if (SHOTS) await shot(page, 'shot-panel-final-gated.png');

    await rowOf(page, 'unrel').locator('[data-column="Slug"]').click();
    await expect(headline(page)).toHaveText(/^Ready to release: rev \d+ is not released$/);
    await expect(panel(page).getByTestId('vx-unit-verdict')).toHaveAttribute('data-tone', 'attention');
    await expect(panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="unreleased"]')).toContainText('1 unreleased revision');

    await rowOf(page, 'up').locator('[data-column="Slug"]').click();
    await expect(headline(page)).toHaveText(/^Upgrade available: upstream is at rev \d+$/);
    await expect(panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="upstream"]')).toContainText(`-u/up`);

    await rowOf(page, 'ok').locator('[data-column="Slug"]').click();
    await expect(headline(page)).toHaveText(/^Nothing to do: rev \d+ is released$/);
    await expect(panel(page).getByTestId('vx-unit-verdict')).toHaveAttribute('data-tone', 'ok');
    await expect(panel(page).getByTestId('vx-unit-status').getByRole('heading')).toHaveText('Status');
    // A healthy Unit's way on is the next Unit that needs attention.
    await expect(panel(page).getByTestId('vx-unit-primary')).toHaveText(/^Go to (gated|unrel|up|b-unrel)⇧J$/);
    if (SHOTS) await shot(page, 'shot-panel-final-healthy.png');
  });

  test('the counts of the group are the table group, and its count matches the header', async ({ page }) => {
    await rowOf(page, 'ok').locator('[data-column="Slug"]').click();
    const group = panel(page).getByTestId('vx-unit-group');
    await expect(group.getByRole('heading')).toHaveText(`In ${seed.spaceA.slug}`);
    await expect(group).toContainText('3 of 4 need attention');
    // In the table's words: the gated Unit is counted under its Status, with the gate after it.
    const counts = group.getByTestId('vx-unit-counts');
    await expect(counts.locator('[data-status="unreleased"]')).toHaveText('2 unreleased (1 blocked by a gate)');
    await expect(counts.locator('[data-status="upgradable"]')).toHaveText('1 upgrade available');
    await expect(counts.locator('[data-status="released"]')).toHaveText('1 released (this Unit)');
    await expect(counts.locator('li')).toHaveCount(3);
    await expect(page.getByTestId('vx-group-row').filter({ hasText: seed.spaceA.slug }).getByTestId('vx-group-count')).toHaveText('4');

    await rowOf(page, 'b-ok').locator('[data-column="Slug"]').click();
    await expect(group.getByRole('heading')).toHaveText(`In ${seed.spaceB.slug}`);
    await expect(group).toContainText('1 of 2 needs attention');
  });

  test('j and k move through the rows in table order, keep focus and the tab, and Esc gives focus to the row shown', async ({ page }) => {
    const order = await slugOrder(page);
    expect(order).toHaveLength(6);
    await rowOf(page, order[0]).locator('[data-column="Slug"]').click();
    await expect(panel(page)).toBeFocused();
    await expect(panel(page).getByTestId('vx-unit-position')).toHaveText('1 of 6');
    await expect(panel(page).getByRole('button', { name: 'Previous Unit' })).toBeDisabled();

    await page.keyboard.press('j');
    await expect(title(page)).toHaveText(order[1]);
    await expect(panel(page).getByTestId('vx-unit-position')).toHaveText('2 of 6');
    await expect(panel(page)).toBeFocused();
    await expect(rowOf(page, order[1])).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('vx-row-panel-status')).toContainText(`${order[1]}, 2 of 6.`);

    // The tab stays as the panel moves.
    await panel(page).getByRole('tab', { name: /^Resources/ }).click();
    await panel(page).focus();
    await page.keyboard.press('j');
    await expect(title(page)).toHaveText(order[2]);
    await expect(panel(page).getByRole('tab', { name: /^Resources/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('k');
    await expect(title(page)).toHaveText(order[1]);
    await page.keyboard.press('ArrowDown');
    await expect(title(page)).toHaveText(order[2]);
    // Caps Lock: an upper-case J without Shift is j.
    await page.keyboard.press('J');
    await expect(title(page)).toHaveText(order[3]);
    await page.keyboard.press('K');
    await expect(title(page)).toHaveText(order[2]);
    // Shift with an arrow is the browser's.
    await page.keyboard.press('Shift+ArrowDown');
    await expect(panel(page).getByTestId('vx-unit-position')).toHaveText('3 of 6');

    await panel(page).getByRole('button', { name: 'Next Unit' }).click();
    await expect(title(page)).toHaveText(order[3]);

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(rowOf(page, order[3])).toBeFocused();

    // Opened again, it starts on Summary.
    await rowOf(page, order[3]).locator('[data-column="Slug"]').click();
    await expect(panel(page).getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
  });

  test('⇧J and ⇧K go to the next and previous Unit that needs attention, across groups and around', async ({ page }) => {
    const order = await slugOrder(page);
    const needs = new Set(['gated', 'unrel', 'up', 'b-unrel']);
    const problemsInOrder = order.filter((s) => needs.has(s));
    const okAt = order.indexOf('ok');
    const after = [...order.slice(okAt + 1), ...order.slice(0, okAt)].find((s) => needs.has(s));

    await rowOf(page, 'ok').locator('[data-column="Slug"]').click();
    await expect(panel(page).getByTestId('vx-unit-primary')).toHaveText(new RegExp(`^Go to ${after}`));
    await page.keyboard.press('Shift+J');
    await expect(title(page)).toHaveText(after!);
    await expect(panel(page)).toBeFocused();

    // From the last problem in table order (in the second group), ⇧J wraps to the first.
    // A click on a row while the panel is open leaves focus on the row, so the panel's keys need it back.
    await rowOf(page, problemsInOrder[problemsInOrder.length - 1]).locator('[data-column="Slug"]').click();
    await expect(panel(page).getByTestId('vx-unit-next')).toContainText(problemsInOrder[0]);
    await page.keyboard.press('Shift+J');
    await expect(title(page)).toHaveText(problemsInOrder[problemsInOrder.length - 1]);
    await panel(page).focus();
    await page.keyboard.press('Shift+J');
    await expect(title(page)).toHaveText(problemsInOrder[0]);
    await page.keyboard.press('Shift+K');
    await expect(title(page)).toHaveText(problemsInOrder[problemsInOrder.length - 1]);

    // The way on from the first group's last problem names the other group.
    const lastInA = problemsInOrder.filter((s) => s !== 'b-unrel').at(-1)!;
    await rowOf(page, lastInA).locator('[data-column="Slug"]').click();
    await expect(panel(page).getByTestId('vx-unit-next')).toContainText(`b-unrel in ${seed.spaceB.slug}`);
  });

  test('the panel reads the open Unit once, and no other row', async ({ page }) => {
    const reads: string[] = [];
    page.on('request', (r) => {
      const m = new URL(r.url()).pathname.match(/^\/api\/space\/[^/]+\/unit\/([^/]+)$/);
      if (m && r.method() === 'GET') reads.push(m[1]);
    });
    await open(page, 'unrel');
    await expect(headline(page)).toHaveText(/^Ready to release/);
    await expect(details(page)).toHaveCount(0);
    expect(reads).toEqual([seed.unitIds.unrel]);

    // Moving on reads the next Unit; coming back reads nothing again.
    await page.keyboard.press('j');
    await expect(details(page)).toHaveCount(0);
    await page.keyboard.press('k');
    await expect(title(page)).toHaveText('unrel');
    await expect(details(page)).toHaveCount(0);
    expect(reads.filter((id) => id === seed.unitIds.unrel)).toHaveLength(1);
    expect(new Set(reads).size).toBe(2);
  });

  test('while the read is on its way the verdict is provisional, never "Nothing to do"', async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(unitRead(seed.spaceA.id, seed.unitIds.ok), async (route) => {
      await held;
      await route.continue();
    });
    await open(page, 'ok');
    await expect(headline(page)).toHaveText('Checking…');
    await expect(details(page)).toHaveAttribute('data-state', 'loading');
    await expect(details(page)).toHaveAttribute('aria-busy', 'true');
    await expect(panel(page)).not.toContainText('Nothing to do');

    // A Unit whose row shows a cause keeps it, with the primary held until the read is in.
    let releaseUnrel: () => void = () => undefined;
    const heldUnrel = new Promise<void>((resolve) => (releaseUnrel = resolve));
    await page.route(unitRead(seed.spaceA.id, seed.unitIds.unrel), async (route) => {
      await heldUnrel;
      await route.continue();
    });
    await open(page, 'unrel');
    await expect(headline(page)).toHaveText(/^Ready to release/);
    await expect(primary(page)).toHaveText(/^Checking…/);
    await expect(primary(page)).toBeDisabled();
    // Enter does not run a primary that is held.
    await panel(page).focus();
    await page.keyboard.press('Enter');
    await expect(title(page)).toHaveText('unrel');
    releaseUnrel();
    await expect(primary(page)).toHaveText(new RegExp(`^Release ${seed.spaceA.slug}`));
    await expect(primary(page)).toBeEnabled();
    await open(page, 'ok');
    await expect(headline(page)).toHaveText('Checking…');
    release();
    await expect(headline(page)).toHaveText(/^Nothing to do: rev \d+ is released$/);
    await expect(details(page)).toHaveCount(0);
  });

  test('a read that fails says so, and Retry reads again', async ({ page }) => {
    let fail = true;
    await page.route(unitRead(seed.spaceA.id, seed.unitIds.ok), (route) => (fail ? route.abort() : route.continue()));
    await open(page, 'ok');
    await expect(details(page)).toHaveAttribute('data-state', 'error');
    await expect(details(page)).toContainText('Details could not be read');
    await expect(headline(page)).toHaveText('Could not confirm: details did not load');
    // The next step is not known, so nothing runs: the primary is shown, off.
    await expect(primary(page)).toHaveText(/^Unavailable/);
    await expect(primary(page)).toBeDisabled();
    fail = false;
    await details(page).getByRole('button', { name: 'Read the details again' }).click();
    await expect(headline(page)).toHaveText(/^Nothing to do/);
    await expect(details(page)).toHaveCount(0);
    await expect(primary(page)).toBeEnabled();
    // The browser reports the aborted request; that is the point of this test.
    problems = problems.filter((p) => !/Failed to load resource|net::ERR_FAILED/.test(p));
  });

  test('withheld conflicts come first, and Review conflicts opens the revisions', async ({ page }) => {
    await changeUnitRead(page, seed.spaceA.id, seed.unitIds.ok, (b) => {
      b.Unit.Conflicts = [
        { Reason: 'Guarded', Path: 'spec.replicas' },
        { Reason: 'ProtectedPath', Path: 'metadata.labels.team' },
      ];
    });
    await open(page, 'ok');
    await expect(headline(page)).toHaveText('Needs a decision: 1 change was not applied');
    await expect(panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="conflicts"]')).toContainText('spec.replicas');
    await expect(panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="kept"]')).toContainText('1 value kept by a local override');
    await expect(primary(page)).toHaveText(/^Review conflicts/);
    // Its row looks released, but the read found a cause: the group does not say this Unit needs nothing.
    const group = panel(page).getByTestId('vx-unit-group');
    await expect(group).toContainText('4 Units');
    await expect(group).not.toContainText('need attention');
    const href = await primary(page).getAttribute('href');
    expect(href).toMatch(new RegExp(`^/units/${seed.spaceA.id}/${seed.unitIds.ok}\\?tab=2&explorer=`));
    expect(new URLSearchParams(href!.split('?')[1]).get('explorer')).toContain(`view=${seed.viewId}`);
    await expect(primary(page)).toHaveAttribute('target', '_blank');
  });

  test('a failed last action: See events opens the Unit page on its events', async ({ page }) => {
    const head = (await unitHead(seed.spaceA.id, seed.unitIds.ok));
    await changeUnitRead(page, seed.spaceA.id, seed.unitIds.ok, (b) => {
      b.LatestUnitEvent = { Action: 'InvokeFunctions', Status: 'Failed', RevisionNum: head, Message: 'the worker could not reach the cluster' };
    });
    await open(page, 'ok');
    await expect(headline(page)).toHaveText(`Last action failed on rev ${head}`);
    // The message is the verdict's detail; the line says what failed and when; See events is said once, by the primary.
    await expect(panel(page).getByTestId('vx-unit-verdict')).toContainText('the worker could not reach the cluster');
    const failed = panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="failed"]');
    await expect(failed).toContainText(new RegExp(`^.?InvokeFunctions failed on rev ${head}`));
    await expect(failed.getByRole('link')).toHaveCount(0);
    await expect(primary(page)).toHaveText(/^See events/);
    if (SHOTS) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await shot(page, 'shot-panel-failed-final.png');
    }
    await expect(primary(page)).toHaveAttribute('href', new RegExp(`^/units/${seed.spaceA.id}/${seed.unitIds.ok}\\?tab=0&explorer=`));
  });

  test('needs that are not met: Open Links', async ({ page }) => {
    await changeUnitRead(page, seed.spaceA.id, seed.unitIds.ok, (b) => {
      b.Unit.LinkFindings = [{ Reason: 'NeededNotFound', Path: 'spec.template.spec.containers.0.env.0.value' }];
    });
    await open(page, 'ok');
    await expect(headline(page)).toHaveText('Needs from upstream are not met');
    await expect(primary(page)).toHaveText(/^Open Links/);
    await expect(primary(page)).toHaveAttribute('href', new RegExp(`^/units/${seed.spaceA.id}/${seed.unitIds.ok}\\?tab=3&explorer=`));
  });

  test('the live status of the Release the Space runs, said to be the Release\'s', async ({ page }) => {
    await open(page, 'ok');
    await expect(headline(page)).toHaveText(/^Nothing to do/);
    // Nothing reported, nothing shown.
    await expect(panel(page).locator('li[data-kind="release"]')).toHaveCount(0);

    await page.route('**/api/release?*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const list = (Array.isArray(body) ? body : []) as Array<{ Release?: Record<string, unknown> }>;
      for (const r of list)
        if (r.Release) r.Release.LiveStatus = { Sync: 'Synced', Health: 'Healthy', Reporter: 'argobot', ObservedAt: new Date(Date.now() - 120_000).toISOString() };
      await route.fulfill({ response, json: body });
    });
    await page.reload();
    await open(page, 'ok');
    const fact = panel(page).locator('li[data-kind="release"]');
    await expect(fact).toContainText(new RegExp(`Release \\d+ of ${seed.spaceA.slug}: Synced · Healthy`));
    await expect(fact).toContainText('reported by argobot for the Release, not for this Unit');
    await expect(fact).toContainText('2 min ago');

    // Moving to another Unit of the same Space keeps the fact on screen while the panel settles: it is the cache's.
    const order = await slugOrder(page);
    const inA = new Set(['ok', 'up', 'unrel', 'gated']);
    const at = order.indexOf('ok');
    const [there, back] = inA.has(order[at + 1] ?? '') ? ['j', 'k'] : ['k', 'j'];
    await page.evaluate(() => {
      const w = window as unknown as { __vxRelease: string[] };
      w.__vxRelease = [];
      new MutationObserver(() => {
        const title = document.querySelector('[data-testid="vx-row-panel"] [data-testid="vx-drawer-title"]')?.textContent ?? '';
        const shown = !!document.querySelector('[data-testid="vx-row-panel"] li[data-kind="release"]');
        w.__vxRelease.push(`${title}:${shown}`);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await page.keyboard.press(there);
    await expect(title(page)).not.toHaveText('ok');
    await page.keyboard.press(back);
    await expect(title(page)).toHaveText('ok');
    await expect(fact).toBeVisible();
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => (window as unknown as { __vxRelease: string[] }).__vxRelease);
    expect(seen.filter((e) => inA.has(e.split(':')[0]) && e.endsWith(':false'))).toEqual([]);
  });

  test('e opens the config in a new tab, with the way back to this view', async ({ page }) => {
    await open(page, 'unrel');
    await expect(headline(page)).toHaveText(/^Ready to release/);
    await expect(action(page, 'edit-config')).toHaveAttribute('href', new RegExp(`^/units/${seed.spaceA.id}/${seed.unitIds.unrel}\\?tab=1&explorer=`));
    await panel(page).focus();
    const [tab] = await Promise.all([page.context().waitForEvent('page'), page.keyboard.press('e')]);
    const url = new URL(tab.url());
    expect(url.pathname).toBe(`/units/${seed.spaceA.id}/${seed.unitIds.unrel}`);
    expect(url.searchParams.get('tab')).toBe('1');
    expect(url.searchParams.get('explorer')).toContain(`view=${seed.viewId}`);
    await tab.close();
  });

  test('Release opens the Space on the Components view, and says why it cannot when it cannot', async ({ page }) => {
    await open(page, 'unrel');
    // Its reach: the Space's Units with revisions to release (gated and unrel).
    await expect(primary(page)).toHaveText(new RegExp(`^Release ${seed.spaceA.slug} \\(2 Units\\)`));
    const href = await primary(page).getAttribute('href');
    const url = new URL(href!, 'http://x');
    expect(url.pathname).toBe('/components');
    expect(url.searchParams.get('app')).toBe(seed.componentSlug);
    expect(url.searchParams.get('space')).toBe(seed.spaceA.id);
    // The Components view does not read the way back.
    expect(url.searchParams.get('explorer')).toBeNull();

    await open(page, 'gated');
    await expect(action(page, 'release-space')).toHaveAttribute('aria-disabled', 'true');
    await expect(action(page, 'release-space')).toContainText('blocked by the gate');
    await expect(action(page, 'release-space')).not.toHaveAttribute('href');

    await open(page, 'b-unrel');
    await expect(headline(page)).toHaveText(/^Ready to release/);
    await expect(action(page, 'release-space')).toHaveAttribute('aria-disabled', 'true');
    await expect(action(page, 'release-space')).toContainText('this Space is not a Component');
  });

  test('a Space whose Component is gone reads as not a Component, not as still reading', async ({ page }) => {
    await page.route(
      (url) => url.pathname === `/api/space/${seed.spaceA.id}`,
      async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch();
        const body = (await response.json()) as Record<string, unknown>;
        delete body.Component;
        await route.fulfill({ response, json: body });
      },
    );
    await open(page, 'unrel');
    await expect(headline(page)).toHaveText(/^Ready to release/);
    await expect(details(page)).toHaveCount(0);
    // Nothing waits: no "Checking…" primary, and Release says why it cannot run.
    await expect(primary(page).filter({ hasText: /^Checking/ })).toHaveCount(0);
    await expect(action(page, 'release-space')).toHaveAttribute('aria-disabled', 'true');
    await expect(action(page, 'release-space')).toContainText('this Space is not a Component');
  });

  test('f picks the open Unit and opens Functions for it, with the Units already picked', async ({ page }) => {
    await open(page, 'ok');
    await expect(headline(page)).toHaveText(/^Nothing to do/);
    await expect(action(page, 'run-function')).toContainText('Opens the Functions panel for this Unit');
    await panel(page).focus();
    // Caps Lock: the page's Functions toggle ignores an upper-case F, and so does the panel.
    await page.keyboard.press('F');
    await page.waitForTimeout(200);
    await expect(rowOf(page, 'ok')).not.toHaveAttribute('data-picked', 'true');
    await expect(sidebar(page).getByTestId('invoker-functions-button')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('f');
    await expect(sidebar(page).getByTestId('invoker-functions-button')).toHaveAttribute('aria-expanded', 'true');
    await expect(rowOf(page, 'ok')).toHaveAttribute('data-picked', 'true');
    await unfoldContext(page);
    await expect(functionsCount(page)).toHaveText('1 unit');
    // f in the panel is "Run a Function": with Functions open already, it keeps it open, and the page's toggle does not run.
    await panel(page).focus();
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
    await expect(sidebar(page).getByTestId('invoker-functions-button')).toHaveAttribute('aria-expanded', 'true');
    // Close it from its own button, so the next part starts without it.
    await sidebar(page).getByTestId('invoker-functions-button').click();
    await expect(sidebar(page).getByTestId('invoker-functions-button')).toHaveAttribute('aria-expanded', 'false');

    await page.reload();
    await expect(rows(page)).toHaveCount(6);
    await rowOf(page, 'unrel').getByTestId('vx-row-pick').click();
    await rowOf(page, 'up').getByTestId('vx-row-pick').click();
    await open(page, 'ok');
    await expect(action(page, 'run-function')).toContainText('Adds this Unit to the 2 picked, then opens Functions');
    await action(page, 'run-function').click();
    await expect(sidebar(page).getByTestId('invoker-functions-button')).toHaveAttribute('aria-expanded', 'true');
    await unfoldContext(page);
    await expect(functionsCount(page)).toHaveText('3 units');
    await expect(rowOf(page, 'ok')).toHaveAttribute('data-picked', 'true');
    // Picked already: a second run adds nothing.
    await action(page, 'run-function').click();
    await expect(functionsCount(page)).toHaveText('3 units');
    await sidebar(page).getByTestId('invoker-functions-button').click();
    await expect(sidebar(page).getByTestId('invoker-functions-button')).toHaveAttribute('aria-expanded', 'false');
  });

  test('outside the Table layout, Run a Function is off and says why', async ({ page }) => {
    await page.getByTestId('vx-layout-board').click();
    const card = page.getByTestId('vx-board-card').filter({ has: page.getByText('ok', { exact: true }) });
    await card.click({ position: { x: 8, y: 8 } });
    await expect(action(page, 'run-function')).toHaveAttribute('aria-disabled', 'true');
    await expect(action(page, 'run-function')).toContainText('Use the Table layout');
  });

  test('Enter runs the primary from the panel itself', async ({ page }) => {
    await open(page, 'ok');
    await expect(primary(page)).toHaveText(/^Go to (\S+)⇧J$/);
    const target = (await primary(page).innerText()).replace(/^Go to /, '').replace(/⇧J$/, '');
    await panel(page).focus();
    await page.keyboard.press('Enter');
    await expect(title(page)).toHaveText(target);
  });

  test('holding j reads nothing for the rows it passes over', async ({ page }) => {
    const order = await slugOrder(page);
    const reads: string[] = [];
    page.on('request', (r) => {
      const m = new URL(r.url()).pathname.match(/^\/api\/space\/[^/]+\/unit\/([^/]+)$/);
      if (m && r.method() === 'GET') reads.push(m[1]);
    });
    await open(page, order[0]);
    await expect(details(page)).toHaveCount(0);
    // Four j in one task of the page. The panel settles on a row by a timer, and no timer runs before a task and its
    // microtasks end, so the three rows passed over are left inside the settle window however slow the machine is.
    // React commits a key's move in a microtask, so each key waits on microtasks only, and moves the panel a row from
    // where the last one left it, as held keys do.
    const shown = await page.evaluate(async () => {
      const el = document.querySelector('[data-testid="vx-row-panel"]') as HTMLElement;
      const titleNow = () => el.querySelector('[data-testid="vx-drawer-title"]')?.textContent ?? '';
      const titles: string[] = [];
      for (let i = 0; i < 4; i++) {
        const before = titleNow();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true, cancelable: true }));
        for (let turn = 0; turn < 50 && titleNow() === before; turn++) await Promise.resolve();
        titles.push(titleNow());
      }
      return titles;
    });
    expect(shown).toEqual(order.slice(1, 5));
    await expect(title(page)).toHaveText(order[4]);
    await expect(details(page)).toHaveCount(0);
    // The row it stopped on is read once it settles; a timer for a row passed over would have run before this one.
    await expect.poll(() => reads).toContain(seed.unitIds[order[4]]);
    for (const slug of order.slice(1, 4)) expect(reads, `no read of ${slug}`).not.toContain(seed.unitIds[slug]);
  });

  test('a Unit already read shows its verdict at once on a return, and the move is said once', async ({ page }) => {
    const order = await slugOrder(page);
    await open(page, order[0]);
    await expect(details(page)).toHaveCount(0);
    await page.keyboard.press('j');
    await expect(title(page)).toHaveText(order[1]);
    await expect(details(page)).toHaveCount(0);
    const first = await headline(page).innerText();
    const texts = await recordPanelTexts(page);
    await page.keyboard.press('k');
    await expect(title(page)).toHaveText(order[0]);
    await expect(page.getByTestId('vx-row-panel-status')).toContainText(`${order[0]}, 1 of 6.`);
    await page.keyboard.press('j');
    await expect(title(page)).toHaveText(order[1]);
    await expect(page.getByTestId('vx-row-panel-status')).toContainText(`${order[1]}, 2 of 6. ${first}`);
    const seen = await texts();
    // Both were read before, so neither waits on "Checking…", even while the panel settles.
    expect(seen.headline).not.toContain('Checking…');
    // One announcement per move, each with its verdict; the first is the one already there.
    const said = seen.status.slice(1).filter(Boolean);
    expect(said).toEqual([expect.stringMatching(new RegExp(`^${order[0]}, 1 of 6\\. `)), `${order[1]}, 2 of 6. ${first}`]);
    expect(said.join(' ')).not.toContain('Checking…');

    // A healthy Unit not read yet shows "Checking…" while it is read, but is said once, with its verdict.
    const at = order.indexOf('b-ok') + 1;
    await open(page, 'b-ok');
    await expect(details(page)).toHaveCount(0);
    await expect(headline(page)).toHaveText(/^Nothing to do/);
    await expect(page.getByTestId('vx-row-panel-status')).toContainText(`b-ok, ${at} of 6. Nothing to do`);
    const later = await texts();
    expect(later.headline).toContain('Checking…');
    expect(later.status.filter((t) => t.startsWith('b-ok, '))).toEqual([`b-ok, ${at} of 6. ${await headline(page).innerText()}`]);
  });

  test('a return to a Unit whose read failed says its verdict once, not the old error first', async ({ page }) => {
    let fail = true;
    await page.route(unitRead(seed.spaceA.id, seed.unitIds.ok), (route) =>
      fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { Code: 'Internal', Message: 'boom' } }) : route.continue(),
    );
    await open(page, 'ok');
    await expect(details(page)).toHaveAttribute('data-state', 'error');
    await page.keyboard.press('j');
    await expect(title(page)).not.toHaveText('ok');
    await expect(details(page)).toHaveCount(0);
    fail = false;
    const texts = await recordPanelTexts(page);
    await page.keyboard.press('k');
    await expect(title(page)).toHaveText('ok');
    await expect(headline(page)).toHaveText(/^Nothing to do/);
    await expect(page.getByTestId('vx-row-panel-status')).toContainText(/^ok, \d+ of 6\. Nothing to do/);
    const saidOk = (await texts()).status.filter((t) => t.startsWith('ok, '));
    expect(saidOk).toHaveLength(1);
    expect(saidOk[0]).not.toContain('Could not confirm');
    problems = problems.filter((p) => !/status of 500/.test(p));
  });

  test('a Unit with nothing to release does not read its Space\'s Component', async ({ page }) => {
    const spaceReads: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (r.method() === 'GET' && url.pathname === `/api/space/${seed.spaceA.id}` && url.searchParams.get('include') === 'ComponentID') spaceReads.push(url.search);
    });
    await open(page, 'ok');
    await expect(headline(page)).toHaveText(/^Nothing to do/);
    await open(page, 'unrel');
    await expect(primary(page)).toHaveText(new RegExp(`^Release ${seed.spaceA.slug}`));
    expect(spaceReads).toHaveLength(1);
  });

  test('a Component that cannot be read: Release says why, the primary moves on, and Retry reads it again', async ({ page }) => {
    let fail = true;
    await page.route(
      (url) => url.pathname === `/api/space/${seed.spaceA.id}` && url.searchParams.get('include') === 'ComponentID',
      (route) => (fail ? route.fulfill({ status: 500, json: { Code: 'Internal', Message: 'boom' } }) : route.continue()),
    );
    await open(page, 'unrel');
    await expect(details(page)).toHaveAttribute('data-state', 'partial');
    await expect(details(page)).toContainText('The Component of this Space could not be read');
    await expect(action(page, 'release-space')).toHaveAttribute('aria-disabled', 'true');
    await expect(action(page, 'release-space')).toContainText('could not read the Component for this Space');
    // Nothing else comes before Release for this Unit, so there is no primary rather than a dead one.
    await expect(primary(page)).toHaveCount(0);
    await expect(headline(page)).toHaveText(/^Ready to release/);
    fail = false;
    await details(page).getByRole('button', { name: 'Read the details again' }).click();
    await expect(details(page)).toHaveCount(0);
    await expect(primary(page)).toHaveText(new RegExp(`^Release ${seed.spaceA.slug}`));
    problems = problems.filter((p) => !/status of 500/.test(p));
  });

  test('a Unit that is gone says so and offers nothing to run', async ({ page }) => {
    await page.route(unitRead(seed.spaceA.id, seed.unitIds.unrel), (route) =>
      route.fulfill({ status: 404, json: { Code: 'NotFound', Message: 'unit not found' } }),
    );
    await open(page, 'unrel');
    await expect(details(page)).toHaveAttribute('data-state', 'error');
    await expect(details(page)).toContainText('This Unit no longer exists');
    await expect(details(page).getByRole('button')).toHaveCount(0);
    await expect(primary(page)).toHaveCount(0);
    await expect(panel(page).getByTestId('vx-unit-actions')).toHaveCount(0);
    await panel(page).focus();
    const opened: string[] = [];
    page.context().on('page', (p) => opened.push(p.url()));
    await page.keyboard.press('e');
    await page.waitForTimeout(300);
    expect(opened).toEqual([]);
    problems = problems.filter((p) => !/Failed to load resource: the server responded with a status of 404/.test(p));
  });

  test('while comparing, j and k move nothing; back at the table the panel is where it was', async ({ page }) => {
    await rowOf(page, 'unrel').getByTestId('vx-row-pick').click();
    await rowOf(page, 'up').getByTestId('vx-row-pick').click();
    await open(page, 'ok');
    await expect(headline(page)).toHaveText(/^Nothing to do/);
    await page.getByTestId('vx-selection-compare').click();
    await expect(page.getByTestId('vx-compare')).toBeVisible();
    // The hidden panel cannot hold focus, so its keys are sent to it directly: the handler itself must ignore them.
    const panelReads: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (r.method() === 'GET' && /^\/api\/space\/[^/]+\/unit\/[^/]+$/.test(url.pathname) && url.searchParams.get('include')?.includes('UnitEventID'))
        panelReads.push(url.pathname);
    });
    for (const key of ['j', 'j', 'k', 'J', 'u', 'r']) await panel(page).dispatchEvent('keydown', { key, shiftKey: key === 'J' });
    await page.waitForTimeout(500);
    await expect(page.getByTestId('vx-compare')).toBeVisible();
    expect(panelReads).toEqual([]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /Back to table/ }).click();
    await expect(page.getByTestId('vx-compare')).toHaveCount(0);
    await expect(title(page)).toHaveText('ok');
    await expect(rowOf(page, 'ok')).toHaveAttribute('data-selected', 'true');
  });

  test('a move into a folded group unfolds it and shows the row', async ({ page }) => {
    const bGroup = page.getByTestId('vx-group-row').filter({ hasText: seed.spaceB.slug });
    await bGroup.getByTestId('vx-group-toggle').click();
    await expect(rowOf(page, 'b-unrel')).toHaveCount(0);

    const order = await slugOrder(page);
    await rowOf(page, order[order.length - 1]).locator('[data-column="Slug"]').click();
    await page.keyboard.press('j');
    await expect(rows(page)).toHaveCount(6);
    const shown = await title(page).innerText();
    await expect(rowOf(page, shown)).toHaveAttribute('data-selected', 'true');
    await expect(rowOf(page, shown)).toBeInViewport();
    await expect(panel(page)).toBeFocused();
  });

  test('a move to a row out of sight scrolls it below the pinned headers', async ({ page }) => {
    // Short enough that the rows scroll under the column header and the pinned group header.
    await page.setViewportSize({ width: 1280, height: 420 });
    const order = await slugOrder(page);
    await open(page, order[0]);
    for (let i = 1; i < order.length; i++) {
      await page.keyboard.press('j');
      await expect(title(page)).toHaveText(order[i]);
      const row = await rowOf(page, order[i]).boundingBox();
      const table = await page.getByTestId('vx-table').boundingBox();
      const pinned = page.getByTestId('vx-pinned-groups').locator(':scope > *').last();
      const floor = (await pinned.count()) ? (await pinned.boundingBox())! : null;
      expect(row, order[i]).not.toBeNull();
      expect(row!.y + row!.height, `${order[i]} above the bottom`).toBeLessThanOrEqual(table!.y + table!.height + 1);
      if (floor) expect(row!.y, `${order[i]} below the pinned header`).toBeGreaterThanOrEqual(floor.y + floor.height - 1);
    }
  });

  test('Check again runs the gate\'s Trigger on the Unit, stores nothing, and shows the result on its line', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const server = await unitOnServer(seed.spaceA.id, seed.unitIds.gated);
    const triggerId = server.ValidationTriggerIDs?.[seed.gateName];
    expect(triggerId, 'the server records the Trigger behind the gate').toBeTruthy();

    await open(page, 'gated');
    await expect(primary(page)).toHaveText(/^Check again/);
    await expect(details(page)).toHaveCount(0);
    const after: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (r.method() === 'GET' && (isUnitList(url) || url.pathname.startsWith(`/api/space/${seed.spaceA.id}/unit/`))) after.push(url.pathname);
    });
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/function/invoke'),
      primary(page).click(),
    ]);
    const url = new URL(request.url());
    expect(url.searchParams.get('where')).toBe(`UnitID = '${seed.unitIds.gated}'`);
    expect(url.searchParams.get('executor_space')).toBe(seed.spaceA.id);
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({ Triggers: [triggerId], StopOnError: false, ToolchainType: 'Kubernetes/YAML' });
    expect(body).not.toHaveProperty('UpdateValidationResults');

    // Two replicas still fail the gate's expression.
    const result = panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="gate"]').getByTestId('vx-unit-gate-check');
    await expect(result).toHaveAttribute('data-check', 'failed');
    await expect(result).toContainText(/^Still fails/);
    await expect(primary(page)).toBeEnabled();
    if (SHOTS) await shot(page, 'shot-panel-gate-check.png');
    // A check writes nothing, so nothing is read again: not the explorer's Units, not this Unit.
    await page.waitForTimeout(1500);
    expect(after).toEqual([]);
    // Display only: the gate is still on the Unit.
    expect((await unitOnServer(seed.spaceA.id, seed.unitIds.gated)).ValidationErrors?.[seed.gateName]).toBe(true);
    await expect(headline(page)).toHaveText(/^Blocked: rev \d+ cannot release$/);
  });

  test('a gate check in flight, passed, and one that could not run', async ({ page }) => {
    let answer: 'hold' | 'pass' | 'fail' = 'hold';
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === '/api/function/invoke',
      async (route) => {
        if (answer === 'hold') {
          await held;
          return route.continue();
        }
        if (answer === 'fail') return route.fulfill({ status: 500, json: { Code: 'Internal', Message: 'the worker is not connected' } });
        const output = Buffer.from(JSON.stringify([{ Index: 0, Passed: true }])).toString('base64');
        return route.fulfill({ json: [{ Success: true, Outputs: { ValidationResult: output } }] });
      },
    );
    const invokes: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/function/invoke') invokes.push(r.url());
    });
    await open(page, 'gated');
    await expect(primary(page)).toHaveText(/^Check again/);
    const gateLine = panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="gate"]');
    // Two clicks before the page draws again send one check.
    await primary(page).evaluate((el) => {
      (el as HTMLElement).click();
      (el as HTMLElement).click();
    });
    await expect(gateLine.getByTestId('vx-unit-gate-check')).toHaveAttribute('data-check', 'running');
    await expect(primary(page)).toHaveText(/^Checking the gate…/);
    await expect(primary(page)).toBeDisabled();
    // While it runs, the line's own link is gone, so it cannot be started twice.
    await expect(gateLine.getByRole('button', { name: /^Check again, gate / })).toHaveCount(0);
    release();
    await expect(gateLine.getByTestId('vx-unit-gate-check')).toHaveAttribute('data-check', 'failed');
    expect(invokes).toHaveLength(1);

    answer = 'pass';
    await gateLine.getByRole('button', { name: /^Check again, gate / }).click();
    await expect(gateLine.getByTestId('vx-unit-gate-check')).toHaveAttribute('data-check', 'passed');
    await expect(gateLine.getByTestId('vx-unit-gate-check')).toHaveText('Passes now. The stored result stays until the Unit next changes.');

    answer = 'fail';
    await gateLine.getByRole('button', { name: /^Check again, gate / }).click();
    await expect(gateLine.getByTestId('vx-unit-gate-check')).toHaveAttribute('data-check', 'error');
    await expect(gateLine.getByTestId('vx-unit-gate-check')).toContainText('Could not check: ');
    problems = problems.filter((p) => !/status of 500/.test(p));
  });

  test('a gate with no known Trigger cannot be checked from here: the primary is Edit at its path', async ({ page }) => {
    await changeUnitRead(page, seed.spaceA.id, seed.unitIds.gated, (b) => {
      delete b.Unit.ValidationTriggerIDs;
    });
    await open(page, 'gated');
    await expect(primary(page)).toHaveText(/^Edit (at \S+|config)/);
    await expect(primary(page)).toHaveAttribute('href', new RegExp(`/units/${seed.spaceA.id}/${seed.unitIds.gated}\\?tab=1&`));
    await expect(panel(page).getByRole('button', { name: /^Check again, gate / })).toHaveCount(0);
  });

  test('See diff shows the unreleased changes, read only, from the released revision to the head', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const server = await unitOnServer(seed.spaceA.id, seed.unitIds.unrel);
    await open(page, 'unrel');
    await expect(headline(page)).toHaveText(/^Ready to release/);
    const unreleased = panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="unreleased"]');
    const [request] = await Promise.all([
      page.waitForRequest((r) => new URL(r.url()).pathname === `/api/space/${seed.spaceA.id}/unit/${seed.unitIds.unrel}/diff`),
      unreleased.getByRole('button', { name: 'See the diff of the unreleased revisions' }).click(),
    ]);
    const url = new URL(request.url());
    expect(url.searchParams.get('from')).toBe(String(server.LastReleasedRevisionNum));
    expect(url.searchParams.get('to')).toBe(String(server.HeadRevisionNum));
    const dialog = page.getByTestId('vx-unit-diff');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`Unreleased changes: rev ${server.LastReleasedRevisionNum} → ${server.HeadRevisionNum}`);
    await expect(dialog.getByTestId('config-diff-old-value').filter({ hasText: /(^|\s)5$/ })).toHaveCount(1);
    await expect(dialog.getByTestId('config-diff-new-value').filter({ hasText: /(^|\s)6$/ })).toHaveCount(1);
    await expect(dialog).toContainText('replicas');
    if (SHOTS) await shot(page, 'shot-panel-diff.png');

    // The panel's keys do not reach through the dialog, and Esc closes the dialog before the panel.
    await page.keyboard.press('j');
    await expect(title(page)).toHaveText('unrel');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await expect(title(page)).toHaveText('unrel');
  });

  test('the diff dialog: reading, an error with Retry, and no changes', async ({ page }) => {
    let answer: 'fail' | 'empty' = 'fail';
    await page.route(
      (url) => url.pathname === `/api/space/${seed.spaceA.id}/unit/${seed.unitIds.unrel}/diff`,
      (route) =>
        answer === 'fail'
          ? route.fulfill({ status: 500, json: { Code: 'Internal', Message: 'boom' } })
          : route.fulfill({ json: { SpaceID: seed.spaceA.id, UnitID: seed.unitIds.unrel, Diff: { Resources: [] } } }),
    );
    await open(page, 'unrel');
    await panel(page).getByRole('button', { name: 'See the diff of the unreleased revisions' }).click();
    const dialog = page.getByTestId('vx-unit-diff');
    await expect(dialog.getByTestId('vx-unit-diff-error')).toContainText('The diff could not be read');
    answer = 'empty';
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByTestId('vx-unit-diff-none')).toContainText('No changes');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
    problems = problems.filter((p) => !/status of 500/.test(p));
  });

  test('? lists the keys of the row panel', async ({ page }) => {
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('?');
    const map = page.getByTestId('vx-shortcut-map');
    await expect(map).toBeVisible();
    for (const keys of ['J / K', '⇧J / ⇧K', '↵', 'U', 'E', 'R', 'F']) {
      // E also has the picked cell's own line; the panel's says when it acts.
      const line = map
        .getByTestId('vx-shortcut')
        .filter({ has: page.locator('dt').getByText(keys, { exact: true }) })
        .filter({ hasText: 'while the row panel has focus' });
      await expect(line, keys).toHaveCount(1);
    }
    await page.keyboard.press('Escape');
    await expect(map).toHaveCount(0);
  });

  test('Preview upgrade runs the dry run only, shows this Unit\'s changes, and Close writes nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const headBefore = await unitHead(seed.spaceA.id, seed.unitIds.up);
    const writes = recordWrites(page);
    await open(page, 'up');
    await expect(headline(page)).toHaveText(/^Upgrade available/);
    await expect(primary(page)).toHaveText(/^Preview upgrade/);
    await expect(details(page)).toHaveCount(0);
    await primary(page).click();
    const dialog = page.getByTestId('vx-unit-preview');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Upgrade preview: upstream rev \d+ → \d+/);
    await expect(dialog).toContainText('A dry run: nothing is written.');
    // The clone has 4 replicas; its upstream has 7 since.
    await expect(dialog.getByTestId('config-diff-old-value').filter({ hasText: /(^|\s)4$/ })).toHaveCount(1);
    await expect(dialog.getByTestId('config-diff-new-value').filter({ hasText: /(^|\s)7$/ })).toHaveCount(1);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.filter((w) => !isDryRun(w))).toEqual([]);
    const where = writes[0].params.get('where') ?? '';
    expect(where).toContain(seed.spaceA.id);
    expect(where).toContain('UpstreamUnitID');
    expect(writes[0].params.get('include')).toBe('Diff');
    if (SHOTS) await shot(page, 'shot-panel-upgrade-preview.png');

    const sent = writes.length;
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(primary(page)).toBeFocused();
    await page.waitForTimeout(1000);
    expect(writes).toHaveLength(sent);
    expect(await unitHead(seed.spaceA.id, seed.unitIds.up)).toBe(headBefore);
    await expect(headline(page)).toHaveText(/^Upgrade available/);
  });

  test('u opens the preview; keys in the dialogs stay there; Upgrade… then Cancel writes nothing', async ({ page }) => {
    const writes = recordWrites(page);
    await open(page, 'up');
    await expect(details(page)).toHaveCount(0);
    await expect(action(page, 'upgrade')).toContainText('preview first');
    await panel(page).focus();
    await page.keyboard.press('u');
    const dialog = page.getByTestId('vx-unit-preview');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('config-diff-new-value').first()).toBeVisible();
    // The panel's keys do not reach through, and neither does the page's Functions toggle.
    for (const key of ['j', 'k', 'r', 'e', 'f']) await page.keyboard.press(key);
    await page.waitForTimeout(300);
    await expect(title(page)).toHaveText('up');
    await expect(sidebar(page).getByTestId('invoker-functions-button')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    // Esc closes the dialog before the panel, and focus goes back to the panel that opened it.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(panel(page)).toBeFocused();

    await page.keyboard.press('u');
    await dialog.getByRole('button', { name: 'Upgrade…' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Confirm Bulk Upgrade' });
    await expect(confirm).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press('j');
    await page.keyboard.press('Enter');
    await expect(title(page)).toHaveText('up');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(panel(page)).toBeFocused();
    await page.waitForTimeout(1000);
    expect(writes.filter((w) => !isDryRun(w))).toEqual([]);
    await expect(headline(page)).toHaveText(/^Upgrade available/);
  });

  test('a Unit released at its head offers Restore a revision…, which opens its revisions', async ({ page }) => {
    await open(page, 'ok');
    await expect(headline(page)).toHaveText(/^Nothing to do/);
    await expect(action(page, 'restore')).toHaveCount(0);
    await expect(action(page, 'restore-history')).toContainText('Restore a revision…');
    await expect(action(page, 'restore-history')).toHaveAttribute('href', new RegExp(`^/units/${seed.spaceA.id}/${seed.unitIds.ok}\\?tab=2&explorer=`));
    await panel(page).focus();
    const [tab] = await Promise.all([page.context().waitForEvent('page'), page.keyboard.press('r')]);
    const url = new URL(tab.url());
    expect(url.pathname).toBe(`/units/${seed.spaceA.id}/${seed.unitIds.ok}`);
    expect(url.searchParams.get('tab')).toBe('2');
    await tab.close();
  });

  test('Restore rev N asks first, on the released revision; Cancel writes nothing', async ({ page }) => {
    const server = await unitOnServer(seed.spaceA.id, seed.unitIds.unrel);
    const writes = recordWrites(page);
    await open(page, 'unrel');
    await expect(action(page, 'restore')).toContainText(`Restore rev ${server.LastReleasedRevisionNum}`);
    await panel(page).focus();
    await page.keyboard.press('r');
    const confirm = page.getByRole('dialog').filter({ hasText: 'Restore Units' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('radio', { name: /Last Released Revision/ })).toBeChecked();
    await page.keyboard.press('j');
    await page.keyboard.press('f');
    await expect(title(page)).toHaveText('unrel');
    await page.waitForTimeout(200);
    await expect(sidebar(page).getByTestId('invoker-functions-button')).toHaveAttribute('aria-expanded', 'false');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(panel(page)).toBeFocused();
    await page.waitForTimeout(1000);
    expect(writes).toEqual([]);
    expect(await unitHead(seed.spaceA.id, seed.unitIds.unrel)).toBe(server.HeadRevisionNum);
  });

  test('Upgrade… stays off, and says why, until the dry run has answered for this Unit without an error', async ({ page }) => {
    let mode: 'hold' | 'fail' | 'missing' | 'refuse' | 'real' = 'hold';
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === '/api/unit' && url.searchParams.get('dry_run') === 'true',
      async (route) => {
        if (mode === 'hold') await held;
        if (mode === 'fail') return route.fulfill({ status: 500, json: { Code: 'Internal', Message: 'boom' } });
        if (mode === 'missing') return route.fulfill({ json: [] });
        const response = await route.fetch();
        const body = (await response.json()) as Array<{ Unit?: { UnitID?: string }; Error?: unknown }>;
        if (mode === 'refuse') for (const e of body) if (e.Unit?.UnitID === seed.unitIds.up) e.Error = { Code: 'Conflict', Message: 'the upstream cannot be merged' };
        return route.fulfill({ response, json: body });
      },
    );
    const dialog = page.getByTestId('vx-unit-preview');
    const upgrade = dialog.getByRole('button', { name: 'Upgrade…' });
    const why = dialog.getByTestId('vx-unit-preview-blocked');
    const preview = async () => {
      await open(page, 'up');
      await expect(details(page)).toHaveCount(0);
      await primary(page).click();
      await expect(dialog).toBeVisible();
    };

    await preview();
    await expect(upgrade).toBeDisabled();
    await expect(why).toHaveText('Waiting for the dry run');
    mode = 'real';
    release();
    await expect(dialog.getByTestId('config-diff-new-value').first()).toBeVisible();
    await expect(upgrade).toBeEnabled();
    await expect(why).toHaveCount(0);

    await page.reload();
    mode = 'fail';
    await preview();
    await expect(why).toHaveText('The preview could not be read');
    await expect(upgrade).toBeDisabled();
    mode = 'missing';
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByTestId('vx-unit-preview-missing')).toBeVisible();
    await expect(why).toHaveText('The dry run did not cover this Unit');
    await expect(upgrade).toBeDisabled();

    await page.reload();
    mode = 'refuse';
    await preview();
    await expect(dialog.getByTestId('vx-unit-preview-refused')).toContainText('the upstream cannot be merged');
    await expect(why).toHaveText('The dry run says the upgrade would fail');
    await expect(upgrade).toBeDisabled();
    await expect(upgrade).toHaveAttribute('aria-describedby', (await why.getAttribute('id'))!);
    problems = problems.filter((p) => !/status of 500/.test(p));
  });

  // The tests below write to the seeded Units, so they come last.

  test('an upstream that moves while the preview is open turns Upgrade… off until it is previewed again', async ({ page }) => {
    // The rows are read again after a write; that answer is held, and says the upstream of `up` moved on by one.
    let hold = false;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(isUnitList, async (route) => {
      if (route.request().method() !== 'GET' || !hold) return route.continue();
      const response = await route.fetch();
      const body = (await response.json()) as Array<{ Unit?: { UnitID?: string }; UpstreamUnit?: { HeadRevisionNum?: number } }>;
      for (const r of body) if (r.Unit?.UnitID === seed.unitIds.up && r.UpstreamUnit) r.UpstreamUnit.HeadRevisionNum = (r.UpstreamUnit.HeadRevisionNum ?? 0) + 1;
      await held;
      await route.fulfill({ response, json: body });
    });
    // A confirmed restore of a Unit no later test reads is the write that reads the rows again.
    await open(page, 'b-unrel');
    await expect(details(page)).toHaveCount(0);
    await panel(page).focus();
    await page.keyboard.press('r');
    hold = true;
    const confirm = page.getByRole('dialog').filter({ hasText: 'Restore Units' });
    await confirm.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(confirm).toHaveCount(0);

    await open(page, 'up');
    await expect(headline(page)).toHaveText(/^Upgrade available: upstream is at rev \d+$/);
    const before = Number((await headline(page).innerText()).match(/rev (\d+)$/)![1]);
    await expect(details(page)).toHaveCount(0);
    await primary(page).click();
    const dialog = page.getByTestId('vx-unit-preview');
    const upgrade = dialog.getByRole('button', { name: 'Upgrade…' });
    await expect(upgrade).toBeEnabled();
    await expect(dialog).toContainText(`→ ${before}`);

    release();
    await expect(dialog.getByTestId('vx-unit-preview-blocked')).toHaveText('The upstream changed; preview again');
    await expect(upgrade).toBeDisabled();
    const [again] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'PATCH' && new URL(r.url()).searchParams.get('dry_run') === 'true'),
      dialog.getByRole('button', { name: 'Preview again' }).click(),
    ]);
    expect(new URL(again.url()).searchParams.get('upgrade')).toBe('true');
    await expect(dialog).toContainText(`→ ${before + 1}`);
    await expect(upgrade).toBeEnabled();
    await expect(dialog.getByTestId('vx-unit-preview-blocked')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('Upgrade… then Upgrade upgrades the Unit, and the panel\'s verdict follows', async ({ page }) => {
    const writes = recordWrites(page);
    await open(page, 'up');
    await expect(headline(page)).toHaveText(/^Upgrade available/);
    await primary(page).click();
    const dialog = page.getByTestId('vx-unit-preview');
    await expect(dialog.getByTestId('config-diff-new-value').first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Upgrade…' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Confirm Bulk Upgrade' });
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'PATCH' && new URL(r.url()).pathname === '/api/unit' && !new URL(r.url()).searchParams.has('dry_run')),
      confirm.getByRole('button', { name: 'Upgrade', exact: true }).click(),
    ]);
    const url = new URL(request.url());
    expect(url.searchParams.get('upgrade')).toBe('true');
    expect(url.searchParams.get('where')).toBe(`UnitID IN ('${seed.unitIds.up}')`);
    await expect(confirm).toHaveCount(0);
    // The row is read again by its id, so the verdict is the upgraded Unit's.
    await expect(headline(page)).not.toHaveText(/^Upgrade available/, { timeout: 15_000 });
    // The new head is unreleased; the Space's gate may or may not have checked it yet.
    await expect(headline(page)).toHaveText(/^(Ready to release: rev \d+ is not released|Checking gates on rev \d+)$/);
    await expect(panel(page).getByTestId('vx-unit-causes').locator('li[data-kind="upstream"]')).toHaveCount(0);
    await expect(action(page, 'upgrade')).toHaveCount(0);
    await expect(panel(page)).toBeFocused();
    expect(writes.filter((w) => !isDryRun(w))).toHaveLength(1);
    const after = (await hubApi.get(`/api/space/${seed.spaceA.id}/unit/${seed.unitIds.up}`, { params: { include: 'UpstreamUnitID' } }).then((r) => r.json())) as {
      Unit?: { UpstreamRevisionNum?: number };
      UpstreamUnit?: { HeadRevisionNum?: number };
    };
    expect(after.Unit?.UpstreamRevisionNum).toBe(after.UpstreamUnit?.HeadRevisionNum);
  });

  test('Restore rev N, confirmed, restores the released revision, and the panel\'s verdict follows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const server = await unitOnServer(seed.spaceA.id, seed.unitIds.unrel);
    const head = server.HeadRevisionNum ?? 0;
    await open(page, 'unrel');
    await expect(headline(page)).toHaveText(`Ready to release: rev ${head} is not released`);
    await expect(details(page)).toHaveCount(0);
    await panel(page).focus();
    await page.keyboard.press('r');
    const confirm = page.getByRole('dialog').filter({ hasText: 'Restore Units' });
    await expect(confirm).toBeVisible();
    if (SHOTS) await shot(page, 'shot-panel-restore.png');
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'PATCH' && new URL(r.url()).pathname === '/api/unit'),
      confirm.getByRole('button', { name: 'Restore', exact: true }).click(),
    ]);
    const url = new URL(request.url());
    expect(url.searchParams.get('restore')).toBe('LastReleasedRevisionNum');
    expect(url.searchParams.get('where')).toBe(`UnitID IN ('${seed.unitIds.unrel}')`);
    await expect(confirm).toHaveCount(0);
    // The restore is a new revision with the released config; the verdict names it.
    await expect(headline(page)).toHaveText(new RegExp(`rev ${head + 1}`), { timeout: 15_000 });
    await expect(panel(page)).toBeFocused();
    expect(await unitHead(seed.spaceA.id, seed.unitIds.unrel)).toBe(head + 1);
  });
});

test.describe('the row panel at scale', () => {
  test.use({ storageState: 'authentication.json' });

  /** 5,000 Units in 25 Spaces, a third of them with a revision to release, served instead of the real Units list. */
  function units(count: number) {
    return Array.from({ length: count }, (_, i) => {
      const head = 5 + (i % 30);
      return {
        Unit: {
          UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          Slug: `unit-${String(i).padStart(4, '0')}`,
          SpaceID: `space-${i % 25}`,
          TargetID: `target-${i % 3}`,
          ToolchainType: 'Kubernetes/YAML',
          HeadRevisionNum: head,
          LastReleasedRevisionNum: i % 3 === 0 ? head - 1 : head,
          UpstreamRevisionNum: 0,
          UpdatedAt: '2026-10-25T12:00:00Z',
        },
        Space: { SpaceID: `space-${i % 25}`, Slug: `perf-space-${String(i % 25).padStart(2, '0')}` },
        Target: { TargetID: `target-${i % 3}`, Slug: `k8s-${i % 3}` },
      };
    });
  }

  test('holding j through 5,000 rows moves the panel with no long task', async ({ page }) => {
    test.skip(!!process.env.SLOW_MODE, 'timing budgets are not meaningful under SLOW_MODE');
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    const all = units(5000);
    const byId = new Map(all.map((u) => [u.Unit.UnitID, u]));
    const body = JSON.stringify(all);
    await page.route(/\/api\/unit(\?|$)/, (route: Route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body }) : route.continue(),
    );
    // The Spaces are made up, so their reads are answered here: the open Unit as the list has it, and no Resources.
    await page.route(/\/api\/space\/space-\d+\//, (route: Route) => {
      const unit = new URL(route.request().url()).pathname.match(/\/unit\/([^/]+)$/)?.[1];
      return route.fulfill({ status: 200, contentType: 'application/json', json: unit ? (byId.get(unit) ?? {}) : [] });
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
    });
    await openExplorer(page, '/x/view-explorer', '5000 of 5000');
    await rows(page).first().locator('[data-column="Slug"]').click();
    await expect(panel(page).getByTestId('vx-unit-position')).toHaveText('1 of 5000');
    await expect(panel(page)).toBeFocused();
    await page.waitForTimeout(500);
    await page.evaluate(() => ((window as unknown as { __longTasks: number[] }).__longTasks = []));

    for (let i = 0; i < 20; i++) await page.keyboard.press('j');
    await expect(panel(page).getByTestId('vx-unit-position')).toHaveText('21 of 5000');
    // The row shown is the one the table selects, scrolled into view.
    const slug = await title(page).innerText();
    await expect(rowOf(page, slug)).toHaveAttribute('data-selected', 'true');
    await expect(rowOf(page, slug)).toBeInViewport();
    await page.waitForTimeout(300);
    const tasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
    expect(tasks.filter((ms) => ms >= LONG_TASK_BUDGET_MS).map(Math.round), 'long tasks while holding j (ms)').toEqual([]);
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });
});
