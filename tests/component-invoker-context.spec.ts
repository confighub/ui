// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Selecting a deployment node on the Component view feeds the function
// invoker's context: AppComponentView dispatches setSelectedUnits when a node
// is selected, and clears it on deselect and on unmount. Without that, a
// function run from the sidebar would act on whatever was selected before.

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedPage } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RUN = RandomSlugGenerator.randomSlugName();
const COMPONENT_SLUG = `e2e-invoker-app-${RUN}`;
const SPACE_SLUG = `e2e-invoker-dev-${RUN}`;
const UNIT_SLUG_A = 'e2e-invoker-unit-a';
const UNIT_SLUG_B = 'e2e-invoker-unit-b';

test.use({ storageState: 'authentication.json' });

let spaceId = '';
let componentId = '';

test.beforeAll(async ({ browser }) => {
  const page = await newAuthorizedPage(browser);
  try {
    const api = new ApiHelper(page);
    componentId = (await api.createComponent(COMPONENT_SLUG)).ComponentID as string;
    spaceId = (await api.createSpace({ space: { Slug: SPACE_SLUG, ComponentID: componentId } })).SpaceID as string;

    const yaml = readFileSync(path.resolve(__dirname, 'test-data/basic-deployment.yml'), 'utf-8');
    for (const slug of [UNIT_SLUG_A, UNIT_SLUG_B]) {
      const unit = await api.createUnit({ spaceId, unit: { Slug: slug, ToolchainType: 'Kubernetes/YAML' } });
      await api.uploadUnitData({ spaceId, unitId: unit.UnitID as string, body: yaml });
    }
  } finally {
    await page.context().close();
  }
});

test.afterAll(async ({ browser }) => {
  const page = await newAuthorizedPage(browser);
  try {
    const api = new ApiHelper(page);
    if (spaceId) await api.deleteSpace(spaceId, true).catch((e) => console.warn(`cleanup: Space ${spaceId}: ${e}`));
    if (componentId) await api.deleteComponent(componentId).catch((e) => console.warn(`cleanup: Component ${componentId}: ${e}`));
  } finally {
    await page.context().close();
  }
});

/**
 * The "{N} units" text inside the InvokerContextDisplay header. Scoped to the
 * "Context" header so it cannot match the unit count on a deployment node.
 */
function contextCounter(page: Page) {
  return page.locator('[role="button"]:has-text("Context")').locator('text=/^\\d+ units?$/');
}

test('selecting a deployment node feeds the invoker context; deselecting and leaving clear it', async ({ page }) => {
  await page.goto(`/components?app=${COMPONENT_SLUG}`);
  const node = page.getByTestId(`rf__node-${spaceId}`);
  await expect(node).toBeVisible({ timeout: 20000 });

  // A fresh storage state has the sidebar collapsed, which hides the context.
  await page.locator('[aria-label="Functions"]').first().click();
  const counter = contextCounter(page);
  await expect(counter).toHaveText('0 units', { timeout: 10000 });

  await node.click();
  await expect(counter).toHaveText('2 units', { timeout: 10000 });

  // Escape closes the side pane and deselects the node. The pane opens over
  // the graph and covers the node, so the node itself cannot be clicked again.
  await page.keyboard.press('Escape');
  await expect(counter).toHaveText('0 units', { timeout: 10000 });

  await node.click();
  await expect(counter).toHaveText('2 units', { timeout: 10000 });

  // The context lists the node's own Units. The header is collapsed by default;
  // a DOM click avoids the child boxes that stop propagation.
  await page.locator('[role="button"]:has-text("Context")').evaluate((el) => (el as HTMLElement).click());
  await expect(page.getByRole('link', { name: UNIT_SLUG_A }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: UNIT_SLUG_B }).first()).toBeVisible();

  // Leaving the page unmounts the view, and its cleanup clears the context.
  await page.getByRole('banner').getByRole('button', { name: 'Explorers', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Units', exact: true }).click();
  await page.waitForURL('**/units**', { timeout: 10000 });
  await expect(counter).toHaveText('0 units', { timeout: 10000 });
});
