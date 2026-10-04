// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `rolloutState.ts` exercised directly, same pattern as
// `rollout-sequence.spec.ts`: pure derivation, no page, no browser.
//
// The subject is `cub variant demote`, which undoes a ChangeOrder in a Space by
// minting a NEW higher-numbered Revision. It does not clear the end Tag the
// promotion left behind, so the Space stays in `ResolvedSpaceIDs` and
// `ReleasedSpaceIDs` forever. Reading only those two fields therefore paints an
// undone Space as promoted and released — the exact "false green" the derived
// status model exists to refuse. `RestoredSpaceIDs` /
// `ReleasedRestoredSpaceIDs` are the fields that say otherwise, and
// `changeOrderState` (internal/views/changeorder_propagation.go) checks them
// BEFORE it checks released, which is the precedence asserted here.

import { test, expect } from './fixtures/test';

import { deriveProgress, deriveSpaceState, deriveStageState } from '../src/pages/x/apps/rollout/rolloutState';
import type { RolloutProgress, RolloutStage } from '../src/pages/x/apps/rollout/rolloutTypes';
import { carryingReleases } from './fixtures/running-release';

const BASE = 'base-1';
const NO_SPACES: ReadonlySet<string> = new Set<string>();

interface ProgressFields {
  resolved?: string[];
  released?: string[];
  restored?: string[];
  releasedRestored?: string[];
}

function progressOf(fields: ProgressFields): RolloutProgress {
  return deriveProgress({
    changeOrderSpaceId: BASE,
    // The base is always a member of a genuine answer, so every fixture carries it.
    resolvedSpaceIds: [BASE, ...(fields.resolved ?? [])],
    releasedSpaceIds: fields.released,
    releases: carryingReleases(fields.released),
    restoredSpaceIds: fields.restored,
    releasedRestoredSpaceIds: fields.releasedRestored,
  });
}

function stageOf(spaceIds: string[]): RolloutStage {
  return {
    id: 'prod',
    previousStageId: 'staging',
    spaceIds,
    index: 2,
    isSource: false,
    isFirst: false,
    prerequisites: [],
  };
}

function spaceStateIn(stage: RolloutStage, spaceId: string, progress: RolloutProgress) {
  return deriveSpaceState({
    spaceId,
    stage,
    progress,
    inFlightSpaceIds: NO_SPACES,
    stageGatesOpen: true,
    previousStageId: stage.previousStageId,
  });
}

function stageStateOf(stage: RolloutStage, progress: RolloutProgress) {
  return deriveStageState({ stage, gates: [], progress, inFlightSpaceIds: NO_SPACES });
}

test('a restored Space reads as restored, never as released', () => {
  const stage = stageOf(['prod-1']);
  const progress = progressOf({
    resolved: ['prod-1'],
    released: ['prod-1'],
    restored: ['prod-1'],
  });

  const state = spaceStateIn(stage, 'prod-1', progress);
  expect(state.verdict).toBe('restored');
  expect(state.strip).toBe('Restored, not released');
});

test('a restored Space whose undoing was released reads as restore-released', () => {
  const stage = stageOf(['prod-1']);
  const progress = progressOf({
    resolved: ['prod-1'],
    released: ['prod-1'],
    restored: ['prod-1'],
    releasedRestored: ['prod-1'],
  });

  const state = spaceStateIn(stage, 'prod-1', progress);
  expect(state.verdict).toBe('restore-released');
  expect(state.strip).toBe('Restored and released');
});

test('restoring one Space of a stage leaves its sibling released', () => {
  const stage = stageOf(['prod-1', 'prod-2']);
  const progress = progressOf({
    resolved: ['prod-1', 'prod-2'],
    released: ['prod-1', 'prod-2'],
    restored: ['prod-1'],
  });

  expect(spaceStateIn(stage, 'prod-1', progress).verdict).toBe('restored');
  expect(spaceStateIn(stage, 'prod-2', progress).verdict).toBe('released');
});

test('a stage with one Space restored is not a released stage', () => {
  const stage = stageOf(['prod-1', 'prod-2']);
  const progress = progressOf({
    resolved: ['prod-1', 'prod-2'],
    released: ['prod-1', 'prod-2'],
    restored: ['prod-1'],
  });

  const state = stageStateOf(stage, progress);
  expect(state.verdict).not.toBe('released');
  expect(state.verdict).not.toBe('promoted');
  // Part-way, the same reading a half-promoted stage gets: one Space holds the
  // change, one has had it taken back out.
  expect(state.verdict).toBe('in-progress');
  // Both dimensions are legible, so the count can never claim more than the
  // verdict does: one Space still holds it, one no longer does.
  expect(state.promotedCount).toBe(1);
  expect(state.restoredCount).toBe(1);
  expect(state.spaceCount).toBe(2);
});

test('a stage restored everywhere reads as restored', () => {
  const stage = stageOf(['prod-1', 'prod-2']);
  const progress = progressOf({
    resolved: ['prod-1', 'prod-2'],
    released: ['prod-1', 'prod-2'],
    restored: ['prod-1', 'prod-2'],
  });

  const state = stageStateOf(stage, progress);
  expect(state.verdict).toBe('restored');
  expect(state.label).toBe('Restored, not released');
  expect(state.promotedCount).toBe(0);
  expect(state.restoredCount).toBe(2);
});

test('a stage whose undoing was released everywhere reads as restore-released', () => {
  const stage = stageOf(['prod-1', 'prod-2']);
  const progress = progressOf({
    resolved: ['prod-1', 'prod-2'],
    released: ['prod-1', 'prod-2'],
    restored: ['prod-1', 'prod-2'],
    releasedRestored: ['prod-1', 'prod-2'],
  });

  const state = stageStateOf(stage, progress);
  expect(state.verdict).toBe('restore-released');
  expect(state.label).toBe('Restored and released');
});

// Restoring is not sticky: a Space restored and then promoted into again drops
// out of `RestoredSpaceIDs` the next time the ChangeOrder is read, and the
// verdict has to follow it back rather than latch.
test('a re-promoted Space leaves the restored verdict behind', () => {
  const stage = stageOf(['prod-1']);

  const rePromoted = progressOf({ resolved: ['prod-1'], released: [], restored: [] });
  expect(spaceStateIn(stage, 'prod-1', rePromoted).verdict).toBe('promoted');

  const rePromotedAndReleased = progressOf({
    resolved: ['prod-1'],
    released: ['prod-1'],
    restored: [],
  });
  expect(spaceStateIn(stage, 'prod-1', rePromotedAndReleased).verdict).toBe('released');

  const stageState = stageStateOf(stage, rePromotedAndReleased);
  expect(stageState.verdict).toBe('released');
  expect(stageState.restoredCount).toBe(0);
});

// The restore fields are legitimately empty on the overwhelming majority of
// ChangeOrders — nothing has been restored — so an empty one must never be read
// the way an absent `ResolvedSpaceIDs` is.
test('absent restore fields leave every other verdict untouched', () => {
  const stage = stageOf(['prod-1']);
  const progress = deriveProgress({
    changeOrderSpaceId: BASE,
    resolvedSpaceIds: [BASE, 'prod-1'],
    releasedSpaceIds: ['prod-1'],
    releases: carryingReleases(['prod-1']),
    restoredSpaceIds: undefined,
    releasedRestoredSpaceIds: undefined,
  });

  expect(progress.availability).toBe('available');
  expect(spaceStateIn(stage, 'prod-1', progress).verdict).toBe('released');
  expect(stageStateOf(stage, progress).verdict).toBe('released');
});
