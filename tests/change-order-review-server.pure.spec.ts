// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Reviews from the server's own gate results (#5788), on REAL responses
// recorded from a #5788 server (`fixtures/reviews/*.json`, change order co2:
// dev → prod; `first-review` on the own Space, `reviewed` on prod entry,
// `release-ok` on prod release, `final-two` on Final). The client counts
// nothing: counts, authors, discard reasons, validity and the caller's
// eligibility are the server's. No page, no browser.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { expect, test } from '@playwright/test';
import type {
  AttestationRead,
  ChangeOrderReviewRequestRead,
  ChangeWorkflowAttestationPrerequisite,
  ChangeWorkflowSpec,
  PromoteGateResult,
} from '@confighub/rtk-query';

import { deriveGateReviews } from '../src/pages/change-orders/reviews/changeOrderReviews';
import type {
  DeriveGateReviewsInput,
  GateReviewSummary,
  ReviewGateRef,
  ReviewUser,
} from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import {
  answerOf,
  attestDryRuns,
  changeReviewRequests,
  promoteDryRun,
  recordAttestation,
  releaseDryRuns,
  revokeAttestation,
  type Send,
} from '../src/pages/change-orders/reviews/quietServerCalls';
import {
  ownLiveRejections,
  promoteFinalOf,
  releaseAnswerOf,
  REPLACED_NOTE,
  revocationBody,
  reviewCoverageOf,
  reviewRequestsPatch,
  reviewUserOf,
  WITHDRAWN_NOTE,
} from '../src/pages/change-orders/reviews/stageReviewInputs';

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/reviews/${name}.json`, import.meta.url)), 'utf8')) as T;

interface PromoteBody {
  Stages?: { Name?: string; Gates?: PromoteGateResult[] }[];
  Complete?: boolean;
  Final?: PromoteGateResult[];
}

const CO = '9c13c584-f6b0-4969-97a0-9a823fda099b';
const E2E = '5e2f5cdd-e4b4-4e93-9099-df5869ae09be';
const BOT = '9bf2f9ed-ae7b-4627-b6d1-d0e3eca98be1';
const BASE = { spaceId: 'ff5afbb8-c130-4b9f-ade5-af6a80303eaa', spaceSlug: 'v5788-base' };
const DEV = { spaceId: 'af7a4a7b-6c67-45a8-8a5e-958fdf6112c5', spaceSlug: 'v5788-dev' };
const PROD = { spaceId: '22dd969e-e7af-4abe-a4b9-74f2fba3f6a3', spaceSlug: 'v5788-prod' };
const NOW = Date.parse('2026-10-14T08:30:00Z');

const ORDER = load<{ ChangeOrder: { ChangeWorkflow: ChangeWorkflowSpec; ReviewRequests?: ChangeOrderReviewRequestRead[] } }[]>(
  '10-change-order',
)[0].ChangeOrder;
const DEFINITIONS: ChangeWorkflowAttestationPrerequisite[] = ORDER.ChangeWorkflow.AttestationPrerequisites ?? [];
const USERS: Record<string, ReviewUser> = {
  [E2E]: reviewUserOf(E2E, { DisplayName: 'E2E Tester' }),
  [BOT]: reviewUserOf(BOT, { DisplayName: 'e2e-reviewer-bot (Service Account)' }),
};
/** This change order's records, and the CLI approval (no ChangeOrderID) the server counts. */
const CO_RECORDS = load<{ Attestation: AttestationRead }[]>('10-attestations-co').map((row) => row.Attestation);
const CLI_APPROVAL: AttestationRead = {
  AttestationID: '111fa10f-1c11-4940-8d9a-54454f8748fa',
  UserID: E2E,
  Result: 'Pass',
  Note: 'cli approval',
  CreatedAt: '2026-10-14T08:27:19.467612Z',
  SpaceID: BASE.spaceId,
  SpaceSlug: BASE.spaceSlug,
};
const RECORDS = [...CO_RECORDS.filter((r) => !r.RevokedAttestationID), CLI_APPROVAL];
const REVOCATIONS = CO_RECORDS.filter((r) => r.RevokedAttestationID);

const gateRef = (kind: ReviewGateRef['kind'], stageId: string): ReviewGateRef => ({ kind, stageId, stageName: stageId, key: `${kind}:${stageId}` });
const rowsOf = (file: string) => load<PromoteBody>(file).Stages?.[0]?.Gates ?? [];

function derive(over: Partial<DeriveGateReviewsInput>): GateReviewSummary {
  const summary = deriveGateReviews({
    gate: gateRef('entry', 'dev'),
    gateStageName: 'v5788-base',
    gateSpaces: [BASE],
    requirementNames: ['first-review'],
    definitions: DEFINITIONS,
    serverRows: [],
    notEvaluatedBySpaceId: {},
    attestations: RECORDS,
    revocations: [],
    users: USERS,
    groups: {},
    reviewRequests: [],
    requestStage: '',
    viewerUserId: E2E,
    attestTarget: { ChangeOrderID: CO, WhereSpace: `SpaceID = '${BASE.spaceId}'` },
    now: NOW,
    ...over,
  });
  if (summary === undefined) throw new Error('expected a summary');
  return summary;
}
const withUsers = (fromUserIds: string[]) =>
  DEFINITIONS.map((d) => (d.Name === 'first-review' ? { ...d, FromUserIDs: fromUserIds } : d));

// ---------------------------------------------------------------------------

test.describe('entry gate over the own Space (first stage)', () => {
  test('pending: AttestationsMissing, 0 of 1, the bot is the author of the unsatisfied Revision', () => {
    const s = derive({ serverRows: rowsOf('1-promote-dev-pending-e2e') });
    const r = s.requirements[0];
    expect(r).toMatchObject({ evaluated: true, passes: 0, required: 1, need: 1, satisfied: false, rejected: false });
    expect(r.perSpace[0]).toMatchObject({
      evaluated: true,
      satisfied: false,
      reason: 'AttestationsMissing',
      counted: 0,
      revisions: 1,
      satisfiedRevisions: 0,
      truncated: false,
    });
    expect(r.perSpace[0].authors.map((p) => p.userId)).toEqual([BOT]);
    expect(r.perSpace[0].unsatisfied).toEqual([
      { unitSlug: 'web', revisionNum: 4, counted: 0, reason: 'AttestationsMissing', authors: [expect.objectContaining({ userId: BOT })] },
    ]);
    expect(r.viewer).toEqual({ kind: 'counts' });
    expect(s.viewer.eligibility).toEqual({ kind: 'counts', types: ['Approval'], requirementNames: ['first-review'] });
    expect(s.state).toBe('pending');
    expect(s.evaluated).toBe(true);
  });

  test('who can still approve leaves out the server-named author', () => {
    const s = derive({ serverRows: rowsOf('1-promote-dev-pending-e2e'), definitions: withUsers([E2E, BOT]) });
    expect(s.whoCanStillApprove.map((w) => w.person.userId)).toEqual([E2E]);
  });

  test('the same row for the bot: Caller Author, 1 of 1 Revisions', () => {
    const s = derive({ serverRows: rowsOf('1-promote-dev-pending-bot'), viewerUserId: BOT });
    expect(s.requirements[0].viewer).toEqual({
      kind: 'author',
      authorIn: [{ spaceSlug: 'v5788-base', authoredRevisions: 1, revisions: 1 }],
    });
    expect(s.viewer.eligibility).toEqual({ kind: 'author', authorIn: ['v5788-base'] });
  });

  test("the bot's approval is discarded as Author; the server says so per decision", () => {
    const s = derive({ serverRows: rowsOf('2-promote-dev-author-entry-e2e') });
    const bot = s.decisions.find((d) => d.person.userId === BOT && d.spaceSlugs.includes('v5788-base'));
    expect(bot?.byRequirement['first-review']).toEqual({ countedOn: 0, reason: 'Author' });
    expect(bot?.countsToward).toEqual([]);
  });

  test('satisfied: the CLI approval with no change order counts; passers come from the server', () => {
    const s = derive({ serverRows: rowsOf('3-promote-dev-satisfied-e2e') });
    const r = s.requirements[0];
    expect(r).toMatchObject({ satisfied: true, passes: 1, need: 0 });
    expect(r.passers.map((p) => p.userId)).toEqual([E2E]);
    const cli = s.decisions.find((d) => d.attestationIds.includes(CLI_APPROVAL.AttestationID ?? ''));
    expect(cli?.byRequirement['first-review']).toEqual({ countedOn: 1 });
    expect(cli?.countsToward).toEqual(['first-review']);
    expect(s.state).toBe('satisfied');
    expect(s.open).toBe(true);
  });

  test('a satisfied Space lists no authors, but the bot is still an author: taken from Caller', () => {
    const s = derive({ serverRows: rowsOf('3-promote-dev-satisfied-bot'), viewerUserId: BOT });
    expect(s.requirements[0].perSpace[0].authors).toEqual([]);
    expect(s.requirements[0].viewer.kind).toBe('author');
  });

  test('two Spaces, one Counts and one Author: partial', () => {
    const counts = rowsOf('3-promote-dev-satisfied-e2e').map((row) => ({ ...row, SpaceID: DEV.spaceId, SpaceSlug: DEV.spaceSlug }));
    const s = derive({ gateSpaces: [BASE, DEV], serverRows: [...rowsOf('3-promote-dev-satisfied-bot'), ...counts], viewerUserId: BOT });
    expect(s.requirements[0].viewer).toEqual({
      kind: 'partial',
      countsIn: ['v5788-dev'],
      authorIn: [{ spaceSlug: 'v5788-base', authoredRevisions: 1, revisions: 1 }],
    });
    expect(s.viewer.eligibility).toEqual({ kind: 'partial', types: ['Approval'], requirementNames: ['first-review'], authorIn: ['v5788-base'] });
  });

  test('Caller NotEligible: notEligible', () => {
    const rows = rowsOf('1-promote-dev-pending-e2e').map((row) =>
      row.Attestation ? { ...row, Attestation: { ...row.Attestation, Caller: { Counts: false, Reason: 'NotEligible' } } } : row,
    );
    const s = derive({ serverRows: rows });
    expect(s.requirements[0].viewer).toEqual({ kind: 'notEligible' });
    expect(s.viewer.eligibility).toEqual({ kind: 'notEligible', requirementNames: ['first-review'] });
  });

  test('no server row (no permission): not evaluated, no count, decisions still listed, may decide', () => {
    const s = derive({ serverRows: [], notEvaluatedBySpaceId: { [BASE.spaceId]: 'noPermission' } });
    const r = s.requirements[0];
    expect(r).toMatchObject({ evaluated: false, notEvaluated: 'noPermission', passes: 0, need: 0, satisfied: false });
    expect(r.perSpace[0]).toMatchObject({ evaluated: false, notEvaluated: 'noPermission' });
    expect(r.viewer).toEqual({ kind: 'notEvaluated', why: 'noPermission', mayDecide: true });
    expect(s.viewer.eligibility).toEqual({
      kind: 'notEvaluated',
      why: 'noPermission',
      mayDecide: true,
      types: ['Approval'],
      requirementNames: ['first-review'],
    });
    expect(s.state).toBe('none');
    expect(s.evaluated).toBe(false);
    expect(s.open).toBe(false);
    expect(s.decisions.length).toBeGreaterThan(0);
    const restricted = derive({ serverRows: [], notEvaluatedBySpaceId: { [BASE.spaceId]: 'noPermission' }, definitions: withUsers([BOT]) });
    expect(restricted.requirements[0].viewer).toEqual({ kind: 'notEvaluated', why: 'noPermission', mayDecide: false });
  });
});

// ---------------------------------------------------------------------------

test.describe('discards, revocation and rejection', () => {
  const satisfiedRows = rowsOf('3-promote-dev-satisfied-e2e');
  const withEntry = (patch: Record<string, unknown>) =>
    satisfiedRows.map((row) =>
      row.Attestation
        ? {
            ...row,
            Attestation: {
              ...row.Attestation,
              Attestations: row.Attestation.Attestations?.map((e) => (e.AttestationID === CLI_APPROVAL.AttestationID ? { ...e, ...patch } : e)),
            },
          }
        : row,
    );

  test('TooOld for one requirement but counted for another with a later ValidUntil: not expired', () => {
    const tooOld = withEntry({ CountedOn: 0, Reason: 'TooOld', ValidUntil: '2026-10-14T08:28:00Z' });
    const other = satisfiedRows.map((row) => ({ ...row, Prerequisite: row.Prerequisite === 'first-review' ? 'second' : row.Prerequisite }));
    const s = derive({
      requirementNames: ['first-review', 'second'],
      definitions: [...DEFINITIONS, { Name: 'second' }],
      serverRows: [...tooOld, ...other],
    });
    const cli = s.decisions.find((d) => d.attestationIds.includes(CLI_APPROVAL.AttestationID ?? ''));
    expect(cli?.byRequirement).toEqual({
      'first-review': { countedOn: 0, reason: 'TooOld', validUntil: '2026-10-14T08:28:00Z' },
      second: { countedOn: 1 },
    });
    expect(cli?.expired).toBe(false);
    expect(cli?.live).toBe(true);
  });

  test('Expired or TooOld for every requirement: expired, not live', () => {
    const s = derive({ serverRows: withEntry({ CountedOn: 0, Reason: 'Expired', ValidUntil: '2026-10-14T08:28:00Z' }) });
    const cli = s.decisions.find((d) => d.attestationIds.includes(CLI_APPROVAL.AttestationID ?? ''));
    expect(cli).toMatchObject({ expired: true, live: false });
  });

  test('a revoked decision names the revoker from the revocation record', () => {
    const s = derive({ serverRows: rowsOf('3-promote-dev-satisfied-e2e'), revocations: REVOCATIONS });
    const revoked = s.decisions.find((d) => d.attestationIds.includes('4499cc0a-e41f-4ca5-a0c4-ae4aa229de6f'));
    expect(revoked?.revokedBy?.userId).toBe(BOT);
    expect(revoked?.live).toBe(false);
  });

  test('AttestationRejected: rejected; rejecters are counted Fails; FailIgnored blocks nobody', () => {
    const fail: AttestationRead = { ...CLI_APPROVAL, AttestationID: 'fail-1', UserID: BOT, Result: 'Fail', Note: 'no' };
    const rejectedRows = satisfiedRows.map((row) =>
      row.Attestation
        ? {
            ...row,
            Satisfied: false,
            Reason: 'AttestationRejected',
            Attestation: {
              ...row.Attestation,
              Attestations: [...(row.Attestation.Attestations ?? []), { AttestationID: 'fail-1', UserID: BOT, Result: 'Fail', CountedOn: 1 }],
            },
          }
        : row,
    );
    const s = derive({ serverRows: rejectedRows, attestations: [...RECORDS, fail] });
    expect(s.requirements[0].rejected).toBe(true);
    expect(s.requirements[0].rejecters.map((p) => p.userId)).toEqual([BOT]);
    expect(s.state).toBe('rejected');
    expect(s.decisions.find((d) => d.id === 'fail-1')?.blocksPromotion).toBe(true);

    const ignoredRows = satisfiedRows.map((row) =>
      row.Attestation
        ? {
            ...row,
            Attestation: {
              ...row.Attestation,
              Attestations: [...(row.Attestation.Attestations ?? []), { AttestationID: 'fail-1', UserID: BOT, Result: 'Fail', CountedOn: 0, Reason: 'FailIgnored' }],
            },
          }
        : row,
    );
    const ignored = derive({ serverRows: ignoredRows, attestations: [...RECORDS, fail] });
    expect(ignored.requirements[0].rejecters).toEqual([]);
    expect(ignored.decisions.find((d) => d.id === 'fail-1')?.blocksPromotion).toBe(false);
  });

  test('Truncated is kept; an unknown gate code is kept with the server message', () => {
    const rows = rowsOf('1-promote-dev-pending-e2e').map((row) =>
      row.Attestation ? { ...row, Reason: 'SomethingNew', Attestation: { ...row.Attestation, Truncated: true } } : row,
    );
    const space = derive({ serverRows: rows }).requirements[0].perSpace[0];
    expect(space.truncated).toBe(true);
    expect(space.reason).toBe('SomethingNew');
    expect(space.message).toContain('requires first-review');
  });
});

// ---------------------------------------------------------------------------

test.describe('release gate from the Release dry run (no text parse)', () => {
  const release = (answer: ReturnType<typeof releaseAnswerOf>) =>
    derive({
      gate: gateRef('release', 'prod'),
      gateStageName: 'prod',
      gateSpaces: [PROD],
      requirementNames: ['release-ok'],
      requestStage: 'prod',
      serverRows: 'rows' in answer ? answer.rows : [],
      notEvaluatedBySpaceId: 'notEvaluated' in answer ? { [PROD.spaceId]: answer.notEvaluated } : {},
    });

  test('422 with Gates: unsatisfied, 1 of 2 Revisions satisfied', () => {
    const r = release(releaseAnswerOf({ status: 422, body: load('6-release-prod-refused-e2e') })).requirements[0];
    expect(r).toMatchObject({ evaluated: true, satisfied: false, passes: 0, required: 1 });
    expect(r.perSpace[0]).toMatchObject({ revisions: 2, satisfiedRevisions: 1, reason: 'AttestationsMissing' });
  });
  test('200 with Gates: satisfied, valid until the requirement MaxAge', () => {
    const r = release(releaseAnswerOf({ status: 200, body: load('7-release-prod-satisfied-e2e') })).requirements[0];
    expect(r).toMatchObject({ evaluated: true, satisfied: true, passes: 1 });
    expect(r.validUntil).toBe('2026-10-14T09:14:44.56026Z');
  });
  test('200 without Gates: unchanged; 403: noPermission; 422 with text and no Gates: error', () => {
    expect(releaseAnswerOf({ status: 200, body: { Release: {} } })).toEqual({ notEvaluated: 'unchanged' });
    expect(releaseAnswerOf({ status: 403, body: { message: 'forbidden' } })).toEqual({ notEvaluated: 'noPermission' });
    expect(
      releaseAnswerOf({ status: 422, body: { message: "unable to publish: requires release-ok: 1 Approval attestation(s)" } }),
    ).toEqual({ notEvaluated: 'error' });
  });
});

test.describe('Final from PromoteResult.Final', () => {
  test('Complete with Final rows: the final gate is evaluated, 1 of 2', () => {
    const answer = promoteFinalOf({ status: 200, body: load('7-promote-next-final-partial-e2e') });
    expect(answer.kind).toBe('open');
    const s = derive({
      gate: gateRef('final', 'prod'),
      gateStageName: 'prod',
      gateSpaces: [PROD],
      requirementNames: ['final-two'],
      requestStage: 'prod',
      serverRows: answer.kind === 'open' ? answer.rows : [],
    });
    expect(s.requirements[0]).toMatchObject({ evaluated: true, passes: 1, required: 2, need: 1 });
  });
  test('no Complete: not open; the completed refusal: completed; 403: noPermission', () => {
    expect(promoteFinalOf({ status: 200, body: { Stages: [] } })).toEqual({ kind: 'notOpen' });
    expect(promoteFinalOf({ status: 400, body: load('11-promote-completed-refusal-e2e') })).toEqual({ kind: 'completed' });
    expect(promoteFinalOf({ status: 403, body: {} })).toEqual({ kind: 'noPermission' });
    expect(promoteFinalOf({ status: 500, body: {} })).toEqual({ kind: 'error' });
  });
  test('a completed workflow satisfies Final without rows', () => {
    const s = derive({
      gate: gateRef('final', 'prod'),
      gateSpaces: [PROD],
      requirementNames: ['final-two'],
      requestStage: 'prod',
      completed: true,
    });
    expect(s.requirements[0]).toMatchObject({ satisfied: true, evaluated: true });
    expect(s.open).toBe(true);
  });
});

// ---------------------------------------------------------------------------

test.describe('review requests', () => {
  const requests = load<{ ReviewRequests: ChangeOrderReviewRequestRead[] }>('8-patch-review-request-e2e').ReviewRequests;

  test('a request for prod is on the gates that attest in prod, with the real waiting time', () => {
    const s = derive({
      gate: gateRef('release', 'prod'),
      gateSpaces: [PROD],
      requirementNames: ['release-ok'],
      requestStage: 'prod',
      reviewRequests: requests,
      viewerUserId: BOT,
    });
    expect(s.requests).toEqual([
      {
        stage: 'prod',
        gateKeys: ['release:prod'],
        user: expect.objectContaining({ userId: BOT, isYou: true }),
        requestedAt: '2026-10-14T08:28:16.929646Z',
        requestedBy: expect.objectContaining({ userId: E2E }),
        reviewed: false,
      },
    ]);
    expect(s.requestedOfViewer?.user.userId).toBe(BOT);
    expect(s).toMatchObject({ waitingSince: '2026-10-14T08:28:16.929646Z', waitingSinceSource: 'reviewRequest' });
  });

  test('no request for the gate: waiting since the last promotion', () => {
    const s = derive({ reviewRequests: requests, lastPromotionAt: '2026-10-14T08:20:00Z' });
    expect(s.requests).toEqual([]);
    expect(s).toMatchObject({ waitingSince: '2026-10-14T08:20:00Z', waitingSinceSource: 'promotion' });
  });

  test('reviewed when the requested user has a live decision in the gate Spaces', () => {
    const s = derive({ reviewRequests: [{ Stage: '', UserID: E2E, RequestedAt: '2026-10-14T08:00:00Z' }], serverRows: rowsOf('3-promote-dev-satisfied-e2e') });
    expect(s.requests[0].reviewed).toBe(true);
  });

  test('reviewRequestsPatch keeps others and the Version; a duplicate is a no-op; remove drops one', () => {
    const current: ChangeOrderReviewRequestRead[] = [
      { Stage: 'prod', UserID: BOT, RequestedAt: '2026-10-14T08:28:16Z', RequestedByUserID: E2E },
    ];
    expect(reviewRequestsPatch(current, 12, { add: { stage: 'dev', userIds: [E2E, BOT] } })).toEqual({
      ReviewRequests: [
        { Stage: 'prod', UserID: BOT, RequestedAt: '2026-10-14T08:28:16Z' },
        { Stage: 'dev', UserID: E2E },
        { Stage: 'dev', UserID: BOT },
      ],
      Version: 12,
    });
    expect(reviewRequestsPatch(current, 12, { add: { stage: 'prod', userIds: [BOT] } }).ReviewRequests).toHaveLength(1);
    expect(reviewRequestsPatch(current, 12, { remove: { stage: 'prod', userId: BOT } })).toEqual({ ReviewRequests: [], Version: 12 });
  });

  /*
   * ASKING AGAIN IS A LATER RequestedAt ON ONE ENTRY. The server keeps a
   * request's stamp unless the time sent is later than the one it holds, so the
   * others go back with theirs, and the one asked again goes with a later one
   * even when the browser's clock is behind the server's.
   */
  test('reviewRequestsPatch rerequest sets a later RequestedAt on one entry, and keeps the others', () => {
    const current: ChangeOrderReviewRequestRead[] = [
      { Stage: 'prod', UserID: BOT, RequestedAt: '2026-10-14T08:28:16.250Z', RequestedByUserID: E2E },
      { Stage: 'prod', UserID: E2E, RequestedAt: '2026-10-14T08:20:00Z', RequestedByUserID: BOT },
      { Stage: 'dev', UserID: BOT, RequestedAt: '2026-10-14T08:00:00Z', RequestedByUserID: E2E },
    ];
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(reviewRequestsPatch(current, 7, { rerequest: { stage: 'prod', userId: BOT } }, now)).toEqual({
      ReviewRequests: [
        { Stage: 'prod', UserID: BOT, RequestedAt: '2026-10-20T12:00:00.000Z' },
        { Stage: 'prod', UserID: E2E, RequestedAt: '2026-10-14T08:20:00Z' },
        { Stage: 'dev', UserID: BOT, RequestedAt: '2026-10-14T08:00:00Z' },
      ],
      Version: 7,
    });
    // A clock behind the recorded time still sends a later one.
    const behind = Date.parse('2026-10-14T08:00:00Z');
    const [asked] = reviewRequestsPatch(current, 7, { rerequest: { stage: 'prod', userId: BOT } }, behind).ReviewRequests;
    expect(Date.parse(asked.RequestedAt ?? '')).toBeGreaterThan(Date.parse('2026-10-14T08:28:16.250Z'));
  });

  test('reviewRequestsPatch rerequest of someone not requested yet requests them', () => {
    const current: ChangeOrderReviewRequestRead[] = [{ Stage: 'prod', UserID: BOT, RequestedAt: '2026-10-14T08:28:16Z' }];
    expect(reviewRequestsPatch(current, 3, { rerequest: { stage: 'prod', userId: E2E } }).ReviewRequests).toEqual([
      { Stage: 'prod', UserID: BOT, RequestedAt: '2026-10-14T08:28:16Z' },
      { Stage: 'prod', UserID: E2E },
    ]);
  });

  test('a withdrawal revokes only the viewer\'s live rejections, with its own note', () => {
    const decision = (id: string, result: 'Pass' | 'Fail', live: boolean) => ({
      id,
      attestationIds: [id],
      type: id,
      person: { userId: E2E, name: 'E2E', initials: 'E', isYou: true },
      result,
      note: '',
      createdAt: '2026-10-14T08:00:00Z',
      live,
      expired: false,
      spaceSlugs: ['v5788-dev'],
      byRequirement: {},
      countsToward: [],
    });
    const viewer = {
      eligibility: { kind: 'signedOut' as const },
      ownByType: { Approval: decision('a', 'Fail', true), Security: decision('b', 'Pass', true), Old: decision('c', 'Fail', false) },
    };
    expect(ownLiveRejections({ viewer }).map((d) => d.id)).toEqual(['a']);
    expect(ownLiveRejections(undefined)).toEqual([]);
    const target = { attestationId: 'a', spaceId: DEV.spaceId, spaceSlug: DEV.spaceSlug, type: 'Approval' };
    expect(revocationBody(target, CO, WITHDRAWN_NOTE).Note).toBe(WITHDRAWN_NOTE);
    expect(revocationBody(target, CO).Note).toBe(REPLACED_NOTE);
  });
});

test('coverage: Authored rows from the server; skip codes with their message; per-Space errors', () => {
  const coverage = reviewCoverageOf('Approval', load('1-attest-dryrun-bot'));
  expect(coverage?.covered.some((row) => row.authored && row.unitSlug === 'web')).toBe(true);
  expect(coverage?.recordable).toBe(true);
  const skipped = reviewCoverageOf('Approval', {
    Spaces: [
      { SpaceSlug: 'v5788-prod', SkippedUnits: [{ UnitSlug: 'api', Reason: 'NoTarget', Message: 'it has no Target, so it is never released' }] },
      { SpaceSlug: 'v5788-dev', Error: { Message: 'no Approve permission', Status: 403 } },
    ],
  });
  expect(skipped?.skipped).toEqual([{ unitSlug: 'api', spaceSlug: 'v5788-prod', reason: 'NoTarget', message: 'it has no Target, so it is never released' }]);
  expect(skipped?.spaceErrors).toEqual([{ spaceSlug: 'v5788-dev', message: 'no Approve permission' }]);
  expect(skipped?.recordable).toBe(false);
});

test('no message-text parse is left in the review code', () => {
  const dir = new URL('../src/pages/change-orders/reviews/', import.meta.url);
  for (const file of ['changeOrderReviews.ts', 'stageReviewInputs.ts', 'useStageReviews.ts', 'reviewServerApi.ts', 'reviewHistory.ts']) {
    expect(readFileSync(fileURLToPath(new URL(file, dir)), 'utf8')).not.toMatch(/requires \$\{|`requires /);
  }
});

// ---------------------------------------------------------------------------
// 403 is an answer, not a page change
// ---------------------------------------------------------------------------

test.describe('a 403 never reaches the global /access-denied handler', () => {
  const respond = (status: number, body: unknown) => new Response(body === undefined ? '' : JSON.stringify(body), { status });
  /** A fake `authFetch` that answers from a queue and records each call. */
  function fakeSend(answers: Response[]) {
    const calls: { path: string; method: string; body?: unknown; contentType?: string }[] = [];
    const send: Send = async (path, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        path,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        contentType: headers.get('Content-Type') ?? undefined,
      });
      const next = answers.shift();
      if (next === undefined) throw new Error(`no answer for ${path}`);
      return next;
    };
    return { send, calls };
  }
  const forbidden = { message: 'permission denied' };

  test('Release dry run: 403 is not evaluated for you (noPermission)', async () => {
    const { send, calls } = fakeSend([respond(403, forbidden)]);
    const answers = await releaseDryRuns(send, CO, [PROD.spaceId]);
    expect(calls).toEqual([{ path: `/api/space/${PROD.spaceId}/release`, method: 'POST', body: { ChangeOrderID: CO, DryRun: true }, contentType: 'application/json' }]);
    expect(releaseAnswerOf(answers[PROD.spaceId])).toEqual({ notEvaluated: 'noPermission' });
  });

  test('Release dry run: a recorded 422 with Gates comes through as rows', async () => {
    const { send } = fakeSend([respond(422, load('6-release-prod-refused-e2e'))]);
    const answers = await releaseDryRuns(send, CO, [PROD.spaceId]);
    expect('rows' in releaseAnswerOf(answers[PROD.spaceId])).toBe(true);
  });

  test('promote dry run: 403 is noPermission; the completed 400 is completed', async () => {
    const refused = fakeSend([respond(403, forbidden)]);
    expect(promoteFinalOf(await promoteDryRun(refused.send, { ChangeOrderID: CO }))).toEqual({ kind: 'noPermission' });
    expect(refused.calls[0]).toMatchObject({ path: '/api/promote', body: { ChangeOrderID: CO, DryRun: true } });
    const done = fakeSend([respond(400, load('11-promote-completed-refusal-e2e'))]);
    expect(promoteFinalOf(await promoteDryRun(done.send, { ChangeOrderID: CO }))).toEqual({ kind: 'completed' });
  });

  test('/attest dry run, record and revoke: 403 is that call\'s error', async () => {
    const dry = fakeSend([respond(403, forbidden)]);
    expect(await attestDryRuns(dry.send, { ChangeOrderID: CO, TargetStage: 'prod', Result: 'Pass' }, ['Approval'])).toEqual({
      Approval: { error: 'permission denied', status: 403 },
    });
    expect(dry.calls[0].path).toBe('/api/attest?dry_run=true');
    const record = fakeSend([respond(403, forbidden)]);
    expect(await recordAttestation(record.send, { ChangeOrderID: CO, Result: 'Pass' })).toEqual({ error: 'permission denied', status: 403 });
    const revoke = fakeSend([respond(403, forbidden)]);
    await expect(revokeAttestation(revoke.send, BASE.spaceId, { RevokedAttestationID: 'x' })).rejects.toThrow('permission denied');
  });

  test('ReviewRequests PATCH: 403 hides the action; 409 is read again and sent once more', async () => {
    const change = { spaceId: BASE.spaceId, changeOrderId: CO, current: [], version: 10, edit: { add: { stage: 'prod', userIds: [BOT] } } };
    const refused = fakeSend([respond(403, forbidden)]);
    expect(await changeReviewRequests(refused.send, change)).toEqual({ ok: false, message: 'permission denied', forbidden: true });
    expect(refused.calls[0]).toMatchObject({ method: 'PATCH', contentType: 'application/merge-patch+json', body: { Version: 10 } });

    const fresh = { ChangeOrder: { Version: 12, ReviewRequests: [{ Stage: 'dev', UserID: E2E, RequestedAt: '2026-10-14T08:00:00Z' }] } };
    const retried = fakeSend([respond(409, load('8-patch-review-request-stale-e2e')), respond(200, fresh), respond(200, load('8-patch-review-request-e2e'))]);
    expect(await changeReviewRequests(retried.send, change)).toEqual({ ok: true });
    expect(retried.calls.map((c) => c.method)).toEqual(['PATCH', 'GET', 'PATCH']);
    expect(retried.calls[2].body).toEqual({
      ReviewRequests: [
        { Stage: 'dev', UserID: E2E, RequestedAt: '2026-10-14T08:00:00Z' },
        { Stage: 'prod', UserID: BOT },
      ],
      Version: 12,
    });

    const twice = fakeSend([respond(409, {}), respond(200, fresh), respond(409, { message: 'conflict' })]);
    expect(await changeReviewRequests(twice.send, change)).toEqual({ ok: false, message: 'conflict', conflict: true });
  });

  test('the calls a reviewer can be refused do not use the RTK hooks that send a 403 to /access-denied', () => {
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
    const sources = [
      '../src/pages/change-orders/reviews/reviewServerApi.ts',
      '../src/pages/change-orders/reviews/useStageReviews.ts',
      '../src/pages/x/apps/change-order/useServerStageGates.ts',
    ].map(read);
    for (const source of sources) {
      expect(source).not.toMatch(/use(Promote|Attest|CreateAttestation|PatchChangeOrder|PublishRelease)Mutation/);
      expect(source).toMatch(/authFetch/);
    }
    const dryRun = read('../src/pages/change-orders/reviews/reviewAttestationsApi.ts');
    expect(dryRun).toMatch(/attestDryRuns\(authFetch/);
    // The release and promote dry runs: no RTK base query at all.
    expect(sources[0]).not.toMatch(/baseQuery\(\{\s*url: [`'"]\/(promote|space\/\$\{spaceId\}\/release)/);
  });
});

/*
 * A BODY THAT CANNOT BE READ IS NO ANSWER, NOT A REJECTION. The headers can
 * arrive and the body fail after them (a timeout that aborts mid-body, a reset
 * connection); a caller waiting on the answer must still get one.
 */
test('answerOf: a failed send and a failed body read are both status 0', async () => {
  const sendFails: Send = async () => {
    throw new Error('network down');
  };
  expect(await answerOf(sendFails, '/api/promote')).toEqual({ status: 0, body: { message: 'network down' } });

  const bodyFails: Send = async () =>
    ({ status: 200, text: () => Promise.reject(new Error('The operation was aborted.')) }) as unknown as Response;
  expect(await answerOf(bodyFails, '/api/promote')).toEqual({ status: 0, body: { message: 'The operation was aborted.' } });

  const fine: Send = async () => new Response(JSON.stringify({ DryRun: true }), { status: 200 });
  expect(await answerOf(fine, '/api/promote')).toEqual({ status: 200, body: { DryRun: true } });
});
