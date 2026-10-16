// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Which ChangeOrder and which stage a review belongs to. The history names the
// stage whose change was reviewed, and every gate the decision counts toward. A
// decision made on another ChangeOrder, or outside any, says so: the server
// carries an Attestation forward to a later Revision with the same data, so this
// ChangeOrder's gates can count it. No page, no browser.

import { expect, test } from '@playwright/test';
import type { AttestationRead, ChangeWorkflowAttestationPrerequisite, PromoteGateResult } from '@confighub/rtk-query';

import { combineGateReviews, deriveGateReviews } from '../src/pages/change-orders/reviews/changeOrderReviews';
import { buildReviewHistory } from '../src/pages/change-orders/reviews/reviewHistory';
import type { DeriveGateReviewsInput, GateReviewSummary, ReviewGateRef } from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import type { HistoryPerson } from '../src/pages/change-orders/changeOrderHistory';

const CO = '84a88ae3-7e18-4735-b33f-84d2f5b1fd25';
const ABORTED_CO = '1f0c2a9e-55b1-4d0e-9f53-2c7a3e1b9d40';
const VIEWER = 'f1852ba7-2617-4b19-98b9-36782f621734';
const STAGING = { spaceId: 'b6a1e3a2-5d55-4b3e-8a8e-2b9f3c3f6a01', spaceSlug: 'staging-use2-confighub-app' };
const BASE = { spaceId: 'c0ffee00-5d55-4b3e-8a8e-2b9f3c3f6a02', spaceSlug: 'confighub-app-base' };
const NOW = Date.parse('2026-10-14T20:30:00Z');

const DEFINITIONS: ChangeWorkflowAttestationPrerequisite[] = [
  { Name: 'promote-approval', Type: 'Approval', Count: 1 },
  { Name: 'release-approval', Type: 'Approval', Count: 1 },
];

const record = (id: string, changeOrderId: string | undefined, space = STAGING): AttestationRead => ({
  AttestationID: id,
  UserID: VIEWER,
  Type: 'Approval',
  Result: 'Pass',
  Note: 'DiffLGTM',
  ...(changeOrderId === undefined ? {} : { ChangeOrderID: changeOrderId }),
  CreatedAt: '2026-10-14T20:19:05Z',
  SpaceID: space.spaceId,
  SpaceSlug: space.spaceSlug,
});

const counted = (prerequisite: string, id: string, space = STAGING): PromoteGateResult => ({
  Prerequisite: prerequisite,
  SpaceID: space.spaceId,
  SpaceSlug: space.spaceSlug,
  Satisfied: true,
  Attestation: {
    Type: 'Approval',
    Required: 1,
    Counted: 1,
    Revisions: 1,
    SatisfiedRevisions: 1,
    Attestations: [{ AttestationID: id, UserID: VIEWER, Result: 'Pass', CreatedAt: '2026-10-14T20:19:05Z', CountedOn: 1 }],
    Caller: { Counts: true },
  },
});

const gateRef = (kind: ReviewGateRef['kind'], stageId: string): ReviewGateRef => ({ kind, stageId, stageName: stageId, key: `${kind}:${stageId}` });

function derive(over: Partial<DeriveGateReviewsInput> & Pick<DeriveGateReviewsInput, 'gate' | 'requirementNames'>): GateReviewSummary {
  const summary = deriveGateReviews({
    gateStageName: 'staging',
    gateSpaces: [STAGING],
    definitions: DEFINITIONS,
    serverRows: [],
    notEvaluatedBySpaceId: {},
    attestations: [],
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

const person = (userId: string | undefined): HistoryPerson => ({ key: userId ?? '', name: userId ?? 'nobody', kind: 'user' }) as HistoryPerson;

test.describe('the history names the reviewed stage and every gate', () => {
  test('one approval of staging, read by the release in staging and the gate to prod: one entry, under staging', () => {
    const id = 'dc1f505b-c74c-4c9d-b60f-0a77c0dccbcc';
    const attestations = [record(id, CO)];
    const release = derive({ gate: gateRef('release', 'staging'), requirementNames: ['release-approval'], attestations, serverRows: [counted('release-approval', id)] });
    const entry = derive({ gate: gateRef('entry', 'prod'), requirementNames: ['promote-approval'], attestations, serverRows: [counted('promote-approval', id)] });
    const entries = buildReviewHistory({ summaries: [entry, release], now: NOW, person }).filter((e) => e.reviewKind === 'approved');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ stage: 'staging', reviewedStage: 'staging', reviewedBase: false });
    expect(entries[0].gates).toEqual([
      { kind: 'entry', stage: 'prod' },
      { kind: 'release', stage: 'staging' },
    ]);
    // The combined review reads the same records.
    expect(combineGateReviews([release, entry])?.decisions).toHaveLength(1);
  });

  test("the first stage's entry gate reviews the own Space, which is no stage: filed under the stage entered", () => {
    const id = 'aaaa0000-c74c-4c9d-b60f-0a77c0dccbcc';
    const summary = derive({
      gate: gateRef('entry', 'dev'),
      requirementNames: ['promote-approval'],
      gateStageName: BASE.spaceSlug,
      gateSpaces: [BASE],
      attestations: [record(id, CO, BASE)],
      serverRows: [counted('promote-approval', id, BASE)],
      requestStage: '',
      attestTarget: { ChangeOrderID: CO },
    });
    const [first] = buildReviewHistory({ summaries: [summary], now: NOW, person });
    expect(first).toMatchObject({ stage: 'dev', reviewedStage: BASE.spaceSlug, reviewedBase: true, gates: [{ kind: 'entry', stage: 'dev' }] });
  });
});

test.describe('a decision made elsewhere says where', () => {
  test('on this ChangeOrder: no origin', () => {
    const id = 'bbbb0000-c74c-4c9d-b60f-0a77c0dccbcc';
    const s = derive({ gate: gateRef('release', 'staging'), requirementNames: ['release-approval'], attestations: [record(id, CO)], serverRows: [counted('release-approval', id)] });
    expect(s.decisions[0].origin).toBeUndefined();
  });

  test('on an aborted ChangeOrder, carried forward and counted here: origin other, with its ID', () => {
    const id = 'cccc0000-c74c-4c9d-b60f-0a77c0dccbcc';
    const s = derive({ gate: gateRef('release', 'staging'), requirementNames: ['release-approval'], attestations: [record(id, ABORTED_CO)], serverRows: [counted('release-approval', id)] });
    expect(s.decisions[0]).toMatchObject({ origin: 'other', otherChangeOrderId: ABORTED_CO, countsToward: ['release-approval'] });
    const [first] = buildReviewHistory({ summaries: [s], now: NOW, person });
    expect(first.origin).toBe('other');
  });

  test('outside any ChangeOrder (cub attestation create): origin none', () => {
    const id = 'dddd0000-c74c-4c9d-b60f-0a77c0dccbcc';
    const s = derive({ gate: gateRef('release', 'staging'), requirementNames: ['release-approval'], attestations: [record(id, undefined)], serverRows: [counted('release-approval', id)] });
    expect(s.decisions[0].origin).toBe('none');
    expect(s.decisions[0].otherChangeOrderId).toBeUndefined();
  });
});
