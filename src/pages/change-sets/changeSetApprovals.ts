// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How many live approvals each ChangeSet of the list has, for the No approvals card: the same
 * count a row shows ("1 approval"), of every ChangeSet the list shows rather than of the rows on
 * screen. The card is for changes still to be reviewed: open ones, and those closed lately, which
 * a change is before it is promoted. A ChangeSet that is New has changed nothing to approve, and
 * one closed longer ago is history, which would grow the count and the read without end.
 */

import { useCallback, useMemo } from 'react';

import type { AttestationRead, ChangeSetRead, ExtendedRevisionRead } from '@confighub/rtk-query';

import { useListRevocationsQuery } from '../change-orders/reviews/reviewAttestationsApi';
import { approvalRecords, deriveChangeSetReviews } from './changeSetReviewModel';
import { useGetChangeSetsRevisionsQuery } from './changeSetListApi';

const NO_USERS: ReadonlyMap<string, string> = new Map();

/** How long a closed ChangeSet stays among those still to be reviewed. */
export const RECENTLY_CLOSED_DAYS = 30;

/**
 * Whether a ChangeSet has a change still to be reviewed, as of `now` (epoch ms): it is open, or
 * it closed in the last `RECENTLY_CLOSED_DAYS`. A ChangeSet records no time it closed; closing
 * it is its last update unless it is edited after, as by a label, which keeps it recent.
 */
export const hasChangeToApprove = (changeSet: ChangeSetRead, now: number) => {
  if (changeSet.State === 'Open') return true;
  if (changeSet.State !== 'Closed') return false;
  const updated = Date.parse(changeSet.UpdatedAt ?? '');
  return !Number.isNaN(updated) && now - updated <= RECENTLY_CLOSED_DAYS * 24 * 60 * 60 * 1000;
};

/**
 * Each ChangeSet's live approvals, from the Revisions of all of them with their Attestations and
 * the records that revoke any of those. Every ChangeSet named is in the map, with 0 when none of
 * its Revisions came back.
 */
export function approvalsByChangeSet(
  changeSetIds: readonly string[],
  revisions: readonly ExtendedRevisionRead[],
  revocations: readonly AttestationRead[],
): Map<string, number> {
  const byChangeSet = new Map<string, ExtendedRevisionRead[]>(changeSetIds.map((id) => [id, []]));
  for (const entry of revisions) {
    const id = entry.Revision?.ChangeSetID;
    if (id !== undefined) byChangeSet.get(id)?.push(entry);
  }
  return new Map(
    [...byChangeSet].map(([id, ofChangeSet]) => [
      id,
      deriveChangeSetReviews({ revisions: ofChangeSet, revocations, requests: [], userNames: NO_USERS, viewerUserId: undefined }).approvals,
    ]),
  );
}

/**
 * The live approvals of each of the ChangeSets with a change still to be reviewed as of `now`,
 * when the list was read, or undefined until they have been read. `refetch` reads them again,
 * keeping the last answer until it is back.
 */
export function useChangeSetApprovals(changeSets: readonly ChangeSetRead[], now: number) {
  const changeSetIds = useMemo(
    () => changeSets.flatMap((cs) => (cs.ChangeSetID && hasChangeToApprove(cs, now) ? [cs.ChangeSetID] : [])).sort(),
    [changeSets, now],
  );
  const revisions = useGetChangeSetsRevisionsQuery({ changeSetIds }, { skip: changeSetIds.length === 0 });
  const attestationIds = useMemo(
    () => approvalRecords(revisions.currentData ?? []).flatMap(({ record }) => (record.AttestationID ? [record.AttestationID] : [])),
    [revisions.currentData],
  );
  const revocations = useListRevocationsQuery({ attestationIds }, { skip: attestationIds.length === 0 });

  const approvals = useMemo(() => {
    if (changeSetIds.length === 0) return new Map<string, number>();
    if (revisions.currentData === undefined) return undefined;
    if (attestationIds.length > 0 && revocations.currentData === undefined) return undefined;
    return approvalsByChangeSet(changeSetIds, revisions.currentData, revocations.currentData ?? []);
  }, [changeSetIds, revisions.currentData, attestationIds.length, revocations.currentData]);

  const refetchRevisions = revisions.refetch;
  const refetch = useCallback(() => {
    if (changeSetIds.length > 0) void refetchRevisions();
  }, [changeSetIds.length, refetchRevisions]);

  return { approvals, isError: revisions.isError || revocations.isError, refetch };
}
