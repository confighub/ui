// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * THE ISSUES UNDER THE PROMOTION STAGES SAY WHAT THEY BLOCK, AS THE SERVER DOES.
 *
 * The server never promotes past a Stage that selects no Space: every later Stage fails its
 * promoted gate. So the first empty Stage holds every Stage after it that has Spaces; when it is
 * the first Stage, nothing can be promoted. An empty last Stage holds nothing, and no workflow
 * blocks nothing (the server promotes into the ChangeOrder's own scope, with no gates), so then no
 * more is said. The sentence names Stages as the list does: `Stage "prod"`.
 */
import { expect, test } from '@playwright/test';

import {
  describeSequenceProblem,
  sequenceProblemsBlock,
  sequenceProblemsCopy,
} from '../src/pages/change-orders/components/sequenceProblem';
import type { ChangeOrderSequenceProblem } from '../src/pages/x/apps/change-order/changeOrderTypes';

const empty = (...names: string[]): ChangeOrderSequenceProblem[] =>
  names.map((stageName) => ({ kind: 'stage-selects-nothing', stageName }));
const STAGES = ['dev', 'staging', 'prod'];
const FOUR = ['dev', 'staging', 'qa', 'prod'];

test('the first Stage selects no Space: nothing can be promoted', () => {
  expect(sequenceProblemsBlock(empty('dev'), STAGES)).toBe(sequenceProblemsCopy.blocksAll);
  expect(sequenceProblemsBlock(empty('dev', 'staging', 'prod'), STAGES)).toBe(sequenceProblemsCopy.blocksAll);
  expect(sequenceProblemsBlock(empty('dev', 'qa'), FOUR)).toBe(sequenceProblemsCopy.blocksAll);
});

test('an empty Stage holds every later Stage that has Spaces', () => {
  expect(sequenceProblemsBlock(empty('staging'), STAGES)).toBe('Stage "prod" cannot be promoted.');
  expect(sequenceProblemsBlock(empty('staging'), FOUR)).toBe('Stage "qa" and Stage "prod" cannot be promoted.');
  expect(sequenceProblemsBlock(empty('staging', 'qa'), FOUR)).toBe('Stage "prod" cannot be promoted.');
  expect(sequenceProblemsBlock(empty('staging'), ['dev', 'staging', 'qa', 'uat', 'prod'])).toBe(
    'Stage "qa", Stage "uat" and Stage "prod" cannot be promoted.',
  );
});

test('an empty last Stage, and no workflow, block nothing: no more is said', () => {
  expect(sequenceProblemsBlock(empty('prod'), STAGES)).toBeUndefined();
  expect(sequenceProblemsBlock(empty('qa', 'prod'), FOUR)).toBeUndefined();
  expect(sequenceProblemsBlock([{ kind: 'no-workflow' }], [])).toBeUndefined();
});

test('the list and the sentence name a Stage the same way', () => {
  expect(describeSequenceProblem({ kind: 'stage-selects-nothing', stageName: 'qa' })).toBe('Stage "qa" selects no Space.');
});

test('the title counts the issues', () => {
  expect(sequenceProblemsCopy.title(1)).toBe('1 issue');
  expect(sequenceProblemsCopy.title(3)).toBe('3 issues');
});
