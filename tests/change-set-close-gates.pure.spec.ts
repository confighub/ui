// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Reading the answer to a dry run of closing a governed ChangeSet: the gates of a close that
// would go ahead, the merged 422 of one that would be refused, and no answer.

import { expect, test } from '@playwright/test';

import { closeGateRows, closeGatesOfAnswer, closeGatesSummaryText } from '../src/pages/change-sets/changeSetCloseGates';

const prerequisites = ['Validated', 'reviewed'];

test('a close that would go ahead reads every gate per Space', () => {
  const gates = closeGatesOfAnswer(
    {
      status: 200,
      body: [
        {
          Unit: { Slug: 'web' },
          ChangeSetClose: {
            ChangeSetID: 'cs',
            Gates: [
              { Prerequisite: 'Validated', SpaceSlug: 'dev', Satisfied: true },
              { Prerequisite: 'reviewed', SpaceSlug: 'dev', Satisfied: true },
              { Prerequisite: 'Validated', SpaceSlug: 'prod', Satisfied: true },
              { Prerequisite: 'reviewed', SpaceSlug: 'prod', Satisfied: true },
            ],
          },
        },
      ],
    },
    prerequisites,
    2,
  );
  expect(gates.status).toBe('open');
  expect(closeGatesSummaryText(gates)).toBe('All 2 close gates hold.');
  if (gates.status !== 'open') return;
  expect(closeGateRows(gates.gates, gates.spaceCount).map((row) => [row.name, row.ok, row.reason])).toEqual([
    ['Validated', true, 'Holds in both Spaces.'],
    ['reviewed', true, 'Holds in both Spaces.'],
  ]);
});

test('a refused close reads the failing gates from the merged error', () => {
  const gates = closeGatesOfAnswer(
    {
      status: 422,
      // The shape the server answers with: its words, and the error under `Error`.
      body: {
        message: "cannot close change set 'fix': 1 of its ChangeWorkflow's gates do not hold\nMetadata: ...",
        Error: {
          Message: "cannot close change set 'fix': 1 of its ChangeWorkflow's gates do not hold",
          Type: 'Unprocessable',
          Status: 422,
          ErrorMetadata: {
            EntityID: 'unit',
            EntityType: 'Unit',
            Items: [
              { Item: 'prod/reviewed', Description: "unable to close change set 'fix', Space 'prod': requires reviewed" },
              { Item: 'dev/reviewed', Description: "unable to close change set 'fix', Space 'dev': requires reviewed" },
            ],
          },
        },
      },
    },
    prerequisites,
    3,
  );
  expect(gates.status).toBe('held');
  expect(closeGatesSummaryText(gates)).toBe('1 of 2 close gates hold.');
  if (gates.status !== 'held') return;
  expect(gates.failedCount).toBe(1);
  expect(gates.gates[1]?.failures.map((failure) => failure.spaceSlug)).toEqual(['dev', 'prod']);
  expect(closeGateRows(gates.gates, gates.spaceCount).map((row) => [row.name, row.ok, row.reason])).toEqual([
    ['Validated', true, 'Holds in all 3 Spaces.'],
    ['reviewed', false, 'Does not hold in 2 Spaces.'],
  ]);
});

test('a refusal of another kind, or no permission, is no verdict', () => {
  const other = closeGatesOfAnswer({ status: 400, body: { Message: 'cannot change the configuration' } }, prerequisites, 1);
  expect(other).toEqual({ status: 'unknown', message: 'cannot change the configuration', httpStatus: 400 });
  const forbidden = closeGatesOfAnswer({ status: 403, body: { Message: 'forbidden' } }, prerequisites, 1);
  expect(forbidden.status).toBe('unknown');
  expect(closeGatesSummaryText(forbidden)).toBe('The close gates could not be checked.');
  // A 422 that names no gate is not a gate refusal.
  expect(closeGatesOfAnswer({ status: 422, body: { Message: 'unprocessable' } }, prerequisites, 1).status).toBe('unknown');
});

test('a mixed answer takes the gates from the Units that carry them', () => {
  const gates = closeGatesOfAnswer(
    {
      status: 207,
      body: [
        { Error: { Message: 'permission denied' } },
        { ChangeSetClose: { Gates: [{ Prerequisite: 'reviewed', SpaceSlug: 'dev', Satisfied: false, Message: 'requires reviewed' }] } },
      ],
    },
    ['reviewed'],
    1,
  );
  expect(gates.status).toBe('held');
  expect(closeGatesSummaryText(gates)).toBe('0 of 1 close gates hold.');
});
