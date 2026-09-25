// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * ══ THE DISPLAY INFORMS; THE GATE DECIDES — ON SCREEN ══════════════════════
 *
 * `rollout-health-informs-gate-decides.spec.ts` pins this rule as a derivation:
 * given a hand-built `ConsoleRow`, `actionFor` returns Promote. It cannot see
 * whether that row ever reaches a screen, whether the console reads the answer
 * it is given, or what a person is actually offered. Twice in this work a
 * defect passed every model test and was visible only in a browser — a loading
 * state that never settled, and a flow-graph lane that drew empty — so the
 * rendered control is asserted here, against a live server, over a rollout a
 * real `cub` would promote.
 *
 * THE CASE. A workflow declares three stages and no prerequisite on any of
 * them. The change is promoted into `dev` and released there, and `dev` then
 * reports `OutOfSync`. `validateStageEntryGates` reaches
 * `evaluatePrerequisites` with nothing to check
 * (`internal/views/promote_gates.go`), so `cub` promotes into `staging`
 * without ever reading the annotation.
 *
 * So the row must say the workload is failing — state, blocker sentence and
 * `dev`'s own segment — AND still offer Promote. Before this rule was
 * implemented this exact input rendered `Resolve`, a page withdrawing an action
 * the CLI performs. Over-strictness is a real defect: an operator refused a
 * correct action learns to distrust every refusal after it.
 *
 * ⚠️ `/rollouts` IS THE ONLY SURFACE THAT RENDERS `actionFor`, which is why
 * this spec drives the page rather than the rule on its own. The console binds
 * that control to its own promote confirmation, so the row offers Promote as a
 * live action: the label is what the rule decides, and being pressable is what
 * the page offers on top of it. Both are asserted, because an enabled Promote
 * and an enabled Resolve are not the same control.
 */
import { type Page } from '@playwright/test';
import { test, expect, newAuthorizedPage } from './fixtures/test';

import { LIVE_STATUS_ANNOTATION_KEY } from '../src/pages/x/apps/liveStatus';
import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import { rolloutsConsoleCopy } from '../src/pages/x/apps/rollout/rolloutsConsoleCopy';

import { ApiHelper } from './fixtures/api-helper';
import { type RolloutFixture, buildRolloutFixture } from './fixtures/rollout-fixture';

const SETTLE_TIMEOUT_MS = 25_000;

/** The stage the change is in, and the stage it would be promoted into. */
const REACHED_STAGE = 'dev';
const NEXT_STAGE = 'staging';

test.describe('a degraded stage under a workflow that asks for no health check', () => {
  test.use({ storageState: 'authentication.json' });

  let fx: RolloutFixture;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    fixturePage = await newAuthorizedPage(browser);
    // `minimal`: every assertion is about one console row. The other three
    // resources cost setup time and change nothing here.
    fx = await buildRolloutFixture(fixturePage, {
      resources: 'minimal',
      workflow: 'no-health-check',
    });
    // Without derived propagation the row is `unknown` for an unrelated reason
    // and this spec would prove nothing; fail here, naming the cause.
    await fx.assertPropagationSupported();

    await fx.promoteStage(REACHED_STAGE);
    await fx.releaseStage(REACHED_STAGE);
    // Written by hand because no argobot runs against this server. `outofsync`
    // is the first axis `checkSpaceIsHealthy` reads, so it is the axis the
    // blocker sentence will name.
    await fx.setLiveStatus(REACHED_STAGE, 'outofsync');
  });

  test.afterAll(async () => {
    await fx?.teardown();
    await fixturePage?.context().close();
  });

  test('reports the failure and still offers Promote', async ({ page }) => {
    /*
     * ══ THE FIXTURE REACHES THE BRANCH, PROVED FROM THE SERVER FIRST ═══════
     *
     * Everything below this block is worthless if the row is not actually in
     * the degraded-but-ungated state, and a fixture that quietly stops
     * producing it would leave a green test asserting nothing. These four facts
     * are read back from the API rather than from the page, so they hold
     * independently of any derivation the page performs:
     *
     *   1. no stage declares a health prerequisite, and there is no `Final`;
     *   2. `dev` has taken the change and been released;
     *   3. `staging` has NOT taken it — promoting `dev` queues triggers that
     *      can carry a change onward, and if that happened the next stage would
     *      be `prod` and this case would not be under test at all;
     *   4. `dev`'s annotation really does report a failure.
     */
    const api = new ApiHelper(fixturePage);
    const order = await api.getChangeOrder({
      spaceId: fx.changeOrderSpaceId,
      changeOrderId: fx.changeOrderId,
    });
    // The ChangeOrder's own frozen copy, not the ChangeWorkflow entity: the
    // copy is what every promotion of this rollout is judged against, and the
    // entity can be edited out from under it.
    const stages = order.ChangeWorkflow?.Stages ?? [];
    expect(stages.map((s) => s.Name)).toEqual([REACHED_STAGE, NEXT_STAGE, 'prod']);
    expect(
      stages.flatMap((s) => s.Prerequisites ?? []),
      'a prerequisite would make the gate channel answer the health question itself',
    ).toEqual([]);
    expect(
      order.ChangeWorkflow?.Final ?? null,
      'a Final would gate on the last stage',
    ).toBeNull();

    const { resolved, released } = await fx.propagation();
    expect(resolved, 'dev never took the change').toContain(fx.spaces[REACHED_STAGE].spaceId);
    expect(released, 'dev was never released').toContain(fx.spaces[REACHED_STAGE].spaceId);
    for (const space of fx.spacesInStage(NEXT_STAGE)) {
      expect(
        resolved,
        `${space.slug} already took the change, so ${NEXT_STAGE} is not the stage being entered`,
      ).not.toContain(space.spaceId);
    }

    const devSpace = await api.getSpaceById(fx.spaces[REACHED_STAGE].spaceId);
    expect(
      devSpace.Annotations?.[LIVE_STATUS_ANNOTATION_KEY],
      'dev reports no live status, so there is no failure for the row to display',
    ).toContain('OutOfSync');

    // ══ NOW THE SCREEN ════════════════════════════════════════════════════
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/rollouts');

    // Authenticated and rendered: the sign-in wall renders no console region,
    // and every assertion below would otherwise be precise about the wrong page.
    const consoleRegion = page.getByRole('region', { name: 'Rollouts console' });
    await expect(consoleRegion).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
    await expect(consoleRegion.getByTestId('rollouts-loading')).toHaveCount(0, {
      timeout: SETTLE_TIMEOUT_MS,
    });

    // Filtered, not scanned: the console is org-wide over a shared database, so
    // "the first row" is whatever another spec happened to create.
    await page.getByLabel(rolloutsConsoleCopy.filters.searchPlaceholder).fill(fx.changeOrderSlug);
    const row = page.locator(`[data-rollout-slug="${fx.changeOrderSlug}"]`);
    await expect(row, "the fixture's own rollout never appeared in the console").toHaveCount(1, {
      timeout: SETTLE_TIMEOUT_MS,
    });

    // The row is entering `staging`, which is what the blocker sentence names
    // and what the gates were read over.
    await expect(row).toContainText(NEXT_STAGE);

    // ── What the row SAYS ─────────────────────────────────────────────────
    // The state, as the row prints it and as it records it.
    await expect(row.locator('[data-rollout-state]')).toHaveAttribute('data-rollout-state', 'degraded');
    await expect(row).toContainText(rolloutsConsoleCopy.states.degraded.label);

    // `dev`'s own segment, found by the title a reader hovers rather than by
    // position — a strip redesign that reorders segments must not silently
    // re-point this assertion at a different stage.
    await expect(
      row.locator(`[data-testid="rollout-stage-segment"][title^="${REACHED_STAGE}:"]`),
    ).toHaveAttribute('data-tone', 'degraded');

    /*
     * The blocker sentence, in full. The cell truncates to fit one line and
     * carries the whole sentence as its `title`, so both are asserted: the
     * reader sees the failing Space named, and hovering gives the reason the
     * promotion still stands. Without the second clause a Degraded row beside a
     * Promote button reads as a contradiction with no way to tell which half to
     * believe.
     */
    const blocker = row.getByTestId('rollout-blocker');
    await expect(blocker).toHaveAttribute(
      'title',
      rolloutsConsoleCopy.degradedButUngated(
        rolloutCopy.reportedStatus.notSynced(fx.spaces[REACHED_STAGE].slug),
        NEXT_STAGE,
      ),
    );
    await expect(blocker).toContainText(fx.spaces[REACHED_STAGE].slug);

    /*
     * ── What the row OFFERS, and the whole point of this file ─────────────
     * `Resolve` here is the regression: a page withdrawing a promotion `cub`
     * performs. Each control is addressed by its own accessible name, so this
     * fails if the wiring, and not only the derivation, ever reads the display
     * channel again.
     *
     * NAMED, NEVER COUNTED. A row carries more than one control — the action
     * beside the menu that ends the rollout — so how many buttons it holds
     * says nothing about WHICH one it holds. A count passes over a row
     * offering Resolve next to a menu, and fails over the right row the moment
     * a second control joins it: it is precise about the wrong fact.
     */
    const promote = row.getByRole('button', { name: 'Promote', exact: true });
    await expect(
      promote,
      'the page withdrew Promote from a promotion the CLI performs',
    ).toHaveCount(1);
    await expect(
      promote,
      'Promote rendered unpressable, which offers the reader no promotion at all',
    ).toBeEnabled();
    await expect(
      row.getByRole('button', { name: 'Resolve', exact: true }),
      'the row answered the display channel and refused a promotion the CLI performs',
    ).toHaveCount(0);

    /*
     * The end-rollout menu sits BESIDE the action, never instead of it:
     * `rolloutIntents` offers Abort to any rollout that has not been aborted,
     * and this one has not. Asserted separately, by its own label, so the file
     * states the whole of what the row offers rather than letting a second
     * control stand in for the one under test.
     */
    await expect(
      row.getByRole('button', { name: `Rollout actions for ${fx.changeOrderSlug}`, exact: true }),
      'the row offered no way to end the rollout',
    ).toHaveCount(1);
  });
});
