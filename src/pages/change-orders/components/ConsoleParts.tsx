// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The parts the list consoles (ChangeOrders, ChangeSets) are built from: the title
 * row with its count and Refresh, the one-line explanation, the filter bar's
 * fields, the column head, the empty state and the footer. Each console keeps its
 * own rows, grid and state; these keep the two looking like one product.
 */

import { useId, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Cached';

import { consoleTokens as T, FILTER_SELECT_SX, R_SURFACE, SELECT_SX, controlSx } from '../consoleStyle';

export function FieldLabel({ htmlFor, id, children }: { htmlFor: string; id?: string; children: ReactNode }) {
  return (
    <Typography
      component="label"
      htmlFor={htmlFor}
      id={id}
      sx={{ fontSize: 11.5, lineHeight: T.lh, fontWeight: 600, color: T.ink3, whiteSpace: 'nowrap' }}
    >
      {children}
    </Typography>
  );
}

/**
 * The title, the count of what is shown, anything the count leaves out, and on the
 * right how fresh the list is and Refresh. The console is the page, so it owns the `h1`.
 */
export function ConsoleTitleRow({
  title,
  headingId,
  count,
  note,
  freshness,
  refreshing,
  onRefresh,
  actions,
}: {
  title: string;
  headingId: string;
  count: number;
  /** Beside the count, such as what could not be read. */
  note?: ReactNode;
  freshness: string;
  refreshing: boolean;
  onRefresh: () => void;
  /** After Refresh, such as the console's create button. */
  actions?: ReactNode;
}) {
  return (
    <Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={{ gap: '14px' }}>
      <Stack direction="row" alignItems="baseline" sx={{ gap: '10px', minWidth: 0 }}>
        <Typography
          component="h1"
          id={headingId}
          sx={{ fontSize: 21, lineHeight: T.lh, fontWeight: 650, letterSpacing: '-.02em', color: T.ink }}
        >
          {title}
        </Typography>
        <Typography component="span" sx={{ fontFamily: T.mono, fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}>
          {count}
        </Typography>
        {note}
      </Stack>

      <Stack direction="row" alignItems="center" sx={{ gap: '10px' }}>
        {freshness !== '' && (
          <Typography component="span" sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.ink3 }}>
            {freshness}
          </Typography>
        )}
        <Box
          component="button"
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          sx={{ ...controlSx('quiet', !refreshing), gap: '6px' }}
        >
          {/* Decorative: the button's own text is its accessible name already. */}
          <RefreshIcon aria-hidden="true" sx={{ fontSize: 15 }} />
          Refresh
        </Box>
        {actions}
      </Stack>
    </Stack>
  );
}

/**
 * The one-sentence explanation under the title row. Capped well short of the
 * console's width, so a reader who knows it can skip it at a glance.
 */
export function ConsoleIntro({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: 13.5, lineHeight: T.lh, color: T.ink2, maxWidth: '78ch', margin: '4px 0 16px' }}>{children}</Typography>;
}

/** The bar the filters sit in, joined to the list below it. */
export function ConsoleFilterBar({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      flexWrap="wrap"
      sx={{
        gap: '8px',
        padding: '10px 12px',
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderBottom: 'none',
        borderRadius: `${R_SURFACE} ${R_SURFACE} 0 0`,
      }}
    >
      {children}
    </Stack>
  );
}

/** The search box. `type="search"` maps to `role="searchbox"` on its own. */
export function ConsoleSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <Box
      component="input"
      type="search"
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      sx={{ ...SELECT_SX, width: 220, '&::placeholder': { color: T.ink3 } }}
    />
  );
}

/** A labelled native select whose first option, `all`, is no filter. */
export function ConsoleSelectFilter({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: readonly string[];
}) {
  const id = useId();
  return (
    <Stack direction="row" alignItems="center" sx={{ gap: '6px' }}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Box
        component="select"
        id={id}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        sx={FILTER_SELECT_SX}
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Box>
    </Stack>
  );
}

/** "Created from … to …". Each end bounds the other, so the picker offers no range that runs backwards. */
export function ConsoleDateRange({
  fromLabel,
  toLabel,
  from,
  onFrom,
  to,
  onTo,
}: {
  fromLabel: string;
  toLabel: string;
  /** `YYYY-MM-DD`, or `''` for an open end. */
  from: string;
  onFrom: (value: string) => void;
  to: string;
  onTo: (value: string) => void;
}) {
  const fromId = useId();
  const toId = useId();
  return (
    <Stack direction="row" alignItems="center" sx={{ gap: '6px' }}>
      <FieldLabel htmlFor={fromId}>{fromLabel}</FieldLabel>
      <Box
        component="input"
        type="date"
        id={fromId}
        value={from}
        max={to === '' ? undefined : to}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFrom(e.target.value)}
        sx={SELECT_SX}
      />
      <FieldLabel htmlFor={toId}>{toLabel}</FieldLabel>
      <Box
        component="input"
        type="date"
        id={toId}
        value={to}
        min={from === '' ? undefined : from}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onTo(e.target.value)}
        sx={SELECT_SX}
      />
    </Stack>
  );
}

export function ConsoleClearButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <Box component="button" type="button" onClick={onClick} disabled={disabled} sx={controlSx('quiet', !disabled)}>
      {children}
    </Box>
  );
}

/** The list itself: a card joined to the filter bar above it. */
export function ConsoleList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      role="region"
      aria-label={label}
      sx={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: `0 0 ${R_SURFACE} ${R_SURFACE}`,
        boxShadow: T.shadow,
        minWidth: 0,
      }}
    >
      {children}
    </Box>
  );
}

export interface ConsoleColumn {
  key: string;
  label: string;
  sx?: SxProps<Theme>;
}

/** Column labels, in sentence case, on the rows' own grid so the two cannot drift apart. */
export function ConsoleColumnHead({ columns, grid }: { columns: readonly ConsoleColumn[]; grid: SxProps<Theme> }) {
  return (
    <Box
      role="row"
      sx={{
        ...(grid as object),
        height: 33,
        borderBottom: `1px solid ${T.line}`,
        background: T.surfaceSunk,
      }}
    >
      {columns.map((column) => (
        <Typography
          key={column.key}
          component="span"
          sx={{
            fontSize: 11.5,
            lineHeight: T.lh,
            fontWeight: 700,
            letterSpacing: '.02em',
            textTransform: 'none',
            color: T.ink3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            ...(column.sx as object),
          }}
        >
          {column.label}
        </Typography>
      ))}
    </Box>
  );
}

export function ConsoleLoading({ testId }: { testId?: string }) {
  return (
    <Typography data-testid={testId} sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3, padding: '46px 20px 50px', textAlign: 'center' }}>
      Loading…
    </Typography>
  );
}

/** Nothing to show: `message` says whether nothing exists or the filters matched nothing, and `action` undoes the filters. */
export function ConsoleEmpty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <Stack alignItems="center" sx={{ gap: '8px', padding: '46px 20px 50px', textAlign: 'center' }}>
      <Typography sx={{ fontSize: 15, lineHeight: T.lh, fontWeight: 650, color: T.ink }}>{message}</Typography>
      {action}
    </Stack>
  );
}

/** Always under a list: how many rows are shown, and a hint. */
export function ConsoleFooter({ count, hint, countTestId }: { count: ReactNode; hint: ReactNode; countTestId?: string }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        gap: '10px',
        padding: '10px 14px',
        borderTop: `1px solid ${T.line}`,
        background: T.surfaceSunk,
        borderRadius: `0 0 ${R_SURFACE} ${R_SURFACE}`,
        fontSize: 12.5,
        lineHeight: T.lh,
        color: T.ink3,
      }}
    >
      <Typography component="span" data-testid={countTestId} sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}>
        {count}
      </Typography>
      <Typography component="span" sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}>
        {hint}
      </Typography>
    </Stack>
  );
}
