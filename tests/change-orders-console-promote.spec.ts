// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * Promoting a ChangeOrder from the fleet console row, and refusing to.
 *
 * ⚠️ THE CONSOLE'S GATE IS THE ABSENCE OF THE BUTTON, and that is the claim
 * this file is really about. `actionFor` offers Promote on a gate reading of
 * `ready` and on nothing else, because a Promote button on a held row is an
 * invitation to an action the gates will refuse — which teaches a reader to
 * distrust the button rather than to read the row. So "blocked" is asserted as
 * a row that offers Resolve and writes nothing, not as a dialog full of
 * explanation. The dialog's own hold is the second layer, asserted at the end
 * of this file on the detail page, where a held stage CAN be opened directly
 * by URL.
 *
 * ⚠️ AND THE ORDINARY PATH IS CLICKED HERE, ONCE. A wired affordance that has
 * never fired looks exactly like a working one, and this one writes. The same
 * fixture is then carried into the refusal tests in the state that promote left
 * it in, so the halves are about one ChangeOrder rather than several.
 *
 * `/change-orders` lists every ChangeOrder in the org and other worktrees seed into
 * the same database, so nothing here may depend on the row count or on which
 * row is first. The search box narrows to this fixture's own slug first.
 */
import { type Locator, type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { changeOrderCopy } from '../src/pages/x/apps/change-order/changeOrderCopy';
import { changeOrdersConsoleCopy } from '../src/pages/x/apps/change-order/changeOrdersConsoleCopy';
import { type ChangeOrderFixture, buildChangeOrderFixture } from './fixtures/change-order-fixture';

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

/**
 * The dry run the stage panel makes to show what a promotion would write — whatever its
 * gates say, so it is no preview of a promotion the dialog would make. It alone asks for
 * each Unit's configuration.
 */
function isStagePanelPreview(url: string): boolean {
  return (new URL(url).searchParams.get('include') ?? '').split(',').includes('ConfigData');
}

/**
 * A dry run of a promotion: the preview the dialog opens with. Writes nothing.
 *
 * ⚠️ `dry_run` IS THE WHOLE OF THE DISTINCTION. Counting these as writes would
 * report every dialog anybody opened as a promotion that happened; not counting
 * a real promotion would make the write assertions assert nothing.
 */
function isPromotePreview(method: string, url: string): boolean {
  const parsed = new URL(url);
  return (
    method === 'POST' &&
    parsed.pathname === '/api/promote' &&
    parsed.searchParams.get('dry_run') === 'true' &&
    !isStagePanelPreview(url)
  );
}

interface PromoteTraffic {
  /** Requests that WRITE, in order. */
  writes: string[];
  /** Dry runs, in order. What the dialog asks before it states anything. */
  previews: string[];
}

/** Record the promote traffic the page issues, for as long as the page lives. */
async function watchPromoteTraffic(page: Page): Promise<PromoteTraffic> {
  const traffic: PromoteTraffic = { writes: [], previews: [] };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (isPromoteWrite(request.method(), request.url())) {
      traffic.writes.push(`${request.method()} ${request.url()}`);
    } else if (isPromotePreview(request.method(), request.url())) {
      traffic.previews.push(`${request.method()} ${request.url()}`);
    }
    await route.continue();
  });
  return traffic;
}

/**
 * The console, narrowed to one ChangeOrder.
 *
 * Waiting out `change-orders-loading` is not optional: the heading and both regions
 * paint while the org-wide read is still in flight, so a row query issued
 * before this resolves reports "no such ChangeOrder" about a fleet it has not seen.
 */
async function findRow(page: Page, slug: string): Promise<Locator> {
  await page.goto('/change-orders');
  const consoleRegion = page.getByRole('region', { name: 'ChangeOrders console' });
  await expect(consoleRegion).toBeVisible({ timeout: 20_000 });
  await expect(consoleRegion.getByTestId('change-orders-loading')).toHaveCount(0, { timeout: 30_000 });

  await page.getByLabel(changeOrdersConsoleCopy.filters.searchPlaceholder).fill(slug);
  const row = page.locator(`[data-change-order-slug="${slug}"]`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  return row;
}

test.describe('promoting from a console row', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: ChangeOrderFixture;
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
    fx = await buildChangeOrderFixture(fixturePage, { resources: 'full' });
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
    const { writes } = await watchPromoteTraffic(page);
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
    const { writes } = await watchPromoteTraffic(page);
    const row = await findRow(page, fx.changeOrderSlug);

    await row.getByRole('button', { name: 'Promote', exact: true }).click();
    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.click();

    // The page owns one live region and the console hands its sentences to it.
    await expect(page.locator('#announce')).toContainText(changeOrderCopy.promotedTo(OPEN_STAGE), {
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
    const { writes } = await watchPromoteTraffic(page);
    const row = await findRow(page, fx.changeOrderSlug);

    await expect(row).toHaveAttribute('data-change-order-slug', fx.changeOrderSlug);
    await expect(row.getByRole('button', { name: 'Promote', exact: true })).toHaveCount(0);

    // `Resolve` is what a held row offers: something to look at, not something
    // to write. Pressing it opens the ChangeOrder, which is a navigation.
    await row.getByRole('button', { name: 'Resolve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(fx.changeOrderPath), { timeout: 20_000 });

    // And the stage the console refused really is the held one, so the absence
    // above is the gate and not a ChangeOrder that simply finished.
    await expect(page.locator(`[data-promote-stage="${HELD_STAGE}"]`)).toHaveAttribute(
      'data-promote-gated',
      'true',
      { timeout: 30_000 },
    );
    expect(writes, 'a held row must write nothing').toEqual([]);
  });

  /*
   * THE DIALOG'S OWN HOLD, on the stage the row above withheld Promote from.
   *
   * THE WHOLE CLAIM IS AN ABSENCE, so it is asserted as one. "Refused" is not
   * "an error was reported": a refusal that has already written half a
   * promotion is the state this rules out. `staging` is behind a `dev` that has
   * taken the change, so a promotion of it would have something real to write,
   * and "nothing was written" can only pass because the hold held.
   */
  test('a held stage\'s dialog names the hold and offers no control that promotes', async ({ page }) => {
    const traffic = await watchPromoteTraffic(page);
    await page.goto(`${fx.changeOrderPath}/${HELD_STAGE}`);
    const promote = page.locator(`[data-promote-stage="${HELD_STAGE}"]`);
    await expect(promote).toBeVisible({ timeout: 30_000 });

    // Marked, not disabled: a reader who clicks is owed the reason the stage
    // is held rather than a control that silently does nothing.
    await expect(promote).toHaveAttribute('data-promote-gated', 'true');
    await expect(promote).toBeEnabled();

    await promote.click();
    const held = page.locator('[data-held]');
    await expect(held).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/A gate holds this stage/)).toBeVisible();

    /*
     * ⚠️ THE REASON, NOT ONLY THE FACT OF A HOLD. A reader needs to know what
     * is holding the stage, and every other assertion here survives a dialog
     * reduced to one flat line. The hold here is the one failed `Released`
     * check: `dev` has taken this order and released nothing. One failed check
     * carries no counts, so the assertion is that a failed check is named and
     * that its reason is about this ChangeOrder's own order — not the reason's
     * full wording, which belongs to the gate copy.
     */
    await expect(held).toContainText(/A gate holds this stage: blocked: \S/);
    await expect(held).toContainText(`'${fx.changeOrderSlug}'`);

    // NO CONTROL THAT PROMOTES, AND NOT A DISABLED ONE EITHER. A greyed-out
    // confirm advertises a route past the gate; there is none to advertise.
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await expect(page.locator('[data-promote-rel]')).toHaveCount(0);
    await expect(page.locator('.MuiDialogActions-root button')).toHaveCount(1);

    await page.locator('[data-cancel]').click();
    expect(traffic.writes, 'a held stage must write nothing').toEqual([]);

    /*
     * AND IT ASKED FOR NOTHING EITHER. The hold is the page's own gate reading,
     * so there is nothing for a dry run to add and no reason to put a request
     * on the wire for a promotion that is not going to happen.
     */
    expect(traffic.previews, 'a held stage previewed a promotion it will not make').toEqual([]);
  });
});
