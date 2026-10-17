// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The writes of the ChangeSet page's reviews, sent with `authFetch` rather than the
 * RTK base query: a reviewer the server refuses (403) is told so on the page, which
 * the base query would replace with /access-denied.
 */

import type { AttestRequest, ChangeSetReviewRequest, ChangeSetReviewRequestRead } from '@confighub/rtk-query';

import { answerOf, revokeAttestation, type Send } from '../change-orders/reviews/quietServerCalls';
import { refusalText } from '../change-orders/reviews/stageReviewInputs';
import type { ReviewChoice, ReviewRequestOutcome } from '../change-orders/reviews/changeOrderReviewTypes';
import { DEFAULT_ATTESTATION_TYPE } from '../change-orders/reviews/changeOrderReviews';
import type { ChangeSetDecision } from './changeSetReviewModel';

const inList = (ids: readonly string[]) => `(${ids.map((id) => `'${id}'`).join(', ')})`;

/**
 * The request that records a decision of the ChangeSet's change: an Approval of the
 * Revision `ChangeSet:<id>` names in each Unit it changed (the head while it is open,
 * its end once closed), in every Space those Units are in.
 */
export function changeSetAttestRequest(args: {
  changeSetId: string;
  spaceIds: readonly string[];
  unitIds: readonly string[];
  result: ReviewChoice;
  note: string;
}): AttestRequest {
  return {
    WhereSpace: `SpaceID IN ${inList(args.spaceIds)}`,
    WhereUnit: `UnitID IN ${inList(args.unitIds)}`,
    Revision: `ChangeSet:${args.changeSetId}`,
    Type: DEFAULT_ATTESTATION_TYPE,
    Result: args.result,
    Note: args.note,
  };
}

export const WITHDRAWN_NOTE = 'Withdrawn';

/** Revokes every record of a decision, each in its own Space. Throws the server's words on a refusal. */
export async function withdrawChangeSetDecision(send: Send, decision: Pick<ChangeSetDecision, 'records'>): Promise<void> {
  for (const record of decision.records) {
    await revokeAttestation(send, record.spaceId, { RevokedAttestationID: record.attestationId, Type: record.type, Note: WITHDRAWN_NOTE });
  }
}

/** One edit of the requests: users to ask, or one to stop asking. */
export interface ChangeSetReviewRequestsEdit {
  add?: string[];
  remove?: string;
}

/**
 * The merge PATCH body that changes `ChangeSet.ReviewRequests`. The list is replaced
 * whole, so every other request is sent back unchanged (with its RequestedAt, so it is
 * not re-requested), with the Version read, so a concurrent change is refused (409)
 * rather than lost.
 */
export function changeSetReviewRequestsPatch(
  current: readonly ChangeSetReviewRequestRead[],
  version: number,
  edit: ChangeSetReviewRequestsEdit,
): { ReviewRequests: ChangeSetReviewRequest[]; Version: number } {
  const kept: ChangeSetReviewRequest[] = current
    .filter((request) => request.UserID !== edit.remove)
    .map((request) => ({ UserID: request.UserID, ...(request.RequestedAt ? { RequestedAt: request.RequestedAt } : {}) }));
  for (const userId of edit.add ?? []) {
    if (!kept.some((request) => request.UserID === userId)) kept.push({ UserID: userId });
  }
  return { ReviewRequests: kept, Version: version };
}

const success = (status: number) => status >= 200 && status < 300;

/**
 * The ReviewRequests merge PATCH, with the Version read. On a 409 the ChangeSet is
 * read again and the PATCH sent once more. `forbidden` on a 403: the caller hides the
 * actions.
 */
export async function changeChangeSetReviewRequests(
  send: Send,
  change: {
    spaceId: string;
    changeSetId: string;
    current: readonly ChangeSetReviewRequestRead[];
    version: number | undefined;
    edit: ChangeSetReviewRequestsEdit;
  },
): Promise<ReviewRequestOutcome & { forbidden?: boolean }> {
  const path = `/api/space/${change.spaceId}/change_set/${change.changeSetId}`;
  const patch = (current: readonly ChangeSetReviewRequestRead[], version: number | undefined) =>
    answerOf(send, path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/merge-patch+json' },
      body: JSON.stringify(changeSetReviewRequestsPatch(current, version ?? 0, change.edit)),
    });
  let answer = await patch(change.current, change.version);
  if (answer.status === 409) {
    const fresh = await answerOf(send, path);
    if (!success(fresh.status)) {
      return { ok: false, message: refusalText(fresh.body)?.trim() || 'The ChangeSet could not be read again.', conflict: true };
    }
    const changeSet = (fresh.body as { ChangeSet?: { ReviewRequests?: ChangeSetReviewRequestRead[]; Version?: number } }).ChangeSet;
    answer = await patch(changeSet?.ReviewRequests ?? [], changeSet?.Version);
  }
  if (success(answer.status)) return { ok: true };
  const message = refusalText(answer.body)?.trim() || `The review request was refused (${answer.status}).`;
  if (answer.status === 403) return { ok: false, message, forbidden: true };
  return { ok: false, message, ...(answer.status === 409 ? { conflict: true } : {}) };
}

/**
 * A dry run of closing the ChangeSet: the bulk Unit PATCH that takes every Unit out of
 * it, which writes nothing and answers with the gates the close would be judged
 * against (`changeSetCloseGates.ts` reads the answer).
 */
export function closeChangeSetDryRun(send: Send, changeSetId: string) {
  const params = new URLSearchParams({ where: `ChangeSetID = '${changeSetId}'`, change_set_id: changeSetId, dry_run: 'true' });
  return answerOf(send, `/api/unit?${params.toString()}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/merge-patch+json' },
    body: JSON.stringify({ ChangeSetID: null }),
  });
}
