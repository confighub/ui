// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// TWO QUESTIONS, TWO CHANNELS.
//
// A rollout stage is asked two different things about the same Space, and the
// correct answers differ for one and the same input:
//
//   Q1 MAY THE PROMOTION PROCEED?  `cub`'s question. A Space with no
//      ReleaseTargetID cannot be health-checked at all, so the answer is "not
//      evaluated", and an unknown holds the stage. That verdict is a gate.
//
//   Q2 IS THIS STAGE'S WORKLOAD HEALTHY RIGHT NOW?  The console's question. A
//      live status reporting OutOfSync/Failed/Degraded is evidence of a problem
//      whatever the gate could conclude. That answer is a report.
//
// One value cannot carry both. While it did, a Space reporting Degraded that
// the gate could not judge reached the console as "not evaluated", every
// degraded test read `evaluated && !ok`, none of them fired, and the row drew
// the stage `done`, called the rollout Complete and WITHDREW Abort from a
// rollout that was actively failing.
//
// The model is handed each Space's running Release, and the cases below hand
// a targetless Space one. The data layer gives a targetless Space none
// (`runningReleases`), but neither channel leans on that to stay correct.
//
// Pure derivation — no page, no browser.

import { test, expect } from './fixtures/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import type { LiveStatus } from '../src/pages/x/apps/liveStatus';
import { carryingReleases, runningRelease } from './fixtures/running-release';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import { reportedHealthOf } from '../src/pages/x/apps/rollout/rolloutReportedHealth';
import {
  buildConsoleRow,
  canAbortRollout,
  type ConsoleSpace,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';

const HEALTHY: LiveStatus = {
  Sync: 'Synced',
  Operation: 'Succeeded',
  Health: 'Healthy',
};

/** The shape argobot writes when the workload is on fire. */
const FAILING: LiveStatus = {
  Sync: 'OutOfSync',
  Operation: 'Failed',
  Health: 'Degraded',
};

const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };
const BASE = 'base-1';
const DEV = 'dev-1';
const PROD = 'prod-1';

/**
 * `dev` then `prod`, `prod` gating on `Healthy`, and NO `Final` — the common
 * shape, since `Final` is optional. The change has reached both stages, so
 * `dev` is a MIDDLE stage: the one position the last-stage `unverified` rescue
 * never covers.
 */
const WORKFLOW: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Healthy'] },
  ],
};

function row(devTargeted: boolean, devStatus: LiveStatus, stage?: string) {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {
    [stageWhereSpace(WORKFLOW.Stages[0])]: [{ Space: { SpaceID: DEV } } as ExtendedSpaceRead],
    [stageWhereSpace(WORKFLOW.Stages[1])]: [{ Space: { SpaceID: PROD } } as ExtendedSpaceRead],
  };
  const spaces: ConsoleSpace[] = [
    { spaceId: BASE, slug: 'myapp-base', component: COMPONENT },
    {
      spaceId: DEV,
      slug: 'myapp-dev',
      component: COMPONENT,
      labels: { Stage: 'dev' },
      // The whole of the difference between the two cases below.
      releaseTargetId: devTargeted ? 'target-dev' : undefined,
      release: runningRelease(devStatus),
    },
    {
      spaceId: PROD,
      slug: 'myapp-prod',
      component: COMPONENT,
      labels: { Stage: 'prod' },
      releaseTargetId: 'target-prod',
      release: runningRelease(HEALTHY),
    },
  ];
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: [BASE, DEV, PROD],
      releasedSpaceIds: [DEV, PROD],
      releases: carryingReleases([DEV, PROD]),
      inScopeSpaceIds: [BASE, DEV, PROD],
      governing: { state: 'governed', workflow: WORKFLOW, changeWorkflowId: 'wf-1' },
      stage,
    },
    spaces,
    stageSpaces,
  );
}

const toneOf = (built: ReturnType<typeof row>, stageId: string) =>
  built.stages.find((s) => s.stageId === stageId)?.segmentTone;

/*
 * The control. With a release target, the server reaches a verdict on the same
 * status and the gate channel alone already reported it. Nothing here may
 * change: the gate verdict is the server's and stays the server's.
 */
test('a targeted Space reporting Degraded is reported degraded', () => {
  const built = row(true, FAILING);
  expect(built.state).toBe('degraded');
  expect(built.blocker).toBe('myapp-dev release 1 is not synced (OutOfSync).');
  expect(toneOf(built, 'dev')).toBe('degraded');
});

/*
 * ⚠️ THE BUG THIS FILE EXISTS FOR. Same status, same failing workload, one
 * field cleared: the gate correctly cannot judge a Space with no
 * `ReleaseTargetID`, and the reported status still says the workload is
 * failing.
 */
test('a targetless Space reporting Degraded is still a degraded rollout', () => {
  const built = row(false, FAILING);
  expect(built.state).toBe('degraded');
  // Not "Done, but unchecked": something WAS checked, and it said Degraded.
  expect(built.blocker).toContain('myapp-dev');
  expect(built.blocker).not.toContain('Done, but unchecked');
});

/*
 * `done` is the tone whose own definition claims a green workload. Drawing it
 * over a Space reporting Degraded is the page asserting the opposite of what it
 * read. The last-stage `unverified` rescue does not reach a middle stage, which
 * is why this failed on `dev` and not on `prod`.
 */
test('a stage reporting Degraded never draws as done, targetless or not', () => {
  expect(toneOf(row(false, FAILING), 'dev')).toBe('degraded');
  expect(toneOf(row(true, FAILING), 'dev')).toBe('degraded');
});

/*
 * ABORT DOES NOT FOLLOW THE REPORT. It follows completion, and this rollout has
 * reached its last stage under a workflow declaring no `Final` — `Completed
 * true` to `cub`.
 *
 * The server permits abort in every state including Released, and `cub
 * variant demote` rolls a finished rollout back as readily as an in-flight
 * one, so completion is not a reason to withdraw the controls — undoing a
 * landed release needs an entry point in the UI. The chip follows the
 * server's "Completed", and the reported failure is named in the Blocker cell.
 * `workflowComplete` is true here and not a term of the answer.
 */
test('a reported failure on a finished rollout is named, and the rollout can be ended', () => {
  const built = row(false, FAILING, 'Completed');
  expect(built.state).toBe('complete-unverified');
  expect(built.blocker).toContain('myapp-dev');
  expect(built.workflowComplete).toBe(true);
  expect(canAbortRollout(built)).toBe(true);
  // The same failing report, on a rollout the workflow has NOT finished: the
  // report withdraws nothing there either.
  expect(canAbortRollout({ ...built, workflowComplete: false })).toBe(true);
});

/*
 * The other half of the same rule: a report that says nothing must not be read
 * as a failure either. A green targetless Space is not a promotion verdict —
 * the gate still refuses it — but it is no reason to paint the strip red.
 */
test('a targetless Space reporting Healthy is not called degraded', () => {
  const built = row(false, HEALTHY);
  expect(built.state).not.toBe('degraded');
  expect(toneOf(built, 'dev')).toBe('done');
});

// ── The reported channel on its own ─────────────────────────────────────────

const reportSpace = (liveStatus: LiveStatus | null, loaded = true, taken = true) => ({
  loaded,
  variantName: 'myapp-dev',
  liveStatus,
  taken,
});

test('a report over a Space nobody has read yet claims nothing', () => {
  expect(reportedHealthOf([reportSpace(FAILING, false)]).reported).toBe('unreported');
  expect(reportedHealthOf([]).reported).toBe('unreported');
});

/*
 * NO LIVE STATUS IS NOT A FAILURE ON THIS CHANNEL. "The workload is failing" and
 * "nothing reported" are different claims, and only the gate channel — which
 * asks `cub`'s question — turns the second into a refusal.
 */
test('a Space carrying no live status reports nothing, not a failure', () => {
  expect(reportedHealthOf([reportSpace(null)]).reported).toBe('unreported');
});

test('each failing axis is named in the report, in the order the gate asks them', () => {
  expect(reportedHealthOf([reportSpace({ ...HEALTHY, Sync: 'OutOfSync' })]).reason).toBe(
    'myapp-dev reports it is not synced.',
  );
  expect(reportedHealthOf([reportSpace({ ...HEALTHY, Operation: 'Running' })]).reason).toBe(
    'myapp-dev reports its deployment is still running.',
  );
  expect(reportedHealthOf([reportSpace({ ...HEALTHY, Operation: 'Failed' })]).reason).toBe(
    'myapp-dev reports its deployment did not succeed.',
  );
  expect(reportedHealthOf([reportSpace({ ...HEALTHY, Health: 'Degraded' })]).reason).toBe(
    'myapp-dev reports it is not healthy.',
  );
});

test('a green report carries no reason to show', () => {
  const report = reportedHealthOf([reportSpace(HEALTHY)]);
  expect(report.reported).toBe('healthy');
  expect(report.reason).toBe('');
});

// Not every reporter runs an operation, so its absence is no failure.
test('a green report with no operation is healthy', () => {
  const noOperation: LiveStatus = { Sync: 'Synced', Health: 'Healthy' };
  expect(reportedHealthOf([reportSpace(noOperation)]).reported).toBe('healthy');
});

/*
 * One Space failing is the stage failing: the report is about the stage's
 * workload, and a stage is only as healthy as its worst Space.
 */
test('one failing Space among green ones fails the stage report', () => {
  const report = reportedHealthOf([reportSpace(HEALTHY), reportSpace(FAILING)]);
  expect(report.reported).toBe('failing');
});

/*
 * An unread Space cannot excuse a failing one. Withholding the whole report
 * because a sibling has not loaded would hide a failure that was read.
 */
test('an unread Space does not hide a failure that was read', () => {
  expect(reportedHealthOf([reportSpace(null, false), reportSpace(FAILING)]).reported).toBe('failing');
});
