// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// getApiErrorMessage reads the bodies the server answers errors with: the standard one, whose
// `message` is the error as one string beside `Error`, the error as data, and an operation's own
// response type, which carries only `Error`.
import { expect, test } from '@playwright/test';

import { getApiErrorMessage, getApiErrorType } from '../src/utility/error-functions';

test('the standard error body is read by its message', () => {
  const error = {
    status: 404,
    data: {
      message: 'unit not found\n',
      Error: { Message: 'unit not found', Type: 'NotFound', Status: 404 },
    },
  };
  expect(getApiErrorMessage(error)).toBe('unit not found\n');
});

test("an operation's refusal is read by its Error", () => {
  const error = {
    status: 409,
    data: {
      Stages: [],
      Error: { Message: 'the gates of stage prod do not hold', Type: 'Conflict', Status: 409 },
    },
  };
  expect(getApiErrorMessage(error)).toBe('the gates of stage prod do not hold');
});

test('a body with neither falls back to the default', () => {
  expect(getApiErrorMessage({ status: 500, data: {} }, 'fallback')).toBe('fallback');
});

test("an error's Type tells apart errors that share a status", () => {
  const taken = {
    status: 409,
    data: {
      message: 'A ChangeWorkflow with the same value already exists.',
      Error: { Type: 'AlreadyExists', Status: 409 },
    },
  };
  const stale = {
    status: 409,
    data: { message: 'conflict', Error: { Type: 'Conflict', Status: 409 } },
  };
  expect(getApiErrorType(taken)).toBe('AlreadyExists');
  expect(getApiErrorType(stale)).toBe('Conflict');
  expect(getApiErrorType({ status: 500, data: 'Internal Server Error' })).toBeUndefined();
  expect(getApiErrorType(new Error('network'))).toBeUndefined();
});
