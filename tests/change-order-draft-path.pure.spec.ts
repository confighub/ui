// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The draft's promotion path, as the rail and the stage card read it: gates nobody has
 * evaluated, the node a URL names, the source node's count, and the variants no stage selects.
 */

import type { ChangeWorkflowSpec } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { COMPLETE_STAGE_ID } from '../src/pages/change-orders/changeOrderCompleteStep';
import { draftFinalGates, draftGatesForStage } from '../src/pages/change-orders/draft/draftGates';
import { draftCarriedCardCount, inScopeOrder, resolveDraftStageId } from '../src/pages/change-orders/draft/draftPath';
import { SOURCE_STAGE_ID } from '../src/pages/x/apps/change-order/changeOrderStages';
import type { ChangeOrderSequence, ChangeOrderStage } from '../src/pages/x/apps/change-order/changeOrderTypes';

const MAIN_LINE: ChangeWorkflowSpec = {
  Stages: [
    { Name: 'dev' },
    { Name: 'staging', Prerequisites: ['Released'] },
    { Name: 'prod', Prerequisites: ['Released', 'Healthy', 'code-freeze'] },
  ],
  Final: { Prerequisites: ['Released', 'Healthy'] },
  CustomPrerequisites: [{ Name: 'code-freeze', Expression: 'true', Description: 'No Space is under a code freeze' }],
};

function stage(id: string, spaceIds: string[], isSource = false): ChangeOrderStage {
  return {
    id,
    previousStageId: null,
    spaceIds,
    index: 0,
    isSource,
    isFirst: false,
    prerequisites: [],
  } as unknown as ChangeOrderStage;
}

const SEQUENCE: ChangeOrderSequence = {
  stages: [stage(SOURCE_STAGE_ID, ['base'], true), stage('dev', ['d']), stage('prod', ['p1', 'p2'])],
  problems: [],
};

test.describe('draft gates', () => {
  test('every declared gate is not evaluated, worded over the stage before', () => {
    const gates = draftGatesForStage(MAIN_LINE, 'prod', 'payments-base');
    expect(gates.map((gate) => gate.name)).toEqual(['check/released', 'check/healthy', 'check/code-freeze']);
    expect(gates.every((gate) => !gate.evaluated)).toBe(true);
    expect(gates[0].reason).toBe('Not evaluated. staging has to be released first.');
    expect(gates[2].reason).toContain("Every Space of 'staging' must satisfy 'code-freeze': No Space is under a code freeze. The server checks this.");
  });

  test('a first stage has no gates of its own; Final lists its checks with no sentence', () => {
    expect(draftGatesForStage(MAIN_LINE, 'dev', 'payments-base')).toEqual([]);
    expect(draftFinalGates(MAIN_LINE, 'payments-base').map((gate) => [gate.name, gate.reason, gate.evaluated])).toEqual([
      ['check/released', '', false],
      ['check/healthy', '', false],
    ]);
  });

  test('a prerequisite the workflow does not declare is refused, not "not evaluated"', () => {
    const [gate] = draftGatesForStage({ Stages: [{ Name: 'a' }, { Name: 'b', Prerequisites: ['nope'] }] }, 'b', 'base');
    expect(gate.evaluated).toBe(true);
    expect(gate.ok).toBe(false);
  });
});

test.describe('draft path', () => {
  test('the URL node is kept; without one, the last stage until the dry run says where a variant differs', () => {
    expect(resolveDraftStageId({ requested: COMPLETE_STAGE_ID, sequence: SEQUENCE, stages: [], hasComplete: true })).toBe(COMPLETE_STAGE_ID);
    expect(resolveDraftStageId({ requested: 'dev', sequence: SEQUENCE, stages: [], hasComplete: true })).toBe('dev');
    expect(resolveDraftStageId({ requested: 'qa', sequence: SEQUENCE, stages: [], hasComplete: true })).toBe('prod');
  });

  test('the source node counts the cards inside the end, and nothing while any is unknown', () => {
    expect(draftCarriedCardCount([{ inclusion: 'all' }, { inclusion: 'some' }, { inclusion: 'none' }])).toBe(2);
    expect(draftCarriedCardCount([{ inclusion: 'all' }, { inclusion: 'unknown' }])).toBeUndefined();
  });

  test('chips in scope order', () => {
    expect(inScopeOrder(['p2', 'p1', 'z'], ['p1', 'p2'])).toEqual(['p1', 'p2', 'z']);
  });
});
