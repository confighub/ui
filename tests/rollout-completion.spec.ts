// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The console row's completion reading, exercised directly: no page, no browser.
//
// Whether a rollout is complete is the server's answer, recorded on the
// ChangeOrder as `Stage = 'Completed'` once the last stage satisfies
// `Final.Prerequisites`. Each row below carries the `Stage` the server would
// have recorded for its fixture, and the tests hold the row's state, blocker and
// segments to it.

import { test, expect } from './fixtures/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import type { LiveStatus } from '../src/pages/x/apps/liveStatus';
import { buildConsoleRow, canAbortRollout, type ConsoleSpace } from '../src/pages/x/apps/rollout/rolloutsConsoleModel';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import { carryingReleases, runningRelease } from './fixtures/running-release';

const BASE = 'base-1';
const DEV = 'dev-1';
const PROD = 'prod-1';

const HEALTHY: LiveStatus = {
  Reporter: 'argobot',
  Sync: 'Synced',
  Operation: 'Succeeded',
  Health: 'Healthy',
};

/** What a failing production actually reports, in the three fields the gate reads. */
const DEGRADED: LiveStatus = {
  Reporter: 'argobot',
  Sync: 'OutOfSync',
  Operation: 'Failed',
  Health: 'Degraded',
};

/**
 * A two-stage frozen copy, with `Final` supplied by the caller so each test
 * says only what it is about. `undefined` is a workflow that declares no
 * completion check at all, which is a shape the product produces and not a
 * placeholder.
 */
function workflowWithFinal(final: string[] | undefined): ChangeWorkflowSpec {
  return {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
      { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Released'] },
    ],
    ...(final === undefined ? {} : { Final: { Prerequisites: final } }),
  };
}

const FINAL_HEALTHY = ['Healthy'];
const FINAL_RELEASED = ['Released'];
/** No `Final` block at all — optional on the frozen copy, and common. */
const NO_FINAL = undefined;

/** The `Stage` the server records once the last stage satisfies `Final`. */
const COMPLETED = 'Completed';
/** The `Stage` of a rollout that reached the last stage but not `Final`. */
const LAST_STAGE = 'prod';

const CONSOLE_COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };

// `prodReleaseTargetId` is passed explicitly rather than defaulted: a default
// parameter fires on an explicit `undefined`, which is the very value the
// targetless case has to carry through.
function consoleSpaces(liveStatus: LiveStatus | null, prodReleaseTargetId: string | undefined): ConsoleSpace[] {
  return [
    { spaceId: BASE, slug: 'myapp-base', component: CONSOLE_COMPONENT },
    { spaceId: DEV, slug: 'myapp-dev', component: CONSOLE_COMPONENT, labels: { Stage: 'dev' } },
    {
      spaceId: PROD,
      slug: 'myapp-prod',
      component: CONSOLE_COMPONENT,
      labels: { Stage: 'prod' },
      releaseTargetId: prodReleaseTargetId,
      // `null` is a published Release its deploying tool has not reported on.
      release: runningRelease(liveStatus),
    },
  ];
}

function consoleRow(
  final: string[] | undefined,
  liveStatus: LiveStatus | null,
  stage: string,
  progress: { released?: string[]; prodReleaseTargetId?: string | undefined } = {},
) {
  const wf = workflowWithFinal(final);
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {
    [stageWhereSpace(wf.Stages[0], CONSOLE_COMPONENT)]: [{ Space: { SpaceID: DEV } } as ExtendedSpaceRead],
    [stageWhereSpace(wf.Stages[1], CONSOLE_COMPONENT)]: [{ Space: { SpaceID: PROD } } as ExtendedSpaceRead],
  };
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: [BASE, DEV, PROD],
      releasedSpaceIds: progress.released ?? [DEV, PROD],
      releases: carryingReleases(progress.released ?? [DEV, PROD]),
      inScopeSpaceIds: [BASE, DEV, PROD],
      // The workflow rides on the row, the way the frozen copy rides on the
      // ChangeOrder it was read from.
      governing: { state: 'governed', workflow: wf, changeWorkflowId: 'wf-1' },
      stage,
    },
    consoleSpaces(liveStatus, 'prodReleaseTargetId' in progress ? progress.prodReleaseTargetId : 'target-prod'),
    stageSpaces,
  );
}

/*
 * ⚠️ A RELEASE PUBLISHED BEFORE THE TARGET WAS CLEARED IS NOT EVIDENCE.
 *
 * The server refuses a health check over a targetless Space before it reads
 * any Release at all, so such a rollout is not completed — even handed a green
 * Release, which is what this fixture does to prove the gate never reads it.
 */
test('a targetless last stage reporting green is not a complete rollout', () => {
  const row = consoleRow(FINAL_HEALTHY, HEALTHY, LAST_STAGE, { prodReleaseTargetId: undefined });
  expect(row.state).not.toBe('complete');
  expect(row.state).not.toBe('complete-unverified');
  // The rollout is still live, so the way to stop it is still offered.
  expect(canAbortRollout(row)).toBe(true);
});

test('a console row is Complete only when the final prerequisites hold', () => {
  // Green, and it completes: the health of the last stage was asked for and
  // answered, so both halves of "Complete" are backed by a check.
  const done = consoleRow(FINAL_HEALTHY, HEALTHY, COMPLETED);
  expect(done.state).toBe('complete');
  expect(done.blocker).toBe('No blocker.');

  // The same rollout, held by a `healthy` its last stage's Release has not
  // been reported on for. The row must not say Complete, and must not say "No
  // blocker." either — there is no next stage whose gate could be quoted, and
  // an empty blocker would reassure a reader beside a chip that says otherwise.
  const held = consoleRow(FINAL_HEALTHY, null, LAST_STAGE);
  expect(held.state).not.toBe('complete');
  expect(held.blocker).toMatch(/myapp-prod/);
});

/*
 * A FINAL CHECK THAT IS NOT ABOUT HEALTH STILL READS AS HELD.
 *
 * `Released` names a different question, so a rollout it holds is not degraded
 * and no gate names a Space to quote. The row says what it can: every stage has
 * the change, and the workflow's own completion check is unsatisfied.
 */
test('a final prerequisite that is not about health still reports as held', () => {
  const held = consoleRow(FINAL_RELEASED, HEALTHY, LAST_STAGE, { released: [DEV] });
  expect(held.state).toBe('blocked');
  expect(held.blocker).toMatch(/final prerequisites are not satisfied/);
});

/*
 * ── THE LAST STAGE'S HEALTH IS IN NOBODY'S GATE ────────────────────────────
 *
 * A stage's prerequisites are evaluated over the Spaces of the stage BEFORE it,
 * so `Final` is the only check that can ever ask the last stage about itself.
 * A workflow with no `Final` declares nothing, so the server records such a
 * rollout `Completed`.
 *
 * What the row must not do is inherit that silence as reassurance. A production
 * reporting OutOfSync/Failed/Degraded satisfied every check there was, and the
 * row said "Complete", "No blocker." and drew the prod segment green — three
 * separate assertions of health, none of them checked.
 *
 * ⚠️ AND WHAT IT REPORTS DEPENDS ON WHETHER ANYBODY REPORTED. "Nobody checked"
 * and "it is failing" are two different answers, and the second is available
 * here without any gate: the last stage's own live status says so.
 * `complete-unverified` is the answer for a stage that reported NOTHING — the
 * test below — never for one that reported a failure.
 */
test('a rollout whose last stage reports a failure is degraded, not merely unverified', () => {
  const failing = consoleRow(NO_FINAL, DEGRADED, COMPLETED);
  expect(failing.state).toBe('degraded');
  // Named, so the reader knows which Space to open.
  expect(failing.blocker).toMatch(/myapp-prod/);
  expect(failing.stages.at(-1)?.segmentTone).toBe('degraded');
  /*
   * `canAbortRollout` is true here even though the rollout is
   * workflow-complete: a red production release the workflow calls finished
   * is the single most likely rollout anybody wants to undo, so completion is
   * not a reason to withdraw the controls. `workflowComplete` is still
   * asserted, because it is what the server recorded — it is simply not a term
   * of what is offered.
   */
  expect(failing.workflowComplete).toBe(true);
  expect(canAbortRollout(failing)).toBe(true);
});

test('a last stage reporting nothing at all is unverified, not done', () => {
  // No live status rather than a failing one. Nothing was checked and nothing
  // was reported, so the row withholds the health claim instead of making it —
  // and does not manufacture a failure it has no evidence for either.
  const unverified = consoleRow(NO_FINAL, null, COMPLETED);
  expect(unverified.state).toBe('complete-unverified');
  expect(unverified.blocker).not.toBe('No blocker.');
  expect(unverified.blocker).toMatch(/no health check on its last stage/);
  expect(unverified.stages.at(-1)?.segmentTone).toBe('unverified');
});

/*
 * ── A GATE BELONGS TO THE STAGE ITS SPACES ARE IN ──────────────────────────
 *
 * `Final.Prerequisites` is evaluated over the LAST stage's Spaces, so a failure
 * is a fact about that stage. Read off the stage that merely carries the gate,
 * the row said the rollout was held while the strip drew the very stage those
 * prerequisites are about in the tone that means "landed and fine" — one row
 * contradicting its own strip on screen.
 */
test('a failing final health check and the last stage segment tell the same story', () => {
  const row = consoleRow(FINAL_HEALTHY, DEGRADED, LAST_STAGE);
  expect(row.state).toBe('degraded');
  // `cub`'s own wording, naming the Space — not a sentence about "final
  // prerequisites" that leaves the reader to guess which stage is meant.
  expect(row.blocker).toMatch(/myapp-prod/);
  expect(row.stages.at(-1)?.segmentTone).toBe('degraded');
});

test('the stage a health gate is filed under is the one whose Spaces it read', () => {
  // dev is green and prod is not. `prod`'s own gates carry the `Healthy` that
  // reports on DEV, so a segment drawn from them would paint dev's verdict onto
  // prod and prod's onto nothing.
  const row = consoleRow(FINAL_HEALTHY, DEGRADED, LAST_STAGE);
  const dev = row.stages.find((s) => s.stageId === 'dev');
  expect(dev?.segmentTone).toBe('done');
  expect(row.stages.find((s) => s.stageId === 'prod')?.segmentTone).toBe('degraded');
});

/*
 * ── THE MIDDLE STAGE IS WHERE MISFILING SHOWS ──────────────────────────────
 *
 * Every case above has two stages, and in a two-stage workflow `Final` is
 * written last over the very stage a misfiled entry would have landed on — so
 * the overwrite hides the mistake and both filings agree. Three stages separate
 * them: the `Healthy` in `prod`'s gates reports on STAGING, and nothing
 * overwrites `staging`.
 *
 * Filed under the stage carrying the gate instead of the stage it read, a
 * failing staging is stored under `prod` and then overwritten by a green
 * `Final` — the failure disappears, and a rollout with a Degraded workload in
 * the middle of its sequence reports Complete with no blocker.
 */
const STAGING = 'staging-1';

const THREE_STAGES: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'staging', WhereSpace: "Labels.Stage = 'staging'", Prerequisites: ['Healthy'] },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Healthy'] },
  ],
  Final: { Prerequisites: FINAL_HEALTHY },
};

function threeStageRow(statusBySpaceId: Record<string, LiveStatus>, stage: string) {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {};
  [DEV, STAGING, PROD].forEach((spaceId, i) => {
    stageSpaces[stageWhereSpace(THREE_STAGES.Stages[i], CONSOLE_COMPONENT)] = [
      { Space: { SpaceID: spaceId } } as ExtendedSpaceRead,
    ];
  });
  const spaces: ConsoleSpace[] = [
    { spaceId: BASE, slug: 'myapp-base', component: CONSOLE_COMPONENT },
    ...[
      [DEV, 'dev'],
      [STAGING, 'staging'],
      [PROD, 'prod'],
    ].map(([spaceId, stageName]) => ({
      spaceId,
      slug: `myapp-${stageName}`,
      component: CONSOLE_COMPONENT,
      labels: { Stage: stageName },
      releaseTargetId: `target-${stageName}`,
      release: runningRelease(statusBySpaceId[spaceId]),
    })),
  ];
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: [BASE, DEV, STAGING, PROD],
      releasedSpaceIds: [DEV, STAGING, PROD],
      releases: carryingReleases([DEV, STAGING, PROD]),
      inScopeSpaceIds: [BASE, DEV, STAGING, PROD],
      governing: { state: 'governed', workflow: THREE_STAGES, changeWorkflowId: 'wf-1' },
      stage,
    },
    spaces,
    stageSpaces,
  );
}

test('a failing middle stage is not hidden by a green final check over the last one', () => {
  // prod's `Healthy` is read over staging, which is failing, so the server
  // holds the rollout at staging.
  const row = threeStageRow({ [DEV]: HEALTHY, [STAGING]: DEGRADED, [PROD]: HEALTHY }, 'staging');

  expect(row.state).toBe('degraded');
  // `cub`'s own wording, naming the Space that is actually failing — not prod,
  // which is green, and not a sentence about final prerequisites.
  expect(row.blocker).toMatch(/myapp-staging/);
  expect(row.stages.find((s) => s.stageId === 'staging')?.segmentTone).toBe('degraded');
  // The stages either side are untouched by staging's failure.
  expect(row.stages.find((s) => s.stageId === 'dev')?.segmentTone).toBe('done');
  expect(row.stages.find((s) => s.stageId === 'prod')?.segmentTone).toBe('done');
});

test('a three-stage rollout that is green throughout is complete', () => {
  // The control the assertion above needs: without it, "degraded" could be
  // this fixture's permanent answer rather than staging's verdict.
  const row = threeStageRow({ [DEV]: HEALTHY, [STAGING]: HEALTHY, [PROD]: HEALTHY }, COMPLETED);
  expect(row.state).toBe('complete');
  expect(row.blocker).toBe('No blocker.');
});
