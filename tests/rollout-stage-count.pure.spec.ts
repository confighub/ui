// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `countPromotedStages` / `countReachableStages` (rolloutState.ts) — the two
// halves of the "N of M stages" figure, exercised directly: no page, no
// browser, same pure-derivation pattern as `rollout-complete-step.pure.spec.ts`.
//
// WHY THE DENOMINATOR NEEDS A TEST OF ITS OWN. The figure used to divide by
// `promotableStages(sequence).length` — every stage the ChangeWorkflow
// DECLARES. A stage whose `whereSpace` selected no Space has nothing in it to
// promote, so the numerator can never count it; divided by the declared count, a rollout that has
// reached everywhere it can reads "1 of 2" for ever, under a caption saying
// every stage has taken the change. The failure is silent — both numbers are
// legal, and only their ratio lies — so the cases are named here one by one.
//
// AND WHY THE FINAL CHECKLIST MUST NOT MOVE WITH IT. `finalStageGates` takes the
// LAST stage from `promotableStages`, empty or not. Narrowing that predicate to
// fix the count would have built the `Final` checklist over the stage before it.
// The last two tests hold that line.
//
// The next stage is read off `ChangeOrder.Stage`, the last stage the server has
// recorded the change as reaching.

import { expect, test } from '@playwright/test';

import { buildRolloutSequence, promotableStages } from '../src/pages/x/apps/rollout/rolloutStages';
import {
  countPromotedStages,
  countReachableStages,
  deriveProgress,
  deriveStageState,
  finalStageGates,
  nextStageIndexFromChangeOrderStage,
} from '../src/pages/x/apps/rollout/rolloutState';
import type { RolloutGateSpaceInput } from '../src/pages/x/apps/rollout/rolloutGates';
import type { RolloutSequence, RolloutStageState } from '../src/pages/x/apps/rollout/rolloutTypes';
import type { ChangeWorkflowSpec } from '@confighub/rtk-query';

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
  return buildRolloutSequence(wf, resolved, BASE, undefined);
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
    resolvedSpaceIds: [BASE, ...reported.resolved],
    releasedSpaceIds: reported.released,
    restoredSpaceIds: reported.restored,
    releasedRestoredSpaceIds: undefined,
  });
  return sequence.stages.map((stage) =>
    deriveStageState({ stage, gates: [], progress, inFlightSpaceIds: new Set<string>() }),
  );
}

/** The stage after the one `ChangeOrder.Stage` records, or `null`. */
function nextStageId(sequence: RolloutSequence, stage: string | undefined): string | null {
  const index = nextStageIndexFromChangeOrderStage(sequence, stage);
  return index === -1 ? null : sequence.stages[index].id;
}

function completionInput(sequence: RolloutSequence, wf: ChangeWorkflowSpec, reported: string[]) {
  return {
    workflow: wf,
    sequence,
    progress: deriveProgress({
      changeOrderSpaceId: BASE,
      resolvedSpaceIds: [BASE, ...reported],
      releasedSpaceIds: reported,
      restoredSpaceIds: undefined,
      releasedRestoredSpaceIds: undefined,
    }),
    gateSpaceInput: (spaceId: string): RolloutGateSpaceInput => ({
      spaceId,
      loaded: true,
      variantName: spaceId,
      liveStatus: null,
      releaseTargetId: 'target-1',
    }),
    componentName: 'app',
    changeOrderSlug: 'co-1',
  };
}

test.describe('a stage whose selector matched no Space is not in the total', () => {
  test('a mixed workflow can reach its own total', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'prod' }]);
    // `dev` is declared and labelled on nothing; `prod` holds the only Space.
    const sequence = sequenceOf(wf, { dev: [], prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: ['prod-1'] });

    // The stage IS in the sequence — an unmatched selector is a problem note,
    // not a missing entry — which is why the declared count cannot be the total.
    expect(promotableStages(sequence)).toHaveLength(2);
    expect(sequence.problems).toContainEqual({ kind: 'stage-selects-nothing', stageName: 'dev' });

    expect(countPromotedStages(states)).toBe(1);
    expect(countReachableStages(states)).toBe(1);
    // And the figure agrees with the caption beside it: nothing is next,
    // because the change has reached the last stage.
    expect(nextStageId(sequence, 'prod')).toBeNull();
  });

  test('a workflow where nothing is labelled counts zero, not three', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'staging' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: [], staging: [], prod: [] });
    const states = statesOf(sequence, { resolved: [] });

    expect(promotableStages(sequence)).toHaveLength(3);
    // Zero is what the detail page tests for to print "nowhere to promote to",
    // the same answer `deriveConsoleState` gives this rollout (`no-stages`).
    // Counted as three, it read "0 of 3" beside "Every stage has taken the
    // change." — a rollout that has taken nothing.
    expect(countReachableStages(states)).toBe(0);
    expect(countPromotedStages(states)).toBe(0);
  });

  test('a real stage still ahead stays in the total', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'staging' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: [], staging: ['staging-1'], prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: ['staging-1'] });

    expect(countPromotedStages(states)).toBe(1);
    expect(countReachableStages(states)).toBe(2);
    expect(nextStageId(sequence, 'staging')).toBe('prod');
  });

  test('the source row is in neither half', () => {
    const wf = workflow([{ name: 'prod' }]);
    const sequence = sequenceOf(wf, { prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: [] });

    expect(states[0].verdict).toBe('source');
    expect(countReachableStages(states)).toBe(1);
    expect(countPromotedStages(states)).toBe(0);
  });
});

/*
 * NOT A SHORTFALL TO BE FIXED. A restored stage is one the change has been
 * taken back out of, and every other surface says so: `deriveConsoleState`
 * reports such a rollout `aborted`, the Complete step gives it the terminal
 * `restored` tone. A total it
 * could still reach would be the one claim none of them make.
 */
test('a restored stage reads short, deliberately', () => {
  const wf = workflow([{ name: 'dev' }, { name: 'prod' }]);
  const sequence = sequenceOf(wf, { dev: ['dev-1'], prod: ['prod-1'] });
  const states = statesOf(sequence, {
    resolved: ['dev-1', 'prod-1'],
    restored: ['prod-1'],
  });

  expect(states[2].verdict).toBe('restored');
  expect(countPromotedStages(states)).toBe(1);
  expect(countReachableStages(states)).toBe(2);
});

test.describe('the final checklist does not move with the count', () => {
  test('an empty LAST stage still carries the final checklist', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: ['dev-1'], prod: [] });
    const states = statesOf(sequence, { resolved: ['dev-1'] });
    const input = completionInput(sequence, wf, ['dev-1']);

    // The count drops `prod`: there is nothing in it to promote into.
    expect(countReachableStages(states)).toBe(1);
    expect(countPromotedStages(states)).toBe(1);
    // The checklist does NOT: it is still built over the declared last stage,
    // not over `dev`.
    expect(finalStageGates(input)).not.toBeNull();
  });

  test('a real last stage the change has reached is counted', () => {
    const wf = workflow([{ name: 'dev' }, { name: 'prod' }]);
    const sequence = sequenceOf(wf, { dev: ['dev-1'], prod: ['prod-1'] });
    const states = statesOf(sequence, { resolved: ['dev-1', 'prod-1'] });

    expect(countReachableStages(states)).toBe(2);
    expect(countPromotedStages(states)).toBe(2);
  });
});
