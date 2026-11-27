// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Inspect links out: each entity it names is a real link to its page, with a peek of the entity
// on hover or focus. A Variant opens in the drawer. Escape closes the peek, not Inspect.
//
// Each test seeds its own Component with random slugs (seedSpecSheet) and deletes it after.

import { test, expect } from './fixtures/test';
import type { Page } from '@playwright/test';
import { seedSpecSheet, type SeededSpecSheet } from './fixtures/spec-sheet/seedSpecSheet';

async function openInspect(page: Page, seeded: SeededSpecSheet) {
  await page.goto(`/components?app=${encodeURIComponent(seeded.componentSlug)}&space=${seeded.prod.spaceId}`);
  const pane = page.getByTestId('component-side-pane');
  await expect(pane).toBeVisible({ timeout: 30000 });
  await page.getByTestId('component-filter-all').click();
  const header = pane.getByTestId('unit-header').filter({ hasText: 'openclaw' }).first();
  await expect(header).toBeVisible();
  if ((await pane.getByTestId('field-sheet').count()) === 0) await header.click();
  const replicas = pane.getByTestId('field-value-deployment-spec-replicas');
  await replicas.focus();
  await page.getByTestId('field-action-inspect').click();
  const inspect = page.getByTestId('field-inspect');
  await expect(inspect).toBeVisible();
  return inspect;
}

test.describe('Component side pane: Inspect links', () => {
  let seeded: SeededSpecSheet | undefined;

  test.afterEach(async () => {
    await seeded?.cleanup();
    seeded = undefined;
  });

  test('a Revision, its Unit and each Variant link to their pages, with a peek that names them', async ({ page }) => {
    await page.goto('/');
    seeded = await seedSpecSheet(page, 'most-items');
    const { prod, base } = seeded;
    const inspect = await openInspect(page, seeded);

    // The newest Revision: a link to it in the Unit's revision viewer.
    const revision = inspect.locator('[data-testid^="field-inspect-rev-"][data-testid$="-link"]').first();
    await expect(revision).toBeVisible({ timeout: 15000 });
    const num = (await revision.textContent())!.replace(/^r/, '');
    await expect(revision).toHaveAttribute(
      'href',
      `/units/${prod.spaceId}/${prod.unitId}?tab=2&revisionViewer=true&revision=${num}&viewMode=single`,
    );
    await expect(revision).not.toHaveAttribute('target');
    // Focus opens its peek; Escape closes the peek and leaves Inspect open.
    await revision.focus();
    const revisionPeek = page.getByTestId(`field-inspect-rev-${num}-link-peek-name`);
    await expect(revisionPeek).toHaveText(`r${num} of ${prod.slug}/openclaw`);
    await page.keyboard.press('Escape');
    await expect(revisionPeek).toHaveCount(0);
    await expect(inspect).toBeVisible();

    // The Unit: a link to its page; the hover peek names it as space/unit.
    const unit = inspect.getByTestId(`field-inspect-rev-${num}-unit`);
    await expect(unit).toHaveAttribute('href', `/units/${prod.spaceId}/${prod.unitId}?tab=1`);
    await unit.hover();
    await expect(page.getByTestId(`field-inspect-rev-${num}-unit-peek-name`)).toHaveText(`${prod.slug}/openclaw`);
    // The Unit's peek leads on to the Blame of this field.
    const blame = await page.getByTestId('field-inspect-blame').getAttribute('href');
    expect(blame).toMatch(new RegExp(`^/units/${prod.spaceId}/${prod.unitId}\\?`));
    expect(blame).toContain('spec.replicas');

    // A Variant opens in the drawer: the same page with that Space selected.
    const baseLink = inspect.getByTestId(`field-inspect-variant-${base.slug}`);
    const href = await baseLink.getAttribute('href');
    expect(href).toContain('/components?');
    expect(new URL(href!, 'http://x').searchParams.get('space')).toBe(base.spaceId);
    await baseLink.hover();
    const variantPeek = page.getByTestId(`field-inspect-variant-${base.slug}-peek`);
    await expect(variantPeek).toContainText(`Space ${base.slug}`);
    await baseLink.click();
    await expect(inspect).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`[?&]space=${base.spaceId}(&|$)`));
  });
});
