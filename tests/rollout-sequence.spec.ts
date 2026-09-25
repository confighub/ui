// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `buildRolloutSequence` (rolloutStages.ts) exercised directly, same pattern
// as `rollout-stage-matrix.spec.ts`: pure derivation, no page, no browser.

import { test, expect } from './fixtures/test';

import { buildRolloutSequence, SOURCE_STAGE_ID, promotableStages } from '../src/pages/x/apps/rollout/rolloutStages';
import {
  stageSelectsWholeComponent,
  stageWhereSpace,
} from '../src/pages/x/apps/rollout/changeOrderWorkflow';
import { stageResolutionKey } from '../src/pages/x/apps/rollout/useWorkflowStageSpaces';
import type { ChangeWorkflowSpec, ComponentRead } from '@confighub/rtk-query';

const MYAPP: ComponentRead = { ComponentID: '11111111-1111-1111-1111-111111111111', Slug: 'myapp' };

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
    undefined,
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
 * on it. `stageSpaces` in public/cmd/cub/variant_promote.go filters a stage's
 * resolved Spaces by scope and by nothing else, so a stage whose selector
 * covers the base covers it — and the gates into the stage after it quantify
 * over the base too. Withholding it here decided a different question from
 * `cub` (ui/tests/rollout-gate-cli-differential.spec.ts, cases 2b and 15).
 */
test('a real first stage that selects the source Space keeps it, and the source lane still draws', () => {
  const wf = workflow([{ name: 'dev', whereSpace: "Labels.Stage='dev'" }]);
  const seq = buildRolloutSequence(wf, { dev: [space('base-1'), space('dev-1')] }, 'base-1', undefined);
  expect(seq.stages[0].isSource).toBe(true);
  expect(seq.stages[0].spaceIds).toEqual(['base-1']);
  expect(seq.stages[1].spaceIds).toEqual(['base-1', 'dev-1']);
});

test('a stage whose whereSpace selects nothing is reported as a problem, not silently empty', () => {
  const wf = workflow([{ name: 'dev', whereSpace: "Labels.Stage='dev'" }]);
  const seq = buildRolloutSequence(wf, { dev: [] }, 'base-1', undefined);
  expect(seq.problems).toContainEqual({ kind: 'stage-selects-nothing', stageName: 'dev' });
});

test('a Space the stage selects but the ChangeOrder is not headed for is not in the stage', () => {
  const wf = workflow([{ name: 'dev', whereSpace: "Labels.Stage='dev'" }]);
  const seq = buildRolloutSequence(wf, { dev: [space('dev-1'), space('dev-2')] }, 'base-1', ['base-1', 'dev-1']);
  expect(seq.stages[1].spaceIds).toEqual(['dev-1']);
});

test('a stage no in-scope Space is in selects nothing, rather than everything its clause matched', () => {
  const wf = workflow([{ name: 'dev', whereSpace: "Labels.Stage='dev'" }]);
  const seq = buildRolloutSequence(wf, { dev: [space('dev-1')] }, 'base-1', ['base-1', 'staging-1']);
  expect(seq.stages[1].spaceIds).toEqual([]);
  expect(seq.problems).toContainEqual({ kind: 'stage-selects-nothing', stageName: 'dev' });
});

test('an empty in-scope list is no restriction, not an empty rollout', () => {
  const wf = workflow([{ name: 'dev', whereSpace: "Labels.Stage='dev'" }]);
  const seq = buildRolloutSequence(wf, { dev: [space('dev-1')] }, 'base-1', []);
  expect(seq.stages[1].spaceIds).toEqual(['dev-1']);
});

test('stages carry their declared prerequisites through', () => {
  const wf = workflow([
    { name: 'dev', whereSpace: "x" },
    { name: 'prod', whereSpace: "y", prerequisites: ['Released', 'Healthy'] },
  ]);
  const seq = buildRolloutSequence(wf, { dev: [space('d')], prod: [space('p')] }, 'base-1', undefined);
  const prod = seq.stages.find((s) => s.id === 'prod');
  expect(prod?.prerequisites).toEqual(['Released', 'Healthy']);
});

// ── An empty selector is a declaration, not an omission ─────────────────────

/*
 * `WhereSpace` is optional now, and empty means "every Space of this rollout's
 * component". The old parser REFUSED an empty selector outright, so a port that
 * carried its reading forward would match nothing at all — with no error, no
 * problem entry and a stage that simply draws empty. That is the quietest way
 * this migration could have gone wrong, so it is pinned from both ends: the
 * predicate that recognises it, and the clause built from it.
 */
test('a stage with no selector says so, whatever shape the emptiness takes', () => {
  expect(stageSelectsWholeComponent({ Name: 'everywhere' })).toBe(true);
  expect(stageSelectsWholeComponent({ Name: 'everywhere', WhereSpace: '' })).toBe(true);
  // Whitespace is not a predicate, and a clause built from it is a syntax error.
  expect(stageSelectsWholeComponent({ Name: 'everywhere', WhereSpace: '   ' })).toBe(true);
  expect(stageSelectsWholeComponent({ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" })).toBe(false);
});

test('an empty selector resolves to the component alone, not to a broken clause', () => {
  expect(stageWhereSpace({ Name: 'everywhere' }, MYAPP)).toBe(`ComponentID = '${MYAPP.ComponentID}'`);
  expect(stageWhereSpace({ Name: 'everywhere', WhereSpace: '' }, MYAPP)).toBe(
    `ComponentID = '${MYAPP.ComponentID}'`,
  );
  // The conjoined form is unchanged where the stage does name a selector.
  expect(stageWhereSpace({ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" }, MYAPP)).toBe(
    `Labels.Stage = 'dev' AND ComponentID = '${MYAPP.ComponentID}'`,
  );
});

test('a stage with no selector takes every Space the component resolved', () => {
  const wf = workflow([{ name: 'everywhere' }]);
  const seq = buildRolloutSequence(
    wf,
    { everywhere: [space('base-1'), space('dev-1'), space('prod-1')] },
    'base-1',
    undefined,
  );
  // Every Space of the component, base included — the selector said so.
  expect(seq.stages[1].spaceIds).toEqual(['base-1', 'dev-1', 'prod-1']);
  expect(seq.problems).toEqual([]);
});

// ── The component predicate is reported, never refused ──────────────────────

/*
 * The server refuses such a stage when the workflow is written, so anything
 * reaching the UI is a workflow the server already accepted. Declining to draw
 * it would help nobody; saying what is wrong with it helps.
 */
test('a stage naming the component is reported and the sequence still draws', () => {
  const wf = workflow([
    { name: 'dev', whereSpace: "Labels.Component = 'other' AND Labels.Stage = 'dev'" },
  ]);
  const seq = buildRolloutSequence(wf, { dev: [space('dev-1')] }, 'base-1', undefined);
  expect(seq.problems).toContainEqual({ kind: 'stage-names-component', stageName: 'dev' });
  // Drawn, not withheld.
  expect(seq.stages[1].spaceIds).toEqual(['dev-1']);
  expect(promotableStages(seq)).toHaveLength(1);
});

test('the component predicate is matched whatever operator it is used with', () => {
  const wf = workflow([{ name: 'dev', whereSpace: 'Labels.Component != \'other\'' }]);
  expect(buildRolloutSequence(wf, { dev: [space('dev-1')] }, 'base-1', undefined).problems)
    .toContainEqual({ kind: 'stage-names-component', stageName: 'dev' });
});

test('a label merely starting with Component is not the component predicate', () => {
  const wf = workflow([{ name: 'dev', whereSpace: "Labels.ComponentGroup = 'checkout'" }]);
  expect(buildRolloutSequence(wf, { dev: [space('dev-1')] }, 'base-1', undefined).problems).toEqual([]);
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
  expect(stageResolutionKey(MYAPP, [], ['s1', 's2'])).toBe('');
  expect(stageResolutionKey(MYAPP, undefined, ['s1', 's2'])).toBe('');
  // No component is the same "nothing to resolve": a stage cannot be resolved
  // without one.
  expect(stageResolutionKey(undefined, [{ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" }], ['s1'])).toBe('');
});

test('real work produces a key that encodes the stages and the Spaces alike', () => {
  const stages = [{ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" }];
  const key = stageResolutionKey(MYAPP, stages, ['s2', 's1']);
  expect(key).not.toBe('');
  expect(key).toContain(`${MYAPP.ComponentID}::dev::Labels.Stage = 'dev'`);
  // Sorted, so the key depends on the SET of Spaces and not on arrival order —
  // otherwise a re-ordered list re-resolves work already done.
  expect(stageResolutionKey(MYAPP, stages, ['s1', 's2'])).toBe(key);
  // And the in-memory Spaces are part of it: a stage answered from them
  // resolves differently once that list arrives.
  expect(stageResolutionKey(MYAPP, stages, ['s3'])).not.toBe(key);
});
