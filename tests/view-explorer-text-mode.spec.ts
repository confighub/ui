// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page } from '@playwright/test';

import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import type { Lens } from '../src/pages/x/view-explorer/model/types';
import { encodeDraftParam } from '../src/pages/x/view-explorer/model/view-codec';
import { expect, hubApi, test } from './fixtures/test';
import { liveCountsOffText } from '../src/pages/x/view-explorer/model/counts';
import { type ExplorerSeed, seedExplorer, openExplorer, reloadExplorer } from './fixtures/view-explorer-seed';

/**
 * The View Explorer's text mode: the filter as WHERE text in the lens column,
 * applied live when valid; clear errors for what ConfigHub filters cannot say
 * (OR, NOT, parentheses, now(), <>) and for unknown fields; hidden lenses as
 * `-- hidden:` lines; tokens; a Custom WHERE lens opening with its text
 * selected; autocomplete; Copy.
 */

const rows = (page: Page) => page.getByTestId('vx-row');
const input = (page: Page) => page.getByTestId('vx-text-input');
const status = (page: Page) => page.getByTestId('vx-text-status');
const lenses = (page: Page) => page.getByTestId('vx-lens');
const column = (page: Page) => page.getByTestId('vx-lens-column');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function openText(page: Page) {
  // The page's shortcuts are registered once it has loaded its rows.
  await expect(rows(page).first()).toBeVisible();
  await page.keyboard.press(`${mod}+e`);
  await expect(page.getByTestId('vx-text-mode')).toBeVisible();
}

/** Put the caret at the end of the text (End keys stop where a long line wraps). */
async function caretToEnd(page: Page) {
  await input(page).evaluate((el) => {
    const t = el as HTMLTextAreaElement;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  });
}

const draftLink = (viewId: string, lenses: Lens[]) =>
  `/x/view-explorer?view=${viewId}&d=${encodeDraftParam({
    ...defaultViewDef('Unit'),
    columns: [{ name: 'Slug' }, { name: 'Space' }, { name: 'Labels.app' }],
    sort: null,
    lenses,
  })}`;

/** Replace the text, as typing would (fill fires one input event). */
async function setText(page: Page, text: string) {
  await input(page).fill(text);
}

/** Fake Units for the unfiltered list the page counts over (no server data is needed). */
function fakeUnits(n: number) {
  const apps = ['api', 'worker', 'ledger', 'gateway', 'cart', 'web', 'auth', 'redis'];
  return Array.from({ length: n }, (_, i) => {
    const app = apps[i % apps.length];
    return {
      Unit: {
        UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        Slug: `${app}-${i}`,
        SpaceID: 'space-big',
        TargetID: '',
        ToolchainType: 'Kubernetes/YAML',
        Labels: { app, tier: ['web', 'api', 'data'][i % 3] },
        HeadRevisionNum: 1,
        LastReleasedRevisionNum: 1,
        UpstreamRevisionNum: 0,
        CreatedAt: '2026-10-01T00:00:00Z',
        UpdatedAt: '2026-10-01T00:00:00Z',
      },
      Space: { SpaceID: 'space-big', Slug: 'big-space' },
    };
  });
}

/** Serve `n` fake Units as the page's universe; every other request goes to the server. */
async function serveUniverse(page: Page, n: number) {
  const units = fakeUnits(n);
  await page.route('**/api/unit?**', async (route) => {
    const select = new URL(route.request().url()).searchParams.get('select') ?? '';
    if (select.startsWith('UnitID,Slug,')) await route.fulfill({ json: units });
    else await route.continue();
  });
}

test.describe('view explorer text mode: value counts and very large views', () => {
  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  test('above 5,000 Units, values are listed without counts, with the reason', async ({ page }) => {
    await serveUniverse(page, 5001);
    await openExplorer(page, '/x/view-explorer', '5001 of 5001');
    await openText(page);
    await caretToEnd(page);
    await page.keyboard.type("Labels.app = '");
    const items = page.getByTestId('vx-text-suggestion');
    await expect(items.filter({ has: page.getByText('api', { exact: true }) })).toHaveCount(1);
    // In text order, and no count on any of them: a muted dash with the reason.
    expect((await items.allInnerTexts()).map((t) => t.split('\n')[0])).toEqual(['api', 'auth', 'cart', 'gateway', 'ledger', 'redis', 'web', 'worker']);
    await expect(items.first().getByTestId('vx-text-suggestion-no-count')).toHaveText('—');
    await expect(items.first().getByTestId('vx-text-suggestion-no-count')).toHaveAttribute('aria-label', liveCountsOffText('Unit'));
    expect(await items.evaluateAll((els) => els.some((e) => /\d/.test(e.textContent ?? '')))).toBe(false);

    // The catalog's numeric-aware order: api-16 before api-104 (a plain text sort puts api-1000 first).
    await input(page).fill('');
    await page.keyboard.type("Slug = 'api-1");
    expect((await items.allInnerTexts()).slice(0, 3).map((t) => t.split('\n')[0])).toEqual(['api-16', 'api-104', 'api-112']);
  });

  test('at 5,000 Units, values still come with counts', async ({ page }) => {
    await serveUniverse(page, 5000);
    await openExplorer(page, '/x/view-explorer', '5000 of 5000');
    await openText(page);
    await caretToEnd(page);
    await page.keyboard.type("Labels.app = '");
    const api = page.getByTestId('vx-text-suggestion').filter({ has: page.getByText('api', { exact: true }) });
    await expect(api).toContainText('625');
    await expect(page.getByTestId('vx-text-suggestion-no-count')).toHaveCount(0);
  });
});

test.describe('view explorer text mode', () => {
  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  let seed: ExplorerSeed;
  let problems: string[];
  /** A test that loads a filter the server refuses on purpose allows that one 400. */
  let allowRefusal: boolean;
  let where: string;

  test.beforeEach(async ({ page }) => {
    problems = [];
    allowRefusal = false;
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (allowRefusal && m.type() === 'error' && /status of 400/.test(m.text())) return;
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    seed = await seedExplorer(page);
    where = `Space.Slug = '${seed.spaceSlug}'`;
  });

  test.afterEach(async () => {
    await seed.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('⌘E shows the filter as WHERE in a wider column, and back', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text toggle' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(rows(page)).toHaveCount(3);
    const before = (await column(page).boundingBox())?.width ?? 0;
    await openText(page);
    await expect(input(page)).toHaveValue(where);
    await expect(page.getByTestId('vx-text-form')).toHaveAttribute('data-form', 'where');
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
    await expect(status(page)).toContainText('Valid · 3 of');
    await expect.poll(async () => (await column(page).boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(359);
    await page.keyboard.press(`${mod}+e`);
    await expect(page.getByTestId('vx-text-mode')).toHaveCount(0);
    await expect.poll(async () => Math.round((await column(page).boundingBox())?.width ?? 0)).toBe(Math.round(before));
  });

  test('valid text applies by itself and makes a draft', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text apply' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `${where}\nAND Labels.app = 'checkout'`);
    await expect(rows(page)).toHaveCount(2);
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('vx-save-actions')).toContainText(/change/);
    await page.keyboard.press(`${mod}+e`);
    await expect(lenses(page)).toHaveCount(2);
  });

  // Second lines only: `where` is set per test, after this list is built.
  const refused: Array<[string, string, string, RegExp]> = [
    ['OR', 'or', "AND Labels.app = 'checkout' OR Labels.app = 'payments'", /accept only AND/],
    ['NOT', 'not', "AND NOT Labels.app = 'checkout'", /NOT before a term/],
    ['parentheses', 'parens', "AND (Labels.app = 'checkout')", /Parentheses/],
    ['now()', 'now', 'AND UpdatedAt > now()', /now\(\) is not supported/],
    ['<>', 'ne', "AND Labels.app <> 'checkout'", /Use != instead of <>/],
  ];
  for (const [what, slug, line2, message] of refused) {
    test(`${what} is refused with its own message, and nothing is applied`, async ({ page }) => {
      const text = `${where}\n${line2}`;
      const view = await seed.createView({ name: `vx text ${slug}` });
      await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
      await openText(page);
      await setText(page, text);
      await input(page).blur();
      await expect(status(page)).toHaveAttribute('data-status', 'error');
      await expect(page.getByTestId('vx-text-error')).toHaveText(message);
      await expect(status(page)).toContainText('line 2');
      await expect(status(page)).toContainText('Showing the last valid result: 3 of');
      await expect(page.getByTestId('vx-text-highlight').locator('[data-error]').first()).toBeVisible();
      await page.waitForTimeout(600);
      await expect(rows(page)).toHaveCount(3);
      await expect(page.getByTestId('vx-save-actions').filter({ hasText: /change/ })).toHaveCount(0);
    });
  }

  test('a name the page does not list is checked with the server, and applies when it exists', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text unit id' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `${where}\nAND UnitID = '${seed.units[0].id}'`);
    await expect(rows(page)).toHaveCount(1);
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
  });

  test('a field that does not exist is checked with the server, then shown as its error', async ({ page }) => {
    // The server's 400 for the made-up name is the one expected network error.
    allowRefusal = true;
    const view = await seed.createView({ name: 'vx text unknown' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `${where}\nAND bogus = 'x'`);
    await input(page).blur();
    await expect(page.getByTestId('vx-text-error')).toHaveText(/unrecognized attribute name `bogus`/);
    await expect(status(page)).toContainText('line 2');
    await expect(page.getByTestId('vx-text-highlight').locator('[data-error]')).toHaveText('bogus');
    await expect(rows(page)).toHaveCount(3);
  });

  test('an unknown field being typed is underlined and named under the box', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text unknown typing' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await caretToEnd(page);
    await page.keyboard.type('\nAND bogus ');
    await expect(page.getByTestId('vx-text-suggest-error')).toBeVisible();
    await expect(page.getByTestId('vx-text-error')).toHaveText('Unknown field “bogus” for Units.');
    await expect(page.getByTestId('vx-text-highlight').locator('[data-error]')).toHaveText('bogus');
  });

  test('value counts leave out the term under the caret, not another on the same field', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text counts same field' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `${where}\nAND Labels.tier IN ('web', 'api')\nAND Labels.tier != 'api'`);
    await expect(rows(page)).toHaveCount(1);
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
    await caretToEnd(page);
    for (let i = 0; i < "api'".length; i++) await page.keyboard.press('Backspace');
    // Without the second term, the first keeps all three units: two of them are api.
    const api = page.getByTestId('vx-text-suggestion').filter({ has: page.getByText('api', { exact: true }) });
    await expect(api).toContainText('2');
  });

  test('a Custom WHERE term on the same attribute does not shift which term is left out', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text counts custom' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `${where}\nAND Labels.tier ILIKE 'a%'\nAND Labels.tier != 'api'`);
    await expect(rows(page)).toHaveCount(0);
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
    await caretToEnd(page);
    for (let i = 0; i < "api'".length; i++) await page.keyboard.press('Backspace');
    // Left out: the != term (the only field lens on tier); kept: the ILIKE term (beta, gamma).
    const api = page.getByTestId('vx-text-suggestion').filter({ has: page.getByText('api', { exact: true }) });
    await expect(api).toContainText('2');
  });

  test('value counts leave out the term being edited', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text counts' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `${where}\nAND Labels.app = 'checkout'\nAND Labels.tier = 'api'`);
    await expect(rows(page)).toHaveCount(1);
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
    // Take the value back off the last term: the counts are for the other terms (2 checkout units).
    await caretToEnd(page);
    for (let i = 0; i < "api'".length; i++) await page.keyboard.press('Backspace');
    const web = page.getByTestId('vx-text-suggestion').filter({ has: page.getByText('web', { exact: true }) });
    await expect(web).toContainText('1');
    const api = page.getByTestId('vx-text-suggestion').filter({ has: page.getByText('api', { exact: true }) });
    await expect(api).toContainText('1');
  });

  test('switching between two tabs in text mode says when an edit was not applied', async ({ page }) => {
    const name = `vx text two tabs ${seed.spaceSlug.replace(/^vx-spec-/, '')}`;
    const view = await seed.createView({ name });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(rows(page).first()).toBeVisible();
    // Pinned, so the tab stays when the other one is shown (a fresh browser may have pinned it already).
    await page.getByTestId('vx-tab').filter({ hasText: name }).getByRole('button', { name: /^Options for / }).click();
    const pin = page.getByRole('menuitem', { name: 'Pin to your tabs' });
    if (await pin.isVisible()) await pin.click();
    else await page.keyboard.press('Escape');
    // The menu closes with a transition; a click while it is still there lands on its backdrop.
    await expect(page.getByRole('menu')).toBeHidden();
    await page.getByTestId('vx-tab').filter({ hasText: 'All units' }).click();
    await openText(page);
    await page.getByTestId('vx-tab').filter({ hasText: name }).click();
    await openText(page);
    // An edit applied here first (no fork) must not hide the note for the next one.
    await setText(page, `${where}\nAND Labels.app = 'checkout'`);
    await expect(rows(page)).toHaveCount(2);
    await setText(page, `${where}\nAND Labels.app =`);
    await page.getByTestId('vx-tab').filter({ hasText: 'All units' }).click();
    await expect(page.getByTestId('vx-text-mode')).toBeVisible();
    await expect(page.getByText(/Your last edit was not applied/)).toBeVisible();
  });

  test('the status is one live region, assertive only when a new error appears', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text live region' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await expect(status(page)).toHaveAttribute('role', 'status');
    await expect(status(page)).toHaveAttribute('aria-live', 'polite');
    await setText(page, `${where}\nAND Labels.app = 'checkout' OR Labels.app = 'x'`);
    await expect(status(page)).toHaveAttribute('aria-live', 'assertive');
    await expect(status(page).locator('[role="alert"]')).toHaveCount(0);
    await setText(page, `${where}\nAND Labels.app = 'checkout' OR Labels.app = 'xy'`);
    await expect(page.getByTestId('vx-text-error')).toHaveText(/accept only AND/);
    await expect(status(page)).toHaveAttribute('aria-live', 'polite');
  });

  test('leaving text mode with an edit that was not applied says so', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text leave' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `${where}\nAND Labels.app =`);
    await input(page).blur();
    await expect(status(page)).toHaveAttribute('data-status', 'error');
    await page.keyboard.press(`${mod}+e`);
    await expect(page.getByText(/Your last edit was not applied: .* \(line 2\)\./)).toBeVisible();
    await expect(rows(page)).toHaveCount(3);
  });

  test('no value suggestions after an unknown field: the error instead', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text a9' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await input(page).click();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type("bogus = '");
    await expect(page.getByTestId('vx-text-suggest-error')).toHaveText('Unknown field “bogus” for Units.');
    await expect(page.getByTestId('vx-text-suggestion')).toHaveCount(0);
  });

  test('autocomplete offers fields, then values with counts', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text complete' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    // End of the text, not of the visual line: End keys stop where a long line wraps.
    await input(page).evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    });
    await page.keyboard.type(' AND Labels.ap');
    await expect(page.getByTestId('vx-text-suggestion').first()).toContainText('Labels.app');
    await page.keyboard.press('Tab');
    await page.keyboard.type("= 'chec");
    const value = page
      .getByTestId('vx-text-suggestion')
      .filter({ has: page.getByText('checkout', { exact: true }) });
    await expect(value).toContainText('2');
    await page.keyboard.press('Enter');
    await expect(input(page)).toHaveValue(`${where} AND Labels.app = 'checkout' `);
    await expect(rows(page)).toHaveCount(2);
  });

  test('typing sends a handful of requests, not one per keystroke', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text debounce' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await input(page).evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    });
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests.push(r.url());
    });
    // Every prefix from "…> 1" on parses, so only the debounce keeps them from being sent.
    const typed = '\nAND HeadRevisionNum > 123456';
    expect(typed.length).toBeGreaterThanOrEqual(28);
    // Faster than the debounce, as a person types: no text settles until the end.
    await page.keyboard.type(typed, { delay: 40 });
    await expect(rows(page)).toHaveCount(0);
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
    expect(requests.length, requests.join('\n')).toBeLessThanOrEqual(4);
    expect(requests.filter((u) => u.includes('limit=1')), 'one server check').toHaveLength(1);
  });

  test('the mode belongs to the tab, for this page load only', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text sticky' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    const textMode = page.getByTestId('vx-text-mode');
    await page.getByTestId('vx-tab').filter({ hasText: 'All units' }).click();
    await expect(textMode).toHaveCount(0);
    await page.getByTestId('vx-tab').filter({ hasText: 'vx text sticky' }).click();
    await expect(textMode).toBeVisible();
    // Editing "All units" in text mode forks a temporary tab and stays in text mode.
    await page.getByTestId('vx-tab').filter({ hasText: 'All units' }).click();
    await openText(page);
    await setText(page, where);
    await expect(rows(page)).toHaveCount(3);
    await expect(textMode).toBeVisible();
    // The apply forked a temporary tab; that is the edit arriving, not an edit left behind.
    await page.waitForTimeout(500);
    await expect(page.getByText(/Your last edit was not applied/)).toHaveCount(0);
    await reloadExplorer(page);
    await expect(rows(page).first()).toBeVisible();
    await expect(textMode).toHaveCount(0);
  });

  test('ResourceType * is accepted: a view with it can be edited', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text any type' });
    const patch = await hubApi.patch(`/api/space/${view.spaceId}/filter/${view.filterId}`, {
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: { ResourceType: '*', WhereData: 'spec.replicas > 2' },
    });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await expect(page.getByTestId('vx-text-resource-type')).toHaveValue('*');
    await expect(page.getByTestId('vx-text-extra-error')).toHaveCount(0);
    await setText(page, `${where}\nAND Labels.app = 'checkout'`);
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
    await expect(rows(page)).toHaveCount(1);
  });

  test('a pending edit is dropped when the tab changes', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text tab switch' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    const tabCount = await page.getByTestId('vx-tab').count();
    await setText(page, `${where}\nAND Labels.app = 'checkout'`);
    await page.getByTestId('vx-tab').filter({ hasText: 'All units' }).click();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('vx-tab')).toHaveCount(tabCount);
    await expect(page.getByTestId('vx-save-actions').filter({ hasText: /change/ })).toHaveCount(0);
  });

  test('a pending edit is dropped by Discard', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text discard' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `${where}\nAND Labels.app = 'checkout'`);
    await expect(rows(page)).toHaveCount(2);
    await setText(page, `${where}\nAND Labels.app = 'checkout'\nAND Labels.tier = 'api'`);
    await page.getByTestId('vx-save-actions').getByRole('button', { name: 'Discard' }).click();
    await page.waitForTimeout(800);
    await expect(rows(page)).toHaveCount(3);
    await expect(input(page)).toHaveValue(where);
    await expect(page.getByTestId('vx-save-actions').filter({ hasText: /change/ })).toHaveCount(0);
  });

  test('a hidden lens before an enabled one keeps its place, with no draft', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text hidden first' });
    const hiddenTarget: Lens = { id: 'h', enabled: false, kind: 'field', field: 'Labels.app', op: 'isNot', values: ['payments'] };
    const space: Lens = { id: 's', enabled: true, kind: 'field', field: 'Space', op: 'is', values: [seed.spaceSlug] };
    await openExplorer(page, draftLink(view.viewId, [hiddenTarget, space]));
    await openText(page);
    await expect(input(page)).toHaveValue(`-- hidden: Labels.app != 'payments'\n${where}`);
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
    await setText(page, `-- hidden: Labels.app != 'payments'\n${where}\nAND Labels.tier = 'api'`);
    await expect(rows(page)).toHaveCount(2);
    await page.keyboard.press(`${mod}+e`);
    await expect(lenses(page)).toHaveCount(3);
    await expect(lenses(page).nth(0)).toHaveAttribute('data-enabled', 'false');
  });

  test('a saved condition that does not parse is shown with its error, never dropped', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text broken' });
    const space: Lens = { id: 's', enabled: true, kind: 'field', field: 'Space', op: 'is', values: [seed.spaceSlug] };
    const broken: Lens = { id: 'b', enabled: true, kind: 'custom', where: "Slug = 'alpha' OR Slug = 'beta'" };
    // The lens column asks the server for the broken condition's rows, and the server refuses it.
    allowRefusal = true;
    await openExplorer(page, draftLink(view.viewId, [space, broken]));
    await expect(lenses(page)).toHaveCount(2);
    await page.keyboard.press(`${mod}+e`);
    await expect(page.getByTestId('vx-text-mode')).toBeVisible();
    await expect(input(page)).toHaveValue(`${where}\nAND Slug = 'alpha' OR Slug = 'beta'`);
    await expect(page.getByTestId('vx-text-error')).toHaveText(/accept only AND/);
    await expect(page.getByTestId('vx-text-unwritten')).toHaveCount(0);
    await caretToEnd(page);
    await page.keyboard.type(' ');
    await page.waitForTimeout(600);
    await expect(input(page)).toContainText('OR');
    await page.keyboard.press(`${mod}+e`);
    await expect(lenses(page)).toHaveCount(2);
  });

  test('the box tells assistive technology about its state and suggestions', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text aria' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    const describedBy = await input(page).getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveAttribute('data-testid', 'vx-text-status');
    await caretToEnd(page);
    await page.keyboard.type(' AND Labels.ap');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    const listId = await input(page).getAttribute('aria-controls');
    await expect(page.locator(`[id="${listId}"]`)).toHaveAttribute('role', 'listbox');
    const active = await input(page).getAttribute('aria-activedescendant');
    await expect(page.locator(`[id="${active}"]`)).toHaveAttribute('role', 'option');
    await expect(page.locator(`[id="${active}"]`)).toHaveAttribute('aria-selected', 'true');
  });

  test('Enter that ends an IME composition does not pick a suggestion', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text ime' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await caretToEnd(page);
    await page.keyboard.type(' AND Labels.ap');
    await expect(page.getByTestId('vx-text-suggestion').first()).toBeVisible();
    await input(page).evaluate((el) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })),
    );
    await expect(input(page)).toHaveValue(`${where} AND Labels.ap`);
  });

  test('⌘Z in the box takes back a picked suggestion', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text undo pick' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await caretToEnd(page);
    await page.keyboard.type(' AND Labels.ap');
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue(`${where} AND Labels.app `);
    await page.keyboard.press(`${mod}+z`);
    await expect(input(page)).toHaveValue(`${where} AND Labels.ap`);
  });

  test('hidden lenses are -- hidden: lines, both ways', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text hidden' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `${where}\n-- hidden: Labels.app = 'payments'`);
    await expect(status(page)).toHaveAttribute('data-status', 'ok');
    await page.keyboard.press(`${mod}+e`);
    await expect(lenses(page)).toHaveCount(2);
    await expect(lenses(page).nth(1)).toHaveAttribute('data-enabled', 'false');
    await expect(rows(page)).toHaveCount(3);
    await openText(page);
    await expect(input(page)).toHaveValue(`${where}\n-- hidden: Labels.app = 'payments'`);
  });

  test('tokens are read as tokens and convert to WHERE', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text tokens' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await setText(page, `space:${seed.spaceSlug} app:checkout`);
    await expect(page.getByTestId('vx-text-form')).toHaveAttribute('data-form', 'tokens');
    await expect(rows(page)).toHaveCount(2);
    await page.getByTestId('vx-text-convert').click();
    await expect(input(page)).toHaveValue(`${where}\nAND Labels.app = 'checkout'`);
    await expect(page.getByTestId('vx-text-form')).toHaveAttribute('data-form', 'where');
  });

  test('a Custom WHERE lens opens text mode with its text selected', async ({ page }) => {
    const custom = 'HeadRevisionNum >= LastReleasedRevisionNum';
    const view = await seed.createView({ name: 'vx text custom', where: `${where} AND ${custom}` });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(lenses(page)).toHaveCount(2);
    await lenses(page).nth(1).getByTestId('vx-lens-open').click();
    await expect(page.getByTestId('vx-text-mode')).toBeVisible();
    await expect
      .poll(() =>
        input(page).evaluate((el) => {
          const t = el as HTMLTextAreaElement;
          return t.value.slice(t.selectionStart, t.selectionEnd);
        }),
      )
      .toBe(custom);
    await expect(status(page)).toContainText('kept as a Custom WHERE lens');
  });

  test('an unfinished lens is not dropped silently', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text unfinished' });
    const spaceLens: Lens = { id: 'a', enabled: true, kind: 'field', field: 'Space', op: 'is', values: [seed.spaceSlug] };
    const empty: Lens = { id: 'b', enabled: true, kind: 'field', field: 'Labels.tier', op: 'is', values: [] };
    const def = { ...defaultViewDef('Unit'), columns: [{ name: 'Slug' }, { name: 'Space' }, { name: 'Labels.app' }], sort: null, lenses: [spaceLens, empty] };
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}&d=${encodeDraftParam(def)}`);
    await openText(page);
    await expect(page.getByTestId('vx-text-unwritten')).toHaveText(
      '1 unfinished filter is not in the text. Editing the text removes it.',
    );
    await expect(input(page)).toHaveValue(where);
  });

  test('ResourceType and WhereData are their own lines, checked here only', async ({ page }) => {
    const view = await seed.createView({ name: 'vx text extra' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await page.getByTestId('vx-text-where-data').fill('spec.replicas > 2');
    await expect(page.getByTestId('vx-text-extra-hint')).toContainText('Checked here only');
    await expect(rows(page)).toHaveCount(2);
    await page.getByTestId('vx-text-resource-type').fill('apps/v1/Deploy ment');
    await expect(page.getByTestId('vx-text-extra-error')).toContainText('ResourceType is a type');
  });

  test('Copy puts the WHERE and the extra lines on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const view = await seed.createView({ name: 'vx text copy' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await openText(page);
    await page.getByTestId('vx-text-where-data').fill('spec.replicas > 2');
    await page.getByTestId('vx-text-copy').click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`${where}\n-- WhereData: spec.replicas > 2`);
  });
});
