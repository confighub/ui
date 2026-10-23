// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page } from '@playwright/test';

import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import type { Lens, ViewDef } from '../src/pages/x/view-explorer/model/types';
import { encodeDraftParam } from '../src/pages/x/view-explorer/model/view-codec';
import { applyCpuThrottling } from './fixtures/slow-mode';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import {
  type ExplorerSeed,
  LONG_TASK_BUDGET_MS,
  openExplorer,
  reloadExplorer,
  seedExplorer,
} from './fixtures/view-explorer-seed';

/**
 * The lens column: adding filters as tokens, the read-back and its errors,
 * previews that never make a draft, show / hide / solo with their counts, the
 * lens editor, the Group and Sort sections, and the column's fold, width and
 * floating behaviour.
 */

/**
 * No closed layer is left on the page: on a busy page a closed MUI menu or
 * popover can keep its invisible root mounted, and that root takes every click.
 * Tooltips are left out (their poppers never take clicks).
 */
async function expectNoLayers(page: Page) {
  await expect(
    page.locator('.MuiPopover-root, .MuiDialog-root, .MuiMenu-root, .MuiModal-root'),
  ).toHaveCount(0, {
    timeout: 5000,
  });
  await expect(page.locator('.MuiPopper-root:not(.MuiTooltip-popper)')).toHaveCount(0, {
    timeout: 5000,
  });
}

const addFilter = (page: Page) => page.getByRole('combobox', { name: 'Add a filter' });
const lensRows = (page: Page) => page.getByTestId('vx-lens');
const lensRow = (page: Page, text: string) => lensRows(page).filter({ hasText: text });
const rows = (page: Page) => page.getByTestId('vx-row');
const activeTab = (page: Page) => page.locator('[data-testid="vx-tab"][data-active]');
const column = (page: Page) => page.getByTestId('vx-lens-column');

const fieldLens = (
  id: string,
  field: string,
  values: string[],
  op: 'is' | 'isNot' = 'is',
  enabled = true,
): Lens => ({
  id,
  enabled,
  kind: 'field',
  field,
  op,
  values,
});

/** A view over the seed's Space, with these lenses added after the Space lens. */
function draftOf(seed: ExplorerSeed, lenses: Lens[], patch: Partial<ViewDef> = {}): ViewDef {
  const columns = [
    { name: 'Slug' },
    { name: 'Space' },
    { name: 'Labels.app' },
    { name: 'Labels.tier' },
  ];
  return {
    ...defaultViewDef('Unit'),
    columns,
    sort: { column: 'Slug', dir: 'ASC' },
    lenses: [fieldLens('space', 'Space', [seed.spaceSlug]), ...lenses],
    ...patch,
  };
}

const draftUrl = (viewId: string, def: ViewDef) =>
  `/x/view-explorer?view=${viewId}&d=${encodeDraftParam(def)}`;
const uniqueName = (prefix: string) => `${prefix} ${RandomSlugGenerator.randomSlugName()}`;

test.describe('view explorer lens column', () => {
  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  let seed: ExplorerSeed;
  let problems: string[];
  /** Console messages a test expects (a request it makes the server refuse). */
  let expected: RegExp[];

  test.beforeEach(async ({ page }) => {
    problems = [];
    expected = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (expected.some((r) => r.test(m.text()))) return;
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text())))
        problems.push(`${m.type()}: ${m.text()}`);
    });
    seed = await seedExplorer(page);
    // Each test starts with the column at its defaults.
    await page.addInitScript(() => {
      // Once per test (a reload keeps the viewer's choice): sessionStorage survives the reload.
      if (window.sessionStorage.getItem('vx-column-reset')) return;
      window.sessionStorage.setItem('vx-column-reset', '1');
      for (const k of Object.keys(window.localStorage))
        if (k.includes(':column')) window.localStorage.removeItem(k);
    });
  });

  test.afterEach(async () => {
    await seed.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  async function openView(page: Page, lenses: Lens[] = [], patch: Partial<ViewDef> = {}) {
    const view = await seed.createView({ name: uniqueName('Lenses') });
    await openExplorer(page, draftUrl(view.viewId, draftOf(seed, lenses, patch)));
    await expect(lensRows(page).first()).toBeVisible();
    return view;
  }

  test('a token adds a lens; its count is what it removes', async ({ page }) => {
    await openView(page);
    await expect(rows(page)).toHaveCount(3);
    await addFilter(page).click();
    await addFilter(page).fill('app:checkout');
    await expect(page.getByTestId('vx-readback')).toContainText('app:checkout');
    await addFilter(page).press('Enter');
    await expect(lensRows(page)).toHaveCount(2);
    await expect(rows(page)).toHaveCount(2);
    await expect(lensRow(page, 'checkout').getByTestId('vx-lens-effect')).toContainText('−1');
    // On hover the remove button shows, and the numbers stay in sight.
    await lensRow(page, 'checkout').hover();
    await expect(lensRow(page, 'checkout').getByTestId('vx-lens-remove')).toBeVisible();
    await expect(lensRow(page, 'checkout').getByText('−1')).toBeVisible();
    await expect(page.getByTestId('vx-filter-count')).toContainText('2 of');
    await expect(addFilter(page)).toHaveValue('');
  });

  test('a key prefix expands, and a bare word becomes a name match', async ({ page }) => {
    await openView(page);
    await addFilter(page).click();
    await addFilter(page).pressSequentially('tier:ap ');
    await expect(page.getByTestId('vx-readback')).toContainText('tier:api');
    await addFilter(page).press('Enter');
    await expect(rows(page)).toHaveCount(2);

    await addFilter(page).fill('gam');
    await addFilter(page).press('Escape');
    await addFilter(page).click();
    await addFilter(page).fill('gamma ');
    await addFilter(page).press('Enter');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('gamma');
  });

  test('an unknown token stays visible as an error and Enter adds nothing', async ({
    page,
  }) => {
    await openView(page);
    await addFilter(page).click();
    await addFilter(page).fill('bogus:thing app:checkout');
    await expect(page.getByTestId('vx-readback-error')).toContainText('bogus:thing');
    await expect(page.getByTestId('vx-readback-blocked')).toContainText(
      'Remove it to add the rest',
    );
    await addFilter(page).press('Enter');
    await expect(lensRows(page)).toHaveCount(1);
    await expect(addFilter(page)).toHaveValue('bogus:thing app:checkout');
    // The understood word is still previewed; leaving the box removes the preview and adds nothing.
    await addFilter(page).press('Escape');
    await expect(lensRows(page)).toHaveCount(1);
    await expect(rows(page)).toHaveCount(3);
  });

  test('a previewed suggestion filters the rows but never makes a draft', async ({ page }) => {
    const view = await seed.createView({
      name: uniqueName('Preview'),
      where: `Space.Slug = '${seed.spaceSlug}'`,
    });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(rows(page)).toHaveCount(3);
    await addFilter(page).click();
    await addFilter(page).pressSequentially('app:pay');
    await expect(page.getByTestId('vx-lens-preview')).toHaveCount(1);
    await expect(rows(page)).toHaveCount(1);
    await expect(activeTab(page)).not.toHaveAttribute('data-dirty', 'true');
    await addFilter(page).press('Escape');
    await expect(page.getByTestId('vx-lens-preview')).toHaveCount(0);
    await expectNoLayers(page);
    await expect(rows(page)).toHaveCount(3);
    await expect(activeTab(page)).not.toHaveAttribute('data-dirty', 'true');
  });

  test('hide shows "would −N"; ⌥-click shows only one lens, and again restores', async ({
    page,
  }) => {
    await openView(page, [
      fieldLens('app', 'Labels.app', ['checkout']),
      fieldLens('tier', 'Labels.tier', ['api']),
    ]);
    await expect(rows(page)).toHaveCount(1);

    const app = lensRow(page, 'checkout');
    await app.getByTestId('vx-lens-eye').click();
    await expect(app).toHaveAttribute('data-enabled', 'false');
    await expect(rows(page)).toHaveCount(2);
    await expect(app.getByTestId('vx-lens-effect')).toContainText('off');
    await expect(app.getByTestId('vx-lens-effect')).toContainText('would −1');
    await app.getByTestId('vx-lens-eye').click();
    await expect(rows(page)).toHaveCount(1);

    const tier = lensRow(page, 'tier');
    await tier.getByTestId('vx-lens-eye').click({ modifiers: ['Alt'] });
    await expect(lensRows(page).locator('[data-enabled="true"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="vx-lens"][data-enabled="true"]')).toHaveCount(1);
    await expect(tier).toHaveAttribute('data-enabled', 'true');
    await tier.getByTestId('vx-lens-eye').click({ modifiers: ['Alt'] });
    await expect(page.locator('[data-testid="vx-lens"][data-enabled="true"]')).toHaveCount(3);
    await expect(rows(page)).toHaveCount(1);
  });

  test('Custom WHERE lenses are counted one by one; field lenses never ask the server', async ({
    page,
  }) => {
    const custom = (id: string, where: string): Lens => ({
      id,
      enabled: true,
      kind: 'custom',
      where,
    });
    await openView(page, [
      custom('c1', "Slug LIKE 'a%'"),
      custom('c2', "Slug != 'gamma'"),
      fieldLens('app', 'Labels.app', ['checkout']),
    ]);
    await expect(rows(page)).toHaveCount(1);
    // c1 alone removes beta; c2 removes nothing the others keep.
    await expect(lensRow(page, "LIKE 'a%'").getByTestId('vx-lens-effect')).toContainText('−1');
    await expect(lensRow(page, "!= 'gamma'").getByTestId('vx-lens-effect')).toContainText('0');

    const asked: string[] = [];
    page.on('request', (r) => {
      if (/\/api\/(unit|space|resource)\b/.test(r.url()) && r.url().includes('where='))
        asked.push(r.url());
    });
    await lensRow(page, 'checkout').getByTestId('vx-lens-eye').click();
    await expect(rows(page)).toHaveCount(1);
    await lensRow(page, 'checkout').getByTestId('vx-lens-eye').click();
    await lensRow(page, "!= 'gamma'").getByTestId('vx-lens-eye').click();
    await expect(rows(page)).toHaveCount(1);
    expect(asked, 'hiding and showing lenses asks the server nothing').toEqual([]);
  });

  test('the lens editor: several values make IN, and each click applies', async ({ page }) => {
    await openView(page, [fieldLens('app', 'Labels.app', ['checkout'])]);
    await expect(rows(page)).toHaveCount(2);
    await lensRow(page, 'checkout').getByTestId('vx-lens-open').click();
    const pop = page.getByTestId('vx-lens-popover');
    await expect(pop).toBeVisible();
    await pop.getByRole('checkbox', { name: 'payments', exact: true }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(pop.getByTestId('vx-lens-where')).toContainText('Labels.app IN (');
    await expect(lensRow(page, 'checkout')).toContainText('+1');
    // The field menu inside the editor closes without leaving its layer behind.
    await pop.getByRole('combobox').click();
    await page.getByRole('option', { name: /tier/ }).click();
    await expect(pop.getByTestId('vx-lens-where')).toContainText('tier');
    await expect(page.locator('.MuiMenu-root')).toHaveCount(0, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await expectNoLayers(page);
  });

  test('a status lens takes one status, and says so', async ({ page }) => {
    await openView(page);
    await addFilter(page).click();
    await addFilter(page).fill('is:untargeted ');
    await addFilter(page).press('Enter');
    await expect(rows(page)).toHaveCount(3);
    await lensRow(page, 'Status').getByTestId('vx-lens-open').click();
    await expect(page.getByTestId('vx-lens-popover')).toContainText('One status per filter');
  });

  test('group levels: add, reorder, remove; sort', async ({ page }) => {
    await openView(page);
    const group = page.getByTestId('vx-group-section');
    await page.getByTestId('vx-group-add').click();
    await page
      .getByRole('menuitem', { name: 'Toolchain' })
      .or(page.getByText('Toolchain', { exact: true }))
      .first()
      .click();
    await expect(group.getByTestId('vx-group-level')).toHaveCount(1);
    await expect(group.getByTestId('vx-group-level').first()).toContainText('1 group');

    await page.getByTestId('vx-group-add').click();
    await page
      .getByRole('menuitem', { name: 'Space' })
      .or(page.getByText('Space', { exact: true }).last())
      .first()
      .click();
    await expect(group.getByTestId('vx-group-level')).toHaveCount(2);
    await expect(group.getByTestId('vx-group-level').nth(0)).toHaveAttribute(
      'data-field',
      'ToolchainType',
    );

    // Drag the second level above the first.
    const handle = group.getByRole('button', { name: 'Move Space' });
    const target = group.getByTestId('vx-group-level').nth(0);
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error('no boxes');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 8, { steps: 4 });
    await page.mouse.move(to.x + 20, to.y + 4, { steps: 8 });
    await page.mouse.up();
    await expect(group.getByTestId('vx-group-level').nth(0)).toHaveAttribute(
      'data-field',
      'Space',
    );

    await group.getByRole('button', { name: 'Stop grouping by Space' }).click();
    await expect(group.getByTestId('vx-group-level')).toHaveCount(1);

    await page.getByTestId('vx-sort-button').click();
    await page.getByRole('menuitem', { name: 'Z to A' }).click();
    await expect(page.getByTestId('vx-sort-button')).toContainText('Unit Z to A');
    await expect(rows(page).first()).toContainText('gamma');
    // The field picker and the sort menu leave nothing behind that could take clicks.
    await expectNoLayers(page);
    await page.getByTestId('vx-sort-button').click();
    await expect(page.getByRole('menuitem', { name: 'A to Z' })).toBeVisible();
  });

  test('a WHERE the server refuses shows no rows and says why, never every row', async ({
    page,
  }) => {
    // The browser logs the refused request as a failed resource load.
    expected = [/status of 400/];
    await openView(page, [{ id: 'bad', enabled: true, kind: 'custom', where: 'Bogus = 1' }]);
    const bad = lensRow(page, 'Bogus');
    await expect(bad.getByTestId('vx-lens-effect')).toContainText('refused');
    await expect(page.getByTestId('vx-server-refused')).toContainText(
      'Server refused this filter · showing 0 rows',
    );
    await expect(rows(page)).toHaveCount(0);
    await bad.getByTestId('vx-lens-eye').click();
    await expect(rows(page)).toHaveCount(3);
  });

  test('"Filter on <column>…" opens a new lens on that field, ready for values', async ({
    page,
  }) => {
    await openView(page);
    await page.getByRole('button', { name: 'app column menu' }).click();
    await page.getByRole('menuitem', { name: /Filter on app/ }).click();
    const pop = page.getByTestId('vx-lens-popover');
    await expect(pop).toBeVisible();
    await expect(lensRows(page)).toHaveCount(2);
    await expect(lensRows(page).last().getByTestId('vx-lens-effect')).toContainText(
      'not applied',
    );
    await pop.getByRole('checkbox', { name: 'checkout', exact: true }).click();
    await expect(rows(page)).toHaveCount(2);
  });

  test('text mode takes the filter section at 360 px; lenses bring the width back', async ({
    page,
  }) => {
    await openView(page);
    await expect.poll(async () => (await column(page).boundingBox())?.width).toBe(260);
    await page.getByTestId('vx-mode-text').click();
    await expect.poll(async () => (await column(page).boundingBox())?.width).toBe(360);
    await expect(page.getByTestId('vx-filters')).toHaveCount(0);
    await expect(page.getByTestId('vx-group-section')).toBeVisible();
    await expect(page.getByTestId('vx-sort-section')).toBeVisible();
    await page.getByTestId('vx-mode-lenses').click();
    await expect.poll(async () => (await column(page).boundingBox())?.width).toBe(260);
    await expect(page.getByTestId('vx-filters')).toBeVisible();
  });

  test('each tab keeps its own half-typed filter; a new tab starts empty', async ({
    page,
  }) => {
    const view = await openView(page);
    await addFilter(page).click();
    await addFilter(page).pressSequentially('space:x');
    await addFilter(page).press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('n');
    await expect(addFilter(page)).toHaveValue('');
    await page.keyboard.type('abc');
    await expect(addFilter(page)).toHaveValue('abc');
    await addFilter(page).press('Escape');
    // Back on the first tab, its half-typed text is still there.
    await page.getByTestId('vx-tab').filter({ hasText: view.name }).click();
    await expect(addFilter(page)).toHaveValue('space:x');
    // A trip to text mode and back keeps it too.
    await page.getByTestId('vx-mode-text').click();
    await expect(addFilter(page)).toHaveCount(0);
    await page.getByTestId('vx-mode-lenses').click();
    await expect(addFilter(page)).toHaveValue('space:x');
  });

  test('a Custom WHERE the client cannot read is still sent: the rows are the server rows', async ({
    page,
  }) => {
    // Two conditions in one Custom WHERE lens (as a whole saved Filter loads
    // when it cannot be split): the client does not evaluate it, the server does.
    await openView(page, [
      {
        id: 'whole',
        enabled: true,
        kind: 'custom',
        where: `Space.Slug = '${seed.spaceSlug}' AND Slug != 'gamma'`,
      },
    ]);
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByTestId('vx-filter-count')).toContainText(/^2 of/);
    await expect(lensRow(page, 'gamma').getByTestId('vx-lens-effect')).toContainText('−1');
    await expect(page.getByTestId('vx-server-loading')).toHaveCount(0);
  });

  test('a refused config data filter empties the rows and says so', async ({ page }) => {
    expected = [/status of 400/];
    await openView(page, [], { whereData: 'spec.replicas >>> 2' });
    await expect(page.getByTestId('vx-server-refused')).toContainText('config data filter');
    await expect(page.getByTestId('vx-server-refused')).toContainText('showing 0 rows');
    await expect(rows(page)).toHaveCount(0);
  });

  test("another tab never shows this tab's server answer while its own is loading", async ({
    page,
  }) => {
    // Two saved views over the seed Space with different config data filters.
    const withData = async (name: string, whereData: string) => {
      const filter = await hubApi.post(`/api/space/${seed.spaceId}/filter`, {
        data: {
          Slug: `vx-spec-${RandomSlugGenerator.randomSlugName()}-filter`,
          From: 'Unit',
          Where: `Space.Slug = '${seed.spaceSlug}'`,
          WhereData: whereData,
        },
      });
      expect(filter.ok(), await filter.text()).toBeTruthy();
      return seed.createView({ name, filterId: (await filter.json()).FilterID as string });
    };
    const a = await withData(uniqueName('Data A'), 'spec.replicas > 2');
    const bName = uniqueName('Data B');
    await withData(bName, 'spec.replicas > 3');

    await openExplorer(page, `/x/view-explorer?view=${a.viewId}`);
    await expect(rows(page)).toHaveCount(2);

    // B's answer comes late.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/unit?**', async (route) => {
      if (
        new URL(route.request().url()).searchParams.get('where_data') === 'spec.replicas > 3'
      )
        await held;
      await route.continue();
    });
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+p`);
    await page.getByTestId('vx-switcher-input').fill(bName.split(' ').slice(1).join(' '));
    await page.getByTestId('vx-switcher-input').press('Enter');
    await expect(activeTab(page)).toContainText(bName);
    await expect(page.getByTestId('vx-server-loading')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    release();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId('vx-server-loading')).toHaveCount(0);
  });

  test('the add box is a combobox: active option, listbox, options out of the Tab order', async ({
    page,
  }) => {
    await openView(page, [{ id: 's', enabled: true, kind: 'status', status: 'untargeted' }]);
    await addFilter(page).click();
    await addFilter(page).pressSequentially('app:che');
    const listId = await addFilter(page).getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    const list = page.locator(`[id="${listId}"]`);
    await expect(list).toHaveAttribute('role', 'listbox');
    await expect(addFilter(page)).toHaveAttribute('aria-autocomplete', 'list');
    const active = await addFilter(page).getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    await expect(page.locator(`[id="${active}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(list.getByRole('option').first()).toHaveAttribute('tabindex', '-1');
    await addFilter(page).press('Escape');

    await lensRow(page, 'Status').getByTestId('vx-lens-open').click();
    const group = page.getByTestId('vx-lens-popover').getByRole('radiogroup');
    await expect(group.getByRole('radio')).not.toHaveCount(0);
    await expect(group.getByRole('radio', { name: 'Not targeted' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('fold, resize and the keyboard; the choice is kept after a reload', async ({
    page,
  }) => {
    await openView(page);
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('/');
    await expect(addFilter(page)).toBeFocused();
    await addFilter(page).press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 400 } });

    const handle = page.getByTestId('vx-column-resize');
    const box = await handle.boundingBox();
    if (!box) throw new Error('no resize handle');
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + 200, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(async () => (await column(page).boundingBox())?.width)
      .toBeGreaterThan(330);

    await page.getByTestId('vx-collapse').click();
    await expect(page.getByTestId('vx-lens-rail')).toBeVisible();
    await expect.poll(async () => (await column(page).boundingBox())?.width).toBeLessThan(40);
    await reloadExplorer(page);
    await expect(page.getByTestId('vx-lens-rail')).toBeVisible();

    await page.keyboard.press('\\');
    await expect(lensRows(page).first()).toBeVisible();
    await expect
      .poll(async () => (await column(page).boundingBox())?.width)
      .toBeGreaterThan(330);
    await handle.dblclick();
    await expect.poll(async () => (await column(page).boundingBox())?.width).toBe(260);
  });
});

test.describe('view explorer lens column below 1360 px', () => {
  test.use({ storageState: 'authentication.json', viewport: { width: 1280, height: 800 } });

  let seed: ExplorerSeed;
  let problems: string[];

  test.beforeEach(async ({ page }) => {
    problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text())))
        problems.push(`${m.type()}: ${m.text()}`);
    });
    seed = await seedExplorer(page);
    await page.addInitScript(() => {
      // Once per test (a reload keeps the viewer's choice): sessionStorage survives the reload.
      if (window.sessionStorage.getItem('vx-column-reset')) return;
      window.sessionStorage.setItem('vx-column-reset', '1');
      for (const k of Object.keys(window.localStorage))
        if (k.includes(':column')) window.localStorage.removeItem(k);
    });
  });

  test.afterEach(async () => {
    await seed.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('starts folded; opened it floats, and one click outside closes it and still acts', async ({
    page,
  }) => {
    const view = await seed.createView({ name: uniqueName('Narrow') });
    await openExplorer(
      page,
      draftUrl(view.viewId, draftOf(seed, [fieldLens('app', 'Labels.app', ['checkout'])])),
    );
    await expect(page.getByTestId('vx-lens-rail')).toBeVisible();
    await expect(page.getByTestId('vx-rail-dot')).toHaveCount(2);

    // A rail dot toggles its lens without opening the column.
    await expect(rows(page)).toHaveCount(2);
    await page.getByTestId('vx-rail-dot').nth(1).click();
    await expect(rows(page)).toHaveCount(3);
    await page.getByTestId('vx-rail-dot').nth(1).click();
    await expect(rows(page)).toHaveCount(2);

    await page.getByTestId('vx-rail-expand').click();
    await expect(page.getByTestId('vx-lens-panel')).toHaveAttribute('data-floating', 'true');
    await expect(lensRows(page)).toHaveCount(2);

    // One click on another tab: the column closes and the tab opens.
    const allUnits = page.getByTestId('vx-tab').filter({ hasText: 'All units' });
    await allUnits.click();
    await expect(page.getByTestId('vx-lens-panel')).toHaveCount(0);
    await expect(activeTab(page)).toContainText('All units');
  });

  test('closing the float with a click outside is kept after a reload', async ({ page }) => {
    await openExplorer(page, '/x/view-explorer');
    await expect(page.getByTestId('vx-lens-rail')).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('\\');
    await expect(page.getByTestId('vx-lens-panel')).toHaveAttribute('data-floating', 'true');
    await reloadExplorer(page);
    await expect(page.getByTestId('vx-lens-panel')).toHaveAttribute('data-floating', 'true');
    await page.getByTestId('vx-tab').first().click();
    await expect(page.getByTestId('vx-lens-panel')).toHaveCount(0);
    await reloadExplorer(page);
    await expect(page.getByTestId('vx-lens-rail')).toBeVisible();
    await expect(page.getByTestId('vx-lens-panel')).toHaveCount(0);
  });
});

test.describe('view explorer lens column with 5,000 Units', () => {
  /**
   * Open a page over a mocked universe of thousands of Units. The page itself
   * is fast (about 0.2 s after the 1.6 MB answer arrives); the generous wait is
   * for a busy runner, where several workers load the dev build and these
   * answers at once.
   */
  const LARGE_FIRST_LOAD_TIMEOUT = 45_000;
  async function openLarge(page: Page, path: string, expected: string) {
    await applyCpuThrottling(page);
    await page.goto(path);
    await expect(page.getByTestId('vx-count')).toContainText(expected, {
      timeout: LARGE_FIRST_LOAD_TIMEOUT,
    });
  }

  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  /** Fake Units for the unfiltered list the page counts over. */
  function fakeUnits(n: number) {
    const spaces = [
      'payments-prod',
      'payments-staging',
      'checkout-dev',
      'platform-infra',
      'identity-prod',
    ];
    const apps = ['api', 'worker', 'ledger', 'gateway', 'cart', 'web', 'auth', 'redis'];
    return Array.from({ length: n }, (_, i) => {
      const space = spaces[i % spaces.length];
      const head = 1 + (i % 7);
      return {
        Unit: {
          UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          Slug: `${apps[i % apps.length]}-${i}`,
          SpaceID: `space-${space}`,
          TargetID: i % 9 ? `target-${i % 4}` : '',
          ToolchainType: i % 5 ? 'Kubernetes/YAML' : 'OpenTofu/HCL',
          Labels: {
            app: apps[i % apps.length],
            tier: ['web', 'api', 'data'][i % 3],
            env: space.split('-')[1],
          },
          HeadRevisionNum: head,
          LastReleasedRevisionNum: i % 3 ? head : head - 1,
          UpstreamRevisionNum: 0,
          CreatedAt: '2026-10-01T00:00:00Z',
          UpdatedAt: `2026-10-${String(1 + (i % 20)).padStart(2, '0')}T00:00:00Z`,
        },
        Space: { SpaceID: `space-${space}`, Slug: space },
        Target: i % 9 ? { TargetID: `target-${i % 4}`, Slug: `k8s-${i % 4}` } : undefined,
      };
    });
  }

  test('typing in the add box stays responsive', async ({ page }) => {
    // A budget measures the machine as much as the page: under SLOW_MODE's artificial
    // CPU throttle it measures the throttle, so it is checked only without one (CI runs without).
    test.skip(!!process.env.SLOW_MODE, 'timing budgets are not meaningful under SLOW_MODE');
    const units = fakeUnits(5000);
    await page.route('**/api/unit?**', async (route) => {
      const select = new URL(route.request().url()).searchParams.get('select') ?? '';
      // Only the unfiltered list the page counts over; every other call goes through.
      if (select.startsWith('UnitID,Slug,')) await route.fulfill({ json: units });
      else await route.continue();
    });
    await openLarge(page, '/x/view-explorer', '5000 of 5000');
    await expect(page.getByTestId('vx-filter-count')).toContainText('5000 of 5000');
    await page.evaluate(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push(e.duration);
      }).observe({ type: 'longtask' });
    });

    await addFilter(page).click();
    await addFilter(page).pressSequentially('a', { delay: 60 });
    await expect(page.getByTestId('vx-suggestion').first()).toBeVisible();
    await addFilter(page).fill('');
    await addFilter(page).pressSequentially('space:', { delay: 60 });
    await expect(page.getByTestId('vx-suggestion').first()).toContainText('Space');
    await page.waitForTimeout(300);

    const longTasks = await page.evaluate(
      () => (window as unknown as { __longTasks: number[] }).__longTasks,
    );
    const worst = Math.max(0, ...longTasks);
    expect(
      worst,
      `long tasks: ${longTasks.map((d) => Math.round(d)).join(', ')} ms`,
    ).toBeLessThan(LONG_TASK_BUDGET_MS);
  });

  /** Serve `units` as the unfiltered list the page counts over; every other call goes through. */
  async function serveUniverse(page: Page, units: unknown[]) {
    await page.route('**/api/unit?**', async (route) => {
      const select = new URL(route.request().url()).searchParams.get('select') ?? '';
      if (select.startsWith('UnitID,Slug,')) await route.fulfill({ json: units });
      else await route.continue();
    });
  }

  /** A temporary view of every Unit with one lens on it. */
  const withLens = () =>
    `/x/view-explorer?view=new&d=${encodeDraftParam({
      ...defaultViewDef('Unit'),
      lenses: [fieldLens('app', 'Labels.app', ['api'])],
    })}`;

  test('over 5,000 Units the live counts are off: one note, "—" for numbers, suggestions without counts', async ({
    page,
  }) => {
    await serveUniverse(page, fakeUnits(5001));
    await openLarge(page, withLens(), 'of 5001');
    await expect(page.getByTestId('vx-counts-off')).toHaveCount(1);
    await expect(page.getByTestId('vx-counts-off')).toContainText(
      'Live counts off · over 5,000 units',
    );
    const effect = lensRow(page, 'api').getByTestId('vx-lens-effect');
    await expect(effect).toContainText('—');
    await expect(effect).not.toContainText('alone');
    // The "—" says why, on hover.
    await lensRow(page, 'api').getByTestId('vx-lens-effect-n').hover();
    await expect(page.getByRole('tooltip')).toContainText(
      'Counts are off for views over 5,000 units',
    );
    await page.mouse.move(700, 600);
    // The result is still counted.
    await expect(page.getByTestId('vx-filter-count')).toContainText(/^\d+ of 5001/);

    await page.evaluate(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push(e.duration);
      }).observe({ type: 'longtask' });
    });
    await addFilter(page).click();
    await addFilter(page).pressSequentially('space:pay', { delay: 60 });
    await expect(page.getByTestId('vx-suggestion').first()).toContainText('payments');
    await expect(page.getByTestId('vx-suggestion').filter({ hasText: '→' })).toHaveCount(0);
    await expect(page.getByTestId('vx-suggestions')).toContainText('Suggestions');
    await expect(page.getByTestId('vx-suggestions')).not.toContainText('live counts');
    // The preview of the rows still works: one pass.
    await expect(page.getByTestId('vx-lens-preview')).toHaveCount(1);
    // "N → M of T" stays on one line: the "all apply together" note steps aside while previewing.
    await expect(page.getByTestId('vx-filters')).not.toContainText('all apply together');
    const countBox = await page.getByTestId('vx-filter-count').boundingBox();
    expect(countBox?.height ?? 99).toBeLessThan(24);
    await addFilter(page).press('Escape');

    await lensRow(page, 'api').getByTestId('vx-lens-open').click();
    const pop = page.getByTestId('vx-lens-popover');
    await expect(pop.getByTestId('vx-lens-value').first()).toContainText('—');
    await page.keyboard.press('Escape');

    if (!process.env.SLOW_MODE) {
      const longTasks = await page.evaluate(
        () => (window as unknown as { __longTasks: number[] }).__longTasks,
      );
      expect(
        Math.max(0, ...longTasks),
        `long tasks: ${longTasks.map((d) => Math.round(d)).join(', ')} ms`,
      ).toBeLessThan(LONG_TASK_BUDGET_MS);
    }
  });

  test('at 5,000 Units the live counts are on as usual', async ({ page }) => {
    await serveUniverse(page, fakeUnits(5000));
    await openLarge(page, withLens(), 'of 5000');
    await expect(page.getByTestId('vx-counts-off')).toHaveCount(0);
    await expect(lensRow(page, 'api').getByTestId('vx-lens-effect')).toContainText('alone');
    await addFilter(page).click();
    await addFilter(page).pressSequentially('space:pay');
    await expect(
      page.getByTestId('vx-suggestion').filter({ hasText: '→' }).first(),
    ).toBeVisible();
  });
});
