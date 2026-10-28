// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * REVIEWS ON THE STAGE CARD: WHERE THE FORM IS, AND WHERE THE VIEWER STANDS.
 *
 * ⚠️ ONE FORM PER GATE, ON ONE CARD AT A TIME. Two forms for one gate let one
 * person record two decisions on the same Revisions, so placement is one rule and
 * this spec walks a whole promotion through it, asserting the invariant at every
 * step rather than at a few hand-picked ones.
 *
 * The form for an entry gate is on the stage it holds, once the change it reads
 * has landed. While a stage is promoted and still to be released, its release
 * review and the next stage's entry review are one review on that stage's card.
 *
 * Where the viewer stands decides what the status box offers, and the order is
 * the contract: what the server says about the viewer (author, not eligible)
 * comes before what the viewer recorded.
 */
import { expect, test } from '@playwright/test';

import { COMPLETE_STAGE_ID } from '../src/pages/change-orders/changeOrderCompleteStep';
import type {
  GateReviewSummary,
  RequirementProgress,
  ReviewCoverage,
  ReviewDecision,
  ReviewGateKind,
  ReviewPerson,
  ViewerEligibility,
} from '../src/pages/change-orders/reviews/changeOrderReviewTypes';
import {
  decisionCountsFor,
  flowNeedsConfirmDialog,
  flowShowsForm,
  rejection,
  releaseReviewOf,
  reviewActionStageId,
  reviewAside,
  reviewerRows,
  reviewerStatusText,
  stageSectionGates,
  subjectReviews,
  viewerFlow,
} from '../src/pages/change-orders/stage/stageReviewModel';
import { reviewTime } from '../src/pages/change-orders/reviews/reviewCopy';
import type { ChangeOrderStageVerdict } from '../src/pages/x/apps/change-order/changeOrderTypes';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const person = (userId: string, isYou = false): ReviewPerson => ({ userId, name: userId.toUpperCase(), initials: userId.slice(0, 2), isYou });
const YOU = person('you', true);

function requirement(over: Partial<RequirementProgress> = {}): RequirementProgress {
  return {
    name: 'prod-approval',
    rules: { type: 'Approval', required: 1, count: 1, fromUsers: [], fromGroups: [], distinctGroups: false, allowAuthors: false, ignoreFail: false },
    gate: { kind: 'entry', stageId: 'prod', stageName: 'prod', key: 'entry:prod' },
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

function gateSummary(kind: ReviewGateKind, stageId: string, subject: string | undefined, over: Partial<GateReviewSummary> = {}): GateReviewSummary {
  return {
    gate: { kind, stageId, stageName: stageId, key: `${kind}:${stageId}` },
    gateStageName: subject ?? 'base',
    gateSpaces: [],
    requirements: [requirement()],
    state: 'pending',
    open: false,
    evaluated: true,
    requests: [],
    decisions: [],
    viewer: { eligibility: { kind: 'counts', types: ['Approval'], requirementNames: ['prod-approval'] }, ownByType: {} },
    whoCanStillApprove: [],
    attestTarget: { ChangeOrderID: 'co', ...(subject === undefined ? {} : { TargetStage: subject }) },
    ...over,
  };
}

function decision(over: Partial<ReviewDecision> = {}): ReviewDecision {
  return {
    id: 'd1',
    attestationIds: ['a1'],
    type: 'Approval',
    person: YOU,
    result: 'Pass',
    note: '',
    createdAt: '2026-10-17T12:00:00Z',
    live: true,
    expired: false,
    spaceSlugs: ['prod-eu'],
    byRequirement: {},
    countsToward: ['prod-approval'],
    ...over,
  };
}

const withEligibility = (eligibility: ViewerEligibility, over: Partial<GateReviewSummary> = {}) =>
  gateSummary('entry', 'prod', 'staging', { viewer: { eligibility, ownByType: {} }, ...over });

const coverage = (rows: { authored: boolean; unchanged?: boolean }[], recordable = true): ReviewCoverage => ({
  type: 'Approval',
  covered: rows.map((r, i) => ({ revisionId: `r${i}`, unitSlug: `u${i}`, spaceSlug: 's', revisionNum: 1, authored: r.authored, ...(r.unchanged === undefined ? {} : { unchanged: r.unchanged }) })),
  skipped: [],
  spaceErrors: [],
  spaceCount: 1,
  recordable,
});

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

test.describe('reviewActionStageId', () => {
  const verdicts = (map: Record<string, ChangeOrderStageVerdict>) => (id: string) => map[id];

  test('the first stage’s entry gate reads the ChangeOrder’s own Space: always on the first stage', () => {
    expect(reviewActionStageId(gateSummary('entry', 'dev', undefined), verdicts({ dev: 'waiting' }))).toBe('dev');
  });

  test('an entry gate is on the stage it holds once the change it reads has landed', () => {
    const entry = gateSummary('entry', 'prod', 'staging');
    expect(reviewActionStageId(entry, verdicts({ staging: 'waiting' }))).toBeUndefined();
    expect(reviewActionStageId(entry, verdicts({ staging: 'in-progress' }))).toBe('prod');
    expect(reviewActionStageId(entry, verdicts({ staging: 'released' }))).toBe('prod');
  });

  test('a release gate is on its stage while the stage is promoted', () => {
    const release = gateSummary('release', 'staging', 'staging');
    expect(reviewActionStageId(release, verdicts({ staging: 'promoted' }))).toBe('staging');
    expect(reviewActionStageId(release, verdicts({ staging: 'released' }))).toBeUndefined();
    expect(reviewActionStageId(release, verdicts({ staging: 'waiting' }))).toBeUndefined();
  });

  test('while the subject is promoted with a release review, the entry review joins it there', () => {
    const entry = gateSummary('entry', 'prod', 'staging');
    expect(reviewActionStageId(entry, verdicts({ staging: 'promoted' }), (id) => id === 'staging')).toBe('staging');
    expect(reviewActionStageId(entry, verdicts({ staging: 'promoted' }), () => false)).toBe('prod');
  });

  test('final is on the Complete step', () => {
    expect(reviewActionStageId(gateSummary('final', 'prod', 'prod'), () => 'released')).toBe(COMPLETE_STAGE_ID);
  });
});

test.describe('stageSectionGates: one form per gate, over a whole promotion', () => {
  const summaries = [
    gateSummary('entry', 'dev', undefined),
    gateSummary('release', 'dev', 'dev'),
    gateSummary('entry', 'staging', 'dev'),
    gateSummary('release', 'staging', 'staging'),
    gateSummary('entry', 'prod', 'staging'),
    gateSummary('final', 'prod', 'prod'),
  ];
  const byKey = Object.fromEntries(summaries.map((s) => [s.gate.key, s]));
  const cards = ['dev', 'staging', 'prod', COMPLETE_STAGE_ID];
  const steps: Record<string, ChangeOrderStageVerdict>[] = [
    { dev: 'waiting', staging: 'gated', prod: 'gated' },
    { dev: 'in-progress', staging: 'gated', prod: 'gated' },
    { dev: 'promoted', staging: 'gated', prod: 'gated' },
    { dev: 'released', staging: 'waiting', prod: 'gated' },
    { dev: 'released', staging: 'promoted', prod: 'gated' },
    { dev: 'released', staging: 'released', prod: 'waiting' },
    { dev: 'released', staging: 'released', prod: 'promoted' },
    { dev: 'released', staging: 'released', prod: 'released' },
  ];

  for (const [i, step] of steps.entries()) {
    test(`step ${i + 1}: every gate's form is on at most one card, the one placement names`, () => {
      const verdictOf = (id: string) => step[id];
      const hosts = new Map<string, string[]>();
      for (const card of cards) {
        for (const s of stageSectionGates(summaries, card, verdictOf, releaseReviewOf(byKey))) {
          hosts.set(s.gate.key, [...(hosts.get(s.gate.key) ?? []), card]);
        }
      }
      for (const s of summaries) {
        const on = hosts.get(s.gate.key) ?? [];
        expect(on.length, s.gate.key).toBeLessThanOrEqual(1);
        expect(on[0], s.gate.key).toBe(reviewActionStageId(s, verdictOf, releaseReviewOf(byKey)));
      }
    });
  }

  test('a promoted stage hosts its release review first, then the entry reviews, its own and the next', () => {
    const verdictOf = (id: string) => ({ dev: 'released', staging: 'promoted', prod: 'gated' })[id] as ChangeOrderStageVerdict;
    expect(stageSectionGates(summaries, 'staging', verdictOf, releaseReviewOf(byKey)).map((s) => s.gate.key)).toEqual([
      'release:staging',
      'entry:staging',
      'entry:prod',
    ]);
    expect(stageSectionGates(summaries, 'prod', verdictOf, releaseReviewOf(byKey))).toEqual([]);
  });

  test('the subject stage lists the review hosted elsewhere, read-only, with where it is', () => {
    const verdictOf = (id: string) => ({ dev: 'released', staging: 'released', prod: 'waiting' })[id] as ChangeOrderStageVerdict;
    const listed = subjectReviews(summaries, 'staging', verdictOf, releaseReviewOf(byKey));
    expect(listed.map((x) => [x.summary.gate.key, x.actionStageId])).toEqual([['entry:prod', 'prod']]);
    // While the subject has not landed, no card hosts it yet.
    const early = subjectReviews(summaries, 'staging', () => 'waiting');
    expect(early.map((x) => x.actionStageId)).toEqual([undefined]);
  });
});

// ---------------------------------------------------------------------------
// The viewer
// ---------------------------------------------------------------------------

test.describe('viewerFlow: every eligibility branch', () => {
  test('eligible: the form', () => {
    const flow = viewerFlow(withEligibility({ kind: 'counts', types: ['Approval'], requirementNames: ['prod-approval'] }), {});
    expect(flow).toMatchObject({ kind: 'form', requirementNames: ['prod-approval'], authorsMayApprove: false, types: ['Approval'] });
    expect(flowShowsForm(flow)).toBe(true);
    expect(flowNeedsConfirmDialog(flow)).toBe(false);
  });

  test('author', () => {
    const flow = viewerFlow(withEligibility({ kind: 'author', authorIn: ['dev'] }), {});
    expect(flow).toMatchObject({ kind: 'author', authorIn: ['dev'] });
    expect(flowShowsForm(flow)).toBe(false);
  });

  test('not eligible and signed out', () => {
    expect(viewerFlow(withEligibility({ kind: 'notEligible', requirementNames: [] }), {}).kind).toBe('notEligible');
    expect(viewerFlow(withEligibility({ kind: 'signedOut' }), {}).kind).toBe('signedOut');
  });

  test('not evaluated: the form only when the viewer may decide', () => {
    const closed = viewerFlow(withEligibility({ kind: 'notEvaluated', why: 'noPermission', mayDecide: false, types: [], requirementNames: [] }), {});
    expect(closed).toMatchObject({ kind: 'notEvaluated', mayDecide: false });
    expect(flowShowsForm(closed)).toBe(false);
    const open = viewerFlow(withEligibility({ kind: 'notEvaluated', why: 'error', mayDecide: true, types: ['Approval'], requirementNames: ['prod-approval'] }), {});
    expect(open).toMatchObject({ kind: 'notEvaluated', mayDecide: true });
    expect(flowShowsForm(open)).toBe(true);
  });

  test('counts nowhere: every Unit the gates read is the viewer’s own work', () => {
    const flow = viewerFlow(withEligibility({ kind: 'counts', types: ['Approval'], requirementNames: ['prod-approval'] }), {
      Approval: coverage([{ authored: true }, { authored: true }]),
    });
    expect(flow.kind).toBe('countsNowhere');
    // Authors may approve here: the decision counts.
    const allowed = withEligibility(
      { kind: 'counts', types: ['Approval'], requirementNames: ['prod-approval'] },
      { requirements: [requirement({ rules: { ...requirement().rules, allowAuthors: true } })] },
    );
    expect(viewerFlow(allowed, { Approval: coverage([{ authored: true }]) })).toMatchObject({ kind: 'form', authorsMayApprove: true });
  });

  test('own approval, own rejection', () => {
    const base = { kind: 'counts' as const, types: ['Approval'], requirementNames: ['prod-approval'] };
    const pass = viewerFlow(withEligibility(base, { viewer: { eligibility: base, ownByType: { Approval: decision() } } }), {});
    expect(pass.kind).toBe('ownApproved');
    const fail = viewerFlow(withEligibility(base, { viewer: { eligibility: base, ownByType: { Approval: decision({ result: 'Fail', note: 'no' }) } } }), {});
    expect(fail.kind).toBe('ownRejected');
    expect(flowShowsForm(fail)).toBe(false);
  });

  test('an own decision that no longer covers what the gates read asks for a new one', () => {
    const base = { kind: 'counts' as const, types: ['Approval'], requirementNames: ['prod-approval'] };
    const stale = decision({ notCovering: ['prod-approval'] });
    const flow = viewerFlow(withEligibility(base, { viewer: { eligibility: base, ownByType: { Approval: stale } } }), {});
    expect(flow).toMatchObject({ kind: 'outOfDate', requirementNames: ['prod-approval'] });
    expect(flowShowsForm(flow)).toBe(true);
  });

  test('partial keeps the form and the confirm dialog', () => {
    const flow = viewerFlow(withEligibility({ kind: 'partial', types: ['Approval'], requirementNames: ['prod-approval'], authorIn: ['dev'] }), {});
    expect(flow).toMatchObject({ kind: 'partial', authorIn: ['dev'] });
    expect(flowShowsForm(flow)).toBe(true);
    expect(flowNeedsConfirmDialog(flow)).toBe(true);
  });

  test('several Attestation Types keep the confirm dialog', () => {
    const flow = viewerFlow(withEligibility({ kind: 'counts', types: ['Approval', 'Security'], requirementNames: ['a', 'b'] }), {});
    expect(flowNeedsConfirmDialog(flow)).toBe(true);
  });

  test('another reviewer’s rejection is carried, and nothing recordable is said', () => {
    const summary = withEligibility(
      { kind: 'counts', types: ['Approval'], requirementNames: ['prod-approval'] },
      { requirements: [requirement({ rejected: true, rejecters: [person('jesper')] })] },
    );
    const flow = viewerFlow(summary, { Approval: coverage([{ authored: false }], false) });
    expect(flow.otherRejecter?.userId).toBe('jesper');
    expect(flow.nothingRecordable).toBe(true);
  });
});

test.describe('a requirement lists only the decisions that count toward it', () => {
  const ines = person('ines');
  const security = requirement({ name: 'security-review' });
  const qa = requirement({ name: 'qa-signoff', satisfied: true, need: 0, passers: [ines] });
  const approval = decision({ id: 'ines-qa', person: ines, countsToward: ['qa-signoff'], byRequirement: { 'qa-signoff': { countedOn: 2 }, 'security-review': { countedOn: 0, reason: 'NotEligible' } } });
  const summary = gateSummary('entry', 'prod', 'staging', { requirements: [security, qa], decisions: [approval] });

  test('an approval for another requirement is not listed under this one', () => {
    expect(decisionCountsFor(approval, security)).toBe(false);
    expect(decisionCountsFor(approval, qa)).toBe(true);
    expect(reviewerRows(summary, 3, security).rows.map((r) => r.person.userId)).toEqual([]);
    expect(reviewerRows(summary, 3, qa).rows.map((r) => [r.person.userId, r.status])).toEqual([['ines', 'approved']]);
    // Without a requirement, the row lists everyone, as before.
    expect(reviewerRows(summary).rows.map((r) => r.person.userId)).toEqual(['ines']);
  });

  test('a decision of another Type goes under that Type’s row', () => {
    const other = decision({ type: 'Security', countsToward: [], byRequirement: {} });
    expect(decisionCountsFor(other, security)).toBe(false);
    expect(decisionCountsFor(other, requirement({ rules: { ...security.rules, type: 'Security' } }))).toBe(true);
  });

  test('a rejection is listed where it blocks', () => {
    const jesper = person('jesper');
    const fail = decision({ person: jesper, result: 'Fail', countsToward: [], byRequirement: { 'security-review': { countedOn: 0 } } });
    expect(decisionCountsFor(fail, requirement({ name: 'security-review', rejected: true, rejecters: [jesper] }))).toBe(true);
    expect(decisionCountsFor(fail, qa)).toBe(false);
  });
});

test.describe('viewerFlow: decisions that do not count, and authors', () => {
  test('a viewer who is not eligible but decided is told it is recorded and does not count', () => {
    const eligibility = { kind: 'notEligible' as const, requirementNames: [] };
    const flow = viewerFlow(withEligibility(eligibility, { viewer: { eligibility, ownByType: { Approval: decision() } } }), {});
    expect(flow.kind).toBe('notEligible');
    expect(flow.ownNotCounted).toEqual([`You approved at ${reviewTime('2026-10-17T12:00:00Z')}. It does not count.`]);
  });

  test('the not-counted line says why, in the Review details’ words', () => {
    const eligibility = { kind: 'notEligible' as const, requirementNames: [] };
    const rules = { ...requirement().rules, fromGroups: [{ groupId: 'g1', name: 'security-reviewers', memberUserIds: [] }] };
    const own = decision({ countsToward: [], byRequirement: { 'prod-approval': { countedOn: 0, reason: 'NotEligible' } } });
    const flow = viewerFlow(withEligibility(eligibility, { requirements: [requirement({ rules })], viewer: { eligibility, ownByType: { Approval: own } } }), {});
    expect(flow.ownNotCounted[0]).toContain('It does not count. Not counted: not in security-reviewers.');
  });

  test('the same for an author, and the Type is named when there are several', () => {
    const eligibility = { kind: 'author' as const, authorIn: ['dev'] };
    const own = { Approval: decision(), Security: decision({ id: 'd2', type: 'Security', result: 'Fail' }) };
    const flow = viewerFlow(withEligibility(eligibility, { viewer: { eligibility, ownByType: own } }), {});
    expect(flow.ownNotCounted).toEqual([
      `You approved (Approval) at ${reviewTime('2026-10-17T12:00:00Z')}. It does not count.`,
      `You rejected (Security) at ${reviewTime('2026-10-17T12:00:00Z')}. It does not count.`,
    ]);
    expect(flow.authorNote).toBe('You wrote part of this change in dev, so your decision does not count there.');
  });

  test('an eligible viewer’s decision is not "not counted"', () => {
    const eligibility = { kind: 'counts' as const, types: ['Approval'], requirementNames: ['prod-approval'] };
    const flow = viewerFlow(withEligibility(eligibility, { viewer: { eligibility, ownByType: { Approval: decision() } } }), {});
    expect(flow.ownNotCounted).toEqual([]);
  });

  test('where the requirement accepts authors, an author is told they can review it', () => {
    const allowed = withEligibility(
      { kind: 'counts', types: ['Approval'], requirementNames: ['prod-approval'] },
      { requirements: [requirement({ rules: { ...requirement().rules, allowAuthors: true } })] },
    );
    const flow = viewerFlow(allowed, { Approval: coverage([{ authored: true }]) });
    expect(flow).toMatchObject({ kind: 'form', authorsMayApprove: true });
    expect(flow.authorNote).toBe('You wrote part of this change in s. Authors may approve here, so you can review it.');
    expect(flow.authorNote).not.toContain('does not count');
  });

  test('a viewer who wrote none of it gets no author note', () => {
    const flow = viewerFlow(withEligibility({ kind: 'counts', types: ['Approval'], requirementNames: ['prod-approval'] }), { Approval: coverage([{ authored: false }]) });
    expect(flow.authorNote).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

test.describe('reviewer rows and asides', () => {
  test('decided first, then you, then requested, then the rest; at most three', () => {
    const ana = person('ana');
    const tom = person('tom');
    const kim = person('kim');
    const summary = gateSummary('entry', 'prod', 'staging', {
      decisions: [decision({ id: 'x', person: ana, result: 'Pass' }), decision({ id: 'old', person: ana, live: false })],
      whoCanStillApprove: [{ person: kim }, { person: tom }, { person: YOU }],
      requests: [{ stage: 'staging', gateKeys: ['entry:prod'], user: tom, requestedAt: '2026-10-17T11:00:00Z', reviewed: false }],
    });
    const { rows, more } = reviewerRows(summary);
    expect(rows.map((r) => [r.person.userId, r.status])).toEqual([
      ['ana', 'approved'],
      ['you', 'notReviewed'],
      ['tom', 'requested'],
    ]);
    expect(more).toBe(1);
    expect(reviewerStatusText(rows[1], 0)).toBe('Not reviewed yet');
    expect(reviewerStatusText(rows[2], 0)).toBe('Requested');
  });

  test('the aside per requirement', () => {
    expect(reviewAside(requirement({ need: 2 }))).toEqual({ icon: 'open', text: 'needs 2 approvals' });
    expect(reviewAside(requirement({ satisfied: true, need: 0, passers: [YOU] }))).toEqual({ icon: 'ok', text: 'approved by you' });
    expect(reviewAside(requirement({ satisfied: true, need: 0, passers: [person('ana'), YOU] }))).toEqual({ icon: 'ok', text: 'approved by ANA and you' });
    expect(reviewAside(requirement({ rejected: true, rejecters: [person('jesper')] }))).toEqual({ icon: 'rejected', text: 'rejected by JESPER' });
    expect(reviewAside(requirement({ rejected: true, rejecters: [YOU] }))).toEqual({ icon: 'rejected', text: 'rejected by you' });
    expect(reviewAside(requirement({ evaluated: false, notEvaluated: 'noPermission' }))).toEqual({ icon: 'notEvaluated', text: 'Not evaluated for you' });
    expect(reviewAside(requirement(), 'staging')).toEqual({ icon: 'open', text: 'Opens once staging is promoted' });
  });

  test('rejection: who, what they said, on which requirement', () => {
    const jesper = person('jesper');
    const summary = gateSummary('entry', 'prod', 'staging', {
      state: 'rejected',
      requirements: [requirement({ rejected: true, rejecters: [jesper] })],
      decisions: [decision({ person: jesper, result: 'Fail', note: 'The replica count is wrong.' })],
    });
    expect(rejection(summary)).toMatchObject({ rejecter: jesper, note: 'The replica count is wrong.', requirementName: 'prod-approval', createdAt: '2026-10-17T12:00:00Z' });
    expect(rejection(gateSummary('entry', 'prod', 'staging'))).toBeUndefined();
  });
});
