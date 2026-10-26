// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * THE STAGE CARD'S SMALLER PARTS: the change card's scope, where "Go to" leads,
 * the sidebar's Targets, Space marks and gate rows, and the dry run as the box
 * reads it.
 */
import { expect, test } from '@playwright/test';

import { COMPLETE_STAGE_ID } from '../src/pages/change-orders/changeOrderCompleteStep';
import type { GateReviewSummary } from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import {
  cardDryRunView,
  changeCardModel,
  changeScope,
  gateSpacesOf,
  previousStageOf,
  sidebarGateFlags,
  dryRunRefreshKey,
  isReviewRequirementGate,
  nextStepOf,
  otherGatesHolding,
  sidebarMarks,
  sidebarTargets,
} from '../src/pages/change-orders/stage/stageCardParts';
import { segmentsText } from '../src/pages/change-orders/stage/stageCardCopy';
import type { DryRunSummary, StageFailure } from '../src/pages/change-orders/stage/stageTypes';
import type { ChangeOrderGate } from '../src/pages/x/apps/change-order/changeOrderTypes';

const base = { spaceId: 'base-id', name: 'app-base' };
const scopeText = (scope: ReturnType<typeof changeScope>) => scope.map(segmentsText).join(' · ');

function failure(landed: number, total: number, action: 'promote' | 'release' = 'promote'): StageFailure {
  return { action, source: 'session', failedSpaces: [{ spaceId: 's3', slug: 's3', items: [] }], landedCount: landed, spaceCount: total, outOfScope: false, message: 'x' };
}

const gate = (name: string, ok: boolean, evaluated = true, prerequisite?: string): ChangeOrderGate =>
  ({ id: `custom-prerequisite:${name}`, name, ok, evaluated, reason: '', ...(prerequisite === undefined ? {} : { prerequisite }) }) as ChangeOrderGate;
const review = (...names: string[]) => ({ requirements: names.map((name) => ({ name })) }) as unknown as GateReviewSummary;

test.describe('the change card scope', () => {
  test('a source stage says where the change is', () => {
    expect(scopeText(changeScope({ isSource: true, base, targetCount: 1, sameEverywhere: true }))).toBe('In app-base');
  });

  test('a stage says where the change was made, then how far it reaches', () => {
    expect(scopeText(changeScope({ isSource: false, base, targetCount: 3, sameEverywhere: true }))).toBe('Made in app-base · Same in all 3 Spaces');
    expect(scopeText(changeScope({ isSource: false, base, targetCount: 3, sameEverywhere: false }))).toBe('Made in app-base · 3 Spaces');
  });

  test('one Space is never "Same in all"', () => {
    expect(scopeText(changeScope({ isSource: false, base, targetCount: 1, sameEverywhere: true }))).toBe('Made in app-base · 1 Space');
  });

  test('a fan-out names its sources; a failed promotion says how much was written', () => {
    const sources = [{ spaceId: 'a', name: 'src-a' }, { spaceId: 'b', name: 'src-b' }];
    expect(scopeText(changeScope({ isSource: false, base, fanOutSources: sources, failure: failure(2, 3), targetCount: 3, sameEverywhere: true }))).toBe(
      'Made in src-a and src-b · Written to 2 of 3 Spaces',
    );
    // A failed release wrote everything; the scope reads as usual.
    expect(scopeText(changeScope({ isSource: false, base, failure: failure(2, 3, 'release'), targetCount: 3, sameEverywhere: true }))).toBe(
      'Made in app-base · Same in all 3 Spaces',
    );
  });
});

test.describe('where "Go to" leads', () => {
  const stages = [
    { stageId: '__change_order_source__', verdict: 'source' as const },
    { stageId: 'dev', verdict: 'released' as const },
    { stageId: 'prod', verdict: 'waiting' as const },
  ];
  const href = (id: string) => `/co/${id}`;

  test('the next stage, by the name a reader sees', () => {
    expect(nextStepOf(stages, '__change_order_source__', true, href)).toEqual({ name: 'dev', href: '/co/dev' });
  });

  test('the last stage leads to Complete, or nowhere when the path has none', () => {
    expect(nextStepOf(stages, 'prod', true, href)).toEqual({ name: null, href: `/co/${COMPLETE_STAGE_ID}` });
    expect(nextStepOf(stages, 'prod', false, href)).toBeNull();
  });
});

test.describe('the sidebar', () => {
  const targetOf = (spaceId: string) => ({ s1: 't1', s2: 't1', s3: 't2' } as Record<string, string | undefined>)[spaceId];

  test('Targets count distinct Targets, link to them, and say whether they run the change', () => {
    const targets = sidebarTargets(['s1', 's2', 's3'], targetOf, 'promoted');
    expect(targets?.count).toBe(2);
    expect(targets?.phase).toBe('promoted');
    expect(decodeURIComponent(targets?.href ?? '')).toBe("/targets?filterWhere=TargetID IN ('t1', 't2')");
    expect(sidebarTargets(['s1'], targetOf, 'released')?.phase).toBe('released');
    expect(sidebarTargets(['s4'], targetOf, 'waiting')).toBeNull();
  });

  test('after a failed promotion each target says whether it failed or holds the change', () => {
    const marks = sidebarMarks(new Map([['s1', { kind: 'differs' as const }]]), failure(1, 3), ['s1', 's2', 's3'], new Set(['s1']));
    expect(marks.get('s1')).toEqual({ kind: 'promoted' });
    expect(marks.get('s2')).toBeUndefined();
    expect(marks.get('s3')).toEqual({ kind: 'failed' });
    expect(sidebarMarks(new Map([['s1', { kind: 'differs' as const }]]), undefined, ['s1'], new Set()).get('s1')).toEqual({ kind: 'differs' });
  });

  test('a review requirement is a review row, not a gate row; the others still hold', () => {
    const r = review('security-review');
    expect(isReviewRequirementGate(gate('security-review', false, true, 'security-review'), [r])).toBe(true);
    expect(isReviewRequirementGate({ ...gate('x', false), id: 'attestation-prerequisite:security-review' }, [r])).toBe(true);
    expect(isReviewRequirementGate(gate('check/healthy', false), [r])).toBe(false);
    const gates = [gate('security-review', false, true, 'security-review'), gate('check/healthy', false), gate('check/promoted', true), gate('soak', false, false)];
    expect(otherGatesHolding(gates, r)).toEqual(['check/healthy', 'soak']);
  });
});

test.describe('the dry run as the box reads it', () => {
  const summary: DryRunSummary = { unitCount: 3, spaceCount: 1, reached: 1, failures: [], failuresBySpace: new Map(), unplannedReasonBySpaceId: new Map() };

  test('not asked: idle', () => {
    expect(cardDryRunView({ wanted: false, last: { kind: 'done', summary }, running: false, targetCount: 1 })).toEqual({ mode: 'idle' });
  });

  test('before the first answer it is on its way; with nothing to plan it is idle', () => {
    expect(cardDryRunView({ wanted: true, last: undefined, running: false, targetCount: 2 })).toEqual({ mode: 'running' });
    expect(cardDryRunView({ wanted: true, last: undefined, running: false, targetCount: 0 })).toEqual({ mode: 'idle' });
  });

  test('a re-run keeps the last counts; a hold stays while it is asked again', () => {
    expect(cardDryRunView({ wanted: true, last: { kind: 'done', summary }, running: true, targetCount: 1 })).toEqual({ mode: 'running', summary });
    expect(cardDryRunView({ wanted: true, last: { kind: 'held', text: 'held' }, running: true, targetCount: 1 })).toEqual({ mode: 'held', gatesHolding: 'held' });
    expect(cardDryRunView({ wanted: true, last: { kind: 'unavailable' }, running: false, targetCount: 1 })).toEqual({ mode: 'unavailable' });
  });

  test('the refresh key ignores the order the Spaces arrive in', () => {
    const key = (resolved: string[]) =>
      dryRunRefreshKey({ version: 4, orderStage: 'dev', progress: { resolvedSpaceIds: new Set(resolved), releasedSpaceIds: new Set() }, promotions: [], promotionFailures: [] });
    expect(key(['b', 'a'])).toBe(key(['a', 'b']));
    expect(key(['a'])).not.toBe(key(['a', 'b']));
  });
});

test.describe('gates that wait, gates in the box, and the stage before', () => {
  test('waiting gates are flagged apart from failing ones; the box\'s gates start closed', () => {
    const failing = gate('check/healthy', false);
    const waiting = gate('check/released', false);
    const flags = sidebarGateFlags({ kind: 'gateFailed', gates: [failing], waiting: [waiting] });
    expect([...flags.waitingGateIds]).toEqual([waiting.id]);
    expect([...flags.gateIdsInBox].sort()).toEqual([failing.id, waiting.id].sort());
    expect(sidebarGateFlags({ kind: 'ready', approvedByYou: false }).gateIdsInBox.size).toBe(0);
  });

  test('the stage before: none for the first stage; landed once promoted; health pending while unreported', () => {
    const detail = (verdict: 'waiting' | 'promoted', release: { liveStatus?: null } | null) => ({
      sequence: {
        stages: [
          { id: '__change_order_source__', isSource: true, spaceIds: ['base'], previousStageId: null },
          { id: 'dev', isSource: false, spaceIds: ['d1'], previousStageId: '__change_order_source__' },
          { id: 'prod', isSource: false, spaceIds: ['p1'], previousStageId: 'dev' },
        ],
      },
      stageStates: [
        { stageId: '__change_order_source__', verdict: 'source' as const },
        { stageId: 'dev', verdict },
      ],
      scopedSpaces: [{ spaceId: 'd1', release: release as never }],
    });
    const first = previousStageOf({ previousStageId: '__change_order_source__' }, detail('waiting', null));
    expect(first.previousStage).toBeUndefined();
    expect(first.previousLanded).toBe(true);
    const notYet = previousStageOf({ previousStageId: 'dev' }, detail('waiting', null));
    expect(notYet.previousStage).toMatchObject({ stageId: 'dev', name: 'dev', verdict: 'waiting', healthPending: false });
    expect(notYet.previousLanded).toBe(false);
    const landed = previousStageOf({ previousStageId: 'dev' }, detail('promoted', { liveStatus: null }));
    expect(landed.previousLanded).toBe(true);
    expect(landed.previousStage?.healthPending).toBe(true);
  });

  test('a failing gate names the Spaces the server rows say it fails in, once each', () => {
    const rows = [
      { Prerequisite: 'Healthy', Satisfied: false, SpaceID: 's1' },
      { Prerequisite: 'Healthy', Satisfied: false, SpaceID: 's1' },
      { Prerequisite: 'Healthy', Satisfied: true, SpaceID: 's2' },
      { Prerequisite: 'Released', Satisfied: false, SpaceID: 's3' },
    ];
    expect(gateSpacesOf(rows, { prerequisite: 'Healthy' }, (id) => `slug-${id}`)).toEqual([{ spaceId: 's1', name: 'slug-s1' }]);
    expect(gateSpacesOf(undefined, { prerequisite: 'Healthy' }, (id) => id)).toEqual([]);
  });

  test('the change card says the stage before must have the change first, while it is read, and its notes', () => {
    const card = (extra: Partial<Parameters<typeof changeCardModel>[0]>) =>
      changeCardModel({
        isSource: false,
        verdict: 'waiting',
        base,
        targets: ['a', 'b'],
        fieldCount: 0,
        sameEverywhere: false,
        status: 'resolved',
        groups: [],
        sourceFieldCount: 3,
        propagation: { quietNotes: ['a floor'] },
        ...extra,
      });
    expect(card({ status: 'loading' }).notice?.kind).toBe('reading');
    expect(card({ notReachedFrom: { stageId: 'dev', name: 'dev' } }).notice?.kind).toBe('notReached');
    expect(card({}).notes).toEqual(['a floor']);
    expect(card({ verdict: 'promoted' }).written).toBe(true);
  });
});
