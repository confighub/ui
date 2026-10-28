// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A TEST → PUBLIC RELEASE, AS THE RELEASE WORKFLOW RUNS IT.
 *
 * The ChangeWorkflow has two stages. Public's entry gate needs Test to be
 * Released and Healthy, and a `prod-approval` recorded on the Test Revisions
 * (`--stage Test`). Public's release gate needs a second `prod-approval`, on the
 * Public Revisions (`--stage Public`), which exist only after the promotion.
 *
 * The approval for the promotion is made on the Public card, and can be made
 * while Healthy still waits. After the promotion, the Public card reviews the
 * release only: the approval on the Test Revisions is not "your decision" there,
 * and nothing on that card can revoke it. No page, no browser.
 *
 * With no Final, the promotion into Public makes the ChangeOrder `Completed`
 * while Public's release gate still holds: the server completes a workflow on
 * Final, never on a release gate.
 */
import type {
  AttestationRead,
  ChangeWorkflowAttestationPrerequisite,
  PromoteGateResult,
} from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import type {
  DeriveGateReviewsInput,
  GateReviewSummary,
  ReviewGateRef,
  ReviewUser,
} from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import {
  combineGateReviews,
  deriveGateReviews,
} from '../src/pages/change-orders/reviews/changeOrderReviews';
import { reviewCopy } from '../src/pages/change-orders/reviews/reviewCopy';
import {
  type GateServerReads,
  type ReviewedGate,
  gateServerRowsOf,
  ownLiveRejections,
  planRevocations,
  reviewRecordIds,
  reviewUserOf,
  runRevocations,
} from '../src/pages/change-orders/reviews/stageReviewInputs';
import {
  type StageCardStateInput,
  deriveStageCardState,
  isReviewState,
  stageBoxLook,
} from '../src/pages/change-orders/stage/stageCardState';
import { stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';
import { segmentsText } from '../src/pages/change-orders/stage/stageCopyParts';
import {
  approverNames,
  flowShowsForm,
  reviewAside,
  stageSectionGates,
  viewerFlow,
} from '../src/pages/change-orders/stage/stageReviewModel';
import type {
  ChangeOrderGate,
  ChangeOrderStageVerdict,
} from '../src/pages/x/apps/change-order/changeOrderTypes';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const iso = (offset: number) => new Date(NOW + offset).toISOString();

const TEST_SPACE = { spaceId: 'sp-staging', spaceSlug: 'staging-use2-confighub-app' };
const PUBLIC_SPACE = { spaceId: 'sp-prod', spaceSlug: 'prod-use2-confighub-app' };
const ENTRY_PUBLIC: ReviewGateRef = {
  kind: 'entry',
  stageId: 'Public',
  stageName: 'Public',
  key: 'entry:Public',
};
const RELEASE_PUBLIC: ReviewGateRef = {
  kind: 'release',
  stageId: 'Public',
  stageName: 'Public',
  key: 'release:Public',
};
const DEFINITIONS: ChangeWorkflowAttestationPrerequisite[] = [
  { Name: 'prod-approval', Count: 1, FromUserIDs: ['brian', 'jesper'] },
];
const USERS: Record<string, ReviewUser> = {
  brian: reviewUserOf('brian', { DisplayName: 'Brian' }),
  jesper: reviewUserOf('jesper', { DisplayName: 'Jesper' }),
};

/** Brian's `prod-approval` on the Test Revisions: `variant approve --stage Test`. */
const TEST_APPROVAL: AttestationRead = {
  AttestationID: 'att-test',
  ChangeOrderID: 'co',
  UserID: 'brian',
  Result: 'Pass',
  Note: 'staging looks good',
  CreatedAt: iso(-10 * 60_000),
  SpaceID: TEST_SPACE.spaceId,
};

function row(
  space: typeof TEST_SPACE,
  counted: number,
  attestations: AttestationRead[] = [],
): PromoteGateResult {
  const satisfied = counted >= 1;
  return {
    Prerequisite: 'prod-approval',
    SpaceID: space.spaceId,
    SpaceSlug: space.spaceSlug,
    Satisfied: satisfied,
    ...(satisfied ? {} : { Reason: 'AttestationsMissing' }),
    Attestation: {
      Counted: counted,
      Required: 1,
      Revisions: 1,
      SatisfiedRevisions: satisfied ? 1 : 0,
      Caller: { Counts: true },
      Attestations: attestations.map((a) => ({
        AttestationID: a.AttestationID,
        UserID: a.UserID,
        Result: 'Pass',
        CountedOn: 1,
      })),
    },
  };
}

function derive(over: Partial<DeriveGateReviewsInput>): GateReviewSummary {
  const summary = deriveGateReviews({
    gate: ENTRY_PUBLIC,
    gateStageName: 'Test',
    gateSpaces: [TEST_SPACE],
    requirementNames: ['prod-approval'],
    definitions: DEFINITIONS,
    serverRows: [],
    notEvaluatedBySpaceId: {},
    attestations: [],
    revocations: [],
    users: USERS,
    groups: {},
    reviewRequests: [],
    requestStage: 'Test',
    viewerUserId: 'brian',
    attestTarget: { ChangeOrderID: 'co', TargetStage: 'Test' },
    now: NOW,
    ...over,
  });
  if (summary === undefined) throw new Error('expected a summary');
  return summary;
}

/** The promotion review: reads the Test Spaces. */
const promotionReview = (attestations: AttestationRead[]) =>
  derive({ serverRows: [row(TEST_SPACE, attestations.length, attestations)], attestations });

/** The release review: reads the Public Spaces. `attestations` is every record of the ChangeOrder. */
const releaseReview = (attestations: AttestationRead[]) =>
  derive({
    gate: RELEASE_PUBLIC,
    gateStageName: 'Public',
    gateSpaces: [PUBLIC_SPACE],
    serverRows: [row(PUBLIC_SPACE, 0)],
    attestations,
    requestStage: 'Public',
    attestTarget: { ChangeOrderID: 'co', TargetStage: 'Public' },
  });

const gate = (id: string, ok: boolean, prerequisite: string): ChangeOrderGate => ({
  id,
  name: prerequisite,
  ok,
  evaluated: true,
  reason: `${prerequisite} reason`,
  prerequisite,
});
const released = gate('check/released', true, 'Released');
const healthy = gate('check/healthy', false, 'Healthy');
const approval = gate('attestation-prerequisite:prod-approval', false, 'prod-approval');

function cardInput(over: Partial<StageCardStateInput>): StageCardStateInput {
  return {
    stageId: 'Public',
    verdict: 'gated',
    isSource: false,
    invocationSource: false,
    abortedReason: '',
    spaceIds: [PUBLIC_SPACE.spaceId],
    targets: [PUBLIC_SPACE.spaceId],
    stageHasTargets: true,
    gates: [],
    inFlightSpaceIds: new Set(),
    failure: null,
    dryRun: { mode: 'idle' },
    problems: [],
    ...over,
  };
}

const verdicts = (map: Record<string, ChangeOrderStageVerdict>) => (stageId: string) =>
  map[stageId];

test.describe('Test → Public: the promotion review', () => {
  const before = verdicts({ Test: 'released', Public: 'gated' });
  const summaries = [promotionReview([]), releaseReview([])];

  test('is on the Public card, the stage it gates, and never on the Test card', () => {
    expect(stageSectionGates(summaries, 'Public', before).map((s) => s.gate.key)).toEqual([
      'entry:Public',
    ]);
    expect(stageSectionGates(summaries, 'Test', before)).toEqual([]);
  });

  test('stays on the Public card while Test is promoted and has a release review of its own', () => {
    const releaseTest = derive({
      gate: { kind: 'release', stageId: 'Test', stageName: 'Test', key: 'release:Test' },
      serverRows: [row(TEST_SPACE, 0)],
    });
    const testPromoted = verdicts({ Test: 'promoted', Public: 'gated' });
    expect(
      stageSectionGates([...summaries, releaseTest], 'Public', testPromoted).map(
        (s) => s.gate.key,
      ),
    ).toEqual(['entry:Public']);
    expect(
      stageSectionGates([...summaries, releaseTest], 'Test', testPromoted).map(
        (s) => s.gate.key,
      ),
    ).toEqual(['release:Test']);
  });

  test('offers Approve while Healthy still waits, and names Healthy as context', () => {
    const hosted = combineGateReviews(stageSectionGates(summaries, 'Public', before));
    if (hosted === undefined) throw new Error('expected a review');
    const flow = viewerFlow(hosted, {});
    expect(flow.kind).toBe('form');
    const state = deriveStageCardState(
      cardInput({
        gates: [released, healthy, approval],
        previousStage: {
          stageId: 'Test',
          name: 'Test',
          verdict: 'released',
          healthPending: true,
        },
        entryReview: { summary: hosted, flow },
      }),
    );
    expect(state).toMatchObject({
      kind: 'reviewNeeded',
      action: 'promote',
      gateKey: 'entry:Public',
      waitingGates: [healthy],
      failedGates: [],
    });
    if (state.kind !== 'reviewNeeded') return;
    expect(flowShowsForm(state.flow)).toBe(true);
  });

  /** The Public card as the server's records leave it: nothing this browser remembers. */
  const cardAfter = (records: AttestationRead[], gates: ChangeOrderGate[], healthPending: boolean) => {
    const hosted = combineGateReviews(
      stageSectionGates([promotionReview(records), releaseReview([])], 'Public', before),
    );
    if (hosted === undefined) throw new Error('expected a review');
    const flow = viewerFlow(hosted, {});
    const state = deriveStageCardState(
      cardInput({
        gates,
        previousStage: { stageId: 'Test', name: 'Test', verdict: 'released', healthPending },
        entryReview: { summary: hosted, flow },
      }),
    );
    return { hosted, flow, state };
  };
  const approved = { ...approval, ok: true };
  const JESPER_APPROVAL: AttestationRead = {
    ...TEST_APPROVAL,
    AttestationID: 'att-jesper',
    UserID: 'jesper',
    Note: 'fine by me',
  };

  test('after a reload, your approval that satisfies it while Healthy waits keeps the review box', () => {
    const { hosted, flow, state } = cardAfter([TEST_APPROVAL], [released, healthy, approved], true);
    expect(flow.kind).toBe('ownApproved');
    expect(state).toMatchObject({
      kind: 'reviewApproved',
      action: 'promote',
      gateKey: 'entry:Public',
      waitingGates: [healthy],
      failedGates: [],
      wait: { waitFor: 'healthy', previousStage: { stageId: 'Test', name: 'Test' } },
    });
    expect(isReviewState(state.kind)).toBe(true);
    expect(stageBoxLook(state)).toEqual({ tone: 'neutral', tile: 'calm', icon: 'person' });
    expect(
      segmentsText(
        stageCardCopy.headline.afterApproval(
          stageCardCopy.headline.gateWaiting('healthy', 'Test', 'check/healthy'),
        ),
      ),
    ).toBe('Approved. Waiting on check/healthy');
    // "Change my decision" revokes the approval in the Test Space this review reads, and nothing else.
    const plan = planRevocations(flow.own, [TEST_APPROVAL], new Set(), reviewRecordIds(hosted));
    expect(plan.targets.map((t) => [t.attestationId, t.spaceId])).toEqual([
      ['att-test', TEST_SPACE.spaceId],
    ]);
    expect(plan.unrevocable).toEqual([]);
  });

  test('your approval while Healthy failed keeps the review box, red for the failed gate', () => {
    const { state } = cardAfter([TEST_APPROVAL], [released, healthy, approved], false);
    expect(state).toMatchObject({ kind: 'reviewApproved', failedGates: [healthy], waitingGates: [] });
    expect(state).not.toHaveProperty('wait');
    expect(stageBoxLook(state)).toEqual({ tone: 'error', tile: 'solid', icon: 'error' });
  });

  test('Jesper’s approval satisfies it while Healthy waits: the box says Jesper approved, and is no decision of yours', () => {
    const { hosted, flow, state } = cardAfter([JESPER_APPROVAL], [released, healthy, approved], true);
    expect(state).toMatchObject({ kind: 'reviewApproved', waitingGates: [healthy] });
    expect(flow.own).toEqual([]);
    expect(flow.kind).not.toBe('ownApproved');
    expect(approverNames(hosted)).toEqual(['Jesper']);
    expect(stageCardCopy.review.approvedBy(approverNames(hosted))).toBe('Approved by Jesper.');
  });

  test('once Healthy passes, the stage is ready, and says your approval from the records alone', () => {
    expect(cardAfter([TEST_APPROVAL], [released, approved], false).state).toEqual({
      kind: 'ready',
      approvedByYou: true,
    });
    expect(cardAfter([JESPER_APPROVAL], [released, approved], false).state).toEqual({
      kind: 'ready',
      approvedByYou: false,
    });
  });

  test('your rejection while Healthy waits still keeps the box, with Withdraw', () => {
    const rejected: AttestationRead = { ...TEST_APPROVAL, Result: 'Fail', Note: 'not yet' };
    const summary = derive({
      serverRows: [
        {
          ...row(TEST_SPACE, 0),
          Reason: 'AttestationRejected',
          Attestation: {
            ...row(TEST_SPACE, 0).Attestation,
            Attestations: [{ AttestationID: 'att-test', UserID: 'brian', Result: 'Fail', CountedOn: 1 }],
          },
        },
      ],
      attestations: [rejected],
    });
    const state = deriveStageCardState(
      cardInput({
        gates: [released, healthy, approval],
        previousStage: { stageId: 'Test', name: 'Test', verdict: 'released', healthPending: true },
        entryReview: { summary, flow: viewerFlow(summary, {}) },
      }),
    );
    expect(state.kind).toBe('reviewRejected');
    expect(ownLiveRejections(summary).map((d) => d.attestationIds)).toEqual([['att-test']]);
  });

  test('the form says it approves the promotion into Public, over the Revisions in Test', () => {
    expect(reviewCopy.form.submit('Pass', 'Test', 'Public')).toBe(
      'Approve the promotion into Public',
    );
    expect(reviewCopy.form.submit('Fail', 'Test', 'Public')).toBe(
      'Reject the promotion into Public',
    );
    expect(reviewCopy.form.promotionCovers('Test')).toBe('It covers the Revisions in Test.');
    expect(reviewCopy.form.submit('Pass', 'Test')).toBe('Approve the change in Test');
  });
});

test.describe('Test → Public: after the Test approval and the promotion', () => {
  const after = verdicts({ Test: 'released', Public: 'promoted' });
  const records = [TEST_APPROVAL];
  const promotion = promotionReview(records);
  const release = releaseReview(records);

  test('the promotion review holds Brian’s approval, and is no longer on any card', () => {
    expect(promotion.viewer.ownByType.Approval?.attestationIds).toEqual(['att-test']);
    expect(
      stageSectionGates([promotion, release], 'Public', after).map((s) => s.gate.key),
    ).toEqual(['release:Public']);
    expect(stageSectionGates([promotion, release], 'Test', after)).toEqual([]);
  });

  test('the Public card offers Approve for the release, not "Change my decision"', () => {
    const hosted = combineGateReviews(
      stageSectionGates([promotion, release], 'Public', after),
    );
    if (hosted === undefined) throw new Error('expected a review');
    expect(hosted.viewer.ownByType).toEqual({});
    const flow = viewerFlow(hosted, {});
    expect(flow.kind).toBe('form');
    expect(flow.own).toEqual([]);
    const state = deriveStageCardState(
      cardInput({ verdict: 'promoted', releaseReview: { summary: hosted, flow } }),
    );
    expect(state).toMatchObject({
      kind: 'reviewNeeded',
      action: 'release',
      gateKey: 'release:Public',
    });
  });

  test('given both reviews in either order, the Public card combines only the release review', () => {
    for (const given of [
      [release, promotion],
      [promotion, release],
    ]) {
      const hosted = combineGateReviews(given);
      expect(hosted?.gate.key).toBe('release:Public');
      expect(hosted?.feeds?.map((g) => g.key)).toEqual(['release:Public']);
      expect(hosted?.viewer.ownByType).toEqual({});
    }
  });

  test('nothing on the Public card revokes an attestation in a Test Space, and it says so', async () => {
    const own = Object.values(promotion.viewer.ownByType);
    expect(own).toHaveLength(1);
    // Even if the Test decision reached the Public card's "Change my decision", its record is not revoked there.
    const plan = planRevocations(own, records, new Set(), reviewRecordIds(release));
    expect(plan.targets).toEqual([]);
    expect(plan.unrevocable).toEqual([
      { attestationId: 'att-test', spaceSlug: TEST_SPACE.spaceSlug, why: 'otherReview' },
    ]);
    const sent: string[] = [];
    const run = await runRevocations(
      plan,
      async (target) => void sent.push(target.attestationId),
      new Set(),
    );
    expect(sent).toEqual([]);
    expect(run).toMatchObject({
      ok: false,
      revokedSpaceSlugs: [],
      failedSpaceSlug: TEST_SPACE.spaceSlug,
    });
    if (run.ok) return;
    expect((run.error as Error).message).toBe(reviewCopy.confirm.unrevocable.otherReview);
    // On the review that reads the Test Spaces, the same decision is the viewer's to replace.
    const own_ = planRevocations(own, records, new Set(), reviewRecordIds(promotion));
    expect(own_.targets.map((t) => [t.attestationId, t.spaceId])).toEqual([
      ['att-test', TEST_SPACE.spaceId],
    ]);
    expect(own_.unrevocable).toEqual([]);
  });
});

test.describe('a record the gate counts that is listed in another Space', () => {
  // The server finds a gate's Attestations through the Revisions it reads, not by their Space:
  // a Unit moved from `sp-old` keeps Attestations listed there that cover its Revisions.
  const OLD_SPACE = { spaceId: 'sp-old', spaceSlug: 'old-space' };
  const moved: AttestationRead = {
    ...TEST_APPROVAL,
    SpaceID: OLD_SPACE.spaceId,
    SpaceSlug: OLD_SPACE.spaceSlug,
  };

  test('is the viewer’s decision, and "Change my decision" revokes it in the Space it is listed in', () => {
    const review = promotionReview([moved]);
    const own = Object.values(review.viewer.ownByType);
    expect(own.map((d) => d.attestationIds)).toEqual([['att-test']]);
    const plan = planRevocations(own, [moved], new Set(), reviewRecordIds(review));
    expect(plan.targets.map((t) => [t.attestationId, t.spaceId])).toEqual([
      ['att-test', OLD_SPACE.spaceId],
    ]);
    expect(plan.unrevocable).toEqual([]);
  });

  test('a rejection there is withdrawn there, not left holding the stage', () => {
    const rejected: AttestationRead = { ...moved, Result: 'Fail', Note: 'not yet' };
    const review = promotionReview([rejected]);
    const rejections = ownLiveRejections(review);
    expect(rejections).toHaveLength(1);
    expect(
      planRevocations(rejections, [rejected], new Set(), reviewRecordIds(review)).targets.map(
        (t) => t.spaceId,
      ),
    ).toEqual([OLD_SPACE.spaceId]);
  });

  test('not listed in the gate’s rows nor its Spaces, it is no decision on the review at all', () => {
    const review = derive({ serverRows: [row(TEST_SPACE, 0)], attestations: [moved] });
    expect(review.viewer.ownByType).toEqual({});
    expect(reviewRecordIds(review).size).toBe(0);
  });
});

test.describe('a record with no listed Space', () => {
  const unplaced: AttestationRead = { ...TEST_APPROVAL, SpaceID: undefined };

  test('is never sent to a revocation: the change and the withdrawal fail before anything is written', async () => {
    const review = promotionReview([unplaced]);
    const own = Object.values(review.viewer.ownByType);
    expect(own).toHaveLength(1);
    const plan = planRevocations(own, [unplaced], new Set(), reviewRecordIds(review));
    expect(plan.targets).toEqual([]);
    expect(plan.unrevocable).toEqual([
      { attestationId: 'att-test', spaceSlug: 'att-test', why: 'notListed' },
    ]);
    const sent: string[] = [];
    const run = await runRevocations(
      plan,
      async (target) => void sent.push(target.attestationId),
      new Set(),
    );
    expect(sent).toEqual([]);
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect((run.error as Error).message).toBe(reviewCopy.confirm.unrevocable.notListed);
  });

  test('nor is a record the list no longer has, and the other records of the decision are not sent either', async () => {
    const other: AttestationRead = {
      ...TEST_APPROVAL,
      AttestationID: 'att-other',
      SpaceID: 'sp-staging-2',
      SpaceSlug: 'staging-2',
    };
    const review = derive({
      gateSpaces: [TEST_SPACE, { spaceId: 'sp-staging-2', spaceSlug: 'staging-2' }],
      serverRows: [row(TEST_SPACE, 1, [TEST_APPROVAL])],
      attestations: [TEST_APPROVAL, other],
    });
    const own = Object.values(review.viewer.ownByType);
    expect(own.flatMap((d) => d.attestationIds).sort()).toEqual(['att-other', 'att-test']);
    // Read again, the list has only `att-other`.
    const plan = planRevocations(own, [other], new Set(), reviewRecordIds(review));
    expect(plan.unrevocable.map((r) => [r.attestationId, r.why])).toEqual([
      ['att-test', 'notListed'],
    ]);
    const sent: string[] = [];
    const run = await runRevocations(
      plan,
      async (target) => void sent.push(target.attestationId),
      new Set(),
    );
    expect(sent).toEqual([]);
    expect(run.ok).toBe(false);
  });
});

test.describe('the promotion review when the server gate read fails', () => {
  // As before the promotion review moved: a hosted entry review that is not open is said ahead of
  // a 403 or a failed read. The review says why it was not evaluated; the other gates are context.
  const notEvaluated = (why: 'noPermission' | 'error', viewerUserId: string) => {
    const summary = derive({
      notEvaluatedBySpaceId: { [TEST_SPACE.spaceId]: why },
      viewerUserId,
    });
    return { summary, flow: viewerFlow(summary, {}) };
  };
  const previousStage = {
    stageId: 'Test',
    name: 'Test',
    verdict: 'released' as const,
    healthPending: false,
  };

  for (const why of ['noPermission', 'error'] as const) {
    test(`${why}: the review state, with the reason on its flow`, () => {
      const forBrian = notEvaluated(why, 'brian');
      expect(forBrian.flow).toMatchObject({ kind: 'notEvaluated', why, mayDecide: true });
      const refusal = why === 'noPermission' ? { serverGateRefusal: 403 } : {};
      expect(
        deriveStageCardState(cardInput({ previousStage, entryReview: forBrian, ...refusal }))
          .kind,
      ).toBe('reviewNeeded');
      expect(
        deriveStageCardState(
          cardInput({
            previousStage,
            entryReview: notEvaluated(why, 'jesper-not-named'),
            ...refusal,
          }),
        ).kind,
      ).toBe('reviewWaiting');
    });
  }

  test('a 403 with no entry review on the card is still noPermission', () => {
    expect(
      deriveStageCardState(cardInput({ previousStage, serverGateRefusal: 403 })).kind,
    ).toBe('noPermission');
  });
});

test.describe('Test → Public with no Final: Completed once Public is promoted into', () => {
  // `Stage` is `Completed`: every Space of the last stage has the change, and there is no Final.
  const after = verdicts({ Test: 'released', Public: 'promoted' });
  const ENTRY: ReviewedGate = {
    gate: ENTRY_PUBLIC,
    requirementNames: ['prod-approval'],
    gateSpaces: [TEST_SPACE],
    gateStageName: 'Test',
    target: { TargetStage: 'Test' },
    requestStage: 'Test',
  };
  const RELEASE: ReviewedGate = {
    gate: RELEASE_PUBLIC,
    requirementNames: ['prod-approval'],
    gateSpaces: [PUBLIC_SPACE],
    gateStageName: 'Public',
    target: { TargetStage: 'Public' },
    requestStage: 'Public',
  };
  const PUBLIC_APPROVAL: AttestationRead = {
    ...TEST_APPROVAL,
    AttestationID: 'att-public',
    Note: 'prod looks good',
    CreatedAt: iso(-60_000),
    SpaceID: PUBLIC_SPACE.spaceId,
  };
  const reads = (over: Partial<GateServerReads>): GateServerReads => ({
    workflowCompleted: true,
    serverGatesByStage: {},
    serverGateRefusals: {},
    resolvedSpaceIds: new Set([TEST_SPACE.spaceId, PUBLIC_SPACE.spaceId]),
    releasedSpaceIds: new Set([TEST_SPACE.spaceId]),
    releaseReadFailed: false,
    ...over,
  });
  /** The release dry run of prod: 422 while the gate holds, 200 once it passes. */
  const releaseDryRun = (attestations: AttestationRead[]) => ({
    [PUBLIC_SPACE.spaceId]: {
      status: attestations.length > 0 ? 200 : 422,
      body: { Gates: [row(PUBLIC_SPACE, attestations.length, attestations)] },
    },
  });
  const summariesOf = (records: AttestationRead[], read: GateServerReads) => {
    const entryRows = gateServerRowsOf(ENTRY, read);
    const promotion = derive({
      serverRows: [...entryRows.rows],
      notEvaluatedBySpaceId: entryRows.notEvaluatedBySpaceId,
      ...(entryRows.completed ? { completed: true } : {}),
      attestations: records,
    });
    const releaseRows = gateServerRowsOf(RELEASE, read);
    const release = derive({
      gate: RELEASE_PUBLIC,
      gateStageName: 'Public',
      gateSpaces: [PUBLIC_SPACE],
      serverRows: [...releaseRows.rows],
      notEvaluatedBySpaceId: releaseRows.notEvaluatedBySpaceId,
      ...(releaseRows.completed ? { completed: true } : {}),
      attestations: records,
      requestStage: 'Public',
      attestTarget: { ChangeOrderID: 'co', TargetStage: 'Public' },
    });
    return { promotion, release };
  };

  test.describe('the release gate still holds', () => {
    const records = [TEST_APPROVAL];
    const { promotion, release } = summariesOf(
      records,
      reads({ releaseAnswers: releaseDryRun([]) }),
    );

    test('the promotion review is held, and keeps Brian’s Test approval', () => {
      expect(promotion.open).toBe(true);
      expect(promotion.viewer.ownByType.Approval?.attestationIds).toEqual(['att-test']);
    });

    test('the release review is the server’s rows, not held, and does not say the reviewers approved', () => {
      expect(release.open).toBe(false);
      const requirement = release.requirements[0];
      expect(requirement).toMatchObject({ evaluated: true, satisfied: false, need: 1 });
      expect(reviewAside(requirement).icon).toBe('open');
      expect(reviewAside(requirement).text).not.toMatch(/approved by/);
    });

    test('the Public card hosts the release review with Approve, not "Change my decision"', () => {
      const hosted = combineGateReviews(
        stageSectionGates([promotion, release], 'Public', after),
      );
      if (hosted === undefined) throw new Error('expected a review');
      expect(hosted.gate.key).toBe('release:Public');
      expect(hosted.viewer.ownByType).toEqual({});
      const flow = viewerFlow(hosted, {});
      expect(flow.kind).toBe('form');
      expect(flow.own).toEqual([]);
      const state = deriveStageCardState(
        cardInput({ verdict: 'promoted', releaseReview: { summary: hosted, flow } }),
      );
      expect(state).toMatchObject({
        kind: 'reviewNeeded',
        action: 'release',
        gateKey: 'release:Public',
      });
      if (state.kind !== 'reviewNeeded') return;
      expect(flowShowsForm(state.flow)).toBe(true);
    });

    test('nothing on the Public card revokes the Test approval', () => {
      const plan = planRevocations(
        Object.values(promotion.viewer.ownByType),
        records,
        new Set(),
        reviewRecordIds(release),
      );
      expect(plan.targets).toEqual([]);
    });

    test('until the release dry run is read, or when it fails, it is not held either', () => {
      for (const over of [{}, { releaseReadFailed: true }]) {
        const { release: unread } = summariesOf(records, reads(over));
        expect(unread.open).toBe(false);
        expect(unread.requirements[0]).toMatchObject({ evaluated: false, satisfied: false });
      }
    });
  });

  test.describe('the release gate passes', () => {
    test('once approved, the release review is held, and the card offers the release', () => {
      const records = [TEST_APPROVAL, PUBLIC_APPROVAL];
      const { promotion, release } = summariesOf(
        records,
        reads({ releaseAnswers: releaseDryRun([PUBLIC_APPROVAL]) }),
      );
      expect(promotion.open).toBe(true);
      expect(release.open).toBe(true);
      const hosted = combineGateReviews(
        stageSectionGates([promotion, release], 'Public', after),
      );
      if (hosted === undefined) throw new Error('expected a review');
      const state = deriveStageCardState(
        cardInput({
          verdict: 'promoted',
          releaseReview: { summary: hosted, flow: viewerFlow(hosted, {}) },
        }),
      );
      expect(state.kind).toBe('promoted');
    });

    test('once released, every gate is held as complete, with no release dry run', () => {
      const read = reads({
        releasedSpaceIds: new Set([TEST_SPACE.spaceId, PUBLIC_SPACE.spaceId]),
      });
      expect(gateServerRowsOf(RELEASE, read)).toEqual({
        rows: [],
        notEvaluatedBySpaceId: {},
        completed: true,
      });
      const { promotion, release } = summariesOf([TEST_APPROVAL], read);
      expect(promotion.open).toBe(true);
      expect(release.open).toBe(true);
      expect(release.requirements[0]).toMatchObject({ evaluated: true, satisfied: true });
    });

    test('a Space with nothing new to release is held as complete', () => {
      const { release } = summariesOf(
        [TEST_APPROVAL],
        reads({ releaseAnswers: { [PUBLIC_SPACE.spaceId]: { status: 200, body: {} } } }),
      );
      expect(release.open).toBe(true);
    });
  });

  test('before the workflow is complete, a released Space is still "nothing new to release"', () => {
    const read = reads({
      workflowCompleted: false,
      releasedSpaceIds: new Set([TEST_SPACE.spaceId, PUBLIC_SPACE.spaceId]),
    });
    expect(gateServerRowsOf(RELEASE, read)).toEqual({
      rows: [],
      notEvaluatedBySpaceId: { [PUBLIC_SPACE.spaceId]: 'unchanged' },
    });
  });
});
