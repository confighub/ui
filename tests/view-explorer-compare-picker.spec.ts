// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Locator, Page, Route } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { type ExplorerSeed, FIRST_LOAD_TIMEOUT, LONG_TASK_BUDGET_MS, openExplorer, seedExplorer, viewsNamed } from './fixtures/view-explorer-seed';
import { applyCpuThrottling } from './fixtures/slow-mode';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The Unit picker of compare mode in the View explorer: from the drawer's
 * "Compare with…", from one picked row, from `c`, and from the slots. With
 * nothing typed it suggests the same slug in other Spaces, the upstream Unit,
 * then the Units of the row's group; typing searches every Unit. ↵ takes the
 * highlighted Unit, ⇧↵ takes it and stays open for the next slot, Esc closes
 * it, and focus goes back to what had it before the picker opened.
 *
 * Two seeded Spaces hold alpha, beta and gamma. A Unit of a slug no other
 * spec uses ("web-…") is added to both, and the first Space's is cloned from
 * "<slug>-base" in the second Space, which has two revisions since, so its
 * upstream is ahead of it. The picker suggests from every Unit of the
 * organization, so the specs that need an exact list use that slug.
 */

const deployment = (name: string, replicas: number) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
spec:
  replicas: ${replicas}
`;

async function cleanUp(name: string) {
  for (const v of await viewsNamed(name)) {
    await hubApi.delete(`/api/space/${v.View.SpaceID}/view/${v.View.ViewID}`);
    if (v.View.FilterID) await hubApi.delete(`/api/space/${v.View.SpaceID}/filter/${v.View.FilterID}`);
  }
}

const picker = (page: Page) => page.getByTestId('vx-picker');
const input = (page: Page) => page.getByTestId('vx-picker-input');
const letter = (page: Page) => page.getByTestId('vx-picker-letter');
const options = (page: Page) => page.getByTestId('vx-picker-option');
const option = (page: Page, id: string) => page.locator(`[data-testid="vx-picker-option"][data-unit-id="${id}"]`);
const sectionIds = (page: Page) => page.getByTestId('vx-picker-section').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.section));
const optionIds = (scope: Locator) => scope.getByTestId('vx-picker-option').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.unitId));
const section = (page: Page, id: string) => page.locator(`[data-testid="vx-picker-section"][data-section="${id}"]`);
const compare = (page: Page) => page.getByTestId('vx-compare');
const slotIds = (page: Page) =>
  page.locator('[data-testid^="unit-slot-"][data-unit-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.unitId));
const urlIds = (page: Page) => (new URL(page.url()).searchParams.get('compare') ?? '').split(',').filter(Boolean);

/**
 * A picker opened from a slot: its right edge on the slot's, unless that
 * would take it out of the comparison, and 16px inside the comparison.
 */
async function expectInsideComparison(page: Page, slot: Locator) {
  // Retried: the popover is placed a frame after it mounts.
  await expect(async () => {
    // The popover's paper, which holds the picker inside its border.
    const box = (await page.getByTestId('vx-picker').locator('xpath=..').boundingBox())!;
    const frame = (await page.getByTestId('vx-compare-region').boundingBox())!;
    const anchor = (await slot.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(frame.x + 16 - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width - 16 + 1);
    const wanted = Math.min(anchor.x + anchor.width, frame.x + frame.width - 16);
    if (wanted - box.width >= frame.x + 16) expect(Math.abs(box.x + box.width - wanted)).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 5000 });
}

/** The option the field says is highlighted, by its UnitID. */
const highlighted = (page: Page) =>
  input(page).evaluate((el) => document.getElementById(el.getAttribute('aria-activedescendant') ?? '')?.dataset.unitId ?? null);

test.describe('view explorer compare picker', () => {
  test.use({ storageState: 'authentication.json' });

  let one: ExplorerSeed;
  let two: ExplorerSeed;
  let problems: string[];
  let names: string[];
  let web: { slug: string; one: string; two: string; base: string };

  const idOf = (seed: ExplorerSeed, slug: string) => seed.units.find((u) => u.slug === slug)!.id;
  const rowById = (page: Page, id: string) => page.locator(`[data-testid="vx-row"][data-row-id="${id}"]`);
  const row = (page: Page, seed: ExplorerSeed, slug: string) => rowById(page, idOf(seed, slug));

  const view = async (options: { groupBy?: string } = {}) => {
    const name = `Picker ${RandomSlugGenerator.randomSlugName()}`;
    names.push(name);
    return (await one.createView({ name, where: `Space.Slug IN ('${one.spaceSlug}','${two.spaceSlug}')`, ...options })).viewId;
  };

  /**
   * Open the view with the first Space's web-… in the drawer. Returns the
   * other Units of its group (the first Space) in the order the table shows
   * them, which "In this group" follows.
   */
  const openWebInDrawer = async (page: Page, viewId: string) => {
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '9 of');
    const shown = await page.getByTestId('vx-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.rowId ?? ''));
    const group = shown.filter((id) => one.units.some((u) => u.id === id));
    await rowById(page, web.one).locator('[data-column="Slug"]').click();
    await expect(page.getByTestId('vx-row-panel')).toBeFocused();
    return group;
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
    const api = new ApiHelper(page);
    const slug = `web-${RandomSlugGenerator.randomSlugName()}`;
    const unit = (s: string) => ({ Slug: s, ToolchainType: 'Kubernetes/YAML', Labels: { app: 'web', tier: 'web' } });
    const base = await api.createUnit({ spaceId: two.spaceId, unit: unit(`${slug}-base`) });
    await api.uploadUnitData({ spaceId: two.spaceId, unitId: base.UnitID!, body: deployment('web', 1) });
    // A clone: the new Unit records the upstream and the revision it merged.
    const cloned = await hubApi.post(`/api/space/${one.spaceId}/unit`, {
      params: { upstream_space_id: two.spaceId, upstream_unit_id: base.UnitID! },
      data: unit(slug),
    });
    expect(cloned.ok(), await cloned.text()).toBeTruthy();
    const webOne = (await cloned.json()).Unit as { UnitID: string };
    const webTwo = await api.createUnit({ spaceId: two.spaceId, unit: unit(slug) });
    await api.uploadUnitData({ spaceId: two.spaceId, unitId: webTwo.UnitID!, body: deployment('web', 3) });
    // Two revisions on the upstream that the clone has not merged.
    await api.uploadUnitData({ spaceId: two.spaceId, unitId: base.UnitID!, body: deployment('web', 2) });
    await api.uploadUnitData({ spaceId: two.spaceId, unitId: base.UnitID!, body: deployment('web', 4) });
    web = { slug, one: webOne.UnitID, two: webTwo.UnitID!, base: base.UnitID! };
  });

  test.afterEach(async () => {
    for (const name of names) await cleanUp(name);
    await one.remove();
    await two.remove();
    expect(problems, 'no console errors or React warnings').toEqual([]);
  });

  test('the drawer’s Compare with… suggests the same slug, the upstream, then the group, and ↵ compares', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    const group = await openWebInDrawer(page, viewId);
    const button = page.getByTestId('vx-drawer-compare');
    await expect(button).toHaveText(/^Compare with…c$/);
    await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();

    await expect(picker(page)).toHaveAttribute('role', 'dialog');
    await expect(picker(page)).toHaveAccessibleName(`Choose a Unit to compare with ${web.slug}`);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveAttribute('role', 'combobox');
    await expect(letter(page)).toHaveText('B');
    await expect(page.getByTestId('vx-picker-hints')).toHaveText('↑ ↓ move↵ compare⇧↵ add and keep the picker open');

    await expect.poll(() => sectionIds(page)).toEqual(['same-slug', 'upstream', 'group']);
    await expect.poll(() => optionIds(section(page, 'same-slug'))).toEqual([web.two]);
    await expect(section(page, 'same-slug')).toContainText('Same slug in other Spaces');
    await expect.poll(() => optionIds(section(page, 'upstream'))).toEqual([web.base]);
    await expect(option(page, web.base)).toContainText('2 revisions ahead of what this Unit merged');
    // The group the row is drawn under, named by its value, in table order; each Unit once.
    await expect(section(page, 'group')).toContainText(one.spaceSlug);
    expect(group).toHaveLength(3);
    await expect.poll(() => optionIds(section(page, 'group'))).toEqual(group);
    // A Unit of another Space says its Space; one of the base's own does not.
    await expect(option(page, web.two)).toContainText(`${web.slug} · ${two.spaceSlug}`);
    await expect(option(page, idOf(one, 'alpha')).locator('span').first()).toHaveText('alpha');
    // One term for a Unit with no Target, on the second line; the right column is the revision alone.
    await expect(option(page, web.two)).toContainText('Kubernetes/YAML · No Target');
    await expect(option(page, web.two)).not.toContainText(/not targeted|no Target/);
    await expect(option(page, web.two).getByTestId('vx-picker-option-side')).toHaveText(/^rev \d+$/);

    // The first suggestion is highlighted, and is the one the empty slot will suggest next.
    await expect.poll(() => highlighted(page)).toBe(web.two);
    await expect(option(page, web.two)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(picker(page)).toHaveCount(0);
    await expect(compare(page)).toBeVisible();
    await expect(page.getByTestId('vx-compare-region')).toBeFocused();
    await expect.poll(() => slotIds(page)).toEqual([web.one, web.two]);
    await expect(page.getByTestId('unit-slot-suggestion')).toHaveText(`Suggested: ${web.slug}-base · ${two.spaceSlug}`);

    // Back: focus returns to the button that opened the picker.
    await page.getByTestId('vx-compare-back').click();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('⇧↵ keeps the picker open for slot C, Esc drops what it built, and the 5th slot closes it', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    const group = await openWebInDrawer(page, viewId);
    // `c` with focus in the drawer: the drawer's Unit is A.
    await page.keyboard.press('c');
    await expect(input(page)).toBeFocused();
    await expect(letter(page)).toHaveText('B');
    await page.keyboard.press('Shift+Enter');
    await expect(picker(page)).toBeVisible();
    await expect(letter(page)).toHaveText('C');
    await expect(input(page)).toHaveAccessibleName('Filter Units for slot C');
    // Taken now: listed with its letter, and not offered again.
    await expect(option(page, web.two)).toHaveAttribute('aria-disabled', 'true');
    await expect(option(page, web.two).getByTestId('vx-picker-option-slot')).toHaveText('in slot B');
    await expect(option(page, web.two)).toContainText('Already in the compare');
    await expect.poll(() => highlighted(page)).toBe(web.base);
    // ↑ from the first free option skips the taken one before it, round to the last.
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => highlighted(page)).toBe(group[group.length - 1]);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => highlighted(page)).toBe(web.base);
    // Nothing is compared until ↵; Esc drops it, and focus goes back to the drawer, where `c` was pressed.
    await expect(compare(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);
    await expect(compare(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has('compare')).toBe(false);
    await expect(page.getByTestId('vx-row-panel')).toBeFocused();

    // Again: B, C and D by ⇧↵; E fills the last slot, which closes the picker and compares the five.
    await page.keyboard.press('c');
    await expect(letter(page)).toHaveText('B');
    for (const next of ['C', 'D', 'E']) {
      await page.keyboard.press('Shift+Enter');
      await expect(letter(page)).toHaveText(next);
    }
    await page.keyboard.press('Shift+Enter');
    await expect(picker(page)).toHaveCount(0);
    await expect(compare(page)).toBeVisible();
    await expect.poll(() => slotIds(page)).toEqual([web.one, web.two, web.base, group[0], group[1]]);
    await expect(page.getByTestId('unit-slot-add')).toHaveCount(0);
    // `c` with all five full opens nothing.
    await page.keyboard.press('c');
    await expect(picker(page)).toHaveCount(0);
  });

  test('in compare mode: search finds a Unit in another Space, held Units say their slot, and a slot’s picker swaps', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '9 of');
    await row(page, one, 'alpha').getByTestId('vx-row-pick').click();
    await row(page, two, 'alpha').getByTestId('vx-row-pick').click();
    await page.getByTestId('vx-selection-compare').click();
    await expect(compare(page)).toBeVisible();
    // Slots in table order: A is the alpha of whichever Space the table lists first.
    await expect.poll(() => slotIds(page)).toHaveLength(2);
    const [a, b] = await slotIds(page);
    const [seedA, seedB] = a === idOf(one, 'alpha') ? [one, two] : [two, one];
    expect([a, b]).toEqual([idOf(seedA, 'alpha'), idOf(seedB, 'alpha')]);

    // The empty slot opens the picker for C; a search finds gamma in the second Space.
    const add = page.getByTestId('unit-slot-add');
    await expect(add).toHaveAttribute('aria-haspopup', 'dialog');
    await add.click();
    await expect(picker(page)).toHaveAttribute('data-mode', 'add');
    await expect(letter(page)).toHaveText('C');
    await expect(page.getByTestId('vx-picker-hints')).toContainText('↵ add');
    await input(page).fill(`gamma ${two.spaceSlug}`);
    await expect(options(page)).toHaveCount(1);
    await expect(section(page, 'search')).toContainText('1 match');
    await expect(page.getByTestId('vx-picker-status')).toHaveText('1 result');
    await page.keyboard.press('Enter');
    await expect(picker(page)).toHaveCount(0);
    await expect.poll(() => slotIds(page)).toEqual([a, b, idOf(two, 'gamma')]);
    await expect(add).toBeFocused();

    // A Unit already in a slot is listed with its letter, and cannot be taken again.
    await page.keyboard.press('c');
    await expect(letter(page)).toHaveText('D');
    await input(page).fill(`alpha ${seedB.spaceSlug}`);
    await expect(option(page, b)).toHaveAttribute('aria-disabled', 'true');
    await expect(option(page, b)).toContainText('in slot B');
    await expect(page.getByTestId('vx-picker-empty')).toHaveCount(0);
    // A click on it takes nothing.
    await option(page, b).click({ force: true });
    await expect(picker(page)).toBeVisible();
    await expect.poll(() => slotIds(page)).toEqual([a, b, idOf(two, 'gamma')]);
    await expect.poll(() => urlIds(page)).toEqual([a, b, idOf(two, 'gamma')]);
    await input(page).fill('no such unit anywhere');
    await expect(page.getByTestId('vx-picker-empty')).toHaveText('No Units match ‘no such unit anywhere’.');
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);
    await expect(add).toBeFocused();

    // A click on slot B opens it for B, under the slot and inside the comparison: taking the Unit in A swaps the two.
    await page.getByTestId('unit-slot-b').click();
    await expect(picker(page)).toHaveAttribute('data-mode', 'replace');
    await expect(page.getByTestId('unit-slot-b')).toHaveAttribute('aria-expanded', 'true');
    await expectInsideComparison(page, page.getByTestId('unit-slot-b'));
    await expect(picker(page)).toHaveAccessibleName('Choose a Unit for slot B');
    await expect(letter(page)).toHaveText('B');
    await input(page).fill(`alpha ${seedA.spaceSlug}`);
    await expect(option(page, a)).not.toHaveAttribute('aria-disabled');
    await expect(option(page, a)).toContainText('In slot A · choosing it swaps A and B');
    await option(page, a).click();
    await expect(picker(page)).toHaveCount(0);
    await expect.poll(() => slotIds(page)).toEqual([b, a, idOf(two, 'gamma')]);
    await expect(page.getByTestId('unit-slot-b')).toBeFocused();

    // Enter on a slot replaces too; any other Unit takes the slot.
    await page.keyboard.press('Enter');
    await expect(picker(page)).toHaveAttribute('data-mode', 'replace');
    await input(page).fill(`beta ${one.spaceSlug}`);
    await page.keyboard.press('Enter');
    await expect.poll(() => slotIds(page)).toEqual([b, idOf(one, 'beta'), idOf(two, 'gamma')]);

    // ⇧↵ on a slot's picker replaces it and stays open, for the next empty slot.
    await expect(page.getByTestId('unit-slot-b')).toBeFocused();
    await page.keyboard.press('Enter');
    await input(page).fill(`beta ${two.spaceSlug}`);
    await expect(options(page)).toHaveCount(1);
    await page.keyboard.press('Shift+Enter');
    await expect(picker(page)).toHaveAttribute('data-mode', 'add');
    await expect(letter(page)).toHaveText('D');
    await expect.poll(() => slotIds(page)).toEqual([b, idOf(two, 'beta'), idOf(two, 'gamma')]);
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);
    await expect.poll(() => slotIds(page)).toEqual([b, idOf(two, 'beta'), idOf(two, 'gamma')]);
  });

  test('↵ right after typing takes the Unit the query finds, not an earlier suggestion', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await openWebInDrawer(page, viewId);
    await page.getByTestId('vx-drawer-compare').click();
    await expect(input(page)).toBeFocused();
    await expect.poll(() => highlighted(page)).toBe(web.two);
    // The text and ↵ in one task, before React has drawn the list for the text.
    const target = idOf(two, 'gamma');
    await input(page).evaluate((el, text) => {
      const field = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, text);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return Promise.resolve().then(() => {
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      });
    }, `gamma ${two.spaceSlug}`);
    await expect(compare(page)).toBeVisible();
    await expect.poll(() => slotIds(page)).toEqual([web.one, target]);
  });

  test('the Upstream section names the Unit this one merges from, and how far ahead it is', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await openWebInDrawer(page, viewId);
    await page.getByTestId('vx-drawer-compare').click();
    const upstream = section(page, 'upstream');
    await expect(upstream.locator('div[role="presentation"]').first()).toHaveText('UpstreamThe Link this Unit merges from');
    await expect.poll(() => optionIds(upstream)).toEqual([web.base]);
    await expect(option(page, web.base)).toContainText(`${web.slug}-base · ${two.spaceSlug}`);
    await expect(option(page, web.base)).toContainText(/\d+ revisions ahead of what this Unit merged/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vx-drawer-compare')).toBeFocused();
  });

  test('one picked row: Compare with… and `c` open the picker, by keyboard alone, with focus back on Esc and Back', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '9 of');
    await rowById(page, web.one).getByTestId('vx-row-pick').click();
    const button = page.getByTestId('vx-selection-compare');
    await expect(button).toHaveText(/^Compare with…c$/);
    await expect(button).toHaveAttribute('aria-haspopup', 'dialog');

    const focusedRow = rowById(page, web.one);
    await focusedRow.focus();
    await page.keyboard.press('c');
    await expect(input(page)).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(picker(page)).toHaveAccessibleName(`Choose a Unit to compare with ${web.slug}`);
    const order = await optionIds(picker(page));
    expect(order.slice(0, 2)).toEqual([web.two, web.base]);
    await expect.poll(() => highlighted(page)).toBe(order[0]);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => highlighted(page)).toBe(order[1]);
    await page.keyboard.press('End');
    await expect.poll(() => highlighted(page)).toBe(order[order.length - 1]);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => highlighted(page)).toBe(order[0]);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => highlighted(page)).toBe(order[order.length - 1]);
    await page.keyboard.press('Home');
    await expect.poll(() => highlighted(page)).toBe(order[0]);
    // Esc gives focus back to the row it had before the picker opened.
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);
    await expect(focusedRow).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    // Enter on the button opens it again; ↓ ↵ compares with the second suggestion.
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(compare(page)).toBeVisible();
    await expect.poll(() => slotIds(page)).toEqual([web.one, web.base]);

    // `c` while comparing opens the picker for the next empty slot, which shows pressed; Esc gives focus back.
    await expect(page.getByTestId('vx-compare-region')).toBeFocused();
    await page.keyboard.press('c');
    await expect(letter(page)).toHaveText('C');
    await expect(page.getByTestId('unit-slot-add')).toHaveAttribute('aria-expanded', 'true');
    await expectInsideComparison(page, page.getByTestId('unit-slot-add'));
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vx-compare-region')).toBeFocused();
    await expect(page.getByTestId('unit-slot-add')).toHaveAttribute('aria-expanded', 'false');
    // From a row of the rail, Esc gives focus back to that row.
    const railRow = page.locator(`[data-testid="vx-rail-unit"][data-unit-id="${web.two}"]`);
    await railRow.focus();
    await page.keyboard.press('c');
    await expect(letter(page)).toHaveText('C');
    await page.keyboard.press('Escape');
    await expect(railRow).toBeFocused();
    await page.getByTestId('vx-compare-back').click();
    await expect(button).toBeFocused();
  });

  test('the picker shows loading, then the error with Retry, then the Units', async ({ page }) => {
    const viewId = await view({ groupBy: 'Space' });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let fail = true;
    await page.route(/\/api\/unit(\?|$)/, async (route: Route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await held;
      return fail ? route.fulfill({ status: 500, body: 'boom' }) : route.continue();
    });
    await applyCpuThrottling(page);
    await page.goto(`/x/view-explorer?view=${viewId}&compare=${idOf(one, 'alpha')}`);
    const add = page.getByTestId('unit-slot-add');
    await expect(add).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT });
    await add.click();
    await expect(page.getByTestId('vx-picker-loading')).toBeVisible();
    await expect(input(page)).toBeDisabled();

    release();
    const error = page.getByTestId('vx-picker-error');
    await expect(error).toHaveText(/The Units could not be loaded\./);
    await expect(input(page)).toBeDisabled();
    fail = false;
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(error).toHaveCount(0);
    await expect(input(page)).toBeEnabled();
    await expect(input(page)).toBeFocused();
    await expect.poll(() => sectionIds(page)).toEqual(['same-slug', 'group']);
    await page.keyboard.press('Enter');
    await expect.poll(() => slotIds(page)).toHaveLength(2);
    expect((await slotIds(page))[0]).toBe(idOf(one, 'alpha'));
    // The failures the route made are the ones the browser reports.
    problems = problems.filter((p) => !p.includes('status of 500'));
  });

  test('a Space view’s drawer has no Compare with…, and `c` opens nothing there', async ({ page }) => {
    const viewId = await view();
    await openExplorer(page, `/x/view-explorer?view=${viewId}`, '9 of');
    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    await expect(page.getByTestId('vx-entity')).toHaveText(/Spaces/);
    await page.getByTestId('vx-row').first().locator('[data-column]').first().click();
    await expect(page.getByTestId('vx-row-panel')).toBeVisible();
    await expect(page.getByTestId('vx-drawer-compare')).toHaveCount(0);
    await page.keyboard.press('c');
    await expect(picker(page)).toHaveCount(0);
  });
});

test.describe('view explorer compare picker, at scale', () => {
  test.use({ storageState: 'authentication.json' });

  test('typing a search over 5,000 Units has no long task', async ({ page }) => {
    test.skip(!!process.env.SLOW_MODE, 'timing budgets are not meaningful under SLOW_MODE');
    await page.setViewportSize({ width: 1440, height: 900 });
    const now = Date.now();
    const units = Array.from({ length: 5000 }, (_, i) => ({
      Unit: {
        UnitID: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        Slug: `unit-${String(i).padStart(4, '0')}`,
        SpaceID: `space-${i % 25}`,
        ToolchainType: 'Kubernetes/YAML',
        Labels: { app: `app-${i % 40}` },
        HeadRevisionNum: 5,
        LastReleasedRevisionNum: 5,
        UpdatedAt: new Date(now - i * 60_000).toISOString(),
        CreatedAt: new Date(now - i * 120_000).toISOString(),
      },
      Space: { SpaceID: `space-${i % 25}`, Slug: `perf-space-${String(i % 25).padStart(2, '0')}` },
    }));
    const body = JSON.stringify(units);
    await page.route(/\/api\/unit(\?|$)/, (route: Route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body }) : route.continue(),
    );
    await page.addInitScript(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
    });
    await openExplorer(page, '/x/view-explorer', '5000 of 5000');
    const first = page.getByTestId('vx-row').first();
    // The picked Unit is the one compared with, so a search never lists it.
    const baseIndex = Number((await first.getAttribute('data-row-id'))!.slice(-12));
    const matches = (prefix: string) => units.filter((u, i) => u.Unit.Slug.startsWith(prefix) && i !== baseIndex).length;
    await first.getByTestId('vx-row-pick').click();
    await page.waitForTimeout(500);
    await page.evaluate(() => ((window as unknown as { __longTasks: number[] }).__longTasks = []));

    await page.getByTestId('vx-selection-compare').click();
    await expect(input(page)).toBeFocused();
    await expect(page.getByTestId('vx-picker-empty')).toHaveText('No suggestions for this Unit. Type to search all 5000 Units.');
    await page.keyboard.type('unit-4', { delay: 40 });
    await expect(page.getByTestId('vx-picker-cap')).toHaveText(`Showing the first 100 of ${matches('unit-4')}. Type more to narrow.`);
    await expect(options(page)).toHaveCount(100);
    await page.keyboard.type('99', { delay: 40 });
    await expect(options(page)).toHaveCount(matches('unit-499'));
    await expect(page.getByTestId('vx-picker-cap')).toHaveCount(0);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
    await expect(options(page)).toHaveCount(100);

    const tasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
    expect(tasks.filter((ms) => ms >= LONG_TASK_BUDGET_MS).map(Math.round), 'long tasks while searching (ms)').toEqual([]);
  });
});
