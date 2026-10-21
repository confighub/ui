// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';

import type { ResourceInfo } from '@confighub/rtk-query';

import { changeOrderBorder, changeOrderSurface } from '../changeOrdersTokens';
import { CommentComposer } from './CommentComposer';
import { reviewCommentCopy as copy } from './reviewCommentCopy';
import { type ReviewDiffTarget, useReviewCommentsState } from './reviewCommentsContext';
import { ReviewThreadView } from './ReviewThreadView';
import { anchorKey, type ReviewAnchor } from './reviewThreads';

function anchorOf(target: ReviewDiffTarget, resource: ResourceInfo | undefined, path: string): ReviewAnchor {
  return {
    unitId: target.unitId,
    resourceType: resource?.ResourceType || undefined,
    resourceName: resource?.ResourceName || undefined,
    path: path === '' ? undefined : path,
  };
}

/** A resource's name without its namespace: the variants of one row can each set their own. */
const bareName = (name: string | undefined) => (name === undefined ? undefined : name.slice(name.lastIndexOf('/') + 1));

/** Whether a thread on another variant's Unit is on this row: the same resource type, name and path. */
function sameRowElsewhere(anchor: ReviewAnchor, here: ReviewAnchor): boolean {
  return anchor.resourceType === here.resourceType && bareName(anchor.resourceName) === bareName(here.resourceName) && anchor.path === here.path;
}

/** Back to the + a composer was opened from, once the composer has gone: focus does not fall to the page. */
function focusAddButton(key: string) {
  window.requestAnimationFrame(() => {
    for (const button of document.querySelectorAll<HTMLElement>('[data-review-anchor]')) {
      if (button.dataset.reviewAnchor === key) {
        button.focus();
        return;
      }
    }
  });
}

/** The comment button in a row's key gutter (or on a resource's heading) that starts a thread there. */
export function AddCommentButton({ target, resource, path }: { target: ReviewDiffTarget; resource: ResourceInfo | undefined; path: string }) {
  const state = useReviewCommentsState();
  if (state === undefined || !state.revisionNumByUnitId.has(target.unitId)) return null;
  const key = anchorKey(anchorOf(target, resource, path));
  const label = path === '' ? copy.addResource : copy.add;
  return (
    <Tooltip title={label}>
      <IconButton
        size="small"
        aria-label={path === '' ? label : `${label}: ${path}`}
        data-testid={path === '' ? 'review-add-resource' : 'review-add-line'}
        data-review-anchor={key}
        onClick={() => state.setComposing(key, true)}
        sx={{
          width: path === '' ? 'auto' : 20,
          height: path === '' ? 22 : 20,
          padding: path === '' ? '0 6px' : 0,
          borderRadius: '5px',
          color: 'primary.main',
          '&:hover': { bgcolor: 'action.hover' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
        }}
      >
        <AddCommentOutlinedIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
}

/** What sits under a row: the threads on it (from every member variant's Unit) and a new one being written. */
export function RowThreads({ target, resource, path }: { target: ReviewDiffTarget; resource: ResourceInfo | undefined; path: string }) {
  const state = useReviewCommentsState();
  if (state === undefined) return null;
  const { reviews, revisionNumByUnitId, composing, collapsed } = state;
  const key = anchorKey(anchorOf(target, resource, path));
  const members = new Set((target.memberUnitIds ?? []).filter((unitId) => unitId !== target.unitId));
  const here = anchorOf(target, resource, path);
  const threads = [
    ...(reviews.byAnchor.get(key) ?? []),
    ...(members.size === 0 ? [] : reviews.threads.filter((thread) => members.has(thread.anchor.unitId) && sameRowElsewhere(thread.anchor, here))),
  ];
  const writing = composing.has(key);
  const revisionNum = revisionNumByUnitId.get(target.unitId);
  if (threads.length === 0 && !writing) return null;
  return (
    <Box data-testid="review-row-threads" sx={{ display: 'grid', gap: '8px', padding: '8px 12px 10px 28px', background: changeOrderSurface.sunk, borderTop: `1px solid ${changeOrderBorder.default}`, borderBottom: `1px solid ${changeOrderBorder.default}`, '& > *': { maxWidth: 880 } }}>
      {threads.map((thread) => (
        <ReviewThreadView
          key={thread.id}
          thread={thread}
          reviews={reviews}
          shownRevisionNum={revisionNumByUnitId.get(thread.anchor.unitId)}
          variantLabel={thread.anchor.unitId === target.unitId ? undefined : state.variantNameOf(thread.anchor.unitId)}
          collapsed={collapsed.has(thread.id)}
          onToggleCollapsed={() => state.toggleCollapsed(thread.id)}
        />
      ))}
      {writing && revisionNum !== undefined ? (
        <CommentComposer
          submitLabel={copy.comment}
          autoFocus
          testId="review-new-thread-composer"
          onCancel={() => {
            state.setComposing(key, false);
            focusAddButton(key);
          }}
          onSubmit={async (text) => {
            const result = await reviews.start({ anchor: anchorOf(target, resource, path), spaceId: target.spaceId, revisionNum, text });
            if (result.ok) {
              state.setComposing(key, false);
              focusAddButton(key);
            }
            return result;
          }}
        />
      ) : null}
    </Box>
  );
}

