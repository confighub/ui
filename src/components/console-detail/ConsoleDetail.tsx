// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The parts the ServiceAccount and Channel pages share with the ChangeSet page:
 * the back link above a detail view, a section card with its heading and an
 * optional action, a compact table inside a section, a status dot, and how they
 * write a time. They borrow the list consoles' tokens, so a list and its detail
 * page read as one product.
 */

import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { SummaryCard } from '@/pages/change-orders/components/SummaryFacts';
import { consoleTokens as T, R_MICRO } from '@/pages/change-orders/consoleStyle';
import { formatAbsolute, formatRelative } from '@/utility/date-format';
import { detailGrid, isSetTime, type DetailColumn } from './consoleDetailUtil';

/** "3 hours ago", with the exact time on hover; `never` when the time is not set. */
export function When({ value, never = 'Never' }: { value: string | undefined; never?: string }) {
  if (!isSetTime(value)) return <>{never}</>;
  return (
    <Tooltip title={formatAbsolute(value)} enterDelay={400}>
      <Box component='time' dateTime={value}>
        {formatRelative(value)}
      </Box>
    </Tooltip>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Box sx={{ marginBottom: '12px' }}>
      <Box component={RouterLink} to={to} sx={{ fontSize: 13.5, color: T.ink2, textDecoration: 'none', '&:hover': { color: T.ink } }}>
        ← {children}
      </Box>
    </Box>
  );
}

/** A detail page's section: a card with an `h2`, a line under it, and an optional action on the right. */
export function SectionCard({
  title,
  subtitle,
  action,
  children,
  testId,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Box sx={{ marginTop: '16px' }} data-testid={testId}>
      <SummaryCard label={title}>
        <Box sx={{ padding: '16px 20px 18px' }}>
          <Stack direction='row' alignItems='flex-start' justifyContent='space-between' sx={{ gap: '12px', marginBottom: '12px' }}>
            <Box sx={{ minWidth: 0 }}>
              <Box component='h2' sx={{ margin: 0, fontSize: 15, lineHeight: 1.35, fontWeight: 650, color: T.ink }}>
                {title}
              </Box>
              {subtitle !== undefined ? (
                <Typography sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3, marginTop: '2px', maxWidth: '90ch' }}>{subtitle}</Typography>
              ) : null}
            </Box>
            {action}
          </Stack>
          {children}
        </Box>
      </SummaryCard>
    </Box>
  );
}

/** A compact table in a section: a column head and rows on one grid. */
export type { DetailColumn };

export function DetailTable({
  columns,
  emptyText,
  children,
  rowCount,
  testId,
}: {
  columns: readonly DetailColumn[];
  emptyText: string;
  children: ReactNode;
  rowCount: number;
  testId?: string;
}) {
  const grid = detailGrid(columns);
  return (
    <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '8px', overflow: 'hidden' }} data-testid={testId} role='table'>
      <Box role='row' sx={{ ...grid, height: 30, background: T.surfaceSunk, borderBottom: rowCount > 0 ? `1px solid ${T.line}` : 'none' }}>
        {columns.map((column) => (
          <Typography
            key={column.label}
            role='columnheader'
            component='span'
            sx={{ fontSize: 11.5, fontWeight: 700, color: T.ink3, whiteSpace: 'nowrap', textAlign: column.align ?? 'left' }}
          >
            {column.label}
          </Typography>
        ))}
      </Box>
      {rowCount === 0 ? (
        <Typography sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3, padding: '14px 12px' }}>{emptyText}</Typography>
      ) : (
        children
      )}
    </Box>
  );
}

export function DetailRow({ columns, children, testId, muted = false }: { columns: readonly DetailColumn[]; children: ReactNode; testId?: string; muted?: boolean }) {
  return (
    <Box
      role='row'
      data-testid={testId}
      sx={{
        ...(detailGrid(columns) as object),
        minHeight: 40,
        paddingTop: '6px',
        paddingBottom: '6px',
        borderBottom: `1px solid ${T.line}`,
        fontSize: 12.5,
        lineHeight: T.lh,
        color: muted ? T.ink3 : T.ink,
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      {children}
    </Box>
  );
}

/** A table cell's text, cut to one line with the whole of it on hover. */
export function Cell({ children, title, mono = false, align, muted = false }: { children: ReactNode; title?: string; mono?: boolean; align?: 'right'; muted?: boolean }) {
  return (
    <Typography
      role='cell'
      component='span'
      title={title}
      sx={{
        fontSize: 12.5,
        lineHeight: T.lh,
        fontFamily: mono ? T.mono : undefined,
        color: muted ? T.ink3 : 'inherit',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minWidth: 0,
        textAlign: align ?? 'left',
      }}
    >
      {children}
    </Typography>
  );
}

/** A status dot and its word. `hollow` marks a state that has never happened. */
export function StatusDot({ color, label, hollow = false, testId }: { color: string; label: ReactNode; hollow?: boolean; testId?: string }) {
  return (
    <Stack direction='row' alignItems='center' sx={{ gap: '7px', minWidth: 0 }} data-testid={testId}>
      <Box
        aria-hidden='true'
        sx={{
          flex: 'none',
          width: 7,
          height: 7,
          borderRadius: '999px',
          background: hollow ? 'transparent' : color,
          border: hollow ? `1px solid ${color}` : 'none',
        }}
      />
      <Typography component='span' sx={{ fontSize: 12.5, lineHeight: T.lh, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </Stack>
  );
}

/** A small text button for a row: Revoke, Remove. */
export function RowAction({ onClick, children, danger = false, disabled = false, testId }: { onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <Box
      component='button'
      type='button'
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      sx={{
        all: 'unset',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 600,
        color: disabled ? T.ink3 : danger ? T.bad : T.action,
        padding: '2px 4px',
        borderRadius: R_MICRO,
        '&:hover': disabled ? undefined : { textDecoration: 'underline' },
        '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 1 },
      }}
    >
      {children}
    </Box>
  );
}
