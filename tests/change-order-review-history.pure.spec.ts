// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Review events in the ChangeOrder History card (`reviews/reviewHistory.ts`),
// from summaries derived on recorded #5788 responses, and how the history
// filters treat them (`changeOrderHistory.ts`): the revoker, expiry at the
// server's ValidUntil per requirement, blocksPromotion from server counting,
// and "requested" only from real review requests. No page, no browser.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { expect, test } from '@playwright/test';
import type { AttestationRead, ChangeOrderReviewRequestRead, PromoteGateResult } from '@confighub/rtk-query';

import { deriveGateReviews } from '../src/pages/change-orders/reviews/changeOrderReviews';
import type { DeriveGateReviewsInput, GateReviewSummary, ReviewUser } from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import { buildReviewHistory, reviewHistoryUserIds } from '../src/pages/change-orders/reviews/reviewHistory';
import { reviewUserOf } from '../src/pages/change-orders/reviews/stageReviewInputs';
import {
  HISTORY_KINDS,
  NO_FILTERS,
  isException,
  kindTallies,
  matchesFilters,
  matchesKind,
  resolvePerson,
  summariseDay,
  type HistoryActionEntry,
  type HistoryEntry,
} from '../src/pages/change-orders/changeOrderHistory';

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/reviews/${name}.json`, import.meta.url)), 'utf8')) as T;

const CO = '9c13c584-f6b0-4969-97a0-9a823fda099b';
const E2E = '5e2f5cdd-e4b4-4e93-9099-df5869ae09be';
const BOT = '9bf2f9ed-ae7b-4627-b6d1-d0e3eca98be1';
const PROD = { spaceId: '22dd969e-e7af-4abe-a4b9-74f2fba3f6a3', spaceSlug: 'v5788-prod' };
const BASE = { spaceId: 'ff5afbb8-c130-4b9f-ade5-af6a80303eaa', spaceSlug: 'v5788-base' };
const NOW = Date.parse('2026-10-14T10:00:00Z');
const USERS: Record<string, ReviewUser> = {
  [E2E]: reviewUserOf(E2E, { DisplayName: 'E2E Tester' }),
  [BOT]: reviewUserOf(BOT, { DisplayName: 'Reviewer Bot' }),
};
const RECORDS = load<{ Attestation: AttestationRead }[]>('10-attestations-co').map((row) => row.Attestation);
const RELEASE_ROWS = load<{ Gates: PromoteGateResult[] }>('7-release-prod-satisfied-e2e').Gates;
const DEV_ROWS = load<{ Stages: { Gates: PromoteGateResult[] }[] }>('3-promote-dev-satisfied-e2e').Stages[0].Gates;
const REQUESTS = load<{ ReviewRequests: ChangeOrderReviewRequestRead[] }>('8-patch-review-request-e2e').ReviewRequests;
/** The approval carried forward from co1 that the release rows name. */
const CARRIED: AttestationRead = {
  AttestationID: 'a72728e4-ad60-4ff4-9c19-8aab0bf0b507',
  UserID: E2E,
  Result: 'Pass',
  Note: 'co1 release',
  CreatedAt: '2026-10-14T08:14:44.56026Z',
  SpaceID: PROD.spaceId,
};

function release(over: Partial<DeriveGateReviewsInput> = {}): GateReviewSummary {
  const s = deriveGateReviews({
    gate: { kind: 'release', stageId: 'prod', stageName: 'prod', key: 'release:prod' },
    gateStageName: 'prod',
    gateSpaces: [PROD],
    requirementNames: ['release-ok'],
    definitions: [{ Name: 'release-ok', AllowAuthors: true, MaxAge: '1h' }],
    serverRows: RELEASE_ROWS,
    notEvaluatedBySpaceId: {},
    attestations: [...RECORDS.filter((r) => !r.RevokedAttestationID), CARRIED],
    revocations: [],
    users: USERS,
    groups: {},
    reviewRequests: REQUESTS,
    requestStage: 'prod',
    viewerUserId: E2E,
    attestTarget: { ChangeOrderID: CO, TargetStage: 'prod' },
    now: NOW,
    ...over,
  });
  if (s === undefined) throw new Error('expected a summary');
  return s;
}
const historyPerson = (userId: string | undefined) =>
  resolvePerson(userId, new Map(Object.values(USERS).map((u) => [u.userId, { UserID: u.userId, DisplayName: u.name }])), undefined);
const build = (...summaries: GateReviewSummary[]) => buildReviewHistory({ summaries, now: NOW, person: historyPerson });

test('approved entries come from decisions, with the gate kind, Type and note', () => {
  const approved = build(release()).filter((e) => e.reviewKind === 'approved');
  expect(approved.map((e) => [e.userId, e.gateKind, e.type])).toContainEqual([E2E, 'release', 'Approval']);
  expect(approved.find((e) => e.note === 'prod is fine')).toBeDefined();
});

test('expired at the server ValidUntil of the requirement (MaxAge 1h), not invented', () => {
  // Both of e2e's release approvals are past CreatedAt + 1h at 10:00: one event each, at the server's ValidUntil.
  const expired = build(release()).filter((e) => e.reviewKind === 'expired');
  expect(expired.map((e) => [e.at, e.requirementNames, e.userId])).toEqual([
    [Date.parse('2026-10-14T09:27:47.517086Z'), ['release-ok'], E2E],
    [Date.parse('2026-10-14T09:14:44.56026Z'), ['release-ok'], E2E],
  ]);
  // Before either ValidUntil, there is no expiry.
  expect(buildReviewHistory({ summaries: [release()], now: Date.parse('2026-10-14T09:00:00Z'), person: historyPerson }).some((e) => e.reviewKind === 'expired')).toBe(false);
});

test('requested: from the real request, by the requester, of the requested user', () => {
  const [requested] = build(release()).filter((e) => e.reviewKind === 'requested');
  expect(requested).toMatchObject({
    at: Date.parse('2026-10-14T08:28:16.929646Z'),
    userId: E2E,
    stage: 'prod',
    gateKind: 'release',
  });
  expect(requested.person.name).toBe('E2E Tester');
  expect(requested.requestedOf?.name).toBe('Reviewer Bot');
});

test('no request, no requested event', () => {
  expect(build(release({ reviewRequests: [] })).some((e) => e.reviewKind === 'requested')).toBe(false);
});

test('revoked names the revoker and whose decision it was', () => {
  const s = deriveGateReviews({
    gate: { kind: 'entry', stageId: 'dev', stageName: 'dev', key: 'entry:dev' },
    gateStageName: 'v5788-base',
    gateSpaces: [BASE],
    requirementNames: ['first-review'],
    definitions: [{ Name: 'first-review' }],
    serverRows: DEV_ROWS,
    notEvaluatedBySpaceId: {},
    attestations: RECORDS.filter((r) => !r.RevokedAttestationID),
    revocations: RECORDS.filter((r) => r.RevokedAttestationID),
    users: USERS,
    groups: {},
    reviewRequests: [],
    requestStage: '',
    attestTarget: { ChangeOrderID: CO },
    now: NOW,
  });
  if (s === undefined) throw new Error('expected a summary');
  const revoked = build(s).find((e) => e.reviewKind === 'revoked');
  expect(revoked?.userId).toBe(BOT);
  expect(revoked?.originalPerson?.name).toBe('Reviewer Bot');
});

test('a counted Fail blocks; a FailIgnored one does not', () => {
  const fail: AttestationRead = { AttestationID: 'fail-1', UserID: BOT, Result: 'Fail', Note: 'no', CreatedAt: '2026-10-14T09:30:00Z', SpaceID: PROD.spaceId };
  const withEntry = (entry: Record<string, unknown>) =>
    RELEASE_ROWS.map((row) => (row.Attestation ? { ...row, Attestation: { ...row.Attestation, Attestations: [...(row.Attestation.Attestations ?? []), entry] } } : row));
  const counted = build(release({ serverRows: withEntry({ AttestationID: 'fail-1', UserID: BOT, Result: 'Fail', CountedOn: 1 }), attestations: [...RECORDS, CARRIED, fail] }));
  expect(counted.find((e) => e.id === 'review-fail-1')?.blocksPromotion).toBe(true);
  const ignored = build(
    release({ serverRows: withEntry({ AttestationID: 'fail-1', UserID: BOT, Result: 'Fail', CountedOn: 0, Reason: 'FailIgnored' }), attestations: [...RECORDS, CARRIED, fail] }),
  );
  expect(ignored.find((e) => e.id === 'review-fail-1')?.blocksPromotion).toBe(false);
});

test('one request on two gates is one event', () => {
  const final = release({ gate: { kind: 'final', stageId: 'prod', stageName: 'prod', key: 'final:prod' } });
  expect(build(release(), final).filter((e) => e.reviewKind === 'requested')).toHaveLength(1);
});

test('reviewHistoryUserIds lists attesters, revokers, requesters and the requested', () => {
  expect(reviewHistoryUserIds([release()]).sort()).toEqual([E2E, BOT].sort());
});

test.describe('history filters with review entries', () => {
  const reviews = build(release());
  const action: HistoryActionEntry = {
    kind: 'action',
    id: 'action-0',
    at: NOW - 5 * 3_600_000,
    person: historyPerson(E2E),
    stage: 'dev',
    promotion: { Stage: 'dev', PromotedAt: new Date(NOW - 5 * 3_600_000).toISOString(), SpaceIDs: ['sp-1'] },
  };
  const entries: HistoryEntry[] = [...reviews, action];

  test('matchesKind reviews is true for review entries only; tallies and stage filter', () => {
    for (const entry of reviews) {
      expect(matchesKind(entry, 'reviews')).toBe(true);
      expect(isException(entry)).toBe(false);
    }
    expect(matchesKind(action, 'reviews')).toBe(false);
    expect(HISTORY_KINDS).toContain('reviews');
    expect(kindTallies(entries, NO_FILTERS).reviews).toBe(reviews.length);
    expect(entries.filter((e) => matchesFilters(e, { ...NO_FILTERS, stage: 'prod' }))).toHaveLength(reviews.length);
    const day = summariseDay({ key: '2026-10-14', at: NOW, entries });
    expect(day.reviews).toBe(reviews.length);
    expect(day.promotions).toBe(1);
  });
});
