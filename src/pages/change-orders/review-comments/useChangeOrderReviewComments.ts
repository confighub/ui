// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';

import {
  useCreateReviewCommentMutation,
  useDeleteReviewCommentMutation,
  useListAllReviewCommentsQuery,
  usePatchReviewCommentMutation,
} from '@confighub/rtk-query';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { getApiErrorMessage } from '@/utility/error-functions';

import type { HistoryPerson } from '../changeOrderHistory';
import { useDraftPeople } from '../draft/useDraftPeople';
import { reviewCommentCopy } from './reviewCommentCopy';
import { type ReviewAnchor, type ReviewComment, type ReviewThread, threadsByAnchor, threadsOf } from './reviewThreads';

/** What a write said back: nothing on success, the server's words on a refusal. */
export type ReviewWriteResult = { ok: true } | { ok: false; message: string };

/** A new thread: where it is, the Revision it was read at, and what it says. */
export interface NewThread {
  anchor: ReviewAnchor;
  spaceId: string;
  revisionNum: number;
  text: string;
}

export interface ChangeOrderReviewComments {
  status: 'loading' | 'resolved' | 'failed';
  threads: ReviewThread[];
  byAnchor: ReadonlyMap<string, ReviewThread[]>;
  /** Comments in all, replies included. */
  count: number;
  personOf: (userId: string | undefined) => HistoryPerson;
  currentUserId: string | undefined;
  start: (thread: NewThread) => Promise<ReviewWriteResult>;
  reply: (thread: ReviewThread, text: string) => Promise<ReviewWriteResult>;
  edit: (comment: ReviewComment, text: string) => Promise<ReviewWriteResult>;
  remove: (comment: ReviewComment) => Promise<ReviewWriteResult>;
  retry: () => void;
}

const failure = (error: unknown): ReviewWriteResult => ({ ok: false, message: getApiErrorMessage(error) });

/**
 * A ChangeOrder's review comments: one read of every comment that names it, wherever its Unit
 * is, as threads; and the writes that start a thread, reply, edit and delete. Each write goes to
 * the server at once, as a GitHub comment that is not part of a pending review does.
 *
 * A thread is anchored to the Revision its Unit's diff was read at; a reply takes its thread's
 * Unit, Revision and ChangeOrder, as the server requires of a reply.
 */
export function useChangeOrderReviewComments(changeOrderId: string | undefined): ChangeOrderReviewComments {
  const read = useListAllReviewCommentsQuery({ where: `ChangeOrderID = '${changeOrderId ?? ''}'` }, { skip: changeOrderId === undefined });
  const [createComment] = useCreateReviewCommentMutation();
  const [patchComment] = usePatchReviewCommentMutation();
  const [deleteComment] = useDeleteReviewCommentMutation();
  const { userInfo } = useUserInfo();

  const reads = read.currentData;
  const threads = useMemo(
    () => threadsOf((reads ?? []).flatMap((row) => (row.ReviewComment === undefined ? [] : [row.ReviewComment]))),
    [reads],
  );
  const byAnchor = useMemo(() => threadsByAnchor(threads), [threads]);
  const userIds = useMemo(() => threads.flatMap((thread) => thread.comments.map((comment) => comment.userId)), [threads]);
  const { personOf } = useDraftPeople(userIds);

  const start = useCallback(
    async ({ anchor, spaceId, revisionNum, text }: NewThread): Promise<ReviewWriteResult> => {
      if (changeOrderId === undefined) return { ok: false, message: reviewCommentCopy.notLoaded };
      const resource =
        anchor.resourceType === undefined && anchor.resourceName === undefined
          ? undefined
          : { ResourceType: anchor.resourceType, ResourceName: anchor.resourceName };
      try {
        await createComment({
          spaceId,
          unitId: anchor.unitId,
          reviewComment: {
            RevisionNum: revisionNum,
            Text: text,
            ChangeOrderID: changeOrderId,
            ...(resource === undefined ? {} : { Resource: resource }),
            ...(anchor.path === undefined ? {} : { Path: anchor.path }),
          },
        }).unwrap();
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },
    [changeOrderId, createComment],
  );

  const reply = useCallback(
    async (thread: ReviewThread, text: string): Promise<ReviewWriteResult> => {
      const first = thread.comments[0];
      try {
        await createComment({
          spaceId: first.spaceId,
          unitId: first.unitId,
          reviewComment: { RevisionNum: first.revisionNum, Text: text, ReplyToID: thread.replyToId },
        }).unwrap();
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },
    [createComment],
  );

  const edit = useCallback(
    async (comment: ReviewComment, text: string): Promise<ReviewWriteResult> => {
      try {
        await patchComment({ spaceId: comment.spaceId, unitId: comment.unitId, reviewCommentId: comment.id, body: { Text: text } }).unwrap();
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },
    [patchComment],
  );

  const remove = useCallback(
    async (comment: ReviewComment): Promise<ReviewWriteResult> => {
      try {
        await deleteComment({ spaceId: comment.spaceId, unitId: comment.unitId, reviewCommentId: comment.id }).unwrap();
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },
    [deleteComment],
  );

  let status: ChangeOrderReviewComments['status'] = 'loading';
  if (read.isError) status = 'failed';
  else if (reads !== undefined) status = 'resolved';
  const count = threads.reduce((total, thread) => total + thread.comments.length, 0);
  const refetch = read.refetch;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const currentUserId = userInfo?.UserID;
  // One value while nothing in it changes: every row of every diff reads it.
  return useMemo(
    () => ({ status, threads, byAnchor, count, personOf, currentUserId, start, reply, edit, remove, retry }),
    [status, threads, byAnchor, count, personOf, currentUserId, start, reply, edit, remove, retry],
  );
}
