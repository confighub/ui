// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The inputs the review hooks give `deriveGateReviews`, and the readings of
 * the server's answers they get back. Pure: no React, no requests.
 *
 * - `reviewedGates`: every gate (entry, release, Final) that names an
 *   attestation requirement, its Spaces, where an `/attest` for it records,
 *   and the stage its review requests name.
 * - `releaseAnswerOf`, `promoteFinalOf`: the Release dry run and the promote
 *   dry run as server rows (#5788), or why there are none. Never a text parse,
 *   except the one refusal the server reports only as text (completed workflow).
 * - `gateServerRowsOf`: those answers as one gate's rows, and why a Space has none.
 * - `reviewCoverageOf`, `attestSpaceErrors`: what an `/attest` covers.
 * - `reviewRequestsPatch`: the merge PATCH body for ChangeOrder.ReviewRequests.
 * - `planRevocations`, `runRevocations`: "Change my decision", and withdrawing
 *   a decision with no new one.
 */

import type {
  AttestationCreateRequest,
  AttestationRead,
  AttestResultRead,
  ChangeOrderPromotion,
  ChangeOrderReviewRequest,
  ChangeOrderReviewRequestRead,
  ChangeWorkflowSpec,
  PromoteGateResult,
  UserRead,
} from '@confighub/rtk-query';

import { classifyPrerequisite } from '../../x/apps/change-order/changeOrderWorkflow';
import { previousStageOf } from '../../x/apps/change-order/changeOrderStages';
import type { ChangeOrderSequence, ChangeOrderStageVerdict } from '../../x/apps/change-order/changeOrderTypes';
import { reviewInitials } from './changeOrderReviews';
import { reviewCopy } from './reviewCopy';
import type {
  GateReviewSummary,
  NotEvaluatedReason,
  ReviewCoverage,
  ReviewDecision,
  ReviewGateKind,
  ReviewGateRef,
  ReviewGateSpace,
  ReviewUser,
  StageReviewRail,
} from './changeOrderReviewTypes';

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/** One gate that names attestation requirements, and where it is evaluated. */
export interface ReviewedGate {
  gate: ReviewGateRef;
  requirementNames: string[];
  gateSpaces: ReviewGateSpace[];
  /** The previous stage name or own Space slug (entry), or the stage itself (release, final). */
  gateStageName: string;
  /** Where an `/attest` records: a stage name, or (first-stage entry) the own Space by WhereSpace. */
  target: { TargetStage?: string; whereSpaceIds?: string[] };
  /** The `ReviewRequest.Stage` that asks for a review in the gate's Spaces ('' = the own Space). */
  requestStage: string;
  /** The stage whose last promotion started the wait. Undefined: the ChangeOrder's creation. */
  waitStageName?: string;
}

export const gateKey = (kind: ReviewGateKind, stageId: string) => `${kind}:${stageId}`;

const gateRef = (kind: ReviewGateKind, stageId: string): ReviewGateRef => ({
  kind,
  stageId,
  stageName: stageId,
  key: gateKey(kind, stageId),
});

/**
 * Every reviewed gate, in time order per stage (entry, then release), Final last.
 *
 * The first stage's entry gate reads the ChangeOrder's own Space, and only when
 * the change is there from the start (`ownSpaceReached`); the server evaluates
 * it only then (`evaluateStageGates`).
 */
export function reviewedGates(
  workflow: ChangeWorkflowSpec | undefined,
  sequence: ChangeOrderSequence,
  context: {
    spaceSlugById: ReadonlyMap<string, string>;
    ownSpaceReached: boolean;
    baseSpaceId?: string;
    baseSpaceSlug?: string;
  },
): ReviewedGate[] {
  if (workflow === undefined) return [];
  const declared = workflow.AttestationPrerequisites ?? [];
  if (declared.length === 0) return [];
  const attestationNames = (names: readonly string[] | undefined) =>
    (names ?? []).filter((name) => classifyPrerequisite(name, workflow.CustomPrerequisites, declared).kind === 'attestation');
  const spacesOf = (ids: readonly string[]) =>
    ids.map((spaceId) => ({ spaceId, spaceSlug: context.spaceSlugById.get(spaceId) ?? spaceId }));

  const gates: ReviewedGate[] = [];
  const stages = sequence.stages.filter((stage) => !stage.isSource);
  for (const stage of stages) {
    const entryNames = attestationNames(stage.prerequisites);
    if (entryNames.length > 0) {
      const previous = previousStageOf(sequence, stage);
      if (previous !== undefined && !previous.isSource) {
        gates.push({
          gate: gateRef('entry', stage.id),
          requirementNames: entryNames,
          gateSpaces: spacesOf(previous.spaceIds),
          gateStageName: previous.id,
          target: { TargetStage: previous.id },
          requestStage: previous.id,
          waitStageName: previous.id,
        });
      } else if (context.ownSpaceReached && context.baseSpaceId !== undefined) {
        gates.push({
          gate: gateRef('entry', stage.id),
          requirementNames: entryNames,
          gateSpaces: spacesOf([context.baseSpaceId]),
          gateStageName: context.baseSpaceSlug ?? context.spaceSlugById.get(context.baseSpaceId) ?? context.baseSpaceId,
          target: { whereSpaceIds: [context.baseSpaceId] },
          requestStage: '',
        });
      }
    }
    const releaseNames = attestationNames((workflow.Stages ?? []).find((s) => s.Name === stage.id)?.ReleasePrerequisites);
    if (releaseNames.length > 0) {
      gates.push({
        gate: gateRef('release', stage.id),
        requirementNames: releaseNames,
        gateSpaces: spacesOf(stage.spaceIds),
        gateStageName: stage.id,
        target: { TargetStage: stage.id },
        requestStage: stage.id,
        waitStageName: stage.id,
      });
    }
  }
  const last = stages[stages.length - 1];
  const finalNames = attestationNames(workflow.Final?.Prerequisites);
  if (last !== undefined && finalNames.length > 0) {
    gates.push({
      gate: gateRef('final', last.id),
      requirementNames: finalNames,
      gateSpaces: spacesOf(last.spaceIds),
      gateStageName: last.id,
      target: { TargetStage: last.id },
      requestStage: last.id,
      waitStageName: last.id,
    });
  }
  return gates;
}

/**
 * Whether a stage's change has landed in at least one of its Spaces. Only a stage known
 * to have none ('gated', 'waiting') has not: any other verdict, 'unknown' included,
 * counts as landed, so the only place to review a gate is never hidden.
 */
export function stageChangeLanded(verdict: ChangeOrderStageVerdict | undefined): boolean {
  return verdict !== 'gated' && verdict !== 'waiting';
}

/** The `/attest` target of a gate. */
export function reviewAttestTarget(
  changeOrderId: string,
  gate: ReviewedGate,
): { ChangeOrderID: string; TargetStage?: string; WhereSpace?: string } {
  if (gate.target.TargetStage !== undefined) return { ChangeOrderID: changeOrderId, TargetStage: gate.target.TargetStage };
  const ids = (gate.target.whereSpaceIds ?? []).map((id) => `'${id}'`);
  return {
    ChangeOrderID: changeOrderId,
    WhereSpace: ids.length === 1 ? `SpaceID = ${ids[0]}` : `SpaceID IN (${ids.join(', ')})`,
  };
}

/** The last promotion into the stage the gate waits on, or the ChangeOrder's creation for the own Space. */
export function reviewLastPromotion(
  gate: ReviewedGate,
  promotions: readonly ChangeOrderPromotion[],
  createdAt: string | undefined,
): string | undefined {
  if (gate.waitStageName === undefined) return createdAt;
  let latest: string | undefined;
  for (const promotion of promotions) {
    if (promotion.Stage !== gate.waitStageName || !promotion.PromotedAt) continue;
    if (latest === undefined || Date.parse(promotion.PromotedAt) > Date.parse(latest)) latest = promotion.PromotedAt;
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Server answers (#5788)
// ---------------------------------------------------------------------------

/** A response as the hooks read it: the HTTP status and the parsed body (a refusal's body too). */
export interface ServerAnswer {
  status: number;
  body: unknown;
}

const gatesOf = (body: unknown): PromoteGateResult[] | undefined => {
  if (typeof body !== 'object' || body === null) return undefined;
  const gates = (body as { Gates?: unknown }).Gates;
  return Array.isArray(gates) ? (gates as PromoteGateResult[]) : undefined;
};

/**
 * One Space's Release dry run (`ReleasePublishResponse`): its `Gates` from a 200
 * or a 422 are the rows; a 200 with no Gates is a Space with nothing new to
 * release; a 403 is no permission; anything else is an error. The text of a
 * refusal is never read.
 */
export function releaseAnswerOf(answer: ServerAnswer): { rows: PromoteGateResult[] } | { notEvaluated: NotEvaluatedReason } {
  const gates = gatesOf(answer.body);
  if ((answer.status >= 200 && answer.status < 300) || answer.status === 422) {
    if (gates !== undefined && gates.length > 0) return { rows: gates };
    if (answer.status !== 422) return { notEvaluated: 'unchanged' };
  }
  if (answer.status === 403) return { notEvaluated: 'noPermission' };
  return { notEvaluated: 'error' };
}

/** The text of a refusal body (`{message}` or `{Message}`). */
export function refusalText(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (typeof body !== 'object' || body === null) return undefined;
  const record = body as { Message?: unknown; message?: unknown };
  if (typeof record.Message === 'string') return record.Message;
  if (typeof record.message === 'string') return record.message;
  return undefined;
}

/**
 * The promote dry run of a ChangeOrder whose workflow is complete: every last-stage
 * Space satisfies Final. `ChangeOrder.Stage` can lag it. The server says so only in
 * words (`refuseCompletedWorkflow`, internal/views/promote_gates.go:381):
 *   errmap.MarkBadRequest(errors.Errorf("change order '%s' has completed ChangeWorkflow '%s', so there is nothing left to promote", ...))
 */
export function isCompletedWorkflowRefusal(answer: { status: number; text?: string }): boolean {
  return answer.status === 400 && /has completed ChangeWorkflow '.*', so there is nothing left to promote/.test(answer.text ?? '');
}

export type PromoteFinalAnswer =
  | { kind: 'open'; rows: PromoteGateResult[] }
  | { kind: 'notOpen' }
  | { kind: 'completed' }
  | { kind: 'noPermission' }
  | { kind: 'error' };

/**
 * A promote dry run with no TargetStage: `Complete` with `Final` rows once every
 * stage has the change (#5788); the completed refusal once Final holds.
 */
export function promoteFinalOf(answer: ServerAnswer): PromoteFinalAnswer {
  if (answer.status >= 200 && answer.status < 300) {
    const body = (answer.body ?? {}) as { Complete?: boolean; Final?: PromoteGateResult[] };
    return body.Complete === true ? { kind: 'open', rows: body.Final ?? [] } : { kind: 'notOpen' };
  }
  if (isCompletedWorkflowRefusal({ status: answer.status, text: refusalText(answer.body) })) return { kind: 'completed' };
  if (answer.status === 403) return { kind: 'noPermission' };
  // A held stage (409) is not about Final: every stage does not have the change yet.
  if (answer.status === 409) return { kind: 'notOpen' };
  return { kind: 'error' };
}

/** The server rows of one gate, why a Space has none, and whether a Space with neither counts as held. */
export interface GateServerRows {
  rows: readonly PromoteGateResult[];
  notEvaluatedBySpaceId: Record<string, NotEvaluatedReason>;
  completed?: boolean;
}

/** What the server answered about a ChangeOrder's gates, as `useChangeOrderDetail` and the Release dry runs read it. */
export interface GateServerReads {
  workflowCompleted: boolean;
  serverGatesByStage: Readonly<Record<string, readonly PromoteGateResult[]>>;
  serverGateRefusals: Readonly<Record<string, number>>;
  finalAnswer?: PromoteFinalAnswer;
  resolvedSpaceIds: ReadonlySet<string>;
  releasedSpaceIds: ReadonlySet<string>;
  /** The Release dry run of each Space, by SpaceID, once read. */
  releaseAnswers?: Readonly<Record<string, ServerAnswer>>;
  releaseReadFailed: boolean;
}

/**
 * The server rows of one gate.
 *
 * A complete workflow (`ChangeOrder.Stage` is `Completed`, or the promote dry run
 * says so) has passed every entry gate and Final, and the server is asked for no
 * rows of them. A release gate is not part of that: the server completes the
 * last stage once its Spaces have the change and satisfy Final, and does not read
 * release gates (with no Final, a promotion completes it). So a release gate is
 * still read from the Release dry run of each Space not yet released; a Space
 * released, or with nothing new to release, counts as held.
 */
export function gateServerRowsOf(gate: ReviewedGate, reads: GateServerReads): GateServerRows {
  const notEvaluatedBySpaceId: Record<string, NotEvaluatedReason> = {};
  const mark = (why: NotEvaluatedReason) => {
    for (const space of gate.gateSpaces) notEvaluatedBySpaceId[space.spaceId] = why;
  };
  const completed = reads.workflowCompleted;
  const { kind, stageId } = gate.gate;
  if (completed && kind !== 'release') return { rows: [], notEvaluatedBySpaceId, completed: true };
  if (kind === 'entry') {
    const rows = reads.serverGatesByStage[stageId];
    if (rows === undefined) mark(reads.serverGateRefusals[stageId] === 403 ? 'noPermission' : 'error');
    return { rows: rows ?? [], notEvaluatedBySpaceId };
  }
  if (kind === 'release') {
    const rows: PromoteGateResult[] = [];
    for (const space of gate.gateSpaces) {
      if (!reads.resolvedSpaceIds.has(space.spaceId)) {
        notEvaluatedBySpaceId[space.spaceId] = 'notReached';
        continue;
      }
      if (reads.releasedSpaceIds.has(space.spaceId)) {
        if (!completed) notEvaluatedBySpaceId[space.spaceId] = 'unchanged';
        continue;
      }
      const answer = reads.releaseAnswers?.[space.spaceId];
      if (answer === undefined) {
        notEvaluatedBySpaceId[space.spaceId] = reads.releaseReadFailed ? 'error' : 'notReached';
        continue;
      }
      const read = releaseAnswerOf(answer);
      if ('rows' in read) rows.push(...read.rows);
      else if (!(completed && read.notEvaluated === 'unchanged')) notEvaluatedBySpaceId[space.spaceId] = read.notEvaluated;
    }
    return { rows, notEvaluatedBySpaceId, ...(completed ? { completed: true } : {}) };
  }
  let rows: PromoteGateResult[] = [];
  const finalAnswer = reads.finalAnswer;
  if (finalAnswer?.kind === 'open') rows = finalAnswer.rows;
  else if (finalAnswer?.kind === 'noPermission') mark('noPermission');
  else if (finalAnswer?.kind === 'error') mark('error');
  else mark('finalNotOpen');
  return { rows, notEvaluatedBySpaceId };
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/** What an `/attest` of one Type would cover. Spaces with an Error are listed apart and left out. */
export function reviewCoverageOf(type: string, result: AttestResultRead | undefined): ReviewCoverage | undefined {
  if (result === undefined) return undefined;
  const spaces = result.Spaces ?? [];
  const failed = spaces.filter((space) => space.Error !== undefined && (space.Error.Message || space.Error.Status));
  const working = spaces.filter((space) => !failed.includes(space));
  return {
    type,
    covered: working.flatMap((space) =>
      (space.Subjects ?? []).map((subject) => ({
        revisionId: subject.RevisionID ?? '',
        ...(subject.UnitID ? { unitId: subject.UnitID } : {}),
        unitSlug: subject.UnitSlug ?? subject.UnitID ?? '',
        spaceSlug: space.SpaceSlug ?? space.SpaceID ?? '',
        revisionNum: subject.RevisionNum ?? 0,
        authored: subject.Authored === true,
      })),
    ),
    skipped: working.flatMap((space) =>
      (space.SkippedUnits ?? []).map((unit) => ({
        unitSlug: unit.UnitSlug ?? unit.UnitID ?? '',
        spaceSlug: space.SpaceSlug ?? space.SpaceID ?? '',
        // A code (NoTarget | NoRevision); the sentence is in Message.
        reason: unit.Reason ?? '',
        ...(unit.Message ? { message: unit.Message } : {}),
      })),
    ),
    spaceErrors: attestSpaceErrors(result),
    spaceCount: working.length,
    recordable: working.some((space) => (space.Subjects?.length ?? 0) > 0),
  };
}

/**
 * The Units the change changed in the Spaces read: those whose start and end Tags mark
 * different Revisions, or that only the end Tag marks (`changeGateRevisions`). `revisions`
 * are the Revisions carrying either Tag. Undefined when they are not known.
 */
export function changedUnitIdsOf(
  revisions: readonly { UnitID?: string; RevisionNum?: number; Tags?: Record<string, unknown> | null }[] | undefined,
  startTagId: string | undefined,
  endTagId: string | undefined,
): ReadonlySet<string> | undefined {
  if (revisions === undefined || startTagId === undefined || endTagId === undefined) return undefined;
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  for (const revision of revisions) {
    if (!revision.UnitID || revision.RevisionNum === undefined) continue;
    const tags = revision.Tags ?? {};
    if (startTagId in tags) starts.set(revision.UnitID, revision.RevisionNum);
    if (endTagId in tags) ends.set(revision.UnitID, revision.RevisionNum);
  }
  const changed = new Set<string>();
  for (const [unitId, end] of ends) if (starts.get(unitId) !== end) changed.add(unitId);
  return changed;
}

/**
 * Marks the covered Revisions of Units the change did not change. Only when every gate of
 * the review reads changed Units alone (entry and Final): a release gate reads every
 * Revision its Release bundles, so then nothing is marked.
 */
export function markUnchanged(coverage: ReviewCoverage, changed: ReadonlySet<string> | undefined, onlyChanged: boolean): ReviewCoverage {
  if (changed === undefined || !onlyChanged) return coverage;
  return {
    ...coverage,
    covered: coverage.covered.map((row) => (row.unitId === undefined || changed.has(row.unitId) ? row : { ...row, unchanged: true })),
  };
}

/** The per-Space errors of an `/attest` answer (a 207, or a dry run without permission). */
export function attestSpaceErrors(result: AttestResultRead | undefined): { spaceSlug: string; message: string }[] {
  return (result?.Spaces ?? []).flatMap((space) => {
    const error = space.Error;
    if (error === undefined || (!error.Message && !error.Status)) return [];
    return [{ spaceSlug: space.SpaceSlug ?? space.SpaceID ?? 'a Space', message: error.Message ?? `error ${error.Status}` }];
  });
}

/** The rail's one line for a gate. */
export function reviewRailOf(summary: GateReviewSummary): StageReviewRail {
  const primary = summary.primary;
  return {
    state: summary.state,
    passes: primary?.passes ?? 0,
    required: primary?.required ?? 0,
    primaryName: primary?.name,
    requirementCount: summary.requirements.length,
    rejecterFirstName: primary?.rejecters[0]?.name.split(/\s+/)[0],
    gateKind: summary.gate.kind,
    evaluated: primary?.evaluated === true,
  };
}

/** A user for the review UI. An unknown user shows a shortened UserID. */
export function reviewUserOf(userId: string, user: Pick<UserRead, 'DisplayName' | 'Username' | 'GroupIDs'> | undefined): ReviewUser {
  const name = user?.DisplayName?.trim() || user?.Username?.trim() || (userId === '' ? 'Not recorded' : userId.slice(0, 8));
  return { userId, name, initials: reviewInitials(name), groupIds: user?.GroupIDs ?? [] };
}

// ---------------------------------------------------------------------------
// Review requests
// ---------------------------------------------------------------------------

/**
 * A RequestedAt later than `previous`, which is what re-requests a review.
 *
 * The server stamps the time itself and only asks whether the one sent is
 * later than the one it holds, so the browser's clock needs to be later, not
 * right. A clock running behind the server's would send a time that is not
 * later and the re-request would silently do nothing, so the time sent is at
 * least a second past the one recorded.
 */
function laterThan(previous: string | undefined, now: number): string {
  const recorded = previous === undefined ? Number.NaN : Date.parse(previous);
  return new Date(Number.isNaN(recorded) ? now : Math.max(now, recorded + 1000)).toISOString();
}

/**
 * The merge PATCH body that changes `ChangeOrder.ReviewRequests`. The list is
 * replaced whole, so every other request is sent back unchanged (with its
 * RequestedAt, so it is not re-requested), with the Version read, so a
 * concurrent change is refused (409) rather than lost.
 *
 * `rerequest` asks one person again: their request is sent with a later
 * RequestedAt, which the server reads as asking again, now; a person not
 * requested yet is requested.
 */
export function reviewRequestsPatch(
  current: readonly ChangeOrderReviewRequestRead[],
  version: number,
  edit: {
    add?: { stage: string; userIds: string[] };
    remove?: { stage: string; userId: string };
    rerequest?: { stage: string; userId: string };
  },
  now: number = Date.now(),
): { ReviewRequests: ChangeOrderReviewRequest[]; Version: number } {
  const same = (request: { Stage?: string; UserID: string }, stage: string, userId: string) =>
    (request.Stage ?? '') === stage && request.UserID === userId;
  const again = edit.rerequest;
  const kept: ChangeOrderReviewRequest[] = current
    .filter((request) => edit.remove === undefined || !same(request, edit.remove.stage, edit.remove.userId))
    .map((request) => {
      const requestedAt =
        again !== undefined && same(request, again.stage, again.userId)
          ? laterThan(request.RequestedAt, now)
          : request.RequestedAt;
      return {
        Stage: request.Stage ?? '',
        UserID: request.UserID,
        ...(requestedAt ? { RequestedAt: requestedAt } : {}),
      };
    });
  const wanted = [
    ...(edit.add?.userIds ?? []).map((userId) => ({ stage: edit.add?.stage ?? '', userId })),
    ...(again !== undefined ? [again] : []),
  ];
  for (const { stage, userId } of wanted) {
    if (!kept.some((request) => same(request, stage, userId))) kept.push({ Stage: stage, UserID: userId });
  }
  return { ReviewRequests: kept, Version: version };
}

// ---------------------------------------------------------------------------
// Change my decision
// ---------------------------------------------------------------------------

/** One record of an earlier decision to revoke, in the Space it is listed in. */
export interface RevocationTarget {
  attestationId: string;
  spaceId: string;
  spaceSlug: string;
  /** The revoked record's Type: a revocation of another Type would be an Approval by default. */
  type: string;
}

/**
 * A record of a decision that this review cannot revoke. `otherReview`: it is not one of
 * the review's records, so taking it back here would take back a decision on another
 * review. `notListed`: the record list does not give its Space, which a revocation needs.
 */
export interface UnrevocableRecord {
  attestationId: string;
  spaceSlug: string;
  why: 'otherReview' | 'notListed';
}

export interface RevocationPlan {
  targets: RevocationTarget[];
  /** Spaces whose record is already revoked: by the loaded data, or earlier in this session. */
  alreadyRevokedSpaceSlugs: string[];
  /** Not empty: nothing is to be sent, since part of the decision would stay in force. */
  unrevocable: UnrevocableRecord[];
}

export const REPLACED_NOTE = 'Replaced by a new decision';
/** The note of a revocation that takes a decision back with no new one in its place. */
export const WITHDRAWN_NOTE = 'Withdrawn';

/** The revocation body (S6): the ChangeOrder and the revoked record's Type. */
export function revocationBody(
  target: RevocationTarget,
  changeOrderId: string,
  note: string = REPLACED_NOTE,
): AttestationCreateRequest {
  return { RevokedAttestationID: target.attestationId, ChangeOrderID: changeOrderId, Type: target.type, Note: note };
}

/**
 * The viewer's own live rejections in a review, one per Type: what withdrawing
 * a rejection revokes. A live approval is left alone, since withdrawing is
 * about the decision that holds the stage.
 */
export function ownLiveRejections(summary: Pick<GateReviewSummary, 'viewer'> | undefined): ReviewDecision[] {
  return Object.values(summary?.viewer.ownByType ?? {}).filter((decision) => decision.live && decision.result === 'Fail');
}

/**
 * The records a review counts as its decisions: those its `deriveGateReviews` took, in
 * its Spaces or named by its server rows. The only records its actions may revoke.
 */
export function reviewRecordIds(summary: Pick<GateReviewSummary, 'decisions'> | undefined): ReadonlySet<string> {
  return new Set((summary?.decisions ?? []).flatMap((decision) => decision.attestationIds));
}

/**
 * The records of `decisions` that still need a revocation. A record already
 * revoked is skipped: the server accepts a second revocation and writes a
 * duplicate (a retry after a part-way failure). `revokedInSession` covers the
 * records revoked before the list is read again.
 *
 * `reviewRecords`: the review's records (`reviewRecordIds`). A record outside them, or
 * with no listed Space, is `unrevocable`, and the caller sends nothing: a new decision
 * with the old one still in force would count twice, and a withdrawal would leave the
 * rejection holding the stage.
 */
export function planRevocations(
  decisions: readonly ReviewDecision[],
  attestations: readonly AttestationRead[],
  revokedInSession: ReadonlySet<string>,
  reviewRecords: ReadonlySet<string>,
): RevocationPlan {
  const revoked = new Set(revokedInSession);
  const spaceIdById = new Map<string, string | undefined>();
  for (const attestation of attestations) {
    if (attestation.RevokedAttestationID) revoked.add(attestation.RevokedAttestationID);
    if (attestation.AttestationID) spaceIdById.set(attestation.AttestationID, attestation.SpaceID);
  }
  const plan: RevocationPlan = { targets: [], alreadyRevokedSpaceSlugs: [], unrevocable: [] };
  for (const decision of decisions) {
    decision.attestationIds.forEach((attestationId, index) => {
      // A record with no listed Space has no slug either: the message names the record.
      const spaceSlug = decision.spaceSlugs[index] || attestationId;
      const spaceId = spaceIdById.get(attestationId);
      if (!reviewRecords.has(attestationId)) plan.unrevocable.push({ attestationId, spaceSlug, why: 'otherReview' });
      else if (revoked.has(attestationId)) plan.alreadyRevokedSpaceSlugs.push(spaceSlug);
      else if (spaceId === undefined || spaceId === '') plan.unrevocable.push({ attestationId, spaceSlug, why: 'notListed' });
      else plan.targets.push({ attestationId, spaceId, spaceSlug, type: decision.type });
    });
  }
  return plan;
}

export type RevocationRun =
  | { ok: true; revokedSpaceSlugs: string[] }
  | { ok: false; revokedSpaceSlugs: string[]; failedSpaceSlug: string; error: unknown };

/**
 * Sends the planned revocations in order and stops at the first failure; each success is
 * remembered. A plan with an `unrevocable` record sends nothing and fails on that record.
 */
export async function runRevocations(
  plan: RevocationPlan,
  revokeOne: (target: RevocationTarget) => Promise<void>,
  revokedInSession: Set<string>,
): Promise<RevocationRun> {
  const revokedSpaceSlugs = [...plan.alreadyRevokedSpaceSlugs];
  const unrevocable = plan.unrevocable[0];
  if (unrevocable !== undefined) {
    return { ok: false, revokedSpaceSlugs, failedSpaceSlug: unrevocable.spaceSlug, error: new Error(reviewCopy.confirm.unrevocable[unrevocable.why]) };
  }
  for (const target of plan.targets) {
    try {
      await revokeOne(target);
    } catch (error) {
      return { ok: false, revokedSpaceSlugs, failedSpaceSlug: target.spaceSlug, error };
    }
    revokedInSession.add(target.attestationId);
    revokedSpaceSlugs.push(target.spaceSlug);
  }
  return { ok: true, revokedSpaceSlugs };
}
