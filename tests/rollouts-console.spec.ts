// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The rollouts console at altitude 0, asserted against the live route.
 *
 * ⚠️ IDENTITY IS ASSERTED BEFORE ANYTHING ELSE IS BELIEVED, and that is not
 * ceremony. Two worktrees serve this app on this machine. The other one renders
 * MORE text than this one, so a run against the wrong port does not look thin or
 * broken — it looks substantial, and produces a fuller report than the correct
 * one. `<title>` is identical on both and the console module path answers 200 on
 * both, so neither discriminates. A listening port is not proof of whose code is
 * listening.
 *
 * The route is also behind a login wall: unauthenticated it renders "Sign in to
 * ConfigHub" in 77 characters, and every assertion below would then be precise,
 * confident, and about the wrong page. `playwright.config.ts` supplies
 * `authentication.json` as `storageState`; `assertOurConsole` proves it worked
 * rather than assuming it did.
 *
 * THE FIRST DESCRIBE SEEDS NOTHING, DELIBERATELY. Its claims are structural and
 * behavioural invariants that must hold for whatever the org contains — row
 * count, which states are present and which slugs exist are all properties of
 * the data, and pinning them there would make those tests fail on a healthy
 * fleet.
 *
 * ⚠️ THE STRIP'S TRAILING COMPLETE SEGMENT IS THE EXCEPTION, AND IT HAS TO BE.
 * Whether a strip ends on that segment is a claim about a ROW, so it can only be
 * made where a row exists — and an org holding no rollout that draws a strip
 * gives a data guard nothing to assert over. A guard that then steps aside reads
 * as a considered decision in the report while proving nothing at all, which is
 * worse than a plain gap: nobody goes looking for coverage a green run claims to
 * have. Those two tests therefore build the row they need, through the same
 * `buildRolloutFixture` every other seeded rollout spec uses, and each narrows
 * the console to its own slug so an org-wide list cannot make them read another
 * run's data.
 */
import { type Locator, type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext } from './fixtures/test';

import { rolloutsConsoleCopy } from '../src/pages/x/apps/rollout/rolloutsConsoleCopy';

import { ApiHelper } from './fixtures/api-helper';
import { type RolloutFixture, buildRolloutFixture } from './fixtures/rollout-fixture';

const CONSOLE_PATH = '/rollouts';

/**
 * The three facts that together mean "our worktree, authenticated, rendered".
 *
 * Checked as one helper so no test can start asserting before all three hold —
 * the failure this guards against is a green run against another checkout.
 */
async function assertOurConsole(page: Page) {
  await page.goto(CONSOLE_PATH);

  // Authenticated: the sign-in wall never renders the console's region.
  const consoleRegion = page.getByRole('region', { name: 'Rollouts console' });
  await expect(consoleRegion).toBeVisible({ timeout: 20_000 });

  // Ours: this region is absent from the other worktree's build.
  await expect(page.getByRole('region', { name: 'Rollouts' }).first()).toBeAttached();

  // Rendered, not mid-transition. An early capture here once came out entirely
  // orange because it was sampled during a page fade.
  await expect(page.getByRole('heading', { level: 1, name: rolloutsConsoleCopy.pageTitle })).toBeVisible();

  /*
   * ⚠️ AND WAIT FOR THE LIST TO SETTLE, WHICH IS NOT THE SAME AS THE PAGE
   * RENDERING. The heading and both regions paint while the fetch is still in
   * flight, so every `test.skip(count === 0)` below fired against a page that
   * simply had not loaded yet. The suite went green with five skips reading
   * "No rollouts in this org" against an org holding ten.
   *
   * That is worse than a failure: a skip looks like a considered decision, so
   * a green run reported coverage it never had. Nothing may be counted before
   * this line.
   */
  await expect(consoleRegion.getByTestId('rollouts-loading')).toHaveCount(0, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  return consoleRegion;
}

/**
 * The console, settled, and narrowed to ONE rollout by its slug.
 *
 * The list is org-wide and the database is shared, so anything read off "the
 * rows on the page" is partly some other run's fixture. Typing the slug into
 * the console's own search — `row.slug` is what that box matches — leaves the
 * seeded row and nothing else, so a claim about it cannot be satisfied, or
 * broken, by a neighbour.
 */
async function openConsoleFilteredTo(page: Page, slug: string): Promise<Locator> {
  const consoleRegion = await assertOurConsole(page);

  await consoleRegion
    .getByRole('searchbox', { name: rolloutsConsoleCopy.filters.searchPlaceholder })
    .fill(slug);

  await expect(
    consoleRegion.locator(`[data-rollout-slug="${slug}"]`),
    `the seeded rollout ${slug} never reached the console, so nothing below is about it`,
  ).toBeVisible({ timeout: 20_000 });

  return consoleRegion;
}

/*
 * ⚠️ READ AS ONE SWEEP, NOT ROW BY ROW. What the Complete-step tests assert is a
 * property of a row's WHOLE strip — which segment is last — so a row's segment
 * titles have to be collected together before any of them is judged. A
 * locator-per-segment walk would make one round trip per segment, and would read
 * a strip mid-render as the list re-paints.
 *
 * TITLES, NOT TEXT. A segment is a 6px bar carrying no text at all: its name
 * exists only in the `title` attribute `RolloutStageStrip` composes, so nothing
 * about this claim is reachable by any text scan of the page.
 */
async function stripsByRow(consoleRegion: Locator) {
  return consoleRegion.evaluate((root) =>
    [...root.querySelectorAll('[data-rollout-slug]')].map((row) => ({
      slug: row.getAttribute('data-rollout-slug') ?? '',
      state: row.querySelector('[data-rollout-state]')?.getAttribute('data-rollout-state') ?? '',
      titles: [...row.querySelectorAll('[data-testid="rollout-stage-segment"]')].map(
        (segment) => segment.getAttribute('title') ?? '',
      ),
    })),
  );
}

/** The one row the console still draws once it is filtered to a single slug. */
async function seededStrip(page: Page, slug: string) {
  const consoleRegion = await openConsoleFilteredTo(page, slug);
  const matching = (await stripsByRow(consoleRegion)).filter((row) => row.slug === slug);
  expect(matching, `the console drew ${matching.length} rows for ${slug}, wanted exactly one`)
    .toHaveLength(1);
  return matching[0];
}

/** The prefix `RolloutStageStrip` gives the Complete step's segment: `<name>: <label>`. */
const COMPLETE_SEGMENT_TITLE = /^Complete: /;

test.describe('rollouts console', () => {
  test('renders one h1 and both named regions', async ({ page }) => {
    await assertOurConsole(page);

    // Exactly one `h1`. The console owns it, so a mounting page that also
    // renders "Rollouts" is the defect this catches — two `h1`s look correct
    // in isolation and only the pair is wrong.
    await expect(page.locator('#root h1')).toHaveCount(1);
  });

  test('the KPI strip is the only State filter — no separate select duplicates it', async ({ page }) => {
    await assertOurConsole(page);

    /*
     * The FilterBar used to render its own State `<select>` alongside this
     * KPI strip — two controls writing the same `stateFilter`, which is a
     * point of confusion (which one is "current"?) rather than a real second
     * way to filter. It was removed in favour of the KPI cards alone.
     *
     * `getByLabel('State')` also once caught an accessible-name collision
     * between that select and the KPI strip's wrapping `role="group"`
     * (Playwright's accessible-name match is a case-insensitive SUBSTRING
     * match, so "Filter by state" matched a query for "State" too).
     *
     * Both regressions are named by ROLE rather than by an unscoped label,
     * because the substring match is what makes an unscoped query unsafe here:
     * every row is a button named "Open rollout <slug>", and a slug carrying
     * the word "state" — the fixture's random word list contains one, so
     * `e2e-rollout-tinkling-state-order` is a name this org really produces —
     * answered to "State" and failed a console that was perfectly correct.
     * This file asserts invariants that must hold for whatever the org
     * contains, so no assertion in it may depend on which slugs exist.
     */
    await expect(page.getByRole('combobox', { name: 'State' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'State' })).toHaveCount(0);
  });

  test('renders no uppercase text anywhere in the console', async ({ page }) => {
    const consoleRegion = await assertOurConsole(page);

    /*
     * Read from the RENDER, not the source. The ban is on
     * `text-transform: uppercase`, and this theme applies it from the theme
     * itself to `caption`, `overline` and table heads — so a file with no
     * capitals in it still renders shouting text. Source review cannot see this.
     */
    const shouting = await consoleRegion.evaluate((root) =>
      [...root.querySelectorAll('*')]
        .filter((el) => {
          if (['STYLE', 'SCRIPT', 'TITLE'].includes(el.tagName)) return false;
          if (el.children.length > 0) return false;
          return Boolean(el.textContent?.trim()) && getComputedStyle(el).textTransform === 'uppercase';
        })
        .map((el) => `${el.tagName}: ${el.textContent?.trim().slice(0, 40)}`),
    );
    expect(shouting).toEqual([]);
  });

  test('de-emphasises with colour, never with opacity (R11)', async ({ page }) => {
    const consoleRegion = await assertOurConsole(page);

    /*
     * An opacity composite is a colour nobody chose. The token says one thing
     * and the screen shows a fraction of it over whatever happens to be behind
     * — so no vocabulary check can see the rendered value, and no contrast
     * floor can be applied to it. That mechanism is behind the reference's four
     * worst below-AA pairs: the ratios are not wrong on purpose, they were
     * never anyone's decision.
     *
     * TEXT ONLY. The stage strip's `progressing` segment pulses between 1 and
     * .55, which the reference does too — it carries no text, and animating a
     * decorative mark is not the defect this guards.
     */
    const faded = await consoleRegion.evaluate((root) =>
      [...root.querySelectorAll('*')]
        .filter((el) => {
          const o = getComputedStyle(el).opacity;
          if (o === '1' || o === '') return false;
          return Boolean((el.textContent ?? '').trim());
        })
        .map((el) => `${el.tagName} opacity=${getComputedStyle(el).opacity} "${el.textContent?.trim().slice(0, 30)}"`),
    );
    expect(faded).toEqual([]);
  });

  test('names every row by its slug, never by its contents or an id', async ({ page }) => {
    await assertOurConsole(page);

    const rows = page.getByRole('button', { name: /^Open rollout / });
    const count = await rows.count();
    test.skip(count === 0, 'No rollouts in this org; row naming cannot be asserted.');

    for (const name of await rows.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))) {
      // Short and distinguishing. The reference named each row by 136-176
      // characters of its own contents, which is why its rows were dropped from
      // the contract's control inventory as fixture data.
      expect(name.length).toBeLessThan(60);
      // An id is never rendered to a user. If a thing has no name, that is a
      // finding rather than a formatting choice.
      expect(name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
      expect(name).not.toMatch(/__[a-z_]+__/);
    }
  });

  test('leaks no id or sentinel through a title or aria-label', async ({ page }) => {
    const consoleRegion = await assertOurConsole(page);

    /*
     * ATTRIBUTES, NOT `innerText`. A `title` is user-visible and is not part of
     * the page's text, so every text-based sweep for this defect was blind to it
     * by construction — which is exactly how `__rollout_source__: Change landed`
     * survived on every row of two screens until someone enumerated attributes.
     */
    const leaks = await consoleRegion.evaluate((root) => {
      const attrs = ['title', 'aria-label', 'alt', 'placeholder', 'aria-describedby'];
      const out: string[] = [];
      for (const el of root.querySelectorAll('*')) {
        for (const a of attrs) {
          const v = el.getAttribute(a);
          if (v && (/__[a-z_]+__/.test(v) || /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(v))) {
            out.push(`${a}="${v}"`);
          }
        }
      }
      return out;
    });
    expect(leaks).toEqual([]);
  });

  test('shows Complete and Aborted rows by default, with no hide/reveal toggle', async ({ page }) => {
    const consoleRegion = await assertOurConsole(page);

    /*
     * This console used to hide Complete/Aborted rows unless the reader
     * explicitly asked for one of those states or searched — a "N finished or
     * aborted, hidden" toggle in the footer revealed them. Removed on
     * request: hiding a state the reader has not filtered to is a surprise,
     * not a convenience, and clicking an explicit State filter for one of
     * these states had to fight the same default to show anything.
     */
    await expect(page.getByRole('button', { name: /finished or aborted, hidden$/ })).toHaveCount(0);

    /*
     * Both finished states, because a workflow declaring no `Final` health check
     * lands its rollouts on `complete-unverified` — still terminal, still a row
     * the reader must not have to go looking for.
     */
    const complete = consoleRegion.locator(
      '[data-rollout-state="complete"], [data-rollout-state="complete-unverified"]',
    );
    const completeCount = await complete.count();
    const abortedCount = await consoleRegion.locator('[data-rollout-state="aborted"]').count();
    test.skip(completeCount === 0 && abortedCount === 0, 'No Complete or Aborted rollouts in this org.');

    // Rendered in the table as soon as the page loads — no filter, no click.
    if (completeCount > 0) {
      await expect(complete.first()).toBeVisible();
    }
    if (abortedCount > 0) {
      await expect(consoleRegion.locator('[data-rollout-state="aborted"]').first()).toBeVisible();
    }
  });

  test('a zero-stage rollout does not draw a full-width completed strip', async ({ page }) => {
    const consoleRegion = await assertOurConsole(page);

    /*
     * The regression this pins: `no-stages` rows have exactly ONE stage — the
     * source — whose segment tone is `done`, and a lone segment on `flex: 1`
     * fills its cell. So a rollout that has travelled nothing rendered as an
     * unbroken green bar, identical to one promoted through every stage.
     *
     * The reducer was corrected so this could not be COUNTED as Complete; the
     * strip reinstated the same claim at the only place a reader looks. Fixing
     * a derivation does not fix what is drawn from it.
     */
    const noStages = consoleRegion.locator('[data-rollout-state="no-stages"]');
    const n = await noStages.count();
    test.skip(n === 0, 'No zero-stage rollout in this org; see rollouts-no-stages.spec.ts for the seeded case.');

    for (let i = 0; i < n; i++) {
      const row = noStages.nth(i).locator('xpath=ancestor::*[@data-rollout-slug][1]');
      await expect(row.getByTestId('rollout-stage-segment')).toHaveCount(0);
      await expect(noStages.nth(i)).toContainText(rolloutsConsoleCopy.states['no-stages'].label);
    }
  });

  test('records which console states this org actually exercised', async ({ page }) => {
    const consoleRegion = await assertOurConsole(page);

    // Reveal terminal rows so the tally covers every state the console can show.
    const hiddenToggle = page.getByRole('button', { name: /finished or aborted, hidden$/ });
    if (await hiddenToggle.isVisible().catch(() => false)) await hiddenToggle.click();

    const seen = await consoleRegion.evaluate((root) =>
      [...new Set([...root.querySelectorAll('[data-rollout-state]')].map((e) => e.getAttribute('data-rollout-state')))].sort(),
    );

    /*
     * ⚠️ THIS RECORDS COVERAGE, IT DOES NOT ASSERT IT — and the distinction is
     * the point. `progressing` requires a promotion in flight at the moment of
     * the run, which no fixture in this suite can hold still, so its segment
     * treatment (an accent stripe, re-hued from the strip's warning default) is
     * UNVERIFIED rather than passing.
     *
     * Attaching it makes the gap readable in the report instead of silent. A
     * suite that is green on seven of eight states and says nothing about the
     * eighth is claiming coverage it does not have.
     */
    const ALL = [
      'ready',
      'degraded',
      'blocked',
      'progressing',
      'complete',
      'complete-unverified',
      'aborted',
      'no-stages',
      'unknown',
    ];
    const missing = ALL.filter((s) => !seen.includes(s));
    test.info().annotations.push(
      { type: 'states-exercised', description: seen.join(', ') || 'none' },
      { type: 'states-NOT-exercised', description: missing.join(', ') || 'none' },
    );

    // Every state that DID render must be one the copy module knows how to name;
    // an unmapped state would render an undefined label.
    for (const state of seen) {
      expect(Object.keys(rolloutsConsoleCopy.states)).toContain(state);
    }
  });

  test('offers Rollouts in the top nav, and it navigates', async ({ page }) => {
    await page.goto('/components');

    const nav = page.getByRole('banner');
    const entry = nav.getByRole('button', { name: 'Rollouts', exact: true });
    await expect(entry).toBeVisible();

    // Sits between Components and Units, per the design's ordering.
    await expect(nav.getByRole('button', { name: 'Components' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Units', exact: true })).toBeVisible();

    // The entry has to actually go somewhere — a nav item that renders but does
    // not navigate is the failure mode worth testing for.
    await entry.click();
    await expect(page).toHaveURL(/\/rollouts$/);
  });
});

/**
 * The strip's trailing Complete segment, over a rollout seeded for the purpose.
 *
 * Two shapes, two fixtures, because the claim is about a GUARD with two sides:
 * `row.stages.length > 0 && row.state !== 'no-stages'` decides whether the strip
 * — trailing segment and all — is drawn. A rollout with a stage sequence proves
 * the segment is appended and appended LAST; a rollout with no sequence at all
 * proves the same guard still withholds it. Each needs the other: a build that
 * dropped the segment entirely passes the second on its own, and one that drew
 * it unconditionally passes the first.
 *
 * Seeded rather than found. These two are the only tests in this file whose
 * subject is a row, and the org is not obliged to hold one — CI's database is
 * fresh per run, so "whichever rollout this org happens to have" is routinely
 * none at all.
 */
test.describe('the Complete step on the console strip', () => {
  test.use({ storageState: 'authentication.json' });

  /**
   * `minimal`: every assertion here reads a 6px bar's `title`. The other three
   * resources cost time and change nothing about the strip.
   */
  const SEED = { resources: 'minimal' } as const;

  test.describe('a rollout whose workflow declares stages', () => {
    let fx: RolloutFixture;
    let fixturePage: Page;

    test.beforeAll(async ({ browser }) => {
      const context = await newAuthorizedContext(browser);
      fixturePage = await context.newPage();
      await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
      fx = await buildRolloutFixture(fixturePage, SEED);
    });

    test.afterAll(async () => {
      try {
        if (fx) await fx.teardown();
      } finally {
        if (fixturePage) await fixturePage.close();
      }
    });

    test('every strip a row draws ends on the Complete step', async ({ page }) => {
      /*
       * The ChangeWorkflow's `Final` completion checklist is a step of the
       * rollout and the LAST one — nothing is promoted after it — so it is the
       * last segment or it is misdrawn. Position is the whole assertion: a
       * Complete segment rendered anywhere but the end would say the rollout
       * finishes partway through its own sequence.
       *
       * Checked at the END INDEX rather than by searching for the segment,
       * because a workflow may legally declare a stage called `Complete` and
       * `stageDisplayName` prints a stage's id verbatim. Searching for the
       * title would then match that stage and pass while the real trailing step
       * was missing. This fixture's stages are `dev`, `staging` and `prod`, so
       * the one segment titled `Complete:` here can only be the step.
       */
      const row = await seededStrip(page, fx.changeOrderSlug);

      expect(
        row.titles.length,
        'the seeded rollout declares stages, so its row owes a sequence AND a trailing step',
      ).toBeGreaterThan(1);
      expect(row.titles[row.titles.length - 1]).toMatch(COMPLETE_SEGMENT_TITLE);
      expect(
        row.titles.slice(0, -1).filter((title) => COMPLETE_SEGMENT_TITLE.test(title)),
        'the step is terminal, so it is drawn once and only at the end',
      ).toEqual([]);
    });
  });

  test.describe('a rollout whose Spaces declare no stage at all', () => {
    let fx: RolloutFixture;
    let fixturePage: Page;

    test.beforeAll(async ({ browser }) => {
      const context = await newAuthorizedContext(browser);
      fixturePage = await context.newPage();
      await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
      fx = await buildRolloutFixture(fixturePage, { ...SEED, stageLabels: 'unlabelled' });
      // `no-stages` is derived from where the ChangeOrder has got to. Without
      // that derivation the row is `unknown` for an unrelated reason and the
      // guard below would be satisfied by the wrong state; fail here, naming it.
      await fx.assertPropagationSupported();
    });

    test.afterAll(async () => {
      try {
        if (fx) await fx.teardown();
      } finally {
        if (fixturePage) await fixturePage.close();
      }
    });

    test('a zero-stage rollout draws no Complete step either', async ({ page }) => {
      /*
       * The complement of the test above it, and NOT a second count of the
       * segments. This asks the narrower question the appended step introduced:
       * the console appends the Complete segment under the SAME guard that
       * suppresses the strip, and the defect this pins is that guard being
       * relaxed for the trailing segment alone.
       *
       * A lone Complete segment on `flex: 1` would fill the cell, which is the
       * exact shape of the full-width green bar the guard was put there to stop
       * — and on a rollout that has travelled nothing it would claim completion
       * as well as width.
       */
      const row = await seededStrip(page, fx.changeOrderSlug);

      // The guard's own input, asserted rather than assumed: a row that reached
      // this test in some other state would make the absence below meaningless.
      expect(row.state).toBe('no-stages');
      expect(row.titles.filter((title) => COMPLETE_SEGMENT_TITLE.test(title))).toEqual([]);
    });
  });
});

/**
 * The Component column and the Component filter, over two rollouts seeded for
 * the purpose: one whose Space is in a Component, and one whose Space is in
 * none. The second is the one the empty marker and the filter's exclusion are
 * about, and the fixture always puts its Spaces in a Component.
 */
test.describe('the Component column and filter', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: RolloutFixture;
  let fixturePage: Page;
  let looseSpaceId: string | undefined;
  let looseOrderSlug: string;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    fx = await buildRolloutFixture(fixturePage, { resources: 'minimal', releasable: false, workflow: 'none' });

    const api = new ApiHelper(fixturePage);
    const looseSpace = await api.createSpace({
      space: { Slug: `${fx.appLabel}-loose`, Labels: { Owner: 'E2E' } } as never,
    });
    looseSpaceId = (looseSpace as { SpaceID: string }).SpaceID;
    looseOrderSlug = `${fx.appLabel}-loose-order`;
    await api.createChangeOrder({
      spaceId: looseSpaceId,
      changeOrder: { Slug: looseOrderSlug, InScopeSpaceIDs: [looseSpaceId] } as never,
    });
  });

  test.afterAll(async () => {
    try {
      if (looseSpaceId) await new ApiHelper(fixturePage).deleteSpace(looseSpaceId, true);
    } catch (error) {
      console.warn(`[rollouts-console] could not delete Space ${looseSpaceId}: ${String(error)}`);
    }
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  const rowOf = (consoleRegion: Locator, slug: string) => consoleRegion.locator(`[data-rollout-slug="${slug}"]`);

  test('shows the Component of each rollout, and a dash where there is none', async ({ page }) => {
    // Both seeded slugs start with the Component's slug, so one search shows both rows.
    const consoleRegion = await assertOurConsole(page);
    await consoleRegion
      .getByRole('searchbox', { name: rolloutsConsoleCopy.filters.searchPlaceholder })
      .fill(fx.appLabel);
    await expect(rowOf(consoleRegion, fx.changeOrderSlug)).toBeVisible({ timeout: 20_000 });
    await expect(rowOf(consoleRegion, looseOrderSlug)).toBeVisible();

    await expect(
      consoleRegion.getByRole('row').getByText(rolloutsConsoleCopy.columns.component, { exact: true }),
    ).toBeVisible();

    const component = rowOf(consoleRegion, fx.changeOrderSlug).getByTestId('rollout-component');
    const link = component.getByRole('link', { name: fx.appLabel, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/components?app=${encodeURIComponent(fx.appLabel)}`);

    await expect(rowOf(consoleRegion, looseOrderSlug).getByTestId('rollout-component')).toHaveText('—');
    await expect(rowOf(consoleRegion, looseOrderSlug).getByTestId('rollout-component').getByRole('link')).toHaveCount(0);
  });

  test('the Component filter shows only that Component’s rollouts, and Clear resets it', async ({ page }) => {
    const consoleRegion = await assertOurConsole(page);
    await expect(rowOf(consoleRegion, looseOrderSlug)).toBeVisible({ timeout: 20_000 });

    const select = consoleRegion.getByRole('combobox', { name: rolloutsConsoleCopy.filters.component, exact: true });
    await expect(select).toHaveValue('all');
    await select.selectOption(fx.appLabel);

    // The org is shared, but this Component is the fixture's own and holds one rollout.
    const rows = consoleRegion.locator('[data-rollout-slug]');
    await expect(rows).toHaveCount(1);
    await expect(rowOf(consoleRegion, fx.changeOrderSlug)).toBeVisible();
    await expect(rowOf(consoleRegion, looseOrderSlug)).toHaveCount(0);

    await consoleRegion.getByRole('button', { name: rolloutsConsoleCopy.filters.clear }).click();
    await expect(select).toHaveValue('all');
    await expect(rowOf(consoleRegion, looseOrderSlug)).toBeVisible();
    await expect(rowOf(consoleRegion, fx.changeOrderSlug)).toBeVisible();
  });
});

/**
 * The live region's three behaviours, each proven rather than asserted to exist.
 *
 * A live region is invisible in a screenshot and identical in a diff whether or
 * not these hold. They are the whole value of the component, and a rewrite that
 * looks equivalent drops all three — which is why it was extracted from
 * `ReleaseLane.tsx` rather than written again.
 */
test.describe('rollouts console live region', () => {
  /*
   * ⚠️ ONE `role="status"` ON THIS ROUTE, NOT THE CONSOLE'S OWN TESTID.
   *
   * `RolloutsPage` passes `onAnnounce`, so the console renders NO region of
   * its own and hands its sentence to the page's `#announce` instead — that is
   * the fix for the two-live-regions defect this file's own earlier run found.
   * Asserting `[data-testid="rollouts-announce"]` here would look for the
   * element the fix makes NOT exist on this route, and every test below would
   * fail for a reason that has nothing to do with a regression.
   *
   * Querying by `role="status"` instead asserts what a screen reader actually
   * sees, independent of which of the two implementations is live — the same
   * black-box preference that governs everything else in this file.
   */
  test('exists, and is silent on mount', async ({ page }) => {
    await assertOurConsole(page);

    const region = page.getByRole('status');
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute('role', 'status');
    await expect(region).toHaveAttribute('aria-live', 'polite');

    /*
     * A live region that announces as it appears reads the page aloud at someone
     * who has just arrived and asked for nothing — worse than having none,
     * because the noise arrives before any action. The mount guard is what
     * prevents it, and this is the only way to see the guard working.
     */
    await page.waitForTimeout(600);
    await expect(region).toHaveText('');
  });

  test('announces the resulting list after a user action, not the action', async ({ page }) => {
    await assertOurConsole(page);

    const hiddenToggle = page.getByRole('button', { name: /finished or aborted, hidden$/ });
    test.skip(!(await hiddenToggle.isVisible().catch(() => false)), 'No terminal rollouts to reveal.');

    await hiddenToggle.click();

    // What the user cannot see is what came back — not that they pressed a button.
    await expect(page.getByRole('status')).toHaveText(/\d+ rollouts? shown/, {
      timeout: 5_000,
    });
  });

  test('confirms a refresh once, and does not repeat it', async ({ page }) => {
    await assertOurConsole(page);

    const region = page.getByRole('status');
    const refresh = page.getByRole('button', { name: 'Refresh' });

    await region.evaluate((el) => {
      (window as unknown as { __spoken: string[] }).__spoken = [];
      new MutationObserver(() => {
        const t = el.textContent ?? '';
        if (t) (window as unknown as { __spoken: string[] }).__spoken.push(t);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    // Pressing Refresh SHOULD say what came back — a screen-reader user has no
    // other signal that the request finished. My first version of this test
    // asserted silence here and was simply wrong about the product.
    await refresh.click();
    await expect(region).toHaveText(/\d+ rollouts? shown/, { timeout: 5_000 });

    // Pressing it again with nothing changed must NOT say it a second time.
    // This is the value-keying: repeating "10 rollouts shown." every time
    // someone checks for news is how a live region becomes the first thing a
    // user switches off.
    await refresh.click();
    await page.waitForTimeout(1_500);

    const utterances = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    expect(utterances.length).toBe(1);
  });

  test('coalesces a burst of changes into one utterance', async ({ page }) => {
    await assertOurConsole(page);

    const hiddenToggle = page.getByRole('button', { name: /finished or aborted, hidden$/ });
    test.skip(!(await hiddenToggle.isVisible().catch(() => false)), 'No terminal rollouts to toggle.');

    const region = page.getByRole('status');
    await region.evaluate((el) => {
      (window as unknown as { __spoken: string[] }).__spoken = [];
      new MutationObserver(() => {
        const t = el.textContent ?? '';
        if (t) (window as unknown as { __spoken: string[] }).__spoken.push(t);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    // Two flips inside the debounce window: the list ends where it started, and
    // the intermediate state must never be spoken.
    await hiddenToggle.click();
    await hiddenToggle.click();
    await page.waitForTimeout(1_200);

    const utterances = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    // `aria-live="polite"` QUEUES rather than interrupts, so an undebounced
    // burst is not dropped — it is read out in full, after the user has moved on.
    expect(utterances.length).toBeLessThanOrEqual(1);
  });
});
