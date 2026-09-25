// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The Promote BUTTON — `useRolloutActions.ts` driven through the UI that calls it.
 *
 * WHY THIS FILE EXISTS. Every other rollout spec advances state with the
 * fixture's `promoteStage` helper, which issues an upgrade call of its own and
 * never loads the hook. So the whole of `useRolloutActions` — the response
 * walk, the refusal handling, and every word it puts in the footer — had no
 * coverage at all, and a broken Promote handler shipped green.
 *
 * WHAT THESE TESTS ASSERT. Every one drives the real button. The stubbed tests
 * come first — they reach answers a server will not produce on demand, and
 * cover the HANDLER rather than the server contract. The end-to-end tests
 * follow and run against a live server, asserting the stage really advances.
 * Order is load-bearing; see the note on `serial` below.
 *
 * A PROMOTION IS ONE CALL, AND "ONE" IS PART OF THE CLAIM. `POST /api/promote`
 * decides per resource what each variant still needs, so a destination already
 * holding everything is written to no differently from one missing a resource:
 * the client no longer plans, scopes or sequences anything. Several tests below
 * therefore count calls as well as reading the screen — a page that went back
 * to planning promotions itself could still make the tally move, and would be
 * wrong in every way this file was written to catch.
 *
 * THE ANSWERS THAT ARE NOT THROWS. 207 Multi-Status carries per-Space,
 * per-resource and per-LINK `Error` fields on a promise that resolves; 200 with
 * every variant already level is a success that wrote nothing. Both read as
 * done unless something walks the body. The link level had no coverage at all
 * before, because the client-side promotion never inspected links.
 *
 * THE ANSWERS THAT ARE THROWS AND CARRY A BODY. 409 names every gate holding
 * the stage; 412 says the plan the dialog previewed is no longer the plan that
 * would run. Both write nothing, and both must say so rather than surfacing as
 * a status code.
 */
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

import { type RolloutFixture, buildRolloutFixture } from './fixtures/rollout-fixture';

/*
 * Serial, and the ORDER is load-bearing. The two stubbed tests run first
 * because they leave no real trace, so `dev` is still unpromoted when they
 * assert the starting tally. The end-to-end pair runs last and really does
 * advance the rollout: `dev` first, then `staging`, which only becomes
 * promotable once `dev` has taken the change.
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

/** The dry run that plans a promotion without writing it. */
const isPromotePreview = (url: string, method: string) =>
  method === 'POST' &&
  new URL(url).pathname === '/api/promote' &&
  new URL(url).searchParams.get('dry_run') === 'true';

/**
 * The routes the client-side promotion used to write through.
 *
 * Nothing should reach them now. `dry_run=true` is excluded because a bulk
 * PATCH to `/unit` is still how the diff preview and the override baseline are
 * resolved (`useRolloutChanges.ts`, `useRolloutBaseline.ts`) — those are reads,
 * they stay, and catching them would break the pane's contents silently.
 */
const isLegacyPromoteWrite = (url: string, method: string) => {
  const parsed = new URL(url);
  if (parsed.pathname !== '/api/unit') return false;
  if (parsed.searchParams.get('dry_run') === 'true') return false;
  if (method === 'POST') return parsed.searchParams.has('upstream_revision');
  return method === 'PATCH' && parsed.searchParams.get('upgrade') === 'true';
};

/**
 * Open one stage of a rollout, deep-linked, and wait for its Promote control.
 *
 * The rollout's own screen is the only surface that offers a promotion now: the
 * Components graph's rollout mode, which this file used to drive, is retired.
 * Promoting from here is two gestures rather than one — the control opens a
 * confirmation, and the confirmation writes — so `promoteStage` below performs
 * both rather than leaving half of it at each call site.
 */
async function openStage(page: Page, fx: RolloutFixture, stage: string): Promise<void> {
  await page.goto(`/rollouts/${fx.changeOrderSlug}/${stage}`);
  await expect(page.locator(`[data-promote-stage="${stage}"]`)).toBeVisible({ timeout: 30000 });
}

/** Open `dev` — the first promotable stage of the fixture's sequence. */
async function openAtDev(page: Page, fx: RolloutFixture): Promise<void> {
  await openStage(page, fx, 'dev');
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

test.describe('rollout mode — the Promote button', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: RolloutFixture;
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
     * `full`, not `minimal`. The clone test below deletes ONE of a destination's
     * resources and asserts the promote restores exactly that one while leaving
     * the rest alone — an asymmetry a single-resource fixture cannot express,
     * and the asymmetry is the whole point: cloning the base wholesale fails on
     * the resources the Space still has.
     */
    fx = await buildRolloutFixture(fixturePage, { resources: 'full' });
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

    const error = page.getByTestId('rollout-foot-error');
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

    const error = page.getByTestId('rollout-foot-error');
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

    const error = page.getByTestId('rollout-foot-error');
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

  test('a refused promote reports the server reason, never a bare status code', async ({
    page,
  }) => {
    /*
     * A request-level refusal, as opposed to a per-item 207. The body is the
     * shape the API really answers with — lower-case `message` — and that
     * spelling is exactly what made this worth a test: the reader was shown
     * "the request failed (400)" while the server had said precisely what was
     * wrong. A status code is not something anyone can act on.
     */
    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        const request = route.request();
        if (!isPromote(request.url(), request.method())) return route.fallback();
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Error on Unit: the change order is not in a state that can be replayed.\n',
          }),
        });
      }
    );

    await openAtDev(page, fx);

    await promoteStage(page);

    const error = page.getByTestId('rollout-foot-error');
    await expect(error).toBeVisible({ timeout: 30000 });
    await expect(error).toContainText('the change order is not in a state that can be replayed');
    // The bare-status fallback must not be what surfaced.
    await expect(error).not.toContainText('the request failed (400)');

    // Nothing landed at all, so — unlike the test above — saying the Spaces
    // were untouched is the true sentence here.
    await expect(error).toContainText('not changed');
  });

  test('a promotion refused by its gates names them, and says nothing was written', async ({
    page,
  }) => {
    /*
     * 409, which is a THROW carrying a body. `.unwrap()` rejects, so the naive
     * handling is to print a status; the gates are structured precisely so a
     * reader can be told all of what is holding the stage rather than that a
     * request failed.
     *
     * Every failing gate reaches the screen, not the first. A stage held by two
     * things is held by two things, and naming one sends somebody off to fix
     * half the problem.
     */
    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        const request = route.request();
        if (!isPromote(request.url(), request.method())) return route.fallback();
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            Stages: [
              {
                Name: 'dev',
                PreviousStage: 'source',
                Gates: [
                  { Prerequisite: 'Promoted', SpaceSlug: 'base', Satisfied: true },
                  {
                    Prerequisite: 'Released',
                    SpaceSlug: 'base',
                    Satisfied: false,
                    Message: "simulated refusal: 'base' has not released it",
                  },
                  {
                    Prerequisite: 'Healthy',
                    SpaceSlug: 'base',
                    Satisfied: false,
                    Message: "simulated refusal: 'base' is not healthy",
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

    const error = page.getByTestId('rollout-foot-error');
    await expect(error).toBeVisible({ timeout: 30000 });
    await expect(error).toContainText("has not released it");
    await expect(error).toContainText('is not healthy');
    // A refusal writes nothing, and unlike a partial it may say so.
    await expect(error).toContainText('Nothing was changed');
  });

  test('a promotion whose plan moved under it is refused, not applied blind', async ({ page }) => {
    /*
     * 412. The confirmation previews with a dry run and applies with the plan
     * digest it came back with, so a rollout that changed while the dialog was
     * open — a resource added upstream, a gate that stopped holding — fails
     * loudly instead of promoting something the reader was never shown.
     *
     * THE FAILURE THIS RULES OUT IS A SILENT SUCCESS. Without the digest the
     * promotion goes ahead against the new plan and reports itself as done; the
     * sentence the reader confirmed described something else entirely.
     */
    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        const request = route.request();
        if (!isPromote(request.url(), request.method())) return route.fallback();
        return route.fulfill({
          status: 412,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'the promotion no longer matches the plan that was previewed; preview it again',
          }),
        });
      }
    );

    await openAtDev(page, fx);
    await promoteStage(page);

    const error = page.getByTestId('rollout-foot-error');
    await expect(error).toBeVisible({ timeout: 30000 });
    await expect(error).toContainText('no longer what would be written');
    await expect(error).toContainText('Nothing was changed');
  });

  test('promotes a stage whose Spaces already hold every resource', async ({ page }) => {
    /*
     * The ordinary case. `dev` is a clone of base and holds every resource the
     * change touches, so there is nothing to create and only the change itself
     * to carry across.
     *
     * Asserted on the wire as well as in the UI: ONE promotion call, and none
     * of the bulk writes the client-side promotion used to make. A test
     * watching only the tally would still pass against a page that had gone
     * back to planning the promotion itself.
     */
    let promotes = 0;
    let legacyWrites = 0;
    page.on('request', (request) => {
      if (isPromote(request.url(), request.method())) promotes += 1;
      if (isLegacyPromoteWrite(request.url(), request.method())) legacyWrites += 1;
    });

    await openAtDev(page, fx);

    await promoteStage(page);

    await expect(page.locator('#announce')).toContainText('Promoted to dev.', { timeout: 40000 });
    // The footer's error line is the only thing that reports a 207 with
    // per-item errors, so its absence is the claim that every item succeeded —
    // not merely that nothing threw.
    await expect(page.getByTestId('rollout-foot-error')).toHaveCount(0);
    expect(promotes, 'the stage was not promoted through the promote API').toBe(1);
    expect(legacyWrites, 'the page promoted through the old bulk routes').toBe(0);
  });
});

/*
 * Its own fixture, deliberately. This test DELETES a resource to create the
 * "destination is missing something" case, and a deleted resource breaks the
 * upstream chain of every Space downstream of it — `staging` can no longer take
 * the change through a `dev` resource that no longer exists. Sharing the
 * fixture above would make that damage everyone else's precondition.
 */
test.describe('rollout mode — the Promote button, when a resource is missing', () => {
  test.use({ storageState: 'authentication.json' });

  let cloneFx: RolloutFixture;
  let clonePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    clonePage = await context.newPage();
    await clonePage.goto('/', { waitUntil: 'domcontentloaded' });
    await clonePage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    cloneFx = await buildRolloutFixture(clonePage, { resources: 'full' });
  });

  test.afterAll(async () => {
    try {
      if (cloneFx) await cloneFx.teardown();
    } finally {
      if (clonePage) await clonePage.close();
    }
  });

  test('brings back only the missing resource, and carries its links', async ({ page }) => {
    /*
     * A destination genuinely lacking a resource the change carries.
     *
     * `dev`'s copy of the changed resource is removed, so the Space is missing
     * exactly one of the several it otherwise tracks. That asymmetry is the
     * point: the one has to arrive and the rest have to be left alone. Writing
     * the base's resources wholesale fails on the ones dev still has, which is
     * precisely the defect this file was written around — and the reason the
     * decision now belongs to the server, which makes it per resource.
     */
    // Detached: `staging`'s copy links to dev's to track it, and the server
    // refuses to delete a Unit anything still links to.
    const deleted = await hubApi.delete(
      `/api/space/${cloneFx.spaces.dev.spaceId}/unit/${cloneFx.spaces.dev.units.app}`,
      { params: { detach: 'true' } },
    );
    expect(
      deleted.ok(),
      `could not remove dev's app resource: ${deleted.status()} ${await deleted.text()}`
    ).toBeTruthy();

    /*
     * Give the resource a link of its own, so this also covers the step that
     * carries relationships across. The clone creates the `UpgradeUnit` link
     * that makes a resource track its upstream and NOTHING else, so without the
     * copy a promoted resource arrives stripped of every relationship it has
     * upstream — intact to look at, wrong in what it is connected to.
     */
    const linked = await hubApi.post(`/api/space/${cloneFx.spaces.base.spaceId}/link`, {
      data: {
        Slug: 'promote-link-probe',
        FromUnitID: cloneFx.spaces.base.units.app,
        ToUnitID: cloneFx.spaces.base.units.config,
        ToSpaceID: cloneFx.spaces.base.spaceId,
      },
    });
    expect(linked.ok(), `could not link the base resources: ${linked.status()}`).toBeTruthy();

    let promotes = 0;
    let legacyWrites = 0;
    page.on('request', (request) => {
      if (isPromote(request.url(), request.method())) promotes += 1;
      if (isLegacyPromoteWrite(request.url(), request.method())) legacyWrites += 1;
    });

    await openStage(page, cloneFx, 'dev');

    await promoteStage(page);

    // The stage advanced, so the resource came back AND took the change: it
    // arrives at the state before the change, and only the change itself moves
    // it past that.
    await expect(page.locator('#announce')).toContainText('Promoted to dev.', { timeout: 30000 });
    await expect(page.getByTestId('rollout-foot-error')).toHaveCount(0);

    // ONE call did all of it — the creation, the change, and the links below.
    // The per-destination planning the client used to do is gone, and a page
    // that resurrected it would fail here rather than quietly costing N round
    // trips per promotion.
    expect(promotes, 'the promotion was not a single call').toBe(1);
    expect(legacyWrites, 'the page promoted through the old bulk routes').toBe(0);

    /*
     * The link came across with BOTH ends retargeted to dev's own copies. That
     * is the intra-Space case's whole point: a copied link still pointing at
     * the base's resource would reach out of the variant entirely, which is
     * worse than not copying it at all.
     */
    const devApp = (
      await (
        await hubApi.get('/api/unit', {
          params: {
            where: `SpaceID = '${cloneFx.spaces.dev.spaceId}' AND Slug = 'app'`,
            select: 'UnitID,Slug',
          },
        })
      ).json()
    )[0]?.Unit?.UnitID as string | undefined;
    expect(devApp, 'dev never got its app resource back').toBeTruthy();

    const carried = (
      await (
        await hubApi.get('/api/link', {
          params: {
            where: `SpaceID = '${cloneFx.spaces.dev.spaceId}' AND UpdateType != 'UpgradeUnit'`,
          },
        })
      ).json()
    ).map((item: { Link?: { FromUnitID?: string; ToUnitID?: string } }) => item.Link);
    expect(carried, 'the cloned resource arrived without the link it has upstream').toContainEqual(
      expect.objectContaining({
        FromUnitID: devApp,
        ToUnitID: cloneFx.spaces.dev.units.config,
      }),
    );
  });
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
 * Driven from the rollout screen, which is the surface that announces. Its own
 * fixture so the stage is genuinely still promotable: a stage that has already
 * taken the change is offered Release instead of Promote, so the real
 * already-promoted case has no control to press and cannot be reached this way.
 * The response is stubbed to produce the shape without depending on it.
 */
test.describe('rollout mode — a promotion that writes nothing', () => {
  test.use({ storageState: 'authentication.json' });

  let idleFx: RolloutFixture;
  let idlePage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    idlePage = await context.newPage();
    await idlePage.goto('/', { waitUntil: 'domcontentloaded' });
    await idlePage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    idleFx = await buildRolloutFixture(idlePage, { resources: 'full' });
  });

  test.afterAll(async () => {
    try {
      if (idleFx) await idleFx.teardown();
    } finally {
      if (idlePage) await idlePage.close();
    }
  });

  test('a promotion that changes nothing is never announced as a promotion', async ({ page }) => {
    const unchanged = JSON.stringify({
      Spaces: [
        {
          SpaceID: idleFx.spaces.dev.spaceId,
          SpaceSlug: `${idleFx.appLabel}-dev`,
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

    await page.goto(`/rollouts/${idleFx.changeOrderSlug}/dev`);
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
   * that is the shape of every chained rollout, not an edge case. Those Spaces
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
          SpaceID: idleFx.spaces.dev.spaceId,
          SpaceSlug: `${idleFx.appLabel}-dev`,
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

    await page.goto(`/rollouts/${idleFx.changeOrderSlug}/dev`);
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
   * that dry run returned, so a rollout that moved while the dialog was open —
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
                  SpaceID: idleFx.spaces.dev.spaceId,
                  SpaceSlug: `${idleFx.appLabel}-dev`,
                  Action: 'Promote',
                  Units: [{ Action: 'Upgrade', Slug: 'app' }],
                },
              ],
            }),
          });
        }
        appliedBody = body as { ExpectedPlan?: string; WhereSpace?: string };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            Spaces: [
              {
                SpaceID: idleFx.spaces.dev.spaceId,
                SpaceSlug: `${idleFx.appLabel}-dev`,
                Action: 'Promote',
                Units: [{ Action: 'Upgrade', Slug: 'app' }],
              },
            ],
          }),
        });
      }
    );

    await page.goto(`/rollouts/${idleFx.changeOrderSlug}/dev`);
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
   * ⚠️ A PREVIEW THAT FAILS MUST SAY WHY, AND MUST OFFER NOTHING.
   *
   * The dry run is the first thing the dialog does, so it is also the first
   * thing that can refuse. A rollout that cannot be promoted at all — an
   * aborted change order, a completed workflow — is answered 400 before a
   * single gate is evaluated, and the server's sentence is the only useful
   * thing on the screen at that point. Surfaced as a bare status it would tell
   * the reader nothing they can act on; surfaced beside a live confirm it
   * would offer a promotion the server has already refused.
   */
  test('a preview the server refuses states its reason and offers no promotion', async ({
    page,
  }) => {
    await page.route(
      (url) => url.toString().includes('/api/promote'),
      async (route) => {
        if (!isPromotePreview(route.request().url(), route.request().method())) {
          return route.fallback();
        }
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            message:
              "change order 'r-1' has completed ChangeWorkflow 'standard', so there is nothing left to promote",
          }),
        });
      }
    );

    await page.goto(`/rollouts/${idleFx.changeOrderSlug}/dev`);
    const promote = page.locator('[data-promote-stage="dev"]');
    await expect(promote).toBeVisible({ timeout: 30000 });
    await promote.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog).toContainText('has completed ChangeWorkflow');
    // Not a status code, which is not something anyone can act on.
    await expect(dialog).not.toContainText('the request failed');

    // NOTHING TO PRESS BUT CANCEL. A confirm here would offer a promotion the
    // server refused before it planned anything.
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await expect(page.locator('[data-promote-rel]')).toHaveCount(0);
    const buttons = page.locator('.MuiDialogActions-root button');
    await expect(buttons).toHaveCount(1);
    await expect(buttons.first()).toHaveText('Cancel');
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

    await page.goto(`/rollouts/${idleFx.changeOrderSlug}/dev`);
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
