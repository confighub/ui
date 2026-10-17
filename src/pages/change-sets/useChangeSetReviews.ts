// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The reviews of one ChangeSet, and the writes that change them: record or withdraw
 * a decision, and request or withdraw a review.
 *
 * Decisions are read from the ChangeSet's Revisions (`useChangeSetDetail`); this adds
 * the revocations of their records and the names of everyone involved. Every write
 * re-reads the ChangeSet and its Revisions when it lands.
 */

import { useCallback, useMemo, useState } from 'react';

import { useListUsersQuery } from '@confighub/rtk-query';

import { authFetch } from '@/auth/session';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { useListUsersByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';

import { recordAttestation } from '../change-orders/reviews/quietServerCalls';
import { useListRevocationsQuery } from '../change-orders/reviews/reviewAttestationsApi';
import type { ReviewChoice, ReviewPerson, ReviewRequestOutcome } from '../change-orders/reviews/changeOrderReviewTypes';
import {
  approvalRecords,
  changeSetReviewUserIds,
  deriveChangeSetReviews,
  reviewPersonOf,
  type ChangeSetDecision,
  type ChangeSetReviewSummary,
} from './changeSetReviewModel';
import { changeChangeSetReviewRequests, changeSetAttestRequest, withdrawChangeSetDecision } from './changeSetServerCalls';
import type { ChangeSetDetail } from './useChangeSetDetail';

export type RecordOutcome = { ok: true } | { ok: false; message: string };

export interface UseChangeSetReviewsResult {
  summary: ChangeSetReviewSummary;
  /** Who created the ChangeSet; absent for one created before that was recorded. */
  creator?: ReviewPerson;
  /** Who forced it closed past its ChangeWorkflow's gates, if anyone did. */
  closedBy?: ReviewPerson;
  /** Who may be asked for a review: the organization's Users. */
  candidates: ReviewPerson[];
  /** False once the server refused a request PATCH (403): no request actions. */
  canRequest: boolean;
  record: (result: ReviewChoice, note: string) => Promise<RecordOutcome>;
  withdraw: (decision: ChangeSetDecision) => Promise<RecordOutcome>;
  requestReview: (userIds: string[]) => Promise<ReviewRequestOutcome>;
  withdrawRequest: (userId: string) => Promise<ReviewRequestOutcome>;
}

const userName = (user: { DisplayName?: string; Username?: string } | undefined) => user?.DisplayName || user?.Username || undefined;

export function useChangeSetReviews(detail: ChangeSetDetail): UseChangeSetReviewsResult {
  const { userInfo } = useUserInfo();
  const viewerUserId = userInfo?.UserID;
  const revisions = useMemo(() => detail.revisions ?? [], [detail.revisions]);
  const requests = useMemo(() => detail.changeSet?.ReviewRequests ?? [], [detail.changeSet?.ReviewRequests]);

  const attestationIds = useMemo(
    () => approvalRecords(revisions).flatMap(({ record }) => (record.AttestationID ? [record.AttestationID] : [])),
    [revisions],
  );
  const revocations = useListRevocationsQuery({ attestationIds }, { skip: attestationIds.length === 0 });
  const revocationRecords = useMemo(() => revocations.data ?? [], [revocations.data]);

  const creatorId = detail.changeSet?.UserID;
  const closedById = detail.changeSet?.CloseOverride?.UserID;
  const userIds = useMemo(
    () =>
      [
        ...new Set([
          ...changeSetReviewUserIds(revisions, revocationRecords, requests),
          ...(creatorId ? [creatorId] : []),
          ...(closedById ? [closedById] : []),
        ]),
      ].sort(),
    [revisions, revocationRecords, requests, creatorId, closedById],
  );
  const named = useListUsersByIdChunkedQuery({ userIds }, { skip: userIds.length === 0 });
  const everyone = useListUsersQuery({});
  const userNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const entry of [...(everyone.data ?? []), ...(named.data ?? [])]) {
      const name = userName(entry.User);
      if (entry.User?.UserID && name !== undefined) names.set(entry.User.UserID, name);
    }
    return names;
  }, [everyone.data, named.data]);

  const summary = useMemo(
    () => deriveChangeSetReviews({ revisions, revocations: revocationRecords, requests, userNames, viewerUserId }),
    [revisions, revocationRecords, requests, userNames, viewerUserId],
  );
  const candidates = useMemo(
    () =>
      (everyone.data ?? [])
        .flatMap((entry) => (entry.User?.UserID ? [reviewPersonOf(entry.User.UserID, userNames, viewerUserId)] : []))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [everyone.data, userNames, viewerUserId],
  );

  const [canRequest, setCanRequest] = useState(true);
  const { refetch } = detail;
  const changeSetId = detail.changeSet?.ChangeSetID;
  const spaceId = detail.changeSet?.SpaceID;
  const version = detail.changeSet?.Version;
  const { changedSpaceIds, changedUnitIds } = detail;
  const refetchRevocations = revocations.refetch;

  const record = useCallback(
    async (result: ReviewChoice, note: string): Promise<RecordOutcome> => {
      if (changeSetId === undefined) return { ok: false, message: 'The ChangeSet is not loaded.' };
      const answer = await recordAttestation(
        authFetch,
        changeSetAttestRequest({ changeSetId, spaceIds: changedSpaceIds, unitIds: changedUnitIds, result, note }),
      );
      refetch();
      if ('error' in answer) return { ok: false, message: answer.error };
      const errors = (answer.result.Spaces ?? []).flatMap((space) => (space.Error?.Message ? [`${space.SpaceSlug}: ${space.Error.Message}`] : []));
      return errors.length === 0 ? { ok: true } : { ok: false, message: errors.join('\n') };
    },
    [changeSetId, changedSpaceIds, changedUnitIds, refetch],
  );

  const withdraw = useCallback(
    async (decision: ChangeSetDecision): Promise<RecordOutcome> => {
      try {
        await withdrawChangeSetDecision(authFetch, decision);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'The decision could not be withdrawn.' };
      } finally {
        refetch();
        if (attestationIds.length > 0) void refetchRevocations();
      }
    },
    [refetch, refetchRevocations, attestationIds.length],
  );

  const changeRequests = useCallback(
    async (edit: { add?: string[]; remove?: string }): Promise<ReviewRequestOutcome> => {
      if (changeSetId === undefined || spaceId === undefined) return { ok: false, message: 'The ChangeSet is not loaded.' };
      const outcome = await changeChangeSetReviewRequests(authFetch, { spaceId, changeSetId, current: requests, version, edit });
      if (outcome.forbidden === true) setCanRequest(false);
      refetch();
      return outcome;
    },
    [changeSetId, spaceId, requests, version, refetch],
  );
  const requestReview = useCallback((userIds: string[]) => changeRequests({ add: userIds }), [changeRequests]);
  const withdrawRequest = useCallback((userId: string) => changeRequests({ remove: userId }), [changeRequests]);

  const creator = creatorId ? reviewPersonOf(creatorId, userNames, viewerUserId) : undefined;
  const closedBy = closedById ? reviewPersonOf(closedById, userNames, viewerUserId) : undefined;
  return { summary, creator, closedBy, candidates, canRequest, record, withdraw, requestReview, withdrawRequest };
}
