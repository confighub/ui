// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useId, useRef, useState, type KeyboardEvent } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

import { changeOrderBorder, changeOrderInk, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { ReviewMarkdown } from './ReviewMarkdown';
import { reviewCommentCopy as copy } from './reviewCommentCopy';
import type { ReviewWriteResult } from './useChangeOrderReviewComments';

export interface CommentComposerProps {
  /** The text it opens with: a comment being edited, or a quote being replied to. */
  initialText?: string;
  placeholder?: string;
  /** The primary button's words: Comment, Reply, Update comment. */
  submitLabel: string;
  onSubmit: (text: string) => Promise<ReviewWriteResult>;
  onCancel?: () => void;
  autoFocus?: boolean;
  testId?: string;
}

/**
 * Where a comment is written, as GitHub's is: Write and Preview tabs over the Markdown, the
 * primary button on the right, Cancel beside it. Ctrl+Enter (Cmd+Enter) sends; Escape cancels. A
 * comment the server refuses stays in the box, with the server's words under it.
 */
export function CommentComposer({ initialText = '', placeholder = copy.placeholder, submitLabel, onSubmit, onCancel, autoFocus = false, testId }: CommentComposerProps) {
  const [text, setText] = useState(initialText);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const empty = text.trim() === '';

  const submit = async () => {
    if (empty || sending) return;
    setSending(true);
    setError(undefined);
    const result = await onSubmit(text.trim());
    setSending(false);
    if (result.ok) {
      setText('');
      setTab('write');
    } else setError(copy.sendFailed(result.message));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape' && onCancel !== undefined) {
      event.preventDefault();
      onCancel();
    }
  };

  const tabSx = (active: boolean) => ({
    appearance: 'none',
    border: `1px solid ${active ? changeOrderBorder.default : 'transparent'}`,
    borderBottomColor: active ? changeOrderSurface.card : 'transparent',
    background: active ? changeOrderSurface.card : 'none',
    borderRadius: '6px 6px 0 0',
    marginBottom: '-1px',
    padding: '6px 12px',
    font: 'inherit',
    fontSize: changeOrderType.size.body,
    color: active ? changeOrderInk.default : changeOrderInk.muted,
    cursor: 'pointer',
    '&:focus-visible': { outline: `2px solid ${changeOrderBorder.strong}`, outlineOffset: 1 },
  });

  return (
    <Box data-testid={testId} onKeyDown={onKeyDown} sx={{ border: `1px solid ${changeOrderBorder.default}`, borderRadius: '6px', background: changeOrderSurface.card }}>
      <Box
        role="tablist"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const next = tab === 'write' ? 'preview' : 'write';
          setTab(next);
          event.currentTarget.querySelector<HTMLElement>(`#${CSS.escape(`${id}-${next}`)}`)?.focus();
        }}
        sx={{ display: 'flex', gap: '2px', padding: '6px 8px 0', background: changeOrderSurface.sunk, borderBottom: `1px solid ${changeOrderBorder.default}`, borderRadius: '6px 6px 0 0' }}>
        <Box component="button" type="button" role="tab" id={`${id}-write`} tabIndex={tab === 'write' ? 0 : -1} aria-selected={tab === 'write'} aria-controls={`${id}-panel`} onClick={() => setTab('write')} sx={tabSx(tab === 'write')}>
          {copy.write}
        </Box>
        <Box component="button" type="button" role="tab" id={`${id}-preview`} tabIndex={tab === 'preview' ? 0 : -1} aria-selected={tab === 'preview'} aria-controls={`${id}-panel`} onClick={() => setTab('preview')} sx={tabSx(tab === 'preview')}>
          {copy.preview}
        </Box>
      </Box>
      <Box id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} sx={{ padding: '8px' }}>
        {tab === 'write' ? (
          <TextField
            inputRef={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={placeholder}
            multiline
            minRows={3}
            maxRows={16}
            fullWidth
            size="small"
            autoFocus={autoFocus}
            disabled={sending}
            inputProps={{ 'aria-label': placeholder, 'aria-describedby': `${id}-hint` }}
            sx={{ '& textarea': { fontSize: changeOrderType.size.prose, lineHeight: 1.5 } }}
          />
        ) : (
          <Box sx={{ minHeight: 76, padding: '4px 2px', borderBottom: `1px solid ${changeOrderBorder.default}` }}>
            {empty ? <Box sx={{ color: changeOrderInk.subtle, fontSize: changeOrderType.size.prose }}>{copy.nothingToPreview}</Box> : <ReviewMarkdown text={text} />}
          </Box>
        )}
        {error === undefined ? null : (
          <Box role="alert" sx={{ marginTop: '6px', color: changeOrderStatus.danger, fontSize: changeOrderType.size.small }}>
            {error}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <Box id={`${id}-hint`} sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, marginRight: 'auto' }}>
            {copy.markdown} · {copy.shortcut}
          </Box>
          {onCancel === undefined ? null : (
            <Button size="small" variant="outlined" color="inherit" onClick={onCancel} disabled={sending}>
              {copy.cancel}
            </Button>
          )}
          <Button size="small" variant="contained" onClick={() => void submit()} disabled={empty || sending}>
            {submitLabel}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
