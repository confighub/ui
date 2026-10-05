// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * What a prerequisite named on a stage turns out to be.
 *
 * A CLASSIFIER, NOT AN ALLOWLIST, and the difference is the subject here. An
 * allowlist answers "may this name be used" and would refuse every custom
 * prerequisite; a classifier answers "what kind of check is this", and a custom
 * one is a real declaration that this build simply cannot evaluate. Getting
 * that wrong in either direction is a wrong answer wearing a plausible one — a
 * declared check rendered as a failure, or an unknown name rendered as nothing
 * at all.
 *
 * THE SPELLING IS HALF THE TEST. The built-ins are capitalised, because that is
 * how the server writes them (`internal/models/changeworkflow.go`). A build
 * matching the old lowercase names matches nothing a server now sends, and says
 * nothing about it: the gate never appears and the stage reads as declaring
 * less than it does. That is why the lowercase case is asserted explicitly
 * rather than left to follow from the capitalised one.
 */
import { test, expect } from './fixtures/test';

import type { ChangeOrder, ChangeWorkflowPrerequisite } from '@confighub/rtk-query';
import {
  BUILT_IN_PREREQUISITES,
  changeOrderWorkflow,
  classifyPrerequisite,
  stageWhereSpace,
} from '../src/pages/x/apps/rollout/changeOrderWorkflow';

const DECLARED: ChangeWorkflowPrerequisite[] = [
  {
    Name: 'QA sign-off',
    Description: 'A tester has recorded a pass against this Space.',
    Expression: 'cel:Space.Annotations["confighub.com/qa-sign-off"] == "yes"',
  },
];

test('the two built-in names are the ones the server writes', () => {
  expect(BUILT_IN_PREREQUISITES.released).toBe('Released');
  expect(BUILT_IN_PREREQUISITES.healthy).toBe('Healthy');
});

test('Released and Healthy classify as built-ins', () => {
  expect(classifyPrerequisite('Released', DECLARED)).toEqual({ kind: 'built-in', name: 'Released' });
  expect(classifyPrerequisite('Healthy', DECLARED)).toEqual({ kind: 'built-in', name: 'Healthy' });
});

test('a lowercase built-in name is not the built-in', () => {
  // Guards a half-done migration: the old spelling must not quietly keep
  // working, because a build that accepted both would hide which one it had.
  expect(classifyPrerequisite('released', DECLARED).kind).not.toBe('built-in');
  expect(classifyPrerequisite('healthy', DECLARED).kind).not.toBe('built-in');
});

test('a declared custom prerequisite classifies as custom and keeps its description', () => {
  expect(classifyPrerequisite('QA sign-off', DECLARED)).toEqual({
    kind: 'custom',
    name: 'QA sign-off',
    description: 'A tester has recorded a pass against this Space.',
  });
});

test('a custom prerequisite with no description is still custom', () => {
  const terse: ChangeWorkflowPrerequisite[] = [{ Name: 'Signed', Expression: 'cel:true' }];
  expect(classifyPrerequisite('Signed', terse)).toEqual({
    kind: 'custom',
    name: 'Signed',
    description: undefined,
  });
});

test('a name neither built in nor declared is unrecognised', () => {
  expect(classifyPrerequisite('Approved', DECLARED)).toEqual({
    kind: 'unrecognised',
    name: 'Approved',
  });
  // A workflow that declared nothing is the ordinary case, not an error.
  expect(classifyPrerequisite('QA sign-off', undefined).kind).toBe('unrecognised');
});

test('a stage selector is sent as written, with no component appended', () => {
  // The rollout's scope is the ChangeOrder's InScopeSpaceIDs, applied to what
  // the selector lists; a workflow may govern several components' rollouts.
  expect(stageWhereSpace({ Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" })).toBe("Labels.Stage = 'dev'");
});

// ── A frozen workflow that names no stage is not a governed one ─────────────

/*
 * ⚠️ A TYPE LIE, PINNED AT ITS SOURCE.
 *
 * `internal/models/changeworkflow.go` tags `Stages` `json:",omitempty"`, so a
 * ChangeWorkflow holding an empty slice serialises with the field ABSENT. The
 * generated TS declares `Stages: ChangeWorkflowStage[]` as required, so every
 * reader believes it is there and dereferences it unguarded — including
 * `buildConsoleRow`, which runs per row inside a `useMemo` during render. One
 * such ChangeOrder on the fleet console therefore throws mid-render and takes
 * the whole console down for every unrelated rollout on it.
 *
 * A frozen copy naming no stage describes no sequence, so it is classified as
 * one that has not resolved rather than as a governed workflow with nothing in
 * it. Callers already handle both of those states.
 */
test('a frozen workflow arriving with its stages omitted is not governed', () => {
  const order = {
    ChangeWorkflowID: 'cw-1',
    // Exactly what the server sends for an empty slice: the key is not there.
    ChangeWorkflow: { Name: 'ship-it' },
  } as unknown as ChangeOrder;
  const governing = changeOrderWorkflow(order);
  expect(governing.state).toBe('unresolved');
});

test('a frozen workflow with an empty stage list is not governed either', () => {
  const order = {
    ChangeWorkflowID: 'cw-1',
    ChangeWorkflow: { Name: 'ship-it', Stages: [] },
  } as unknown as ChangeOrder;
  expect(changeOrderWorkflow(order).state).toBe('unresolved');
});

/*
 * With no workflow id to resolve BY, there is nothing to wait for: the order is
 * simply ungoverned. Reporting `unresolved` there would render a permanent
 * "still loading" for a rollout that is not governed at all.
 */
test('stages omitted with no workflow id to resolve by is ungoverned', () => {
  const order = { ChangeWorkflow: { Name: 'ship-it' } } as unknown as ChangeOrder;
  expect(changeOrderWorkflow(order).state).toBe('ungoverned');
});

/* The ordinary case still governs, and still carries the stages it named. */
test('a frozen workflow naming a stage governs', () => {
  const order = {
    ChangeWorkflowID: 'cw-1',
    ChangeWorkflow: { Name: 'ship-it', Stages: [{ Name: 'dev', WhereSpace: '', Prerequisites: [] }] },
  } as unknown as ChangeOrder;
  const governing = changeOrderWorkflow(order);
  expect(governing.state).toBe('governed');
  if (governing.state !== 'governed') return;
  expect(governing.workflow.Stages.map((s) => s.Name)).toEqual(['dev']);
});
