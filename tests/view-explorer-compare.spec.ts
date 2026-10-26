// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { type ExplorerSeed, FIRST_LOAD_TIMEOUT, openExplorer, seedExplorer, viewsNamed } from './fixtures/view-explorer-seed';
import { applyCpuThrottling } from './fixtures/slow-mode';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * Compare mode in the View explorer: picked rows open side by side in the
 * Components grid, with slots A–E and a rail of the view's Units. The table
 * stays loaded behind, so Back and Esc return to the same scroll, folds,
 * selection and open row. The comparison is per tab and in the URL.
 *
 * Two seeded Spaces hold the same three slugs; the second Space's alpha runs
 * 6 replicas where the first runs 2.
 */

const deployment = (name: string, replicas: number) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
spec:
  replicas: ${replicas}
  template:
    spec:
      containers:
        - name: ${name}
          image: nginx:1.25
`;

const uuid = () => crypto.randomUUID();

const nextFrames = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

async function cleanUp(name: string) {
  for (const v of await viewsNamed(name)) {
    await hubApi.delete(`/api/space/${v.View.SpaceID}/view/${v.View.ViewID}`);
    if (v.View.FilterID) await hubApi.delete(`/api/space/${v.View.SpaceID}/filter/${v.View.FilterID}`);
  }
}

test.describe('view explorer compare mode', () => {
  test.use({ storageState: 'authentication.json' });

  let one: ExplorerSeed;
  let two: ExplorerSeed;
  let problems: string[];
  let names: string[];

  const idOf = (seed: ExplorerSeed, slug: string) => seed.units.find((u) => u.slug === slug)!.id;
  const row = (page: Page, seed: ExplorerSeed, slug: string) => page.locator(`[data-testid="vx-row"][data-row-id="${idOf(seed, slug)}"]`);
  const pick = (page: Page, seed: ExplorerSeed, slug: string) => row(page, seed, slug).getByTestId('vx-row-pick').click();
  const compare = (page: Page) => page.getByTestId('vx-compare');
  const slot = (page: Page, letter: string) => page.getByTestId(`unit-slot-${letter}`);
  const slotIds = (page: Page) =>
    page.locator('[data-testid^="unit-slot-"][data-unit-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.unitId));
  const urlIds = (page: Page) => (new URL(page.url()).searchParams.get('compare') ?? '').split(',').filter(Boolean);
  const railUnit = (page: Page, id: string) => page.locator(`[data-testid="vx-rail-unit"][data-unit-id="${id}"]`);
  const replicas = (page: Page) => page.locator('[data-testid="compare-leaf-row"][data-identity-path$="replicas"] [data-column]');
  const scrollTop = (page: Page) => page.getByTestId('vx-table').evaluate((el) => el.scrollTop);

  /** What the drag layer said: the slots' own live region, inside the page's (the table's headers have the other). */
  const announced = (page: Page, text: string) => page.locator('[id^="DndLiveRegion"]', { hasText: text });

  /**
   * Open a link that compares: the table behind is held as it was first drawn
   * (its count says 0 until compare mode ends), so the wait is for the slots.
   */
  const openComparing = async (page: Page, path: string, slots: number) => {
    await applyCpuThrottling(page);
    await page.goto(path);
    await expect(page.locator('[data-testid^="unit-slot-label-"]')).toHaveCount(slots, { timeout: FIRST_LOAD_TIMEOUT });
    await expect(page.getByTestId('vx-compare-loading')).toHaveCount(0);
  };

  /** A View over both seeded Spaces. */
  const view = async (options: { groupBy?: string } = {}) => {
    const name = `Compare ${RandomSlugGenerator.randomSlugName()}`;
    names.push(name);
    return (await one.createView({ name, where: `Space.Slug IN ('${one.spaceSlug}','${two.spaceSlug}')`, ...options })).viewId;
  };

  /** Open the view with alpha from both Spaces picked, and compare them. */
  const compareAlphas = async (page: Page, viewId: string) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '6 of');
    await pick(page, one, 'alpha');
    await pick(page, two, 'alpha');
    await page.getByTestId('vx-selection-compare').click();
    await expect(compare(page)).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    problems = [];
    names = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /^Warning:/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    one = await seedExplorer(page);
    two = await seedExplorer(page);
    await new ApiHelper(page).uploadUnitData({ spaceId: two.spaceId, unitId: idOf(two, 'alpha'), body: deployment('alpha', 6) });
  });

  test.afterEach(async () => {
    for (const name of names) await cleanUp(name);
    await one.remove();
    await two.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('two picked rows open side by side: the grid shows what differs, the URL holds it, a reload restores it', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await compareAlphas(page, viewId);

    await expect(page.getByTestId('vx-compare-title')).toHaveText('Compare 2 Units');
    await expect(page.getByTestId('vx-compare-crumb')).toHaveText('· alpha in 2 Spaces');
    // The toolbar is out of sight while comparing; the comparison has the focus.
    await expect(page.getByTestId('vx-toolbar')).toBeHidden();
    await expect(page.getByTestId('vx-results-layout')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('vx-compare-region')).toBeFocused();

    // Slots in table order: the first Space's alpha is A.
    const first = [one, two].sort((a, b) => a.spaceSlug.localeCompare(b.spaceSlug));
    const [a, b] = [idOf(first[0], 'alpha'), idOf(first[1], 'alpha')];
    await expect.poll(() => slotIds(page)).toEqual([a, b]);
    // A slot names the slug, then where it is and its revision; a Unit with no Target says nothing about one.
    await expect(page.getByTestId('unit-slot-label-a')).toHaveText('alpha');
    await expect(page.getByTestId('unit-slot-meta-a')).toHaveText(new RegExp(`^${first[0].spaceSlug} · rev \\d+$`));
    // Read-only, with the Unit wording; the columns are named by Space.
    await expect(replicas(page)).toHaveText(first[0] === one ? ['2', '6'] : ['6', '2']);
    await expect(page.getByTestId('compare-column-a')).toHaveText(new RegExp(first[0].spaceSlug));
    await expect(page.getByTestId('compare-staged-checkbox')).toHaveCount(0);
    await expect(page.getByTestId('vx-compare-mismatch')).toHaveCount(0);
    // The empty slot suggests the next Unit, and the rail marks the slots.
    await expect(page.getByTestId('unit-slot-suggestion')).toHaveText(/^Suggested: /);
    await expect(railUnit(page, a)).toHaveAttribute('data-slot', 'A');
    await expect(railUnit(page, b)).toHaveAttribute('data-slot', 'B');

    await expect.poll(() => urlIds(page)).toEqual([a, b]);
    await page.reload();
    await expect(compare(page)).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT });
    await expect.poll(() => slotIds(page)).toEqual([a, b]);
    await expect(replicas(page)).toHaveCount(2);
    // The comparison is not a change to the view.
    await expect(page.locator('[data-testid="vx-tab"][data-active]')).not.toHaveAttribute('data-dirty', 'true');
  });

  test('Esc and Back return to the same scroll, folded groups, picked rows and open row', async ({ page }) => {
    // Short enough for six rows to scroll.
    await page.setViewportSize({ width: 1280, height: 440 });
    const viewId = await view({ groupBy: 'Labels.app' });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '6 of');
    await pick(page, one, 'alpha');
    await pick(page, two, 'alpha');
    await row(page, one, 'beta').locator('[data-column="Slug"]').click();
    await expect(page.getByTestId('vx-row-panel')).toContainText('beta');
    const folded = page.locator('[data-testid="vx-group-row"][data-group-key="Labels.app=payments"]');
    await folded.getByTestId('vx-group-toggle').click();
    await expect(folded).toHaveAttribute('data-collapsed', 'true');
    await page.getByTestId('vx-table').evaluate((el) => (el.scrollTop = el.scrollHeight));
    const before = await scrollTop(page);
    expect(before).toBeGreaterThan(0);

    // `c` from a focused row; Esc goes back, focus with it.
    await row(page, one, 'alpha').focus();
    await page.keyboard.press('c');
    await expect(compare(page)).toBeVisible();
    // The layout keys are not for the hidden table.
    await page.keyboard.press('b');
    await expect(compare(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(compare(page)).toHaveCount(0);
    await expect(row(page, one, 'alpha')).toBeFocused();
    await expect.poll(() => scrollTop(page)).toBe(before);
    await expect(folded).toHaveAttribute('data-collapsed', 'true');
    await expect(row(page, one, 'alpha')).toHaveAttribute('data-picked', 'true');
    await expect(row(page, two, 'alpha')).toHaveAttribute('data-picked', 'true');
    await expect(page.getByTestId('vx-row-panel')).toBeVisible();
    await expect(page.getByTestId('vx-row-panel')).toContainText('beta');
    await expect(page.getByTestId('vx-table')).toBeVisible();
    // The selection bar stands in place of the layout picker while rows are picked.
    await expect(page.getByTestId('vx-selection-bar')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has('compare')).toBe(false);

    // The Compare button, then Back: focus returns to the button.
    await page.getByTestId('vx-selection-compare').click();
    await expect(compare(page)).toBeVisible();
    await page.getByTestId('vx-compare-back').click();
    await expect(compare(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-selection-compare')).toBeFocused();
    await expect.poll(() => scrollTop(page)).toBe(before);
    await expect(page.getByTestId('vx-row-panel')).toContainText('beta');
    // Esc now clears the selection, the next layer down.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vx-selection-bar')).toHaveCount(0);
  });

  test('⌘Z does nothing while comparing: the hidden view keeps its sort, and compare mode stays open', async ({ page }) => {
    const viewId = await view();
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '6 of');
    const slugHeader = page.locator('[data-testid="vx-header"][data-column="Slug"]');
    await slugHeader.getByRole('button', { name: /column menu$/ }).click();
    await page.getByRole('menuitem', { name: 'Sort descending' }).click();
    await expect(slugHeader).toHaveAttribute('aria-sort', 'descending');

    await pick(page, one, 'alpha');
    await pick(page, two, 'alpha');
    await page.getByTestId('vx-selection-compare').click();
    await expect(compare(page)).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(compare(page)).toBeVisible();
    await expect.poll(() => urlIds(page)).toHaveLength(2);

    await page.getByTestId('vx-compare-back').click();
    await expect(compare(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-selection-compare')).toBeFocused();
    await expect(slugHeader).toHaveAttribute('aria-sort', 'descending');
    await expect(page.locator('[data-testid="vx-tab"][data-active]')).toHaveAttribute('data-dirty', 'true');
  });

  test('the rail adds and removes Units, by pointer and by keyboard, and says when the slots are full', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await compareAlphas(page, viewId);
    const rail = page.getByTestId('vx-compare-rail');
    await expect(rail).toHaveAttribute('aria-label', 'Units in this view');
    await expect(page.getByTestId('vx-rail-count')).toHaveText('6 Units');

    const gamma = idOf(one, 'gamma');
    // Each Unit's configuration is its own read: adding gamma reads gamma only.
    await expect(replicas(page)).toHaveCount(2);
    const reads: string[] = [];
    let lastRead = Date.now();
    page.on('request', (r) => {
      const m = /\/unit\/([^/]+)\/data(\?|$)/.exec(r.url());
      if (m && r.method() === 'GET') {
        reads.push(m[1]);
        lastRead = Date.now();
      }
    });
    /** No read for a second: a later read of A or B would have come by then. */
    const readsSettle = () => expect.poll(() => Date.now() - lastRead, { intervals: [250] }).toBeGreaterThan(1000);
    await expect(railUnit(page, gamma)).toHaveAccessibleName(new RegExp(`^Add gamma \\(Space ${one.spaceSlug}, .+\\) to the comparison$`));
    await railUnit(page, gamma).click();
    await expect(railUnit(page, gamma)).toHaveAttribute('data-slot', 'C');
    await expect.poll(() => urlIds(page)).toHaveLength(3);
    await expect.poll(() => reads).toEqual([gamma]);
    await expect(page.getByTestId('compare-column-c').first()).toHaveAttribute('data-compare-col', gamma);
    await readsSettle();
    expect(reads).toEqual([gamma]);
    await expect(page.getByTestId('vx-compare-title')).toHaveText('Compare 3 Units');
    await expect(page.getByTestId('vx-compare-mismatch')).toHaveText('These Units have different resources. Only matching documents line up.');
    await railUnit(page, gamma).click();
    await expect(railUnit(page, gamma)).not.toHaveAttribute('data-slot');
    await expect.poll(() => urlIds(page)).toHaveLength(2);

    // One tab stop; ↑/↓ move, Enter adds or folds.
    const focusables = await rail.getByRole('list').locator('button[tabindex="0"]').count();
    expect(focusables).toBe(1);
    await railUnit(page, gamma).focus();
    const at = Number(await railUnit(page, gamma).getAttribute('data-rail-index'));
    await page.keyboard.press('ArrowUp');
    const above = rail.locator(`[data-rail-index="${at - 1}"]`);
    await expect(above).toBeFocused();
    await expect(above).toHaveAttribute('tabindex', '0');
    await expect(railUnit(page, gamma)).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('ArrowDown');
    await expect(railUnit(page, gamma)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(railUnit(page, gamma)).toHaveAttribute('data-slot', 'C');
    await page.keyboard.press('Home');
    const group = rail.getByTestId('vx-rail-group').first();
    await expect(group).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(group).toHaveAttribute('aria-expanded', 'true');

    // Fill the five slots; a sixth says why it cannot go in.
    await railUnit(page, idOf(two, 'beta')).click();
    await railUnit(page, idOf(two, 'gamma')).click();
    await expect.poll(() => urlIds(page)).toHaveLength(5);
    await expect(page.getByTestId('unit-slot-add')).toHaveCount(0);
    await railUnit(page, idOf(one, 'beta')).click();
    await expect(page.getByText('All five slots are in use. Clear one first.')).toBeVisible();
    await expect.poll(() => urlIds(page)).toHaveLength(5);
    // A swap reads nothing again.
    const before = reads.length;
    const [a5, b5] = urlIds(page);
    await page.getByTestId('unit-slot-swap').click();
    await expect.poll(() => urlIds(page).slice(0, 2)).toEqual([b5, a5]);
    await expect(page.getByTestId('compare-column-a').first()).toHaveAttribute('data-compare-col', b5);
    await readsSettle();
    expect(reads).toHaveLength(before);

    // Taking the last Unit out from the rail goes back to the table, focus on the Compare button.
    for (const id of urlIds(page)) await railUnit(page, id).click();
    await expect(compare(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-selection-compare')).toBeFocused();
  });

  test('slots clear and shift left, ⇄ swaps A and B, and a drag swaps two slots by pointer and by keyboard', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await compareAlphas(page, viewId);
    await expect.poll(() => slotIds(page)).toHaveLength(2);
    const [a, b] = await slotIds(page);
    const gamma = idOf(one, 'gamma');
    await railUnit(page, gamma).click();
    await expect.poll(() => slotIds(page)).toEqual([a, b, gamma]);

    await page.getByTestId('unit-slot-swap').click();
    await expect.poll(() => slotIds(page)).toEqual([b, a, gamma]);
    await expect.poll(() => urlIds(page)).toEqual([b, a, gamma]);
    // The grid's columns follow the slots.
    await expect(page.getByTestId('compare-column-a').first()).toHaveAttribute('data-compare-col', b);

    // A pointer drag of slot A onto slot C swaps the two.
    const from = (await slot(page, 'a').boundingBox())!;
    const to = (await slot(page, 'c').boundingBox())!;
    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => slotIds(page)).toEqual([gamma, a, b]);
    await expect.poll(() => urlIds(page)).toEqual([gamma, a, b]);

    // Space picks a slot up, an arrow moves it, Space drops it.
    await slot(page, 'a').focus();
    await page.keyboard.press('Space');
    // The keyboard sensor finds the next slot from rects it measures after the pick-up:
    // wait until it says it holds the slot, then for the frames the measuring runs in.
    await expect(announced(page, 'Picked up column')).toHaveCount(1);
    await nextFrames(page);
    await page.keyboard.press('ArrowRight');
    await expect(announced(page, 'drop to swap')).toHaveCount(1);
    await nextFrames(page);
    await page.keyboard.press('Space');
    await expect.poll(() => slotIds(page)).toEqual([a, gamma, b]);

    // ✕ on slot A: the others move left, and focus stays in the row.
    await page.getByTestId('unit-slot-clear-a').click();
    await expect.poll(() => slotIds(page)).toEqual([gamma, b]);
    await expect(slot(page, 'a')).toBeFocused();
    await page.getByTestId('unit-slot-clear-a').click();
    await expect.poll(() => slotIds(page)).toEqual([b]);
    await expect(page.getByTestId('vx-compare-one')).toHaveText(/Pick a second Unit to compare with alpha/);
    // Clearing the last slot goes back to the table, with focus where it was: the Compare button.
    await page.getByTestId('unit-slot-clear-a').click();
    await expect(compare(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-table')).toBeVisible();
    await expect(page.getByTestId('vx-selection-compare')).toBeFocused();
  });

  test('different slugs compare with a warning, named by slug within one Space', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '6 of');
    await pick(page, one, 'alpha');
    await pick(page, one, 'beta');
    await page.getByTestId('vx-selection-compare').click();
    await expect(page.getByTestId('vx-compare-mismatch')).toHaveText('These Units have different resources. Only matching documents line up.');
    await expect(page.getByTestId('vx-compare-crumb')).toHaveText(`· 2 Units in ${one.spaceSlug}`);
    // Slots follow table order, whichever of the two that puts first.
    const slugs = (await slotIds(page)).map((id) => one.units.find((u) => u.id === id)?.slug);
    expect([...slugs].sort()).toEqual(['alpha', 'beta']);
    // Two lines: the slug, then the Space; the whole of it in the title.
    await expect(page.getByTestId('compare-column-a').first()).toHaveText(`A${slugs[0]}${one.spaceSlug}`);
    await expect(page.getByTestId('compare-column-b').first()).toHaveText(`B${slugs[1]}${one.spaceSlug}`);
    await expect(page.getByTestId('compare-column-a').first()).toHaveAttribute('title', `${slugs[0]} · ${one.spaceSlug}`);
    expect((await page.getByTestId('compare-column-a').first().boundingBox())!.height).toBe(34);
  });

  test('a link drops what it cannot use: entries that are not Unit IDs, and Units that are gone', async ({ page }) => {
    const viewId = await view();
    const a = idOf(one, 'alpha');
    const b = idOf(two, 'alpha');
    await openComparing(page, `/x/view-explorer?view=${viewId}&compare=${a},nope,${b}`, 2);
    await expect(page.getByText('In the link’s comparison, 1 entry is not a Unit ID and was left out.')).toBeVisible();
    await expect(compare(page)).toBeVisible();
    await expect.poll(() => slotIds(page)).toEqual([a, b]);
    await expect.poll(() => urlIds(page)).toEqual([a, b]);

    // A Unit that is gone, and one that never was: both leave in one change, with one message.
    await hubApi.delete(`/api/space/${two.spaceId}/unit/${b}`);
    await openComparing(page, `/x/view-explorer?view=${viewId}&compare=${a},${b},${uuid()}`, 1);
    await expect(page.getByText('2 Units are no longer available and were removed from the comparison.')).toBeVisible();
    await expect.poll(() => slotIds(page)).toEqual([a]);
    await expect.poll(() => urlIds(page)).toEqual([a]);
    await expect(page.getByTestId('vx-compare-one')).toHaveText(/Pick a second Unit to compare with alpha/);

    // When none is left, the table shows, with focus on its first row.
    await page.goto(`/x/view-explorer?view=${viewId}&compare=${uuid()}`);
    await expect(page.getByText('1 Unit is no longer available and was removed from the comparison.')).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT });
    await expect(compare(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-table')).toBeVisible();
    await expect(page.getByTestId('vx-row').first()).toBeFocused();
  });

  test('each tab keeps its own comparison, and Copy link carries it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const viewId = await view({ groupBy: 'Space' });
    await compareAlphas(page, viewId);
    await expect.poll(() => urlIds(page)).toHaveLength(2);
    const ids = urlIds(page);

    await page.getByTestId('vx-compare-copy-link').click();
    await expect(page.getByText('Link copied. It opens these 2 Units side by side.')).toBeVisible();
    const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(link.searchParams.get('compare')).toBe(ids.join(','));
    expect(link.searchParams.get('view')).toBe(viewId);

    // A new tab shows its table; the first tab is still comparing when the viewer comes back.
    await page.keyboard.press('n');
    await expect(compare(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has('compare')).toBe(false);
    await page.getByTestId('vx-tab').filter({ hasText: names[0] }).click();
    await expect(compare(page)).toBeVisible();
    await expect.poll(() => urlIds(page)).toEqual(ids);
  });

  test('more than five picked rows compare the first five in table order', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '6 of');
    await page.getByTestId('vx-pick-all').getByRole('checkbox').click();
    const button = page.getByTestId('vx-selection-compare');
    await expect(button).toHaveText(/^Compare first 5/);
    await button.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Slots go up to E. A–E get the first 5 rows in table order.');
    const order = await page.getByTestId('vx-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.rowId));
    await button.click();
    await expect(compare(page)).toBeVisible();
    await expect.poll(() => slotIds(page)).toEqual(order.slice(0, 5));
    await expect(page.getByTestId('vx-compare-title')).toHaveText('Compare 5 Units');
  });

  test('a narrow window shows the slots and the grid without the rail', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    const viewId = await view({ groupBy: 'Space' });
    await compareAlphas(page, viewId);
    await expect(page.getByTestId('vx-compare-rail')).toHaveCount(0);
    await expect(page.getByTestId('unit-slots')).toBeVisible();
    await expect(replicas(page)).toHaveCount(2);
    // With one Unit left, the words point at the empty slot, which is how a second is chosen here.
    await page.getByTestId('unit-slot-clear-b').click();
    await expect(page.getByTestId('vx-compare-one')).toContainText('Choose one from the empty slot above, or widen the window to see the list of Units.');
  });

  test('`c` closes an open peek before it compares', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '6 of');
    await pick(page, one, 'alpha');
    await pick(page, two, 'alpha');
    await page.getByRole('button', { name: new RegExp(`^Peek at 3 in Space ${one.spaceSlug}`) }).click();
    await expect(page.getByTestId('vx-peek')).toBeVisible();
    await page.keyboard.press('c');
    await expect(compare(page)).toBeVisible();
    await expect(page.getByTestId('vx-peek')).toHaveCount(0);
    await page.getByTestId('vx-compare-back').click();
    await expect(compare(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-peek')).toHaveCount(0);
  });
  test('Esc ends compare mode first after a tab switch, and the selection stays', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await compareAlphas(page, viewId);
    await page.keyboard.press('n');
    await expect(compare(page)).toHaveCount(0);
    await page.getByTestId('vx-tab').filter({ hasText: names[0] }).click();
    await expect(compare(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(compare(page)).toHaveCount(0);
    await expect(row(page, one, 'alpha')).toHaveAttribute('data-picked', 'true');
    await expect(row(page, two, 'alpha')).toHaveAttribute('data-picked', 'true');
    await expect(page.getByTestId('vx-selection-count')).toHaveText(/^2 of \d+ selected$/);
  });

  test('`c` closes an open cell popover before it compares, so the popover’s keys cannot change the hidden view', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '6 of');
    await pick(page, one, 'alpha');
    await pick(page, two, 'alpha');
    await row(page, one, 'beta').locator('[data-vx-value="Labels.app"]').first().click();
    await expect(page.getByTestId('vx-cell-popover')).toBeVisible();
    await page.keyboard.press('c');
    await expect(compare(page)).toBeVisible();
    await expect(page.getByTestId('vx-cell-popover')).toHaveCount(0);
    // `o` would have added an "Only this" lens to the hidden view.
    await page.keyboard.press('o');
    await page.getByTestId('vx-compare-back').click();
    await expect(page.locator('[data-testid="vx-tab"][data-active]')).not.toHaveAttribute('data-dirty', 'true');
    await expect(page.getByTestId('vx-row')).toHaveCount(6);
  });

  test('Back from a page that opened comparing shows the table as it should be: rows, count, groups and focus', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    const a = idOf(one, 'alpha');
    await openComparing(page, `/x/view-explorer?view=${viewId}&compare=${a},${idOf(two, 'alpha')}`, 2);
    await page.getByTestId('vx-compare-back').click();
    await expect(compare(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-count')).toContainText('6 of');
    await expect(page.getByTestId('vx-row')).toHaveCount(6);
    await expect(page.getByTestId('vx-group-row')).toHaveCount(2);
    await expect(row(page, one, 'alpha')).toBeFocused();
  });

  test('a filter added while comparing on "All units" forks it, the comparison follows, and Back shows the filtered table', async ({ page }) => {
    // "All units" lists every Unit of the organization; only this spec's are kept.
    await page.route(/\/api\/unit(\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const all = (await response.json()) as Array<{ Unit?: { SpaceID?: string } }>;
      await route.fulfill({ response, json: all.filter((u) => u.Unit?.SpaceID === one.spaceId || u.Unit?.SpaceID === two.spaceId) });
    });
    await openExplorer(page, '/x/view-explorer', '6 of 6');
    const active = page.locator('[data-testid="vx-tab"][data-active]');
    await expect(active).toContainText('All units');
    await pick(page, one, 'alpha');
    await pick(page, two, 'alpha');
    await page.getByTestId('vx-selection-compare').click();
    await expect(compare(page)).toBeVisible();
    await expect.poll(() => urlIds(page)).toHaveLength(2);
    const ids = urlIds(page);

    const addFilter = page.getByRole('combobox', { name: 'Add a filter' });
    await addFilter.click();
    await addFilter.fill('app:checkout');
    await expect(page.getByTestId('vx-readback')).toContainText('app:checkout');
    await addFilter.press('Enter');
    await expect(active).not.toContainText('All units');
    await expect(compare(page)).toBeVisible();
    await expect.poll(() => urlIds(page)).toEqual(ids);
    await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('new');
    // The rail follows the filter; the slots do not.
    await expect(page.getByTestId('vx-rail-unit')).toHaveCount(4);
    await expect.poll(() => slotIds(page)).toEqual(ids);

    await page.getByTestId('vx-compare-back').click();
    await expect(page.getByTestId('vx-row')).toHaveCount(4);
    // The selection's count stands in for the row count while rows are picked.
    await expect(page.getByTestId('vx-selection-count')).toHaveText('2 of 4 selected');
    await expect(row(page, one, 'alpha')).toHaveAttribute('data-picked', 'true');
    // "All units" kept its own comparison.
    await page.getByTestId('vx-tab').filter({ hasText: 'All units' }).click();
    await expect(compare(page)).toBeVisible();
  });

  test('a Unit whose configuration cannot be read leaves the grid, says so, and comes back on Retry', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    const b = idOf(two, 'alpha');
    let fail = true;
    await page.route(new RegExp(`/unit/${b}/data`), (route) => (fail ? route.fulfill({ status: 500, body: 'boom' }) : route.continue()));
    await compareAlphas(page, viewId);
    await expect(page.getByTestId('vx-compare-unread')).toContainText(`The configuration of alpha in ${two.spaceSlug} could not be read`);
    // One Unit left to show: no grid, and no verdict over it.
    await expect(page.getByTestId('compare-grid')).toHaveCount(0);
    await expect(page.getByTestId('compare-empty')).toHaveCount(0);
    await expect(page.getByText('0 differences')).toHaveCount(0);
    // A third Unit: the grid shows the two that can be read, each under its own slot's letter.
    const gamma = idOf(one, 'gamma');
    await railUnit(page, gamma).click();
    await expect.poll(() => slotIds(page)).toHaveLength(3);
    const ids = (await slotIds(page)) as string[];
    const column = (id: string) => page.getByTestId(`compare-column-${'abc'[ids.indexOf(id)]}`);
    for (const id of ids.filter((x) => x !== b)) await expect(column(id).first()).toHaveAttribute('data-compare-col', id);
    await expect(column(b)).toHaveCount(0);
    fail = false;
    await page.getByTestId('vx-compare-unread').getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('vx-compare-unread')).toHaveCount(0);
    await expect(column(b).first()).toHaveAttribute('data-compare-col', b);
    // The failure the route made is the one the browser reports.
    problems = problems.filter((p) => !p.includes('status of 500'));
  });

  test('a Properties Unit is named by its slug, and the one-Unit state offers the suggestion', async ({ page }) => {
    const api = new ApiHelper(page);
    const ids: string[] = [];
    for (const [seed, value] of [[one, '1'], [two, '2']] as const) {
      const unit = await api.createUnit({ spaceId: seed.spaceId, unit: { Slug: 'settings', ToolchainType: 'AppConfig/Properties' } });
      await api.uploadUnitData({ spaceId: seed.spaceId, unitId: unit.UnitID!, body: `mode=fast\nretries=${value}\n` });
      ids.push(unit.UnitID!);
    }
    const viewId = await view({ groupBy: 'Space' });
    await openComparing(page, `/x/view-explorer?view=${viewId}&compare=${ids[0]}`, 1);
    await expect(page.getByTestId('vx-compare-one')).toContainText('Pick a second Unit to compare with settings');
    await expect(page.getByTestId('vx-compare-one')).toContainText('Choose one from the list of Units on the left, or from the empty slot above.');
    // "Choose another Unit…" opens the picker for slot B; Esc gives focus back to it.
    const choose = page.getByTestId('vx-compare-choose');
    await choose.click();
    await expect(page.getByTestId('vx-picker')).toHaveAttribute('data-mode', 'add');
    await expect(page.getByTestId('vx-picker-letter')).toHaveText('B');
    await expect(choose).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vx-picker')).toHaveCount(0);
    await expect(choose).toBeFocused();
    await page.getByTestId('vx-compare-suggested').click();
    await expect.poll(() => slotIds(page)).toEqual(ids);
    await expect(page.getByTestId('compare-document-group')).toHaveCount(1);
    await expect(page.getByTestId('compare-document-group')).toContainText('settings');
    await expect(page.getByTestId('compare-document-count')).toHaveText('1 differing');
    // The compare model has no Properties parser: the file is compared as text, which still shows the difference.
    await expect(page.locator('[data-testid="compare-leaf-row"] [data-column]')).toHaveText([/retries=1/, /retries=2/]);
  });
});

test.describe('view explorer compare rail, at scale', () => {
  test.use({ storageState: 'authentication.json' });

  test('the rail keeps its one tab stop when the wheel scrolls it out of the drawn rows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const now = Date.now();
    const units = Array.from({ length: 300 }, (_, i) => ({
      Unit: {
        UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        Slug: `unit-${String(i).padStart(4, '0')}`,
        SpaceID: 'space-rail',
        ToolchainType: 'Kubernetes/YAML',
        HeadRevisionNum: 1,
        UpdatedAt: new Date(now - i * 60_000).toISOString(),
        CreatedAt: new Date(now - i * 120_000).toISOString(),
      },
      Space: { SpaceID: 'space-rail', Slug: 'rail-space' },
    }));
    const body = JSON.stringify(units);
    await page.route(/\/api\/unit(\?|$)/, (route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body }) : route.continue(),
    );
    await page.route(/\/unit\/[^/]+\/data(\?|$)/, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: deployment('web', 1) }));
    await openExplorer(page, '/x/view-explorer', '300 of 300');

    // The first two rows: slot A's row is the rail's tab stop, at the top of the rail.
    const [first, second] = await page.getByTestId('vx-row').evaluateAll((els) => els.slice(0, 2).map((e) => (e as HTMLElement).dataset.rowId ?? ''));
    await page.locator(`[data-testid="vx-row"][data-row-id="${first}"]`).getByTestId('vx-row-pick').click();
    await page.locator(`[data-testid="vx-row"][data-row-id="${second}"]`).getByTestId('vx-row-pick').click();
    await page.getByTestId('vx-selection-compare').click();
    const rail = page.getByTestId('vx-compare-rail');
    const stop = rail.locator(`[data-testid="vx-rail-unit"][data-unit-id="${first}"]`);
    await expect(stop).toHaveAttribute('tabindex', '0');

    // The wheel takes the rail far past it; it stays drawn, out of sight.
    const list = rail.getByRole('list');
    await list.hover();
    await page.mouse.wheel(0, 4000);
    await expect.poll(() => list.evaluate((el) => (el.parentElement as HTMLElement).scrollTop)).toBeGreaterThan(2000);
    await expect(stop).not.toBeInViewport();
    await expect(stop).toHaveCount(1);

    // Tab from the rail's Back button lands in the rail, on that row.
    await page.getByTestId('vx-rail-back').focus();
    await page.keyboard.press('Tab');
    await expect(stop).toBeFocused();
  });
});
