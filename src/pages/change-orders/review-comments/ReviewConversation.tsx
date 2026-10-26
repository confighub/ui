// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';

import { changeOrderCardTokens, changeOrderFontMono, changeOrderInk, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { reviewCommentCopy as copy } from './reviewCommentCopy';
import { useAnnounce } from '../reviews/announceContext';
import { useReviewCommentsState } from './reviewCommentsContext';
import { ReviewThreadView } from './ReviewThreadView';
import { reviewCommentElementId, reviewThreadElementId, type ReviewThread } from './reviewThreads';

export interface ReviewConversationProps {
  /** A Unit's slug, for a thread whose comments do not carry one. */
  slugOf: (unitId: string) => string | undefined;
  /** Open what folds the page's diffs away (an outcome card), so a thread's row can be shown. */
  revealDiffs?: () => void;
}

/** Where a thread is, in words: `spec.replicas` in `apps/v1/Deployment api`. */
function anchorCaption(thread: ReviewThread) {
  const { resourceType, resourceName, path } = thread.anchor;
  const resource = [resourceType, resourceName].filter(Boolean).join(' ');
  if (path !== undefined) return { path, where: resource };
  return { path: undefined, where: resource === '' ? copy.onUnit : `${copy.onResource} ${resource}` };
}

/**
 * Every conversation on the ChangeOrder in one list, as GitHub's Conversation tab has them: by
 * the configuration they are on, each with where it is anchored, Outdated when its diff has moved
 * on, and a way to the row it sits on when that row is drawn. Threads whose row is not on the page
 * now (another stage, a path no longer changed) are only here.
 */
export function ReviewConversation({ slugOf, revealDiffs }: ReviewConversationProps) {
  const state = useReviewCommentsState();
  const [missing, setMissing] = useState<string | undefined>(undefined);
  const announce = useAnnounce();
  const linkFollowed = useRef(false);
  const loaded = state?.reviews.status === 'resolved' ? state.reviews.threads : undefined;

  /*
   * A copied link names one comment by the page's hash. The browser looks for it before the
   * comments are read, and a folded card does not draw it, so it is looked for again here, once.
   */
  useEffect(() => {
    if (loaded === undefined || linkFollowed.current) return;
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith(reviewCommentElementId(''))) return;
    linkFollowed.current = true;
    const commentId = hash.slice(reviewCommentElementId('').length);
    const thread = loaded.find((candidate) => candidate.comments.some((comment) => comment.id === commentId));
    if (thread === undefined) return;
    revealDiffs?.();
    // Not cleared on the next render: opening the cards renders the page again at once.
    window.setTimeout(() => {
      const element = document.getElementById(hash) ?? document.getElementById(reviewThreadElementId(thread.id));
      element?.scrollIntoView({ block: 'center' });
    }, 120);
  }, [loaded, revealDiffs]);

  if (state === undefined) return null;
  const { reviews, revisionNumByUnitId, collapsed } = state;

  const byUnit = new Map<string, ReviewThread[]>();
  for (const thread of reviews.threads) byUnit.set(thread.anchor.unitId, [...(byUnit.get(thread.anchor.unitId) ?? []), thread]);

  const scrollTo = (element: HTMLElement) => {
    setMissing(undefined);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };
  const showInDiff = (threadId: string) => {
    const element = document.getElementById(reviewThreadElementId(threadId));
    if (element !== null) {
      scrollTo(element);
      return;
    }
    if (revealDiffs === undefined) {
      setMissing(threadId);
      announce(copy.notInDiff);
      return;
    }
    // A folded card draws its rows once opened: look again after it has.
    revealDiffs();
    window.setTimeout(() => {
      const revealed = document.getElementById(reviewThreadElementId(threadId));
      if (revealed === null) {
        setMissing(threadId);
        announce(copy.notInDiff);
      } else scrollTo(revealed);
    }, 120);
  };

  return (
    <Box
      component="section"
      aria-labelledby="review-conversation-heading"
      data-testid="review-conversation"
      sx={{ marginTop: '16px', background: changeOrderSurface.card, borderRadius: `${changeOrderCardTokens.radius}px`, boxShadow: changeOrderCardTokens.shadow, padding: '16px 20px' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <ForumOutlinedIcon aria-hidden sx={{ fontSize: 18, color: changeOrderInk.muted }} />
        <Box component="h2" id="review-conversation-heading" sx={{ margin: 0, fontSize: changeOrderType.size.lead, fontWeight: changeOrderType.weight.semibold }}>
          {copy.heading}
        </Box>
        {reviews.status === 'resolved' && reviews.threads.length > 0 ? (
          <Box component="span" sx={{ color: changeOrderInk.subtle, fontSize: changeOrderType.size.body }}>
            {copy.threads(reviews.threads.length)} · {copy.count(reviews.count)}
          </Box>
        ) : null}
      </Box>
      {reviews.status === 'failed' ? (
        <Box role="alert" sx={{ color: changeOrderStatus.danger, fontSize: changeOrderType.size.body }}>
          {copy.failed}.{' '}
          <Button size="small" onClick={reviews.retry}>
            {copy.retry}
          </Button>
        </Box>
      ) : null}
      {reviews.status === 'resolved' && reviews.threads.length === 0 ? (
        <Box sx={{ color: changeOrderInk.muted, fontSize: changeOrderType.size.body }}>{copy.none}</Box>
      ) : null}
      <Box sx={{ display: 'grid', gap: '16px' }}>
        {[...byUnit].map(([unitId, threads]) => (
          <Box key={unitId}>
            <Box sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.body, fontWeight: changeOrderType.weight.semibold, marginBottom: '6px' }}>
              {threads[0].comments[0].unitSlug ?? slugOf(unitId) ?? unitId}
              {state.variantNameOf(unitId) === undefined ? null : (
                <Box component="span" sx={{ fontFamily: 'inherit', fontWeight: changeOrderType.weight.regular, color: changeOrderInk.subtle }}>
                  {' '}
                  · {state.variantNameOf(unitId)}
                </Box>
              )}
            </Box>
            <Box sx={{ display: 'grid', gap: '10px' }}>
              {threads.map((thread) => {
                const caption = anchorCaption(thread);
                return (
                  <Box key={thread.id}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', fontSize: changeOrderType.size.small, color: changeOrderInk.muted, marginBottom: '4px' }}>
                      {caption.path === undefined ? null : (
                        <Box component="code" sx={{ fontFamily: changeOrderFontMono, background: changeOrderSurface.inset, borderRadius: '4px', padding: '0 4px', color: changeOrderInk.default }}>
                          {caption.path}
                        </Box>
                      )}
                      <span>{caption.where}</span>
                      <span>· {copy.at(thread.revisionNum)}</span>
                      <Button size="small" onClick={() => showInDiff(thread.id)} sx={{ marginLeft: 'auto', fontSize: changeOrderType.size.small, padding: '0 6px', minHeight: 0 }}>
                        {copy.showInDiff}
                      </Button>
                      {missing === thread.id ? (
                        <Box component="span" sx={{ width: '100%', textAlign: 'right', color: changeOrderInk.subtle }}>
                          {copy.notInDiff}
                        </Box>
                      ) : null}
                    </Box>
                    <ReviewThreadView
                      thread={thread}
                      reviews={reviews}
                      shownRevisionNum={revisionNumByUnitId.get(unitId)}
                      collapsed={collapsed.has(thread.id)}
                      onToggleCollapsed={() => state.toggleCollapsed(thread.id)}
                      placement="conversation"
                    />
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
