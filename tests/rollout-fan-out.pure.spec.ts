// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A rollout whose ChangeOrder's own Space does not hold the change from the
// start: a fan-out ChangeOrder (TransformPaths, Upsert, Insert), whose change is
// made in Spaces outside its scope and reaches each in-scope Space over that
// Space's own Links, and an Invoke one. The server promotes such a Space like
// any other and counts it as resolved only once it has been. Pure derivation, no
// page, no browser.
//
// Two things the UpgradeUnit shape takes for granted are untrue here:
//
//  - PROGRESS. Before the first promotion `ResolvedSpaceIDs` is genuinely empty,
//    which the UpgradeUnit reading takes as the server having failed to answer.
//  - THE WRITE SET. The ChangeOrder's own Space is a promotion target, and a
//    promote that leaves it out leaves it behind.

import { expect, test } from '@playwright/test';

import type { ChangeWorkflowSpec, ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import { stageWhereSpace } from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import {
  buildConsoleRow,
  promotionFor,
  type ConsoleChangeOrder,
  type ConsoleSpace,
} from '../src/pages/x/apps/rollout/rolloutsConsoleModel';
import { deriveProgress, hasTakenChange } from '../src/pages/x/apps/rollout/rolloutState';
import {
  changeOrderOwnSpaceReached,
  promotionSkippedSpaceId,
} from '../src/pages/x/apps/rollout/rolloutStages';
import { carryingReleases } from './fixtures/running-release';

const COMPONENT: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'app' };
const BASE = 'base-1';
const TEST = 'test-1';

/** A base stage selecting the ChangeOrder's own Space, then a test stage. */
const WORKFLOW: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'Base', WhereSpace: "Labels.Stage = 'Base'" },
    { Name: 'Test', WhereSpace: "Labels.Stage = 'Test'" },
  ],
};

function row(
  updateType: string,
  fields: Pick<ConsoleChangeOrder, 'resolvedSpaceIds' | 'state' | 'stage'>,
) {
  const stageSpaces: Record<string, ExtendedSpaceRead[]> = {
    [stageWhereSpace(WORKFLOW.Stages[0])]: [{ Space: { SpaceID: BASE } } as ExtendedSpaceRead],
    [stageWhereSpace(WORKFLOW.Stages[1])]: [{ Space: { SpaceID: TEST } } as ExtendedSpaceRead],
  };
  const spaces: ConsoleSpace[] = [
    {
      spaceId: BASE,
      slug: 'app-base',
      component: COMPONENT,
      labels: { Stage: 'Base' },
      releaseTargetId: `target-${BASE}`,
    },
    {
      spaceId: TEST,
      slug: 'app-test',
      component: COMPONENT,
      labels: { Stage: 'Test' },
      releaseTargetId: `target-${TEST}`,
    },
  ];
  return buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'release-v1',
      spaceId: BASE,
      spaceSlug: 'app-base',
      updateType,
      releasedSpaceIds: [],
      releases: carryingReleases([]),
      inScopeSpaceIds: [BASE, TEST],
      governing: { state: 'governed', workflow: WORKFLOW, changeWorkflowId: 'wf-1' },
      ...fields,
    },
    spaces,
    stageSpaces,
  );
}

// ── Which UpdateTypes start out in their own Space ───────────────────

test('only the Link-following upgrade types hold the change in their own Space', () => {
  expect(changeOrderOwnSpaceReached('UpgradeUnit')).toBe(true);
  expect(changeOrderOwnSpaceReached('MergeUnits')).toBe(true);
  // Absent is the server's default, UpgradeUnit.
  expect(changeOrderOwnSpaceReached(undefined)).toBe(true);
  expect(changeOrderOwnSpaceReached(null)).toBe(true);

  expect(changeOrderOwnSpaceReached('TransformPaths')).toBe(false);
  expect(changeOrderOwnSpaceReached('Upsert')).toBe(false);
  expect(changeOrderOwnSpaceReached('Insert')).toBe(false);
  expect(changeOrderOwnSpaceReached('Invoke')).toBe(false);
});

test('a promotion passes over the ChangeOrder’s own Space only when it holds the change', () => {
  expect(promotionSkippedSpaceId(BASE, 'UpgradeUnit')).toBe(BASE);
  expect(promotionSkippedSpaceId(BASE, 'TransformPaths')).toBeUndefined();
});

// ── Progress ─────────────────────────────────────────────────────────

const NO_RESTORES = {
  releasedSpaceIds: undefined,
  restoredSpaceIds: undefined,
  releasedRestoredSpaceIds: undefined,
  releases: undefined,
};

test('a fan-out ChangeOrder nothing has been promoted into has progress, and none of it', () => {
  const progress = deriveProgress({
    changeOrderSpaceId: BASE,
    ownSpaceReached: false,
    state: 'New',
    resolvedSpaceIds: undefined,
    ...NO_RESTORES,
  });
  expect(progress.availability).toBe('available');
  expect(hasTakenChange(progress, BASE)).toBe(false);
});

/*
 * `State` is set in the same pass that derives the progress fields, so its
 * absence is the server not having answered — for these UpdateTypes the one
 * signal left, since an empty resolved list is a real answer.
 */
test('a fan-out ChangeOrder with no State has no progress to show', () => {
  const progress = deriveProgress({
    changeOrderSpaceId: BASE,
    ownSpaceReached: false,
    state: undefined,
    resolvedSpaceIds: undefined,
    ...NO_RESTORES,
  });
  expect(progress.availability).toBe('unavailable');
});

/*
 * The server records Aborted before deriving anything, so an aborted fan-out
 * ChangeOrder with nothing resolved could be either answer.
 */
test('an aborted fan-out ChangeOrder with nothing resolved does not claim nothing was promoted', () => {
  const progress = deriveProgress({
    changeOrderSpaceId: BASE,
    ownSpaceReached: false,
    state: 'Aborted',
    resolvedSpaceIds: undefined,
    ...NO_RESTORES,
  });
  expect(progress.availability).toBe('unavailable');
});

test('an UpgradeUnit ChangeOrder still requires its own Space in the answer', () => {
  const progress = deriveProgress({
    changeOrderSpaceId: BASE,
    ownSpaceReached: true,
    state: 'New',
    resolvedSpaceIds: undefined,
    ...NO_RESTORES,
  });
  expect(progress.availability).toBe('unavailable');
});

// ── The rollout row ──────────────────────────────────────────────────

test('a fresh TransformPaths rollout is ready to promote into its own Space', () => {
  const fresh = row('TransformPaths', { resolvedSpaceIds: undefined, state: 'New' });
  expect(fresh.progressUnavailable).toBe(false);

  const promotion = promotionFor(fresh);
  expect(promotion?.stageId).toBe('Base');
  expect(promotion?.spaceIds).toEqual([BASE]);
  // The base has a release Target and is written into, so it can be released.
  expect(promotion?.canRelease).toBe(true);

  const base = fresh.stages.find((stage) => stage.stageId === 'Base');
  expect(base?.state.verdict).toBe('waiting');
  expect(base?.state.promotedCount).toBe(0);
});

test('once its own Space has taken the change, the rollout moves to the next stage', () => {
  const promoted = row('TransformPaths', {
    resolvedSpaceIds: [BASE],
    state: 'InProgress',
    stage: 'Base',
  });
  const base = promoted.stages.find((stage) => stage.stageId === 'Base');
  expect(base?.state.verdict).toBe('promoted');

  const promotion = promotionFor(promoted);
  expect(promotion?.stageId).toBe('Test');
  expect(promotion?.spaceIds).toEqual([TEST]);
});

test('an UpgradeUnit rollout still passes over its own Space', () => {
  const fresh = row('UpgradeUnit', { resolvedSpaceIds: [BASE], state: 'New' });
  // Its own Space has the change from the start, so the Base stage is done and
  // nothing in it is promoted into.
  const promotion = promotionFor(fresh);
  expect(promotion?.stageId).toBe('Test');
  expect(promotion?.spaceIds).toEqual([TEST]);
});

// ── The source row ───────────────────────────────────────────────────

const FACTS = 'facts-1';

/*
 * A fan-out ChangeOrder's change is made in the Spaces its Links take from, outside its
 * scope, so those are the source; its own Space is an ordinary target in its stage.
 */
test('a fan-out rollout’s source row is the Spaces its change was made in', () => {
  const fresh = buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'release-v1',
      spaceId: BASE,
      updateType: 'TransformPaths',
      sourceSpaceIds: [FACTS],
      state: 'New',
      inScopeSpaceIds: [BASE, TEST],
      governing: { state: 'governed', workflow: WORKFLOW, changeWorkflowId: 'wf-1' },
    },
    [],
    {
      [stageWhereSpace(WORKFLOW.Stages[0])]: [{ Space: { SpaceID: BASE } } as ExtendedSpaceRead],
      [stageWhereSpace(WORKFLOW.Stages[1])]: [{ Space: { SpaceID: TEST } } as ExtendedSpaceRead],
    },
  );
  const source = fresh.stages.find((stage) => stage.isSource);
  expect(source?.spaceIds).toEqual([FACTS]);
  expect(fresh.stages.find((stage) => stage.stageId === 'Base')?.spaceIds).toEqual([BASE]);
});

test('with its sources not yet looked up, the source row holds no Space rather than the base', () => {
  const fresh = row('TransformPaths', { resolvedSpaceIds: undefined, state: 'New' });
  expect(fresh.stages.find((stage) => stage.isSource)?.spaceIds).toEqual([]);
});

test('an UpgradeUnit rollout’s source row is still its base', () => {
  const fresh = row('UpgradeUnit', { resolvedSpaceIds: [BASE], state: 'New' });
  expect(fresh.stages.find((stage) => stage.isSource)?.spaceIds).toEqual([BASE]);
});

// ── An Invoke ChangeOrder's source ───────────────────────────────────

/*
 * An Invoke ChangeOrder has made no change anywhere until its Invocation runs in a stage,
 * so its source is the Invocation it runs: there is no Space where the change landed.
 */
test('an Invoke rollout’s source says the change is defined, not that it landed', () => {
  const fresh = row('Invoke', { resolvedSpaceIds: undefined, state: 'New' });
  const source = fresh.stages.find((stage) => stage.isSource);
  expect(source?.spaceIds).toEqual([]);
  expect(source?.state.label).toBe('Change defined');
  expect(source?.state.progress).toBe('Runs as each stage is promoted');
});

test('every other rollout’s source still says the change landed', () => {
  for (const updateType of ['UpgradeUnit', 'TransformPaths']) {
    const source = row(updateType, { resolvedSpaceIds: [BASE], state: 'InProgress' }).stages.find(
      (stage) => stage.isSource,
    );
    expect(source?.state.label).toBe('Change landed');
    expect(source?.state.progress).toBe('The change starts here');
  }
});
