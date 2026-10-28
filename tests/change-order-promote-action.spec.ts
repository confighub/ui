// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The Promote BUTTON — `useChangeOrderActions.ts` driven through the UI that calls it.
 *
 * WHY THIS FILE EXISTS. Most ChangeOrder specs advance state with the fixture's
 * `promoteStage` helper, which issues an upgrade call of its own and never
 * loads the hook. So the response walk, the refusal handling, and every word
 * the hook puts in the footer had no coverage, and a broken Promote handler
 * shipped green.
 *
 * WHAT THESE TESTS ASSERT. Every one drives the real button against a stubbed
 * `POST /api/promote`, because each reaches an answer a server will not produce
 * on demand. They cover the HANDLER, not the server contract. A real promotion
 * through the button is clicked in `change-orders-console-promote.spec.ts` and
 * `change-order-custom-prerequisite.spec.ts`.
 *
 * THE ANSWERS THAT ARE NOT THROWS. 207 Multi-Status carries per-Space,
 * per-resource and per-LINK `Error` fields on a promise that resolves; 200 with
 * every variant already level is a success that wrote nothing. Both read as
 * done unless something walks the body.
 *
 * THE ANSWERS THAT ARE THROWS AND CARRY A BODY. 400 states why the server
 * refused, and 409 names every gate holding the stage. Both write nothing, and
 * both must say so rather than surfacing as a status code.
 *
 * THE DRY RUN RUNS ON LOAD. The stage card asks the server what a promotion would
 * do as soon as the stage is open, and Promote is confirmed in place, in the card,
 * on that answer. So a refused or held dry run is a state of the card before
 * anything is pressed, and the plan digest an apply carries is the one of the
 * latest dry run.
 */
import { type Page, type Request } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';

import { type ChangeOrderFixture, buildChangeOrderFixture } from './fixtures/change-order-fixture';

/*
 * Serial, so that one worker builds the fixture once for the whole file. No
 * test writes through the server — every promotion is stubbed — so `dev`
 * stays promotable for each of them whatever order they run in.
 */
test.describe.configure({ mode: 'serial' });

/** The body of a request, or `{}` when it has none that parses. */
function bodyOf(request: Request): Record<string, unknown> {
  try {
    return (request.postDataJSON() as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/**
 * The promotion itself, as against the dry runs that preview it.
 *
 * A dry run goes to the same route and writes nothing — the stage card asks one
 * to state what a promotion would do, and the page asks others for each stage's
 * gates — so `DryRun` in the body, or `dry_run=true`, is what tells a promotion
 * from a preview. Counting previews would report every opened stage as a
 * promotion that happened.
 */
const isPromote = (request: Request) => {
  if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/promote') return false;
  return new URL(request.url()).searchParams.get('dry_run') !== 'true' && bodyOf(request).DryRun !== true;
};

/**
 * The dry run the stage panel makes to show what a promotion would write, forced
 * past the gates. It is not the card's dry run, and it alone asks for each Unit's
 * configuration.
 */
const isStagePanelPreview = (url: string) =>
  (new URL(url).searchParams.get('include') ?? '').split(',').includes('ConfigData');

/**
 * The card's dry run: it plans exactly the promotion Promote would send, over the
 * stage's Spaces (`WhereSpace`), and its plan is what the apply carries.
 */
const isPromotePreview = (request: Request) =>
  request.method() === 'POST' &&
  new URL(request.url()).pathname === '/api/promote' &&
  new URL(request.url()).searchParams.get('dry_run') === 'true' &&
  !isStagePanelPreview(request.url()) &&
  bodyOf(request).WhereSpace !== undefined;

/**
 * Open `dev` — the first promotable stage of the fixture's sequence — and wait
 * for its Promote control.
 *
 * Promoting from here is two gestures rather than one — the control turns into a
 * confirmation in place, and the confirmation writes — so `promoteStage` below
 * performs both rather than leaving half of it at each call site.
 */
async function openAtDev(page: Page, fx: ChangeOrderFixture): Promise<void> {
  await page.goto(`${fx.changeOrderPath}/dev`);
  await expect(page.locator('[data-testid="stage-merge"][data-promote-stage="dev"]')).toBeVisible({ timeout: 30000 });
}

/**
 * Press Promote, and Confirm when the stage asks for it.
 *
 * A stage with nothing wrong promotes on the click (`data-one-click`); a retry,
 * an "…anyway" or a dry run that could not answer opens the confirm in place.
 *
 * `method: 'p'` presses "Promote only", the button beside the main one. Every
 * test whose stubbed promotion SUCCEEDS promotes only: "Promote and release" would
 * go on to a real release, which would leave `dev` released for the tests after it.
 */
async function promoteStage(page: Page, { stage = 'dev', method = 'pr' }: { stage?: string; method?: 'pr' | 'p' } = {}): Promise<void> {
  await expect(page.locator(`[data-promote-stage="${stage}"]`)).toBeVisible();
  const button =
    method === 'p'
      ? page.locator('[data-testid="stage-merge-other"][data-method="p"]')
      : page.locator(`[data-testid="stage-merge"][data-promote-stage="${stage}"]`);
  // Read once the dry run has answered: before that, the stage cannot say it needs no confirm.
  const oneClick = await expect(button)
    .toHaveAttribute('data-one-click', 'true', { timeout: 20000 })
    .then(
      () => true,
      () => false,
    );
  await button.click();
  if (oneClick) return;
  const confirm = page.locator('[data-confirm]');
  await expect(confirm).toBeVisible({ timeout: 15000 });
  await confirm.click();
}

const statusBox = (page: Page) => page.getByTestId('stage-status');

test.describe('ChangeOrder mode — the Promote button', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: ChangeOrderFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    const fixtureContext = await newAuthorizedContext(browser);
    fixturePage = await fixtureContext.newPage();
    await fixturePage.goto('/', { waitUntil: 'domcontentloaded' });
    await fixturePage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await expect
      .poll(
        async () => (await hubApi.get('/api/space', { params: { limit: 1 } })).status(),
        { timeout: 60000, intervals: [1000] }
      )
      .toBe(200);
    /*
     * `minimal`: every promotion answer is stubbed, so the seeded resources
     * matter only to the dry runs that reach the server, and one is enough.
     */
    fx = await buildChangeOrderFixture(fixturePage, { resources: 'minimal' });
  });

  test.afterAll(async () => {
    try {
      if (fx) await fx.teardown();
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  test('a partly landed promote reads as partial, never as untouched', async ({ page }) => {
    /*
     * The dangerous middle state: some of what the promotion writes lands and
     * some does not, so the Spaces HAVE moved but the promotion did not finish.
     * Nothing about it looks broken — the resources are all there, the graph
     * would happily redraw — so the footer is the only thing standing between a
     * user and a silent half-promote. Telling them "Nothing was changed there"
     * is the product asserting the opposite of what happened.
     *
     * Reached through a 207 carrying one clean resource, one errored resource
     * and one errored LINK. The link is the half with no precedent: the
     * client-side promotion copied links without reading the answers, so a
     * relationship that failed to land was invisible however carefully the
     * resources were checked.
     */
    let promotes = 0;

    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        const request = route.request();
        if (!isPromote(request)) return route.fallback();
        promotes += 1;
        // 207 Multi-Status: the status a bare check passes and `.unwrap()`
        // resolves on. Every failure is inside the body.
        return route.fulfill({
          status: 207,
          contentType: 'application/json',
          body: JSON.stringify({
            Spaces: [
              {
                SpaceID: fx.spaces.dev.spaceId,
                SpaceSlug: 'dev',
                Action: 'Promote',
                Units: [
                  { Action: 'Upgrade', Slug: 'app' },
                  {
                    Action: 'Upgrade',
                    Slug: 'worker',
                    Error: { Message: 'simulated upgrade refusal' },
                  },
                ],
                Links: [
                  {
                    Action: 'Create',
                    Slug: 'app-to-config',
                    Error: { Message: 'simulated link refusal' },
                  },
                ],
              },
            ],
          }),
        });
      }
    );

    await openAtDev(page, fx);

    await promoteStage(page, { method: 'p' });

    const error = page.getByTestId('change-order-foot-error');
    await expect(error).toBeVisible({ timeout: 30000 });
    expect(promotes, 'the promotion never ran').toBeGreaterThan(0);

    // 1. The state is NAMED. A 207 resolves without throwing, so arriving here
    //    at all is the per-item inspection working.
    await expect(error).toContainText('partly failed');

    // 2. It does not claim the Spaces were left alone — one resource really did
    //    take the change. THE defect this test exists for.
    await expect(error).not.toContainText('Nothing was changed');

    // 3. Both failures reach the reader in the server's own words, rather than
    //    being flattened into a generic failure or dropped at the link level.
    await expect(error).toContainText('simulated upgrade refusal');
    await expect(error).toContainText('simulated link refusal');

    // 4. The box is in its failed state, so the failure outlives the toast.
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'failed');

    /*
     * THE WAY FORWARD IS A RETRY OF THE SAME PROMOTION. There is no narrower
     * retry and there must not be one: a promotion decides per resource what
     * each variant still needs, so running it again completes what did not land
     * and repeats nothing that did. What this asserts is that the affordance
     * SURVIVES the failure — a box that went inert would leave the reader
     * holding a half-promoted stage with nothing to press. The card's own dry
     * run reaches the real server here, which plans `dev` cleanly, so the retry
     * is offered outright.
     */
    const promotesBefore = promotes;
    const retry = statusBox(page).getByRole('button', { name: /^Retry/ });
    await expect(retry).toBeVisible({ timeout: 30000 });
    await expect(retry).toBeEnabled();
    await retry.click();
    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toBeVisible({ timeout: 15000 });
    await confirm.click();
    await expect
      .poll(() => promotes, { timeout: 30000, intervals: [500, 1000] })
      .toBeGreaterThan(promotesBefore);
  });

  /*
   * ⚠️ THE TEST THAT WOULD HAVE CAUGHT THE ORIGINAL BUG, AND DID NOT EXIST.
   *
   * A stage's Spaces come from the ChangeWorkflow's selector; the Spaces a
   * change order is headed for come from its own `InScopeSpaceIDs`. They are
   * authored in different places and diverge legitimately — and where they do,
   * the server promotes the ones in both and reports the rest as `Skipped`,
   * with a reason and NO error field anywhere in the body.
   *
   * So the response is a clean 200, every error channel empty, one Space really
   * promoted. A reader checking only those was told "Promoted" while two of
   * three variants never got the change: the exact failure moving promotion
   * server-side was meant to end. It was reachable through this button the
   * whole time and nothing here looked.
   */
  test('variants the change order does not cover are named, not quietly dropped', async ({
    page,
  }) => {
    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        const request = route.request();
        if (!isPromote(request)) return route.fallback();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            Spaces: [
              {
                SpaceID: fx.spaces.dev.spaceId,
                SpaceSlug: `${fx.appLabel}-dev`,
                Action: 'Promote',
                Units: [{ Action: 'Upgrade', Slug: 'app' }],
              },
              {
                SpaceID: '00000000-0000-0000-0000-0000000000e1',
                SpaceSlug: `${fx.appLabel}-dev-eu`,
                Action: 'Skipped',
                Reason:
                  "change order 'r-1' is not headed for this space, so there is nothing to promote into it; add the space to its InScopeSpaceIDs first",
              },
              {
                SpaceID: '00000000-0000-0000-0000-0000000000e2',
                SpaceSlug: `${fx.appLabel}-dev-ap`,
                Action: 'Skipped',
                Reason:
                  "change order 'r-1' is not headed for this space, so there is nothing to promote into it; add the space to its InScopeSpaceIDs first",
              },
            ],
          }),
        });
      }
    );

    await openAtDev(page, fx);
    await promoteStage(page, { method: 'p' });

    const error = page.getByTestId('change-order-foot-error');
    await expect(error).toBeVisible({ timeout: 30000 });

    // 1. BOTH variants are named. A 200 with empty error fields is what this
    //    has to see through.
    await expect(error).toContainText('dev-eu');
    await expect(error).toContainText('dev-ap');

    // 2. The server's remedy reaches the screen whole, because it is the only
    //    thing on it that tells the reader what to do.
    await expect(error).toContainText('add the space to its InScopeSpaceIDs first');

    // 3. It reads as incomplete, not as a promotion.
    await expect(error).toContainText('Promote incomplete');
    await expect(error).not.toContainText('Nothing was changed');

    // 4. And it does not send them round a loop that cannot help: these Spaces
    //    are outside the change order's scope and every run skips them, so the
    //    failed box offers no retry and no Promote.
    await expect(error).not.toContainText('Promote again to finish');
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'failed');
    await expect(statusBox(page).getByRole('button', { name: /^Retry/ })).toHaveCount(0);
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
  });

  /*
   * ⚠️ REPORTED IS NOT THE SAME AS HOPELESS, AND THE ADVICE TURNS ON WHICH.
   *
   * A Space that failed was being written to and stopped; a Space blocked on an
   * apply was waiting on an upstream that failed THIS run. Both need reporting
   * — the reader has to know those variants did not get the change — and both
   * are finished by fixing the cause and running it again. Only a Space the
   * change order is not headed for is beyond a retry.
   *
   * Told otherwise, a reader with an ordinary cascade is sent to widen a scope
   * that was never the problem, and the remedy that would have worked goes
   * unmentioned. This drives the cascade through the button to pin which of the
   * two sentences reaches the screen.
   */
  test('a failure and the variant blocked behind it are offered the retry that works', async ({
    page,
  }) => {
    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        const request = route.request();
        if (!isPromote(request)) return route.fallback();
        return route.fulfill({
          status: 207,
          contentType: 'application/json',
          body: JSON.stringify({
            Spaces: [
              {
                SpaceID: fx.spaces.dev.spaceId,
                SpaceSlug: `${fx.appLabel}-dev`,
                Action: 'Promote',
                Units: [{ Action: 'Upgrade', Slug: 'app' }],
              },
              {
                SpaceID: '00000000-0000-0000-0000-0000000000f1',
                SpaceSlug: `${fx.appLabel}-dev-eu`,
                Action: 'Failed',
                Error: { Message: 'simulated merge conflict on app' },
              },
              {
                SpaceID: '00000000-0000-0000-0000-0000000000f2',
                SpaceSlug: `${fx.appLabel}-staging`,
                Action: 'Blocked',
                Reason: `takes from space ${fx.appLabel}-dev-eu, whose promotion did not complete`,
              },
            ],
          }),
        });
      }
    );

    await openAtDev(page, fx);
    await promoteStage(page, { method: 'p' });

    const error = page.getByTestId('change-order-foot-error');
    await expect(error).toBeVisible({ timeout: 30000 });

    // Both are named — neither is silently dropped.
    await expect(error).toContainText('simulated merge conflict');
    await expect(error).toContainText('whose promotion did not complete');

    // AND THE ADVICE IS THE ONE THAT WORKS. Fix the conflict, run it again,
    // and the blocked variant follows.
    await expect(error).toContainText('Promote again to finish');
    await expect(error).not.toContainText('Fix this before you promote again');
    // Nothing here is about the change order's scope, so it must not say so.
    await expect(error).not.toContainText('InScopeSpaceIDs');
    // A shape a retry can finish: the failed box offers one, or a re-check first.
    await expect(statusBox(page)).toHaveAttribute('data-stage-state', 'failed');
    await expect(
      statusBox(page).getByRole('button', { name: new RegExp(`^(Retry|${stageCardCopy.merge.checkAgain})`) }).first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test('a refused preview or promote reports the server reason, never a bare status code', async ({
    page,
  }) => {
    /*
     * A request-level refusal, as opposed to a per-item 207, at both places it
     * can arrive. The body is the shape the API really answers with — lower-case
     * `message` — and that spelling is exactly what made this worth a test: the
     * reader was shown "the request failed (400)" while the server had said
     * precisely what was wrong. A status code is not something anyone can act on.
     */
    let refuse: 'preview' | 'promote' = 'preview';
    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        const request = route.request();
        if (refuse === 'preview' && isPromotePreview(request)) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              message:
                "change order 'r-1' has completed ChangeWorkflow 'standard', so there is nothing left to promote",
            }),
          });
        }
        if (refuse === 'promote' && isPromote(request)) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              message: 'Error on Unit: the change order is not in a state that can be replayed.\n',
            }),
          });
        }
        return route.fallback();
      }
    );

    /*
     * THE PREVIEW REFUSED. The dry run runs as the stage opens, so it is the
     * first thing that can refuse, and the server's sentence is the only useful
     * thing in the box. Beside a live Promote it would offer a promotion the
     * server has already refused, so the box offers nothing.
     */
    await page.goto(`${fx.changeOrderPath}/dev`);
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'dryRunRefused', { timeout: 30000 });
    await expect(box).toContainText('has completed ChangeWorkflow');
    await expect(box).not.toContainText('the request failed');
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);

    // THE PROMOTION REFUSED, after a preview the server accepted.
    refuse = 'promote';
    await openAtDev(page, fx);
    await promoteStage(page, { method: 'p' });

    const error = page.getByTestId('change-order-foot-error');
    await expect(error).toBeVisible({ timeout: 30000 });
    await expect(error).toContainText('the change order is not in a state that can be replayed');
    await expect(error).not.toContainText('the request failed (400)');

    // Nothing landed at all, so — unlike a partial — saying the Spaces were
    // untouched is the true sentence here.
    await expect(error).toContainText('not changed');
  });

  /*
   * ⚠️ SUCCEEDING AND HAVING ACTED ARE DIFFERENT THINGS, and this is the only
   * place the difference is driven through a real screen.
   *
   * A promotion whose variants all already hold the change is a clean 200 that
   * wrote nothing: `Unchanged` throughout, no error anywhere in the body. That is
   * a success, and it is also a promotion that did not happen. Announcing it as
   * "Promoted" tells somebody their change shipped when no Space was touched —
   * and it is the reading a page gets for free by checking only that the request
   * succeeded, which is why this is asserted on the announcement rather than on
   * the absence of an error.
   *
   * Stubbed, because a stage that has really taken the change is offered
   * Release instead of Promote, so the real already-promoted case has no
   * control to press.
   */
  test('a promotion that changes nothing is never announced as a promotion', async ({ page }) => {
    const unchanged = JSON.stringify({
      Spaces: [
        {
          SpaceID: fx.spaces.dev.spaceId,
          SpaceSlug: `${fx.appLabel}-dev`,
          Action: 'Unchanged',
          Units: [{ Action: 'Unchanged', Slug: 'app', Reason: 'AlreadyTaken' }],
        },
      ],
    });

    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        if (!isPromote(route.request())) return route.fallback();
        return route.fulfill({ status: 200, contentType: 'application/json', body: unchanged });
      }
    );
    // The default method releases after promoting. The release is answered here, so
    // `dev` is not really released for the tests after this one.
    await page.route(
      (url) => /^\/api\/space\/[^/]+\/release$/.test(url.pathname),
      async (route) => {
        const body = route.request().postDataJSON() as { DryRun?: boolean } | null;
        if (route.request().method() !== 'POST' || body?.DryRun === true) return route.fallback();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Release: { ReleaseID: 'stub', ReleaseNum: 1 } }) });
      }
    );

    // On the default method, "Promote and release", which every stage with Targets starts on.
    await openAtDev(page, fx);
    await expect(page.locator('[data-testid="stage-merge"][data-promote-stage="dev"]')).toHaveAttribute('data-method', 'pr');
    await promoteStage(page);

    // The sentence `didNothing` exists to produce, and NOT the one a real
    // promotion gets.
    await expect(page.locator('#announce')).toContainText('Nothing to promote to dev.', {
      timeout: 30000,
    });
    await expect(page.locator('#announce')).not.toContainText('Promoted to dev.');
  });

  /*
   * ⚠️ THE CARD MUST NOT CLAIM TO HAVE PREVIEWED WHAT IT COULD NOT.
   *
   * A dry run blocks every Space that takes from another Space of the same
   * promotion — it cannot plan against a state that does not exist yet — and
   * that is the shape of every chained ChangeOrder, not an edge case. Those Spaces
   * come back with a reason and no plan, so a line counting them as reached
   * states a coverage nothing looked at, in the one place a reader checks what
   * Promote will do.
   *
   * The sentence must also stay CALM. Nothing is wrong here, and a warning on
   * the commonest topology the product has would teach a reader to skip the
   * line that matters.
   */
  test('a preview that could not reach every variant says so, without alarm', async ({ page }) => {
    const blocked = JSON.stringify({
      DryRun: true,
      Spaces: [
        {
          SpaceID: fx.spaces.dev.spaceId,
          SpaceSlug: `${fx.appLabel}-dev`,
          Action: 'Blocked',
          Reason: 'takes from space base, which this promotion promotes first',
        },
      ],
    });

    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        if (!isPromotePreview(route.request())) return route.fallback();
        return route.fulfill({ status: 200, contentType: 'application/json', body: blocked });
      }
    );

    await openAtDev(page, fx);

    // On load: the card's dry run has answered before anything is pressed.
    const coverage = page.locator('[data-testid="stage-dry-run"][data-fidelity="coverage-incomplete"]');
    await expect(coverage).toBeVisible({ timeout: 30000 });
    await expect(coverage).toContainText('Previewed 0 of 1');
    // It names the reason, so a short preview does not read as a fault.
    await expect(coverage).toContainText(/takes? from (an )?earlier variants?/);
    await expect(coverage).not.toContainText(/fail|error/i);

    // And the promotion is still offered: nothing here is a refusal.
    await expect(page.locator('[data-testid="stage-merge"][data-promote-stage="dev"]')).toBeEnabled();
  });

  /*
   * ⚠️ THE SAFETY PROPERTY THE WHOLE MIGRATION RESTS ON, ASSERTED ON THE WIRE.
   *
   * The card previews with a dry run and applies with the plan digest that dry
   * run returned, so a ChangeOrder that moved while the reader looked — a
   * resource added upstream, a gate that stopped holding — is refused with 412
   * instead of promoting something the reader never saw.
   *
   * Asserting the 412 copy proves nothing about this: a stubbed 412 arrives
   * whatever the client sent, and the guard could be deleted outright with
   * every other spec still green. What has to be checked is the REQUEST — that
   * the digest returned by the preview is the digest carried by the apply. So
   * the two legs are captured separately and compared.
   *
   * The dry run runs on load, and again on focus or at confirm when its answer
   * is old, so each answer here carries a digest of its own and the apply must
   * carry the LATEST one: an earlier digest would be refused as stale for a
   * difference the reader was never shown.
   */
  test('the promotion carries the plan digest of its latest preview', async ({ page }) => {
    const plans: string[] = [];
    const selectors: string[] = [];
    let appliedBody: { ExpectedPlan?: string; WhereSpace?: string } | null = null;

    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        const request = route.request();
        const body = bodyOf(request) as { WhereSpace?: string };
        if (isPromotePreview(request)) {
          const plan = `plan-digest-${plans.length + 1}`;
          plans.push(plan);
          selectors.push(body.WhereSpace ?? '');
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              DryRun: true,
              Plan: plan,
              Spaces: [
                {
                  SpaceID: fx.spaces.dev.spaceId,
                  SpaceSlug: `${fx.appLabel}-dev`,
                  Action: 'Promote',
                  Units: [{ Action: 'Upgrade', Slug: 'app' }],
                },
              ],
            }),
          });
        }
        if (!isPromote(request)) return route.fallback();
        appliedBody = body as { ExpectedPlan?: string; WhereSpace?: string };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            Spaces: [
              {
                SpaceID: fx.spaces.dev.spaceId,
                SpaceSlug: `${fx.appLabel}-dev`,
                Action: 'Promote',
                Units: [{ Action: 'Upgrade', Slug: 'app' }],
              },
            ],
          }),
        });
      }
    );

    await openAtDev(page, fx);
    await expect.poll(() => plans.length, { timeout: 30000 }).toBeGreaterThanOrEqual(1);
    await promoteStage(page, { method: 'p' });

    await expect.poll(() => appliedBody, { timeout: 30000 }).not.toBeNull();

    // THE ASSERTION. Not that a 412 renders nicely — that the apply asked the
    // server to confirm exactly the plan of the last answer the card was given.
    expect(appliedBody!.ExpectedPlan).toBe(plans[plans.length - 1]);

    // And over the same Spaces, because a digest for a different selection
    // would be a guard against the wrong thing.
    expect(appliedBody!.WhereSpace).toBe(selectors[selectors.length - 1]);
  });

  /*
   * A DRY RUN IS REFUSED BY THE GATES A PROMOTION WOULD BE REFUSED BY, and the
   * refusal carries them. This is the same 409 the apply path gets, arriving
   * before anything is pressed — so the box states the hold rather than the
   * reader discovering it after pressing.
   */
  test('a preview refused by its gates names them in the box', async ({ page }) => {
    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        if (!isPromotePreview(route.request())) return route.fallback();
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            Stages: [
              {
                Name: 'dev',
                PreviousStage: 'source',
                Gates: [
                  {
                    Prerequisite: 'Healthy',
                    SpaceSlug: 'base',
                    Satisfied: false,
                    Message: "simulated refusal: Variant 'base' is not healthy",
                  },
                ],
              },
            ],
          }),
        });
      }
    );

    await page.goto(`${fx.changeOrderPath}/dev`);

    // The hold, in the server's own words, in the hold's own slot.
    const box = statusBox(page);
    await expect(box).toHaveAttribute('data-stage-state', 'serverHeld', { timeout: 30000 });
    const held = box.locator('[data-held]');
    await expect(held).toBeVisible();
    await expect(held).toContainText("Variant 'base' is not healthy");
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await expect(page.locator('[data-testid="stage-merge"]')).toHaveCount(0);
  });
});
