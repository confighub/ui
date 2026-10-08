// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `stagePathProgress` (rolloutsConsoleModel.ts), the "N of M" figure,
// exercised directly: no page, no browser, same pure-derivation pattern as
// `rollout-complete-step.pure.spec.ts`.
//
// THE FIGURE COUNTS THE PROMOTION PATH AS IT IS DRAWN. The list strip, the
// detail rail and the detail pips draw one mark per step: the source, every
// stage the ChangeWorkflow declares (one that selects no Space included), and
// the Complete step. A total over fewer steps than the marks reads "3 of 3"
// under five pips, so every drawn step is in the total.
//
// AND THE FINAL CHECKLIST DOES NOT MOVE WITH IT. `finalStageGates` takes the
// LAST stage from `promotableStages`, empty or not. The last two tests hold
// that line.

import { expect, test } from '@playwright/test';

import { buildRolloutSequence, promotableStages } from '../src/pages/x/apps/rollout/rolloutStages';
import {
  deriveProgress,
  deriveStageState,
  finalStageGates,
  nextStageIndexFromProgress,
} from '../src/pages/x/apps/rollout/rolloutState';
import { stagePathProgress, type ConsoleState } from '../src/pages/x/apps/rollout/rolloutsConsoleModel';
import type { RolloutGateSpaceInput } from '../src/pages/x/apps/rollout/rolloutGates';
import type { RolloutSequence, RolloutStageState } from '../src/pages/x/apps/rollout/rolloutTypes';
import type { ChangeWorkflowSpec } from '@confighub/rtk-query';
import { carryingReleases } from './fixtures/running-release';

const BASE = 'base-1';

/** The frozen spec a ChangeOrder carries: stages, and a `Final` checklist. */
function workflow(
  stages: { name: string; prerequisites?: string[] }[],
  final: string[] = [],
): ChangeWorkflowSpec {
  return {
    Stages: stages.map((s) => ({
      Name: s.name,
      WhereSpace: `Labels.Stage='${s.name}'`,
      Prerequisites: s.prerequisites,
    })),
    Final: { Prerequisites: final },
  };
}

// `SpaceID` sits under `.Space`, matching the generated `ExtendedSpaceRead`
// `useWorkflowStageSpaces` populates — the same field path
// `buildRolloutSequence` reads in production.
function space(id: string) {
  return { Space: { SpaceID: id } } as never;
}

function sequenceOf(
  wf: ChangeWorkflowSpec,
  spacesByStage: Record<string, string[]>,
): RolloutSequence {
  const resolved: Record<string, ReturnType<typeof space>[]> = {};
  for (const [stageName, ids] of Object.entries(spacesByStage)) {
    resolved[stageName] = ids.map(space);
  }
  return buildRolloutSequence(wf, resolved, [BASE]);
}

/**
 * The stage states a rollout with this reported progress produces. Built
 * through `deriveStageState` rather than hand-written, so the counts under test
 * are read off the same verdicts the rail and the strip are drawn from.
 */
function statesOf(
  sequence: RolloutSequence,
  reported: { resolved: string[]; released?: string[]; restored?: string[] },
): RolloutStageState[] {
  const progress = deriveProgress({
    changeOrderSpaceId: BASE,
    ownSpaceReached: true,
    state: undefined,
    resolvedSpaceIds: [BASE, ...reported.resolved],
    releasedSpaceIds: reported.released,
    releases: carryingReleases(reported.released),
    restoredSpaceIds: reported.restored,
    releasedRestoredSpaceIds: undefined,
  });
  return sequence.stages.map((stage) =>
    deriveStageState({ stage, gates: [], progress, inFlightSpaceIds: new Set<string>() }),
  );
}

/** The first stage still holding a Space the change has not reached, or `null`. */
function nextStageId(states: RolloutStageState[]): string | null {
  const index = nextStageIndexFromProgress(states);
  return index === -1 ? null : states[index].stageId;
}

/** The figure for these states, read as a row in `state` would read them. */
function pathOf(states: RolloutStageState[], state: ConsoleState = 'progressing') {
  return stagePathProgress(states.length, nextStageIndexFromProgress(states), state);
}

function completionInput(sequence: RolloutSequence, wf: ChangeWorkflowSpec, reported: string[]) {
  return {
    workflow: wf,
    sequence,
    progress: deriveProgress({
      changeOrderSpaceId: BASE,
      ownSpaceReached: true,
      state: undefined,
      resolvedSpaceIds: [BASE, ...reported],
      releasedSpaceIds: reported,
      releases: carryingReleases(reported),
      restoredSpaceIds: undefined,
      releasedRestoredSpaceIds: undefined,
    }),
    gateSpaceInput: (spaceId: string): RolloutGateSpaceInput => ({
      spaceId,
      loaded: true,
      variantName: spaceId,
      release: null,
      releaseTargetId: 'target-1',
    }),
    componentName: 'app',
    changeOrderSlug: 'co-1',
  };
}

test.describe('every step of the path is in the total', () => {
  test('a stage that selects no Space is in the total, and done once passed', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'prod' }]);
    // `dev` is declared and labelled on nothing; `prod` holds the only Space.
    const sequence = sequenceOf(wf, { dev: [], prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: [] });

    // The stage IS in the sequence — an unmatched selector is a problem note,
    // not a missing entry — and the rail draws it, so it is in the total.
    expect(promotableStages(sequence)).toHaveLength(2);
    expect(sequence.problems).toContainEqual({ kind: 'stage-selects-nothing', stageName: 'dev' });

    // base, dev, prod and Complete. The empty dev is behind the next stage.
    expect(nextStageId(states)).toBe('prod');
    expect(pathOf(states)).toEqual({ done: 2, total: 4 });
  });

  test('every Space promoted, not yet finished: every stage done, Complete not', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: [], prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: ['prod-1'] });

    expect(nextStageId(states)).toBeNull();
    expect(pathOf(states)).toEqual({ done: 3, total: 4 });
  });

  test('a complete rollout has passed every step, the empty ones included', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'staging' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: ['dev-1'], staging: [], prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: ['dev-1', 'prod-1'], released: ['dev-1', 'prod-1'] });

    for (const state of ['complete', 'complete-unverified'] as const) {
      expect(pathOf(states, state)).toEqual({ done: 5, total: 5 });
    }
  });

  test('a workflow where nothing is labelled has passed only the source', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'staging' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: [], staging: [], prod: [] });
    const states = statesOf(sequence, { resolved: [] });

    expect(promotableStages(sequence)).toHaveLength(3);
    // No stage is next, which alone would pass every stage. A row with
    // nowhere to promote (`no-stages`) has not travelled anywhere.
    expect(nextStageId(states)).toBeNull();
    expect(pathOf(states, 'no-stages')).toEqual({ done: 1, total: 5 });
  });

  test('a real stage still ahead is not done', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'staging' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: [], staging: ['staging-1'], prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: ['staging-1'] });

    expect(nextStageId(states)).toBe('prod');
    expect(pathOf(states)).toEqual({ done: 3, total: 5 });
  });

  test('the source row is in the total, and done from the start', () => {
    const wf = workflow([{ name: 'prod' }]);
    const sequence = sequenceOf(wf, { prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: [] });

    expect(states[0].verdict).toBe('source');
    expect(pathOf(states)).toEqual({ done: 1, total: 3 });
  });
});

/*
 * A restored stage is one the change has been taken back out of, and every
 * other surface says so: `deriveConsoleState` reports such a rollout
 * `aborted`, the Complete step gives it the terminal `restored` tone. The
 * figure stops at it rather than counting it as passed.
 */
test('a restored stage is not passed', () => {
  const wf = workflow([{ name: 'dev' }, { name: 'prod' }]);
  const sequence = sequenceOf(wf, { dev: ['dev-1'], prod: ['prod-1'] });
  const states = statesOf(sequence, {
    resolved: ['dev-1', 'prod-1'],
    restored: ['prod-1'],
  });

  expect(states[2].verdict).toBe('restored');
  expect(pathOf(states, 'aborted')).toEqual({ done: 2, total: 4 });
});

test.describe('the final checklist does not move with the count', () => {
  test('an empty LAST stage still carries the final checklist', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: ['dev-1'], prod: [] });
    const states = statesOf(sequence, { resolved: ['dev-1'] });
    const input = completionInput(sequence, wf, ['dev-1']);

    // Every stage is passed: the empty prod has nothing to promote into.
    expect(pathOf(states)).toEqual({ done: 3, total: 4 });
    // The checklist is still built over the declared last stage, not over
    // `dev`.
    expect(finalStageGates(input)).not.toBeNull();
  });

  test('a real last stage the change has reached is counted', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: ['dev-1'], prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: ['dev-1', 'prod-1'] });

    expect(pathOf(states)).toEqual({ done: 3, total: 4 });
  });
});

/*
 * A stage that selects no Space has nothing to promote, so "Ready to promote"
 * and "0 of 0 spaces promoted" are both false about it, passed or not. The
 * label is what the rail caption and every segment tooltip print.
 */
test.describe('a stage that selects no Space says so', () => {
  const wf = workflow([{ name: 'dev' }, { name: 'staging' }, { name: 'prod' }]);
  const sequence = sequenceOf(wf, { dev: ['dev-1'], staging: [], prod: ['prod-1'] });

  for (const [when, resolved] of [
    ['before the rollout reaches it', [] as string[]],
    ['after the rollout has passed it', ['dev-1']],
  ] as const) {
    test(when, () => {
      const staging = statesOf(sequence, { resolved: [...resolved] }).find((s) => s.stageId === 'staging');
      expect(staging?.label).toBe('No Spaces in this stage');
      expect(staging?.progress).toBe('');
    });
  }

  test('a stage with Spaces keeps its own words', () => {
    const dev = statesOf(sequence, { resolved: [] }).find((s) => s.stageId === 'dev');
    expect(dev?.label).toBe('Ready to promote');
    expect(dev?.progress).toBe('0 of 1 space promoted');
  });
});
