// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';

import { changeOrderBorder, changeOrderCardTokens, changeOrderInk, changeOrderType } from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import { keepFocusAfter } from './draftFocus';
import { FOCUS_RING } from './draftLook';

/** How long a pointer rests on a retry before its name shows. */
const TOOLTIP_DELAY_MS = 400;

export interface RetryButtonProps {
  onRetry: () => void;
  /** Its name, for what it asks again: "Retry dry run". */
  label: string;
  /** Where focus goes if the retry redraws this button away: a heading or result with `tabIndex={-1}`. */
  focusAfter?: string;
}

/**
 * Ask again: a refresh icon, named on hover and to a screen reader. It stays where it is while
 * the read runs, so the keyboard does not lose its place.
 */
export function RetryButton({ onRetry, label, focusAfter }: RetryButtonProps) {
  return (
    <Tooltip title={label} enterDelay={TOOLTIP_DELAY_MS}>
      <IconButton
        size="small"
        aria-label={label}
        onClick={(event) => {
          onRetry();
          if (focusAfter !== undefined) keepFocusAfter(event.currentTarget, focusAfter);
        }}
        sx={{ '&:focus-visible': FOCUS_RING }}
      >
        <RefreshIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
}

export interface CouldNotEstablishProps {
  /** What could not be established, in bold before the words ("Image changes"). Absent: the place says it already. */
  subject?: ReactNode;
  /** Ask again. Absent: there is nothing to retry (an undetermined value, a refusal). */
  onRetry?: () => void;
  /** What the retry asks again, for its name: "dry run" gives "Retry dry run". */
  retryWhat?: string;
  /** Where focus goes if the retry redraws its button away: a heading or result with `tabIndex={-1}`. */
  focusAfterRetry?: string;
  /** Why, when the data layer says: an icon after the words, its tooltip and its name. */
  reason?: string;
  /** In a dashed frame of its own, where a section would otherwise stand. */
  framed?: boolean;
  testId?: string;
}

/**
 * The detail view's word for a value nobody could read, with why where the data layer says (an
 * icon the keyboard reaches, its tooltip and its name the reason), and a way to ask again when
 * asking again can help. Never "nothing changes", never a zero.
 */
export function CouldNotEstablish({
  subject,
  onRetry,
  retryWhat,
  focusAfterRetry,
  reason,
  framed = false,
  testId = 'draft-could-not-establish',
}: CouldNotEstablishProps) {
  const frame = framed
    ? {
        display: 'flex',
        marginTop: '14px',
        padding: '8px 12px 8px 16px',
        border: `1px dashed ${changeOrderBorder.strong}`,
        borderRadius: `${changeOrderCardTokens.radius}px`,
      }
    : { display: 'inline-flex' };
  return (
    <Box
      component="span"
      data-testid={testId}
      sx={{ ...frame, alignItems: 'center', gap: '4px', fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}
    >
      <span>
        {subject === undefined ? null : (
          <>
            <Box component="b" sx={{ color: changeOrderInk.default, fontWeight: changeOrderType.weight.semibold }}>
              {subject}
            </Box>{' '}
          </>
        )}
        {draftCopy.couldNotEstablish}
      </span>
      {reason === undefined ? null : (
        <Tooltip title={reason} enterDelay={TOOLTIP_DELAY_MS}>
          <Box
            component="span"
            tabIndex={0}
            role="img"
            aria-label={reason}
            data-testid="draft-reason"
            sx={{ display: 'inline-grid', placeItems: 'center', borderRadius: '3px', color: changeOrderInk.subtle, cursor: 'default', '&:focus-visible': FOCUS_RING }}
          >
            <InfoOutlinedIcon aria-hidden sx={{ fontSize: 14 }} />
          </Box>
        </Tooltip>
      )}
      {onRetry === undefined ? null : <RetryButton onRetry={onRetry} label={draftCopy.retry(retryWhat ?? '')} focusAfter={focusAfterRetry} />}
    </Box>
  );
}
