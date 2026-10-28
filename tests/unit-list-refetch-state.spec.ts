// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Unit list refetches every 5s, on window focus, and on Refresh. A refetch
// that brings changed Unit data must not undo what the user did to the view: a
// column width they dragged, or the Canvas view's zoom and selected node.
//
// Each list response is narrowed to the test's own Unit, so Units other specs
// create cannot change the list's shape, and is changed on its way to the page,
// the way a real change to that Unit between two polls would change it.
import type { Page, Route } from '@playwright/test';

import { UnitListPage } from './fixtures/unit-list-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import { expect, test } from './fixtures/test';

interface ListedUnit {
  Unit?: { Slug?: string; Labels?: Record<string, string> };
}

interface EditState {
  edit: (unit: NonNullable<ListedUnit['Unit']>) => void;
}

const isUnitList = (url: string) => new URL(url).pathname.endsWith('/api/unit');

/** Long enough for a reset to land: the Canvas fits its view 100ms after a layout, over 300ms. */
const RESET_WINDOW_MS = 1000;

/**
 * Serves the Unit list as only the Unit named `slug`, with `edit` applied. `edit`
 * is read on each response, so a test changes what the next refetch brings by
 * reassigning it.
 */
const routeUnitList = async (
  page: Page,
  slug: string,
  state: EditState,
) => {
  await page.route(
    (url) => isUnitList(url.toString()),
    async (route: Route) => {
      const response = await route.fetch();
      const body = ((await response.json()) as ListedUnit[]).filter(
        (listed) => listed.Unit?.Slug === slug,
      );
      for (const listed of body) {
        if (listed.Unit) state.edit(listed.Unit);
      }
      await route.fulfill({ response, json: body });
    },
  );
};

const refetch = async (page: Page) => {
  const response = page.waitForResponse((r) => isUnitList(r.url()));
  await page.getByTestId('refresh-button').click();
  await response;
};

test.describe('unit list refetch keeps view state', () => {
  test.use({ storageState: 'authentication.json' });

  test('a column width the user dragged survives refetches with changed data', async ({
    page,
  }) => {
    const slug = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);
    await unitListPage.createUnitViaAPI({ unitType: 'todo-app-fe', slug });

    const state: EditState = { edit: () => {} };
    await routeUnitList(page, slug, state);

    await unitListPage.goto();
    await unitListPage.quickFilter(slug);
    await expect(page.getByRole('gridcell', { name: slug, exact: true })).toBeVisible();

    const slugHeader = page.locator('[role="columnheader"][data-field="Slug"]');
    const widthBefore = (await slugHeader.boundingBox())!.width;
    const separator = slugHeader.locator('.MuiDataGrid-columnSeparator--resizable');
    const handle = (await separator.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 150, handle.y + handle.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    const resizedWidth = (await slugHeader.boundingBox())!.width;
    expect(resizedWidth).toBeGreaterThan(widthBefore + 100);

    // A change to a Unit that adds no column.
    state.edit = (unit) => {
      unit.Slug = `${slug}-changed`;
    };
    await refetch(page);
    await expect(page.getByRole('gridcell', { name: `${slug}-changed` })).toBeVisible();
    await page.waitForTimeout(RESET_WINDOW_MS);
    expect((await slugHeader.boundingBox())!.width).toBeCloseTo(resizedWidth, 0);

    // A change that adds a label key, so the grid gets a new set of columns.
    const labelKey = `refetch-${slug}`;
    state.edit = (unit) => {
      unit.Slug = `${slug}-labelled`;
      unit.Labels = { ...unit.Labels, [labelKey]: 'yes' };
    };
    await refetch(page);
    await expect(page.getByRole('gridcell', { name: `${slug}-labelled` })).toBeVisible();
    await page.waitForTimeout(RESET_WINDOW_MS);
    expect((await slugHeader.boundingBox())!.width).toBeCloseTo(resizedWidth, 0);

    // The new key is offered as a column.
    await page.getByRole('button', { name: /columns/i }).click();
    await page.getByPlaceholder('Search columns...').fill(labelKey);
    await expect(page.getByText(labelKey, { exact: true })).toBeVisible();
  });

  test('the Canvas view keeps its zoom and selected node across refetches', async ({ page }) => {
    const slug = RandomSlugGenerator.randomSlugName();
    const unitListPage = new UnitListPage(page);
    await unitListPage.createUnitViaAPI({ unitType: 'todo-app-fe', slug });

    const state: EditState = { edit: () => {} };
    await routeUnitList(page, slug, state);

    await unitListPage.goto();
    await page.getByRole('button', { name: 'Canvas View' }).click();

    const ourNode = page.locator('.react-flow__node', { hasText: slug });
    await expect(ourNode).toBeAttached();
    // Let the first layout's fitView finish before changing the view.
    await page.waitForTimeout(RESET_WINDOW_MS);

    // Zoom out and pan, away from where fitting the view would put it.
    const viewport = page.locator('.react-flow__viewport');
    const fittedTransform = await viewport.getAttribute('style');
    await page.locator('.react-flow__controls-zoomout').click();
    const pane = (await page.locator('.react-flow__pane').boundingBox())!;
    await page.mouse.move(pane.x + 40, pane.y + 40);
    await page.mouse.down();
    await page.mouse.move(pane.x + 140, pane.y + 100, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(RESET_WINDOW_MS);
    const transformBefore = await viewport.getAttribute('style');
    expect(transformBefore).not.toBe(fittedTransform);

    // A click on a node opens its Unit, so a node is selected with a Shift-drag box.
    const selectedNode = page.locator('.react-flow__node.selected');
    const nodeBox = (await ourNode.boundingBox())!;
    await page.keyboard.down('Shift');
    await page.mouse.move(nodeBox.x - 20, nodeBox.y - 20);
    await page.mouse.down();
    await page.mouse.move(nodeBox.x + nodeBox.width + 20, nodeBox.y + nodeBox.height + 20, {
      steps: 10,
    });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(selectedNode).toHaveCount(1);
    expect(await viewport.getAttribute('style')).toBe(transformBefore);

    state.edit = (unit) => {
      unit.Slug = `${slug}-changed`;
    };
    await refetch(page);
    await expect(page.locator('.react-flow__node', { hasText: `${slug}-changed` })).toBeAttached();
    await page.waitForTimeout(RESET_WINDOW_MS);

    expect(await viewport.getAttribute('style')).toBe(transformBefore);
    await expect(selectedNode).toHaveCount(1);
    await expect(selectedNode).toContainText(`${slug}-changed`);
  });
});
