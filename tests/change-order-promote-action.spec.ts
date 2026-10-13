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
 */
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { type ChangeOrderFixture, buildChangeOrderFixture } from './fixtures/change-order-fixture';

/*
 * Serial, so that one worker builds the fixture once for the whole file. No
 * test writes through the server — every promotion is stubbed — so `dev`
 * stays promotable for each of them whatever order they run in.
 */
test.describe.configure({ mode: 'serial' });

/**
 * The promotion itself, as against the dry run that previews it.
 *
 * `dry_run=true` goes to the same route and writes nothing — it is how the
 * confirmation states what it is about to do — so the parameter, not the path,
 * is what tells a promotion from a preview. Counting previews would report
 * every opened dialog as a promotion that happened.
 */
const isPromote = (url: string, method: string) =>
  method === 'POST' &&
  new URL(url).pathname === '/api/promote' &&
  new URL(url).searchParams.get('dry_run') !== 'true';

/**
 * The dry run the stage panel makes to show what a promotion would write. It is not the
 * dialog's preview, and it alone asks for each Unit's configuration.
 */
const isStagePanelPreview = (url: string) =>
  (new URL(url).searchParams.get('include') ?? '').split(',').includes('ConfigData');

/** The dry run that plans a promotion without writing it. */
const isPromotePreview = (url: string, method: string) =>
  method === 'POST' &&
  new URL(url).pathname === '/api/promote' &&
  new URL(url).searchParams.get('dry_run') === 'true' &&
  !isStagePanelPreview(url);

/**
 * Open `dev` — the first promotable stage of the fixture's sequence — and wait
 * for its Promote control.
 *
 * Promoting from here is two gestures rather than one — the control opens a
 * confirmation, and the confirmation writes — so `promoteStage` below performs
 * both rather than leaving half of it at each call site.
 */
async function openAtDev(page: Page, fx: ChangeOrderFixture): Promise<void> {
  await page.goto(`/change-orders/${fx.changeOrderSlug}/dev`);
  await expect(page.locator('[data-promote-stage="dev"]')).toBeVisible({ timeout: 30000 });
}

/**
 * Press Promote and confirm it.
 *
 * The confirmation is where the dry run lands, so waiting for the confirm
 * button is also waiting for the preview — pressing before it settles would
 * race the very request the apply's plan digest comes from.
 */
async function promoteStage(page: Page, stage = 'dev'): Promise<void> {
  await page.locator(`[data-promote-stage="${stage}"]`).click();
  const confirm = page.locator('[data-confirm]');
  await expect(confirm).toBeVisible({ timeout: 15000 });
  await confirm.click();
}

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
        if (!isPromote(request.url(), request.method())) return route.fallback();
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

    await promoteStage(page);

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

    /*
     * THE WAY FORWARD IS THE SAME BUTTON. There is no narrower retry any more
     * and there must not be one: a promotion decides per resource what each
     * variant still needs, so running it again completes what did not land and
     * repeats nothing that did. What this asserts is that the affordance
     * SURVIVES the failure — a footer that went inert would leave the reader
     * holding a half-promoted stage with nothing to press.
     */
    const promotesBefore = promotes;
    const again = page.locator('[data-promote-stage="dev"]');
    await expect(again).toBeVisible();
    await expect(again).toBeEnabled();
    await promoteStage(page);
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
        if (!isPromote(request.url(), request.method())) return route.fallback();
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
    await promoteStage(page);

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
    //    are outside the change order's scope and every run skips them.
    await expect(error).not.toContainText('Run the promote again to finish it');
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
        if (!isPromote(request.url(), request.method())) return route.fallback();
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
    await promoteStage(page);

    const error = page.getByTestId('change-order-foot-error');
    await expect(error).toBeVisible({ timeout: 30000 });

    // Both are named — neither is silently dropped.
    await expect(error).toContainText('simulated merge conflict');
    await expect(error).toContainText('whose promotion did not complete');

    // AND THE ADVICE IS THE ONE THAT WORKS. Fix the conflict, run it again,
    // and the blocked variant follows.
    await expect(error).toContainText('Run the promote again to finish it');
    await expect(error).not.toContainText('passes them over in the same way');
    // Nothing here is about the change order's scope, so it must not say so.
    await expect(error).not.toContainText('InScopeSpaceIDs');
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
        if (refuse === 'preview' && isPromotePreview(request.url(), request.method())) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              message:
                "change order 'r-1' has completed ChangeWorkflow 'standard', so there is nothing left to promote",
            }),
          });
        }
        if (refuse === 'promote' && isPromote(request.url(), request.method())) {
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

    await openAtDev(page, fx);

    /*
     * THE PREVIEW REFUSED. The dry run is the first thing the dialog does, so
     * it is also the first thing that can refuse, and the server's sentence is
     * the only useful thing on the screen. Beside a live confirm it would offer
     * a promotion the server has already refused, so Cancel is all there is.
     */
    await page.locator('[data-promote-stage="dev"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog).toContainText('has completed ChangeWorkflow');
    await expect(dialog).not.toContainText('the request failed');
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await expect(page.locator('[data-promote-rel]')).toHaveCount(0);
    await expect(page.locator('.MuiDialogActions-root button')).toHaveCount(1);
    await page.locator('[data-cancel]').click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    // THE PROMOTION REFUSED, after a preview the server accepted.
    refuse = 'promote';
    await promoteStage(page);

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
      async (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: unchanged })
    );

    await page.goto(`/change-orders/${fx.changeOrderSlug}/dev`);
    const promote = page.locator('[data-promote-stage="dev"]');
    await expect(promote).toBeVisible({ timeout: 30000 });
    await promote.click();

    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toBeVisible({ timeout: 10000 });
    await confirm.click();

    // The sentence `didNothing` exists to produce, and NOT the one a real
    // promotion gets.
    await expect(page.locator('#announce')).toContainText('Nothing to promote to dev.', {
      timeout: 30000,
    });
    await expect(page.locator('#announce')).not.toContainText('Promoted to dev.');
  });

  /*
   * ⚠️ THE CONFIRMATION MUST NOT CLAIM TO HAVE PREVIEWED WHAT IT COULD NOT.
   *
   * A dry run blocks every Space that takes from another Space of the same
   * promotion — it cannot plan against a state that does not exist yet — and
   * that is the shape of every chained ChangeOrder, not an edge case. Those Spaces
   * come back with a reason and no plan, so a dialog counting them as reached
   * states a coverage nothing looked at, on the screen its own header calls the
   * single most important place not to overclaim.
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
      async (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: blocked })
    );

    await page.goto(`/change-orders/${fx.changeOrderSlug}/dev`);
    const promote = page.locator('[data-promote-stage="dev"]');
    await expect(promote).toBeVisible({ timeout: 30000 });
    await promote.click();

    const coverage = page.locator('[data-fidelity="coverage-incomplete"]');
    await expect(coverage).toBeVisible({ timeout: 10000 });
    await expect(coverage).toContainText('Previewed 0 of 1');
    // It names the reason, so a short preview does not read as a fault.
    await expect(coverage).toContainText('earlier in this promotion');
    await expect(coverage).not.toContainText(/fail|error/i);

    // And the promotion is still offered: nothing here is a refusal.
    await expect(page.locator('[data-confirm]')).toBeVisible();
  });

  /*
   * ⚠️ THE SAFETY PROPERTY THE WHOLE MIGRATION RESTS ON, ASSERTED ON THE WIRE.
   *
   * The confirmation previews with a dry run and applies with the plan digest
   * that dry run returned, so a ChangeOrder that moved while the dialog was open —
   * a resource added upstream, a gate that stopped holding — is refused with
   * 412 instead of promoting something the reader never saw.
   *
   * Asserting the 412 copy proves nothing about this: a stubbed 412 arrives
   * whatever the client sent, and the guard could be deleted outright with
   * every other spec still green. What has to be checked is the REQUEST — that
   * the digest returned by the preview is the digest carried by the apply. So
   * the two legs are captured separately and compared.
   */
  test('the promotion carries the plan digest its preview returned', async ({ page }) => {
    const PLAN = 'plan-digest-7f3a9c';
    let appliedBody: { ExpectedPlan?: string; WhereSpace?: string } | null = null;
    let previewSelector: string | null = null;

    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        const request = route.request();
        const body = request.postDataJSON() as { WhereSpace?: string };
        if (isPromotePreview(request.url(), request.method())) {
          previewSelector = body?.WhereSpace ?? null;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              DryRun: true,
              Plan: PLAN,
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
        if (!isPromote(request.url(), request.method())) return route.fallback();
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

    await page.goto(`/change-orders/${fx.changeOrderSlug}/dev`);
    const promote = page.locator('[data-promote-stage="dev"]');
    await expect(promote).toBeVisible({ timeout: 30000 });
    await promote.click();

    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toBeVisible({ timeout: 10000 });
    await confirm.click();

    await expect.poll(() => appliedBody, { timeout: 30000 }).not.toBeNull();

    // THE ASSERTION. Not that a 412 renders nicely — that the apply asked the
    // server to confirm exactly the plan the reader was shown.
    expect(appliedBody!.ExpectedPlan).toBe(PLAN);

    // And over the same Spaces, because a digest for a different selection
    // would be a guard against the wrong thing.
    expect(appliedBody!.WhereSpace).toBe(previewSelector);
  });

  /*
   * A DRY RUN IS REFUSED BY THE GATES A PROMOTION WOULD BE REFUSED BY, and the
   * refusal carries them. This is the same 409 the apply path gets, arriving
   * before anything is confirmed — so the dialog states the hold rather than
   * the reader discovering it after pressing.
   */
  test('a preview refused by its gates names them in the dialog', async ({ page }) => {
    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        if (!isPromotePreview(route.request().url(), route.request().method())) {
          return route.fallback();
        }
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

    await page.goto(`/change-orders/${fx.changeOrderSlug}/dev`);
    const promote = page.locator('[data-promote-stage="dev"]');
    await expect(promote).toBeVisible({ timeout: 30000 });
    await promote.click();

    // The hold, in the server's own words, in the hold's own slot — not in the
    // slot that replaces the dialog body.
    const held = page.locator('[data-held]');
    await expect(held).toBeVisible({ timeout: 10000 });
    await expect(held).toContainText("Variant 'base' is not healthy");
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
  });
});
