// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Reviews on the stage card: which card hosts a gate's form, where the viewer
 * stands, and what the review rows in the sidebar say.
 *
 * ONE FORM PER GATE, ON ONE CARD AT A TIME. Two forms for one gate would let one
 * person record two decisions on the same Revisions from two places, so the
 * placement rule is a single function every surface asks, the band's "Review now"
 * included.
 *
 * The form for an entry gate (a promotion review) sits on the stage it HOLDS: the
 * reviewer approves where the promotion waits, and the subject stage lists the
 * review read-only with a link. Once that stage is promoted, the promotion review
 * is done with, so its card hosts only its release review: the two read different
 * Spaces, and one form for both would let a decision on one revoke the other.
 */

import { COMPLETE_STAGE_ID } from '../changeOrderCompleteStep';
import { outOfDateDecisions } from '../reviews/changeOrderReviews';
import type {
  GateReviewSummary,
  RequirementProgress,
  ReviewCoverage,
  ReviewDecision,
  ReviewPerson,
} from '../reviews/changeOrderReviewTypes';
import { authorInText, decisionTypes, entryText, placesText, reviewTime } from '../reviews/reviewCopy';
import { stageChangeLanded } from '../reviews/stageReviewInputs';
import type { ChangeOrderStageVerdict } from '../../x/apps/change-order/changeOrderTypes';
import { REVIEWER_ROW_LIMIT, stageCardCopy } from './stageCardCopy';
import type { ReviewAside, ReviewerRow, ReviewerRows, ReviewRejection, ReviewViewerFlow } from './stageTypes';

type Placed = Pick<GateReviewSummary, 'gate' | 'attestTarget'>;
type VerdictOf = (stageId: string) => ChangeOrderStageVerdict | undefined;

/** Verdicts of a stage that has taken its promotion: its entry gate holds nothing now. */
const PROMOTION_DONE: ReadonlySet<ChangeOrderStageVerdict | undefined> = new Set(['promoted', 'released']);

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * The stage whose card hosts a gate's review actions now, or `undefined` while no
 * card does.
 *
 * - Final: the Complete step.
 * - Release: the stage, while it is promoted and still to be released, as its
 *   Release button is.
 * - Entry: the stage it holds, once the change in the stage it reads has landed,
 *   and until that stage is promoted. The first stage's entry gate reads the
 *   ChangeOrder's own Space, which always has the change.
 */
export function reviewActionStageId(summary: Placed, verdictOf: VerdictOf): string | undefined {
  const { gate } = summary;
  if (gate.kind === 'final') return COMPLETE_STAGE_ID;
  if (gate.kind === 'release') return verdictOf(gate.stageId) === 'promoted' ? gate.stageId : undefined;
  if (PROMOTION_DONE.has(verdictOf(gate.stageId))) return undefined;
  const subject = summary.attestTarget.TargetStage;
  if (subject === undefined) return gate.stageId;
  return stageChangeLanded(verdictOf(subject)) ? gate.stageId : undefined;
}

/**
 * The summaries whose actions this stage's card hosts: its release review first,
 * then entry reviews. Never a Final gate, which the Complete step hosts.
 */
export function stageSectionGates(summaries: readonly GateReviewSummary[], stageId: string, verdictOf: VerdictOf): GateReviewSummary[] {
  if (stageId === COMPLETE_STAGE_ID) return summaries.filter((s) => s.gate.kind === 'final');
  const order = (s: GateReviewSummary) => (s.gate.kind === 'release' ? 0 : 1);
  return summaries
    .filter((s) => s.gate.kind !== 'final' && reviewActionStageId(s, verdictOf) === stageId)
    .sort((a, b) => order(a) - order(b));
}

/**
 * Reviews whose subject is this stage's change but whose actions are on another
 * card: listed read-only under "Reviews of this change", with a link to the card
 * that hosts them (`actionStageId`, undefined while none does).
 */
export function subjectReviews(
  summaries: readonly GateReviewSummary[],
  stageId: string,
  verdictOf: VerdictOf,
): { summary: GateReviewSummary; actionStageId: string | undefined }[] {
  return summaries
    .filter((s) => s.gate.kind === 'entry' && s.attestTarget.TargetStage === stageId)
    .map((summary) => ({ summary, actionStageId: reviewActionStageId(summary, verdictOf) }))
    .filter((entry) => entry.actionStageId !== stageId);
}

// ---------------------------------------------------------------------------
// The viewer
// ---------------------------------------------------------------------------

/**
 * Where the viewer stands on a review: which copy the status box says, and
 * whether it offers the form. The order matters: the server's word on the viewer
 * (author, not eligible, signed out) comes before anything the viewer recorded, and
 * a decision that no longer covers what the gates read asks for a new one.
 */
export function viewerFlow(summary: GateReviewSummary, coverageByType: Readonly<Record<string, ReviewCoverage>>): ReviewViewerFlow {
  const { eligibility, ownByType } = summary.viewer;
  const own = Object.values(ownByType);
  const outOfDate = outOfDateDecisions(summary);
  const types = decisionTypes(summary);
  const coverages = types.map((type) => coverageByType[type]).filter((c): c is ReviewCoverage => c !== undefined);

  const authorsCountFor = (type: string) => {
    const ofType = summary.requirements.filter((r) => r.rules.type === type);
    return ofType.length > 0 && ofType.every((r) => r.rules.allowAuthors);
  };
  const countingRevisions =
    coverages.length === 0
      ? undefined
      : coverages.reduce(
          (n, c) => n + c.covered.filter((row) => row.unchanged !== true && (authorsCountFor(c.type) || !row.authored)).length,
          0,
        );
  /** Every Unit the gates read is the viewer's own work, and authors do not count there. */
  const countsNowhere =
    countingRevisions === 0 && coverages.length === types.length && coverages.some((c) => c.covered.some((row) => row.unchanged !== true));
  const viewerWrote =
    summary.requirements.some((r) => r.perSpace.some((space) => (space.caller?.authoredRevisions ?? 0) > 0)) ||
    coverages.some((c) => c.covered.some((row) => row.authored));
  const nothingRecordable = coverages.length === types.length && coverages.length > 0 && coverages.every((c) => !c.recordable);
  const otherRejecter = summary.requirements
    .filter((r) => !r.rules.ignoreFail)
    .flatMap((r) => r.rejecters)
    .find((p) => !p.isYou);
  const authorsAllowed = types.length > 0 && types.every(authorsCountFor);
  const authoredWhere = authoredSpaces(summary, coverages, eligibility);
  const authorNote =
    authoredWhere.length === 0
      ? undefined
      : authorsAllowed
        ? stageCardCopy.review.authorCounts(authoredWhere.join(', '))
        : stageCardCopy.review.authorDoesNotCount(authoredWhere.join(', '));
  const notCounting = eligibility.kind === 'notEligible' || eligibility.kind === 'author';
  const ownNotCounted = notCounting
    ? own.map((d) => stageCardCopy.review.ownNotCounted(d.result, reviewTime(d.createdAt), own.length > 1 ? d.type : undefined, notCountedReasons(summary, d)))
    : [];
  const base = {
    types,
    own,
    nothingRecordable,
    ownNotCounted,
    ...(otherRejecter === undefined ? {} : { otherRejecter }),
    ...(authorNote === undefined ? {} : { authorNote }),
  };

  if (eligibility.kind === 'author') return { kind: 'author', authorIn: authorPlaces(summary, eligibility.authorIn), ...base };
  if (eligibility.kind === 'signedOut') return { kind: 'signedOut', ...base };
  if (eligibility.kind === 'notEligible') return { kind: 'notEligible', ...base };
  if (eligibility.kind === 'notEvaluated' && !eligibility.mayDecide && own.length === 0) {
    return { kind: 'notEvaluated', why: eligibility.why, mayDecide: false, requirementNames: eligibility.requirementNames, ...base };
  }
  if (countsNowhere && (eligibility.kind === 'counts' || eligibility.kind === 'partial')) return { kind: 'countsNowhere', ...base };
  if (own.length > 0 && outOfDate.length === 0) {
    const rejected = own.find((d) => d.result === 'Fail');
    return rejected !== undefined ? { kind: 'ownRejected', decision: rejected, ...base } : { kind: 'ownApproved', decision: own[0], ...base };
  }
  const stale = outOfDate[0];
  if (stale !== undefined) {
    return { kind: 'outOfDate', decision: stale, requirementNames: stale.notCovering ?? [], ...base };
  }
  if (eligibility.kind === 'partial') {
    return { kind: 'partial', requirementNames: eligibility.requirementNames, authorIn: authorPlaces(summary, eligibility.authorIn), ...base };
  }
  if (eligibility.kind === 'notEvaluated') {
    return { kind: 'notEvaluated', why: eligibility.why, mayDecide: true, requirementNames: eligibility.requirementNames, ...base };
  }
  return {
    kind: 'form',
    requirementNames: eligibility.requirementNames,
    authorsMayApprove: viewerWrote && authorsAllowed,
    ...base,
  };
}

/**
 * The Spaces where the viewer wrote part of the change: the eligibility's own list
 * where the server gave one, else the Spaces the server's Caller or the attest dry
 * run says the viewer authored.
 */
function authoredSpaces(
  summary: GateReviewSummary,
  coverages: readonly ReviewCoverage[],
  eligibility: GateReviewSummary['viewer']['eligibility'],
): string[] {
  if (eligibility.kind === 'author' || eligibility.kind === 'partial') return authorPlaces(summary, eligibility.authorIn);
  const spaces: string[] = [];
  const add = (slug: string) => {
    if (slug !== '' && !spaces.includes(slug)) spaces.push(slug);
  };
  for (const r of summary.requirements) for (const space of r.perSpace) if ((space.caller?.authoredRevisions ?? 0) > 0) add(space.spaceSlug);
  for (const c of coverages) for (const row of c.covered) if (row.authored) add(row.spaceSlug);
  return spaces;
}

/** "rrv-dev (1 of 2 Units)" from the server's Caller, else the Space names the eligibility gives. */
function authorPlaces(summary: GateReviewSummary, spaces: readonly string[]): string[] {
  const viewer = summary.primary?.viewer;
  if (viewer !== undefined && (viewer.kind === 'author' || viewer.kind === 'partial') && viewer.authorIn.length > 0) {
    return [authorInText(viewer.authorIn)];
  }
  return spaces.length === 0 ? [] : [placesText(spaces)];
}

/**
 * Why the server does not count a decision, per requirement it reported on, in the
 * words the Review details use: "Not counted: not in security-reviewers". Named by
 * requirement when there are several.
 */
function notCountedReasons(summary: GateReviewSummary, decision: ReviewDecision): string[] {
  const entries = Object.entries(decision.byRequirement).filter(([, entry]) => entry.countedOn === 0 || entry.reason !== undefined);
  return entries.map(([name, entry]) => {
    const text = entryText(entry, decision, summary.requirements.find((r) => r.name === name)?.rules).text;
    return entries.length > 1 ? `${name}: ${text}` : text;
  });
}

/** The flow offers Approve… and Reject…. */
export function flowShowsForm(flow: ReviewViewerFlow): boolean {
  if (flow.kind === 'notEvaluated') return flow.mayDecide;
  return flow.kind === 'form' || flow.kind === 'partial' || flow.kind === 'outOfDate';
}

/**
 * A plain approve or reject records without a dialog. The dialog stays where a
 * decision does more than one thing: several Attestation Types, or a decision
 * that counts only on some of the Units.
 */
export function flowNeedsConfirmDialog(flow: ReviewViewerFlow): boolean {
  return flow.types.length > 1 || flow.kind === 'partial';
}

/** Whether the box shows "Your review is needed" (the viewer can act) or "Waiting on review". */
export function flowIsNeeded(flow: ReviewViewerFlow): boolean {
  return flowShowsForm(flow);
}

// ---------------------------------------------------------------------------
// Rejection
// ---------------------------------------------------------------------------

/** Who rejected the change and what they wrote, or `undefined` when nobody did. */
export function rejection(summary: GateReviewSummary): ReviewRejection | undefined {
  const requirement =
    summary.requirements.find((r) => r.rejected && !r.rules.ignoreFail && r.rejecters.length > 0) ??
    summary.requirements.find((r) => r.rejected && r.rejecters.length > 0);
  const rejecter = requirement?.rejecters[0];
  if (requirement === undefined || rejecter === undefined) return undefined;
  const decision = summary.decisions.find((d) => d.live && d.result === 'Fail' && d.person.userId === rejecter.userId);
  return {
    rejecter,
    ...(decision === undefined ? {} : { decision, createdAt: decision.createdAt }),
    note: decision?.note ?? '',
    requirementName: requirement.name,
  };
}

// ---------------------------------------------------------------------------
// Rows in the sidebar
// ---------------------------------------------------------------------------

/**
 * The reviewers under a review row: people who decided first (newest first), then
 * the viewer, then people asked to review, then anyone else who can still approve.
 * At most `limit`, with the rest counted.
 */
export function reviewerRows(summary: GateReviewSummary, limit: number = REVIEWER_ROW_LIMIT, requirement?: RequirementProgress): ReviewerRows {
  const seen = new Set<string>();
  const decided: ReviewerRow[] = [];
  for (const decision of summary.decisions) {
    if (!decision.live || seen.has(decision.person.userId)) continue;
    if (requirement !== undefined && !decisionCountsFor(decision, requirement)) continue;
    seen.add(decision.person.userId);
    const request = summary.requests.find((r) => r.user.userId === decision.person.userId);
    decided.push({ person: decision.person, status: decision.result === 'Pass' ? 'approved' : 'rejected', decision, ...(request === undefined ? {} : { request }) });
  }
  const pending: { row: ReviewerRow; rank: number }[] = [];
  const add = (person: ReviewPerson, request: ReviewerRow['request']) => {
    if (seen.has(person.userId)) return;
    seen.add(person.userId);
    const rank = person.isYou ? 0 : request !== undefined ? 1 : 2;
    pending.push({ row: { person, status: request !== undefined ? 'requested' : 'notReviewed', ...(request === undefined ? {} : { request }) }, rank });
  };
  for (const entry of summary.whoCanStillApprove) {
    add(entry.person, entry.requested ?? summary.requests.find((r) => r.user.userId === entry.person.userId));
  }
  for (const request of summary.requests) add(request.user, request);
  const rest = pending.sort((a, b) => a.rank - b.rank).map((p) => p.row);
  const all = [...decided, ...rest];
  return { rows: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

/**
 * Whether a decision belongs under a requirement's row: of its Type, and counted
 * toward it (an approval) or blocking it (a rejection). A decision the server said
 * nothing about for any requirement is listed under every requirement of its Type,
 * since nothing says it does not count.
 */
export function decisionCountsFor(decision: ReviewDecision, requirement: RequirementProgress): boolean {
  if (decision.type !== requirement.rules.type) return false;
  const userId = decision.person.userId;
  if (decision.result === 'Fail') {
    if (requirement.rejecters.some((p) => p.userId === userId)) return true;
  } else if (decision.countsToward.includes(requirement.name) || requirement.passers.some((p) => p.userId === userId)) {
    return true;
  }
  return decision.countsToward.length === 0 && Object.keys(decision.byRequirement).length === 0;
}

/** A reviewer's status text, as the row shows it. */
export function reviewerStatusText(row: ReviewerRow, now: number): string {
  const copy = stageCardCopy.reviewRow;
  switch (row.status) {
    case 'approved':
      return copy.statusApproved(row.decision?.createdAt, now);
    case 'rejected':
      return copy.statusRejected(row.decision?.createdAt, now);
    case 'requested':
      return copy.statusRequested;
    case 'notReviewed':
      return copy.statusNotReviewed;
  }
}

const nameOf = (person: ReviewPerson) => (person.isYou ? 'you' : person.name);

/**
 * The review row's icon and aside for one requirement. `subjectNotLanded`: the
 * stage it reads has not been promoted, so the review cannot open yet.
 */
export function reviewAside(requirement: RequirementProgress, subjectNotLanded?: string): ReviewAside {
  const copy = stageCardCopy.reviewRow;
  if (subjectNotLanded !== undefined) return { icon: 'open', text: copy.notLanded(subjectNotLanded) };
  if (requirement.rejected && requirement.rejecters.length > 0) {
    const rejecter = requirement.rejecters[0];
    return { icon: 'rejected', text: rejecter.isYou ? copy.rejectedByYou : copy.rejectedBy(rejecter.name) };
  }
  if (!requirement.evaluated) {
    const why = requirement.notEvaluated;
    return { icon: 'notEvaluated', text: why === undefined ? copy.notEvaluated : (copy.notEvaluatedWhy[why] ?? copy.notEvaluated) };
  }
  if (requirement.satisfied) {
    const passers = requirement.passers;
    if (passers.length === 1 && passers[0].isYou) return { icon: 'ok', text: copy.approvedByYou };
    return { icon: 'ok', text: passers.length === 0 ? copy.approvedBy(['the reviewers']) : copy.approvedBy(passers.map(nameOf)) };
  }
  return { icon: 'open', text: copy.needs(requirement.need) };
}

/** The people whose approvals the server counts toward the review, once each: "you" for the viewer. */
export function approverNames(summary: GateReviewSummary): string[] {
  const names = new Map<string, string>();
  for (const r of summary.requirements) for (const p of r.passers) names.set(p.userId, nameOf(p));
  return [...names.values()];
}

/** The decisions the viewer can withdraw as a rejection: their live Fail decisions. */
export function ownRejections(summary: GateReviewSummary): ReviewDecision[] {
  return Object.values(summary.viewer.ownByType).filter((d) => d.live && d.result === 'Fail');
}
