// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The review calls that a normal reviewer can be REFUSED (403), sent WITHOUT
 * RTK Query's base query.
 *
 * Every RTK call goes through `public/js/packages/rtk-query/src/baseApi.ts`,
 * which hands any 403 to `onForbidden`; in this app that is `handleForbidden`
 * (`ui/src/auth/session.ts`), which replaces the whole page with
 * `/access-denied`. A reviewer without promote or publish permission, or one
 * who may not change the ChangeOrder, is refused these calls as a matter of
 * course, and the page must say "not evaluated for you" or hide one action
 * instead. So they are sent with `send` (`authFetch` in the app: the bearer
 * token attached, no RTK, no global handler), and a 403 is an ANSWER here:
 *
 * - promote dry run (stage gates, Final): 403 → `noPermission`;
 * - Release dry run: 403 → `noPermission`;
 * - `/attest` dry run, `/attest`, a revocation: 403 → the per-call error;
 * - the ReviewRequests PATCH: 403 → `forbidden` (the action is hidden).
 *
 * Pure apart from `send`: the tests pass a fake.
 */

import type {
  AttestRequest,
  AttestResultRead,
  AttestationCreateRequest,
  ChangeOrderReviewRequestRead,
  PromoteRequest,
} from '@confighub/rtk-query';

import { DEFAULT_ATTESTATION_TYPE } from './changeOrderReviews';
import type { ReviewRequestOutcome } from './changeOrderReviewTypes';
import { refusalText, reviewRequestsPatch, type ServerAnswer } from './stageReviewInputs';

/** `authFetch`'s shape: an instance-relative path (`/api/...`) and a RequestInit. */
export type Send = (path: string, init?: RequestInit) => Promise<Response>;

const json = (method: string, body: unknown, contentType = 'application/json'): RequestInit => ({
  method,
  headers: { 'Content-Type': contentType },
  body: JSON.stringify(body),
});

/** The status and the parsed body of one call. A network failure is status 0. */
export async function answerOf(send: Send, path: string, init?: RequestInit): Promise<ServerAnswer> {
  let response: Response;
  try {
    response = await send(path, init);
  } catch (error) {
    return { status: 0, body: { message: error instanceof Error ? error.message : 'The request failed.' } };
  }
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text === '' ? undefined : JSON.parse(text);
  } catch {
    // Not JSON: keep the text, which `refusalText` reads.
  }
  return { status: response.status, body };
}

/** A promote dry run (`TargetStage` for a stage's gates; none for Complete and Final). */
export function promoteDryRun(send: Send, request: Omit<PromoteRequest, 'DryRun'>): Promise<ServerAnswer> {
  return answerOf(send, '/api/promote', json('POST', { ...request, DryRun: true }));
}

/** One Release dry run per Space. */
export async function releaseDryRuns(send: Send, changeOrderId: string, spaceIds: readonly string[]): Promise<Record<string, ServerAnswer>> {
  const answers: Record<string, ServerAnswer> = {};
  await Promise.all(
    spaceIds.map(async (spaceId) => {
      answers[spaceId] = await answerOf(send, `/api/space/${spaceId}/release`, json('POST', { ChangeOrderID: changeOrderId, DryRun: true }));
    }),
  );
  return answers;
}

/** One Type's dry run: what it would cover, or why it was refused. */
export interface DryRunAnswer {
  result?: AttestResultRead;
  error?: string;
  status?: number;
}

const success = (status: number) => status >= 200 && status < 300;

/** One `/attest` dry run per Type. */
export async function attestDryRuns(send: Send, request: AttestRequest, types: readonly string[]): Promise<Record<string, DryRunAnswer>> {
  const answers: Record<string, DryRunAnswer> = {};
  await Promise.all(
    types.map(async (type) => {
      const body: AttestRequest = type === DEFAULT_ATTESTATION_TYPE ? request : { ...request, Type: type };
      const answer = await answerOf(send, '/api/attest?dry_run=true', json('POST', body));
      answers[type] = success(answer.status)
        ? { result: answer.body as AttestResultRead }
        : { error: refusalText(answer.body)?.trim() || `The dry run was refused (${answer.status}).`, status: answer.status };
    }),
  );
  return answers;
}

/** Records the decision of one Type. A refusal is an error with the server's words. */
export async function recordAttestation(send: Send, request: AttestRequest): Promise<{ result: AttestResultRead } | { error: string; status: number }> {
  const answer = await answerOf(send, '/api/attest', json('POST', request));
  if (success(answer.status)) return { result: answer.body as AttestResultRead };
  return { error: refusalText(answer.body)?.trim() || `The decision was refused (${answer.status}).`, status: answer.status };
}

/** Revokes one record. Throws the server's words on a refusal (`runRevocations` stops on it). */
export async function revokeAttestation(send: Send, spaceId: string, body: AttestationCreateRequest): Promise<void> {
  const answer = await answerOf(send, `/api/space/${spaceId}/attestation`, json('POST', body));
  if (!success(answer.status)) throw new Error(refusalText(answer.body)?.trim() || `The revocation was refused (${answer.status}).`);
}

export interface ReviewRequestsChange {
  spaceId: string;
  changeOrderId: string;
  current: readonly ChangeOrderReviewRequestRead[];
  version: number | undefined;
  edit: Parameters<typeof reviewRequestsPatch>[2];
}

/**
 * The ReviewRequests merge PATCH, with the Version read. On a 409 the ChangeOrder
 * is read again and the PATCH sent once more. `forbidden` on a 403: the caller
 * hides the action.
 */
export async function changeReviewRequests(send: Send, change: ReviewRequestsChange): Promise<ReviewRequestOutcome & { forbidden?: boolean }> {
  const path = `/api/space/${change.spaceId}/change_order/${change.changeOrderId}`;
  const patch = (current: readonly ChangeOrderReviewRequestRead[], version: number | undefined) =>
    answerOf(send, path, json('PATCH', reviewRequestsPatch(current, version ?? 0, change.edit), 'application/merge-patch+json'));
  let answer = await patch(change.current, change.version);
  if (answer.status === 409) {
    // The list changed under us: read it again and send once more.
    const fresh = await answerOf(send, path);
    if (!success(fresh.status)) return { ok: false, message: refusalText(fresh.body)?.trim() || 'The change order could not be read again.', conflict: true };
    const order = (fresh.body as { ChangeOrder?: { ReviewRequests?: ChangeOrderReviewRequestRead[]; Version?: number } }).ChangeOrder;
    answer = await patch(order?.ReviewRequests ?? [], order?.Version);
  }
  if (success(answer.status)) return { ok: true };
  const message = refusalText(answer.body)?.trim() || `The review request was refused (${answer.status}).`;
  if (answer.status === 403) return { ok: false, message, forbidden: true };
  return { ok: false, message, ...(answer.status === 409 ? { conflict: true } : {}) };
}
