// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Unit list's grouping panel (`GroupNavPanel`): a group click filters the
// grid and writes `?group=`, expand and collapse, the keys of the tree, and
// that the panel stays fast with thousands of Spaces.
//
// The Unit list is served from the test, not the server, so the tree has a
// known shape whatever else the org holds, and the scale test can have the
// size of a large org (issue: leaving the page or filtering it froze the
// browser for tens of seconds with ~2,400 Spaces and ~6,300 Units).
import type { Page } from '@playwright/test';

import { UnitListPage } from './fixtures/unit-list-page';
import { expect, test } from './fixtures/test';
import { applyCpuThrottling } from './fixtures/slow-mode';

interface MockUnit {
  space: string;
  slug: string;
  tier?: string;
}

const ORG = '00000000-0000-4000-8000-000000000000';
const NOW = '2026-01-01T00:00:00Z';

// Booting the app and drawing a tree is slow on a CI runner.
const READY = { timeout: 45000 };

const uuid = (kind: 1 | 2, n: number) => `00000000-0000-4000-800${kind}-${String(n).padStart(12, '0')}`;

/** The Unit list response for `units`, one Space per distinct `space`. */
function listed(units: MockUnit[]) {
  const spaceIds = new Map<string, string>();
  return units.map((u, i) => {
    let spaceId = spaceIds.get(u.space);
    if (!spaceId) {
      spaceId = uuid(1, spaceIds.size);
      spaceIds.set(u.space, spaceId);
    }
    return {
      Space: { EntityType: 'Space', Version: 1, Slug: u.space, SpaceID: spaceId, OrganizationID: ORG },
      Unit: {
        EntityType: 'Unit',
        Version: 1,
        Slug: u.slug,
        SpaceID: spaceId,
        UnitID: uuid(2, i),
        OrganizationID: ORG,
        ToolchainType: 'Kubernetes/YAML',
        Labels: u.tier ? { tier: u.tier } : {},
        HeadRevisionNum: 1,
        CreatedAt: NOW,
        UpdatedAt: NOW,
      },
    };
  });
}

/**
 * Serves every Unit list request with `all`, or with `filtered` when the
 * request has a `where` filter.
 */
async function serveUnits(page: Page, all: MockUnit[], filtered: MockUnit[] = all) {
  const allBody = listed(all);
  const filteredBody = listed(filtered);
  await page.route(
    (url) => url.pathname.endsWith('/api/unit'),
    (route) => {
      const where = new URL(route.request().url()).searchParams.get('where');
      return route.fulfill({ json: where ? filteredBody : allBody });
    },
  );
}

const tree = (page: Page) => page.getByRole('tree', { name: 'Groups' });

/** The tree row whose label is exactly `label`. */
const treeRow = (page: Page, label: string) =>
  tree(page).getByRole('treeitem').filter({ has: page.getByText(label, { exact: true }) });

const gridCell = (page: Page, slug: string) => page.getByRole('gridcell', { name: slug, exact: true });

/** The tree's keyboard focus is on the row labelled `label`. */
async function expectFocused(page: Page, label: string) {
  const id = await treeRow(page, label).getAttribute('id');
  expect(id).toBeTruthy();
  await expect(tree(page)).toHaveAttribute('aria-activedescendant', id as string);
}

/** A client-side navigation, as the app's own links do: the current page unmounts. */
const navigateInApp = (page: Page, path: string) =>
  page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

/**
 * Counts, from now on, each painted frame in which the tree is on the page
 * with no rows. A tree that mounts without its scroll element draws nothing
 * until some later render repairs it, so waiting for rows alone can pass.
 */
const watchEmptyTreeFrames = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { emptyTreeFrames: number };
    w.emptyTreeFrames = 0;
    const tick = () => {
      const t = document.querySelector('[role="tree"]');
      if (t && !t.querySelector('[role="treeitem"]')) w.emptyTreeFrames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const emptyTreeFrames = (page: Page) =>
  page.evaluate(() => (window as unknown as { emptyTreeFrames: number }).emptyTreeFrames);

/** Resolves once the page has painted a frame, so not before a freeze is over. */
const nextFrame = (page: Page) =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

const SMALL: MockUnit[] = [
  { space: 'alpha', slug: 'alpha-web', tier: 'web' },
  { space: 'alpha', slug: 'alpha-db', tier: 'db' },
  { space: 'beta', slug: 'beta-cache', tier: 'cache' },
  { space: 'gamma', slug: 'gamma-queue', tier: 'queue' },
];

test.describe('Unit list grouping panel', () => {
  test.use({ storageState: 'authentication.json' });

  test.beforeEach(async ({ page }) => {
    // A saved tab or grouping from another spec must not change the tree.
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('group-nav-spec-cleared')) {
          localStorage.clear();
          sessionStorage.setItem('group-nav-spec-cleared', '1');
        }
      } catch {
        // Storage can be unavailable; the defaults are then in effect anyway.
      }
    });
  });

  test('a group click filters the grid and writes ?group=; All clears it', async ({ page }) => {
    await serveUnits(page, SMALL);
    await new UnitListPage(page).goto();

    await expect(treeRow(page, 'All')).toContainText('4', READY);
    await expect(treeRow(page, 'alpha')).toContainText('2');
    await expect(treeRow(page, 'All')).toHaveAttribute('aria-selected', 'true', READY);
    await expect(gridCell(page, 'alpha-web')).toBeVisible();

    await treeRow(page, 'beta').click();
    await expect(page).toHaveURL(/[?&]group=beta(&|$)/);
    await expect(treeRow(page, 'beta')).toHaveAttribute('aria-selected', 'true', READY);
    await expect(treeRow(page, 'All')).toHaveAttribute('aria-selected', 'false');
    await expect(gridCell(page, 'beta-cache')).toBeVisible();
    await expect(gridCell(page, 'alpha-web')).toHaveCount(0);

    await treeRow(page, 'All').click();
    await expect(page).not.toHaveURL(/[?&]group=/);
    await expect(gridCell(page, 'alpha-web')).toBeVisible();
  });

  test('collapsing the panel and expanding it again shows the rows', async ({ page }) => {
    await serveUnits(page, SMALL);
    await new UnitListPage(page).goto();
    await expect(treeRow(page, 'alpha')).toBeVisible(READY);

    await page.getByRole('button', { name: 'Collapse grouping panel' }).click();
    await expect(tree(page)).toHaveCount(0, READY);
    await watchEmptyTreeFrames(page);
    await page.getByRole('button', { name: 'Expand grouping panel' }).click();
    await expect(treeRow(page, 'All')).toBeVisible();
    await expect(treeRow(page, 'alpha')).toBeVisible();
    await nextFrame(page);
    expect(await emptyTreeFrames(page)).toBe(0);
  });

  test('coming back to the page with the Units cached shows the rows', async ({ page }) => {
    await serveUnits(page, SMALL);
    await new UnitListPage(page).goto();
    await expect(treeRow(page, 'alpha')).toBeVisible(READY);

    await navigateInApp(page, '/spaces');
    await expect(tree(page)).toHaveCount(0, READY);
    await watchEmptyTreeFrames(page);
    // Back is a client-side navigation: the list mounts with its cached data.
    await page.goBack();
    await expect(page).toHaveURL(/\/units/);
    await expect(treeRow(page, 'All')).toBeVisible();
    await expect(treeRow(page, 'alpha')).toBeVisible();
    await nextFrame(page);
    expect(await emptyTreeFrames(page)).toBe(0);
  });

  test('a deep link with ?group= selects the group and filters the grid', async ({ page }) => {
    await serveUnits(page, SMALL);
    await page.goto('/units?group=gamma');

    await expect(treeRow(page, 'gamma')).toHaveAttribute('aria-selected', 'true', READY);
    await expect(gridCell(page, 'gamma-queue')).toBeVisible();
    await expect(gridCell(page, 'alpha-web')).toHaveCount(0);
    // A second group click replaces the group, keeping the rest of the URL.
    await treeRow(page, 'alpha').click();
    await expect(page).toHaveURL(/[?&]group=alpha(&|$)/);
    await expect(page).not.toHaveURL(/group=gamma/);
  });

  test('two levels: the top level starts expanded; a row click toggles it and selects it', async ({
    page,
  }) => {
    await serveUnits(page, SMALL);
    await page.goto('/units?viewGroupBy=Space%2CLabels.tier');

    const alpha = treeRow(page, 'alpha');
    await expect(alpha).toHaveAttribute('aria-expanded', 'true', READY);
    await expect(alpha).toHaveAttribute('aria-level', '1');
    await expect(treeRow(page, 'db')).toHaveAttribute('aria-level', '2');
    await expect(treeRow(page, 'web')).toBeVisible();
    // A row at the deepest level has nothing to expand.
    await expect(treeRow(page, 'db')).not.toHaveAttribute('aria-expanded', /.*/);
    await expect(treeRow(page, 'db')).toHaveAttribute('aria-setsize', '2');
    await expect(treeRow(page, 'web')).toHaveAttribute('aria-posinset', '2');

    await alpha.click();
    await expect(alpha).toHaveAttribute('aria-expanded', 'false');
    await expect(treeRow(page, 'db')).toHaveCount(0);
    await expect(alpha).toHaveAttribute('aria-selected', 'true', READY);
    await expect(page).toHaveURL(/[?&]group=alpha(&|$)/);

    // Its chevron is part of the row: it toggles too.
    await alpha.locator('svg').first().click();
    await expect(alpha).toHaveAttribute('aria-expanded', 'true');
    await expect(treeRow(page, 'db')).toBeVisible();

    // A second-level click selects the path to it.
    await treeRow(page, 'web').click();
    await expect(page).toHaveURL(/[?&]group=alpha&group=web(&|$)/);
    await expect(gridCell(page, 'alpha-web')).toBeVisible();
    await expect(gridCell(page, 'alpha-db')).toHaveCount(0);
  });

  test('the keys of the tree', async ({ page }) => {
    await serveUnits(page, SMALL);
    await page.goto('/units?viewGroupBy=Space%2CLabels.tier');

    // A click focuses the tree on the clicked row.
    await treeRow(page, 'All').click();
    await expect(tree(page)).toBeFocused();
    await expectFocused(page, 'All');

    await page.keyboard.press('ArrowDown');
    await expectFocused(page, 'alpha');

    // Left collapses an expanded row; Right expands it, then goes to its first child.
    await page.keyboard.press('ArrowLeft');
    await expect(treeRow(page, 'alpha')).toHaveAttribute('aria-expanded', 'false');
    await expectFocused(page, 'alpha');
    await page.keyboard.press('ArrowRight');
    await expect(treeRow(page, 'alpha')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowRight');
    await expectFocused(page, 'db');

    // Left on a row with nothing to collapse goes to its parent.
    await page.keyboard.press('ArrowLeft');
    await expectFocused(page, 'alpha');

    await page.keyboard.press('End');
    await expectFocused(page, 'queue');
    await page.keyboard.press('Home');
    await expectFocused(page, 'All');

    // A letter goes to the next row that starts with it.
    await page.keyboard.press('g');
    await expectFocused(page, 'gamma');

    // Space selects.
    await page.keyboard.press(' ');
    await expect(treeRow(page, 'gamma')).toHaveAttribute('aria-selected', 'true', READY);
    await expect(page).toHaveURL(/[?&]group=gamma(&|$)/);
    await expect(gridCell(page, 'gamma-queue')).toBeVisible();
    await expect(gridCell(page, 'alpha-web')).toHaveCount(0);

    // Enter toggles a row that has children, and leaves the selection.
    await page.keyboard.press('Enter');
    await expect(treeRow(page, 'gamma')).toHaveAttribute('aria-expanded', 'false');
    await expect(treeRow(page, 'gamma')).toHaveAttribute('aria-selected', 'true', READY);

    // * expands every sibling. Up from gamma is beta's child; Left goes to
    // beta, and Left again collapses it.
    await page.keyboard.press('ArrowUp');
    await expectFocused(page, 'cache');
    await page.keyboard.press('ArrowLeft');
    await expectFocused(page, 'beta');
    await page.keyboard.press('ArrowLeft');
    await expect(treeRow(page, 'beta')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('*');
    await expect(treeRow(page, 'beta')).toHaveAttribute('aria-expanded', 'true');
    await expect(treeRow(page, 'gamma')).toHaveAttribute('aria-expanded', 'true');

    // Enter on a row without children selects it.
    await page.keyboard.press('ArrowRight');
    await expectFocused(page, 'cache');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]group=beta&group=cache(&|$)/);
  });

  test.describe('with thousands of Spaces', () => {
    const SPACES = 2500;
    const UNITS = 6300;
    // The freeze this guards against took 40 to 60 seconds. The budget is
    // well under that and well over what a slow CI runner needs.
    const BUDGET_MS = 20000;

    const spaceName = (i: number) => `space-${String(i).padStart(4, '0')}`;
    const many: MockUnit[] = Array.from({ length: UNITS }, (_, i) => ({
      space: spaceName(i % SPACES),
      slug: `unit-${String(i).padStart(4, '0')}`,
    }));
    // What a `where` filter returns: the Units of the first 10 Spaces.
    const few = many.filter((u) => Number(u.space.slice('space-'.length)) < 10);

    // SLOW_MODE=<rate> throttles the CPU, to run these as a slow CI runner would.
    test.beforeEach(async ({ page }) => {
      await applyCpuThrottling(page);
    });

    test('only the rows in view are in the DOM, and End reaches the last group', async ({
      page,
    }) => {
      await serveUnits(page, many);
      await new UnitListPage(page).goto();

      await expect(treeRow(page, 'All')).toContainText(String(UNITS), READY);
      await expect(treeRow(page, spaceName(0))).toBeVisible(READY);
      const rendered = await tree(page).getByRole('treeitem').count();
      expect(rendered).toBeLessThan(100);

      await treeRow(page, 'All').click();
      await page.keyboard.press('End');
      await expect(treeRow(page, spaceName(SPACES - 1))).toBeVisible(READY);
      await expectFocused(page, spaceName(SPACES - 1));
      expect(await tree(page).getByRole('treeitem').count()).toBeLessThan(100);
    });

    test('a ?group= link to a group out of view, with the Units cached, shows that group', async ({
      page,
    }) => {
      await serveUnits(page, many);
      await new UnitListPage(page).goto();
      await expect(treeRow(page, 'All')).toContainText(String(UNITS), READY);

      await navigateInApp(page, '/spaces');
      await expect(tree(page)).toHaveCount(0, READY);
      const target = spaceName(SPACES - 100);
      await navigateInApp(page, `/units?group=${target}`);
      await expect(treeRow(page, target)).toBeVisible(READY);
      await expect(treeRow(page, target)).toHaveAttribute('aria-selected', 'true', READY);
    });

    test('leaving the page does not freeze it', async ({ page }) => {
      await serveUnits(page, many);
      await new UnitListPage(page).goto();
      await expect(treeRow(page, 'All')).toContainText(String(UNITS), READY);
      await expect(gridCell(page, 'unit-0000')).toBeVisible(READY);

      const started = Date.now();
      await navigateInApp(page, '/spaces');
      await expect(tree(page)).toHaveCount(0, READY);
      await nextFrame(page);
      const elapsed = Date.now() - started;
      console.log(`left the Unit list with ${SPACES} groups in ${elapsed}ms`);
      expect(elapsed).toBeLessThan(BUDGET_MS);
    });

    test('a filter edit does not freeze the page', async ({ page }) => {
      await serveUnits(page, many, few);
      const unitListPage = new UnitListPage(page);
      await unitListPage.goto();
      await expect(treeRow(page, 'All')).toContainText(String(UNITS), READY);
      await expect(gridCell(page, 'unit-0000')).toBeVisible(READY);

      await unitListPage.addVisualBuilderFilter('Where', "Slug LIKE 'unit-%'");
      const started = Date.now();
      await page.getByPlaceholder("Slug LIKE '%prod%'").press('Enter');
      await expect(treeRow(page, 'All')).toContainText(String(few.length), READY);
      await expect(tree(page).getByRole('treeitem')).toHaveCount(11, READY);
      await nextFrame(page);
      const filtered = Date.now() - started;

      // And back: the whole tree again.
      const cleared = Date.now();
      await unitListPage.clearAllVisualBuilderFilters();
      await expect(treeRow(page, 'All')).toContainText(String(UNITS), READY);
      await nextFrame(page);
      const unfiltered = Date.now() - cleared;
      console.log(`filter applied in ${filtered}ms, cleared in ${unfiltered}ms`);
      expect(filtered).toBeLessThan(BUDGET_MS);
      expect(unfiltered).toBeLessThan(BUDGET_MS);
    });
  });
});
