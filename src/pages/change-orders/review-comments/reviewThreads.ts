// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A ChangeOrder's review comments as threads, by where they are anchored.
 *
 * A comment is anchored as GitHub anchors one on a line of a file: here the file is a Unit, the
 * line is a path in one of its resources, and the commit is the Revision the diff was read at.
 * A comment with no path is about the whole resource; one with no resource, the whole Unit. A
 * reply has no anchor of its own: it answers its thread's first comment.
 *
 * Every comment names the ChangeOrder, so one read by ChangeOrderID is the whole conversation.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type { ReviewCommentRead } from '@confighub/rtk-query';

/** Where a thread sits: a Unit, and optionally a resource in it and a path in that resource. */
export interface ReviewAnchor {
  unitId: string;
  resourceType?: string;
  resourceName?: string;
  path?: string;
}

/** One key per anchor: threads on the same row share it. */
export function anchorKey(anchor: ReviewAnchor): string {
  return [anchor.unitId, anchor.resourceType ?? '', anchor.resourceName ?? '', anchor.path ?? ''].join('\u0000');
}

export interface ReviewComment {
  id: string;
  unitId: string;
  spaceId: string;
  unitSlug: string | undefined;
  revisionNum: number;
  text: string;
  userId: string | undefined;
  createdAt: string | undefined;
  updatedAt: string | undefined;
  /** Edited after it was posted: GitHub's "edited" mark. */
  edited: boolean;
  version: number | undefined;
}

export interface ReviewThread {
  /** The first comment's id. */
  id: string;
  /**
   * What a reply to the thread names as `ReplyToID`: the first comment, or, for replies whose first
   * comment is gone, the comment they answered, so a new reply joins them rather than start apart.
   */
  replyToId: string;
  anchor: ReviewAnchor;
  /** The Revision the first comment was made at: what the thread was about. */
  revisionNum: number;
  comments: ReviewComment[];
}

/** An edit within this long of the post is the post: the server sets both times on create. */
const EDIT_GRACE_MS = 2000;

function commentOf(read: ReviewCommentRead): ReviewComment | undefined {
  if (read.ReviewCommentID === undefined || read.UnitID === undefined) return undefined;
  const created = read.CreatedAt === undefined ? NaN : Date.parse(read.CreatedAt);
  const updated = read.UpdatedAt === undefined ? NaN : Date.parse(read.UpdatedAt);
  return {
    id: read.ReviewCommentID,
    unitId: read.UnitID,
    spaceId: read.SpaceID ?? '',
    unitSlug: read.UnitSlug,
    revisionNum: read.RevisionNum,
    text: read.Text,
    userId: read.UserID,
    createdAt: read.CreatedAt,
    updatedAt: read.UpdatedAt,
    edited: !Number.isNaN(created) && !Number.isNaN(updated) && updated - created > EDIT_GRACE_MS,
    version: read.Version,
  };
}

const byTime = (a: ReviewComment, b: ReviewComment) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);

/**
 * The comments as threads, oldest first. A reply whose first comment is not in the list (deleted,
 * or not visible to the reader) starts a thread of its own on its Unit, rather than vanish.
 */
export function threadsOf(reads: readonly ReviewCommentRead[]): ReviewThread[] {
  const roots = new Map<string, { read: ReviewCommentRead; comment: ReviewComment }>();
  const replies = new Map<string, ReviewComment[]>();
  for (const read of reads) {
    const comment = commentOf(read);
    if (comment === undefined) continue;
    if (read.ReplyToID === undefined || read.ReplyToID === null || read.ReplyToID === '') roots.set(comment.id, { read, comment });
    else replies.set(read.ReplyToID, [...(replies.get(read.ReplyToID) ?? []), comment]);
  }
  const threads: ReviewThread[] = [];
  for (const { read, comment } of roots.values()) {
    threads.push({
      id: comment.id,
      anchor: {
        unitId: comment.unitId,
        resourceType: read.Resource?.ResourceType || undefined,
        resourceName: read.Resource?.ResourceName || undefined,
        path: read.Path || undefined,
      },
      replyToId: comment.id,
      revisionNum: comment.revisionNum,
      comments: [comment, ...(replies.get(comment.id) ?? []).sort(byTime)],
    });
  }
  for (const [rootId, orphans] of replies) {
    if (roots.has(rootId)) continue;
    const sorted = [...orphans].sort(byTime);
    threads.push({ id: sorted[0].id, replyToId: rootId, anchor: { unitId: sorted[0].unitId }, revisionNum: sorted[0].revisionNum, comments: sorted });
  }
  return threads.sort((a, b) => byTime(a.comments[0], b.comments[0]));
}

/** The threads by anchor key. */
export function threadsByAnchor(threads: readonly ReviewThread[]): ReadonlyMap<string, ReviewThread[]> {
  const out = new Map<string, ReviewThread[]>();
  for (const thread of threads) {
    const key = anchorKey(thread.anchor);
    out.set(key, [...(out.get(key) ?? []), thread]);
  }
  return out;
}

/**
 * GitHub's "Outdated": the thread was made at another Revision of its Unit than the one the diff
 * is read at now. `undefined` when the diff's Revision is not known, which claims nothing.
 */
export function isOutdated(thread: ReviewThread, shownRevisionNum: number | undefined): boolean {
  return shownRevisionNum !== undefined && thread.revisionNum !== shownRevisionNum;
}

/** A dot path's segments joined as a path is shown in a diff: `spec.template.spec.containers.0.image`. */
export const dotPath = (segments: readonly (string | number)[]): string => segments.map(String).join('.');

/** The id a comment's element has on the page: what "Copy link" points at. */
export const reviewCommentElementId = (commentId: string) => `review-comment-${commentId}`;
/** The id a thread's element has on the page, beside its row. */
export const reviewThreadElementId = (threadId: string) => `review-thread-${threadId}`;
