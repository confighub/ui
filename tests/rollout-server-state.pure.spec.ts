// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The console row read against the ChangeOrder's own `State` and `Stage`, the
// two fields `cub changeorder list/get` prints. Exercised directly: no page, no
// browser.
//
// The server calls a ChangeOrder finished when `Stage` is `Completed` or `State`
// is Released, RestoreReleased or Aborted (`IsFinished`,
// internal/models/changeorder.go). `Stage` is only advanced when a Release is
// published for the ChangeOrder, so `State` can read Released while `Stage`
// still names the last stage. The row must read that rollout as complete, and
// must say "needs a Release" only when a Release is really missing.

import { expect, test } from '@playwright/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import type { LiveStatus } from '../src/pages/x/apps/liveStatus';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import {
  buildConsoleRow,
  type ConsoleChangeOrder,
  type ConsoleRow,
  type ConsoleSpace,
  type ConsoleState,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';
import { buildCompleteConsoleStage, completeStepTone } from '../src/pages/rollouts/rolloutCompleteStep';
import { carryingReleases, runningRelease } from './fixtures/running-release';

const BASE = 'base-1';
const DEV = 'dev-1';
const STAGING = 'staging-1';
const PROD = 'prod-1';

const HEALTHY: LiveStatus = { Reporter: 'argobot', Sync: 'Synced', Operation: 'Succeeded', Health: 'Healthy' };
const DEGRADED: LiveStatus = { Reporter: 'argobot', Sync: 'OutOfSync', Operation: 'Failed', Health: 'Degraded' };

const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };

const COMPLETE_STATES: readonly ConsoleState[] = ['complete', 'complete-unverified'];

function workflow(
  stageNames: string[],
  final: string[] | undefined,
  prerequisites: Record<string, string[]> = {},
): ChangeWorkflowSpec {
  return {
    CustomPrerequisites: [
      { Name: 'signed-off', Expression: "cel:Space.Annotations['signoff'] == 'true'", Description: 'Signed off' },
    ],
    Stages: stageNames.map((name) => ({
      Name: name,
      WhereSpace: `Labels.Stage = '${name}'`,
      Prerequisites: prerequisites[name],
    })),
    ...(final === undefined ? {} : { Final: { Prerequisites: final } }),
  };
}

interface Fixture {
  stages: string[];
  /** The Spaces each stage selects, by stage name. A stage absent here selects none. */
  members: Record<string, string[]>;
  final?: string[];
  /** Each stage's declared entry prerequisites, by stage name. */
  prerequisites?: Record<string, string[]>;
  liveStatus?: Record<string, LiveStatus>;
  order: Partial<ConsoleChangeOrder>;
}

function rowFor(fixture: Fixture): ConsoleRow {
  const wf = workflow(fixture.stages, fixture.final, fixture.prerequisites);
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {};
  for (const stage of wf.Stages) {
    stageSpaces[stageWhereSpace(stage)] = (fixture.members[stage.Name] ?? []).map(
      (spaceId) => ({ Space: { SpaceID: spaceId } }) as ExtendedSpaceRead,
    );
  }
  const memberIds = Object.values(fixture.members).flat();
  const spaces: ConsoleSpace[] = [
    { spaceId: BASE, slug: 'myapp-base', component: COMPONENT },
    ...memberIds.map((spaceId): ConsoleSpace => {
      return {
        spaceId,
        slug: `myapp-${spaceId.replace(/-1$/, '')}`,
        component: COMPONENT,
        releaseTargetId: `target-${spaceId}`,
        // `null` live status is a published Release no tool has reported on.
        release: runningRelease(fixture.liveStatus?.[spaceId] ?? null),
      };
    }),
  ];
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'ship-the-thing',
      spaceId: BASE,
      spaceSlug: 'myapp-base',
      inScopeSpaceIds: [BASE, ...memberIds],
      governing: { state: 'governed', workflow: wf, changeWorkflowId: 'wf-1' },
      releases: carryingReleases(fixture.order.releasedSpaceIds),
      ...fixture.order,
    },
    spaces,
    stageSpaces,
  );
}

const TWO_STAGES = { stages: ['dev', 'prod'], members: { dev: [DEV], prod: [PROD] } };

test.describe('the server says the rollout is finished', () => {
  test('State Released with Stage still on the last stage reads complete, not "needs a Release"', () => {
    for (const final of [undefined, ['Healthy'], ['Released']]) {
      const row = rowFor({
        ...TWO_STAGES,
        final,
        liveStatus: { [DEV]: HEALTHY, [PROD]: HEALTHY },
        order: {
          resolvedSpaceIds: [BASE, DEV, PROD],
          releasedSpaceIds: [DEV, PROD],
          stage: 'prod',
          state: 'Released',
        },
      });
      expect(COMPLETE_STATES).toContain(row.state);
      expect(COMPLETE_STATES).toContain(row.gateState.state);
      expect(row.nextStageId).toBeNull();
      expect(row.workflowComplete).toBe(true);
      expect(row.blocker).not.toMatch(/Release/);
    }
  });

  test('State Released wins even when the UI cannot see why the server released it', () => {
    // A last stage without a release target fails every check the UI can make
    // over it, yet the server reports the rollout released everywhere.
    const row = rowFor({
      ...TWO_STAGES,
      final: ['Released'],
      order: {
        resolvedSpaceIds: [BASE, DEV, PROD],
        releasedSpaceIds: [DEV],
        stage: 'prod',
        state: 'Released',
      },
    });
    expect(COMPLETE_STATES).toContain(row.state);
  });

  // RestoreReleased always comes with restore marks, and a restored stage reads
  // as aborted ahead of the server's "finished".
  test('State RestoreReleased reads aborted, not complete', () => {
    const row = rowFor({
      ...TWO_STAGES,
      order: {
        resolvedSpaceIds: [BASE, DEV, PROD],
        releasedSpaceIds: [DEV, PROD],
        restoredSpaceIds: [DEV, PROD],
        releasedRestoredSpaceIds: [DEV, PROD],
        stage: 'prod',
        state: 'RestoreReleased',
      },
    });
    expect(row.state).toBe('aborted');
  });

  test('Stage Completed reads complete even while the last stage reports Degraded', () => {
    const row = rowFor({
      ...TWO_STAGES,
      liveStatus: { [DEV]: HEALTHY, [PROD]: DEGRADED },
      order: {
        resolvedSpaceIds: [BASE, DEV, PROD],
        releasedSpaceIds: [DEV, PROD],
        stage: 'Completed',
        state: 'Released',
      },
    });
    expect(COMPLETE_STATES).toContain(row.state);
    // The failure is still shown where it is: on the stage, and in the cell.
    expect(row.stages.at(-1)?.segmentTone).toBe('degraded');
    expect(row.blocker).toMatch(/myapp-prod/);
  });

  test('Stage Completed wins over a workflow whose stages select no Space', () => {
    const row = rowFor({
      stages: ['dev', 'prod'],
      members: {},
      order: { resolvedSpaceIds: [BASE], releasedSpaceIds: [], stage: 'Completed', state: 'Released' },
    });
    expect(COMPLETE_STATES).toContain(row.state);
  });

  test('an aborted rollout stays aborted whatever State and Stage say', () => {
    const row = rowFor({
      ...TWO_STAGES,
      order: {
        resolvedSpaceIds: [BASE, DEV, PROD],
        releasedSpaceIds: [DEV, PROD],
        stage: 'Completed',
        state: 'Released',
        abortedReason: 'Rolled out by mistake.',
      },
    });
    expect(row.state).toBe('aborted');
    expect(row.blocker).toBe('Rolled out by mistake.');
  });
});

test.describe('"needs a Release" only when a Release is missing', () => {
  test('State Resolved with every Space promoted and none released is blocked', () => {
    const row = rowFor({
      ...TWO_STAGES,
      liveStatus: { [DEV]: HEALTHY, [PROD]: HEALTHY },
      order: {
        resolvedSpaceIds: [BASE, DEV, PROD],
        releasedSpaceIds: [],
        stage: 'prod',
        state: 'Resolved',
      },
    });
    expect(row.state).toBe('blocked');
    expect(row.nextStageId).toBeNull();
    expect(row.blocker).toMatch(/released/);
  });

  test('a stale Stage with nothing holding the rollout is not blocked', () => {
    // No State from the server, every stage promoted and released, no Final to
    // hold it: nothing says a Release is missing.
    const row = rowFor({
      ...TWO_STAGES,
      liveStatus: { [DEV]: HEALTHY, [PROD]: HEALTHY },
      order: { resolvedSpaceIds: [BASE, DEV, PROD], releasedSpaceIds: [DEV, PROD], stage: 'prod' },
    });
    expect(row.state).not.toBe('blocked');
  });
});

test.describe('Complete is never inferred against the server', () => {
  test('State InProgress with every stage done and a Space in no stage is not complete', () => {
    // An in-scope Space no stage selects: every stage reads done, and the
    // server still reports the order unfinished.
    const row = rowFor({
      ...TWO_STAGES,
      liveStatus: { [DEV]: HEALTHY, [PROD]: HEALTHY },
      order: {
        resolvedSpaceIds: [BASE, DEV, PROD],
        releasedSpaceIds: [DEV, PROD],
        inScopeSpaceIds: [BASE, DEV, PROD, 'other-1'],
        stage: 'prod',
        state: 'InProgress',
      },
    });
    expect(row.nextStageId).toBeNull();
    expect(row.state).toBe('progressing');
    expect(row.workflowComplete).toBe(false);
  });

  test('State RestoreReleased with no AbortedReason and a stage left behind is not complete', () => {
    const row = rowFor({
      stages: ['dev', 'staging', 'prod'],
      members: { dev: [DEV], staging: [STAGING], prod: [PROD] },
      order: {
        resolvedSpaceIds: [BASE, DEV, PROD],
        releasedSpaceIds: [DEV, PROD],
        restoredSpaceIds: [DEV, PROD],
        releasedRestoredSpaceIds: [DEV, PROD],
        stage: 'prod',
        state: 'RestoreReleased',
      },
    });
    // staging holds a Space the change never reached.
    expect(row.nextStageId).not.toBeNull();
    expect(COMPLETE_STATES).not.toContain(row.state);
  });
});

test.describe('"needs a Release" only for a Release: other holds read Held', () => {
  test('a stage after one that selects no Space is held, and the Blocker names the empty stage', () => {
    const row = rowFor({
      stages: ['dev', 'staging', 'prod'],
      members: { dev: [DEV], prod: [PROD] },
      order: { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [DEV], stage: 'dev', state: 'InProgress' },
    });
    expect(row.nextStageId).toBe('prod');
    expect(row.state).toBe('held');
    expect(row.blocker).toMatch(/'staging' selects no Space/);
  });

  test('a custom prerequisite on the next stage holds it, not a missing Release', () => {
    const row = rowFor({
      ...TWO_STAGES,
      prerequisites: { prod: ['signed-off'] },
      order: { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [DEV], stage: 'dev', state: 'InProgress' },
    });
    expect(row.nextStageId).toBe('prod');
    expect(row.state).toBe('held');
  });

  test('a prerequisite nothing declares holds the next stage, not a missing Release', () => {
    const row = rowFor({
      ...TWO_STAGES,
      prerequisites: { prod: ['Approved'] },
      order: { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [DEV], stage: 'dev', state: 'InProgress' },
    });
    expect(row.state).toBe('held');
  });

  test('a failing Released gate on the next stage is still blocked', () => {
    const row = rowFor({
      ...TWO_STAGES,
      prerequisites: { prod: ['Released'] },
      order: { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [], stage: 'dev', state: 'InProgress' },
    });
    expect(row.nextStageId).toBe('prod');
    expect(row.state).toBe('blocked');
  });
});

test.describe('after the last stage, the chip and the Blocker agree', () => {
  for (const state of [undefined, 'InProgress']) {
    test(`a final prerequisite that is not a Release holds it (State ${state ?? 'absent'})`, () => {
      const row = rowFor({
        ...TWO_STAGES,
        final: ['signed-off'],
        liveStatus: { [DEV]: HEALTHY, [PROD]: HEALTHY },
        order: { resolvedSpaceIds: [BASE, DEV, PROD], releasedSpaceIds: [DEV, PROD], stage: 'prod', state },
      });
      expect(row.nextStageId).toBeNull();
      expect(row.state).toBe('held');
      expect(row.blocker).toMatch(/final prerequisites are not satisfied/);
    });
  }

  test('a failing final Released gate is blocked', () => {
    const row = rowFor({
      ...TWO_STAGES,
      final: ['Released'],
      liveStatus: { [DEV]: HEALTHY, [PROD]: HEALTHY },
      order: { resolvedSpaceIds: [BASE, DEV, PROD], releasedSpaceIds: [DEV], stage: 'prod', state: 'InProgress' },
    });
    expect(row.state).toBe('blocked');
  });

  test('an in-scope Space in no stage, with no Final, is not blamed on final prerequisites', () => {
    const row = rowFor({
      ...TWO_STAGES,
      liveStatus: { [DEV]: HEALTHY, [PROD]: HEALTHY },
      order: {
        resolvedSpaceIds: [BASE, DEV, PROD],
        releasedSpaceIds: [DEV, PROD],
        inScopeSpaceIds: [BASE, DEV, PROD, 'other-1'],
        stage: 'prod',
        state: 'InProgress',
      },
    });
    expect(row.state).toBe('progressing');
    expect(row.blocker).not.toMatch(/final prerequisites/);
    expect(row.blocker).toMatch(/in a stage/);
  });
});

test.describe('the current step is read from progress', () => {
  const THREE_WITH_EMPTY_MIDDLE = {
    stages: ['dev', 'staging', 'prod'],
    members: { dev: [DEV], prod: [PROD] },
  };

  test('a stage that selects no Space is never next, and counts as done once passed', () => {
    const row = rowFor({
      ...THREE_WITH_EMPTY_MIDDLE,
      order: { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [DEV], stage: 'dev', state: 'InProgress' },
    });
    expect(row.nextStageId).toBe('prod');
    // base, dev, staging, prod and Complete.
    expect(row.stagesTotal).toBe(5);
    // base, dev and the empty staging the rollout has passed.
    expect(row.stagesDone).toBe(3);
  });

  test('a Stage that lags behind progress does not hold the next step back', () => {
    const row = rowFor({
      stages: ['dev', 'staging', 'prod'],
      members: { dev: [DEV], staging: [STAGING], prod: [PROD] },
      order: {
        resolvedSpaceIds: [BASE, DEV, STAGING],
        releasedSpaceIds: [DEV, STAGING],
        stage: 'dev',
        state: 'InProgress',
      },
    });
    expect(row.nextStageId).toBe('prod');
    expect(row.stagesDone).toBe(3);
    expect(row.stagesTotal).toBe(5);
  });

  test('every Space promoted leaves no next step, whatever Stage names', () => {
    const row = rowFor({
      ...THREE_WITH_EMPTY_MIDDLE,
      order: { resolvedSpaceIds: [BASE, DEV, PROD], releasedSpaceIds: [DEV, PROD], stage: 'dev', state: 'Released' },
    });
    expect(row.nextStageId).toBeNull();
    expect(row.stagesDone).toBe(5);
    expect(row.stagesTotal).toBe(5);
    expect(COMPLETE_STATES).toContain(row.state);
  });
});

/** Every step the list strip draws: the row's stages, then the Complete step. */
function pathOf(row: ConsoleRow) {
  return [...row.stages, buildCompleteConsoleStage(row)];
}

test.describe('the count and the pips follow the promotion path', () => {
  test('a complete rollout with an empty stage reads 5 of 5, every pip done', () => {
    // No Final, so nothing checks the last stage's health: the user's
    // "Complete, unverified" row.
    const row = rowFor({
      stages: ['dev', 'staging', 'prod'],
      members: { dev: [DEV], prod: [PROD] },
      order: { resolvedSpaceIds: [BASE, DEV, PROD], releasedSpaceIds: [DEV, PROD], stage: 'prod', state: 'Released' },
    });
    expect(row.state).toBe('complete-unverified');
    expect(pathOf(row)).toHaveLength(5);
    expect(row.stagesTotal).toBe(5);
    expect(row.stagesDone).toBe(5);
    expect(pathOf(row).map((s) => s.segmentTone)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  test('a complete rollout with three real stages reads 5 of 5, every pip done', () => {
    for (const final of [undefined, ['Healthy']]) {
      const row = rowFor({
        stages: ['dev', 'staging', 'prod'],
        members: { dev: [DEV], staging: [STAGING], prod: [PROD] },
        final,
        liveStatus: { [DEV]: HEALTHY, [STAGING]: HEALTHY, [PROD]: HEALTHY },
        order: {
          resolvedSpaceIds: [BASE, DEV, STAGING, PROD],
          releasedSpaceIds: [DEV, STAGING, PROD],
          stage: 'Completed',
          state: 'Released',
        },
      });
      expect(COMPLETE_STATES).toContain(row.state);
      expect(row.stagesTotal).toBe(5);
      expect(row.stagesDone).toBe(5);
      expect(pathOf(row).every((s) => s.segmentTone === 'done')).toBe(true);
    }
  });

  test('a complete rollout still shows a failing workload on its own pip', () => {
    const row = rowFor({
      ...TWO_STAGES,
      liveStatus: { [DEV]: HEALTHY, [PROD]: DEGRADED },
      order: { resolvedSpaceIds: [BASE, DEV, PROD], releasedSpaceIds: [DEV, PROD], stage: 'Completed', state: 'Released' },
    });
    expect(COMPLETE_STATES).toContain(row.state);
    expect(row.stagesDone).toBe(row.stagesTotal);
    expect(row.stages.find((s) => s.stageId === 'prod')?.segmentTone).toBe('degraded');
  });

  test('an in-progress rollout counts the empty stage it has passed as done', () => {
    const row = rowFor({
      stages: ['dev', 'staging', 'prod'],
      members: { dev: [DEV], prod: [PROD] },
      liveStatus: { [DEV]: HEALTHY },
      order: { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [DEV], stage: 'dev', state: 'InProgress' },
    });
    expect(row.nextStageId).toBe('prod');
    expect(row.stagesDone).toBe(3);
    expect(row.stagesTotal).toBe(5);
    const tones = pathOf(row).map((s) => s.segmentTone);
    expect(tones.slice(0, 3)).toEqual(['done', 'done', 'done']);
    expect(tones[3]).not.toBe('done');
    expect(tones[4]).toBe('gated');
  });

  test('the pips drawn done are exactly the steps counted done', () => {
    const fixtures: Fixture[] = [
      { ...TWO_STAGES, order: { resolvedSpaceIds: [BASE], stage: undefined, state: 'New' } },
      { ...TWO_STAGES, order: { resolvedSpaceIds: [BASE, DEV], releasedSpaceIds: [DEV], state: 'InProgress' } },
      {
        stages: ['dev', 'staging', 'qa', 'prod'],
        members: { dev: [DEV], qa: [STAGING], prod: [PROD] },
        liveStatus: { [DEV]: HEALTHY, [STAGING]: HEALTHY },
        order: {
          resolvedSpaceIds: [BASE, DEV, STAGING],
          releasedSpaceIds: [DEV, STAGING],
          stage: 'qa',
          state: 'InProgress',
        },
      },
      {
        ...TWO_STAGES,
        order: { resolvedSpaceIds: [BASE, DEV, PROD], releasedSpaceIds: [DEV, PROD], stage: 'Completed', state: 'Released' },
      },
    ];
    for (const fixture of fixtures) {
      const row = rowFor(fixture);
      const path = pathOf(row);
      // The total is the path: the source, every declared stage, and Complete.
      expect(row.stagesTotal).toBe(path.length);
      expect(row.stagesTotal).toBe(fixture.stages.length + 2);
      const doneCount = path.filter((s) => s.segmentTone === 'done').length;
      expect(doneCount).toBe(row.stagesDone);
    }
  });
});

test('the Complete step reads done for a complete row, even with a stage left behind', () => {
  expect(completeStepTone({ state: 'complete', nextStageId: 'prod', restored: false })).toBe('done');
  expect(completeStepTone({ state: 'complete-unverified', nextStageId: 'prod', restored: false })).toBe('done');
});
