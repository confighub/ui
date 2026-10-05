// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * A stage that names no selector.
 *
 * `WhereSpace` is optional, and EMPTY MEANS EVERY SPACE THE CHANGEORDER IS
 * HEADED FOR (`InScopeSpaceIDs`), which this fixture sets to the component's. The
 * KRM model it replaced refused an empty selector outright, so a port that
 * carried that reading forward would match nothing — silently. No error, no
 * problem entry, just a stage that draws empty and a rollout that looks
 * mis-configured. Nothing else in this suite can reach the shape, which is why
 * it is seeded here against a real server rather than asserted on a mock.
 *
 * AND IT MUST COST NOTHING. The in-scope Spaces arrive with the ChangeOrder,
 * so asking the server for them, once per such stage, would be a request for
 * data in hand. The second test is the one that keeps that true.
 */
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import {
  WHOLE_COMPONENT_STAGE,
  type RolloutFixture,
  buildRolloutFixture,
} from './fixtures/rollout-fixture';

test.describe.configure({ mode: 'serial' });

/**
 * Space queries that ASK A QUESTION, told apart from the page's own unfiltered
 * list of the org's Spaces.
 *
 * The unfiltered read is what every console already does and is not what this
 * is about. A `where` on `/api/space` is a stage selector being resolved, and
 * for a stage that names no selector there must not be one.
 */
function isStageSelectorQuery(method: string, url: string): boolean {
  if (method !== 'GET') return false;
  const parsed = new URL(url);
  if (parsed.pathname !== '/api/space') return false;
  const where = parsed.searchParams.get('where');
  return where !== null && where !== '';
}

test.describe('a stage with no WhereSpace', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: RolloutFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildRolloutFixture(fixturePage, {
      resources: 'minimal',
      releasable: false,
      workflow: 'whole-component',
    });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  test('takes every Space of the component, not none of them', async ({ page }) => {
    await page.goto(`/rollouts/${fx.changeOrderSlug}/${WHOLE_COMPONENT_STAGE}`);

    const promote = page.locator(`[data-promote-stage="${WHOLE_COMPONENT_STAGE}"]`);
    await expect(promote).toBeVisible({ timeout: 30_000 });

    // Every Space the fixture built EXCEPT THE BASE.
    //
    // ⚠️ MEMBERSHIP AND THE WRITE SET ARE DIFFERENT QUESTIONS, and this test is
    // about the second. `stageSpaces` in `public/cmd/cub/variant_promote.go`
    // filters a stage's resolved Spaces by scope and by nothing else, so a
    // selector that names nothing covers the Space the ChangeOrder resides in
    // along with the rest — that is the membership every entry gate quantifies
    // over, and the source lane is a second view of it rather than a claim that
    // removes it from a stage. The promotion loop then skips that Space by
    // name: "Skipping %s, the space the change order was created in". So the
    // count the dialog states is the stage's membership MINUS the base, and a
    // dialog naming one variant more than the promote writes into is the defect
    // this pins.
    const expected = Object.keys(fx.spaces).filter((name) => name !== 'base').length;
    expect(expected).toBeGreaterThan(1);

    // The dialog states the count it is about to write into.
    await promote.click();
    await expect(
      page.getByText(
        new RegExp(`Promoting writes this change into ${expected} variants of ${WHOLE_COMPONENT_STAGE}`),
      ),
    ).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-cancel]').click();

    // A stage that resolved to nothing would SAY so rather than fail silently.
    // Asserting the absence pins the difference between the two outcomes.
    await expect(page.getByText(/selects no Space/)).toHaveCount(0);
  });

  test('resolves from the Spaces already on the page, issuing no query for them', async ({
    page,
  }) => {
    const selectorQueries: string[] = [];
    await page.route('**/api/space*', async (route) => {
      const request = route.request();
      if (isStageSelectorQuery(request.method(), request.url())) {
        selectorQueries.push(new URL(request.url()).searchParams.get('where') ?? '');
      }
      await route.continue();
    });

    await page.goto(`/rollouts/${fx.changeOrderSlug}/${WHOLE_COMPONENT_STAGE}`);
    const promote = page.locator(`[data-promote-stage="${WHOLE_COMPONENT_STAGE}"]`);
    await expect(promote).toBeVisible({ timeout: 30_000 });

    /*
     * The stage's write set, said out loud by the dialog. Asserting it is what
     * makes "no query was issued" a measurement rather than a race: the count
     * cannot be stated until the resolution has finished, so reaching this line
     * proves the work happened AND that it happened without asking the server.
     * A fixed pause proved only that time had passed.
     */
    const expected = Object.keys(fx.spaces).filter((name) => name !== 'base').length;
    await promote.click();
    await expect(
      page.getByText(
        new RegExp(`Promoting writes this change into ${expected} variants of ${WHOLE_COMPONENT_STAGE}`),
      ),
    ).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-cancel]').click();

    expect(
      selectorQueries,
      'a stage naming no selector must be answered from the Space list the page already holds',
    ).toEqual([]);
  });
});
