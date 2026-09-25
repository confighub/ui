// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A STAGE MAY BE CALLED ANYTHING THE SERVER ACCEPTS, INCLUDING THIS APP'S OWN
// INTERNAL NAME FOR THE SOURCE ROW.
//
// `ChangeWorkflowStageNameRegexp` is `LabelValueRegexp`, whose permissive
// character class includes `_`, so `__rollout_source__` is a name the server
// stores without complaint. The UI's gate is the only gate there is — nothing
// server-side re-checks a promotion — so any question the UI answers by
// comparing a stage name against a constant is a question a user can answer for
// it by naming a stage.
//
// Both cases below are the same defect: "nothing real precedes this stage" must
// be a fact the sequence builder records, never a string comparison.

import { test, expect } from './fixtures/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import { LIVE_STATUS_ANNOTATION_KEY, type LiveStatus } from '../src/pages/x/apps/liveStatus';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import { blockingGates, buildGatesForStage, gatesOpen } from '../src/pages/x/apps/rollout/rolloutGates';
import { previousStageDisplayName, rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';
import { buildRolloutSequence } from '../src/pages/x/apps/rollout/rolloutStages';
import { deriveProgress, finalStageGates } from '../src/pages/x/apps/rollout/rolloutState';
import { actionFor, buildConsoleRow, type ConsoleSpace } from '../src/pages/x/apps/rollout/rolloutsConsoleModel';

/** The app's own identity for the source row, typed out as a user would type it. */
const RESERVED = '__rollout_source__';

const BASE = 'base-1';
const FIRST = 'first-1';
const PROD = 'prod-1';
const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };

const DEGRADED: LiveStatus = {
  syncStatus: 'OutOfSync',
  operationPhase: 'Failed',
  healthStatus: 'Degraded',
};

function consoleSpaces(stages: { spaceId: string; stage: string; liveStatus: LiveStatus | null }[]): ConsoleSpace[] {
  return [
    { spaceId: BASE, slug: 'myapp-base', component: COMPONENT },
    ...stages.map(({ spaceId, stage, liveStatus }) => ({
      spaceId,
      slug: `myapp-${spaceId}`,
      component: COMPONENT,
      labels: { Stage: stage },
      releaseTargetId: `target-${spaceId}`,
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
) {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {};
  workflow.Stages.forEach((stage, i) => {
    stageSpaces[stageWhereSpace(stage, COMPONENT)] = stageSpaceIds[i].map(
      (id) => ({ Space: { SpaceID: id } }) as ExtendedSpaceRead,
    );
  });
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      resolvedSpaceIds: progress.resolved,
      releasedSpaceIds: progress.released,
      inScopeSpaceIds: [BASE, ...stageSpaceIds.flat()],
      governing: { state: 'governed', workflow, changeWorkflowId: 'wf-1' },
    },
    spaces,
    stageSpaces,
  );
}

/*
 * ── C1: A STAGE NAMED AFTER THE SOURCE ROW MUST NOT UNGATE THE ONE AFTER IT ──
 *
 * `prod` declares both built-in prerequisites and sits behind a stage that is
 * neither released nor healthy. `cub` refuses that promotion outright. The only
 * thing that can make the UI disagree is reading "the stage before me is the
 * source" off the previous stage's NAME.
 */
const COLLIDING_WORKFLOW: ChangeWorkflowSpec = {
  Stages: [
    { Name: RESERVED, WhereSpace: `Labels.Stage = '${RESERVED}'` },
    { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Released', 'Healthy'] },
  ],
};

test('a stage named after the source row does not ungate the stage behind it', () => {
  const sequence = buildRolloutSequence(
    COLLIDING_WORKFLOW,
    {
      [RESERVED]: [{ Space: { SpaceID: FIRST } } as ExtendedSpaceRead],
      prod: [{ Space: { SpaceID: PROD } } as ExtendedSpaceRead],
    },
    BASE,
    undefined,
  );
  const prod = sequence.stages.find((s) => s.id === 'prod');
  if (prod === undefined) throw new Error('the sequence lost prod');

  const gates = buildGatesForStage({
    stage: prod,
    previousStageSpaces: [
      { spaceId: FIRST, loaded: true, variantName: 'myapp-first', liveStatus: DEGRADED, releaseTargetId: 'target-first' },
    ],
    progress: deriveProgress({
      changeOrderSpaceId: BASE,
      resolvedSpaceIds: [BASE, FIRST],
      releasedSpaceIds: [],
      restoredSpaceIds: undefined,
      releasedRestoredSpaceIds: undefined,
    }),
    componentName: COMPONENT.Slug,
    changeOrderSlug: 'co-1',
  });

  // Three gates, not none: the mandatory `promoted` plus the two the stage
  // declared. An empty list here is an open padlock over an unreleased,
  // degraded predecessor.
  expect(gates.length).toBe(3);
  expect(gatesOpen(gates)).toBe(false);
  expect(blockingGates(gates).length).toBeGreaterThan(0);
});

test('a console row over a stage named after the source row is not Ready', () => {
  const row = rowFor(
    COLLIDING_WORKFLOW,
    consoleSpaces([
      { spaceId: FIRST, stage: RESERVED, liveStatus: DEGRADED },
      { spaceId: PROD, stage: 'prod', liveStatus: null },
    ]),
    [[FIRST], [PROD]],
    { resolved: [BASE, FIRST], released: [] },
  );

  const prod = row.stages.find((s) => s.stageId === 'prod');
  expect(prod?.gates.length).toBeGreaterThan(0);
  // The predecessor is failing where the change already landed, which outranks
  // everything else the row could say about it.
  expect(row.state).toBe('degraded');
  expect(row.state).not.toBe('ready');
  expect(row.blocker).not.toBe('No blocker.');
});

/*
 * ── C2: THE SAME COLLISION MUST NOT DELETE THE FINAL HEALTH CHECK ───────────
 *
 * `finalStageGates` names the last stage as its own gate subject, so in a
 * one-stage workflow called `__rollout_source__` the subject's name IS the
 * reserved one. A name-based first-stage test therefore threw away the only
 * check standing between a failing production and a "complete" chip.
 */
const ONE_COLLIDING_STAGE: ChangeWorkflowSpec = {
  Stages: [{ Name: RESERVED, WhereSpace: `Labels.Stage = '${RESERVED}'` }],
  Final: { Prerequisites: ['Healthy'] },
};

test('the final health check of a stage named after the source row is still evaluated', () => {
  const sequence = buildRolloutSequence(
    ONE_COLLIDING_STAGE,
    { [RESERVED]: [{ Space: { SpaceID: PROD } } as ExtendedSpaceRead] },
    BASE,
    undefined,
  );
  const gates = finalStageGates({
    workflow: ONE_COLLIDING_STAGE,
    sequence,
    progress: deriveProgress({
      changeOrderSpaceId: BASE,
      resolvedSpaceIds: [BASE, PROD],
      releasedSpaceIds: [PROD],
      restoredSpaceIds: undefined,
      releasedRestoredSpaceIds: undefined,
    }),
    gateSpaceInput: (spaceId) => ({
      spaceId,
      loaded: true,
      variantName: `myapp-${spaceId}`,
      liveStatus: DEGRADED,
      releaseTargetId: `target-${spaceId}`,
    }),
    componentName: COMPONENT.Slug,
    changeOrderSlug: 'co-1',
  });

  expect(gates).not.toBeNull();
  expect(gates?.some((g) => g.id === 'check/healthy')).toBe(true);
  expect(gatesOpen(gates ?? [])).toBe(false);
});

test('a failing production in a stage named after the source row reads as degraded', () => {
  const row = rowFor(
    ONE_COLLIDING_STAGE,
    consoleSpaces([{ spaceId: PROD, stage: RESERVED, liveStatus: DEGRADED }]),
    [[PROD]],
    { resolved: [BASE, PROD], released: [PROD] },
  );

  // Not `complete-unverified`, which advises adding a `Healthy` the workflow
  // already declares, over a production that is reporting Degraded.
  expect(row.state).toBe('degraded');
  expect(row.blocker).toMatch(/myapp-prod-1/);
});

test('the row a stage is entered from is named by position, not by the name it holds', () => {
  const sequence = buildRolloutSequence(
    COLLIDING_WORKFLOW,
    {
      [RESERVED]: [{ Space: { SpaceID: FIRST } } as ExtendedSpaceRead],
      prod: [{ Space: { SpaceID: PROD } } as ExtendedSpaceRead],
    },
    BASE,
    undefined,
  );
  const first = sequence.stages.find((s) => s.isFirst);
  const prod = sequence.stages.find((s) => s.id === 'prod');
  if (first === undefined || prod === undefined) throw new Error('the sequence lost a stage');

  // Nothing real precedes the first stage, so what is printed is the source
  // row — never its internal id, which is what a reader would otherwise see.
  expect(previousStageDisplayName(first)).toBe('source');
  // And the stage behind `prod` is the one the workflow declared, whatever it
  // is called. Renaming it "source" here would report a predecessor nobody
  // wrote and hide the collision this file exists for.
  expect(previousStageDisplayName(prod)).toBe(RESERVED);
  expect(rolloutCopy.laneLabels(prod.id, previousStageDisplayName(prod))).toBe(`prod ← ${RESERVED}`);
});

/*
 * ── C3: THE SAME COLLISION IN THE REPORTED-HEALTH CHANNEL ───────────────────
 *
 * The channel that carries what a stage's Spaces SAY about themselves was built
 * after the two cases above and keyed its per-stage answers by `stage.id`. A
 * declared stage called `__rollout_source__` therefore overwrote the synthetic
 * source row's entry, and the row read the declared stage's report as the
 * base's.
 *
 * Both directions of that swap are wrong, and both are below. The stage here
 * has NOT taken the change and is reporting Degraded about whatever it is
 * running instead — nothing to do with this rollout, and nothing that should
 * stand between an operator and the first promotion of it.
 */
const UNREACHED_COLLIDING_STAGE: ChangeWorkflowSpec = {
  Stages: [{ Name: RESERVED, WhereSpace: `Labels.Stage = '${RESERVED}'` }],
};

test('an unreached stage named after the source row does not withdraw Promote', () => {
  const row = rowFor(
    UNREACHED_COLLIDING_STAGE,
    consoleSpaces([{ spaceId: PROD, stage: RESERVED, liveStatus: DEGRADED }]),
    [[PROD]],
    { resolved: [BASE], released: [] },
  );

  expect(row.state).toBe('ready');
  expect(actionFor(row).label).toBe('Promote');
  // The base reports nothing at all, so a sentence about `myapp-prod-1` here is
  // a verdict drawn from a workload running somebody else's change.
  expect(row.blocker).not.toContain('reports it is not synced');
  expect(row.blocker).toBe('No blocker.');
});

/*
 * ── C4: AND THE OTHER DIRECTION — THE BASE'S OWN REPORT, OVERWRITTEN ────────
 *
 * Same collision, read the other way round. The base IS reporting Degraded, and
 * the declared stage's green report landed on top of it, so the source segment
 * drew whatever the declared stage said instead of what the base said.
 *
 * `stage.id === lastStageId` collides here too: the synthetic source row
 * answered true to "am I the last stage of this workflow" and drew `unverified`
 * — a claim about production, made about the Space the change was authored in.
 */
const BASE_DEGRADED_SPACES: ConsoleSpace[] = [
  {
    spaceId: BASE,
    slug: 'myapp-base',
    component: COMPONENT,
    annotations: { [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify(DEGRADED) },
  },
  {
    spaceId: PROD,
    slug: `myapp-${PROD}`,
    component: COMPONENT,
    labels: { Stage: RESERVED },
    releaseTargetId: `target-${PROD}`,
    annotations: {
      [LIVE_STATUS_ANNOTATION_KEY]: JSON.stringify({
        syncStatus: 'Synced',
        operationPhase: 'Succeeded',
        healthStatus: 'Healthy',
      }),
    },
  },
];

test("a stage named after the source row does not overwrite the base's own report", () => {
  const row = rowFor(UNREACHED_COLLIDING_STAGE, BASE_DEGRADED_SPACES, [[PROD]], {
    resolved: [BASE, PROD],
    released: [PROD],
  });

  // Position 0 is the source row, whatever any stage is called. It draws what
  // the BASE reports, which is Degraded.
  expect(row.stages[0].isSource).toBe(true);
  expect(row.stages[0].segmentTone).toBe('degraded');
  // And it is not the last stage of anything. Position 1 is.
  expect(row.stages[0].segmentTone).not.toBe('unverified');
  expect(row.stages[1].segmentTone).toBe('unverified');
});

/*
 * And the last-stage question is positional too. `stage.id === lastStageId`
 * answers "am I the stage this workflow ends at" with a string compare, so the
 * synthetic source row said yes the moment the last declared stage was called
 * `__rollout_source__` — and drew `unverified`, a claim about production, over
 * the Space the change was authored in.
 *
 * The base here reports nothing at all, which is what makes the tone readable:
 * a failing report would be drawn ahead of this and hide it.
 */
test('the source row is not the last stage of a workflow that happens to use its name', () => {
  const row = rowFor(
    UNREACHED_COLLIDING_STAGE,
    consoleSpaces([{ spaceId: PROD, stage: RESERVED, liveStatus: null }]),
    [[PROD]],
    { resolved: [BASE, PROD], released: [PROD] },
  );

  expect(row.stages[0].isSource).toBe(true);
  expect(row.stages[0].segmentTone).toBe('done');
  // Position 1 is the last stage, and nothing checked its health.
  expect(row.stages[1].segmentTone).toBe('unverified');
});
