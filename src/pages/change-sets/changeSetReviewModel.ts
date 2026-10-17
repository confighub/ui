// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The reviews of one ChangeSet: who approved or rejected its change, whether each
 * decision is of the change as it stands now, and whose review was asked for.
 *
 * A decision is an Approval Attestation recorded of the ChangeSet's Revisions
 * (`Revision: ChangeSet:<id>`), so it is read back from those Revisions'
 * `Attestations`. While the ChangeSet is open its change can still move: a
 * decision that does not cover the latest Revision of every Unit the ChangeSet
 * changed is of an earlier state, and is shown as out of date rather than
 * counted. There is no gate here: the counts say what the reviewers decided, and
 * nothing is held by them.
 *
 * PURE, so `change-set-review-model.pure.spec.ts` can check it without a page.
 */

import type { AttestationRead, ChangeSetReviewRequestRead, ExtendedRevisionRead } from '@confighub/rtk-query';

import { DECISION_WINDOW_MS, DEFAULT_ATTESTATION_TYPE, attestationType, reviewInitials } from '../change-orders/reviews/changeOrderReviews';
import type { ReviewChoice, ReviewPerson, ReviewRequestView } from '../change-orders/reviews/changeOrderReviewTypes';

/** One Attestation record of a decision, and the Space it is in, where it is revoked. */
export interface ChangeSetDecisionRecord {
  attestationId: string;
  spaceId: string;
  type: string;
}

/** One decision: the records one person made in one `/attest` call, one per Space. */
export interface ChangeSetDecision {
  id: string;
  records: ChangeSetDecisionRecord[];
  person: ReviewPerson;
  result: ReviewChoice;
  note: string;
  createdAt: string;
  /** Every record is revoked. */
  revokedAt?: string;
  revokedBy?: ReviewPerson;
  /** The id of a later decision by the same person, which takes this one's place. */
  supersededBy?: string;
  /** It covers the latest Revision of every Unit the ChangeSet changed. */
  current: boolean;
}

export type ChangeSetRequestView = Pick<ReviewRequestView, 'stage' | 'user' | 'requestedAt' | 'requestedBy' | 'reviewed'>;

export interface ChangeSetReviewSummary {
  /** Newest first. */
  decisions: ChangeSetDecision[];
  /** Live decisions of the change as it stands: approvals and rejections. */
  approvals: number;
  rejections: number;
  /** Live decisions of an earlier state of the change. */
  outOfDate: number;
  requests: ChangeSetRequestView[];
  /** The Users who wrote the ChangeSet's Revisions. */
  authorUserIds: string[];
  authors: ReviewPerson[];
  viewerIsAuthor: boolean;
  /** The viewer's live decision, if any. */
  viewerDecision?: ChangeSetDecision;
}

export interface DeriveChangeSetReviewsInput {
  /** The Revisions made in the ChangeSet, with `include=Attestations`. */
  revisions: readonly ExtendedRevisionRead[];
  /** The records that revoke any of the decisions' records. */
  revocations: readonly AttestationRead[];
  requests: readonly ChangeSetReviewRequestRead[];
  /** User id -> display name. */
  userNames: ReadonlyMap<string, string>;
  viewerUserId: string | undefined;
}

/** A person as the review parts draw one: a name, initials, and whether it is the viewer. */
export function reviewPersonOf(userId: string, userNames: ReadonlyMap<string, string>, viewerUserId: string | undefined): ReviewPerson {
  const name = userNames.get(userId) ?? userId.slice(0, 8);
  return { userId, name, initials: reviewInitials(name), isYou: userId === viewerUserId };
}

/** Unit id -> the RevisionID of its latest Revision in the ChangeSet. */
export function latestRevisionByUnit(revisions: readonly ExtendedRevisionRead[]): Map<string, string> {
  const latest = new Map<string, { num: number; id: string }>();
  for (const entry of revisions) {
    const revision = entry.Revision;
    if (revision?.UnitID === undefined || revision.RevisionID === undefined) continue;
    const num = revision.RevisionNum ?? 0;
    const seen = latest.get(revision.UnitID);
    if (seen === undefined || num > seen.num) latest.set(revision.UnitID, { num, id: revision.RevisionID });
  }
  return new Map([...latest].map(([unitId, { id }]) => [unitId, id]));
}

/** The Users who wrote the ChangeSet's Revisions, sorted. */
export function changeSetAuthors(revisions: readonly ExtendedRevisionRead[]): string[] {
  const ids = new Set<string>();
  for (const entry of revisions) if (entry.Revision?.UserID) ids.add(entry.Revision.UserID);
  return [...ids].sort();
}

/** Every user id the summary names, for one read of their names. */
export function changeSetReviewUserIds(
  revisions: readonly ExtendedRevisionRead[],
  revocations: readonly AttestationRead[],
  requests: readonly ChangeSetReviewRequestRead[],
): string[] {
  const ids = new Set(changeSetAuthors(revisions));
  for (const entry of revisions) for (const record of entry.Attestations ?? []) if (record.UserID) ids.add(record.UserID);
  for (const record of revocations) if (record.UserID) ids.add(record.UserID);
  for (const request of requests) {
    ids.add(request.UserID);
    if (request.RequestedByUserID) ids.add(request.RequestedByUserID);
  }
  return [...ids].sort();
}

/** The Approval records on the ChangeSet's Revisions, each with the Revisions it covers. */
export function approvalRecords(revisions: readonly ExtendedRevisionRead[]): { record: AttestationRead; revisionIds: Set<string> }[] {
  const byId = new Map<string, { record: AttestationRead; revisionIds: Set<string> }>();
  for (const entry of revisions) {
    const revisionId = entry.Revision?.RevisionID;
    for (const record of entry.Attestations ?? []) {
      if (record.AttestationID === undefined || attestationType(record.Type) !== DEFAULT_ATTESTATION_TYPE) continue;
      let found = byId.get(record.AttestationID);
      if (found === undefined) {
        found = { record, revisionIds: new Set() };
        byId.set(record.AttestationID, found);
      }
      if (revisionId !== undefined) found.revisionIds.add(revisionId);
    }
  }
  return [...byId.values()];
}

const epoch = (iso: string | undefined) => (iso === undefined ? 0 : Date.parse(iso) || 0);

export function deriveChangeSetReviews(input: DeriveChangeSetReviewsInput): ChangeSetReviewSummary {
  const { revisions, revocations, requests, userNames, viewerUserId } = input;
  const person = (userId: string) => reviewPersonOf(userId, userNames, viewerUserId);
  const latest = new Set(latestRevisionByUnit(revisions).values());

  const revokedBy = new Map<string, AttestationRead>();
  for (const record of revocations) if (record.RevokedAttestationID) revokedBy.set(record.RevokedAttestationID, record);

  // Records of one person with the same result and reason, within the window of the first, are one decision.
  const records = approvalRecords(revisions).sort((a, b) => epoch(a.record.CreatedAt) - epoch(b.record.CreatedAt));
  const groups: { first: AttestationRead; items: typeof records }[] = [];
  for (const item of records) {
    const { record } = item;
    const group = groups.find(
      (g) =>
        g.first.UserID === record.UserID &&
        g.first.Result === record.Result &&
        (g.first.Note ?? '') === (record.Note ?? '') &&
        epoch(record.CreatedAt) - epoch(g.first.CreatedAt) <= DECISION_WINDOW_MS,
    );
    if (group !== undefined) group.items.push(item);
    else groups.push({ first: record, items: [item] });
  }

  const decisions: ChangeSetDecision[] = groups.map(({ first, items }) => {
    const covered = new Set(items.flatMap((item) => [...item.revisionIds]));
    const revocationsOf = items.map((item) => revokedBy.get(item.record.AttestationID ?? ''));
    const allRevoked = revocationsOf.every((r) => r !== undefined);
    const lastRevocation = allRevoked
      ? revocationsOf.reduce<AttestationRead | undefined>((a, b) => (epoch(b?.CreatedAt) > epoch(a?.CreatedAt) ? b : a), undefined)
      : undefined;
    return {
      id: first.AttestationID ?? '',
      records: items.map((item) => ({
        attestationId: item.record.AttestationID ?? '',
        spaceId: item.record.SpaceID ?? '',
        type: attestationType(item.record.Type),
      })),
      person: person(first.UserID ?? ''),
      result: first.Result === 'Fail' ? 'Fail' : 'Pass',
      note: first.Note ?? '',
      createdAt: first.CreatedAt ?? '',
      ...(lastRevocation !== undefined
        ? { revokedAt: lastRevocation.CreatedAt, revokedBy: lastRevocation.UserID ? person(lastRevocation.UserID) : undefined }
        : {}),
      current: latest.size > 0 && [...latest].every((id) => covered.has(id)),
    };
  });

  // A person's latest decision that is not revoked takes the place of their earlier ones.
  const effective = new Map<string, ChangeSetDecision>();
  for (const decision of decisions) {
    if (decision.revokedAt !== undefined) continue;
    const before = effective.get(decision.person.userId);
    if (before === undefined || epoch(decision.createdAt) >= epoch(before.createdAt)) effective.set(decision.person.userId, decision);
  }
  for (const decision of decisions) {
    const winner = effective.get(decision.person.userId);
    if (decision.revokedAt === undefined && winner !== undefined && winner.id !== decision.id) decision.supersededBy = winner.id;
  }
  const live = [...effective.values()];

  const authorUserIds = changeSetAuthors(revisions);
  const reviewedBy = new Set(live.filter((d) => d.current).map((d) => d.person.userId));
  return {
    decisions: decisions.sort((a, b) => epoch(b.createdAt) - epoch(a.createdAt)),
    approvals: live.filter((d) => d.current && d.result === 'Pass').length,
    rejections: live.filter((d) => d.current && d.result === 'Fail').length,
    outOfDate: live.filter((d) => !d.current).length,
    requests: requests.map((request) => ({
      stage: '',
      user: person(request.UserID),
      requestedAt: request.RequestedAt ?? '',
      ...(request.RequestedByUserID ? { requestedBy: person(request.RequestedByUserID) } : {}),
      reviewed: reviewedBy.has(request.UserID),
    })),
    authorUserIds,
    authors: authorUserIds.map(person),
    viewerIsAuthor: viewerUserId !== undefined && authorUserIds.includes(viewerUserId),
    ...(viewerUserId !== undefined && effective.has(viewerUserId) ? { viewerDecision: effective.get(viewerUserId) } : {}),
  };
}

/** `2 approvals · 1 out of date`, or `No reviews yet`. */
export function reviewStatusText(summary: Pick<ChangeSetReviewSummary, 'approvals' | 'rejections' | 'outOfDate'>): string {
  const parts: string[] = [];
  if (summary.approvals > 0) parts.push(summary.approvals === 1 ? '1 approval' : `${summary.approvals} approvals`);
  if (summary.rejections > 0) parts.push(summary.rejections === 1 ? '1 rejection' : `${summary.rejections} rejections`);
  if (summary.outOfDate > 0) parts.push(`${summary.outOfDate} out of date`);
  return parts.length === 0 ? 'No reviews yet' : parts.join(' · ');
}
