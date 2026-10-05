// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The rollout detail page's link to the ChangeWorkflow a rollout was created
// under. Exercised directly: no page, no browser.
//
// The link opens the workflow builder, where the workflow is viewed and
// edited. A rollout keeps the frozen copy it was created with, so an edit
// there changes later rollouts, not this one.

import { expect, test } from '@playwright/test';

import {
  changeWorkflowHref,
  changeWorkflowLabel,
  type ChangeWorkflowNames,
} from '../src/pages/rollouts/useChangeWorkflowNames';

const WORKFLOW_ID = '0f0e0d0c-0b0a-0908-0706-050403020100';

function names(overrides: Partial<ChangeWorkflowNames> = {}): ChangeWorkflowNames {
  return { byId: new Map([[WORKFLOW_ID, 'staged-rollout']]), isLoading: false, failed: false, ...overrides };
}

test('a named workflow links to its page in the workflow builder', () => {
  expect(changeWorkflowHref(WORKFLOW_ID, names())).toBe(`/x/workflow-builder/${WORKFLOW_ID}`);
  expect(changeWorkflowLabel(WORKFLOW_ID, names())).toBe('staged-rollout');
});

test('a rollout nothing governs has no workflow to link to', () => {
  expect(changeWorkflowHref(undefined, names())).toBeNull();
});

test('a deleted workflow is named as deleted and not linked', () => {
  const empty = names({ byId: new Map() });
  expect(changeWorkflowHref(WORKFLOW_ID, empty)).toBeNull();
  expect(changeWorkflowLabel(WORKFLOW_ID, empty)).toBe('Workflow deleted');
});

test('a workflow whose name could not be read is still linked', () => {
  // The lookup failed, so nothing says the workflow is gone; the builder says
  // whether it is there.
  const failed = names({ byId: new Map(), failed: true });
  expect(changeWorkflowHref(WORKFLOW_ID, failed)).toBe(`/x/workflow-builder/${WORKFLOW_ID}`);
});

test('the id is encoded into the path', () => {
  const odd = 'a/b';
  expect(changeWorkflowHref(odd, names({ byId: new Map([[odd, 'odd']]) }))).toBe('/x/workflow-builder/a%2Fb');
});
