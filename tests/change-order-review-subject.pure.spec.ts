// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What a review is of. A stage's entry gate reads the stage before it, so its
// review is of that stage's change; the first stage's entry gate reads the
// ChangeOrder's own Space. One review serves every gate that reads the same
// Spaces (a stage's release gate and the next stage's entry gate), and never a
// gate that reads others. Counts are of the Units the change changed, and the
// result of a decision is worded from the server's verdicts read after it. No
// page, no browser.

import { expect, test } from '@playwright/test';
import type { AttestationRead, ChangeWorkflowAttestationPrerequisite, PromoteGateResult } from '@confighub/rtk-query';

import { combineGateReviews, deriveGateReviews } from '../src/pages/change-orders/reviews/changeOrderReviews';
import type {
  DeriveGateReviewsInput,
  GateReviewSummary,
  ReviewCoverage,
  ReviewGateRef,
  ReviewUser,
} from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import { gateThing, recordedToastText, reviewCopy, reviewFeeds, reviewSubject, splitAroundStage } from '../src/pages/change-orders/reviews/reviewCopy';
import {
  changedUnitIdsOf,
  markUnchanged,
  reviewCoverageOf,
  reviewUserOf,
  stageChangeLanded,
} from '../src/pages/change-orders/reviews/stageReviewInputs';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const iso = (offset: number) => new Date(NOW + offset).toISOString();

const S1 = { spaceId: 'sp-1', spaceSlug: 'staging-eu' };
const S2 = { spaceId: 'sp-2', spaceSlug: 'staging-us' };
const ENTRY_PROD: ReviewGateRef = { kind: 'entry', stageId: 'prod', stageName: 'prod', key: 'entry:prod' };
const RELEASE_STAGING: ReviewGateRef = { kind: 'release', stageId: 'staging', stageName: 'staging', key: 'release:staging' };
const ENTRY_DEV: ReviewGateRef = { kind: 'entry', stageId: 'dev', stageName: 'dev', key: 'entry:dev' };

const USERS: Record<string, ReviewUser> = Object.fromEntries(
  [
    ['ana', 'Ana Silva'],
    ['bo', 'Bo Chen'],
    ['cy', 'Cy Okafor'],
    ['me', 'Mia Viewer'],
  ].map(([id, name]) => [id, reviewUserOf(id, { DisplayName: name })]),
);

const DEFINITIONS: ChangeWorkflowAttestationPrerequisite[] = [
  { Name: 'sec', Count: 2 },
  { Name: 'release-ok', Count: 1 },
];

function row(name: string, space: typeof S1, counted: number, required: number, over: Partial<PromoteGateResult> = {}): PromoteGateResult {
  return {
    Prerequisite: name,
    SpaceID: space.spaceId,
    SpaceSlug: space.spaceSlug,
    Satisfied: counted >= required,
    ...(counted >= required ? {} : { Reason: 'AttestationsMissing' }),
    Attestation: { Counted: counted, Required: required, Revisions: 1, SatisfiedRevisions: counted >= required ? 1 : 0, Caller: { Counts: true } },
    ...over,
  };
}

function derive(over: Partial<DeriveGateReviewsInput>): GateReviewSummary {
  const summary = deriveGateReviews({
    gate: ENTRY_PROD,
    gateStageName: 'staging',
    gateSpaces: [S1, S2],
    requirementNames: ['sec'],
    definitions: DEFINITIONS,
    serverRows: [],
    notEvaluatedBySpaceId: {},
    attestations: [],
    revocations: [],
    users: USERS,
    groups: {},
    reviewRequests: [],
    requestStage: 'staging',
    viewerUserId: 'me',
    attestTarget: { ChangeOrderID: 'co', TargetStage: 'staging' },
    now: NOW,
    ...over,
  });
  if (summary === undefined) throw new Error('expected a summary');
  return summary;
}

const entryProd = (counted: number, over: Partial<DeriveGateReviewsInput> = {}) =>
  derive({ serverRows: [row('sec', S1, counted, 2), row('sec', S2, counted, 2)], ...over });
const releaseStaging = (counted: number, over: Partial<DeriveGateReviewsInput> = {}) =>
  derive({
    gate: RELEASE_STAGING,
    requirementNames: ['release-ok'],
    serverRows: [row('release-ok', S1, counted, 1), row('release-ok', S2, counted, 1)],
    ...over,
  });
const firstStage = () =>
  derive({
    gate: ENTRY_DEV,
    gateStageName: 'co-space',
    gateSpaces: [{ spaceId: 'sp-base', spaceSlug: 'co-space' }],
    requestStage: '',
    attestTarget: { ChangeOrderID: 'co', WhereSpace: "SpaceID = 'sp-base'" },
  });

// ---------------------------------------------------------------------------

test.describe('what a review is of', () => {
  test('before the change lands in staging, the gate to prod says when it can be reviewed', () => {
    for (const verdict of ['gated', 'waiting'] as const) expect(stageChangeLanded(verdict)).toBe(false);
    for (const verdict of ['in-progress', 'promoted', 'released', 'unknown', undefined] as const) expect(stageChangeLanded(verdict)).toBe(true);
    expect(reviewCopy.entryStatus.notLanded('staging')).toBe(
      'Review opens once staging is promoted.',
    );
  });

  test('the subject is the stage reviewed, or the own Space for the first stage', () => {
    expect(reviewSubject(entryProd(0))).toEqual({ name: 'staging', base: false });
    expect(reviewSubject(firstStage())).toEqual({ name: 'co-space', base: true });
    expect(gateThing(ENTRY_PROD)).toBe('the gate to prod');
    expect(gateThing(RELEASE_STAGING)).toBe('the release in staging');
  });
});

test.describe('one review for the gates that read the same Spaces', () => {
  const records: AttestationRead[] = [
    { AttestationID: 'a1', ChangeOrderID: 'co', UserID: 'ana', Result: 'Pass', Note: 'ok', CreatedAt: iso(-60_000), SpaceID: S1.spaceId },
    { AttestationID: 'a2', ChangeOrderID: 'co', UserID: 'ana', Result: 'Pass', Note: 'ok', CreatedAt: iso(-59_000), SpaceID: S2.spaceId },
  ];
  const entry = () =>
    entryProd(1, {
      attestations: records,
      serverRows: [S1, S2].map((space, i) =>
        row('sec', space, 1, 2, { Attestation: { Counted: 1, Required: 2, Caller: { Counts: true }, Attestations: [{ AttestationID: records[i].AttestationID, UserID: 'ana', Result: 'Pass', CountedOn: 1 }] } }),
      ),
    });
  const release = releaseStaging(1, {
    attestations: records,
    serverRows: [S1, S2].map((space, i) =>
      row('release-ok', space, 1, 1, { Attestation: { Counted: 1, Required: 1, Caller: { Counts: true }, Attestations: [{ AttestationID: records[i].AttestationID, UserID: 'ana', Result: 'Pass', CountedOn: 1 }] } }),
    ),
  });

  test('a release gate and the next entry gate are one review: every requirement, each with its gate, and one decision', () => {
    const combined = combineGateReviews([release, entry()]);
    if (combined === undefined) throw new Error('expected a review');
    expect(reviewFeeds(combined).map((gate) => gate.key)).toEqual(['release:staging', 'entry:prod']);
    expect(combined.requirements.map((r) => [r.name, r.gate.key])).toEqual([
      ['release-ok', 'release:staging'],
      ['sec', 'entry:prod'],
    ]);
    // Both gates read the same records: one decision, counted toward both requirements.
    expect(combined.decisions).toHaveLength(1);
    expect(combined.decisions[0].countsToward.sort()).toEqual(['release-ok', 'sec']);
    // The release is satisfied; the entry gate still needs one: the review is not open.
    expect(combined.open).toBe(false);
    expect(combined.primary?.name).toBe('sec');
    expect(combined.attestTarget).toEqual({ ChangeOrderID: 'co', TargetStage: 'staging' });
    expect(combined.viewer.eligibility).toMatchObject({ kind: 'counts', requirementNames: ['release-ok', 'sec'] });
  });

  test("a combined review keeps both gates' review requests and everyone who can still approve either gate", () => {
    const definitions: ChangeWorkflowAttestationPrerequisite[] = [
      { Name: 'sec', Count: 2, FromUserIDs: ['ana', 'bo'] },
      { Name: 'release-ok', Count: 1, FromUserIDs: ['bo', 'cy'] },
    ];
    const request = (userId: string, at: number) => ({ UserID: userId, Stage: 'staging', RequestedAt: iso(at), RequestedByUserID: 'me' });
    const gateToProd = entryProd(0, { definitions, reviewRequests: [request('ana', -5_000), request('bo', -4_000)] });
    const releaseGate = releaseStaging(0, { definitions, reviewRequests: [request('bo', -4_000), request('cy', -3_000)] });
    const combined = combineGateReviews([releaseGate, gateToProd]);
    if (combined === undefined) throw new Error('expected a review');
    expect(combined.requests.map((r) => [r.user.userId, [...r.gateKeys].sort()])).toEqual([
      ['bo', ['entry:prod', 'release:staging']],
      ['cy', ['release:staging']],
      ['ana', ['entry:prod']],
    ]);
    expect(combined.whoCanStillApprove.map((entry) => entry.person.userId).sort()).toEqual(['ana', 'bo', 'cy']);
    expect(combined.whoCanStillApprove.every((entry) => entry.requested?.user.userId === entry.person.userId)).toBe(true);
  });

  test('a gate that reads other Spaces is never part of the review, nor are its decisions', () => {
    const P1 = { spaceId: 'sp-p1', spaceSlug: 'prod-eu' };
    const releaseProd = derive({
      gate: { kind: 'release', stageId: 'prod', stageName: 'prod', key: 'release:prod' },
      gateStageName: 'prod',
      gateSpaces: [P1],
      requirementNames: ['release-ok'],
      serverRows: [row('release-ok', P1, 0, 1)],
      attestTarget: { ChangeOrderID: 'co', TargetStage: 'prod' },
    });
    const mine: AttestationRead[] = [
      { AttestationID: 'm1', ChangeOrderID: 'co', UserID: 'me', Result: 'Pass', Note: '', CreatedAt: iso(-60_000), SpaceID: S1.spaceId },
      { AttestationID: 'm2', ChangeOrderID: 'co', UserID: 'me', Result: 'Pass', Note: '', CreatedAt: iso(-59_000), SpaceID: S2.spaceId },
    ];
    const gateToProd = entryProd(1, { attestations: mine });
    expect(Object.keys(gateToProd.viewer.ownByType)).toEqual(['Approval']);
    const combined = combineGateReviews([releaseProd, gateToProd]);
    if (combined === undefined) throw new Error('expected a review');
    expect(combined.feeds?.map((gate) => gate.key)).toEqual(['release:prod']);
    expect(combined.requirements.map((r) => r.name)).toEqual(['release-ok']);
    expect(combined.decisions).toEqual([]);
    expect(combined.viewer.ownByType).toEqual({});
  });

  test('a single gate is its own review, counting toward that gate only', () => {
    const one = combineGateReviews([entry()]);
    expect(one?.feeds?.map((gate) => gate.key)).toEqual(['entry:prod']);
    expect(combineGateReviews([])).toBeUndefined();
  });
});

test.describe('only the Units the change changed are counted', () => {
  const coverage: ReviewCoverage = reviewCoverageOf('Approval', {
    Spaces: [
      {
        SpaceID: S1.spaceId,
        SpaceSlug: S1.spaceSlug,
        Subjects: [
          { UnitID: 'u-web', UnitSlug: 'web', RevisionID: 'r1', RevisionNum: 4 },
          { UnitID: 'u-db', UnitSlug: 'db', RevisionID: 'r2', RevisionNum: 2 },
          { UnitID: 'u-new', UnitSlug: 'new', RevisionID: 'r3', RevisionNum: 1 },
        ],
      },
    ],
  }) as ReviewCoverage;
  const tagged = [
    { UnitID: 'u-web', RevisionNum: 3, Tags: { start: 'x' } },
    { UnitID: 'u-web', RevisionNum: 4, Tags: { end: 'x' } },
    { UnitID: 'u-db', RevisionNum: 2, Tags: { start: 'x', end: 'x' } },
    { UnitID: 'u-new', RevisionNum: 1, Tags: { end: 'x' } },
  ];

  test('changed: start and end Tags on different Revisions, or only the end Tag', () => {
    expect([...(changedUnitIdsOf(tagged, 'start', 'end') ?? [])].sort()).toEqual(['u-new', 'u-web']);
    expect(changedUnitIdsOf(undefined, 'start', 'end')).toBeUndefined();
  });

  test('an unchanged Unit is marked for an entry review, and not for one that holds a release', () => {
    const changed = changedUnitIdsOf(tagged, 'start', 'end');
    const marked = markUnchanged(coverage, changed, true);
    expect(marked.covered.map((r) => [r.unitSlug, r.unchanged === true])).toEqual([
      ['web', false],
      ['db', true],
      ['new', false],
    ]);
    expect(markUnchanged(coverage, changed, false).covered.some((r) => r.unchanged)).toBe(false);
    expect(markUnchanged(coverage, undefined, true).covered.some((r) => r.unchanged)).toBe(false);
    expect(reviewCopy.coverage.notChanged).toBe('Not touched by the change.');
  });
});

test.describe('the result of a decision comes from the server', () => {
  test("the server's fresh verdict: the gate to prod opens and prod can be promoted", () => {
    const text = recordedToastText([entryProd(2)], 'staging', 'Pass', () => ({ kind: 'ready' }), true);
    expect(text).toBe('Approval of the change in staging recorded. prod can be promoted.');
  });

  test('still short: the count the server reports, for the gate it holds', () => {
    const text = recordedToastText([releaseStaging(1), entryProd(1)], 'staging', 'Pass', () => undefined, true);
    expect(text).toBe('Approval of the change in staging recorded. staging can be released. sec: 1 of 2 for the gate to prod.');
  });

  test('other gates still hold prod: the reviews are complete, and it says what holds it', () => {
    const text = recordedToastText([entryProd(2)], 'staging', 'Pass', () => ({ kind: 'reviewsComplete', otherGatesHolding: ['Healthy'] }), true);
    expect(text).toBe('Approval of the change in staging recorded. The reviews for prod are complete. Healthy still holds it.');
  });

  test('a rejection the server counts blocks the gate', () => {
    const rejected = entryProd(0, {
      serverRows: [row('sec', S1, 0, 2, { Reason: 'AttestationRejected' }), row('sec', S2, 0, 2, { Reason: 'AttestationRejected' })],
    });
    expect(recordedToastText([rejected], 'staging', 'Fail', () => undefined, true)).toBe(
      'Rejection of the change in staging recorded. The gate to prod is blocked.',
    );
  });

  test('verdicts not read again in time: it says so, and predicts nothing', () => {
    expect(recordedToastText([entryProd(1)], 'staging', 'Pass', () => undefined, false)).toBe(
      'Approval of the change in staging recorded. Gates update on the next check.',
    );
  });

  test('a sentence naming a stage splits around the name and joins back to the same text', () => {
    for (const build of [reviewCopy.entryStatus.waiting, reviewCopy.entryStatus.rejected, reviewCopy.stage.isSatisfiedFor, reviewCopy.stage.reviewIn]) {
      const parts = splitAroundStage(build);
      expect(parts).toHaveLength(2);
      expect(parts.join('staging')).toBe(build('staging'));
    }
  });
});
