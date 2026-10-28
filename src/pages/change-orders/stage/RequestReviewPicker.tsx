// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * "Request a review from": the people who can still approve, each a checkbox,
 * opened in the status box from Request review…. Nobody is notified by the
 * server; the requested reviewer sees the request when they open the
 * ChangeOrder, and the hint says exactly that.
 */

import { useId, useRef, useState, type KeyboardEvent } from 'react';

import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { alpha, type Theme } from '@mui/material/styles';

import PersonOutlineIcon from '@mui/icons-material/PersonOutline';

import { listText, reviewCopy } from '../reviews/reviewCopy';
import type { ReviewPerson, ReviewRequestOutcome } from '../reviews/changeOrderReviewTypes';
import { stageCardCopy } from './stageCardCopy';
import { InlineNotice, StatusActions, StatusText } from './StageBoxParts';

const copy = stageCardCopy.review;

/** A person's initials in a neutral circle: 24px in nested rows, 28px in the picker. */
export function PersonAvatar({ person, size = 24 }: { person: Pick<ReviewPerson, 'initials'>; size?: 24 | 28 }) {
  return (
    <Avatar
      aria-hidden
      sx={{
        width: size,
        height: size,
        bgcolor: 'var(--bg-hover)',
        border: '1px solid var(--bd0)',
        color: 'text.secondary',
        fontSize: size === 28 ? '11px' : '10.5px',
        fontWeight: 700,
        fontFamily: 'var(--font-sans)',
        flex: 'none',
      }}
    >
      {person.initials}
    </Avatar>
  );
}

export interface RequestReviewPickerProps {
  /** Who can still approve, without the viewer. */
  candidates: readonly ReviewPerson[];
  preselected?: readonly string[];
  submitting: boolean;
  onRequest: (userIds: string[]) => void;
  onCancel: () => void;
}

const focusSx = { '&.Mui-focusVisible, &:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } } as const;

export function RequestReviewPicker({ candidates, preselected = [], submitting, onRequest, onCancel }: RequestReviewPickerProps) {
  const [picked, setPicked] = useState<string[]>(() => preselected.filter((id) => candidates.some((c) => c.userId === id)));
  const titleId = useId();
  const focused = useRef(false);
  const none = picked.length === 0;

  const toggle = (userId: string, on: boolean) => setPicked((current) => (on ? [...current, userId] : current.filter((id) => id !== userId)));
  const send = () => {
    if (none || submitting) return;
    onRequest(picked);
  };
  const onKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !submitting) {
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <Box role="group" aria-labelledby={titleId} onKeyDown={onKeys} data-testid="review-request-picker" sx={{ mt: '12px', display: 'grid', gap: '12px', maxWidth: 560 }}>
      <Typography id={titleId} variant="subtitle1" sx={{ color: 'text.primary' }}>
        {copy.requestFrom}
      </Typography>
      <Box sx={{ display: 'grid', gap: '2px' }}>
        {candidates.map((person, i) => (
          <Box
            key={person.userId}
            component="label"
            data-testid="review-request-candidate"
            data-user-id={person.userId}
            sx={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              p: '4px 6px',
              mx: '-6px',
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              typography: 'body2',
              color: 'text.primary',
              '&:hover': { bgcolor: 'var(--bg-hover)' },
            }}
          >
            <Checkbox
              size="small"
              checked={picked.includes(person.userId)}
              disabled={submitting}
              onChange={(event) => toggle(person.userId, event.target.checked)}
              inputRef={(el: HTMLInputElement | null) => {
                if (el !== null && i === 0 && !focused.current) {
                  focused.current = true;
                  el.focus();
                }
              }}
              sx={{ p: 0, color: 'text.secondary', '& .MuiSvgIcon-root': { fontSize: 18 }, ...focusSx }}
            />
            <PersonAvatar person={person} size={28} />
            <Box component="span" sx={{ fontWeight: 600 }}>
              {person.name}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="primary"
          onClick={send}
          aria-disabled={none || submitting ? true : undefined}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" aria-hidden /> : undefined}
          data-testid="review-request-send"
          sx={{
            ...focusSx,
            '&[aria-disabled="true"]': { cursor: 'not-allowed', bgcolor: 'action.disabledBackground', color: (t: Theme) => alpha(t.palette.common.black, 0.38) },
          }}
        >
          {copy.requestSubmit}
        </Button>
        <Button variant="text" onClick={() => !submitting && onCancel()} sx={{ px: '10px', ...focusSx }}>
          {copy.cancel}
        </Button>
      </Box>
    </Box>
  );
}

const personIcon = <PersonOutlineIcon sx={{ fontSize: '18px !important' }} />;

export interface RequestReviewControlProps {
  candidates: readonly ReviewPerson[];
  /** False once the server refused a request change: the action is not offered. */
  canRequest: boolean;
  onRequest: (userIds: string[]) => Promise<ReviewRequestOutcome>;
  /** The page's live region. */
  announce: (text: string) => void;
}

/**
 * Request review… and its picker, for the author of a change that waits on review.
 * After a request the box says who was asked, and focus goes back to the button.
 */
export function RequestReviewControl({ candidates, canRequest, onRequest, announce }: RequestReviewControlProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const refocus = useRef(false);

  const request = async (userIds: string[]) => {
    setError(undefined);
    setBusy(true);
    const outcome = await onRequest(userIds);
    setBusy(false);
    if (!outcome.ok) {
      const text = outcome.message ?? reviewCopy.requests.failed;
      setError(text);
      announce(text);
      return;
    }
    const names = listText(candidates.filter((p) => userIds.includes(p.userId)).map((p) => p.name));
    setRequested((current) => [...current, names]);
    refocus.current = true;
    setOpen(false);
    announce(copy.requested(names));
  };

  return (
    <>
      {requested.length > 0 ? <StatusText testId="review-requested">{copy.requestedFrom(requested.join(', '))}</StatusText> : null}
      {open ? (
        <RequestReviewPicker
          candidates={candidates}
          submitting={busy}
          onRequest={(ids) => void request(ids)}
          onCancel={() => {
            refocus.current = true;
            setOpen(false);
          }}
        />
      ) : canRequest && candidates.length > 0 ? (
        <StatusActions>
          <Button
            variant="outlined"
            color="inherit"
            startIcon={personIcon}
            ref={(el: HTMLButtonElement | null) => {
              if (el !== null && refocus.current) {
                refocus.current = false;
                el.focus();
              }
            }}
            onClick={() => setOpen(true)}
            data-testid="review-request-open"
            sx={{ bgcolor: 'background.paper', ...focusSx }}
          >
            {copy.requestReview}
          </Button>
        </StatusActions>
      ) : null}
      {error !== undefined ? (
        <InlineNotice tone="error" testId="review-error">
          {error}
        </InlineNotice>
      ) : null}
    </>
  );
}

export interface AskAgainProps {
  rejecter: ReviewPerson;
  canRequest: boolean;
  onAsk: (userId: string) => Promise<ReviewRequestOutcome>;
  announce: (text: string) => void;
  onAsked?: (userId: string) => void;
}

/** "Ask {name} to review again": a later request time for the person who rejected. */
export function AskAgain({ rejecter, canRequest, onAsk, announce, onAsked }: AskAgainProps) {
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  if (asked) return <StatusText testId="review-asked-again">{copy.askedAgain(rejecter.name)}</StatusText>;
  if (!canRequest) return null;
  const ask = async () => {
    if (busy) return;
    setError(undefined);
    setBusy(true);
    const outcome = await onAsk(rejecter.userId);
    setBusy(false);
    if (!outcome.ok) {
      const text = outcome.message ?? reviewCopy.requests.failed;
      setError(text);
      announce(text);
      return;
    }
    setAsked(true);
    onAsked?.(rejecter.userId);
    announce(stageCardCopy.announce.askedAgain(rejecter.name));
  };
  return (
    <>
      <StatusActions>
        <Button
          variant="outlined"
          color="inherit"
          startIcon={personIcon}
          aria-disabled={busy ? true : undefined}
          onClick={() => void ask()}
          data-testid="review-ask-again"
          sx={{ bgcolor: 'background.paper', ...focusSx }}
        >
          {copy.askAgain(rejecter.name)}
        </Button>
      </StatusActions>
      {error !== undefined ? (
        <InlineNotice tone="error" testId="review-error">
          {error}
        </InlineNotice>
      ) : null}
    </>
  );
}
