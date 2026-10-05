// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `buildRolloutSequence` (rolloutStages.ts) exercised directly, same pattern
// as `rollout-stage-matrix.spec.ts`: pure derivation, no page, no browser.

import { test, expect } from './fixtures/test';

import { buildRolloutSequence, SOURCE_STAGE_ID, promotableStages } from '../src/pages/x/apps/rollout/rolloutStages';
import {
  changeOrderStageMembers,
  stageSelectsWholeScope,
  stageWhereSpace,
} from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import { stageResolutionKey } from '../src/pages/x/apps/rollout/useWorkflowStageSpaces';
import type { ChangeWorkflowSpec } from '@confighub/rtk-query';

/** The frozen copy a ChangeOrder carries: the workflow's spec, and no envelope. */
function workflow(stages: { name: string; whereSpace?: string; prerequisites?: string[] }[]): ChangeWorkflowSpec {
  return {
    Stages: stages.map((s) => ({
      Name: s.name,
      WhereSpace: s.whereSpace,
      Prerequisites: s.prerequisites,
    })),
    Final: { Prerequisites: [] },
  };
}

// SpaceID sits under `.Space`, not at the top level -- matches the real
// generated `ExtendedSpaceRead` shape `useWorkflowStageSpaces` populates this
// with (confighubapi.gen.ts's `ExtendedSpaceRead.Space?: SpaceRead`), so this
// mock exercises the same field path `buildRolloutSequence` reads in
// production.
function space(id: string) {
  return { Space: { SpaceID: id } } as never;
}

test('base not matched by any real stage gets a synthetic source lane', () => {
  const wf = workflow([
    { name: 'dev', whereSpace: "Labels.Stage='dev'" },
    { name: 'staging', whereSpace: "Labels.Stage='staging'" },
  ]);
  const seq = buildRolloutSequence(
    wf,
    { dev: [space('dev-1')], staging: [space('staging-1')] },
    'base-1',
  );
  expect(seq.stages[0].id).toBe(SOURCE_STAGE_ID);
  expect(seq.stages[0].isSource).toBe(true);
  expect(seq.stages[0].spaceIds).toEqual(['base-1']);
  expect(seq.stages[0].previousStageId).toBeNull();
  expect(seq.stages[1].id).toBe('dev');
  expect(seq.stages[1].previousStageId).toBe(SOURCE_STAGE_ID);
  expect(seq.stages[2].previousStageId).toBe('dev');
  expect(promotableStages(seq)).toHaveLength(2);
});

/*
 * The source lane is a SECOND VIEW of the ChangeOrder's own Space, not a claim
 * on it. The server's promotion filters a stage's resolved Spaces by scope
 * and by nothing else, so a stage whose selector
 * covers the base covers it — and the gates into the stage after it quantify
 * over the base too. Withholding it here decided a different question from
 * `cub` (ui/tests/rollout-gate-cli-differential.spec.ts, cases 2b and 15).
 */
test('a real first stage that selects the source Space keeps it, and the source lane still draws', () => {
  const wf = workflow([{ name: 'dev', whereSpace: "Labels.Stage='dev'" }]);
  const seq = buildRolloutSequence(wf, { dev: [space('base-1'), space('dev-1')] }, 'base-1');
  expect(seq.stages[0].isSource).toBe(true);
  expect(seq.stages[0].spaceIds).toEqual(['base-1']);
  expect(seq.stages[1].spaceIds).toEqual(['base-1', 'dev-1']);
});

test('a stage whose whereSpace selects nothing is reported as a problem, not silently empty', () => {
  const wf = workflow([{ name: 'dev', whereSpace: "Labels.Stage='dev'" }]);
  const seq = buildRolloutSequence(wf, { dev: [] }, 'base-1');
  expect(seq.problems).toContainEqual({ kind: 'stage-selects-nothing', stageName: 'dev' });
});

// ── Membership: the stage's selector, within the ChangeOrder's scope ────────

/*
 * A stage's members are what its selector matches that the ChangeOrder is headed
 * for (`InScopeSpaceIDs`) -- the rule the server's promote applies. No component
 * term is involved: the rollout's scope is the ChangeOrder's.
 */
const ids = (members: { Space?: { SpaceID?: string } }[]) => members.map((m) => m.Space?.SpaceID);

test('a Space the stage selects but the ChangeOrder is not headed for is not in the stage', () => {
  const stage = { Name: 'dev', WhereSpace: "Labels.Stage='dev'" };
  expect(ids(changeOrderStageMembers(stage, [space('dev-1'), space('dev-2')], ['base-1', 'dev-1']))).toEqual(['dev-1']);
});

test('a stage no in-scope Space is in selects nothing, rather than everything its clause matched', () => {
  const stage = { Name: 'dev', WhereSpace: "Labels.Stage='dev'" };
  expect(changeOrderStageMembers(stage, [space('dev-1')], ['base-1', 'staging-1'])).toEqual([]);
});

test('an empty or absent in-scope list selects no Space', () => {
  const stage = { Name: 'dev', WhereSpace: "Labels.Stage='dev'" };
  expect(changeOrderStageMembers(stage, [space('dev-1')], [])).toEqual([]);
  expect(changeOrderStageMembers(stage, [space('dev-1')], undefined)).toEqual([]);
  expect(changeOrderStageMembers({ Name: 'everywhere' }, undefined, [])).toEqual([]);
});

test('a stage with no selector takes every in-scope Space, whatever was listed', () => {
  expect(ids(changeOrderStageMembers({ Name: 'everywhere' }, undefined, ['base-1', 'dev-1', 'prod-1']))).toEqual([
    'base-1',
    'dev-1',
    'prod-1',
  ]);
});

test('stages carry their declared prerequisites through', () => {
  const wf = workflow([
    { name: 'dev', whereSpace: "x" },
    { name: 'prod', whereSpace: "y", prerequisites: ['Released', 'Healthy'] },
  ]);
  const seq = buildRolloutSequence(wf, { dev: [space('d')], prod: [space('p')] }, 'base-1');
  const prod = seq.stages.find((s) => s.id === 'prod');
  expect(prod?.prerequisites).toEqual(['Released', 'Healthy']);
});

// ── An empty selector is a declaration, not an omission ─────────────────────

/*
 * `WhereSpace` is optional, and empty means "every Space this rollout is headed
 * for". Reading it as "match nothing" would draw the stage empty with no error
 * and no problem entry, so it is pinned from both ends: the predicate that
 * recognises it, and the clause built from it.
 */
test('a stage with no selector says so, whatever shape the emptiness takes', () => {
  expect(stageSelectsWholeScope({ Name: 'everywhere' })).toBe(true);
  expect(stageSelectsWholeScope({ Name: 'everywhere', WhereSpace: '' })).toBe(true);
  // Whitespace is not a predicate, and a clause built from it is a syntax error.
  expect(stageSelectsWholeScope({ Name: 'everywhere', WhereSpace: '   ' })).toBe(true);
  expect(stageSelectsWholeScope({ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" })).toBe(false);
});

test('the clause is the stage selector alone, with no component appended', () => {
  expect(stageWhereSpace({ Name: 'everywhere' })).toBe('');
  expect(stageWhereSpace({ Name: 'everywhere', WhereSpace: '   ' })).toBe('');
  expect(stageWhereSpace({ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" })).toBe("Labels.Stage = 'dev'");
});

test('a stage with no selector takes every Space it was given', () => {
  const wf = workflow([{ name: 'everywhere' }]);
  const seq = buildRolloutSequence(
    wf,
    { everywhere: [space('base-1'), space('dev-1'), space('prod-1')] },
    'base-1',
  );
  // Every in-scope Space, base included — the selector said so.
  expect(seq.stages[1].spaceIds).toEqual(['base-1', 'dev-1', 'prod-1']);
  expect(seq.problems).toEqual([]);
});

// ── A stage may name a component ────────────────────────────────────────────

/*
 * A ChangeWorkflow can govern several components' rollouts, and nothing appends
 * a component to its stages, so a stage naming one is an ordinary selector.
 */
test('a stage naming the component is no problem', () => {
  const wf = workflow([
    { name: 'dev', whereSpace: "Labels.Component = 'other' AND Labels.Stage = 'dev'" },
  ]);
  const seq = buildRolloutSequence(wf, { dev: [space('dev-1')] }, 'base-1');
  expect(seq.problems).toEqual([]);
  expect(seq.stages[1].spaceIds).toEqual(['dev-1']);
  expect(stageWhereSpace(wf.Stages[0])).toBe("Labels.Component = 'other' AND Labels.Stage = 'dev'");
});

// ── The key that decides whether stage resolution is still running ──────────

/*
 * ⚠️ THE CONTRACT A STRANDED SPINNER BROKE.
 *
 * `useWorkflowStageSpaces` reports itself loading by comparing the key it is
 * asked for against the key it last resolved, and it records the
 * nothing-to-resolve case under `''`. So the key for that case must BE `''`.
 * When it was built from the component's Space ids instead, the two could
 * never match again: a rollout that nothing governs, and a workflow declaring
 * no stages, waited forever on a resolution that had already happened. Every
 * assertion about values passed; only the screen showed it.
 *
 * The first case below is the one that regressed, and it fails against a key
 * that folds the Space ids in unconditionally.
 */
test('a hook with no stages to resolve asks for the empty key', () => {
  expect(stageResolutionKey([], ['s1', 's2'])).toBe('');
  expect(stageResolutionKey(undefined, ['s1', 's2'])).toBe('');
  // No Space in scope is the same "nothing to resolve": every stage is empty.
  expect(stageResolutionKey([{ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" }], [])).toBe('');
  expect(stageResolutionKey([{ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" }], undefined)).toBe('');
});

test('real work produces a key that encodes the stages and the in-scope Spaces alike', () => {
  const stages = [{ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" }];
  const key = stageResolutionKey(stages, ['s2', 's1']);
  expect(key).not.toBe('');
  expect(key).toContain("dev::Labels.Stage = 'dev'");
  // Sorted, so the key depends on the SET of Spaces and not on arrival order —
  // otherwise a re-ordered list re-resolves work already done.
  expect(stageResolutionKey(stages, ['s1', 's2'])).toBe(key);
  // And the in-scope Spaces are part of it: the same stages resolve to
  // different members for a ChangeOrder headed elsewhere.
  expect(stageResolutionKey(stages, ['s3'])).not.toBe(key);
});
