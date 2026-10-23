// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page, Route } from '@playwright/test';

import { LAYOUT_ANNOTATION, MATRIX_AXES_ANNOTATION } from '../src/pages/x/view-explorer/model/annotations';
import { EMPTY_GROUP_VALUE } from '../src/pages/x/view-explorer/model/grouping';
import { expect, hubApi, test } from './fixtures/test';
import { type ExplorerSeed, readView, seedExplorer, viewsNamed, openExplorer } from './fixtures/view-explorer-seed';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The View Explorer's Matrix layout: axes, swap, counts that agree with the
 * table, the status legend, drilling into a cell, and that the layout and its
 * axes are saved with the view.
 *
 * The seed has alpha (checkout, web), beta (checkout, api) and gamma
 * (payments, api), none of them targeted.
 */

const tabNamed = (page: Page, name: string) => page.getByTestId('vx-tab').filter({ hasText: name });
const saveButton = (page: Page) => page.getByTestId('vx-save-actions').getByRole('button', { name: /^Save(\s*⌘S)?$/ });
const cells = (page: Page) => page.getByTestId('vx-matrix-cell');
const texts = (page: Page, testId: string) => page.getByTestId(testId).allInnerTexts();

async function pickAxis(page: Page, axis: 'rows' | 'cols', field: string) {
  await page.getByTestId(`vx-matrix-${axis}`).click();
  await page.getByRole('menuitem', { name: field, exact: true }).click();
  // The menu closes with a transition, and its root (aria-hidden, so role queries already
  // miss it) takes clicks until it is gone: wait for the root itself.
  await expect(page.locator('.MuiPopover-root')).toHaveCount(0, { timeout: 10_000 });
}

async function cleanUp(name: string) {
  for (const v of await viewsNamed(name)) {
    await hubApi.delete(`/api/space/${v.View.SpaceID}/view/${v.View.ViewID}`);
    if (v.View.FilterID) await hubApi.delete(`/api/space/${v.View.SpaceID}/filter/${v.View.FilterID}`);
  }
}

test.describe('view explorer matrix', () => {
  test.use({ storageState: 'authentication.json' });

  let seed: ExplorerSeed;
  let problems: string[];
  let name: string;
  let viewId: string;

  test.beforeEach(async ({ page }) => {
    problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    seed = await seedExplorer(page);
    name = `Matrix ${RandomSlugGenerator.randomSlugName()}`;
    viewId = (await seed.createView({ name })).viewId;
    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(page.getByTestId('vx-row')).toHaveCount(3);
  });

  test.afterEach(async () => {
    await cleanUp(name);
    await seed.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('M shows the matrix; its counts agree with the table; layout and axes are saved', async ({ page }) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('m');
    await expect(page.getByTestId('vx-matrix-layout')).toBeVisible();
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');

    await pickAxis(page, 'rows', 'app');
    await pickAxis(page, 'cols', 'tier');
    await expect(cells(page)).toHaveCount(3);
    expect(await texts(page, 'vx-matrix-row-total')).toEqual(['2', '1']);
    expect(await texts(page, 'vx-matrix-col-total')).toEqual(['2', '1']);
    await expect(page.getByTestId('vx-matrix-total')).toHaveText('3');
    const checkout = page.locator('[data-testid="vx-matrix-row"][data-value="checkout"]');
    expect(await checkout.getByTestId('vx-matrix-count').allInnerTexts()).toEqual(['1', '1']);

    // The same numbers as the table grouped by the same two fields.
    await page.getByTestId('vx-layout-table').click();
    await page.locator('[data-testid="vx-header"][data-column="Labels.app"]').getByRole('button', { name: /column menu$/ }).click();
    await page.getByRole('menuitem', { name: 'Group by app' }).click();
    const groupCount = (value: string) =>
      page.getByTestId('vx-group-row').filter({ hasText: value }).first().getByTestId('vx-group-count');
    await expect(groupCount('checkout')).toHaveText('2');
    await expect(groupCount('payments')).toHaveText('1');
    await page.keyboard.press('ControlOrMeta+z');
    await page.getByTestId('vx-layout-matrix').click();

    await saveButton(page).click();
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true');
    const saved = await readView(seed.spaceId, viewId);
    expect(saved.View.Annotations?.[LAYOUT_ANNOTATION]).toBe('matrix');
    expect(saved.View.Annotations?.[MATRIX_AXES_ANNOTATION]).toBe('Labels.app,Labels.tier');

    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(page.getByTestId('vx-matrix-rows')).toHaveText('app');
    await expect(page.getByTestId('vx-matrix-cols')).toHaveText('tier');
  });

  test('swap exchanges the axes, and picking the other axis swaps too', async ({ page }) => {
    await page.getByTestId('vx-layout-matrix').click();
    await pickAxis(page, 'rows', 'app');
    await pickAxis(page, 'cols', 'tier');
    await page.getByTestId('vx-matrix-swap').click();
    await expect(page.getByTestId('vx-matrix-rows')).toHaveText('tier');
    await expect(page.getByTestId('vx-matrix-cols')).toHaveText('app');
    expect(await texts(page, 'vx-matrix-row-total')).toEqual(['2', '1']);

    await pickAxis(page, 'rows', 'app');
    await expect(page.getByTestId('vx-matrix-rows')).toHaveText('app');
    await expect(page.getByTestId('vx-matrix-cols')).toHaveText('tier');
  });

  test('the legend lists only the statuses that are present', async ({ page }) => {
    await page.getByTestId('vx-layout-matrix').click();
    const legend = page.getByTestId('vx-matrix-legend').locator('[data-status]');
    expect(await legend.evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).toEqual(['Not targeted']);
    await expect(cells(page).first()).toHaveAttribute('data-tone', 'grey');
  });

  test('a cell drills in: two lenses, the table, and Undo puts the matrix back', async ({ page }) => {
    await page.getByTestId('vx-layout-matrix').click();
    await pickAxis(page, 'rows', 'app');
    await pickAxis(page, 'cols', 'tier');
    await page.getByRole('button', { name: /^Drill in: app checkout × tier web/ }).click();

    await expect(page.getByTestId('vx-table')).toBeVisible();
    await expect(page.getByTestId('vx-row')).toHaveCount(1);
    await expect(page.getByTestId('vx-row')).toContainText('alpha');
    await expect(page.getByTestId('vx-count')).toContainText('1 of');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('vx-matrix-layout')).toBeVisible();
    await expect(page.getByTestId('vx-matrix-total')).toHaveText('3');

    // A drill is one step: one ⌘Z takes back both the filter and the layout.
    await page.getByRole('button', { name: /^Drill in: app checkout × tier web/ }).click();
    await expect(page.getByTestId('vx-table')).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('vx-matrix-layout')).toBeVisible();
    await expect(page.getByTestId('vx-matrix-total')).toHaveText('3');
  });

  test('the drill toast undoes on the tab that drilled, even from another tab', async ({ page }) => {
    await page.getByTestId('vx-layout-matrix').click();
    await pickAxis(page, 'rows', 'app');
    await pickAxis(page, 'cols', 'tier');
    await page.getByRole('button', { name: /^Drill in: app checkout × tier web/ }).click();
    await expect(page.getByTestId('vx-table')).toBeVisible();

    await tabNamed(page, 'All units').click();
    await expect(page.locator('[data-testid="vx-tab"][data-active="true"]')).toContainText('All units');
    const allUnitsCount = await page.getByTestId('vx-count').innerText();
    await page.getByRole('button', { name: 'Undo' }).click();

    // "All units" is untouched: still the table, the same rows, no temporary tab made from it.
    await expect(page.locator('[data-testid="vx-tab"][data-active="true"]')).toContainText('All units');
    await expect(page.getByTestId('vx-table')).toBeVisible();
    await expect(page.getByTestId('vx-count')).toHaveText(allUnitsCount);

    // The tab that drilled is back on its matrix, with every row.
    await tabNamed(page, name).click();
    await expect(page.getByTestId('vx-matrix-layout')).toBeVisible();
    await expect(page.getByTestId('vx-matrix-total')).toHaveText('3');
  });

  test('Total sorts rows, then reverses, then goes back; the sort is one step, saved, and kept on reload', async ({ page }) => {
    await page.getByTestId('vx-layout-matrix').click();
    await pickAxis(page, 'rows', 'tier');
    await pickAxis(page, 'cols', 'app');
    const rowOrder = () => page.getByTestId('vx-matrix-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')));
    // api has beta and gamma (2), web has alpha (1).
    await expect.poll(rowOrder).toEqual(['api', 'web']);

    const total = page.getByTestId('vx-matrix-rows-total-sort');
    const th = page.locator('th', { has: total });
    await total.click();
    await expect(th).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(rowOrder).toEqual(['api', 'web']);
    await total.click();
    await expect(th).toHaveAttribute('aria-sort', 'ascending');
    await expect.poll(rowOrder).toEqual(['web', 'api']);
    await total.click();
    await expect(th).toHaveAttribute('aria-sort', 'none');
    await expect.poll(rowOrder).toEqual(['api', 'web']);

    // Columns sort on their own: by total from the Total row header.
    const colOrder = () => page.getByTestId('vx-matrix-col-total').evaluateAll((els) => els.map((e) => e.textContent));
    await page.getByTestId('vx-matrix-cols-total-sort').click();
    await expect.poll(colOrder).toEqual(['2', '1']);
    await page.getByTestId('vx-matrix-cols-total-sort').click();
    await expect.poll(colOrder).toEqual(['1', '2']);

    // One step: ⌘Z takes back exactly the last sort.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(colOrder).toEqual(['2', '1']);

    await page.getByTestId('vx-matrix-rows-sort').click();
    await page.getByRole('menuitem', { name: 'Name Z→A' }).click();
    await expect.poll(rowOrder).toEqual(['web', 'api']);
    await saveButton(page).click();
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true');

    await openExplorer(page, `/x/view-explorer?view=${viewId}`);
    await expect(page.getByTestId('vx-matrix-rows-sort')).toHaveText('Name Z→A');
    await expect(page.getByTestId('vx-matrix-cols-sort')).toHaveText('Total, most first');
    await expect.poll(rowOrder).toEqual(['web', 'api']);
  });

  test('the name of a row is not offered as an axis', async ({ page }) => {
    await page.getByTestId('vx-layout-matrix').click();
    await page.getByTestId('vx-matrix-rows').click();
    await expect(page.getByRole('menu', { name: 'Rows' }).getByRole('menuitem', { name: 'Unit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('menu', { name: 'Rows' }).getByRole('menuitem', { name: 'Space', exact: true })).toHaveCount(1);
  });

  test('a Spaces matrix sorts its rows by total', async ({ page }) => {
    await page.getByTestId('vx-layout-matrix').click();
    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    await expect(page.getByTestId('vx-matrix-layout')).toBeVisible();
    await page.getByTestId('vx-matrix-rows-total-sort').click();
    await expect(page.locator('th', { has: page.getByTestId('vx-matrix-rows-total-sort') })).toHaveAttribute('aria-sort', 'descending');
    // The empty group ("none") stays last whatever the order, so it is left out of the check.
    const rows = await page.getByTestId('vx-matrix-row').evaluateAll((els) =>
      els.map((e) => ({ value: e.getAttribute('data-value'), total: Number(e.querySelector('[data-testid="vx-matrix-row-total"]')?.textContent) })),
    );
    const named = rows.filter((r) => r.value !== EMPTY_GROUP_VALUE).map((r) => r.total);
    expect(named).toEqual([...named].sort((a, b) => b - a));
  });

  test('Spaces get their own axes', async ({ page }) => {
    await page.getByTestId('vx-layout-matrix').click();
    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    // A Space's own name would make one column per Space: the default is two labels with few values.
    await expect(page.getByTestId('vx-matrix-rows')).toHaveText('team');
    await expect(page.getByTestId('vx-matrix-cols')).toHaveText('env');
    await expect(page.getByTestId('vx-matrix-layout')).toBeVisible();
  });
});

test.describe('view explorer matrix over a mocked fleet', () => {
  test.use({ storageState: 'authentication.json' });

  /** Units in two Spaces; some on Target k8s-a, some on none. With `targets`, spread over that many Targets. */
  function fleet(count: number, slugAxis = false, targets = 1) {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => {
      const space = slugAxis ? `space-${i}` : i % 2 ? 'space-b' : 'space-a';
      const targeted = i % 3 !== 0;
      const target = `k8s-${String.fromCharCode(97 + (i % targets))}`;
      return {
        Unit: {
          UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          Slug: `unit-${String(i).padStart(3, '0')}`,
          SpaceID: `sid-${space}`,
          TargetID: targeted ? `tid-${target}` : '',
          ToolchainType: 'Kubernetes/YAML',
          Labels: {},
          HeadRevisionNum: 3,
          LastReleasedRevisionNum: targeted ? 3 : 0,
          UpstreamRevisionNum: 0,
          UpdatedAt: new Date(now - i * 60_000).toISOString(),
          CreatedAt: new Date(now - i * 60_000).toISOString(),
        },
        Space: { SpaceID: `sid-${space}`, Slug: space },
        Target: targeted ? { TargetID: `tid-${target}`, Slug: target } : undefined,
      };
    });
  }

  async function serve(page: Page, units: unknown[]) {
    const body = JSON.stringify(units);
    await page.route(/\/api\/unit(\?|$)/, (route: Route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body }) : route.continue(),
    );
  }

  test('the "none" Target column drills to the untargeted Units; a value no filter can say is not a button', async ({ page }) => {
    await serve(page, fleet(6));
    await openExplorer(page, '/x/view-explorer');
    await expect(page.getByTestId('vx-count')).toContainText('6 of 6');
    await page.getByTestId('vx-layout-matrix').click();
    await expect(page.getByTestId('vx-matrix-rows')).toHaveText('Space');
    await expect(page.getByTestId('vx-matrix-cols')).toHaveText('Target');

    // space-a holds units 0, 2, 4; unit 0 has no Target.
    await page.getByRole('button', { name: /^Drill in: Space space-a × Target none, 1$/ }).click();
    await expect(page.getByTestId('vx-table')).toBeVisible();
    await expect(page.getByTestId('vx-count')).toContainText('1 of 6');
    await expect(page.getByTestId('vx-row')).toContainText('unit-000');

    // Unreleased changes "No" is not a filter a lens can write: shown, not offered.
    await page.getByTestId('vx-layout-matrix').click();
    await page.getByTestId('vx-matrix-rows').click();
    await page.getByRole('menuitem', { name: 'Unreleased changes', exact: true }).click();
    const blocked = page.locator('[data-testid="vx-matrix-cell"][data-drill="false"]');
    await expect(blocked.first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Drill in: Unreleased changes No/ })).toHaveCount(0);
  });

  test('a matrix with too many rows shows the first ones in its order, and says so', async ({ page }) => {
    await serve(page, fleet(260, true));
    await openExplorer(page, '/x/view-explorer');
    await expect(page.getByTestId('vx-count')).toContainText('260 of 260');
    await page.getByTestId('vx-layout-matrix').click();
    await expect(page.getByTestId('vx-matrix-clipped')).toContainText('the first 200 of 260 Space values');
    await expect(page.getByTestId('vx-matrix-row')).toHaveCount(200);
    // Sorted before the cap: Name Z→A shows the last Spaces first (names compare numbers as numbers).
    await page.getByTestId('vx-matrix-rows-sort').click();
    await page.getByRole('menuitem', { name: 'Name Z→A' }).click();
    await expect(page.getByTestId('vx-matrix-row').first()).toHaveAttribute('data-value', 'space-259');
  });

  test('rows sort by a status from the Sort menu or the legend; Total sorts by count', async ({ page }) => {
    // space-a: 4 Units, 1 unreleased; space-b: 3, all unreleased; space-c: 5, none unreleased.
    const now = Date.now();
    const plan: Array<[string, boolean]> = [
      ['space-a', true], ['space-a', false], ['space-a', false], ['space-a', false],
      ['space-b', true], ['space-b', true], ['space-b', true],
      ['space-c', false], ['space-c', false], ['space-c', false], ['space-c', false], ['space-c', false],
    ];
    await serve(
      page,
      plan.map(([space, unreleased], i) => ({
        Unit: {
          UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          Slug: `unit-${i}`,
          SpaceID: `sid-${space}`,
          TargetID: 'tid-a',
          ToolchainType: 'Kubernetes/YAML',
          Labels: {},
          HeadRevisionNum: 3,
          LastReleasedRevisionNum: unreleased ? 2 : 3,
          UpstreamRevisionNum: 0,
          UpdatedAt: new Date(now - i * 60_000).toISOString(),
          CreatedAt: new Date(now - i * 60_000).toISOString(),
        },
        Space: { SpaceID: `sid-${space}`, Slug: space },
        Target: { TargetID: 'tid-a', Slug: 'k8s-a' },
      })),
    );
    await openExplorer(page, '/x/view-explorer');
    await page.getByTestId('vx-layout-matrix').click();
    const rowOrder = () => page.getByTestId('vx-matrix-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')));
    await expect.poll(rowOrder).toEqual(['space-a', 'space-b', 'space-c']);

    await page.getByTestId('vx-matrix-rows-sort').click();
    // The statuses come in the legend's order, most urgent first.
    const options = await page.getByRole('menu', { name: 'Sort rows' }).getByRole('menuitem').allInnerTexts();
    expect(options.slice(4)).toEqual(['Most unreleased', 'Most released']);
    await page.getByRole('menuitem', { name: 'Most unreleased' }).click();
    await expect.poll(rowOrder).toEqual(['space-b', 'space-a', 'space-c']);
    // Each cell now counts that status, so the order can be read off the cells.
    const summary = (space: string) => page.locator(`[data-testid="vx-matrix-row"][data-value="${space}"] [data-testid="vx-matrix-cell"]`).first();
    await expect(summary('space-b')).toContainText('3 unreleased');
    await expect(summary('space-c')).toContainText('0 unreleased');
    await expect(page.getByTestId('vx-matrix-rows-sort')).toHaveText('Most unreleased');

    // The legend chip sorts the same way, and a second click goes back to names.
    const chip = page.getByTestId('vx-matrix-legend').getByRole('button', { name: 'Unreleased: sort rows, most first' });
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await chip.click();
    await expect.poll(rowOrder).toEqual(['space-a', 'space-b', 'space-c']);

    const total = page.getByTestId('vx-matrix-rows-total-sort');
    await total.click();
    await expect.poll(rowOrder).toEqual(['space-c', 'space-a', 'space-b']);
    await expect(page.locator('th', { has: total })).toHaveAttribute('aria-sort', 'descending');
  });

  test('seven Targets, none and Total fit at 1440 without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await serve(page, fleet(42, false, 7));
    await openExplorer(page, '/x/view-explorer');
    await page.getByTestId('vx-layout-matrix').click();
    await expect(page.getByTestId('vx-matrix-col-total')).toHaveCount(8);
    const matrix = page.getByTestId('vx-matrix');
    expect(await matrix.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.getByTestId('vx-matrix-total')).toBeInViewport();
  });

  test('a new axis or a swap starts the matrix at its top-left corner', async ({ page }) => {
    await serve(page, fleet(120, true));
    await openExplorer(page, '/x/view-explorer');
    await page.getByTestId('vx-layout-matrix').click();
    const matrix = page.getByTestId('vx-matrix');
    await matrix.evaluate((el) => el.scrollTo({ top: 600 }));
    await expect.poll(() => matrix.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.getByTestId('vx-matrix-swap').click();
    await expect.poll(() => page.getByTestId('vx-matrix').evaluate((el) => el.scrollTop)).toBe(0);
    await page.getByTestId('vx-matrix-swap').click();
    await page.getByTestId('vx-matrix').evaluate((el) => el.scrollTo({ top: 600 }));
    await pickAxis(page, 'cols', 'Toolchain');
    await expect.poll(() => page.getByTestId('vx-matrix').evaluate((el) => el.scrollTop)).toBe(0);
  });
});
