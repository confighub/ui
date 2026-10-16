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
