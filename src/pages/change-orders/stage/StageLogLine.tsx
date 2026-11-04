// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One line of the Stage log: a time gutter, a glyph, the sentence, and at the
 * right edge who did it ("auto" for the system) or the line's buttons.
 *
 * Sentences are in the sans face; mono only for names, times and values. A
 * failure is a full-width red band; a warning an amber line; the viewer's turn a
 * rust-tinted prompt that holds the action. Below the sentence a line can hold a
 * form (a review reason, an acknowledgement) across the sentence and action columns.
 */

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Tooltip from '@mui/material/Tooltip';
import { alpha, type Theme } from '@mui/material/styles';

import { clockTime } from '../changeOrderHistory';
import type { StageLogGlyph, StageLogTone } from './stageLogModel';
import { valuePillSx } from './stageLogStyles';

/** Under this width the time gutter narrows and the actions go under the sentence. */
const NARROW = '@media (max-width: 759.98px)';

const onRed = (n: number) => (t: Theme) => alpha(t.palette.error.contrastText, n);

const toneSx: Record<StageLogTone, object> = {
  arrive: { '& [data-part="g"], & [data-part="x"]': { color: 'text.secondary' } },
  ok: { '& [data-part="g"]': { color: 'success.main' } },
  okDone: { '& [data-part="g"]': { color: 'success.main' }, '& [data-part="x"]': { color: 'text.secondary' }, '& [data-part="x"] code': { color: 'text.primary' } },
  done: { '& [data-part="x"]': { color: 'text.secondary' }, '& [data-part="x"] code': { color: 'text.primary' } },
  bad: {
    bgcolor: 'var(--red)',
    color: 'error.contrastText',
    my: '6px',
    py: '11px',
    '& [data-part="t"], & [data-part="m"]': { color: onRed(0.85) },
    '& [data-part="q"]': { color: 'error.contrastText', opacity: 0.92 },
    '& [data-part="x"] code': { color: 'error.contrastText', bgcolor: onRed(0.18), boxShadow: 'none' },
    '& [data-part="nm"], & [data-part="st"]': { color: 'error.contrastText' },
    '& [data-part="dim"]': { color: onRed(0.9) },
    '& [data-part="x"] a': { color: 'error.contrastText', textDecorationColor: onRed(0.6) },
    '& [data-part="auto"]': { borderColor: onRed(0.5), color: 'error.contrastText', bgcolor: 'transparent' },
  },
  badQuiet: {
    bgcolor: 'var(--red-bg)',
    '& [data-part="x"]': { color: 'text.secondary' },
    '& [data-part="g"]': { color: 'error.main' },
    '& [data-part="t"], & [data-part="m"]': { color: 'text.disabled' },
  },
  warn: {
    bgcolor: 'var(--amber-bg)',
    boxShadow: 'inset 0 1px 0 var(--amber-bd), inset 0 -1px 0 var(--amber-bd)',
    '& [data-part="g"]': { color: 'warning.main' },
  },
  restore: { '& [data-part="g"]': { color: 'text.secondary' }, '& [data-part="x"]': { color: 'text.secondary' } },
  aborted: { '& [data-part="g"]': { color: 'text.secondary' } },
  unknown: { '& [data-part="g"]': { color: 'text.secondary' }, '& [data-part="x"]': { color: 'text.secondary' } },
  unread: { '& [data-part="g"]': { color: 'text.disabled' }, '& [data-part="x"]': { color: 'text.secondary' } },
  open: { '& [data-part="g"]': { color: 'var(--t4)' }, '& [data-part="x"]': { color: 'text.secondary' } },
  locked: { '& [data-part="g"]': { color: 'var(--t4)' }, '& [data-part="x"]': { color: 'text.secondary' } },
  busy: { '& [data-part="g"]': { color: 'var(--t4)' }, '& [data-part="x"]': { color: 'text.secondary' } },
  detail: { pt: 0, pb: '6px', '& [data-part="g"]': { color: 'text.disabled' } },
  skeleton: { alignItems: 'center' },
  prompt: {
    bgcolor: 'var(--rust-bg)',
    boxShadow: 'inset 0 1px 0 var(--rust-ring), inset 0 -1px 0 var(--rust-ring)',
    py: '11px',
    alignItems: 'center',
    '& [data-part="g"]': { color: 'primary.main' },
  },
};

const lineSx = {
  display: 'grid',
  gridTemplateColumns: '52px 18px minmax(0, 1fr) auto',
  columnGap: '12px',
  alignItems: 'baseline',
  px: '18px',
  py: '7px',
  m: 0,
  fontFamily: 'var(--font-sans)',
  fontSize: '13.5px',
  fontWeight: 400,
  lineHeight: 1.55,
  color: 'text.primary',
  scrollMarginTop: '80px',
  // Code font only for a real value (a field path, an image tag), in a small pill.
  '& [data-part="x"] code': valuePillSx,
  '& [data-part="x"] b': { fontWeight: 600 },
  // A Stage link inside a name ("Arrived from Test") is as bold as the name.
  '& [data-part="x"] [data-part="nm"] a': { fontWeight: 'inherit' },
  // Space and Unit links read as names in the line: sans 500.
  '& [data-part="x"] a': { fontFamily: 'var(--font-sans)', fontSize: 'inherit', fontWeight: 500, letterSpacing: 'inherit', color: 'inherit', bgcolor: 'transparent', boxShadow: 'none', px: 0, py: 0 },
  // Every button of a line has a 1px border, transparent on a filled one, so filled and outlined buttons are the same size.
  '& .MuiButton-contained': { border: '1px solid transparent' },
  '& .MuiButton-root': { lineHeight: 'normal' },
  [NARROW]: { gridTemplateColumns: '44px 16px minmax(0, 1fr)', px: '12px' },
} as const;

/** A check row's name: the thing first (a gate, a person, an action), in bold. */
export function LogName({ children }: { children: ReactNode }) {
  return (
    <Box component="b" data-part="nm" sx={{ fontSize: '13.5px', fontWeight: 600, color: 'text.primary' }}>
      {children}
    </Box>
  );
}

/** The short plain status after the name ("Passed", "Your turn"). */
export function LogStatus({ children }: { children: ReactNode }) {
  return (
    <>
      {' '}
      <Box component="span" data-part="st" sx={{ ml: 1.25, color: 'text.secondary' }}>
        {children}
      </Box>
    </>
  );
}

/** "— {rule}" after a passed gate. */
export function LogDim({ children }: { children: ReactNode }) {
  return (
    <>
      {' '}
      <Box component="span" data-part="dim" sx={{ ml: '4px', color: 'text.disabled' }}>
        {children}
      </Box>
    </>
  );
}

/**
 * A fact behind a small (i) after the status: true, but nothing the viewer acts on, so it is
 * not a line of its own. The tooltip opens on hover and on keyboard focus.
 */
export function LogInfo({ text, label, testId }: { text: string; label: string; testId?: string }) {
  return (
    <>
      {' '}
      <Tooltip title={text} enterDelay={400}>
        <Box
          component="span"
          tabIndex={0}
          role="img"
          aria-label={`${label}: ${text}`}
          data-testid={testId}
          sx={{
            display: 'inline-grid',
            placeItems: 'center',
            ml: '6px',
            verticalAlign: '-2px',
            borderRadius: 'var(--r-sm)',
            color: 'text.secondary',
            cursor: 'default',
            '&:hover': { color: 'text.primary' },
            '&:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' },
          }}
        >
          <InfoOutlinedIcon aria-hidden sx={{ fontSize: 14 }} />
        </Box>
      </Tooltip>
    </>
  );
}

/** The detail, on its own grey second line. */
export function LogSub({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Box component="span" data-part="q" data-testid={testId} sx={{ display: 'block', typography: 'body2', fontSize: '12.5px', color: 'text.secondary', mt: '2px' }}>
      {children}
    </Box>
  );
}

/** "auto": the system did it. */
export function AutoBadge() {
  return (
    <Box
      component="span"
      data-part="auto"
      sx={{
        display: 'inline-block',
        px: '7px',
        border: '1px solid var(--bd0)',
        borderRadius: 'var(--r-pill)',
        lineHeight: '18px',
        fontSize: '11px',
        color: 'text.secondary',
        bgcolor: 'background.default',
      }}
    >
      auto
    </Box>
  );
}

/**
 * A button that waits for something else: a lock and a dashed outline, so it
 * reads as "not yet" rather than as broken. It stays focusable and says why
 * through the line's sentence.
 */
export function LockedButton({ label, testId, describedBy }: { label: string; testId: string; describedBy?: string }) {
  return (
    <Button
      variant="outlined"
      aria-disabled
      aria-describedby={describedBy}
      data-testid={testId}
      data-locked="true"
      startIcon={<LockOutlinedIcon sx={{ fontSize: '14px !important' }} aria-hidden />}
      sx={{
        '& .MuiButton-startIcon': { ml: 0, mr: '6px' },
        cursor: 'not-allowed',
        bgcolor: 'background.default',
        border: '1px dashed var(--t4)',
        color: 'text.disabled',
        '&:hover': { bgcolor: 'background.default', border: '1px dashed var(--t4)' },
        '&:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' },
      }}
    >
      {label}
    </Button>
  );
}

export interface StageLogLineProps {
  testId: string;
  tone: StageLogTone;
  glyph: StageLogGlyph;
  /** Epoch ms for the time gutter; nothing when the API gives no time. */
  at?: number;
  /** The id the pill scrolls to. */
  anchor?: string;
  /** Drawn in the glyph's place instead of `glyph`: a skeleton dot. */
  glyphNode?: ReactNode;
  /** The sentence's id, for a button it explains. */
  textId?: string;
  children: ReactNode;
  /** At the right edge: who did it, or "auto". */
  meta?: ReactNode;
  /** At the right edge instead of `meta`: the line's buttons. */
  actions?: ReactNode;
  /** Under the sentence, across the sentence and action columns. */
  below?: ReactNode;
  /**
   * Instead of `meta` and `actions`: children placed in the line's grid as they
   * are, for a control that moves between the action column and the place under
   * the sentence (MergeButton's `log` layout).
   */
  grid?: ReactNode;
  /** Extra attributes kept for older specs (`data-*`). */
  data?: Record<string, string | undefined>;
}

export function StageLogLine({ testId, tone, glyph, glyphNode, at, anchor, textId, children, meta, actions, below, grid, data }: StageLogLineProps) {
  return (
    <Box component="li" id={anchor} data-testid={testId} data-tone={tone} {...data} sx={[lineSx, toneSx[tone]]}>
      <Box component="span" data-part="t" sx={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.55, color: 'text.disabled', textAlign: 'right' }}>
        {at === undefined ? '' : clockTime(at)}
      </Box>
      <Box component="span" data-part="g" aria-hidden sx={{ fontWeight: 700, textAlign: 'center', fontSize: '13px' }}>
        {glyphNode ?? glyph}
      </Box>
      <Box component="span" data-part="x" id={textId} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Box>
      {grid !== undefined ? (
        grid
      ) : actions !== undefined && actions !== null ? (
        <Box
          component="span"
          data-part="acts"
          sx={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', alignSelf: 'center', [NARROW]: { gridColumn: 3, justifyContent: 'flex-start', mt: '6px' } }}
        >
          {actions}
        </Box>
      ) : (
        <Box component="span" data-part="m" sx={{ fontSize: '12px', color: 'text.secondary', whiteSpace: 'nowrap', textAlign: 'right', [NARROW]: { gridColumn: 3, textAlign: 'left' } }}>
          {meta}
        </Box>
      )}
      {below !== undefined && below !== null ? (
        <Box sx={{ gridColumn: '3 / 5', minWidth: 0, [NARROW]: { gridColumn: 3 } }}>{below}</Box>
      ) : null}
    </Box>
  );
}
