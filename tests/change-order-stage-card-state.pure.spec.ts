// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * WHICH STATE THE STAGE CARD'S STATUS BOX IS IN, AND WHAT IT OFFERS.
 *
 * The status box says the stage's state once, so the order in which the rules
 * apply is the whole contract: a source never shows a failure, an aborted
 * ChangeOrder offers nothing, a rejection outranks a failing gate, and a promoted
 * stage offers Release and never a second promote. Each rule of the order gets a
 * case here, and each case breaks only that rule.
 *
 * Failures get the closest reading, because a failure shown from a stale record
 * tells someone to retry work another person has already finished.
 *
 * The stage modules are pure (no React, no MUI) so these specs can import them;
 * the last test reads their imports to keep it that way.
 */
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { expect, test } from '@playwright/test';

import type { ChangeOrderPromotion, ChangeOrderPromotionFailure } from '@confighub/rtk-query';

import type { GateReviewSummary, RequirementProgress } from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import type { HistoryEntry } from '../src/pages/change-orders/changeOrderHistory';
import {
  defaultMethod,
  deriveStageCardState,
  dryRunWanted,
  gateWaitsFor,
  healthPending,
  methodsFor,
  previousHasChange,
  retryTargets,
  stageBoxLook,
  stageBylines,
  stageFailure,
  type StageCardStateInput,
  type StageFailureInput,
} from '../src/pages/change-orders/stage/stageCardState';
import { noteRequired, segmentsText, stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';
import { changeCardModel, changeScope, previousStageOf, sidebarGateFlags, sidebarMarks, sidebarSpaces } from '../src/pages/change-orders/stage/stageCardParts';
import { diffAnchorId, hrefOfRef, spaceHref, stageTargetIds, targetsHref, workflowLink } from '../src/pages/change-orders/stage/stageLinks';
import type { ReviewViewerFlow, StageFailure } from '../src/pages/change-orders/stage/stageTypes';
import type { ChangeOrderGate } from '../src/pages/x/apps/change-order/changeOrderTypes';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const gate = (id: string, evaluated: boolean, ok: boolean, extra: Partial<ChangeOrderGate> = {}): ChangeOrderGate => ({
  id,
  name: id,
  ok,
  evaluated,
  reason: `${id} reason`,
  ...extra,
});

const flow = (kind: 'form' | 'author' = 'form'): ReviewViewerFlow =>
  kind === 'form'
    ? { kind: 'form', requirementNames: ['prod-approval'], authorsMayApprove: false, types: ['Approval'], own: [], nothingRecordable: false, ownNotCounted: [] }
    : { kind: 'author', authorIn: ['dev'], types: ['Approval'], own: [], nothingRecordable: false, ownNotCounted: [] };

function requirement(over: Partial<RequirementProgress> & { gateKind?: 'entry' | 'release' } = {}): RequirementProgress {
  const kind = over.gateKind ?? 'entry';
  return {
    name: 'prod-approval',
    rules: { type: 'Approval', required: 1, count: 1, fromUsers: [], fromGroups: [], distinctGroups: false, allowAuthors: false, ignoreFail: false },
    gate: { kind, stageId: 'prod', stageName: 'prod', key: `${kind}:prod` },
    evaluated: true,
    passes: 0,
    required: 1,
    need: 1,
    rejected: false,
    satisfied: false,
    perSpace: [],
    passers: [],
    rejecters: [],
    viewer: { kind: 'counts' },
    ...over,
  };
}

function summary(over: Partial<GateReviewSummary> = {}, kind: 'entry' | 'release' = 'entry'): GateReviewSummary {
  return {
    gate: { kind, stageId: 'prod', stageName: 'prod', key: `${kind}:prod` },
    gateStageName: 'staging',
    gateSpaces: [],
    requirements: [requirement({ gateKind: kind })],
    state: 'pending',
    open: false,
    evaluated: true,
    requests: [],
    decisions: [],
    viewer: { eligibility: { kind: 'counts', types: ['Approval'], requirementNames: ['prod-approval'] }, ownByType: {} },
    whoCanStillApprove: [],
    attestTarget: { ChangeOrderID: 'co', TargetStage: 'staging' },
    ...over,
  };
}

const failure: StageFailure = {
  action: 'promote',
  source: 'session',
  failedSpaces: [{ spaceId: 's2', slug: 'prod-eu', items: [{ message: 'boom' }] }],
  landedCount: 1,
  spaceCount: 2,
  outOfScope: false,
  message: 'boom',
};

function input(over: Partial<StageCardStateInput> = {}): StageCardStateInput {
  return {
    stageId: 'prod',
    verdict: 'waiting',
    isSource: false,
    invocationSource: false,
    abortedReason: '',
    spaceIds: ['s1', 's2'],
    targets: ['s1', 's2'],
    stageHasTargets: true,
    gates: [],
    inFlightSpaceIds: new Set(),
    failure: null,
    dryRun: { mode: 'idle' },
    problems: [],
    ...over,
  };
}

const kindOf = (over: Partial<StageCardStateInput>) => deriveStageCardState(input(over)).kind;

const differs = { kind: 'differs' as const, spaceId: 's2', unitId: 'u2', resourceName: 'api', path: 'replicas', label: 'replicas', isImage: false, from: '1', to: '3', refFrom: '1', refTo: '2', refSpaceId: 's1' };

// ---------------------------------------------------------------------------
// The order
// ---------------------------------------------------------------------------

test.describe('deriveStageCardState: one case per rule, in order', () => {
  test('a source is a source, whatever else holds', () => {
    expect(kindOf({ isSource: true, verdict: 'source', abortedReason: 'stop', failure })).toBe('source');
    expect(kindOf({ isSource: true, verdict: 'source', invocationSource: true })).toBe('invocationSource');
  });

  test('aborted beats everything except source', () => {
    const state = deriveStageCardState(input({ abortedReason: 'Rolled back', failure, verdict: 'released' }));
    expect(state).toEqual({ kind: 'aborted', reason: 'Rolled back' });
  });

  test('a stage that selects no Space says so', () => {
    expect(kindOf({ spaceIds: [], targets: [] })).toBe('noSpaces');
  });

  test('this browser writing to a target is working', () => {
    expect(kindOf({ inFlightSpaceIds: new Set(['s2']), failure })).toBe('working');
    // A write to a Space that is not a target of this stage is not this stage's work.
    expect(kindOf({ inFlightSpaceIds: new Set(['elsewhere']) })).toBe('ready');
  });

  test('a failure beats the verdict', () => {
    expect(kindOf({ failure, verdict: 'in-progress' })).toBe('failed');
  });

  test('released, restored, promoted without Targets', () => {
    expect(kindOf({ verdict: 'released' })).toBe('released');
    expect(deriveStageCardState(input({ verdict: 'restored' }))).toEqual({ kind: 'restored', verdict: 'restored', problems: [] });
    expect(deriveStageCardState(input({ verdict: 'restore-released' }))).toEqual({ kind: 'restored', verdict: 'restore-released', problems: [] });
    expect(kindOf({ verdict: 'promoted', stageHasTargets: false })).toBe('promotedNoTargets');
  });

  test('promoted offers Release, unless a release review holds it', () => {
    expect(kindOf({ verdict: 'promoted' })).toBe('promoted');
    const held = summary({}, 'release');
    expect(deriveStageCardState(input({ verdict: 'promoted', releaseReview: { summary: held, flow: flow() } }))).toMatchObject({
      kind: 'reviewNeeded',
      action: 'release',
      gateKey: 'release:prod',
    });
    const rejected = summary({ state: 'rejected', requirements: [requirement({ gateKind: 'release', rejected: true, rejecters: [{ userId: 'u', name: 'Jesper', initials: 'J', isYou: false }] })] }, 'release');
    expect(kindOf({ verdict: 'promoted', releaseReview: { summary: rejected, flow: flow() } })).toBe('reviewRejected');
    // A release review the server did not evaluate cannot hold Release.
    const unread = summary({ requirements: [requirement({ gateKind: 'release', evaluated: false })] }, 'release');
    expect(kindOf({ verdict: 'promoted', releaseReview: { summary: unread, flow: flow() } })).toBe('promoted');
  });

  test('a rejected entry review beats a failing gate, and lists it', () => {
    const rejected = summary({ state: 'rejected', requirements: [requirement({ rejected: true, rejecters: [{ userId: 'j', name: 'Jesper', initials: 'J', isYou: false }] })] });
    const failing = gate('released', true, false);
    const state = deriveStageCardState(input({ entryReview: { summary: rejected, flow: flow() }, gates: [failing] }));
    expect(state.kind).toBe('reviewRejected');
    if (state.kind !== 'reviewRejected') return;
    expect(state.failedGates.map((g) => g.id)).toEqual(['released']);
    expect(state.rejection?.rejecter.name).toBe('Jesper');
  });

  test('a failing non-review gate; review gates the card hosts are not counted twice', () => {
    expect(kindOf({ gates: [gate('released', true, false)] })).toBe('gateFailed');
    const reviewGate = gate('attestation-prerequisite:prod-approval', true, false, { prerequisite: 'prod-approval' });
    expect(kindOf({ gates: [reviewGate], entryReview: { summary: summary(), flow: flow() } })).toBe('reviewNeeded');
    // Hosted on another card, a failing review gate is a gate like any other.
    expect(kindOf({ gates: [reviewGate] })).toBe('gateFailed');
    // A gate nobody evaluated does not hold the stage.
    expect(kindOf({ gates: [gate('healthy', false, false)] })).toBe('ready');
  });

  test('an entry review not open: needed when the viewer can act, waiting otherwise', () => {
    expect(kindOf({ entryReview: { summary: summary(), flow: flow('form') } })).toBe('reviewNeeded');
    expect(kindOf({ entryReview: { summary: summary(), flow: flow('author') } })).toBe('reviewWaiting');
    expect(kindOf({ entryReview: { summary: summary({ open: true, state: 'satisfied' }), flow: flow() } })).toBe('ready');
  });

  test('review states carry propagation problems, so a reviewer sees them first', () => {
    const state = deriveStageCardState(input({ entryReview: { summary: summary(), flow: flow() }, problems: [differs] }));
    expect(state.kind).toBe('reviewNeeded');
    if (state.kind === 'reviewNeeded') expect(state.problems).toHaveLength(1);
  });

  test('what the quiet dry run decided', () => {
    expect(deriveStageCardState(input({ dryRun: { mode: 'held', gatesHolding: 'Held by healthy.' } }))).toEqual({ kind: 'serverHeld', text: 'Held by healthy.' });
    expect(kindOf({ dryRun: { mode: 'noPermission' } })).toBe('noPermission');
    expect(kindOf({ serverGateRefusal: 403 })).toBe('noPermission');
    expect(deriveStageCardState(input({ dryRun: { mode: 'refused', refusal: 'Stage selects no Space' } }))).toEqual({ kind: 'dryRunRefused', reason: 'Stage selects no Space' });
  });

  test('a propagation problem', () => {
    expect(kindOf({ problems: [differs] })).toBe('problem');
  });

  test('in progress, progress unknown, ready', () => {
    expect(kindOf({ verdict: 'in-progress' })).toBe('inProgress');
    expect(kindOf({ verdict: 'unknown' })).toBe('progressUnknown');
    expect(kindOf({ verdict: 'gated' })).toBe('ready');
    expect(deriveStageCardState(input({ approvedByYou: true }))).toEqual({ kind: 'ready', approvedByYou: true });
  });
});

test.describe('methodsFor: what the buttons offer', () => {
  test('ready with Targets: promote and release as the main button, promote only beside it', () => {
    const options = methodsFor({ kind: 'ready', approvedByYou: false }, true, 'prod');
    expect(options.map((o) => [o.method, o.disabled])).toEqual([
      ['pr', false],
      ['p', false],
    ]);
    expect(defaultMethod(options)).toBe('pr');
  });

  test('no Targets: one Promote button', () => {
    const options = methodsFor({ kind: 'ready', approvedByYou: false }, false, 'prod');
    expect(options.map((o) => o.method)).toEqual(['p']);
  });

  test('promoted: Release is the one action left, never a re-promote', () => {
    expect(methodsFor({ kind: 'promoted', took: [] }, true, 'prod').map((o) => o.method)).toEqual(['r']);
  });

  test('done and held states offer nothing', () => {
    for (const state of [
      { kind: 'released' as const, took: [] },
      { kind: 'gateFailed' as const, gates: [] },
      { kind: 'serverHeld' as const, text: '' },
      { kind: 'noPermission' as const },
      { kind: 'aborted' as const, reason: 'x' },
    ]) {
      expect(methodsFor(state, true, 'prod')).toEqual([]);
    }
  });

  test('a failure that passed a Space over cannot be retried', () => {
    expect(methodsFor({ kind: 'failed', failure: { ...failure, outOfScope: true }, canRetry: false }, true, 'prod')).toEqual([]);
    expect(methodsFor({ kind: 'failed', failure, canRetry: true }, true, 'prod').map((o) => o.method)).toEqual(['pr', 'p']);
    expect(methodsFor({ kind: 'failed', failure, canRetry: false }, true, 'prod')).toEqual([]);
  });
});

test.describe('the tile', () => {
  test('problems are solid, everything else is calm', () => {
    expect(stageBoxLook({ kind: 'problem', problems: [differs] })).toEqual({ tone: 'warning', tile: 'solid', icon: 'warning' });
    expect(stageBoxLook({ kind: 'failed', failure, canRetry: true })).toEqual({ tone: 'error', tile: 'solid', icon: 'error' });
    expect(stageBoxLook({ kind: 'ready', approvedByYou: false })).toEqual({ tone: 'success', tile: 'calm', icon: 'check' });
    expect(stageBoxLook({ kind: 'promoted', took: [] }).icon).toBe('upload');
  });

  test('the dry run runs only where it can change the answer', () => {
    expect(dryRunWanted('ready')).toBe(true);
    expect(dryRunWanted('failed')).toBe(true);
    expect(dryRunWanted('serverHeld')).toBe(true);
    expect(dryRunWanted('reviewNeeded')).toBe(false);
    expect(dryRunWanted('gateFailed')).toBe(false);
    expect(dryRunWanted('released')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

const T0 = Date.parse('2026-10-17T12:00:00Z');
const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();

function failureInput(over: Partial<StageFailureInput> = {}): StageFailureInput {
  return {
    stageId: 'prod',
    verdict: 'in-progress',
    targets: ['s1', 's2', 's3'],
    lastResult: null,
    promotionFailures: [],
    promotions: [],
    resolvedSpaceIds: new Set(['s1']),
    slugOf: (id) => `slug-${id}`,
    ...over,
  };
}

const recorded = (at: number, stage = 'prod'): ChangeOrderPromotionFailure => ({
  Stage: stage,
  FailedAt: iso(at),
  UserID: 'u1',
  Spaces: [
    { SpaceID: 's2', SpaceSlug: 'prod-eu', Action: 'Promote', Units: [{ Slug: 'api', UnitID: 'u-api', Error: 'merge conflict' }] },
    { SpaceID: 's3', SpaceSlug: 'prod-us', Action: 'Blocked', Reason: 'UpstreamFailed', Message: 'Its upstream failed.' },
  ],
});

test.describe('stageFailure', () => {
  test('this browser’s result, for this stage, comes first', () => {
    const result = stageFailure(
      failureInput({
        lastResult: { ok: false, message: 'Promote partly failed.', failedSpaces: [{ spaceId: 's2', spaceSlug: 'prod-eu', unitSlug: 'api', message: 'conflict' }] },
        lastResultStageId: 'prod',
        promotionFailures: [recorded(5)],
      }),
    );
    expect(result?.source).toBe('session');
    expect(result?.failedSpaces).toEqual([{ spaceId: 's2', slug: 'prod-eu', items: [{ message: 'conflict', unitSlug: 'api' }] }]);
    // Counted from the same result as the failure: the targets it does not name as failed hold the change.
    expect(result?.landedCount).toBe(2);
    expect(result?.spaceCount).toBe(3);
  });

  test('a refusal at the gates is a hold, not a failure', () => {
    expect(stageFailure(failureInput({ lastResult: { ok: false, message: 'Promote refused.', gatesHolding: 'staging is not healthy.' }, lastResultStageId: 'prod' }))).toBeNull();
    expect(stageFailure(failureInput({ lastResult: { ok: false, message: 'Promote refused.', gatesHolding: true }, lastResultStageId: 'prod' }))).toBeNull();
  });

  test('this browser’s failure is history once the stage is done', () => {
    const lastResult = { ok: false, message: 'x', failedSpaces: [{ spaceId: 's2', spaceSlug: 'prod-eu', message: 'boom' }] };
    for (const verdict of ['promoted', 'released', 'restored', 'restore-released'] as const) {
      expect(stageFailure(failureInput({ verdict, lastResult, lastResultStageId: 'prod' })), verdict).toBeNull();
    }
    const release = { ...lastResult, action: 'release' as const };
    expect(stageFailure(failureInput({ verdict: 'released', lastResult: release, lastResultStageId: 'prod' }))).toBeNull();
    expect(stageFailure(failureInput({ verdict: 'promoted', lastResult: release, lastResultStageId: 'prod' }))?.action).toBe('release');
  });

  test('a result for another stage is not this stage’s failure', () => {
    expect(stageFailure(failureInput({ lastResult: { ok: false, message: 'x' }, lastResultStageId: 'staging' }))).toBeNull();
  });

  test('a stale-plan refusal wrote nothing and is said in place, not as a failure', () => {
    expect(stageFailure(failureInput({ lastResult: { ok: false, message: 'x', planStale: true }, lastResultStageId: 'prod' }))).toBeNull();
  });

  test('a session result with no items names the targets that do not hold the change', () => {
    const result = stageFailure(failureInput({ lastResult: { ok: false, message: 'Promote failed: timeout.' }, lastResultStageId: 'prod' }));
    expect(result?.failedSpaces.map((s) => s.spaceId)).toEqual(['s2', 's3']);
  });

  test('a release failure is a release failure', () => {
    const result = stageFailure(
      failureInput({ verdict: 'promoted', lastResult: { ok: false, message: 'Release failed for prod-eu.', action: 'release' }, lastResultStageId: 'prod', releasedSpaceIds: new Set(['s1']) }),
    );
    expect(result?.action).toBe('release');
  });

  test('the record survives a reload, with its items', () => {
    const result = stageFailure(failureInput({ promotionFailures: [recorded(-30), recorded(5)] }));
    expect(result?.source).toBe('record');
    expect(result?.at).toBe(T0 + 5 * 60_000);
    expect(result?.failedSpaces.map((s) => [s.slug, s.items[0].message])).toEqual([
      ['prod-eu', 'merge conflict'],
      ['prod-us', 'Its upstream failed.'],
    ]);
    expect(result?.failedSpaces[0].items[0]).toMatchObject({ unitSlug: 'api', unitId: 'u-api' });
  });

  test('a record older than the stage’s last promotion is history, not state', () => {
    const promotions: ChangeOrderPromotion[] = [{ Stage: 'prod', PromotedAt: iso(10), SpaceIDs: ['s2'] }];
    expect(stageFailure(failureInput({ promotionFailures: [recorded(5)], promotions }))).toBeNull();
    // A promotion of ANOTHER stage does not clear it.
    expect(stageFailure(failureInput({ promotionFailures: [recorded(5)], promotions: [{ Stage: 'staging', PromotedAt: iso(10) }] }))).not.toBeNull();
  });

  test('a record on a stage that is now promoted is ignored', () => {
    expect(stageFailure(failureInput({ verdict: 'promoted', promotionFailures: [recorded(5)] }))).toBeNull();
    expect(stageFailure(failureInput({ verdict: 'released', promotionFailures: [recorded(5)] }))).toBeNull();
  });

  test('a recorded skip of a Space the ChangeOrder is not headed for cannot be retried', () => {
    const skipped: ChangeOrderPromotionFailure = {
      Stage: 'prod',
      FailedAt: iso(5),
      Spaces: [{ SpaceID: 's3', SpaceSlug: 'prod-us', Action: 'Skipped', Message: 'add the space to its InScopeSpaceIDs first' }],
    };
    expect(stageFailure(failureInput({ promotionFailures: [skipped] }))?.outOfScope).toBe(true);
    // The ChangeOrder's own Space is skipped on purpose.
    expect(stageFailure(failureInput({ baseSpaceId: 's3', promotionFailures: [skipped] }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bylines
// ---------------------------------------------------------------------------

test('stageBylines: the newest promotion of the stage, the newest release in its Spaces', () => {
  const person = (name: string, isYou = false) => ({ key: name, kind: 'person' as const, name, isYou, colorSeed: name });
  const entries: HistoryEntry[] = [
    { kind: 'action', id: 'a1', at: T0, stage: 'prod', person: person('Ana'), promotion: { Stage: 'prod' } },
    { kind: 'action', id: 'a2', at: T0 + 1000, stage: 'prod', person: person('Charles', true), promotion: { Stage: 'prod' } },
    { kind: 'action', id: 'a3', at: T0 + 5000, stage: 'staging', person: person('Tom'), promotion: { Stage: 'staging' } },
    { kind: 'action', id: 'a4', at: T0 + 6000, stage: 'prod', person: person('Fail'), failure: { Stage: 'prod' } },
    { kind: 'release', id: 'r1', at: T0 + 2000, person: person('Ana'), release: { SpaceID: 's1' } },
    { kind: 'release', id: 'r2', at: T0 + 9000, person: person('Tom'), release: { SpaceID: 'other' } },
  ];
  expect(stageBylines(entries, 'prod', ['s1', 's2'])).toEqual({
    promoted: { name: 'Charles', isYou: true, at: T0 + 1000 },
    released: { name: 'Ana', isYou: false, at: T0 + 2000 },
  });
  expect(stageBylines([], 'prod', ['s1'])).toEqual({});
});

// ---------------------------------------------------------------------------
// What the server says now outranks an old failure
// ---------------------------------------------------------------------------

test.describe('a failure gives way to the dry run’s verdict', () => {
  test('held, forbidden or refused now: that state, with the failure carried', () => {
    expect(deriveStageCardState(input({ failure, dryRun: { mode: 'held', gatesHolding: 'staging is not healthy.' } }))).toEqual({
      kind: 'serverHeld',
      text: 'staging is not healthy.',
      failure,
    });
    expect(deriveStageCardState(input({ failure, dryRun: { mode: 'noPermission' } }))).toEqual({ kind: 'noPermission', failure });
    expect(deriveStageCardState(input({ failure, serverGateRefusal: 403 }))).toEqual({ kind: 'noPermission', failure });
    expect(deriveStageCardState(input({ failure, dryRun: { mode: 'refused', refusal: 'No.' } }))).toEqual({ kind: 'dryRunRefused', reason: 'No.', failure });
  });

  test('a passed-over Space and a release failure are not the promote dry run’s to overrule', () => {
    expect(kindOf({ failure: { ...failure, outOfScope: true }, dryRun: { mode: 'held', gatesHolding: 'x' } })).toBe('failed');
    expect(kindOf({ failure: { ...failure, action: 'release' }, verdict: 'promoted', dryRun: { mode: 'held', gatesHolding: 'x' } })).toBe('failed');
  });

  test('Retry is offered only when the dry run says it can run', () => {
    const retry = (mode: 'idle' | 'running' | 'done' | 'fails' | 'unavailable') => {
      const state = deriveStageCardState(input({ failure, dryRun: { mode } }));
      return state.kind === 'failed' ? state.canRetry : undefined;
    };
    expect(retry('done')).toBe(true);
    expect(retry('unavailable')).toBe(true);
    expect(retry('running')).toBe(false);
    expect(retry('fails')).toBe(false);
    expect(retry('idle')).toBe(false);
    const release = deriveStageCardState(input({ failure: { ...failure, action: 'release' }, verdict: 'promoted' }));
    expect(release).toMatchObject({ kind: 'failed', canRetry: true });
  });

  test('a failed release asks for no promote dry run', () => {
    expect(dryRunWanted({ kind: 'failed', failure: { ...failure, action: 'release' }, canRetry: true })).toBe(false);
    expect(dryRunWanted({ kind: 'failed', failure, canRetry: false })).toBe(true);
    expect(dryRunWanted('failed')).toBe(true);
  });

  test('Release again goes only to the Spaces whose release failed', () => {
    const released: StageFailure = { ...failure, action: 'release', failedSpaces: [{ spaceId: 's2', slug: 'prod-eu', items: [] }, { spaceId: '', slug: 'prod-ap', items: [] }] };
    expect(retryTargets(released, ['s1', 's2', 's3'], ['s1', 's2', 's3'], (id) => ({ s3: 'prod-ap' })[id] ?? id)).toEqual(['s2', 's3']);
    // A Space without a Target is not released, failed or not.
    expect(retryTargets(released, ['s1', 's2', 's3'], ['s1', 's3'], (id) => ({ s3: 'prod-ap' })[id] ?? id)).toEqual(['s3']);
    // A promote is run over every target again.
    expect(retryTargets(failure, ['s1', 's2'], ['s1'])).toEqual(['s1', 's2']);
  });
});

test.describe('a restored stage is still held by its gates and reviews', () => {
  test('held states win; the restored box only where Promote can be offered', () => {
    expect(kindOf({ verdict: 'restored', gates: [gate('released', true, false)] })).toBe('gateFailed');
    expect(kindOf({ verdict: 'restored', entryReview: { summary: summary(), flow: flow() } })).toBe('reviewNeeded');
    expect(kindOf({ verdict: 'restored', dryRun: { mode: 'held', gatesHolding: 'x' } })).toBe('serverHeld');
    expect(deriveStageCardState(input({ verdict: 'restored', problems: [differs] }))).toEqual({ kind: 'restored', verdict: 'restored', problems: [differs] });
    // Held, it is not previewed.
    expect(dryRunWanted(deriveStageCardState(input({ verdict: 'restored', gates: [gate('released', true, false)], dryRun: { mode: 'idle' } })))).toBe(false);
  });
});

test.describe('a gate that has not passed yet waits; only a real failure is red', () => {
  const promotedGate = gate('check/promoted', true, false, { prerequisite: 'Promoted' });
  const releasedGate = gate('check/released', true, false, { prerequisite: 'Released' });
  const healthyGate = gate('check/healthy', true, false, { prerequisite: 'Healthy' });
  const prev = (verdict: 'gated' | 'waiting' | 'in-progress' | 'promoted' | 'released' | 'restored', healthPendingNow = false) => ({
    stageId: 'staging',
    name: 'staging',
    verdict,
    healthPending: healthPendingNow,
  });

  test('the change has not reached the stage before: waiting for it to be promoted', () => {
    const state = deriveStageCardState(input({ gates: [promotedGate, releasedGate], previousStage: prev('waiting') }));
    expect(state).toEqual({ kind: 'gateWaiting', gates: [promotedGate, releasedGate], waitFor: 'promoted', previousStage: { stageId: 'staging', name: 'staging' } });
    expect(stageBoxLook(state)).toEqual({ tone: 'neutral', tile: 'calm', icon: 'help' });
    expect(methodsFor(state, true, 'prod')).toEqual([]);
    expect(dryRunWanted(state)).toBe(false);
  });

  test('promoted but not released: waiting for it to be released', () => {
    expect(deriveStageCardState(input({ gates: [releasedGate], previousStage: prev('promoted') }))).toMatchObject({ kind: 'gateWaiting', waitFor: 'released' });
  });

  test('health that has not reported yet waits; health that failed is red', () => {
    expect(deriveStageCardState(input({ gates: [healthyGate], previousStage: prev('released', true) }))).toMatchObject({ kind: 'gateWaiting', waitFor: 'healthy' });
    expect(deriveStageCardState(input({ gates: [healthyGate], previousStage: prev('released', false) }))).toMatchObject({ kind: 'gateFailed', gates: [healthyGate] });
  });

  test('a real failure stays red, and lists what only waits beside it', () => {
    const custom = gate('custom-prerequisite:no-restarts', true, false, { prerequisite: 'no-restarts' });
    expect(deriveStageCardState(input({ gates: [custom, releasedGate], previousStage: prev('promoted') }))).toEqual({
      kind: 'gateFailed',
      gates: [custom],
      waiting: [releasedGate],
    });
  });

  test('a stage before that was restored is not something to wait for', () => {
    expect(gateWaitsFor(promotedGate, prev('restored'))).toBeUndefined();
    expect(gateWaitsFor(promotedGate, undefined)).toBeUndefined();
  });

  test('a review hosted elsewhere waits while its subject has not landed', () => {
    const review = gate('attestation-prerequisite:prod-approval', true, false, { prerequisite: 'prod-approval' });
    expect(gateWaitsFor(review, prev('waiting'))).toBe('promoted');
    expect(gateWaitsFor(review, prev('released'))).toBeUndefined();
  });

  test('healthPending: not reported, not synced or deploying, with nothing failed', () => {
    const release = (liveStatus: object | null) => ({ releaseNum: 1, liveStatus }) as Parameters<typeof healthPending>[0][number];
    expect(healthPending([release(null)])).toBe(true);
    expect(healthPending([undefined])).toBe(true);
    expect(healthPending([release({ Sync: 'OutOfSync', Health: 'Healthy' })])).toBe(true);
    expect(healthPending([release({ Sync: 'Synced', Health: 'Healthy', Operation: 'Running' })])).toBe(true);
    expect(healthPending([release({ Sync: 'Synced', Health: 'Healthy' })])).toBe(false);
    expect(healthPending([release(null), release({ Sync: 'Synced', Health: 'Degraded' })])).toBe(false);
    expect(healthPending([release(null), release({ Sync: 'Synced', Health: 'Healthy', Operation: 'Failed' })])).toBe(false);
    // A Space that runs no Release has nothing to report.
    expect(healthPending([null])).toBe(false);
  });
});

test('Spaces still loading is not "No Spaces"', () => {
  expect(kindOf({ spaceIds: [], targets: [], membershipLoaded: false })).toBe('loading');
  expect(kindOf({ spaceIds: [], targets: [], membershipLoaded: true })).toBe('noSpaces');
  // Until membership is in, nothing is offered, whatever Spaces are already listed.
  expect(kindOf({ membershipLoaded: false })).toBe('loading');
});

// ---------------------------------------------------------------------------
// Nothing is said before it is known
// ---------------------------------------------------------------------------

test.describe('before the first gate answer, the card is loading', () => {
  test('a held stage never reads "Ready" before its gates are answered', () => {
    expect(kindOf({ gatesAnswered: false })).toBe('loading');
    expect(kindOf({ gatesAnswered: false, gates: [gate('check/promoted', false, false)] })).toBe('loading');
    expect(kindOf({ gatesAnswered: true })).toBe('ready');
    // Source and aborted say what they are at once; they wait on no gate.
    expect(kindOf({ gatesAnswered: false, isSource: true })).toBe('source');
    expect(kindOf({ gatesAnswered: false, abortedReason: 'x' })).toBe('aborted');
  });

  test('while loading, every gate row is drawn pending', () => {
    expect(sidebarGateFlags(deriveStageCardState(input({ gatesAnswered: false }))).pending).toBe(true);
    expect(sidebarGateFlags(deriveStageCardState(input({}))).pending).toBe(false);
  });
});

test.describe('whether the change has reached the stage before', () => {
  test('decided by that stage’s progress, not by which gate holds this one', () => {
    expect(previousHasChange(undefined)).toBe(true);
    expect(previousHasChange('source')).toBe(true);
    expect(previousHasChange('promoted')).toBe(true);
    expect(previousHasChange('released')).toBe(true);
    for (const verdict of ['gated', 'waiting', 'in-progress', 'restored', 'unknown'] as const) expect(previousHasChange(verdict), verdict).toBe(false);
  });

  test('previousStageOf reads it from the stage before, whatever its gates', () => {
    const detail = (verdict: 'waiting' | 'promoted') => ({
      sequence: { stages: [{ id: 'dev', isSource: false, spaceIds: ['d1'] }, { id: 'prod', isSource: false, spaceIds: ['p1'] }] },
      stageStates: [{ stageId: 'dev', verdict }, { stageId: 'prod', verdict: 'gated' as const }],
      scopedSpaces: null,
    });
    expect(previousStageOf({ previousStageId: 'dev' }, detail('waiting')).previousLanded).toBe(false);
    expect(previousStageOf({ previousStageId: 'dev' }, detail('promoted')).previousLanded).toBe(true);
  });

  test('a stage that holds the change itself never says "Shown once"', () => {
    const base = {
      isSource: false,
      targets: ['p1'],
      fieldCount: 0,
      sameEverywhere: false,
      status: 'resolved' as const,
      groups: [{ unitId: 'u', resourceName: 'api', fieldDiffs: [], written: true, determinable: true }],
      notReachedFrom: { stageId: 'dev', name: 'dev' },
      sourceFieldCount: 3,
      propagation: { quietNotes: [] },
    };
    expect(changeCardModel({ ...base, verdict: 'waiting' }).notice?.kind).toBe('notReached');
    expect(changeCardModel({ ...base, verdict: 'promoted' }).notice?.kind).toBe('nothing');
    expect(changeCardModel({ ...base, verdict: 'in-progress' }).notice?.kind).toBe('nothing');
    // Before its first read settles, it is reading, never "could not be read".
    expect(changeCardModel({ ...base, verdict: 'promoted', status: 'failed', settledOnce: false }).notice?.kind).toBe('reading');
  });
});

test.describe('the Spaces list', () => {
  test('sorted by name', () => {
    const names: Record<string, string> = { s1: 'prod-us-east', s2: 'prod-ap-south', s3: 'prod-eu-west', s4: 'canary-2', s5: 'canary-10' };
    expect(sidebarSpaces(['s1', 's2', 's3', 's5', 's4'], (id) => names[id]).map((s) => s.name)).toEqual([
      'canary-2',
      'canary-10',
      'prod-ap-south',
      'prod-eu-west',
      'prod-us-east',
    ]);
  });

  test('Spaces that landed in a failed promotion are marked Promoted, from the same result', () => {
    const marks = sidebarMarks(new Map(), failure, ['s1', 's2'], new Set());
    expect([...marks]).toEqual([
      ['s1', { kind: 'promoted' }],
      ['s2', { kind: 'failed' }],
    ]);
    // Matched by slug when the result named the Space only by slug.
    const bySlug: StageFailure = { ...failure, failedSpaces: [{ spaceId: '', slug: 'prod-eu', items: [] }] };
    expect(sidebarMarks(new Map(), bySlug, ['s1', 's2'], new Set(), (id) => ({ s2: 'prod-eu' })[id] ?? id).get('s2')).toEqual({ kind: 'failed' });
  });

  test('no "0 Spaces" while the stage’s Spaces are unknown', () => {
    expect(changeScope({ isSource: false, targetCount: 0, sameEverywhere: false })).toEqual([]);
    expect(segmentsText(changeScope({ isSource: false, targetCount: 3, sameEverywhere: false })[0])).toBe('3 Spaces');
  });
});

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

test.describe('copy', () => {
  test('the review sentence names the subject stage as a link when it is another stage', () => {
    const parts = stageCardCopy.review.needs('prod-approval', 1, 'Public', 'promote', { stageId: 'test', name: 'Test' });
    expect(segmentsText(parts)).toBe('prod-approval needs 1 approval of the change in Test before Public can be promoted.');
    expect(parts[0]).toEqual({ kind: 'code', text: 'prod-approval' });
    expect(parts.find((p) => p.kind === 'link')).toEqual({ kind: 'link', text: 'Test', ref: { to: 'stage', stageId: 'test' } });
    expect(segmentsText(stageCardCopy.review.needs('qa', 2, 'Public', 'release'))).toBe('qa needs 2 approvals before Public can be released.');
  });

  test('a differs item links the Space and the field, and handles a one-sided change', () => {
    const space = { spaceId: 's2', name: 'prod-eu' };
    const ref = { unitId: 'u2', path: 'spec.replicas' };
    expect(segmentsText(stageCardCopy.problem.differs(space, 'replicas', ref, '1', '3', '1', '2'))).toBe('prod-eu: replicas goes 1 → 3 here, not 1 → 2.');
    expect(segmentsText(stageCardCopy.problem.differs(space, 'replicas', ref, '1', '3', '', ''))).toBe('prod-eu: replicas goes 1 → 3 here only.');
  });

  test('the request picker carries no hint line', () => {
    expect('requestHint' in stageCardCopy.review).toBe(false);
  });

  test('an approval needs no reason; a rejection does', () => {
    expect(noteRequired('Pass')).toBe(false);
    expect(noteRequired('Fail')).toBe(true);
    expect(stageCardCopy.review.reasonLabel(noteRequired('Pass'))).toBe('Note (optional)');
  });

  test('the copy fixes', () => {
    expect(stageCardCopy.body.gateWait(new Date(2026, 0, 1, 10, 48).getTime())).toMatch(/^Checked .+\.$/);
    expect(segmentsText(stageCardCopy.headline.gateWaiting('released', 'staging', 'check/released'))).toBe('Waiting for staging to be released');
    expect(segmentsText(stageCardCopy.headline.gateWaiting('promoted', 'staging', 'check/promoted'))).toBe('Waiting for staging to be promoted');
    expect(segmentsText(stageCardCopy.headline.gateWaiting('healthy', 'staging', 'check/healthy'))).toBe('Waiting on check/healthy');
    expect(stageCardCopy.body.failedRest(0, 3, 'prod-eu')).toBe('None of the 3 Spaces were written, because prod-eu failed.');
    expect(stageCardCopy.body.failedRest(2, 3, 'prod-eu')).toBe('The other 2 hold the change, not released.');
    expect(stageCardCopy.body.inProgress).toBe('Promote again to finish.');
    expect(stageCardCopy.review.coverageHelp('2 Units')).toBe('Covers 2 Units.');
    expect(
      segmentsText(stageCardCopy.review.needsEach([{ name: 'release-ok', need: 1 }, { name: 'security-review', need: 2 }], 'staging', 'release')),
    ).toBe('release-ok needs 1 approval and security-review needs 2 approvals before staging can be released.');
  });

  test('a failing gate names its Spaces inside the sentence', () => {
    const spaces = [{ spaceId: 'd', name: 'dev' }, { spaceId: 'c', name: 'canary' }];
    expect(segmentsText(stageCardCopy.body.gateReasonIn('A tester has recorded a pass against this Space.', spaces))).toBe(
      'A tester has recorded a pass against this Space (in dev and canary).',
    );
    expect(segmentsText(stageCardCopy.body.gateReasonIn('No pass recorded', spaces.slice(0, 1)))).toBe('No pass recorded (in dev).');
    expect(segmentsText(stageCardCopy.body.gateReasonIn('No pass recorded.', []))).toBe('No pass recorded.');
    expect(stageCardCopy.body.gateReasonIn('x.', spaces)[1]).toMatchObject({ kind: 'link', ref: { to: 'space', spaceId: 'd' } });
  });

  test('the promote button labels', () => {
    expect(stageCardCopy.merge.label('pr', 'Public', false)).toBe('Promote and release to Public');
    expect(stageCardCopy.merge.label('pr', 'Public', true)).toBe('Promote and release to Public anyway…');
    expect(stageCardCopy.merge.shortLabel('p', true)).toBe('Promote anyway…');
    expect(stageCardCopy.merge.shortLabel('pr', true)).toBe('Promote and release anyway…');
    expect(stageCardCopy.merge.otherLabel('p', false)).toBe('Promote only');
    expect(stageCardCopy.merge.otherLabel('p', true)).toBe('Promote only anyway…');
    expect(stageCardCopy.merge.confirm('r', false)).toBe('Confirm release');
    expect(stageCardCopy.headline.promoteFailed(1, 3)).toBe('Promotion failed in 1 of 3 Spaces');
  });
});

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

test.describe('links on the app’s own routes', () => {
  test('Targets: one is an equality, several an IN, through the list’s filterWhere', () => {
    expect(targetsHref([])).toBeNull();
    expect(targetsHref(['t1'])).toBe(`/targets?filterWhere=${encodeURIComponent("TargetID = 't1'")}`);
    expect(targetsHref(['t2', 't1', 't2'])).toBe(`/targets?filterWhere=${encodeURIComponent("TargetID IN ('t1', 't2')")}`);
    expect(stageTargetIds(['s1', 's2', 's3'], (id) => ({ s1: 't1', s2: undefined, s3: 't1' })[id])).toEqual(['t1']);
  });

  test('Spaces by id, Units through the unit detail hrefs, fields into the diff card', () => {
    expect(spaceHref('abc')).toBe('/spaces/abc');
    const resolvers = { hrefForStage: (id: string) => `/change-orders/base/co/${id}`, groupKindOf: () => 'differs' as const };
    expect(hrefOfRef({ to: 'stage', stageId: 'prod' }, resolvers)).toBe('/change-orders/base/co/prod');
    expect(hrefOfRef({ to: 'unit', spaceId: 's', unitId: 'u', tab: 'config' }, resolvers)).toBe('/units/s/u?tab=1');
    expect(hrefOfRef({ to: 'unit', spaceId: 's', unitId: 'u', tab: 'links' }, resolvers)).toBe('/units/s/u?tab=3&linkDirection=from');
    expect(hrefOfRef({ to: 'unit', spaceId: 's', unitId: 'u', tab: 'resources' }, resolvers)).toBe('/units/s/u?tab=5');
    expect(hrefOfRef({ to: 'field', spaceId: 's', unitId: 'u', path: 'spec.replicas' }, resolvers)).toBe('#diff-differs-u');
    expect(diffAnchorId({ groupKind: 'same', unitId: 'u' })).toBe('diff-same-u');
  });

  test('a workflow with no page is a label', () => {
    expect(workflowLink(null, 'No workflow')).toEqual({ href: null, label: 'No workflow' });
    expect(workflowLink('/change-workflows/w1', 'promote-all')).toEqual({ href: '/change-workflows/w1', label: 'promote-all' });
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

test('the stage derivations import no React and no MUI', () => {
  const dir = fileURLToPath(new URL('../src/pages/change-orders/stage/', import.meta.url));
  const files = readdirSync(dir).filter((name) => /^stage[A-Z].*\.ts$/.test(name));
  expect(files.length).toBeGreaterThanOrEqual(8);
  for (const name of files) {
    const source = readFileSync(`${dir}${name}`, 'utf8');
    expect(source, name).not.toMatch(/from ['"](react|react-dom|@mui\/[^'"]+)['"]/);
  }
});
