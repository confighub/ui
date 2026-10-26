// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';

import { relativeTime } from '../changeOrderHistory';
import { useAnnounce } from '../reviews/announceContext';
import { changeOrderBorder, changeOrderInk, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { PersonAvatar } from '../components/ChangeOrderHistoryEntry';
import { CommentComposer } from './CommentComposer';
import { ReviewMarkdown } from './ReviewMarkdown';
import { reviewCommentCopy as copy } from './reviewCommentCopy';
import { reviewCommentElementId, reviewThreadElementId, type ReviewComment, type ReviewThread } from './reviewThreads';
import type { ChangeOrderReviewComments } from './useChangeOrderReviewComments';


/** A comment's text quoted, for a reply: `> ` on every line, then a blank line to write under. */
const quoted = (text: string) => `${text.split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;

interface CommentItemProps {
  comment: ReviewComment;
  /** Only the copy beside the diff carries the comment's id: the page has one element per id. */
  anchored: boolean;
  /** Replies to it, when it is a thread's first comment: deleting it leaves them off the line. */
  replyCount: number;
  reviews: ChangeOrderReviewComments;
  onQuote: (text: string) => void;
}

function CommentItem({ comment, anchored, replyCount, reviews, onQuote }: CommentItemProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);
  const menuId = `${comment.id}-${anchored ? 'diff' : 'list'}-menu`;
  const [copied, setCopied] = useState(false);
  const announce = useAnnounce();
  const person = reviews.personOf(comment.userId);
  const mine = comment.userId !== undefined && comment.userId === reviews.currentUserId;
  const at = comment.createdAt === undefined ? NaN : Date.parse(comment.createdAt);

  const copyLink = async () => {
    setMenuAnchor(null);
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${reviewCommentElementId(comment.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      announce(copy.linkCopied);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // A browser that refuses the clipboard leaves the link where the address bar can show it.
      window.location.hash = reviewCommentElementId(comment.id);
    }
  };

  return (
    <Box id={anchored ? reviewCommentElementId(comment.id) : undefined} data-testid="review-comment" sx={{ display: 'flex', gap: '10px', padding: '10px 12px', scrollMarginTop: '120px', '&:target': { background: changeOrderSurface.sunk } }}>
      <PersonAvatar person={person} size={24} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: changeOrderType.size.body }}>
          <Box component="span" sx={{ fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default }}>
            {person.name}
          </Box>
          {person.isYou ? (
            <Box component="span" sx={{ fontSize: changeOrderType.size.micro, border: `1px solid ${changeOrderBorder.default}`, borderRadius: '10px', padding: '0 6px', color: changeOrderInk.muted }}>
              {copy.you}
            </Box>
          ) : null}
          <Box component="span" sx={{ color: changeOrderInk.subtle }} title={comment.createdAt === undefined ? undefined : new Date(at).toLocaleString()}>
            {copy.commented} {Number.isNaN(at) ? '' : relativeTime(at, Date.now())}
          </Box>
          {comment.edited ? (
            <Box component="span" sx={{ color: changeOrderInk.subtle }} title={comment.updatedAt === undefined ? undefined : new Date(comment.updatedAt).toLocaleString()}>
              · {copy.edited}
            </Box>
          ) : null}
          {copied ? (
            <Box component="span" sx={{ color: changeOrderStatus.success, fontSize: changeOrderType.size.small }}>
              {copy.linkCopied}
            </Box>
          ) : null}
          <Tooltip title={copy.more}>
            <IconButton
              size="small"
              aria-label={copy.more}
              aria-haspopup="menu"
              aria-controls={menuAnchor === null ? undefined : menuId}
              aria-expanded={menuAnchor !== null}
              onClick={(event) => setMenuAnchor(event.currentTarget)} sx={{ marginLeft: 'auto', padding: '2px' }}>
              <MoreHorizIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Menu id={menuId} anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
            <MenuItem onClick={() => void copyLink()}>{copy.copyLink}</MenuItem>
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                onQuote(quoted(comment.text));
              }}
            >
              {copy.quoteReply}
            </MenuItem>
            {mine ? (
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  setEditing(true);
                }}
              >
                {copy.edit}
              </MenuItem>
            ) : null}
            {mine ? (
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  setDeleteError(undefined);
                  setConfirming(true);
                }}
                sx={{ color: changeOrderStatus.danger }}
              >
                {copy.delete}
              </MenuItem>
            ) : null}
          </Menu>
        </Box>
        <Box sx={{ marginTop: '4px' }}>
          {editing ? (
            <CommentComposer
              initialText={comment.text}
              submitLabel={copy.update}
              autoFocus
              onCancel={() => setEditing(false)}
              onSubmit={async (text) => {
                const result = await reviews.edit(comment, text);
                if (result.ok) setEditing(false);
                return result;
              }}
            />
          ) : (
            <ReviewMarkdown text={comment.text} />
          )}
        </Box>
      </Box>
      <Dialog open={confirming} onClose={() => setConfirming(false)} aria-labelledby={`${comment.id}-delete`}>
        <DialogTitle id={`${comment.id}-delete`}>{copy.deleteTitle}</DialogTitle>
        <DialogContent sx={{ fontSize: changeOrderType.size.prose }}>
          {replyCount > 0 ? copy.deleteRepliesBody(replyCount) : copy.deleteBody}
          {deleteError === undefined ? null : <Box role="alert" sx={{ marginTop: '8px', color: changeOrderStatus.danger }}>{copy.sendFailed(deleteError)}</Box>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} color="inherit">
            {copy.cancel}
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              const result = await reviews.remove(comment);
              setDeleting(false);
              if (result.ok) setConfirming(false);
              else setDeleteError(result.message);
            }}
          >
            {copy.delete}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export interface ReviewThreadViewProps {
  thread: ReviewThread;
  reviews: ChangeOrderReviewComments;
  /** The Revision the diff beside it is read at: the thread is Outdated when it was made at another. */
  shownRevisionNum: number | undefined;
  /** A variant name, when the thread is on another variant's resource than the one the diff shows. */
  variantLabel?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** `diff`: under its row, where links point. `conversation`: in the list of every conversation. */
  placement?: 'diff' | 'conversation';
}

/**
 * One conversation, as GitHub draws one under a line: its comments in order, a reply box, an
 * Outdated mark when it was made at another Revision than the diff shows, and Hide conversation,
 * which folds it to one line on this page.
 */
export function ReviewThreadView({ thread, reviews, shownRevisionNum, variantLabel, collapsed, onToggleCollapsed, placement = 'diff' }: ReviewThreadViewProps) {
  const anchored = placement === 'diff';
  const [replying, setReplying] = useState(false);
  const [quote, setQuote] = useState('');
  const [replyKey, setReplyKey] = useState(0);
  const outdated = shownRevisionNum !== undefined && thread.revisionNum !== shownRevisionNum;
  const people = [...new Set(thread.comments.map((comment) => reviews.personOf(comment.userId).name))];

  const onQuote = (text: string) => {
    setQuote(text);
    setReplyKey((key) => key + 1);
    setReplying(true);
  };

  return (
    <Box
      id={anchored ? reviewThreadElementId(thread.id) : undefined}
      data-testid={anchored ? 'review-thread' : 'review-conversation-thread'}
      sx={{ border: `1px solid ${changeOrderBorder.default}`, borderRadius: '8px', background: changeOrderSurface.card, overflow: 'hidden', scrollMarginTop: '120px' }}
    >
      {outdated || variantLabel !== undefined || collapsed ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: changeOrderSurface.sunk, borderBottom: collapsed ? 'none' : `1px solid ${changeOrderBorder.default}`, fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>
          {outdated ? (
            <Tooltip title={copy.outdatedTip(thread.revisionNum, shownRevisionNum as number)}>
              <Box component="span" data-testid="review-thread-outdated" sx={{ border: `1px solid ${changeOrderStatus.warnLine}`, background: changeOrderStatus.warnSoft, color: changeOrderStatus.warn, borderRadius: '10px', padding: '0 7px', fontWeight: changeOrderType.weight.semibold }}>
                {copy.outdated}
              </Box>
            </Tooltip>
          ) : null}
          {variantLabel === undefined ? null : <Box component="span">{copy.onVariant(variantLabel)}</Box>}
          {collapsed ? <Box component="span">{copy.hiddenSummary(thread.comments.length, people.join(', '))}</Box> : null}
          {collapsed ? (
            <Button size="small" color="inherit" onClick={onToggleCollapsed} startIcon={<UnfoldMoreIcon />} aria-expanded={false} sx={{ marginLeft: 'auto', fontSize: changeOrderType.size.small, padding: '0 6px', minHeight: 0 }}>
              {copy.show}
            </Button>
          ) : null}
        </Box>
      ) : null}
      {collapsed ? null : (
        <>
          <Box sx={{ '& > * + *': { borderTop: `1px solid ${changeOrderBorder.default}` } }}>
            {thread.comments.map((comment, index) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                anchored={anchored}
                replyCount={index === 0 && thread.replyToId === thread.id ? thread.comments.length - 1 : 0}
                reviews={reviews}
                onQuote={onQuote}
              />
            ))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 12px 10px', borderTop: `1px solid ${changeOrderBorder.default}`, background: changeOrderSurface.sunk }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
            {replying ? (
              <CommentComposer
                key={replyKey}
                initialText={quote}
                placeholder={copy.replyPlaceholder}
                submitLabel={copy.reply}
                autoFocus
                testId="review-reply-composer"
                onCancel={() => {
                  setReplying(false);
                  setQuote('');
                }}
                onSubmit={async (text) => {
                  const result = await reviews.reply(thread, text);
                  if (result.ok) {
                    setReplying(false);
                    setQuote('');
                  }
                  return result;
                }}
              />
            ) : (
              <Box
                component="button"
                type="button"
                onClick={() => setReplying(true)}
                data-testid="review-reply-open"
                sx={{
                  appearance: 'none',
                  width: '100%',
                  textAlign: 'left',
                  font: 'inherit',
                  fontSize: changeOrderType.size.body,
                  color: changeOrderInk.subtle,
                  background: changeOrderSurface.card,
                  border: `1px solid ${changeOrderBorder.default}`,
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'text',
                  '&:hover, &:focus-visible': { borderColor: changeOrderBorder.strong },
                }}
              >
                {copy.replyPlaceholder}
              </Box>
            )}
            </Box>
            {replying ? null : (
              <Button size="small" variant="outlined" color="inherit" onClick={onToggleCollapsed} startIcon={<UnfoldLessIcon />} aria-expanded sx={{ flex: 'none', fontSize: changeOrderType.size.small, whiteSpace: 'nowrap' }}>
                {copy.hide}
              </Button>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
