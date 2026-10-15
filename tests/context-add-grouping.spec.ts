// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The function invoker's Add-unit popover groups its Units by Space, and a
// group header's checkbox adds every Unit in that group to the invoker context
// at once, with the popover staying open.
//
// Seed: two Spaces of their own, one with two Units and one with a third, so
// the bulk add provably takes only its own group.
//
// The popover lists Units in the server's order, by random UnitID, and MUI's
// Autocomplete starts a new group header each time the group changes from one
// option to the next. Any other Unit that falls between this group's two Units
// splits the group into two headers that both read "0/2". So the test searches
// for the prefix the slugs of the group's two Units start with, and only those
// two are listed when the header is clicked.

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedPage } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RUN = RandomSlugGenerator.randomSlugName();
const SPACE_SLUG = `ch-e2e-context-add-${RUN}`;
const OTHER_SPACE_SLUG = `ch-e2e-context-other-${RUN}`;
const UNIT_PREFIX = `ctx-add-${RUN}`;
const OTHER_UNIT_PREFIX = `ctx-other-${RUN}`;

/**
 * Opens the InvokerSidebar and its Add-unit popover. The "Functions" button
 * TOGGLES the sidebar, and the sidebar can already be open (its state persists
 * in localStorage), so it is clicked only when closed. The collapsed panel is
 * `width: 0; overflow: hidden` with its content still in the DOM, so the
 * Add-unit button's visibility says nothing about the state; localStorage does.
 */
async function openAddUnitPopover(page: Page) {
  const functionsButton = page.getByTestId('invoker-functions-button');
  await expect(functionsButton).toBeVisible({ timeout: 10_000 });
  const isSidebarOpen = await page.evaluate(
    () => window.localStorage.getItem('invokerSidebarOpen') === 'true',
  );
  if (!isSidebarOpen) {
    await functionsButton.click();
    // While the panel's width transition runs, the Functions button still
    // covers the Add-unit button and takes the click.
    await page.waitForFunction(
      () =>
        window.localStorage.getItem('invokerSidebarOpen') === 'true' &&
        document
          .getAnimations()
          .every((a) => !(a instanceof CSSTransition) || a.transitionProperty !== 'width'),
    );
  }
  const addUnit = page.getByRole('button', { name: 'Add unit', exact: true });
  await expect(addUnit).toBeVisible({ timeout: 5_000 });
  await addUnit.click();
  await expect(page.getByText('Add a unit')).toBeVisible({ timeout: 5_000 });
  const searchInput = page.getByPlaceholder('Search units...');
  await searchInput.click();
  await expect(page.locator('[role="listbox"]')).toBeVisible({ timeout: 10_000 });
}

test.describe('Context-add grouping: Add-unit popover groups by Space', () => {
  test.use({ storageState: 'authentication.json' });

  const spaceIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    const page = await newAuthorizedPage(browser);
    try {
      const api = new ApiHelper(page);
      const yaml = readFileSync(path.resolve(__dirname, 'test-data/basic-deployment.yml'), 'utf-8');
      for (const [spaceSlug, unitSlugs] of [
        [SPACE_SLUG, [`${UNIT_PREFIX}-a`, `${UNIT_PREFIX}-b`]],
        [OTHER_SPACE_SLUG, [`${OTHER_UNIT_PREFIX}-c`]],
      ] as const) {
        const spaceId = (await api.createSpace({ space: { Slug: spaceSlug } })).SpaceID as string;
        spaceIds.push(spaceId);
        for (const slug of unitSlugs) {
          const unit = await api.createUnit({
            spaceId,
            unit: { Slug: slug, ToolchainType: 'Kubernetes/YAML' },
          });
          await api.uploadUnitData({ spaceId, unitId: unit.UnitID as string, body: yaml });
        }
      }
    } finally {
      await page.context().close();
    }
  });

  test.afterAll(async ({ browser }) => {
    const page = await newAuthorizedPage(browser);
    try {
      const api = new ApiHelper(page);
      for (const spaceId of spaceIds) {
        await api
          .deleteSpace(spaceId, true)
          .catch((e) => console.warn(`cleanup: Space ${spaceId}: ${e}`));
      }
    } finally {
      await page.context().close();
    }
  });

  test('group header checkbox bulk-adds its group to the invoker context; popover stays open', async ({
    page,
  }) => {
    await page.goto('/units');
    await openAddUnitPopover(page);

    const searchInput = page.getByPlaceholder('Search units...');
    await searchInput.fill(UNIT_PREFIX);
    const spaceHeader = page.locator('[role="listbox"] .MuiListSubheader-root').filter({ hasText: SPACE_SLUG });
    await expect(spaceHeader).toBeVisible({ timeout: 15_000 });
    await expect(spaceHeader).toContainText('0/2', { timeout: 5_000 });

    await spaceHeader.click();

    await expect(page.getByText('2 units')).toBeVisible({ timeout: 5_000 });
    await expect(searchInput).toBeVisible();

    // The search for the run lists all three Units. The two in the context drop
    // out of the list, header and all; the third, in the other Space, is still
    // there to add, so the bulk add took only its own group.
    await searchInput.fill(RUN);
    const otherHeader = page.locator('[role="listbox"] .MuiListSubheader-root').filter({ hasText: OTHER_SPACE_SLUG });
    await expect(otherHeader).toBeVisible({ timeout: 10_000 });
    await expect(otherHeader).toContainText('0/1');
    await expect(spaceHeader).not.toBeVisible();
  });
});
