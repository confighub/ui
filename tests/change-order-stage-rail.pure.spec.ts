// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * THE RAIL NODE OF A STAGE WHOSE GATES ONLY WAIT.
 *
 * Test → Public: Public's entry gate needs Test Released and Healthy, and a
 * `prod-approval`. While Test's health has not reported, Healthy WAITS: its card
 * says "Waiting on check/healthy", calm. The rail node must say the same, not
 * "Ready to promote" with a red warning once the approval is in. Only a gate that
 * failed, or a rejection, is red. No page, no browser.
 */
import { expect, test } from '@playwright/test';

import type { StageReviewRail } from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import {
  type RailGateWaitsInput,
  railGateWait,
  railGateWaits,
  railStageLabel,
  reviewHoldTone,
} from '../src/pages/change-orders/components/railStage';
import type { PreviousStageInput } from '../src/pages/change-orders/stage/stageCardState';
import type {
  ChangeOrderGate,
  ChangeOrderStageState,
} from '../src/pages/x/apps/change-order/changeOrderTypes';
import type { LiveStatus } from '../src/pages/x/apps/liveStatus';

const gate = (id: string, ok: boolean, prerequisite: string): ChangeOrderGate => ({
  id,
  name: id,
  ok,
  evaluated: true,
  reason: `${prerequisite} reason`,
  prerequisite,
});
const released = gate('check/released', true, 'Released');
const healthy = gate('check/healthy', false, 'Healthy');
const approval = gate('attestation-prerequisite:prod-approval', false, 'prod-approval');
const approved = { ...approval, ok: true };

function publicState(gates: ChangeOrderGate[]): ChangeOrderStageState {
  return {
    stageId: 'Public',
    verdict: 'gated',
    label: 'Gated',
    progress: '0 of 1 space promoted',
    promotedCount: 0,
    restoredCount: 0,
    inFlightCount: 0,
    spaceCount: 1,
    gates,
    gateTally: { total: gates.length, satisfied: gates.filter((g) => g.ok).length },
    gatesOpen: gates.every((g) => g.evaluated && g.ok),
  };
}

const review = (state: StageReviewRail['state']): StageReviewRail => ({
  state,
  passes: state === 'satisfied' ? 1 : 0,
  required: 1,
  primaryName: 'prod-approval',
  requirementCount: 1,
  gateKind: 'entry',
  evaluated: true,
  ...(state === 'rejected' ? { rejecterFirstName: 'Jesper' } : {}),
});

const testStage = (healthPending: boolean): PreviousStageInput => ({
  stageId: 'Test',
  name: 'Test',
  verdict: 'released',
  healthPending,
});

test.describe('the Public rail node while Healthy waits', () => {
  test('before any approval: held on review, as the card puts the review first', () => {
    const state = publicState([released, healthy, approval]);
    const wait = railGateWait(state, testStage(true));
    expect(reviewHoldTone(state, true, review('pending'))).toBe('held');
    expect(railStageLabel(state, true, review('pending'), wait)).toBe('Held on review');
  });

  test('after the approval: waiting on check/healthy, not "Ready to promote"', () => {
    const state = publicState([released, healthy, approved]);
    const wait = railGateWait(state, testStage(true));
    expect(wait).toBe('Waiting on check/healthy');
    expect(reviewHoldTone(state, true, review('satisfied'))).toBeNull();
    expect(railStageLabel(state, true, review('satisfied'), wait)).toBe('Waiting on check/healthy');
  });

  test('with no review at all: waiting on check/healthy', () => {
    const state = publicState([released, healthy]);
    const wait = railGateWait(state, testStage(true));
    expect(railStageLabel(state, true, undefined, wait)).toBe('Waiting on check/healthy');
  });

  test('a rejection still blocks it', () => {
    const state = publicState([released, healthy, approval]);
    const wait = railGateWait(state, testStage(true));
    expect(reviewHoldTone(state, true, review('rejected'))).toBe('blocked');
    expect(railStageLabel(state, true, review('rejected'), wait)).toBe('Rejected');
  });
});

test.describe('the Public rail node once Healthy failed', () => {
  test('a failed gate does not only wait: no wait text, and not "Ready to promote"', () => {
    const state = publicState([released, healthy, approved]);
    const wait = railGateWait(state, testStage(false));
    expect(wait).toBeUndefined();
    expect(railStageLabel(state, true, review('satisfied'), wait)).toBe('Gated');
  });
});

test.describe('the Public rail node once Healthy passes', () => {
  test('ready to promote', () => {
    const state = { ...publicState([released, { ...healthy, ok: true }, approved]), verdict: 'waiting' as const, label: 'Waiting' };
    const wait = railGateWait(state, testStage(false));
    expect(wait).toBeUndefined();
    expect(railStageLabel(state, true, review('satisfied'), wait)).toBe('Ready to promote');
  });
});

test.describe('railGateWaits: read from the ChangeOrder, as the card reads the stage before', () => {
  const STATUS = (Health: LiveStatus['Health']): LiveStatus => ({ Sync: 'Synced', Operation: 'Succeeded', Health });
  const detail = (health: LiveStatus | null): RailGateWaitsInput => ({
    sequence: {
      stages: [
        { id: 'Test', isSource: false, spaceIds: ['sp-staging'], previousStageId: null },
        { id: 'Public', isSource: false, spaceIds: ['sp-prod'], previousStageId: 'Test' },
      ],
    },
    stageStates: [
      { ...publicState([]), stageId: 'Test', verdict: 'released', label: 'Released' },
      publicState([released, healthy, approved]),
    ],
    scopedSpaces: [
      { spaceId: 'sp-staging', release: { releaseNum: 1, liveStatus: health } },
      { spaceId: 'sp-prod', release: null },
    ],
  });

  test('Test’s health not reported, or progressing: Public waits on check/healthy', () => {
    expect(railGateWaits(detail(null))).toEqual({ Public: 'Waiting on check/healthy' });
    expect(railGateWaits(detail(STATUS('Progressing')))).toEqual({ Public: 'Waiting on check/healthy' });
  });

  test('Test degraded: Healthy failed, so Public has no wait', () => {
    expect(railGateWaits(detail(STATUS('Degraded')))).toEqual({});
  });
});
