// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A workflow with no Stages governs ChangeSets: Complete (its Final) is what closing one is
// gated on. The builder accepts one, and refuses only what closing a ChangeSet cannot wait
// on -- a Release, which a ChangeOrder publishes after the ChangeSet has closed.

import { expect, test } from '@playwright/test';

import { definitionFaults, governsChangeSets, messageText } from '../src/pages/x/workflow-builder/model';
import type { UnresolvedWorkflow } from '../src/pages/x/workflow-builder/model';
import type { Stage } from '../src/pages/x/workflow-builder/types';

function stage(name: string): Stage {
  return { id: `st-${name}`, name, where: '', prereqs: [], releasePrereqs: [] };
}

function workflow(stages: Stage[], finalPrereqs: string[]): UnresolvedWorkflow {
  return {
    key: 'wf-1',
    displayName: 'review',
    slug: 'review',
    space: 'platform',
    labels: [],
    updated: '',
    age: '',
    stages,
    final: { prereqs: finalPrereqs },
    custom: [],
    attestations: [],
  };
}

const problems = (wf: UnresolvedWorkflow) => definitionFaults(wf).filter((p) => p.sev === 'problem');

test('a workflow with no Stages governs ChangeSets and is not a fault', () => {
  const wf = workflow([], ['Validated']);
  expect(governsChangeSets(wf)).toBe(true);
  expect(problems(wf)).toEqual([]);
  expect(problems(workflow([], []))).toEqual([]);
});

test('Complete naming Released or Healthy with no Stages is refused, at Complete', () => {
  for (const name of ['Released', 'Healthy']) {
    const faults = problems(workflow([], ['Validated', name]));
    expect(faults).toHaveLength(1);
    expect(messageText(faults[0].msg)).toContain(`Complete names ${name}, which closing a ChangeSet cannot wait on`);
    expect(faults[0].go).toEqual({ kind: 'final' });
  }
});

test('a rollout may name Released and Healthy in Complete', () => {
  const wf = workflow([stage('dev'), stage('prod')], ['Released', 'Healthy']);
  expect(governsChangeSets(wf)).toBe(false);
  expect(problems(wf)).toEqual([]);
});
