// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A STAGE THE CHANGE HAS NOT ENTERED IS NOT EVIDENCE OF ANYTHING.
//
// Both channels a rollout row reads — `cub`'s gate verdict and the Spaces' own
// reported status — describe WORKLOADS. A Space that has not taken the change
// is running somebody else's configuration, so neither channel may reach a
// health answer about it: not a pass, and not a failure either.
//
// Three separate things went wrong by forgetting that, and every one of them
// pointed the same way — a rollout that was fine read as broken, or a rollout
// somebody had finished offered a one-way door back out of it.
//
// Pure derivation — no page, no browser.

import { test, expect } from './fixtures/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import { LIVE_STATUS_ANNOTATION_KEY, type LiveStatus } from '../src/pages/x/apps/liveStatus';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import {
  actionFor,
  buildConsoleRow,
  canAbortRollout,
  type ConsoleRow,
  type ConsoleSpace,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';

const HEALTHY: LiveStatus = {
  syncStatus: 'Synced',
  operationPhase: 'Succeeded',
  healthStatus: 'Healthy',
};

/** What argobot writes over a workload that is on fire. */
const DEGRADED: LiveStatus = {
  syncStatus: 'OutOfSync',
  operationPhase: 'Failed',
  healthStatus: 'Degraded',
};

const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };
const BASE = 'base-1';
const ORDER = 'ship-it';

interface SpaceFixture {
  spaceId: string;
  stage: string;
  liveStatus: LiveStatus | null;
  targeted?: boolean;
}

function consoleSpaces(baseStatus: LiveStatus | null, members: SpaceFixture[]): ConsoleSpace[] {
  return [
    {
      spaceId: BASE,
      slug: 'myapp-base',
      component: COMPONENT,
      annotations:
        baseStatus === null ? {} : { [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify(baseStatus) },
    },
    ...members.map(({ spaceId, stage, liveStatus, targeted = true }) => ({
      spaceId,
      slug: `myapp-${spaceId}`,
      component: COMPONENT,
      labels: { Stage: stage },
      releaseTargetId: targeted ? `target-${spaceId}` : undefined,
      annotations:
        liveStatus === null ? {} : { [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify(liveStatus) },
    })),
  ];
}

function rowFor(
  workflow: ChangeWorkflowSpec,
  spaces: ConsoleSpace[],
  stageSpaceIds: string[][],
  progress: { resolved: string[]; released: string[] },
  /** `ChangeOrder.Stage` as the server recorded it. Absent is no stage recorded. */
  stage?: string,
): ConsoleRow {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {};
  workflow.Stages.forEach((stage, i) => {
    stageSpaces[stageWhereSpace(stage, COMPONENT)] = stageSpaceIds[i].map(
      (id) => ({ Space: { SpaceID: id } }) as ExtendedSpaceRead,
    );
  });
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: ORDER,
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: progress.resolved,
      releasedSpaceIds: progress.released,
      inScopeSpaceIds: [BASE, ...stageSpaceIds.flat()],
      governing: { state: 'governed', workflow, changeWorkflowId: 'wf-1' },
      stage,
    },
    spaces,
    stageSpaces,
  );
}

/** Every segment's tone, in sequence order — the source row first. */
const tones = (row: ConsoleRow) => row.stages.map((s) => `${s.stageId}:${s.segmentTone}`);

/*
 * ══ D1. THREE STAGES, MID-FLIGHT, AND THE PROMOTE BUTTON IS GONE ═══════════
 *
 * ⚠️ A TWO-STAGE FIXTURE CANNOT SEE THIS, WHICH IS WHY 175 TESTS DID NOT. The
 * health gate of stage N is evaluated over the Spaces of stage N-1. With two
 * stages the only such gate belongs to the last one and is asked about the
 * stage the change is currently in, which HAS taken it. A third stage is the
 * first position where a gate is asked about a stage the change has not reached
 * yet — and mid-flight that is the ordinary condition of every rollout, not an
 * edge case.
 *
 * `prod`'s `Healthy` is quantified over `staging`, `staging` has not taken the
 * change and never does before the promote into it. Answered as a FAILURE, that
 * verdict is filed under `staging`, `staging` is the stage being entered so it
 * is in scope for the row, and the row reads `degraded` — withdrawing Promote
 * from the plainest ready case there is, while the row's own strip draws
 * `staging` as `ready` beside it.
 */
const THREE_STAGES: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'staging', WhereSpace: "Labels.Stage = 'staging'", Prerequisites: ['Released'] },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Healthy'] },
  ],
};

const midFlight = () =>
  rowFor(
    THREE_STAGES,
    consoleSpaces(HEALTHY, [
      { spaceId: 'dev-1', stage: 'dev', liveStatus: HEALTHY },
      { spaceId: 'stg-1', stage: 'staging', liveStatus: HEALTHY },
      { spaceId: 'prod-1', stage: 'prod', liveStatus: HEALTHY },
    ]),
    [['dev-1'], ['stg-1'], ['prod-1']],
    { resolved: [BASE, 'dev-1'], released: ['dev-1'] },
    'dev',
  );

test('a three-stage rollout mid-flight is ready to promote, not degraded', () => {
  const row = midFlight();

  expect(row.state).toBe('ready');
  expect(row.blocker).toBe('No blocker.');
  expect(actionFor(row).label).toBe('Promote');
  // The sentence the row used to print, about a Space nothing is wrong with.
  expect(row.blocker).not.toContain("has not taken 'ship-it'");
});

/*
 * The strip and the row have to agree. `staging` drawn `ready` beside a row
 * calling the whole rollout `degraded` is the exact self-contradiction
 * `segmentToneFor`'s own header says cannot happen.
 */
test('every segment of a mid-flight three-stage rollout agrees with the row', () => {
  expect(tones(midFlight())).toEqual([
    '__rollout_source__:done',
    'dev:done',
    'staging:ready',
    'prod:gated',
  ]);
});

/*
 * AND THE DISPLAY IMPROVEMENT SURVIVES. The point of asking the promoted check
 * inside the health gate was to stop `Healthy ✓ satisfied` being drawn over a
 * Space that never took the change — the tick an operator reads while writing
 * an override. Unevaluated withholds that tick just as well, and claims nothing
 * about a workload running someone else's configuration.
 */
test('the health gate over a stage the change has not entered still shows no tick', () => {
  const prod = midFlight().stages.find((s) => s.stageId === 'prod');
  const healthy = prod?.gates.find((g) => g.id === 'check/healthy');
  expect(healthy).toBeDefined();
  expect(healthy?.ok).toBe(false);
  expect(healthy?.evaluated).toBe(false);
  expect(healthy?.reason).toContain("has not taken 'ship-it'");
});

/*
 * ══ D3. ABORT RE-OFFERED ON A RELEASE THAT ALREADY LANDED ══════════════════
 *
 * A Space joining `staging` after the rollout went through it makes that stage
 * `in-progress` again — correctly, one of its Spaces has not taken the change.
 * The new Space reports Degraded about the configuration it is actually
 * running, which has nothing to do with this rollout.
 *
 * Read as this rollout's health, that turned a shipped production release into
 * `degraded` and re-offered Abort. `AbortedReason` is a field the server will
 * not let anyone clear and it unlocks the restore path: a one-way door out of a
 * finished release, opened by an unrelated outage in a Space the change never
 * reached.
 */
const FINAL_CHECKED: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'staging', WhereSpace: "Labels.Stage = 'staging'" },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'" },
  ],
  Final: { Prerequisites: ['Healthy'] },
};

const landedWithLateSpace = () =>
  rowFor(
    FINAL_CHECKED,
    consoleSpaces(null, [
      { spaceId: 'dev-1', stage: 'dev', liveStatus: HEALTHY },
      { spaceId: 'stg-1', stage: 'staging', liveStatus: HEALTHY },
      // Added to the stage long after the rollout went through it, and failing
      // over configuration this ChangeOrder never touched.
      { spaceId: 'stg-2', stage: 'staging', liveStatus: DEGRADED },
      { spaceId: 'prod-1', stage: 'prod', liveStatus: HEALTHY },
    ]),
    [['dev-1'], ['stg-1', 'stg-2'], ['prod-1']],
    {
      resolved: [BASE, 'dev-1', 'stg-1', 'prod-1'],
      released: ['dev-1', 'stg-1', 'prod-1'],
    },
    'Completed',
  );

test('a Space added after the release does not make the finished rollout degraded', () => {
  const row = landedWithLateSpace();
  expect(row.state).toBe('complete');
  expect(row.blocker).not.toContain('reports it is not synced');
});

/*
 * A demote touches only the Spaces carrying the start tag, so rolling this
 * rollout back restores exactly the Spaces that took it — a release that
 * landed in production, with a Space in an earlier stage that never took the
 * change, is the designed case for these controls, not an edge case.
 */
test('a production release that already landed can still be rolled back', () => {
  expect(canAbortRollout(landedWithLateSpace())).toBe(true);
});

/*
 * And the sentence the reader actually needs survives. A Space left behind in an
 * earlier stage is the one thing worth saying about a rollout the workflow calls
 * done, and the health text had taken the cell over.
 */
test('the left-behind stage is named, not an unrelated workloads health', () => {
  const row = landedWithLateSpace();
  expect(row.blocker).toBe('Done, with staging left behind: it holds a Space the change never reached.');
  expect(actionFor(row).label).toBe('Resolve');
});

/*
 * ══ D4. THE BASE SPACE IS NOT A STAGE AND IS NEVER PROMOTED INTO ═══════════
 *
 * `validateStageEntryGates` quantifies over a previous STAGE. The base is not
 * one — it is where the change was authored — so `cub` never evaluates it for
 * any stage and no refusal it could produce exists.
 *
 * Judging it anyway meant one annotation on one Space withdrew Promote from
 * every stage of every rollout out of that base, daily, over a workload the
 * promotion does not depend on. A gate that refuses correct actions routinely
 * is a gate operators learn to override without reading, which costs far more
 * than it ever saves.
 */
const TWO_STAGES: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Released'] },
  ],
};

const degradedBase = () =>
  rowFor(
    TWO_STAGES,
    consoleSpaces(DEGRADED, [
      { spaceId: 'dev-1', stage: 'dev', liveStatus: HEALTHY },
      { spaceId: 'prod-1', stage: 'prod', liveStatus: HEALTHY },
    ]),
    [['dev-1'], ['prod-1']],
    { resolved: [BASE, 'dev-1'], released: ['dev-1'] },
    'dev',
  );

test('a degraded base Space does not withhold a promotion cub would allow', () => {
  const row = degradedBase();
  expect(row.state).toBe('ready');
  expect(actionFor(row).label).toBe('Promote');
});

/*
 * THE DISPLAY CHANNEL IS NOT SILENCED, ONLY THE VERDICT IS. What the base
 * reports is still drawn on the base's own segment, because that is a statement
 * about a workload and this channel exists to make exactly those. What it may
 * not do is decide whether a promotion into a different Space may proceed.
 */
test('the base Space still reports what it reports, on its own segment', () => {
  expect(tones(degradedBase())).toEqual([
    '__rollout_source__:degraded',
    'dev:done',
    'prod:ready',
  ]);
});
