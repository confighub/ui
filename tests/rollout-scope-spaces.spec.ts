// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Scope fact on a rollout's detail page names the Spaces, not only their
 * count. The count is the trigger; hovering it or focusing it from the keyboard
 * opens the list, Tab moves into its links, and each row links to its Space.
 */
import { type Page } from '@playwright/test';

import {
  type BuildRolloutFixtureOptions,
  type RolloutFixture,
  buildRolloutFixture,
} from './fixtures/rollout-fixture';
import { expect, newAuthorizedContext, test } from './fixtures/test';

test.describe.configure({ mode: 'serial' });

/** Builds one fixture for the enclosing describe, and tears it down after it. */
function useFixture(options: BuildRolloutFixtureOptions): () => RolloutFixture {
  let fx: RolloutFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildRolloutFixture(fixturePage, options);
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  return () => fx;
}

const sortedSlugs = (slugs: string[]) => [...slugs].sort((a, b) => a.localeCompare(b));

test.describe('the Scope fact', () => {
  test.use({ storageState: 'authentication.json' });
  const fixture = useFixture({ resources: 'minimal', releasable: false });

  test('hovering the count lists every in-scope Space in stage order, each linking to it', async ({
    page,
  }) => {
    const fx = fixture();
    // The fixture puts every Space it builds in scope, the base included.
    const spaces = Object.values(fx.spaces);
    expect(spaces.length).toBeGreaterThan(1);

    await page.goto(`/rollouts/${fx.changeOrderSlug}`);

    const trigger = page.getByTestId('rollout-scope-spaces');
    await expect(trigger).toHaveText(`${spaces.length} Spaces`, { timeout: 30_000 });

    const list = page.getByTestId('rollout-scope-spaces-list');
    await expect(list).toHaveCount(0);

    await trigger.hover();
    await expect(list).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(spaces.length);
    for (const space of spaces) {
      const link = list.getByRole('link', { name: space.slug, exact: true });
      await expect(link).toHaveAttribute('href', `/spaces/${space.spaceId}`);
    }

    // The order the rollout travels: the base, then each workflow stage in
    // sequence order, by slug within a stage.
    const stageSlugs = (stage: string) =>
      sortedSlugs(fx.spacesInStage(stage).map((s) => s.slug));
    await expect(list.getByRole('link')).toHaveText([
      fx.spaces.base.slug,
      ...stageSlugs('dev'),
      ...stageSlugs('staging'),
      ...stageSlugs('prod'),
    ]);
    const rows = list.getByRole('listitem');
    await expect(rows.first()).toContainText('source');
    await expect(rows.last()).toContainText('prod');

    // Nothing around the fact clips the list: its last row takes the pointer.
    await list.getByRole('link').last().hover({ trial: true });

    // The list is interactive: the pointer can move into it and it stays open.
    await list.getByRole('link').first().hover();
    await expect(list).toBeVisible();
  });

  test('the keyboard opens the list and Tab moves into its links', async ({ page }) => {
    const fx = fixture();
    await page.goto(`/rollouts/${fx.changeOrderSlug}`);

    const trigger = page.getByTestId('rollout-scope-spaces');
    await expect(trigger).toBeVisible({ timeout: 30_000 });

    // A key press first, so the focus that follows is keyboard focus.
    await page.keyboard.press('Shift');
    await trigger.focus();

    const list = page.getByTestId('rollout-scope-spaces-list');
    await expect(list).toBeVisible();

    const links = list.getByRole('link');
    await page.keyboard.press('Tab');
    await expect(links.first()).toBeFocused();
    await expect(links.first()).toHaveText(fx.spaces.base.slug);
    await expect(list).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(links.nth(1)).toBeFocused();
    await expect(list).toBeVisible();

    // Escape closes the list and gives the focus back to the count.
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('the Scope fact when no stage selects a Space', () => {
  test.use({ storageState: 'authentication.json' });
  // No `Stage` labels, so every stage's `WhereSpace` selects nothing and only
  // the base, as the source stage's member, is in a stage.
  const fixture = useFixture({
    resources: 'minimal',
    releasable: false,
    stageLabels: 'unlabelled',
  });

  test('lists the base first, then the Spaces no stage selected, by slug', async ({
    page,
  }) => {
    const fx = fixture();
    await page.goto(`/rollouts/${fx.changeOrderSlug}`);

    const trigger = page.getByTestId('rollout-scope-spaces');
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.hover();

    const list = page.getByTestId('rollout-scope-spaces-list');
    await expect(list).toBeVisible();
    const others = Object.entries(fx.spaces)
      .filter(([name]) => name !== 'base')
      .map(([, space]) => space.slug);
    await expect(list.getByRole('link')).toHaveText([
      fx.spaces.base.slug,
      ...sortedSlugs(others),
    ]);
  });
});
