// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// ══ THE DISPLAY INFORMS, THE GATE DECIDES ══════════════════════════════════
//
// Reported health may never withdraw an action the gate permits.
//
// A stage's live-status annotation answers "is this workload healthy right
// now". A gate answers "may this promotion proceed". They are different
// questions, and a workflow that declares no health prerequisite never asks the
// second one about health at all: `evaluatePrerequisites` over an empty
// prerequisite list checks only that the change arrived
// (internal/views/promote_gates.go), so `cub` promotes over a previous stage
// reporting Degraded without reading the annotation.
//
// A UI that refuses that promotion is over-strict, and over-strictness is a
// real defect: an operator who is refused a correct action learns to distrust
// every refusal after it, including the one that matters. So the reported
// failure keeps the chip, the Blocker sentence and the segment tone — all of
// which are worth seeing — and the Promote button stays.
//
// Pure derivation — no page, no browser.

import { test, expect } from './fixtures/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import { LIVE_STATUS_ANNOTATION_KEY, type LiveStatus } from '../src/pages/x/apps/liveStatus';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import {
  actionFor,
  buildConsoleRow,
  type ConsoleRow,
  type ConsoleSpace,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';

const HEALTHY: LiveStatus = {
  syncStatus: 'Synced',
  operationPhase: 'Succeeded',
  healthStatus: 'Healthy',
};

/** What argobot writes when the workload is on fire. */
const FAILING: LiveStatus = {
  syncStatus: 'OutOfSync',
  operationPhase: 'Failed',
  healthStatus: 'Degraded',
};

const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };
const BASE = 'base-1';
const DEV = 'dev-1';
const STAGING = 'stg-1';
const PROD = 'prod-1';

/**
 * Three stages and NOT ONE health prerequisite anywhere — no `Healthy` on any
 * stage, and no `Final`.
 *
 * ⚠️ THIS IS WHAT MAKES THE CASE REACHABLE, and it is the whole fixture. Declare
 * `Healthy` on `staging` and the gate channel answers the health question
 * itself: the gate fails, the stage is genuinely held, and the row is blocked
 * for a reason that has nothing to do with the display channel. The branch under
 * test is the one where the GATES ARE OPEN and a stage the change reached is
 * nonetheless reporting a failure.
 */
const NO_HEALTH_CHECK: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'staging', WhereSpace: "Labels.Stage = 'staging'" },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'" },
  ],
};

/** The control: identical, except that `staging` asks the health question. */
const STAGING_NEEDS_HEALTH: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'staging', WhereSpace: "Labels.Stage = 'staging'", Prerequisites: ['Healthy'] },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'" },
  ],
};

/**
 * The change has been promoted to `dev` and released there, and `dev` now
 * reports the given status. `staging` is therefore the stage being entered.
 *
 * `dev` carries a release target, so nothing here turns on the targetless shape
 * the reported-health channel was introduced for: this is an ordinary Space
 * that `cub` could health-check, under a workflow that never asks it to.
 */
function rowFor(workflow: ChangeWorkflowSpec, devStatus: LiveStatus): ConsoleRow {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {
    [stageWhereSpace(workflow.Stages[0], COMPONENT)]: [{ Space: { SpaceID: DEV } } as ExtendedSpaceRead],
    [stageWhereSpace(workflow.Stages[1], COMPONENT)]: [
      { Space: { SpaceID: STAGING } } as ExtendedSpaceRead,
    ],
    [stageWhereSpace(workflow.Stages[2], COMPONENT)]: [{ Space: { SpaceID: PROD } } as ExtendedSpaceRead],
  };
  const spaces: ConsoleSpace[] = [
    // The base is in no stage of this workflow, so nothing it reports is read.
    { spaceId: BASE, slug: 'myapp-base', component: COMPONENT },
    {
      spaceId: DEV,
      slug: 'myapp-dev',
      component: COMPONENT,
      labels: { Stage: 'dev' },
      releaseTargetId: 'target-dev',
      annotations: { [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify(devStatus) },
    },
    {
      spaceId: STAGING,
      slug: 'myapp-staging',
      component: COMPONENT,
      labels: { Stage: 'staging' },
      releaseTargetId: 'target-staging',
      annotations: { [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify(HEALTHY) },
    },
    {
      spaceId: PROD,
      slug: 'myapp-prod',
      component: COMPONENT,
      labels: { Stage: 'prod' },
      releaseTargetId: 'target-prod',
      annotations: { [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify(HEALTHY) },
    },
  ];
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: [BASE, DEV],
      releasedSpaceIds: [DEV],
      inScopeSpaceIds: [BASE, DEV, STAGING, PROD],
      governing: { state: 'governed', workflow, changeWorkflowId: 'wf-1' },
      stage: 'dev',
    },
    spaces,
    stageSpaces,
  );
}

const toneOf = (row: ConsoleRow, stageId: string) =>
  row.stages.find((s) => s.stageId === stageId)?.segmentTone;

/*
 * ⚠️ THE FIXTURE REACHES THE BRANCH, AND THIS IS WHERE THAT IS CHECKED. Every
 * assertion below is about a row whose gates are OPEN while a stage it reached
 * reports a failure. If the fixture ever stops producing that pair — a stage
 * gains a prerequisite, the progress stops covering `dev` — the rest of this
 * file would pass while testing nothing at all.
 */
test('the fixture produces an open gate over a failing stage', () => {
  const row = rowFor(NO_HEALTH_CHECK, FAILING);
  expect(row.nextStageId).toBe('staging');
  const staging = row.stages.find((s) => s.stageId === 'staging');
  expect(staging?.state.gatesOpen).toBe(true);
  // Nothing in the workflow declares a health check, so no gate anywhere holds
  // a health verdict: the failure below can only have come from the report.
  expect(row.stages.flatMap((s) => s.gates).some((g) => g.id === 'check/healthy')).toBe(false);
});

/*
 * THE CASE ITSELF. `cub` promotes this — `staging` declares no prerequisite, so
 * only "has `dev` taken the change" is asked, and it has. The row says the
 * workload is failing and offers the promotion anyway.
 */
test('a degraded previous stage under a workflow with no health check still offers Promote', () => {
  const row = rowFor(NO_HEALTH_CHECK, FAILING);

  // What the row SAYS: all three display surfaces keep the failure.
  expect(row.state).toBe('degraded');
  expect(row.blocker).toContain('myapp-dev');
  expect(toneOf(row, 'dev')).toBe('degraded');

  // What the row PERMITS: the gate channel alone, and it permits the promotion.
  expect(row.gateState.state).toBe('ready');
  expect(actionFor(row).label).toBe('Promote');
  expect(actionFor(row).primary).toBe(true);
});

/*
 * AND THE PAIR MUST READ HONESTLY ON SCREEN. A Degraded chip beside a Promote
 * button is a contradiction unless the cell between them explains it, so the
 * sentence names the failing Space first — that is the news — and then says why
 * the promotion is still offered, in the workflow's own terms.
 */
test('the blocker sentence explains why an unhealthy rollout is still promotable', () => {
  const row = rowFor(NO_HEALTH_CHECK, FAILING);
  expect(row.blocker).toBe(
    'myapp-dev reports it is not synced. The workflow asks for no health check before staging, ' +
      'so this promotion is not held.',
  );
});

/*
 * THE CONTROL, AND THE HALF OF THE RULE THAT MUST NOT MOVE. One prerequisite
 * added to `staging` and the same annotation becomes a GATE verdict: `cub`
 * refuses the promotion, and so does this row. The display channel never opened
 * a gate and it must never close one either.
 */
test('a declared health prerequisite still blocks, on the same failing annotation', () => {
  const row = rowFor(STAGING_NEEDS_HEALTH, FAILING);
  expect(row.stages.find((s) => s.stageId === 'staging')?.state.gatesOpen).toBe(false);
  expect(row.gateState.state).toBe('degraded');
  expect(actionFor(row).label).toBe('Resolve');
});

/*
 * THE OTHER CONTROL: nothing failing anywhere. The two channels agree, the row
 * is plainly ready, and the extra clause is not printed over a healthy rollout.
 */
test('a healthy rollout is ready, and says nothing about health checks', () => {
  const row = rowFor(NO_HEALTH_CHECK, HEALTHY);
  expect(row.state).toBe('ready');
  expect(row.gateState.state).toBe('ready');
  expect(actionFor(row).label).toBe('Promote');
  expect(row.blocker).not.toContain('no health check');
});
