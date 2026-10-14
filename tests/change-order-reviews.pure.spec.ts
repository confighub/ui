// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The review data layer around the server's gate results
// (`change-order-review-server.pure.spec.ts` has those): grouping records into
// decisions, approvers on gate rows, which gates are reviewed and where an
// /attest and a review request record (entry, first stage over the own Space,
// release, Final), the last promotion, the first-stage gates (M1), the
// live-check fixes (D1-D5), and "Change my decision" (revocation bodies,
// retries). No page, no browser.

import { expect, test } from '@playwright/test';
import type {
  AttestationRead,
  ChangeWorkflowAttestationPrerequisite,
  ChangeWorkflowSpec,
  ExtendedSpaceRead,
  PromoteGateResult,
} from '@confighub/rtk-query';

import {
  deriveGateReviews,
  promoteReadiness,
  reviewInitials,
  withReviewApprovers,
} from '../src/pages/change-orders/reviews/changeOrderReviews';
import type {
  DeriveGateReviewsInput,
  GateReviewSummary,
  ReviewGateRef,
  ReviewUser,
} from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import {
  isCompletedWorkflowRefusal,
  planRevocations,
  reviewAttestTarget,
  reviewLastPromotion,
  reviewRailOf,
  reviewUserOf,
  reviewedGates,
  revocationBody,
  runRevocations,
} from '../src/pages/change-orders/reviews/stageReviewInputs';
import { buildGatesForStage } from '../src/pages/x/apps/change-order/changeOrderGates';
import { buildChangeOrderSequence } from '../src/pages/x/apps/change-order/changeOrderStages';
import { stageWhereSpace } from '../src/pages/x/apps/change-order/changeOrderWorkflow';
import { buildConsoleRow } from '../src/pages/x/apps/change-order/changeOrdersConsoleModel';
import type { ChangeOrderGate, ChangeOrderProgress } from '../src/pages/x/apps/change-order/changeOrderTypes';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const H = 3_600_000;
const iso = (offset: number) => new Date(NOW + offset).toISOString();

const S1 = { spaceId: 'sp-1', spaceSlug: 'staging-eu' };
const S2 = { spaceId: 'sp-2', spaceSlug: 'staging-us' };
const ENTRY: ReviewGateRef = { kind: 'entry', stageId: 'prod', stageName: 'prod', key: 'entry:prod' };

const USERS: Record<string, ReviewUser> = Object.fromEntries(
  [
    ['ana', 'Ana Silva'],
    ['ben', 'Ben Okafor'],
    ['me', 'Mia Viewer'],
  ].map(([id, name]) => [id, reviewUserOf(id, { DisplayName: name })]),
);

let seq = 0;
function record(user: string, space: typeof S1, at: number, over: Partial<AttestationRead> = {}): AttestationRead {
  seq += 1;
  return {
    AttestationID: `att-${seq}`,
    ChangeOrderID: 'co',
    UserID: user,
    Result: 'Pass',
    Note: 'ok',
    CreatedAt: iso(at),
    SpaceID: space.spaceId,
    SpaceSlug: space.spaceSlug,
    ...over,
  };
}
/** One /attest call: a record per Space, 1 s apart. */
const decision = (user: string, at = -H, over: Partial<AttestationRead> = {}) => [
  record(user, S1, at, over),
  record(user, S2, at + 1000, over),
];
function revoke(target: AttestationRead, by: string, at: number): AttestationRead {
  seq += 1;
  return { AttestationID: `rev-${seq}`, UserID: by, RevokedAttestationID: target.AttestationID, SpaceID: target.SpaceID, CreatedAt: iso(at) };
}
const req = (over: Partial<ChangeWorkflowAttestationPrerequisite> = {}) => ({ Name: 'sec', Count: 2, ...over });

function derive(attestations: AttestationRead[], over: Partial<DeriveGateReviewsInput> = {}): GateReviewSummary {
  const summary = deriveGateReviews({
    gate: ENTRY,
    gateStageName: 'staging',
    gateSpaces: [S1, S2],
    requirementNames: ['sec'],
    definitions: [req()],
    serverRows: [],
    notEvaluatedBySpaceId: {},
    attestations,
    revocations: attestations.filter((a) => a.RevokedAttestationID),
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

test('no attestation requirement on the gate: undefined', () => {
  expect(
    deriveGateReviews({
      gate: ENTRY,
      gateStageName: 'staging',
      gateSpaces: [S1],
      requirementNames: ['Healthy'],
      definitions: [req()],
      serverRows: [],
      notEvaluatedBySpaceId: {},
      attestations: [],
      revocations: [],
      users: USERS,
      groups: {},
      reviewRequests: [],
      requestStage: '',
      attestTarget: { ChangeOrderID: 'co' },
      now: NOW,
    }),
  ).toBeUndefined();
});

test.describe('decisions', () => {
  test('records 1 s apart in two Spaces are one decision; 2 minutes apart are two', () => {
    const one = derive(decision('ana'));
    expect(one.decisions).toHaveLength(1);
    expect(one.decisions[0].spaceSlugs).toEqual(['staging-eu', 'staging-us']);
    expect(one.decisions[0].type).toBe('Approval');

    const two = derive([record('ana', S1, -H), record('ana', S2, -H + 120_000)]);
    expect(two.decisions).toHaveLength(2);
  });

  test('a revoked Fail then a Pass of the same Type: linked, the Fail no longer blocks', () => {
    const fail = decision('ben', -3 * H, { Result: 'Fail' });
    const pass = decision('ben', -2 * H + 5000);
    const s = derive([...fail, ...fail.map((r) => revoke(r, 'ben', -2 * H)), ...pass]);
    const [newer, older] = s.decisions;
    expect(older.live).toBe(false);
    expect(older.revokedAt).toBe(iso(-2 * H));
    expect(older.replacedByDecisionId).toBe(newer.id);
    expect(newer.replacesDecisionId).toBe(older.id);
    expect(s.requirements[0].rejected).toBe(false);
  });

  test('a decision of another Type is not replaced by this one', () => {
    const security = decision('ben', -3 * H, { Type: 'SecurityReview' });
    const s = derive([...security, ...security.map((r) => revoke(r, 'ben', -2 * H)), ...decision('ben', -H)]);
    expect(s.decisions.find((d) => d.type === 'SecurityReview')?.replacedByDecisionId).toBeUndefined();
  });
});

/** A server row for `sec` in a Space, naming entries. */
const row = (space: typeof S1, entries: { id?: string; user: string; result?: 'Pass' | 'Fail'; countedOn: number; reason?: string }[], satisfied = false): PromoteGateResult => ({
  Prerequisite: 'sec',
  SpaceID: space.spaceId,
  SpaceSlug: space.spaceSlug,
  Satisfied: satisfied,
  Reason: satisfied ? undefined : 'AttestationsMissing',
  Attestation: {
    Type: 'Approval',
    Required: 2,
    Counted: entries.filter((e) => e.countedOn > 0 && (e.result ?? 'Pass') === 'Pass').length,
    Revisions: 1,
    SatisfiedRevisions: satisfied ? 1 : 0,
    Attestations: entries.map((e) => ({ AttestationID: e.id ?? `x-${e.user}`, UserID: e.user, Result: e.result ?? 'Pass', CountedOn: e.countedOn, Reason: e.reason })),
  },
});

test.describe('withReviewApprovers', () => {
  const gates: ChangeOrderGate[] = [
    { id: 'promoted', name: 'Promoted', ok: true, evaluated: true, reason: '', prerequisite: 'Promoted' },
    { id: 'attestation-prerequisite:sec', name: 'check/sec', ok: false, evaluated: false, reason: '', prerequisite: 'sec' },
  ];
  test('fills the requirement row only, passers then rejecters', () => {
    const rows = [row(S1, [{ user: 'ana', countedOn: 1 }, { user: 'ben', result: 'Fail', countedOn: 1 }])];
    const out = withReviewApprovers(gates, derive([], { gateSpaces: [S1], serverRows: rows }));
    expect(out[0]).toBe(gates[0]);
    expect(out[1].approvers).toEqual([
      { userId: 'ana', name: 'Ana Silva', initials: 'AS' },
      { userId: 'ben', name: 'Ben Okafor', initials: 'BO' },
    ]);
    expect(withReviewApprovers(gates, undefined)).toBe(gates);
  });
});

// ---------------------------------------------------------------------------

test.describe('reviewed gates and targets', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'", Prerequisites: ['first-look'] },
      { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Healthy', 'sec'], ReleasePrerequisites: ['release-ok'] },
    ],
    Final: { Prerequisites: ['sign-off'] },
    AttestationPrerequisites: [{ Name: 'first-look' }, { Name: 'sec' }, { Name: 'release-ok' }, { Name: 'sign-off', Count: 2 }],
  };
  const space = (id: string, slug: string) => ({ Space: { SpaceID: id, Slug: slug } }) as ExtendedSpaceRead;
  const sequence = buildChangeOrderSequence(workflow, { dev: [space('sp-dev', 'dev-1')], prod: [space('sp-prod', 'prod-1')] }, ['sp-base']);
  const spaceSlugById = new Map([
    ['sp-base', 'base'],
    ['sp-dev', 'dev-1'],
    ['sp-prod', 'prod-1'],
  ]);
  const gates = reviewedGates(workflow, sequence, { spaceSlugById, ownSpaceReached: true, baseSpaceId: 'sp-base', baseSpaceSlug: 'base' });

  test('entry (first stage over the own Space), entry, release and Final, in that order', () => {
    expect(gates.map((g) => [g.gate.key, g.requirementNames, g.gateSpaces.map((s) => s.spaceSlug), g.gateStageName])).toEqual([
      ['entry:dev', ['first-look'], ['base'], 'base'],
      ['entry:prod', ['sec'], ['dev-1'], 'dev'],
      ['release:prod', ['release-ok'], ['prod-1'], 'prod'],
      ['final:prod', ['sign-off'], ['prod-1'], 'prod'],
    ]);
  });
  test('the first stage has no reviewed entry gate when the own Space does not hold the change', () => {
    const fanOut = reviewedGates(workflow, sequence, { spaceSlugById, ownSpaceReached: false, baseSpaceId: 'sp-base' });
    expect(fanOut.map((g) => g.gate.key)).toEqual(['entry:prod', 'release:prod', 'final:prod']);
    expect(reviewedGates(undefined, sequence, { spaceSlugById, ownSpaceReached: true })).toEqual([]);
  });
  test('attest targets: WhereSpace on the own Space; the previous stage; the stage itself for release and Final', () => {
    expect(gates.map((g) => reviewAttestTarget('co', g))).toEqual([
      { ChangeOrderID: 'co', WhereSpace: "SpaceID = 'sp-base'" },
      { ChangeOrderID: 'co', TargetStage: 'dev' },
      { ChangeOrderID: 'co', TargetStage: 'prod' },
      { ChangeOrderID: 'co', TargetStage: 'prod' },
    ]);
  });
  test('request stages: own Space for the first stage, the previous stage, the stage itself', () => {
    expect(gates.map((g) => g.requestStage)).toEqual(['', 'dev', 'prod', 'prod']);
  });
  test('last promotion: creation for the first stage; the latest promotion into the stage waited on', () => {
    const promotions = [
      { Stage: 'dev', PromotedAt: iso(-5 * H) },
      { Stage: 'dev', PromotedAt: iso(-3 * H) },
      { Stage: 'prod', PromotedAt: iso(-1 * H) },
    ];
    expect(gates.map((g) => reviewLastPromotion(g, promotions, iso(-9 * H)))).toEqual([iso(-9 * H), iso(-3 * H), iso(-H), iso(-H)]);
    expect(reviewLastPromotion(gates[1], [], iso(-9 * H))).toBeUndefined();
  });

  test('M1: the first stage gates on its prerequisites over the own Space only when it holds the change', () => {
    const first = sequence.stages.find((stage) => stage.isFirst);
    if (first === undefined) throw new Error('expected a first stage');
    const progress: ChangeOrderProgress = {
      availability: 'available',
      resolvedSpaceIds: new Set(['sp-base']),
      releasedSpaceIds: new Set(),
      carryingReleases: new Map(),
      restoredSpaceIds: new Set(),
      releasedRestoredSpaceIds: new Set(),
    };
    const context = {
      stage: first,
      previousStageSpaces: [{ spaceId: 'sp-base', loaded: true, variantName: 'base', release: null }],
      progress,
      componentName: 'app',
      changeOrderSlug: 'co',
      attestationPrerequisites: workflow.AttestationPrerequisites,
    };
    expect(buildGatesForStage(context)).toEqual([]);
    const gated = buildGatesForStage({ ...context, ownSpaceReached: true });
    expect(gated.map((g) => [g.id, g.prerequisite, g.evaluated])).toEqual([['attestation-prerequisite:first-look', 'first-look', false]]);
  });
});

test.describe('change my decision', () => {
  const approval = decision('me');
  const security = decision('me', -H, { Type: 'SecurityReview', Note: 'sec' });
  const s = derive([...approval, ...security], {
    requirementNames: ['sec', 'review'],
    definitions: [req(), req({ Name: 'review', Type: 'SecurityReview' })],
  });
  const own = Object.values(s.viewer.ownByType);

  test('the plan lists every record of every replaced decision, with its Type (S1, S6)', () => {
    const plan = planRevocations(own, [...approval, ...security], new Set());
    expect(plan.targets.map((t) => [t.spaceSlug, t.type]).sort()).toEqual([
      ['staging-eu', 'Approval'],
      ['staging-eu', 'SecurityReview'],
      ['staging-us', 'Approval'],
      ['staging-us', 'SecurityReview'],
    ]);
    expect(revocationBody(plan.targets[0], 'co')).toEqual({
      RevokedAttestationID: plan.targets[0].attestationId,
      ChangeOrderID: 'co',
      Type: plan.targets[0].type,
      Note: 'Replaced by a new decision',
    });
  });

  test('records already revoked (listed, or earlier on this page) are skipped', () => {
    const listed = planRevocations([s.viewer.ownByType.Approval], [...approval, revoke(approval[0], 'me', -1)], new Set());
    expect(listed.targets.map((t) => t.attestationId)).toEqual([approval[1].AttestationID]);
    expect(listed.alreadyRevokedSpaceSlugs).toEqual(['staging-eu']);
    const session = planRevocations([s.viewer.ownByType.Approval], approval, new Set([approval[0].AttestationID ?? '']));
    expect(session.targets.map((t) => t.attestationId)).toEqual([approval[1].AttestationID]);
  });

  test('a failure part-way stops; the retry sends only what did not happen', async () => {
    const sent: string[] = [];
    const revokedInSession = new Set<string>();
    let fail = true;
    const revokeOne = async (target: { attestationId: string; spaceSlug: string }) => {
      sent.push(target.attestationId);
      if (fail && target.spaceSlug === 'staging-us') throw new Error('500');
    };
    const decisionOnly = [s.viewer.ownByType.Approval];
    const first = await runRevocations(planRevocations(decisionOnly, approval, revokedInSession), revokeOne, revokedInSession);
    expect(first).toMatchObject({ ok: false, revokedSpaceSlugs: ['staging-eu'], failedSpaceSlug: 'staging-us' });
    fail = false;
    sent.length = 0;
    const retry = await runRevocations(planRevocations(decisionOnly, approval, revokedInSession), revokeOne, revokedInSession);
    expect(sent).toEqual([approval[1].AttestationID]);
    expect(retry).toEqual({ ok: true, revokedSpaceSlugs: ['staging-eu', 'staging-us'] });
  });
});

// ---------------------------------------------------------------------------
// Live-check fixes (D1-D5)
// ---------------------------------------------------------------------------

test.describe('D1: a decision is one /attest call for this gate', () => {
  const S3 = { spaceId: 'sp-3', spaceSlug: 'dev-1' };
  test('a record in a Space outside the gate is not a decision of this gate', () => {
    // The same person, note, Type and ChangeOrder, 30 s apart: one call for dev, one for staging.
    const s = derive([record('ana', S3, -H - 30_000), ...decision('ana')]);
    expect(s.decisions).toHaveLength(1);
    expect(s.decisions[0].spaceSlugs).toEqual(['staging-eu', 'staging-us']);
  });
  test('two calls within a minute in the gate Spaces stay two decisions', () => {
    const s = derive([record('ana', S1, -H), record('ana', S2, -H + 30_000)]);
    expect(s.decisions).toHaveLength(2);
  });
});

test('D2 (v3): who can still approve leaves out those the server already counts and its named authors', () => {
  const rows = [row(S1, [{ user: 'ana', countedOn: 1 }])].map((r) => ({
    ...r,
    Attestation: { ...r.Attestation, AuthorUserIDs: ['ben'] },
  }));
  const s = derive([], { gateSpaces: [S1], serverRows: rows, definitions: [req({ FromUserIDs: ['ana', 'ben', 'me'] })] });
  expect(s.whoCanStillApprove.map((w) => w.person.userId)).toEqual(['me']);
});

test('promoteReadiness: ready only when every server row holds; not evaluated reviews are unknown', () => {
  const held: PromoteGateResult[] = [{ Prerequisite: 'Healthy', SpaceID: 'sp-1', Satisfied: false }];
  const open = derive([], { gateSpaces: [S1], serverRows: [row(S1, [{ user: 'ana', countedOn: 1 }, { user: 'ben', countedOn: 1 }], true)] });
  expect(open.open).toBe(true);
  expect(promoteReadiness(open, [...held])).toEqual({ kind: 'reviewsComplete', otherGatesHolding: ['Healthy'] });
  expect(promoteReadiness(open, [{ Prerequisite: 'sec', SpaceID: 'sp-1', Satisfied: true }])).toEqual({ kind: 'ready' });
  expect(promoteReadiness(derive([], { notEvaluatedBySpaceId: { 'sp-1': 'noPermission', 'sp-2': 'noPermission' } }), held)).toEqual({ kind: 'unknown' });
  expect(promoteReadiness(open, undefined)).toEqual({ kind: 'unknown' });
});

test('the rail line has no count when the primary is not evaluated', () => {
  const s = derive([], { notEvaluatedBySpaceId: { 'sp-1': 'noPermission', 'sp-2': 'noPermission' } });
  expect(reviewRailOf(s)).toMatchObject({ evaluated: false, state: 'none', gateKind: 'entry' });
});

test('D3: the server says a completed workflow has nothing left to promote (promote_gates.go:381)', () => {
  const text = "change order 'co1' has completed ChangeWorkflow 'wf', so there is nothing left to promote";
  expect(isCompletedWorkflowRefusal({ status: 400, text })).toBe(true);
  expect(isCompletedWorkflowRefusal({ status: 400, text: 'bad stage' })).toBe(false);
  expect(isCompletedWorkflowRefusal({ status: 409, text })).toBe(false);
  const final = derive(decision('ana'), { gate: { ...ENTRY, kind: 'final', key: 'final:prod' }, completed: true });
  expect(final.open).toBe(true);
});

test('D4: initials use letters and digits only, and ignore a parenthesised suffix', () => {
  expect(reviewInitials('e2e-reviewer-bot (Service Account)')).toBe('ER');
  expect(reviewInitials('Ana Silva')).toBe('AS');
  expect(reviewInitials('(x)')).toBe('?');
});

test('D5: the console row does not call a first stage with review requirements ready', () => {
  const workflow: ChangeWorkflowSpec = {
    Stages: [
      { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'", Prerequisites: ['first-review'] },
      { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'" },
    ],
    AttestationPrerequisites: [{ Name: 'first-review' }],
  };
  const row = buildConsoleRow(
    {
      changeOrderId: 'co-1',
      slug: 'co-1',
      spaceId: 'base',
      spaceSlug: 'app-base',
      updateType: 'MutationsAndLinks',
      resolvedSpaceIds: ['base'],
      releasedSpaceIds: [],
      releases: [],
      inScopeSpaceIds: ['base', 'dev-1', 'prod-1'],
      governing: { state: 'governed', workflow, changeWorkflowId: 'wf-1' },
    },
    [
      { spaceId: 'base', slug: 'app-base' },
      { spaceId: 'dev-1', slug: 'app-dev', labels: { Stage: 'dev' } },
      { spaceId: 'prod-1', slug: 'app-prod', labels: { Stage: 'prod' } },
    ],
    {
      [stageWhereSpace(workflow.Stages[0])]: [{ Space: { SpaceID: 'dev-1' } } as ExtendedSpaceRead],
      [stageWhereSpace(workflow.Stages[1])]: [{ Space: { SpaceID: 'prod-1' } } as ExtendedSpaceRead],
    },
  );
  expect(row.nextStageId).toBe('dev');
  expect(row.state).not.toBe('ready');
  expect(row.blocker).not.toBe('');
});

