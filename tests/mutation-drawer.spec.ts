// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { SpaceDetailPage } from './fixtures/space-detail-page';
import { SpaceListPage } from './fixtures/space-list-page';
import { UnitListPage } from './fixtures/unit-list-page';
import { UnitDetailPage } from './fixtures/unit-details-page';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

test.describe('mutations tab', () => {
  // Apply this configuration to all tests and hooks within this describe block.
  // This tells Playwright to initialize contexts for this describe block
  // using the specified storageState.
  test.use({ storageState: 'authentication.json' });

  test.beforeEach(async ({ page }) => {
    const spaceListPage = new SpaceListPage(page);
    await spaceListPage.goto();
  });


  test('should open the mutation drawer with a resource tab bar and the revision configuration', async ({ page }) => {
    // Generate unique names for test entities
    const spaceName = RandomSlugGenerator.randomSlugName();
    const triggerName = RandomSlugGenerator.randomSlugName();
    const unitName = RandomSlugGenerator.randomSlugName();

    // Initialize page objects
    const spaceListPage = new SpaceListPage(page);
    const spaceDetailPage = new SpaceDetailPage(page);
    const unitListPage = new UnitListPage(page);
    const unitDetailPage = new UnitDetailPage(page);

    // Step 1: Create a new space
    await spaceListPage.addSpace(spaceName);

    // Step 2: Navigate to space detail page
    await spaceListPage.goToSpaceDetailPageByName(spaceName);

    // Step 3: Add a trigger to the space, so the unit's revision carries mutations
    await spaceDetailPage.clickTriggersTab();
    await spaceDetailPage.addSetPodDefaultsTrigger(triggerName);

    // Step 4: Create a unit for the space
    await unitListPage.createUnitViaAPI({
      unitType: 'todo-app-fe',
      slug: unitName,
      spaceSlug: spaceName
    });

    // Step 5: Go to the unit details page
    await unitListPage.goToUnitDetailPageByName(unitName);

    // Step 6: Go to revisions tab
    await unitDetailPage.goToRevisionsTab();

    // Step 7: Select the latest revision from the table
    await unitDetailPage.checkRowInTableByName('Head');

    // Step 8: Go to the mutations drawer
    await unitDetailPage.goToMutationDetailsDrawer();

    // Scope every assertion to the drawer's paper: the unit detail page keeps its
    // own tab bar and configuration editor mounted behind the drawer, so a
    // page-wide lookup would match those instead.
    const mutationDrawer = page.locator('.MuiDrawer-root .MuiDrawer-paper');

    // The tab bar carries one tab per resource in the unit (todo-app-fe is a
    // Deployment plus a Service).
    await expect(mutationDrawer.getByRole('tab', { name: /Deployment\s*\/todo-app/ })).toBeVisible();
    await expect(mutationDrawer.getByRole('tab', { name: /Service\s*\/todo-app/ })).toBeVisible();

    // Selecting a tab drives the configuration editor, which renders that resource.
    await mutationDrawer.getByRole('tab', { name: /Deployment\s*\/todo-app/ }).click();
    const editorLines = mutationDrawer.locator('div.monaco-editor .view-lines');
    await expect(editorLines).toBeVisible();
    await expect(editorLines).toContainText('kind: Deployment');
    await expect(editorLines).toContainText('todo-app');

    // The revision's mutated values must stay highlighted: CodeEditor decorates
    // every line containing one of them with .my-line-highlight. Monaco only
    // renders the lines in view, and set-pod-defaults mutates lines below the
    // first screenful, so scroll the editor until a decoration appears. An
    // empty highlightValues array would leave none anywhere in the document.
    const highlightedLines = mutationDrawer.locator('div.monaco-editor .my-line-highlight');
    const editorRoot = mutationDrawer.locator('div.monaco-editor').first();
    const editorBox = await editorRoot.boundingBox();
    expect(editorBox).not.toBeNull();
    await page.mouse.move(
      editorBox!.x + editorBox!.width / 2,
      editorBox!.y + editorBox!.height / 2,
    );
    await expect(async () => {
      await page.mouse.wheel(0, 200);
      expect(await highlightedLines.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 30_000 });
    await expect(highlightedLines.first()).toBeVisible();
  });
});
