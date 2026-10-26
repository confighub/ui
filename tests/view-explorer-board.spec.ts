// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page, Route } from '@playwright/test';

import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import type { Lens, ViewDef } from '../src/pages/x/view-explorer/model/types';
import { encodeDraftParam } from '../src/pages/x/view-explorer/model/view-codec';
import { expect, hubApi, test } from './fixtures/test';
import { type ExplorerSeed, readView, seedExplorer, openExplorer, expectOverlaysGone } from './fixtures/view-explorer-seed';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The View Explorer's Board layout: lanes from the first group
 * level (and a picker that writes it), sub-headings from the second, empty
 * lanes on request, cards that open the drawer, and the layout saved with the
 * view. The seed is three Units in a Space of their own: alpha and beta are
 * app checkout, gamma is app payments; none has a Target.
 */

const lanes = (page: Page) => page.getByTestId('vx-lane');
const lane = (page: Page, value: string) => page.locator(`[data-testid="vx-lane"][data-lane="${value}"]`);
const cards = (page: Page) => page.getByTestId('vx-board-card');

/**
 * Answer the page's Unit lists with `count` copies of the first Unit, each with
 * its own slug and `labels(i)`: a large set without seeding thousands of Units.
 */
async function manyUnits(page: Page, count: number, labels: (i: number) => Record<string, string>, spaceId?: string) {
  await page.route(
    (url) => url.pathname.endsWith('/api/unit'),
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      const items = (await response.json()) as Array<{ Unit: Record<string, unknown> }>;
      if (!Array.isArray(items) || items.length === 0) return route.fulfill({ response });
      // A Unit of the seed Space when asked for, so a view filtered to that Space shows the copies.
      const template = items.find((it) => !spaceId || it.Unit.SpaceID === spaceId) ?? items[0];
      const copies = Array.from({ length: count }, (_, i) => ({
        ...template,
        Unit: { ...template.Unit, UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, Slug: `many-${i}`, Labels: labels(i) },
      }));
      return route.fulfill({ response, json: copies });
    },
  );
}

const spaceLens = (spaceSlug: string): Lens => ({ id: 'l1', enabled: true, kind: 'field', field: 'Space', op: 'is', values: [spaceSlug] });

/** A draft of a seeded view: its columns as saved, with these lenses and settings. */
function draftOf(lenses: Lens[], patch: Partial<ViewDef> = {}): ViewDef {
  const columns = [{ name: 'Slug' }, { name: 'Space' }, { name: 'Labels.app' }];
  return { ...defaultViewDef('Unit'), columns, sort: null, lenses, ...patch };
}

const draftUrl = (viewId: string, def: ViewDef) => `/x/view-explorer?view=${viewId}&d=${encodeDraftParam(def)}`;
const uniqueName = (prefix: string) => `${prefix} ${RandomSlugGenerator.randomSlugName()}`;

test.describe('view explorer board', () => {
  // Wide enough for the filter column to start open, so the Group section is on screen.
  test.use({ storageState: 'authentication.json', viewport: { width: 1440, height: 900 } });

  let seed: ExplorerSeed;
  let problems: string[];

  test.beforeEach(async ({ page }) => {
    problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    seed = await seedExplorer(page);
  });

  test.afterEach(async () => {
    await seed.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('B shows the board with default Status lanes; picking lanes writes the group, and saving keeps the layout', async ({ page }) => {
    const view = await seed.createView({ name: uniqueName('Board') });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(page.getByTestId('vx-row').first()).toBeVisible();

    await page.keyboard.press('b');
    await expect(page.getByTestId('vx-board')).toBeVisible();
    await expect(page.getByTestId('vx-lane-picker')).toHaveText('Status');
    await expect(page.getByTestId('vx-lane-caption')).toContainText('Default');
    await expect(lanes(page)).toHaveCount(1);
    await expect(lane(page, 'Not targeted').getByTestId('vx-board-card')).toHaveCount(3);

    // The picker writes the first group level; the Group section shows it.
    await page.getByTestId('vx-lane-picker').click();
    await page.getByRole('menuitem', { name: 'Label app' }).click();
    await expectOverlaysGone(page);
    await expect(page.getByTestId('vx-lane-picker')).toHaveText('app');
    await expect(page.getByTestId('vx-group-level').first()).toContainText('app');
    await expect(lane(page, 'checkout').getByTestId('vx-board-card')).toHaveCount(2);
    await expect(lane(page, 'payments').getByTestId('vx-board-card')).toHaveCount(1);

    // Saving keeps the board.
    await page.getByTestId('vx-save-actions').getByRole('button', { name: 'Save', exact: true }).click();
    // The toast; the Functions panel has a "Saved Functions" heading when the organization has saved invocations.
    await expect(page.getByText(/^Saved “/)).toBeVisible();
    const saved = await readView(view.spaceId, view.viewId);
    expect(saved.View.Annotations['ui.confighub.io/layout']).toBe('board');
    expect(saved.View.GroupBy).toBe('Labels.app');
  });

  test('a second group level becomes sub-headings, and empty lanes show on request', async ({ page }) => {
    const view = await seed.createView({ name: uniqueName('Lanes') });
    const appCheckout: Lens = { id: 'l2', enabled: true, kind: 'field', field: 'Labels.app', op: 'is', values: ['checkout'] };
    await openExplorer(
      page,
      draftUrl(view.viewId, draftOf([spaceLens(seed.spaceSlug), appCheckout], { layout: 'board', groupBy: ['Labels.app', 'Labels.tier'] })),
    );
    await expect(page.getByTestId('vx-lane-caption')).toHaveText('Then tier as sub-headings.');
    await expect(lanes(page)).toHaveCount(1);
    const checkout = lane(page, 'checkout');
    await expect(checkout.getByTestId('vx-lane-sub')).toHaveCount(2);
    await expect(checkout.getByTestId('vx-lane-sub').filter({ hasText: 'web' }).getByTestId('vx-board-card')).toHaveCount(1);

    // payments has no card in this view: its lane is behind the toggle.
    await expect(page.locator('[data-testid="vx-lane-empty"][data-lane="payments"]')).toHaveCount(0);
    // Empty lanes come from every app the organization has; the lane with cards always stays.
    await page.getByTestId('vx-empty-lanes').click();
    await expect(page.getByTestId('vx-lane-empty').first()).toContainText('0');
    await expect(checkout.getByTestId('vx-board-card')).toHaveCount(2);
    await page.getByTestId('vx-empty-lanes').click();
    await expect(page.locator('[data-testid="vx-lane-empty"]')).toHaveCount(0);
  });

  test('a card opens the drawer, and a value on it opens its popover', async ({ page }) => {
    const view = await seed.createView({ name: uniqueName('Cards') });
    await openExplorer(page, draftUrl(view.viewId, draftOf([spaceLens(seed.spaceSlug)], { layout: 'board' })));
    const alpha = cards(page).filter({ has: page.getByText('alpha', { exact: true }) });
    await expect(alpha).toHaveCount(1);
    await expect(alpha).toContainText('Not targeted');
    await expect(alpha).toContainText(seed.spaceSlug);

    await alpha.locator('[data-column="Space"] [role="button"]').click();
    await expect(page.getByRole('menuitem', { name: /Only this/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await alpha.click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('vx-row-panel').getByRole('tab', { name: 'Summary' })).toBeVisible();
  });

  test('a view saved with the retired List layout, and a link to one, open as the table', async ({ page }) => {
    const view = await seed.createView({ name: uniqueName('Old list'), annotations: { 'ui.confighub.io/layout': 'list' }, groupBy: 'Labels.app' });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(page.getByTestId('vx-row')).toHaveCount(3);
    await expect(page.getByTestId('vx-group-row')).toHaveCount(2);
    await expect(page.getByTestId('vx-layout-table')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid="vx-tab"][data-active]')).not.toHaveAttribute('data-dirty', 'true');

    const link = draftUrl(view.viewId, { ...draftOf([spaceLens(seed.spaceSlug)]), layout: 'list' } as unknown as ViewDef);
    await openExplorer(page, link);
    await expect(page.getByTestId('vx-row')).toHaveCount(3);
    await expect(page.getByTestId('vx-layout-table')).toHaveAttribute('aria-pressed', 'true');
    // L no longer picks a layout.
    await page.keyboard.press('l');
    await expect(page.getByTestId('vx-table')).toBeVisible();
  });

  test('a dragged header shows a ghost that follows the pointer and says "Group by" over Group', async ({ page }) => {
    const view = await seed.createView({ name: uniqueName('Ghost') });
    await openExplorer(page, draftUrl(view.viewId, draftOf([spaceLens(seed.spaceSlug)])));
    await expect(page.getByTestId('vx-row').first()).toBeVisible();

    const from = await page.locator('[data-testid="vx-header"][data-column="Labels.app"]').boundingBox();
    const to = await page.getByTestId('vx-group-drop').boundingBox();
    if (!from || !to) throw new Error('no boxes');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 40, { steps: 4 });
    const ghost = page.getByTestId('vx-drag-ghost');
    await expect(ghost).toHaveText('app');
    await expect(ghost).toHaveAttribute('data-mode', 'move');

    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 });
    await expect(ghost).toHaveText('Group by app');
    await expect(ghost).toHaveAttribute('data-mode', 'group');
    // Right of the pointer, and under the Group section: its "Drop to group by" text stays in sight.
    const ghostBox = await ghost.boundingBox();
    const zoneBox = await page.getByTestId('vx-group-drop').boundingBox();
    if (!ghostBox || !zoneBox) throw new Error('no boxes');
    expect(ghostBox.x).toBeGreaterThan(to.x + to.width / 2);
    expect(ghostBox.y).toBeGreaterThanOrEqual(zoneBox.y + zoneBox.height);
    await page.screenshot({ path: test.info().outputPath('ghost-over-group.png') });
    await page.mouse.up();

    await expect(ghost).toHaveCount(0);
    await expect(page.getByTestId('vx-group-level')).toHaveCount(1);

    // Over Group again with the same field, the ghost says the drop changes nothing.
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 40, { steps: 4 });
    const zone = await page.getByTestId('vx-group-drop').boundingBox();
    if (!zone) throw new Error('no zone');
    await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, { steps: 16 });
    await expect(ghost).toHaveText('Already grouped by app');
    await page.mouse.up();
    await expect(page.getByTestId('vx-group-level')).toHaveCount(1);
  });

  test('a click on the drop zone, or Enter or Space on it, opens the group picker', async ({ page }) => {
    const view = await seed.createView({ name: uniqueName('Zone click') });
    await openExplorer(page, draftUrl(view.viewId, draftOf([spaceLens(seed.spaceSlug)])));
    await expect(page.getByTestId('vx-row').first()).toBeVisible();
    const zone = page.getByTestId('vx-group-drop');
    const picked = page.getByRole('menuitem', { name: 'Toolchain', exact: true });

    await page.getByRole('button', { name: 'Group by a field' }).click();
    await expect(picked).toBeVisible();
    await picked.click();
    await expect(page.getByTestId('vx-group-level')).toHaveCount(1);
    await expect(picked).toHaveCount(0);

    await expect(zone).toHaveAccessibleName('Add a group level');
    await zone.focus();
    await page.keyboard.press('Enter');
    const space = page.getByRole('menuitem', { name: 'Space', exact: true });
    await expect(space).toBeVisible();
    await space.click();
    await expect(page.getByTestId('vx-group-level')).toHaveCount(2);
    await expect(space).toHaveCount(0);

    await zone.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('menuitem', { name: 'Target', exact: true })).toBeVisible();
  });

  test('a header dropped on the zone adds a level without opening the picker, and no other drag or click opens it', async ({ page }) => {
    const view = await seed.createView({ name: uniqueName('Zone drop') });
    await openExplorer(page, draftUrl(view.viewId, draftOf([spaceLens(seed.spaceSlug)])));
    await expect(page.getByTestId('vx-row').first()).toBeVisible();
    const picker = page.getByRole('menuitem', { name: 'Toolchain', exact: true });
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 10, from.y + 40, { steps: 4 });
      await page.mouse.move(to.x, to.y, { steps: 16 });
      await page.mouse.up();
    };
    const middle = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

    const header = (await page.locator('[data-testid="vx-header"][data-column="Labels.app"]').boundingBox())!;
    await drag(middle(header), middle((await page.getByTestId('vx-group-drop').boundingBox())!));
    await expect(page.getByTestId('vx-group-level')).toHaveCount(1);
    await expect(page.getByTestId('vx-drag-ghost')).toHaveCount(0);
    await expect(picker).toHaveCount(0);

    // A press on a row released over the zone is no click on the zone.
    const row = (await page.getByTestId('vx-row').first().boundingBox())!;
    await drag({ x: row.x + row.width - 30, y: row.y + row.height / 2 }, middle((await page.getByTestId('vx-group-drop').boundingBox())!));
    await expect(picker).toHaveCount(0);

    // A group level's handle dragged onto the zone, and a click on the level, leave it closed too.
    const handle = page.getByRole('button', { name: 'Move app' });
    await drag(middle((await handle.boundingBox())!), middle((await page.getByTestId('vx-group-drop').boundingBox())!));
    await expect(picker).toHaveCount(0);
    await page.getByTestId('vx-group-level').first().click();
    await handle.click();
    await expect(picker).toHaveCount(0);
    await expect(page.getByTestId('vx-group-level')).toHaveCount(1);
  });

  test('over the rail at 1280, the ghost stays right of the pointer, inside the content', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const view = await seed.createView({ name: uniqueName('Rail ghost') });
    await openExplorer(page, draftUrl(view.viewId, draftOf([spaceLens(seed.spaceSlug)])));
    await expect(page.getByTestId('vx-row').first()).toBeVisible();
    const rail = await page.getByTestId('vx-lens-rail').boundingBox();
    const from = await page.locator('[data-testid="vx-header"][data-column="Labels.app"]').boundingBox();
    const to = await page.getByTestId('vx-rail-group').boundingBox();
    if (!rail || !from || !to) throw new Error('no boxes');

    // Grab the header in its middle, where the old ghost kept its offset and hung off the page.
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 - 10, from.y + from.height / 2 + 30, { steps: 4 });
    const pointer = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    await page.mouse.move(pointer.x, pointer.y, { steps: 16 });
    const ghost = page.getByTestId('vx-drag-ghost');
    await expect(ghost).toHaveText('Group by app');
    const box = await ghost.boundingBox();
    if (!box) throw new Error('no ghost');
    expect(box.x).toBeGreaterThan(pointer.x);
    expect(box.x).toBeGreaterThanOrEqual(rail.x + rail.width - 8);
    // A little below the pointer, so it hides nothing the pointer is on.
    expect(box.y + box.height / 2 - pointer.y).toBeGreaterThan(10);
    expect(box.y + box.height / 2 - pointer.y).toBeLessThan(26);
    await page.mouse.up();
    await expect(ghost).toHaveCount(0);
  });

  test('a board of Spaces takes its lanes from the env label when a Space has one', async ({ page }) => {
    const labelled = await hubApi.patch(`/api/space/${seed.spaceId}`, {
      data: { Labels: { env: 'qa' } },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(labelled.ok(), await labelled.text()).toBeTruthy();
    // One Unit left, for the card's "1 unit".
    for (const u of seed.units.slice(1)) {
      const gone = await hubApi.delete(`/api/space/${seed.spaceId}/unit/${u.id}`);
      expect(gone.ok(), await gone.text()).toBeTruthy();
    }
    // Switched to Spaces from All units, the view has no label column, so nothing else asks for labels.
    await openExplorer(page, '/x/view-explorer');
    await expect(page.getByTestId('vx-row').first()).toBeVisible();
    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    await page.getByTestId('vx-layout-board').click();
    await expect(page.getByTestId('vx-lane-picker')).toHaveText('env');
    const card = lane(page, 'qa').getByTestId('vx-board-card').filter({ hasText: seed.spaceSlug });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(/1 unit(?!s)/);
    await expect(card).not.toContainText('1 units');
  });

  test('a card is a group whose name opens it with Enter or Space; its values stay their own buttons', async ({ page }) => {
    const view = await seed.createView({ name: uniqueName('Card keys') });
    await openExplorer(page, draftUrl(view.viewId, draftOf([spaceLens(seed.spaceSlug)], { layout: 'board' })));
    const alpha = cards(page).filter({ has: page.getByText('alpha', { exact: true }) });
    await expect(page.getByRole('article', { name: 'alpha' })).toBeVisible();
    await expect(alpha).not.toHaveAttribute('role', 'button');
    await expect(page.getByTestId('vx-lanes').getByRole('button').getByRole('button')).toHaveCount(0);

    const open = alpha.getByTestId('vx-board-card-open');
    await open.focus();
    await page.keyboard.press('Space');
    const panel = page.getByTestId('vx-row-panel');
    await expect(panel).toContainText('alpha');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toContainText('alpha');
  });

  test('folded groups stay with their own tab', async ({ page }) => {
    const first = await seed.createView({ name: uniqueName('Fold A'), groupBy: 'Labels.app' });
    const second = await seed.createView({ name: uniqueName('Fold B'), groupBy: 'Labels.app' });
    await openExplorer(page, `/x/view-explorer?view=${first.viewId}`);
    await expect(page.getByTestId('vx-row')).toHaveCount(3);
    await page.getByTestId('vx-group-row').filter({ hasText: 'checkout' }).click();
    await expect(page.getByTestId('vx-row')).toHaveCount(1);

    // A fresh browser pins the newest views, so the second one has a tab already.
    await page.getByTestId('vx-tab').filter({ hasText: second.name }).click();
    await expect(page.locator('[data-testid="vx-tab"][data-active]')).toContainText(second.name);
    await expect(page.getByTestId('vx-row')).toHaveCount(3);
  });

  test('opened-up lanes stay with their own tab too', async ({ page }) => {
    await manyUnits(page, 300, (i) => ({ app: `app-${String(i).padStart(3, '0')}` }), seed.spaceId);
    const annotations = { 'ui.confighub.io/layout': 'board' };
    const first = await seed.createView({ name: uniqueName('Lanes A'), annotations, groupBy: 'Labels.app' });
    const second = await seed.createView({ name: uniqueName('Lanes B'), annotations, groupBy: 'Labels.app' });
    await openExplorer(page, `/x/view-explorer?view=${first.viewId}`);
    await expect(lanes(page)).toHaveCount(12);
    await page.getByTestId('vx-more-lanes').click();
    await expect(lanes(page)).toHaveCount(24);

    await page.getByTestId('vx-tab').filter({ hasText: second.name }).click();
    await expect(page.locator('[data-testid="vx-tab"][data-active]')).toContainText(second.name);
    await expect(lanes(page)).toHaveCount(12);
  });

  test('a field with many values: the picker offers only fields with few values, and lanes and sub-headings are capped', async ({ page }) => {
    await manyUnits(page, 300, (i) => ({ app: `app-${String(i).padStart(3, '0')}`, env: 'prod' }));
    const view = await seed.createView({ name: uniqueName('Many') });
    await openExplorer(page, draftUrl(view.viewId, draftOf([], { layout: 'board', groupBy: ['Labels.app'] })));
    // 300 rows on a throttled CPU take longer than the default wait to lay out.
    await expect(lanes(page)).toHaveCount(12, { timeout: 20_000 });
    await expect(page.getByTestId('vx-more-lanes')).toContainText('288 more lanes');
    await page.getByTestId('vx-more-lanes').click();
    await expect(lanes(page)).toHaveCount(24);

    // The picker leaves out row names, ids, numbers and times; the current lanes stay listed.
    await page.getByTestId('vx-lane-picker').click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Label app' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Label env' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Unit', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'Created' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: /Revision/ })).toHaveCount(0);

    await page.keyboard.press('Escape');

    // One lane with 300 sub-headings draws 12 of them at a time.
    await openExplorer(page, draftUrl(view.viewId, draftOf([], { layout: 'board', groupBy: ['Labels.env', 'Labels.app'] })));
    await expect(lanes(page)).toHaveCount(1);
    await expect(page.getByTestId('vx-lane-sub')).toHaveCount(12);
    await page.getByTestId('vx-lane-more-subs').click();
    await expect(page.getByTestId('vx-lane-sub')).toHaveCount(24);
  });
});
