// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ConsoleMessage, Page } from '@playwright/test';

import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import type { Lens, ViewDef } from '../src/pages/x/view-explorer/model/types';
import { encodeDraftParam } from '../src/pages/x/view-explorer/model/view-codec';
import { expect, hubApi, newAuthorizedContext, test } from './fixtures/test';
import { type ExplorerSeed, readView, seedExplorer, viewsNamed, openExplorer, reloadExplorer, expectOverlaysGone } from './fixtures/view-explorer-seed';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

/**
 * The View Explorer's tab strip and saving: opening views, drafts, the first
 * save of a temporary view, Save as new, rename, pins, links and delete.
 */

const tabs = (page: Page) => page.getByTestId('vx-tab');
const tabNamed = (page: Page, name: string) => tabs(page).filter({ hasText: name });
const activeTab = (page: Page) => page.locator('[data-testid="vx-tab"][data-active]');
const addFilter = (page: Page) => page.getByRole('combobox', { name: 'Add a filter' });
const pinButton = (page: Page, name: string) => tabNamed(page, name).getByRole('button', { name: /^Pin .* to your tabs$/ });
const optionsButton = (page: Page, name: string) => tabNamed(page, name).getByRole('button', { name: /^Options for / });
const rows = (page: Page) => page.getByTestId('vx-row');
const saveActions = (page: Page) => page.getByTestId('vx-save-actions');

const fieldLens = (id: string, field: string, values: string[]): Lens => ({ id, enabled: true, kind: 'field', field, op: 'is', values });

/** A draft of a seeded view: its columns and (absent) sort as saved, with these lenses. */
function draftOf(lenses: Lens[], patch: Partial<ViewDef> = {}): ViewDef {
  const columns = [{ name: 'Slug' }, { name: 'Space' }, { name: 'Labels.app' }];
  return { ...defaultViewDef('Unit'), columns, sort: null, lenses, ...patch };
}

const draftUrl = (viewId: string, def: ViewDef) => `/x/view-explorer?view=${viewId}&d=${encodeDraftParam(def)}`;

const uniqueName = (prefix: string) => `${prefix} ${RandomSlugGenerator.randomSlugName()}`;

/** Delete the Views named `name` (and their Filters), so the harness does not fill up. */
async function cleanUp(name: string) {
  for (const v of await viewsNamed(name)) {
    await hubApi.delete(`/api/space/${v.View.SpaceID}/view/${v.View.ViewID}`);
    if (v.View.FilterID) await hubApi.delete(`/api/space/${v.View.SpaceID}/filter/${v.View.FilterID}`);
  }
}

test.describe('view explorer tabs and saving', () => {
  test.use({ storageState: 'authentication.json' });

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

  test('a saved view opens from its link with its rows', async ({ page }) => {
    const name = uniqueName('Open');
    const view = await seed.createView({ name });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(activeTab(page)).toContainText(name);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('vx-count')).toContainText('3 of');
    await cleanUp(name);
  });

  test('a draft is italic with a dot, lists its changes, and Discard can be undone', async ({ page }) => {
    const name = uniqueName('Draft');
    const view = await seed.createView({ name });
    const def = draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])]);
    await openExplorer(page, draftUrl(view.viewId, def));

    const tab = tabNamed(page, name);
    await expect(tab).toHaveAttribute('data-dirty', 'true');
    await expect(tab.locator('.vx-tab-label')).toHaveCSS('font-style', 'italic');
    await expect(rows(page)).toHaveCount(2);

    await saveActions(page).getByRole('button', { name: /change/ }).click();
    await expect(page.getByTestId('vx-changes-list')).toContainText('Added filter: app is checkout');
    // The link's lenses are matched to the saved ones, so the unchanged Space lens is not listed.
    await expect(page.getByTestId('vx-changes-list')).not.toContainText('Removed filter');
    await expect(page.getByTestId('vx-changes-list').locator('li')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vx-changes-list')).toBeHidden();
    await expectOverlaysGone(page);

    await saveActions(page).getByRole('button', { name: 'Discard' }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(tab).not.toHaveAttribute('data-dirty', 'true');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(tab).toHaveAttribute('data-dirty', 'true');
    await cleanUp(name);
  });

  test('Save writes the changes over the same Filter', async ({ page }) => {
    const name = uniqueName('Save');
    const view = await seed.createView({ name });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`Saved “${name}” for everyone.`)).toBeVisible();
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true');
    await expect(saveActions(page)).toHaveCount(0);

    const saved = await readView(view.spaceId, view.viewId);
    expect(saved.View.FilterID).toBe(view.filterId);
    expect(saved.Filter.Where).toContain("Labels.app = 'checkout'");
    await cleanUp(name);
  });

  test('keys typed right after N are kept, and the first save asks for a name', async ({ page }) => {
    const name = uniqueName('Fresh');
    await openExplorer(page, '/x/view-explorer');
    await expect(tabs(page).first()).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('n');
    await page.keyboard.type('abc');
    await expect(addFilter(page)).toHaveValue('abc');
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', 'temp');

    await page.keyboard.press('Meta+s');
    await expect(page.getByTestId('vx-name-card')).toBeVisible();
    // A view with nothing in it yet is offered a name, and the card says it has no filters.
    await expect(page.getByRole('textbox', { name: 'Name for the new view' })).toHaveValue('All units copy');
    await expect(page.getByTestId('vx-name-card-unfiltered')).toHaveText('It has no filters yet, so it shows every unit.');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Still a temporary view. Nothing was shared.')).toBeVisible();
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', 'temp');
    expect(await viewsNamed(name)).toHaveLength(0);

    await activeTab(page).dblclick();
    const input = page.getByRole('textbox', { name: 'Name for the new view' });
    await input.fill(name);
    await input.press('Enter');
    await expect(page.getByText(`Saved “${name}” in confighub-system.`)).toBeVisible();
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', 'saved');
    expect(await viewsNamed(name)).toHaveLength(1);

    // Saved views are pinned: the tab stays after a reload with no link.
    await openExplorer(page, '/x/view-explorer');
    await expect(tabNamed(page, name)).toBeVisible();
    await cleanUp(name);
  });

  test('Save as new makes a view with its own Filter and leaves the source as saved', async ({ page }) => {
    const source = uniqueName('Source');
    const copy = uniqueName('Copy');
    const view = await seed.createView({ name: source });
    const before = await readView(view.spaceId, view.viewId);
    const def = draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.tier', ['api'])]);

    for (let i = 0; i < 2; i++) {
      await openExplorer(page, draftUrl(view.viewId, def));
      await saveActions(page).getByRole('button', { name: 'Save as new' }).click();
      const input = page.getByRole('textbox', { name: 'Name for the new view' });
      await input.fill(copy);
      await page.getByTestId('vx-name-card').getByRole('button', { name: 'Save view' }).click();
      await expect(page.getByText(`Saved “${copy}” in confighub-system.`)).toBeVisible();
      await expect(tabNamed(page, source)).not.toHaveAttribute('data-dirty', 'true');
    }

    const copies = await viewsNamed(copy);
    expect(copies).toHaveLength(2);
    const filterIds = new Set(copies.map((c) => c.View.FilterID));
    expect(filterIds.size, 'each copy has its own Filter').toBe(2);
    expect(filterIds.has(view.filterId)).toBe(false);
    for (const c of copies) expect(c.Filter?.Where).toContain("Labels.tier = 'api'");

    const after = await readView(view.spaceId, view.viewId);
    expect(after.Filter.Where).toBe(before.Filter.Where);
    await cleanUp(copy);
    await cleanUp(source);
  });

  test('renaming takes a double-click or the menu; one click never renames', async ({ page }) => {
    const name = uniqueName('Rename');
    const renamed = uniqueName('Renamed');
    const view = await seed.createView({ name });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    const tab = tabNamed(page, name);
    await tab.click();
    await expect(tab.getByRole('textbox')).toHaveCount(0);

    await tab.dblclick();
    const input = page.getByRole('textbox', { name: 'New name for the view' });
    await input.fill(renamed);
    await input.press('Enter');
    await expect(page.getByText(`Renamed to “${renamed}”.`)).toBeVisible();
    expect((await readView(view.spaceId, view.viewId)).View.DisplayName).toBe(renamed);
    await cleanUp(renamed);
  });

  test('unpinning takes the tab away, and pinning keeps it across reloads', async ({ page }) => {
    const name = uniqueName('Pin');
    const view = await seed.createView({ name });
    // A fresh browser pins the newest views; other runs may have added newer ones, so pin it first when needed.
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    if (await pinButton(page, name).count()) await pinButton(page, name).click();
    await optionsButton(page, name).click();
    await page.getByRole('menuitem', { name: 'Unpin from your tabs' }).click();
    await expectOverlaysGone(page);
    await openExplorer(page, '/x/view-explorer');
    await expect(tabs(page).first()).toBeVisible();
    await expect(tabNamed(page, name)).toHaveCount(0);

    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await pinButton(page, name).click();
    await openExplorer(page, '/x/view-explorer');
    await expect(tabNamed(page, name)).toBeVisible();
    await cleanUp(name);
  });

  test('views another page owns never appear', async ({ page }) => {
    const name = uniqueName('Owned');
    const view = await seed.createView({ name, annotations: { 'ui.confighub.io/view-kind': 'component-grouping' } });
    // A view of the explorer's own, so the list is known to be loaded (a fresh organization has no other).
    const visible = uniqueName('Shown');
    await seed.createView({ name: visible });
    await openExplorer(page, '/x/view-explorer');
    await page.getByTestId('vx-more-views').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: visible })).toHaveCount(1);
    await expect(page.getByRole('option').filter({ hasText: name })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(page.getByText('The view in the link no longer exists, or you cannot see it.')).toBeVisible();
    await expect(tabNamed(page, name)).toHaveCount(0);
    await cleanUp(name);
    await cleanUp(visible);
  });

  test('the address of a draft opens the same draft in another browser', async ({ page, browser }) => {
    const name = uniqueName('Link');
    const view = await seed.createView({ name });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['payments'])])));
    await expect(rows(page)).toHaveCount(1);
    const link = page.url();

    const other = await newAuthorizedContext(browser);
    const otherPage = await other.newPage();
    await openExplorer(otherPage, link);
    await expect(tabNamed(otherPage, name)).toHaveAttribute('data-dirty', 'true');
    await expect(rows(otherPage)).toHaveCount(1);
    await other.close();
    await cleanUp(name);
  });

  test('deleting a view deletes its Filter only when no other view uses it', async ({ page }) => {
    const first = uniqueName('Shared A');
    const second = uniqueName('Shared B');
    const a = await seed.createView({ name: first });
    const b = await seed.createView({ name: second, filterId: a.filterId });

    for (const [view, name] of [[a, first], [b, second]] as const) {
      await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
      await optionsButton(page, name).click();
      await page.getByRole('menuitem', { name: 'Delete view' }).click();
      await page.getByRole('dialog').getByRole('button', { name: /delete/i }).click();
      await expect(page.getByText(`Deleted “${name}”.`)).toBeVisible();
      await expect(tabNamed(page, name)).toHaveCount(0);
      const filter = await hubApi.get(`/api/space/${seed.spaceId}/filter/${a.filterId}`);
      expect(filter.status(), view === a ? 'still used by the other view' : 'no view uses it').toBe(view === a ? 200 : 404);
    }
  });

  test('a data-path column shows the server value, and a dash outside the saved filter', async ({ page }) => {
    const name = uniqueName('Replicas');
    const view = await seed.createView({
      name,
      where: `Space.Slug = '${seed.spaceSlug}' AND Slug = 'alpha'`,
      columns: [
        { Name: 'Slug' },
        { Name: 'Replicas', ColumnType: 'DataPath', DataType: 'int', ColumnSource: { DataPath: { Path: 'spec.replicas', WhereResource: "ResourceType = 'apps/v1/Deployment'" } } },
      ],
    });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug])], { columns: [{ name: 'Slug' }, { name: 'Replicas' }] })));
    await expect(rows(page)).toHaveCount(3);
    const cell = (slug: string) => rows(page).filter({ hasText: slug }).locator('[data-column="Replicas"]');
    await expect(cell('alpha')).toHaveText('2');
    await expect(cell('beta')).toHaveText('—');
    await cell('beta').getByText('—').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Save the view to compute this column');
    await cleanUp(name);
  });

  test('a reload with a temporary tab open keeps one temporary tab', async ({ page }) => {
    await openExplorer(page, '/x/view-explorer');
    await expect(tabs(page).first()).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('n');
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', 'temp');
    await reloadExplorer(page);
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', 'temp');
    await expect(page.locator('[data-testid="vx-tab"][data-tab-kind="temp"]')).toHaveCount(1);
  });

  test('a change made while a save is in flight stays unsaved', async ({ page }) => {
    const name = uniqueName('Slow');
    const view = await seed.createView({ name });
    await page.route(`**/api/space/*/view/${view.viewId}*`, async (route) => {
      if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await saveActions(page).getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByText(`Saved “${name}” for everyone.`)).toBeVisible();
    // What was sent is saved; the discard made after it is a change of its own.
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    await saveActions(page).getByRole('button', { name: /change/ }).click();
    await expect(page.getByTestId('vx-changes-list')).toContainText('Removed filter: app is checkout');
    expect((await readView(view.spaceId, view.viewId)).Filter.Where).toContain("Labels.app = 'checkout'");
  });

  test('a view someone else changed is not overwritten without asking', async ({ page }) => {
    const name = uniqueName('Conflict');
    const view = await seed.createView({ name });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    const other = await hubApi.patch(`/api/space/${view.spaceId}/view/${view.viewId}`, {
      data: { Annotations: { 'test.confighub.io/touched': 'yes' } },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(other.ok(), await other.text()).toBeTruthy();

    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    const conflict = page.getByTestId('vx-save-conflict');
    await expect(conflict).toContainText('Changed by someone else since you opened it');
    expect((await readView(view.spaceId, view.viewId)).Filter.Where).not.toContain('Labels.app');

    await conflict.getByRole('button', { name: 'Overwrite' }).click();
    await expect(page.getByText(`Saved “${name}” for everyone.`)).toBeVisible();
    expect((await readView(view.spaceId, view.viewId)).Filter.Where).toContain("Labels.app = 'checkout'");
  });

  test('a draft kept from an earlier visit is not saved over a later change without asking', async ({ page }) => {
    const name = uniqueName('Kept');
    const view = await seed.createView({ name });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');

    // Someone else changes the view; the next visit loads the new version, and the kept draft.
    const other = await hubApi.patch(`/api/space/${view.spaceId}/view/${view.viewId}`, {
      data: { Annotations: { 'test.confighub.io/touched': 'yes' } },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(other.ok(), await other.text()).toBeTruthy();
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');

    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('vx-save-conflict')).toContainText('Changed by someone else since you opened it');
    expect((await readView(view.spaceId, view.viewId)).Filter.Where).not.toContain('Labels.app');
    await cleanUp(name);
  });

  test('a view opened after the list reloads saves without a false conflict', async ({ page }) => {
    const name = uniqueName('Later');
    const other = uniqueName('Other');
    const later = await seed.createView({ name });
    const otherView = await seed.createView({ name: other });
    // Take the view out of the strip, so it opens later from "more".
    await openExplorer(page, `/x/view-explorer?view=${later.viewId}`);
    // Pinned only when it is among the newest views; other runs may have added newer ones.
    await optionsButton(page, name).click();
    const unpin = page.getByRole('menuitem', { name: 'Unpin from your tabs' });
    await expect(page.getByRole('menuitem', { name: /^(Unpin from|Pin to) your tabs$/ })).toBeVisible();
    if (await unpin.count()) await unpin.click();
    else await page.keyboard.press('Escape');
    await expectOverlaysGone(page);
    await openExplorer(page, draftUrl(otherView.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await expect(tabNamed(page, other)).toHaveAttribute('data-dirty', 'true');
    await expect(tabNamed(page, name)).toHaveCount(0);

    // A newer version arrives, and a save elsewhere reloads the list.
    const touched = await hubApi.patch(`/api/space/${later.spaceId}/view/${later.viewId}`, {
      data: { Annotations: { 'test.confighub.io/touched': 'yes' } },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(touched.ok(), await touched.text()).toBeTruthy();
    const listed = page.waitForResponse((r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith('/api/view'));
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`Saved “${other}” for everyone.`)).toBeVisible();
    await listed;

    await page.getByTestId('vx-more-views').click();
    await page.getByRole('option').filter({ hasText: name }).first().click();
    await expect(activeTab(page)).toContainText(name);
    await page.keyboard.press('b');
    await expect(activeTab(page)).toHaveAttribute('data-dirty', 'true');
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`Saved “${name}” for everyone.`)).toBeVisible();
    await expect(page.getByTestId('vx-save-conflict')).toHaveCount(0);
    await cleanUp(name);
    await cleanUp(other);
  });

  test('a second save in one session is not taken for someone else’s change', async ({ page }) => {
    const name = uniqueName('Twice');
    const view = await seed.createView({ name });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`Saved “${name}” for everyone.`)).toBeVisible();
    await expect(saveActions(page)).toHaveCount(0);

    await page.keyboard.press('b');
    await expect(activeTab(page)).toHaveAttribute('data-dirty', 'true');
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(saveActions(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-save-conflict')).toHaveCount(0);
    expect((await readView(view.spaceId, view.viewId)).View.Annotations['ui.confighub.io/layout']).toBe('board');
    await cleanUp(name);
  });

  test('a rename does not hide a change someone else made first', async ({ page }) => {
    const name = uniqueName('Rename seen');
    const view = await seed.createView({ name });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(rows(page).first()).toBeVisible();
    const other = await hubApi.patch(`/api/space/${view.spaceId}/view/${view.viewId}`, {
      data: { Annotations: { 'test.confighub.io/touched': 'yes' } },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(other.ok(), await other.text()).toBeTruthy();

    const renamed = `${name} renamed`;
    await tabNamed(page, name).dblclick();
    await page.getByRole('textbox', { name: 'New name for the view' }).fill(renamed);
    await page.keyboard.press('Enter');
    await expect(page.getByText(`Renamed to “${renamed}”.`)).toBeVisible();

    await page.keyboard.press('b');
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('vx-save-conflict')).toContainText('Changed by someone else since you opened it');
    await cleanUp(renamed);
  });

  test('a save whose View write fails puts the Filter back and says so', async ({ page }) => {
    const name = uniqueName('Half');
    const view = await seed.createView({ name });
    const whereBefore = (await readView(view.spaceId, view.viewId)).Filter.Where;
    await page.route(
      (url) => new RegExp(`/api/space/${view.spaceId}/view/${view.viewId}$`).test(url.pathname),
      (route) => (route.request().method() === 'PATCH' ? route.fulfill({ status: 500, json: { message: 'The server failed.' } }) : route.fallback()),
    );
    // The failed write is the point of this test; the console error it logs is expected.
    page.removeAllListeners('console');
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Nothing was changed\./)).toBeVisible();
    await expect(activeTab(page)).toHaveAttribute('data-dirty', 'true');
    expect((await readView(view.spaceId, view.viewId)).Filter.Where).toBe(whereBefore);
    await cleanUp(name);
  });

  test('a shared draft link never replaces this browser’s own draft of the view', async ({ page }) => {
    const name = uniqueName('Two drafts');
    const view = await seed.createView({ name });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');

    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['payments'])])));
    await expect(page.getByText(/opened in a new tab, so your own unsaved changes/)).toBeVisible();
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', 'temp');
    await expect(rows(page)).toHaveCount(1);
    await tabNamed(page, name).click();
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    await expect(rows(page)).toHaveCount(2);
    await cleanUp(name);
  });

  test('a draft link carries its version: the receiver is asked before overwriting a later change', async ({ page }) => {
    const name = uniqueName('Link base');
    const view = await seed.createView({ name });
    const base = (await readView(view.spaceId, view.viewId)).View.UpdatedAt as string;
    const other = await hubApi.patch(`/api/space/${view.spaceId}/view/${view.viewId}`, {
      data: { Annotations: { 'test.confighub.io/touched': 'yes' } },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(other.ok(), await other.text()).toBeTruthy();
    const def = draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])]);
    await openExplorer(page, `${draftUrl(view.viewId, def)}&b=${encodeURIComponent(base)}`);
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('vx-save-conflict')).toContainText('Changed by someone else since you opened it');
    // And this page's own address carries it on.
    await expect(page).toHaveURL(/[?&]b=/);
    await cleanUp(name);
  });

  test('two browser tabs keep each other’s drafts and temporary tabs', async ({ page }) => {
    const name = uniqueName('Two pages');
    const view = await seed.createView({ name });
    const second = await page.context().newPage();
    await openExplorer(second, '/x/view-explorer');
    await expect(second.getByTestId('vx-row').first()).toBeVisible();

    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');

    // The other page, loaded before that draft, now writes its own change.
    await second.getByRole('button', { name: 'New view' }).click();
    await expect(second.locator('[data-testid="vx-tab"][data-tab-kind="temp"]')).toHaveCount(1);
    await second.close();

    await openExplorer(page, '/x/view-explorer');
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    await expect(page.locator('[data-testid="vx-tab"][data-tab-kind="temp"]')).toHaveCount(1);
    await cleanUp(name);
  });

  test('a saved view switched to another kind of row offers only Save as new', async ({ page }) => {
    const name = uniqueName('Entity');
    const view = await seed.createView({ name });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(rows(page).first()).toBeVisible();
    await page.getByTestId('vx-entity').click();
    await page.getByRole('menuitem', { name: 'Spaces' }).click();
    const save = saveActions(page).getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await expect(saveActions(page).getByRole('button', { name: 'Save as new' })).toBeEnabled();
    await page.getByTestId('vx-save-button-wrap').hover();
    await expect(page.getByRole('tooltip')).toContainText('Use Save as new');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText(/always lists the same kind of row/).first()).toBeVisible();
    expect((await readView(view.spaceId, view.viewId)).View.Of ?? 'Unit').toBe('Unit');
    await cleanUp(name);
  });

  test('⌘S in a dialog does not open the browser’s Save page', async ({ page }) => {
    const name = uniqueName('Modal save');
    const view = await seed.createView({ name });
    // Opened by its address: with other runs adding newer views, it may not be among the default pins.
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await optionsButton(page, name).click();
    await page.getByRole('menuitem', { name: 'Delete view' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // A listener added after the page's own one sees whether the page claimed the key.
    await page.evaluate(() => {
      const w = window as unknown as { vxPrevented?: boolean };
      window.addEventListener('keydown', (e) => {
        if (e.key === 's') w.vxPrevented = e.defaultPrevented;
      });
    });
    await page.keyboard.press('ControlOrMeta+s');
    expect(await page.evaluate(() => (window as unknown as { vxPrevented?: boolean }).vxPrevented)).toBe(true);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expectOverlaysGone(page);
    await cleanUp(name);
  });

  test('Undo on the Discard toast restores the tab it came from, even from another tab', async ({ page }) => {
    const name = uniqueName('Undo origin');
    const view = await seed.createView({ name });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    if (await pinButton(page, name).count()) await pinButton(page, name).click();

    await saveActions(page).getByRole('button', { name: 'Discard' }).click();
    await expect(tabNamed(page, name)).not.toHaveAttribute('data-dirty', 'true');
    await tabNamed(page, 'All units').click();
    await expect(activeTab(page)).toContainText('All units');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();

    await expect(activeTab(page)).toContainText('All units');
    await expect(activeTab(page)).not.toHaveAttribute('data-dirty', 'true');
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    await cleanUp(name);
  });

  test('a link naming a temporary tab id this browser uses for something else opens in a tab of its own', async ({ page }) => {
    await openExplorer(page, '/x/view-explorer');
    await expect(tabs(page).first()).toBeVisible();
    await page.getByRole('button', { name: 'New view' }).click();
    const local = page.locator('[data-testid="vx-tab"][data-tab-kind="temp"]');
    await expect(local).toHaveCount(1);
    const localId = await local.getAttribute('data-tab-id');

    const def = draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])]);
    await openExplorer(page, `/x/view-explorer?view=new&t=${localId}&d=${encodeDraftParam(def)}`);
    await expect(local).toHaveCount(2);
    await expect(activeTab(page)).not.toHaveAttribute('data-tab-id', localId ?? '');
    await expect(rows(page)).toHaveCount(2);
  });

  test('after a failed save puts the Filter back, the next save is not taken for someone else’s change', async ({ page }) => {
    const name = uniqueName('Put back');
    const view = await seed.createView({ name });
    let failNext = true;
    await page.route(
      (url) => new RegExp(`/api/space/${view.spaceId}/view/${view.viewId}$`).test(url.pathname),
      (route) => {
        if (route.request().method() !== 'PATCH' || !failNext) return route.fallback();
        failNext = false;
        return route.fulfill({ status: 500, json: { message: 'The server failed.' } });
      },
    );
    page.removeAllListeners('console');
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Nothing was changed\./)).toBeVisible();

    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`Saved “${name}” for everyone.`)).toBeVisible();
    await expect(page.getByTestId('vx-save-conflict')).toHaveCount(0);
    expect((await readView(view.spaceId, view.viewId)).Filter.Where).toContain("Labels.app = 'checkout'");
    await cleanUp(name);
  });

  test('a save whose read-back fails still says it saved, and the next save goes through', async ({ page }) => {
    const name = uniqueName('Read back');
    const view = await seed.createView({ name });
    let written = false;
    let failed = false;
    await page.route(
      (url) => new RegExp(`/api/space/${view.spaceId}/view/${view.viewId}$`).test(url.pathname),
      (route) => {
        const method = route.request().method();
        if (method === 'PATCH') written = true;
        if (method === 'GET' && written && !failed) {
          failed = true;
          return route.fulfill({ status: 500, json: { message: 'The server failed.' } });
        }
        return route.fallback();
      },
    );
    page.removeAllListeners('console');
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`Saved “${name}” for everyone.`)).toBeVisible();
    expect(failed).toBe(true);
    await expect(page.getByText('The view could not be saved.')).toHaveCount(0);

    await page.keyboard.press('b');
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(saveActions(page)).toHaveCount(0);
    await expect(page.getByTestId('vx-save-conflict')).toHaveCount(0);
    expect((await readView(view.spaceId, view.viewId)).View.Annotations['ui.confighub.io/layout']).toBe('board');
    await cleanUp(name);
  });

  test('a stale copy in another browser tab never overwrites a newer draft', async ({ page }) => {
    const name = uniqueName('Stale copy');
    const view = await seed.createView({ name });
    await openExplorer(page, draftUrl(view.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])])));
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');

    // The other page loads the same draft, then sits on it.
    const second = await page.context().newPage();
    await openExplorer(second, '/x/view-explorer');
    await expect(second.getByTestId('vx-tab').filter({ hasText: name })).toHaveAttribute('data-dirty', 'true');

    // This page makes the draft newer.
    await page.keyboard.press('b');
    await expect(page.getByTestId('vx-board')).toBeVisible();

    // An unrelated change on the other page must not write its older copy back.
    await second.getByRole('button', { name: 'New view' }).click();
    await expect(second.locator('[data-testid="vx-tab"][data-tab-kind="temp"]')).toHaveCount(1);
    await second.close();

    await openExplorer(page, '/x/view-explorer');
    await tabNamed(page, name).click();
    await expect(page.getByTestId('vx-board')).toBeVisible();
    await cleanUp(name);
  });

  test('a view left within seconds of its Discard can still be undone', async ({ page }) => {
    const name = uniqueName('Undo unpinned');
    const view = await seed.createView({ name });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(rows(page).first()).toBeVisible();
    if (!(await pinButton(page, name).count())) {
      await optionsButton(page, name).click();
      await page.getByRole('menuitem', { name: 'Unpin from your tabs' }).click();
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expectOverlaysGone(page);
    }
    await page.getByTestId('vx-layout-board').click();
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    await saveActions(page).getByRole('button', { name: 'Discard' }).click();
    await tabNamed(page, 'All units').click();
    await expect(activeTab(page)).toContainText('All units');

    await page.locator('.MuiSnackbar-root').getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(tabNamed(page, name)).toHaveAttribute('data-dirty', 'true');
    await cleanUp(name);
  });

  test('a draft link carries its Filter’s version too', async ({ page }) => {
    const name = uniqueName('Filter base');
    const view = await seed.createView({ name });
    const saved = await readView(view.spaceId, view.viewId);
    const filterBase = saved.Filter.UpdatedAt as string;
    const other = await hubApi.patch(`/api/space/${view.spaceId}/filter/${view.filterId}`, {
      data: { DisplayName: 'Changed by a colleague' },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(other.ok(), await other.text()).toBeTruthy();
    const def = draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.app', ['checkout'])]);
    const base = encodeURIComponent(saved.View.UpdatedAt as string);
    await openExplorer(page, `${draftUrl(view.viewId, def)}&b=${base}&fb=${encodeURIComponent(filterBase)}`);
    await expect(page).toHaveURL(/[?&]fb=/);
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('vx-save-conflict')).toContainText('Changed by someone else since you opened it');
    await cleanUp(name);
  });

  test('two browser tabs that fork All units make different tabs, and both are kept', async ({ page }) => {
    const temps = (p: Page) => p.locator('[data-testid="vx-tab"][data-tab-kind="temp"]');
    const second = await page.context().newPage();
    await openExplorer(page, '/x/view-explorer');
    await openExplorer(second, '/x/view-explorer');
    for (const p of [page, second]) {
      await expect(p.getByTestId('vx-row').first()).toBeVisible();
      // A change on All units forks it into a temporary tab.
      await p.getByTestId('vx-layout-board').click();
      await expect(temps(p)).toHaveCount(1);
    }
    const first = await temps(page).getAttribute('data-tab-id');
    const other = await temps(second).getAttribute('data-tab-id');
    expect(first).not.toBe(other);
    await second.close();

    await openExplorer(page, '/x/view-explorer');
    await expect(temps(page)).toHaveCount(2);
  });

  test('saving a view that shares its Filter gives it a Filter of its own', async ({ page }) => {
    const first = uniqueName('Share A');
    const second = uniqueName('Share B');
    const a = await seed.createView({ name: first });
    const b = await seed.createView({ name: second, filterId: a.filterId });
    const sharedWhere = (await readView(b.spaceId, b.viewId)).Filter.Where;

    await openExplorer(page, draftUrl(a.viewId, draftOf([fieldLens('l1', 'Space', [seed.spaceSlug]), fieldLens('l2', 'Labels.tier', ['api'])])));
    await saveActions(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(`Saved “${first}” for everyone.`)).toBeVisible();

    const savedA = await readView(a.spaceId, a.viewId);
    const savedB = await readView(b.spaceId, b.viewId);
    expect(savedA.View.FilterID).not.toBe(a.filterId);
    expect(savedA.Filter.Where).toContain("Labels.tier = 'api'");
    expect(savedB.View.FilterID).toBe(a.filterId);
    expect(savedB.Filter.Where).toBe(sharedWhere);
  });

  test('a delete whose Filter clean-up fails still closes the tab, with a warning', async ({ page }) => {
    const name = uniqueName('Half');
    const view = await seed.createView({ name });
    await page.route(`**/api/space/*/filter/${view.filterId}*`, (route) =>
      route.request().method() === 'DELETE' ? route.fulfill({ status: 500, body: '{"message":"broken"}' }) : route.continue(),
    );
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await optionsButton(page, name).click();
    await page.getByRole('menuitem', { name: 'Delete view' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /delete/i }).click();
    await expect(page.getByText(`Deleted “${name}”. Its filter could not be removed and is left unused.`)).toBeVisible();
    await expect(tabNamed(page, name)).toHaveCount(0);
    expect((await hubApi.get(`/api/space/${view.spaceId}/view/${view.viewId}`)).status()).toBe(404);
    // The browser's own failed request is expected here.
    problems = problems.filter((p) => !p.includes('500'));
  });

  test('⌘S and the Save button pressed together save once', async ({ page }) => {
    const name = uniqueName('Once');
    let filterCreates = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/filter$/.test(new URL(r.url()).pathname)) filterCreates++;
    });
    await page.route('**/api/space/*/filter?*', async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await openExplorer(page, '/x/view-explorer');
    await expect(tabs(page).first()).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('n');
    await expect(activeTab(page)).toHaveAttribute('data-tab-kind', 'temp');
    await page.keyboard.press('Meta+s');
    await page.getByRole('textbox', { name: 'Name for the new view' }).fill(name);
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Name for the new view"]');
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      document.querySelector<HTMLButtonElement>('[data-testid="vx-name-card"] button')?.click();
    });
    await expect(page.getByText(`Saved “${name}” in confighub-system.`)).toBeVisible();
    expect(filterCreates).toBe(1);
    expect(await viewsNamed(name)).toHaveLength(1);
    await cleanUp(name);
  });

  test('the tab strip is a tablist of tabs, with arrow keys and a labelled panel', async ({ page }) => {
    const name = uniqueName('Keys');
    const view = await seed.createView({ name });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    // The tablist owns its tabs by id; the Pin, Options and Close buttons sit outside it.
    const list = page.getByRole('tablist', { name: 'Views' });
    await expect(list).toBeAttached();
    await expect(page.getByRole('tab', { name: 'All units' })).toBeVisible();
    await expect(page.getByRole('tab').getByRole('button')).toHaveCount(0);
    const owned = ((await list.getAttribute('aria-owns')) ?? '').split(' ').filter(Boolean);
    expect(owned.length).toBe(await page.getByRole('tab').count());
    for (const id of owned) await expect(page.locator(`[id="${id}"]`)).toHaveAttribute('role', 'tab');
    const snapshot = await list.ariaSnapshot();
    expect(snapshot).toContain('tab "All units"');
    expect(snapshot).not.toContain('button');

    const selected = page.getByRole('tab', { selected: true });
    await expect(selected).toHaveAttribute('tabindex', '0');
    await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
    const panelId = await selected.getAttribute('aria-controls');
    await expect(page.locator(`#${panelId}`)).toHaveAttribute('role', 'tabpanel');

    await selected.focus();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'All units' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[role="tab"]:focus')).not.toHaveText('All units');
    await page.keyboard.press('Enter');
    await expect(page.locator('[role="tab"]:focus')).toHaveAttribute('aria-selected', 'true');

    // While a name is edited, the panel's label still names a tab.
    await tabNamed(page, name).click();
    await tabNamed(page, name).dblclick();
    await expect(page.getByRole('textbox', { name: 'New name for the view' })).toBeFocused();
    const labelledBy = await page.getByRole('tabpanel').getAttribute('aria-labelledby');
    await expect(page.locator(`[id="${labelledBy}"]`)).toHaveAttribute('role', 'tab');
    await page.keyboard.press('Escape');
    await cleanUp(name);
  });

  test('page shortcuts stand aside while a modal is open', async ({ page }) => {
    const name = uniqueName('Modal keys');
    const view = await seed.createView({ name });
    // Opened by its address: with other runs adding newer views, it may not be among the default pins.
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(rows(page).first()).toBeVisible();
    const count = await tabs(page).count();

    await optionsButton(page, name).click();
    await page.getByRole('menuitem', { name: 'Delete view' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('b');
    await page.keyboard.press('n');
    await expect(page.getByTestId('vx-board')).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(count);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expectOverlaysGone(page);

    // The view switcher too, even with focus away from its search field.
    await page.getByTestId('vx-more-views').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('option').first().focus();
    await page.keyboard.press('b');
    await expect(page.getByTestId('vx-board')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await page.locator('body').click({ position: { x: 5, y: 600 } });
    await page.keyboard.press('b');
    await expect(page.getByTestId('vx-board')).toBeVisible();
    await cleanUp(name);
  });

  test('the save actions never look faded while they arrive', async ({ page }) => {
    const name = uniqueName('Arrive');
    const view = await seed.createView({ name });
    await openExplorer(page, `/x/view-explorer?view=${view.viewId}`);
    await expect(rows(page).first()).toBeVisible();
    // Sample the Save button's opacity every frame from before the first change until it has settled.
    await page.evaluate(() => {
      const w = window as unknown as { vxOpacity: number[] };
      w.vxOpacity = [];
      const t0 = performance.now();
      const loop = () => {
        const actions = document.querySelector('[data-testid="vx-save-actions"]');
        if (actions) for (const el of actions.querySelectorAll<HTMLElement>(':scope > *')) w.vxOpacity.push(Number(getComputedStyle(el).opacity));
        if (performance.now() - t0 < 1500) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.locator('[data-testid="vx-row"] [data-column="Labels.app"] [role="button"]').first().click();
    await page.getByRole('menuitem', { name: /Only this/ }).click();
    await expect(saveActions(page)).toBeVisible();
    await page.waitForTimeout(1600);
    const opacities = await page.evaluate(() => (window as unknown as { vxOpacity: number[] }).vxOpacity);
    expect(opacities.length).toBeGreaterThan(0);
    expect(Math.min(...opacities)).toBe(1);
    await cleanUp(name);
  });

  test('a failed copy says so instead of "Link copied"', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } });
    });
    await openExplorer(page, '/x/view-explorer');
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.getByText('The link could not be copied. Copy it from the address bar instead.')).toBeVisible();
    await expect(page.getByText(/^Link copied/)).toHaveCount(0);
  });

  test('keys typed right after N are kept on a narrow screen too', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openExplorer(page, '/x/view-explorer');
    await expect(tabs(page).first()).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('n');
    await page.keyboard.type('abc');
    await expect(addFilter(page)).toHaveValue('abc');
  });
});
