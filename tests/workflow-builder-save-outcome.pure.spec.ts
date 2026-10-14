// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A failed save is a refusal of the workflow, a version another save moved past, or a failure
// that says nothing about the workflow. A 409 is the second only when its Error is a Conflict: a
// name another workflow has is a refusal, which the author fixes by renaming.
import { expect, test } from '@playwright/test';

import { classifySaveError } from '../src/pages/x/workflow-builder/api/saveOutcome';

const answer = (status: number, type: string, message: string) => ({
  status,
  data: { message, Error: { Message: message, Type: type, Status: status } },
});

test('a version another save moved past is a conflict', () => {
  expect(classifySaveError(answer(409, 'Conflict', 'conflict')).kind).toBe('conflict');
});

test('a name another workflow has is a refusal', () => {
  const outcome = classifySaveError(
    answer(409, 'AlreadyExists', 'A ChangeWorkflow with the same value already exists.'),
  );
  expect(outcome.kind).toBe('rejected');
  expect(outcome.kind === 'rejected' && outcome.message).toContain('already exists');
});

test('a 400 is a refusal, and a 500 judges nothing', () => {
  expect(classifySaveError(answer(400, 'UserInput', 'bad stage')).kind).toBe('rejected');
  expect(classifySaveError(answer(500, 'Unexpected', 'boom')).kind).toBe('failed');
});
