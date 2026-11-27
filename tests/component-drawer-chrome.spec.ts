// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The chrome of the Components drawer: the title row (name, one button per tag kind, Compare,
// Create variant, Close), the tabs row with Settings as a tab, and the filter row (scope chips
// as an icon and a count, search, one view menu with the Units filter). On a scroll down of the
// list the title and tabs rows go away and Close joins the filter row; a scroll up brings them
// back.
//
// Each test seeds its own Component with random slugs (seedSpecSheet) and deletes it after.

import { test, expect, hubApi } from './fixtures/test';
import type { Page } from '@playwright/test';
import { seedSpecSheet, type SeededSpecSheet } from './fixtures/spec-sheet/seedSpecSheet';

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

/** Gives the prod Space a release Target, so the title row has a Target button. */
async function addReleaseTarget(seeded: SeededSpecSheet): Promise<string> {
  const slug = `${seeded.componentSlug}-target`;
  const created = await hubApi.post(`/api/space/${seeded.prod.spaceId}/target`, {
    data: { Slug: slug, ProviderType: 'Kubernetes', ToolchainType: 'Kubernetes/YAML' },
  });
  if (!created.ok()) throw new Error(`target: ${created.status()} ${await created.text()}`);
  const targetId = ((await created.json()) as { TargetID: string }).TargetID;
  const patched = await hubApi.patch(`/api/space/${seeded.prod.spaceId}`, {
    headers: MERGE_PATCH,
    data: { ReleaseTargetID: targetId },
  });
  if (!patched.ok()) throw new Error(`release target: ${patched.status()} ${await patched.text()}`);
  return slug;
}

async function openPane(page: Page, seeded: SeededSpecSheet) {
  await page.goto(`/components?app=${encodeURIComponent(seeded.componentSlug)}&space=${seeded.prod.spaceId}`);
  const pane = page.getByTestId('component-side-pane');
  await expect(pane).toBeVisible({ timeout: 30000 });
  await page.getByTestId('component-filter-all').click();
  const header = pane.getByTestId('unit-header').filter({ hasText: 'openclaw' }).first();
  await expect(header).toBeVisible();
  if ((await pane.getByTestId('field-sheet').count()) === 0) await header.click();
  await expect(pane.getByTestId('field-sheet')).toBeVisible();
  return pane;
}

test.describe('Components drawer chrome', () => {
  let seeded: SeededSpecSheet | undefined;

  test.afterEach(async () => {
    await seeded?.cleanup();
    seeded = undefined;
  });

  test('title, tabs and filter rows hold every control, each with its name', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'changes');
    const targetSlug = await addReleaseTarget(seeded);
    const pane = await openPane(page, seeded);

    // Title row: the name, the one Target as a button with its label, then the three icons.
    await expect(pane.getByTestId('pane-title')).toHaveText(seeded.prod.slug);
    const target = pane.getByTestId('component-side-pane-target');
    await expect(target).toContainText(targetSlug);
    await expect(target).toHaveAccessibleName(`Target: ${targetSlug}`);
    await expect(pane.getByRole('button', { name: 'Compare', exact: true })).toBeVisible();
    await expect(pane.getByRole('button', { name: 'Create variant', exact: true })).toBeVisible();
    await expect(pane.getByTestId('component-side-pane-close')).toHaveAccessibleName('Close');

    // Tabs row: Settings is a tab, and there is no cog.
    await expect(pane.getByRole('tab', { name: 'Configuration' })).toHaveAttribute('aria-selected', 'true');
    await expect(pane.getByRole('tab', { name: 'Settings' })).toBeVisible();
    await expect(page.getByTestId('component-space-settings-cog')).toHaveCount(0);

    // Filter row: each scope chip is an icon and a count, named in full for assistive technology.
    for (const [testId, label] of [
      ['component-filter-all', 'All'],
      ['scope-incoming', 'Incoming'],
      ['scope-changes', 'Changes'],
      ['scope-local', 'Local overrides'],
      ['scope-kept', 'Kept on merge'],
    ] as const) {
      const chip = pane.getByTestId(testId);
      await expect(chip).toHaveAccessibleName(new RegExp(`^${label}, \\S+$`));
      // The selected chip (All) names its scope before its count; the others do not.
      if (testId === 'component-filter-all') await expect(chip).toHaveText(/^All\d+$/);
      else await expect(chip).not.toContainText(label);
    }
    await expect(pane.getByTestId('component-search').locator('input')).toBeVisible();
    // A chip that is not selected has its count in fgMuted, for 4.5:1 on its grey ground.
    await expect(pane.getByTestId('component-incoming-count')).toHaveCSS('color', 'rgb(80, 89, 105)');

    // The hover card of a chip names it in full.
    await pane.getByTestId('scope-local').hover();
    await expect(page.getByRole('tooltip', { name: /^Local overrides/ })).toBeVisible();
    // A click closes it, and it stays closed while the pointer stays on the chip.
    await pane.getByTestId('scope-local').click();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.waitForTimeout(600);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    // It shows again on the next hover.
    await page.mouse.move(0, 0);
    await pane.getByTestId('scope-local').hover();
    await expect(page.getByRole('tooltip', { name: /^Local overrides/ })).toBeVisible();
    await pane.getByTestId('component-filter-all').click();

    // One view menu: the view and the Units filter.
    const menuButton = pane.getByTestId('component-view-menu-button');
    await expect(menuButton).toHaveAccessibleName('View: Sheet. Units: Releasable');
    await menuButton.click();
    const menu = page.getByTestId('component-view-menu');
    for (const name of ['Sheet', 'Code', 'Stacked', 'Releasable', 'All units', 'Include hidden']) {
      await expect(menu.getByRole(name === 'Include hidden' ? 'menuitemcheckbox' : 'menuitemradio', { name, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole('menuitemradio', { name: 'Sheet', exact: true })).toHaveAttribute('aria-checked', 'true');
    // Each view's click carries its name for analytics, in the word the person sees.
    for (const [name, view] of [['Sheet', 'sheet'], ['Code', 'code'], ['Stacked', 'stacked']]) {
      await expect(menu.getByRole('menuitemradio', { name, exact: true })).toHaveAttribute('data-ph-capture-attribute-config-view', view);
    }
    await page.getByTestId('component-view-source').click();
    await expect(menuButton).toHaveAccessibleName('View: Code. Units: Releasable');
    await expect(pane.getByTestId('field-sheet')).toHaveCount(0);
  });

  test('Compare opens the compare bar only when pressed', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'changes');
    const pane = await openPane(page, seeded);

    const compare = pane.getByTestId('component-compare-toggle');
    await expect(compare).toHaveAttribute('aria-pressed', 'false');
    await expect(pane.getByTestId('component-compare-bar')).toHaveCount(0);
    await compare.click();
    await expect(compare).toHaveAttribute('aria-pressed', 'true');
    await expect(pane.getByTestId('compare-selector-a')).toBeVisible();
    await compare.click();
    await expect(pane.getByTestId('component-compare-bar')).toHaveCount(0);
  });

  test('Settings is a tab that shows the Space settings', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'changes');
    const pane = await openPane(page, seeded);

    await pane.getByRole('tab', { name: 'Settings' }).click();
    await expect(pane.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('space-settings-sheet')).toBeVisible();
    await pane.getByRole('tab', { name: 'Configuration' }).click();
    await expect(page.getByTestId('space-settings-sheet')).toHaveCount(0);
    await expect(pane.getByTestId('field-sheet')).toBeVisible();
  });

  test('a scroll down takes the title and tabs away; a scroll up brings them back', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const pane = await openPane(page, seeded);

    const top = pane.getByTestId('component-side-pane-chrome-top');
    const filterRow = pane.getByTestId('component-filter-row');
    const list = pane.getByTestId('unit-list');
    await expect(top).toBeVisible();
    await expect(pane.getByTestId('component-filter-close')).toHaveCount(0);
    await expect(pane.getByTestId('component-filter-title')).toHaveCount(0);

    await list.hover();
    await expect(async () => {
      await page.mouse.wheel(0, 400);
      await expect(top).toBeHidden({ timeout: 500 });
    }).toPass({ timeout: 10000 });
    // The fold holds: the scroll that keeps the content in place is not read as the reader's,
    // so the rows do not come back and go again. Over 30 frames the top rows never change.
    const changesOver = (count: number) =>
      top.evaluate(
        (el, n) =>
          new Promise<number>((done) => {
            let changes = 0;
            let shown = getComputedStyle(el).display !== 'none';
            let i = 0;
            const step = () => {
              const now = getComputedStyle(el).display !== 'none';
              if (now !== shown) changes++;
              shown = now;
              if (++i >= n) done(changes);
              else requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }),
        count,
      );
    expect(await changesOver(30)).toBe(0);
    await expect(top).toBeHidden();
    // The filter row and the resource heading stay; Close joins the filter row.
    await expect(filterRow).toBeVisible();
    await expect(pane.getByTestId('component-filter-close')).toBeVisible();
    // The Variant's name joins the start of the filter row, so the list still says whose it is.
    const filterTitle = pane.getByTestId('component-filter-title');
    await expect(filterTitle).toHaveText(seeded.prod.slug);
    await expect(filterTitle).toHaveCSS('color', 'rgb(80, 89, 105)');
    // The sticky stack under it: the open Unit's header, then the part bar.
    const filterBox = await filterRow.boundingBox();
    const unitHead = pane.getByTestId('unit-header').filter({ hasText: 'openclaw' }).first();
    const headBox = await unitHead.boundingBox();
    const navBox = await pane.getByTestId('part-bar').boundingBox();
    expect(Math.round(headBox!.y)).toBe(Math.round(filterBox!.y + filterBox!.height));
    expect(Math.round(navBox!.y)).toBe(Math.round(headBox!.y + headBox!.height));

    await expect(async () => {
      await page.mouse.wheel(0, -60);
      await expect(top).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 10000 });
    expect(await changesOver(30)).toBe(0);
    await expect(top).toBeVisible();
    await expect(pane.getByTestId('component-filter-close')).toHaveCount(0);
    await expect(pane.getByTestId('component-filter-title')).toHaveCount(0);
    await expect(pane.getByRole('tab', { name: 'Configuration' })).toBeVisible();
  });

  test('at 480px the filter row holds the selected chip\'s name and the Variant name', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const pane = await openPane(page, seeded);
    // Drag the pane's edge until the pane is 480px wide.
    const width = (await pane.boundingBox())!.width;
    const handle = (await page.getByTestId('component-side-pane-resize').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + 300;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (width - 480), y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await pane.boundingBox())!.width)).toBe(480);

    const filterRow = pane.getByTestId('component-filter-row');
    const fits = () => filterRow.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    // The longest scope name, selected.
    await pane.getByTestId('scope-local').click();
    await expect(pane.getByTestId('scope-local')).toHaveText(/^Local overrides\d+$/);
    expect(await fits()).toBe(true);
    // Scrolled: the title row goes, and the Variant name and Close join the filter row.
    const top = pane.getByTestId('component-side-pane-chrome-top');
    await pane.getByTestId('component-filter-all').click();
    await pane.getByTestId('unit-list').hover();
    await expect(async () => {
      await page.mouse.wheel(0, 400);
      await expect(top).toBeHidden({ timeout: 500 });
    }).toPass({ timeout: 10000 });
    await expect(pane.getByTestId('component-filter-title')).toBeVisible();
    await expect(pane.getByTestId('component-filter-close')).toBeVisible();
    expect(await fits()).toBe(true);
  });
});
