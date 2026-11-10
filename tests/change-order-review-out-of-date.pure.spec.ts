// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A viewer's live decision that the server does not count on what a gate reads now
// is out of date: the review asks for a new decision instead of saying "You approved".
// The case from dogfooding: one approval counted for the next stage's entry gate,
// but the stage's release gate, which reads the same Spaces, still needed one.
// No page, no browser.

import { expect, test } from '@playwright/test';
import type { AttestationRead, ChangeWorkflowAttestationPrerequisite, PromoteGateResult } from '@confighub/rtk-query';

import { combineGateReviews, deriveGateReviews, outOfDateDecisions } from '../src/pages/change-orders/reviews/changeOrderReviews';
import {
  NOTHING_SEEN,
  createRowsAskedAt,
  earliestAskedAt,
  finalRowsAskedAt,
  nextSettledStart,
  recordsAheadOfRows,
  recordsSeenAfter,
} from '../src/pages/change-orders/reviews/rowsAskedAt';
import type { DeriveGateReviewsInput, GateReviewSummary, ReviewGateRef } from '../src/pages/change-orders/reviews/changeOrderReviewTypes';

const CO = '84a88ae3-7e18-4735-b33f-84d2f5b1fd25';
const VIEWER = 'f1852ba7-2617-4b19-98b9-36782f621734';
const OTHER = '0f2b1c4e-3a57-4c4e-9a4b-5b1e8f0c2d11';
const STAGING = { spaceId: 'b6a1e3a2-5d55-4b3e-8a8e-2b9f3c3f6a01', spaceSlug: 'staging-use2-confighub-app' };
const NOW = Date.parse('2026-10-14T20:30:00Z');

const DEFINITIONS: ChangeWorkflowAttestationPrerequisite[] = [
  { Name: 'promote-approval', Type: 'Approval', Count: 1 },
  { Name: 'release-approval', Type: 'Approval', Count: 1 },
];

const APPROVAL: AttestationRead = {
  AttestationID: 'dc1f505b-c74c-4c9d-b60f-0a77c0dccbcc',
  UserID: VIEWER,
  Type: 'Approval',
  Result: 'Pass',
  Note: 'DiffLGTM',
  ChangeOrderID: CO,
  CreatedAt: '2026-10-14T20:19:05.839431Z',
  SpaceID: STAGING.spaceId,
  SpaceSlug: STAGING.spaceSlug,
};

const gateRef = (kind: ReviewGateRef['kind'], stageId: string): ReviewGateRef => ({ kind, stageId, stageName: stageId, key: `${kind}:${stageId}` });

interface RowOptions {
  satisfied: boolean;
  revisions: number;
  entries: { id: string; countedOn: number; reason?: string; userId?: string }[];
}

function row(prerequisite: string, { satisfied, revisions, entries }: RowOptions): PromoteGateResult {
  return {
    Prerequisite: prerequisite,
    SpaceID: STAGING.spaceId,
    SpaceSlug: STAGING.spaceSlug,
    Satisfied: satisfied,
    ...(satisfied ? {} : { Reason: 'AttestationsMissing' }),
    Attestation: {
      Type: 'Approval',
      Required: 1,
      Counted: satisfied ? 1 : 0,
      Revisions: revisions,
      SatisfiedRevisions: satisfied ? revisions : 0,
      Attestations: entries.map((entry) => ({
        AttestationID: entry.id,
        UserID: entry.userId ?? VIEWER,
        Result: 'Pass',
        CreatedAt: APPROVAL.CreatedAt,
        CountedOn: entry.countedOn,
        ...(entry.reason ? { Reason: entry.reason } : {}),
      })),
      Caller: { Counts: true },
    },
  };
}

function derive(gate: ReviewGateRef, requirement: string, serverRows: PromoteGateResult[], over: Partial<DeriveGateReviewsInput> = {}): GateReviewSummary {
  const summary = deriveGateReviews({
    gate,
    gateStageName: 'staging',
    gateSpaces: [STAGING],
    requirementNames: [requirement],
    definitions: DEFINITIONS,
    serverRows,
    notEvaluatedBySpaceId: {},
    attestations: [APPROVAL],
    revocations: [],
    users: {},
    groups: {},
    reviewRequests: [],
    requestStage: 'staging',
    viewerUserId: VIEWER,
    attestTarget: { ChangeOrderID: CO, TargetStage: 'staging' },
    now: NOW,
    ...over,
  });
  if (summary === undefined) throw new Error('expected a summary');
  return summary;
}

const releaseGate = gateRef('release', 'staging');
const entryGate = gateRef('entry', 'prod');

test.describe('a decision the server does not count on what a gate reads now', () => {
  test('the release row does not name the approval: out of date for release-approval', () => {
    const s = derive(releaseGate, 'release-approval', [row('release-approval', { satisfied: false, revisions: 2, entries: [] })]);
    const own = s.viewer.ownByType.Approval;
    expect(own?.live).toBe(true);
    expect(own?.notCovering).toEqual(['release-approval']);
    expect(outOfDateDecisions(s).map((d) => d.id)).toEqual([APPROVAL.AttestationID]);
  });

  test('counted on 1 of 2 Revisions: out of date', () => {
    const s = derive(releaseGate, 'release-approval', [
      row('release-approval', { satisfied: false, revisions: 2, entries: [{ id: APPROVAL.AttestationID ?? '', countedOn: 1 }] }),
    ]);
    expect(s.viewer.ownByType.Approval?.notCovering).toEqual(['release-approval']);
  });

  test('counted on every Revision: current', () => {
    const s = derive(releaseGate, 'release-approval', [
      row('release-approval', { satisfied: false, revisions: 2, entries: [{ id: APPROVAL.AttestationID ?? '', countedOn: 2 }] }),
    ]);
    expect(s.viewer.ownByType.Approval?.notCovering).toBeUndefined();
    expect(outOfDateDecisions(s)).toEqual([]);
  });

  test('a row that holds asks for nothing, even without the approval', () => {
    const s = derive(releaseGate, 'release-approval', [
      row('release-approval', { satisfied: true, revisions: 2, entries: [{ id: 'someone-else', countedOn: 2, userId: OTHER }] }),
    ]);
    expect(outOfDateDecisions(s)).toEqual([]);
  });

  test('discarded as Author or NotEligible: other copy explains it, so it is not out of date', () => {
    for (const reason of ['Author', 'NotEligible']) {
      const s = derive(releaseGate, 'release-approval', [
        row('release-approval', { satisfied: false, revisions: 2, entries: [{ id: APPROVAL.AttestationID ?? '', countedOn: 0, reason }] }),
      ]);
      expect(s.viewer.ownByType.Approval?.notCovering, reason).toBeUndefined();
    }
  });

  test('TooOld for its only requirement: expired, so it is no longer the viewer\'s decision', () => {
    const s = derive(releaseGate, 'release-approval', [
      row('release-approval', { satisfied: false, revisions: 1, entries: [{ id: APPROVAL.AttestationID ?? '', countedOn: 0, reason: 'TooOld' }] }),
    ]);
    expect(s.decisions[0]?.expired).toBe(true);
    expect(s.viewer.ownByType.Approval).toBeUndefined();
  });

  test('no server row: not evaluated, so the approval stands', () => {
    const s = derive(releaseGate, 'release-approval', [], { notEvaluatedBySpaceId: { [STAGING.spaceId]: 'noPermission' } });
    expect(s.viewer.ownByType.Approval).toBeDefined();
    expect(outOfDateDecisions(s)).toEqual([]);
  });

  test('one review of two gates: counted for the entry gate, missing for the release gate', () => {
    const release = derive(releaseGate, 'release-approval', [row('release-approval', { satisfied: false, revisions: 2, entries: [] })]);
    const entry = derive(entryGate, 'promote-approval', [
      row('promote-approval', { satisfied: true, revisions: 2, entries: [{ id: APPROVAL.AttestationID ?? '', countedOn: 2 }] }),
    ]);
    expect(outOfDateDecisions(entry)).toEqual([]);
    const combined = combineGateReviews([release, entry]);
    if (combined === undefined) throw new Error('expected a combined review');
    const own = combined.viewer.ownByType.Approval;
    expect(own?.countsToward).toEqual(['promote-approval']);
    expect(own?.notCovering).toEqual(['release-approval']);
    expect(outOfDateDecisions(combined)).toHaveLength(1);
  });
});

test.describe('a row held for a reason no approval can change (the empty-change case)', () => {
  // The change in the Space is empty: the server reads no Revision there and holds the requirement with NotMarked.
  const empty = (): PromoteGateResult => ({
    ...row('promote-approval', { satisfied: false, revisions: 0, entries: [] }),
    Reason: 'NotMarked',
    Message: 'change order has no revisions marked in the space',
  });

  test('not "out of date": the server reason is said instead, in few words', () => {
    const s = derive(entryGate, 'promote-approval', [empty()]);
    expect(s.viewer.ownByType.Approval?.notCovering).toBeUndefined();
    expect(outOfDateDecisions(s)).toEqual([]);
    expect(s.requirements[0]?.heldFor).toEqual({
      spaceSlug: STAGING.spaceSlug,
      spaceSlugs: [STAGING.spaceSlug],
      text: `Nothing in ${STAGING.spaceSlug} to approve for this change.`,
    });
  });

  test('a row that reads Revisions but is held by another code says the server message', () => {
    const other: PromoteGateResult = {
      ...row('promote-approval', { satisfied: false, revisions: 2, entries: [] }),
      Reason: 'ValidationErrors',
      Message: 'Unit app has validation errors',
    };
    const s = derive(entryGate, 'promote-approval', [other]);
    expect(outOfDateDecisions(s)).toEqual([]);
    expect(s.requirements[0]?.heldFor?.text).toBe('Unit app has validation errors');
  });

  test('a row held on approvals is still out of date, and says no held reason', () => {
    const s = derive(entryGate, 'promote-approval', [
      row('promote-approval', { satisfied: false, revisions: 2, entries: [] }),
    ]);
    expect(outOfDateDecisions(s).map((d) => d.id)).toEqual([APPROVAL.AttestationID]);
    expect(s.requirements[0]?.heldFor).toBeUndefined();
  });
});

test('a row with no Revisions count is not read as "nothing to approve"', () => {
  const noCount = row('promote-approval', { satisfied: false, revisions: 2, entries: [] });
  delete (noCount.Attestation as { Revisions?: number }).Revisions;
  const s = derive(entryGate, 'promote-approval', [noCount]);
  expect(s.requirements[0]?.heldFor).toBeUndefined();
});


test.describe('a decision the page read after it last asked the server for the rows', () => {
  const unseen = new Set([APPROVAL.AttestationID ?? '']);
  const staleRows = () => [row('release-approval', { satisfied: false, revisions: 2, entries: [] })];

  test('rows that do not list it yet are older than it: not out of date', () => {
    const s = derive(releaseGate, 'release-approval', staleRows(), { recordsAheadOfRows: unseen });
    expect(s.viewer.ownByType.Approval?.live).toBe(true);
    expect(s.viewer.ownByType.Approval?.notCovering).toBeUndefined();
    expect(outOfDateDecisions(s)).toEqual([]);
  });

  test('once the rows are asked for again and still do not list it, it is out of date', () => {
    const s = derive(releaseGate, 'release-approval', staleRows(), { recordsAheadOfRows: new Set() });
    expect(outOfDateDecisions(s).map((d) => d.id)).toEqual([APPROVAL.AttestationID]);
  });

  test('one record of the call that the rows have not seen holds the whole decision', () => {
    const second: AttestationRead = { ...APPROVAL, AttestationID: 'a-second-space-record', SpaceID: 'second-space', CreatedAt: '2026-10-14T20:19:06.1Z' };
    const s = derive(releaseGate, 'release-approval', staleRows(), {
      attestations: [APPROVAL, second],
      gateSpaces: [STAGING, { spaceId: 'second-space', spaceSlug: 'second' }],
      recordsAheadOfRows: new Set(['a-second-space-record']),
    });
    expect(outOfDateDecisions(s)).toEqual([]);
  });
});

test.describe('which records the rows were asked for before', () => {
  const read = (seen: typeof NOTHING_SEEN, ids: string[], now: number, order = CO, loaded = true) =>
    recordsSeenAfter(seen, order, ids, loaded, now);

  test('a record read after the rows were asked for is ahead of them, until they are asked for again', () => {
    const seen = read(read(NOTHING_SEEN, ['first'], 1_000), ['first', 'second'], 5_000);
    expect(recordsAheadOfRows(seen, 3_000)).toEqual(['second']);
    expect(recordsAheadOfRows(seen, 5_000)).toEqual([]);
    expect(recordsAheadOfRows(seen, 6_000)).toEqual([]);
  });

  test('the records the page opened on are never ahead, and nothing is while no rows were asked for', () => {
    const waiting = read(NOTHING_SEEN, [], 1_000, CO, false);
    const opened = read(waiting, ['first'], 9_000);
    expect(recordsAheadOfRows(opened, 1)).toEqual([]);
    const later = read(opened, ['first', 'second'], 9_500);
    expect(recordsAheadOfRows(later, undefined)).toEqual([]);
  });

  test('a read that adds nothing is the same state, and the input is never changed', () => {
    const seen = read(NOTHING_SEEN, ['first'], 1_000);
    expect(read(seen, ['first'], 2_000)).toBe(seen);
    read(seen, ['first', 'second'], 2_000);
    expect(seen.at.size).toBe(1);
  });

  test('another ChangeOrder starts again', () => {
    const first = read(NOTHING_SEEN, ['first'], 1_000);
    const other = read(read(first, ['x'], 2_000, 'other'), ['x', 'y'], 3_000, 'other');
    expect(recordsAheadOfRows(other, 2_500)).toEqual(['y']);
  });

  test('the earliest of the sources is when the rows were asked for, and a reader is told when it moves', () => {
    const asked = createRowsAskedAt();
    let told = 0;
    asked.subscribe(() => (told += 1));
    asked.set('stages', 5_000);
    asked.set('final', 3_000);
    expect(asked.get()).toBe(3_000);
    asked.set('final', 8_000);
    expect(asked.get()).toBe(5_000);
    asked.set('stages', 5_000);
    expect(told).toBe(3);
    asked.set('final', undefined);
    asked.set('stages', undefined);
    expect(asked.get()).toBeUndefined();
  });
});

test.describe('a source of rows that goes silent', () => {
  const idle = { isUninitialized: false, isFetching: false };

  test('a query that is skipped has no moment, so it cannot hold a record read later', () => {
    // Released everywhere: the Release query is skipped and never asked again.
    const release = nextSettledStart(1_000, { isUninitialized: true, isFetching: false });
    expect(release).toBeUndefined();
    const seen = recordsSeenAfter(recordsSeenAfter(NOTHING_SEEN, CO, ['old'], true, 500), CO, ['old', 'new'], true, 9_000);
    const asked = earliestAskedAt([8_000, release]);
    expect(asked).toBe(8_000);
    expect(recordsAheadOfRows(seen, 10_000)).toEqual([]);
  });

  test('while a query runs again, the start of the one whose data it holds stays', () => {
    expect(nextSettledStart(1_000, { ...idle, isFetching: true, startedTimeStamp: 2_000 })).toBe(1_000);
    expect(nextSettledStart(1_000, { ...idle, startedTimeStamp: 2_000 })).toBe(2_000);
  });

  test('the Final probe stops counting once it is not asked again', () => {
    expect(finalRowsAskedAt(true, false, 4_000)).toBe(4_000);
    expect(finalRowsAskedAt(true, true, 4_000)).toBeUndefined();
    expect(finalRowsAskedAt(false, false, 4_000)).toBeUndefined();
  });

  test('a decision made after a silent source is judged by the sources that still answer', () => {
    const stale = [row('release-approval', { satisfied: false, revisions: 2, entries: [] })];
    // Rows asked for at 8 000; the decision was read at 9 000, after the silent source's old moment (1 000).
    const seen = recordsSeenAfter(recordsSeenAfter(NOTHING_SEEN, CO, [], true, 100), CO, [APPROVAL.AttestationID ?? ''], true, 7_000);
    const ahead = new Set(recordsAheadOfRows(seen, earliestAskedAt([8_000, undefined])));
    const s = derive(releaseGate, 'release-approval', stale, { recordsAheadOfRows: ahead });
    expect(outOfDateDecisions(s).map((d) => d.id)).toEqual([APPROVAL.AttestationID]);
  });
});
