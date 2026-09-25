// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * Promoting a rollout from the fleet console row, and refusing to.
 *
 * ⚠️ THE CONSOLE'S GATE IS THE ABSENCE OF THE BUTTON, and that is the claim
 * this file is really about. `actionFor` offers Promote on a gate reading of
 * `ready` and on nothing else, because a Promote button on a held row is an
 * invitation to an action the gates will refuse — which teaches a reader to
 * distrust the button rather than to read the row. So "blocked" is asserted as
 * a row that offers Resolve and writes nothing, not as a dialog full of
 * explanation. The dialog's own hold and the hook's own refusal are the second
 * and third layers, covered on the detail page (`rollout-promote-held.spec.ts`)
 * where a held stage CAN be opened directly by URL.
 *
 * ⚠️ AND THE ORDINARY PATH IS CLICKED HERE, ONCE. A wired affordance that has
 * never fired looks exactly like a working one, and this one writes. The same
 * fixture is then carried into the refusal test in the state that promote left
 * it in, so the two halves are about one rollout rather than two.
 *
 * `/rollouts` lists every ChangeOrder in the org and other worktrees seed into
 * the same database, so nothing here may depend on the row count or on which
 * row is first. The search box narrows to this fixture's own slug first.
 */
import { type Locator, type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import { rolloutsConsoleCopy } from '../src/pages/x/apps/rollout/rolloutsConsoleCopy';
import { type RolloutFixture, buildRolloutFixture } from './fixtures/rollout-fixture';

test.describe.configure({ mode: 'serial' });

/** The stage nothing holds: entered from the source, and it declares no prerequisite. */
const OPEN_STAGE = 'dev';
/** The stage behind a `Released` check over a `dev` that has published nothing. */
const HELD_STAGE = 'staging';

/**
 * Anything that WRITES on a promote's behalf.
 *
 * A promotion is one `POST /api/promote`, dry runs excluded by name.
 */
function isPromoteWrite(method: string, url: string): boolean {
  const parsed = new URL(url);
  if (parsed.searchParams.get('dry_run') === 'true') return false;
  if (parsed.pathname === '/api/promote') return method === 'POST';
  // The routes the client-side promotion used to write through. Nothing takes
  // them now, and anything that did would be promoting outside the API.
  if (parsed.pathname !== '/api/unit') return false;
  if (method === 'POST') return parsed.searchParams.has('upstream_revision');
  return method === 'PATCH' && parsed.searchParams.get('upgrade') === 'true';
}

async function watchPromoteWrites(page: Page): Promise<string[]> {
  const writes: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (isPromoteWrite(request.method(), request.url())) {
      writes.push(`${request.method()} ${request.url()}`);
    }
    await route.continue();
  });
  return writes;
}

/**
 * The console, narrowed to one rollout.
 *
 * Waiting out `rollouts-loading` is not optional: the heading and both regions
 * paint while the org-wide read is still in flight, so a row query issued
 * before this resolves reports "no such rollout" about a fleet it has not seen.
 */
async function findRow(page: Page, slug: string): Promise<Locator> {
  await page.goto('/rollouts');
  const consoleRegion = page.getByRole('region', { name: 'Rollouts console' });
  await expect(consoleRegion).toBeVisible({ timeout: 20_000 });
  await expect(consoleRegion.getByTestId('rollouts-loading')).toHaveCount(0, { timeout: 30_000 });

  await page.getByLabel(rolloutsConsoleCopy.filters.searchPlaceholder).fill(slug);
  const row = page.locator(`[data-rollout-slug="${slug}"]`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  return row;
}

test.describe('promoting from a console row', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: RolloutFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    /*
     * `full` resources, and one of them dropped from a Space of the open stage,
     * so the promotion has something to write: cloning the missing resource in
     * along with the rest. Without that every destination already holds
     * everything, the promote is a no-op, and "the promote wrote" would be a
     * weaker claim than it looks.
     */
    fx = await buildRolloutFixture(fixturePage, { resources: 'full' });
    await fx.dropResource(OPEN_STAGE, 'config');
    // Which stage is next is read off `ResolvedSpaceIDs`. A server that cannot
    // derive it makes every row read as one that never moved, which would fail
    // these assertions for a reason that has nothing to do with the console.
    await fx.assertPropagationSupported();
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  /*
   * BOTH PATHS, NOT ONE. Every Space of this stage carries a release Target, so
   * "Promote and release" is a real second choice and the dialog has to offer
   * it. `canRelease` comes off the row's own stage (`ConsoleStage.hasReleaseTargets`),
   * which is the fact the console had no way to ask for until now.
   */
  test('a row nothing holds offers Promote, and the dialog offers both paths', async ({ page }) => {
    const writes = await watchPromoteWrites(page);
    const row = await findRow(page, fx.changeOrderSlug);

    const promote = row.getByRole('button', { name: 'Promote', exact: true });
    await expect(promote).toBeVisible();
    await expect(promote).toBeEnabled();
    await promote.click();

    // No hold, so the dialog offers the actions rather than an explanation.
    await expect(page.locator('[data-held]')).toHaveCount(0);
    await expect(page.locator('[data-confirm]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-promote-rel]')).toBeVisible();

    await page.locator('[data-cancel]').click();
    await expect(page.locator('[data-confirm]')).toHaveCount(0, { timeout: 10_000 });
    expect(writes, 'opening and cancelling the dialog must write nothing').toEqual([]);
  });

  /*
   * THE ONE PLACE THIS PATH IS ACTUALLY FIRED. The console's Promote was
   * rendered permanently disabled before this, so "it is wired" is not a claim
   * a render can support.
   */
  test('confirming writes the promotion and says so', async ({ page }) => {
    const writes = await watchPromoteWrites(page);
    const row = await findRow(page, fx.changeOrderSlug);

    await row.getByRole('button', { name: 'Promote', exact: true }).click();
    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.click();

    // The page owns one live region and the console hands its sentences to it.
    await expect(page.locator('#announce')).toContainText(rolloutCopy.promotedTo(OPEN_STAGE), {
      timeout: 40_000,
    });
    expect(writes.length, 'a confirmed promote writes').toBeGreaterThan(0);
  });

  /*
   * THE REFUSAL, over the state the promote above left behind: `dev` has taken
   * the change and published no Release, so `staging`'s `Released` entry gate
   * holds it. The row must withdraw Promote rather than offer one the gates
   * would refuse — and pressing what it offers instead must still write nothing.
   */
  test('a row a gate holds offers no promote, and writes nothing', async ({ page }) => {
    const writes = await watchPromoteWrites(page);
    const row = await findRow(page, fx.changeOrderSlug);

    await expect(row).toHaveAttribute('data-rollout-slug', fx.changeOrderSlug);
    await expect(row.getByRole('button', { name: 'Promote', exact: true })).toHaveCount(0);

    // `Resolve` is what a held row offers: something to look at, not something
    // to write. Pressing it opens the rollout, which is a navigation.
    await row.getByRole('button', { name: 'Resolve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/rollouts/${fx.changeOrderSlug}`), { timeout: 20_000 });

    // And the stage the console refused really is the held one, so the absence
    // above is the gate and not a rollout that simply finished.
    await expect(page.locator(`[data-promote-stage="${HELD_STAGE}"]`)).toHaveAttribute(
      'data-promote-gated',
      'true',
      { timeout: 30_000 },
    );
    expect(writes, 'a held row must write nothing').toEqual([]);
  });
});
