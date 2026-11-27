// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { HEADER_HEIGHT, HEADER_STICKY_TOP } from './unitHeaderLayout';
import { useMemo, useRef, type ReactElement, type ReactNode } from 'react';

import { InfoPeekTooltip } from '@/components/info-peek/InfoPeek';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import type { MergedUnit } from './componentTypes';
import { componentTheme } from './componentTheme';
import { CHIP_TONE, GatedIcon, PendingIcon, UpgradingIcon, WarningIcon } from './flow-graph/DeploymentFlowNode';
import {
  unitHeaderAriaLabel,
  unitHeaderStatuses,
  type UnitHeaderStatus,
  type UnitHeaderStatusKind,
} from './unitHeaderStatus';

/** The widest a status peek gets; a longer line wraps. */
const PEEK_MAX_WIDTH = 300;

const TONE_OF: Record<UnitHeaderStatusKind, keyof typeof CHIP_TONE> = {
  loading: 'stale',
  error: 'danger',
  'not-read': 'neutral',
  stale: 'stale',
  unreleased: 'unreleased',
  warnings: 'warned',
  gated: 'gated',
};

const ErrorGlyph = () => (
  <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
    <circle cx='8' cy='8' r='6' />
    <path d='M8 4.8v3.7' />
    <path d='M8 10.9v.01' />
  </svg>
);

const NotReadGlyph = () => (
  <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
    <circle cx='8' cy='8' r='6' strokeDasharray='2.2 2.2' />
    <path d='M8 8v.01' />
  </svg>
);

const GLYPH: Record<Exclude<UnitHeaderStatusKind, 'loading'>, () => ReactElement> = {
  error: ErrorGlyph,
  'not-read': NotReadGlyph,
  stale: UpgradingIcon,
  unreleased: PendingIcon,
  warnings: WarningIcon,
  gated: GatedIcon,
};

const TEST_ID: Record<UnitHeaderStatusKind, string> = {
  loading: 'unit-status-loading',
  error: 'unit-status-error',
  'not-read': 'unit-status-not-read',
  stale: 'unit-status-stale',
  unreleased: 'unit-status-unreleased',
  warnings: 'unit-status-warnings',
  gated: 'unit-status-gated',
};

/**
 * Esc on an icon whose peek is open closes the peek and returns focus to the header, and goes no
 * further: the pane's own Esc handler would otherwise close the whole pane with it.
 */
const closePeekOnEsc = (e: React.KeyboardEvent<HTMLElement>): boolean => {
  if (e.key !== 'Escape' || !e.currentTarget.hasAttribute('aria-labelledby')) return false;
  e.stopPropagation();
  e.currentTarget.closest<HTMLElement>('[role="button"][aria-expanded]')?.focus();
  return true;
};

const iconSx = (kind: UnitHeaderStatusKind) => {
  const { color, tint, tintHover } = CHIP_TONE[TONE_OF[kind]];
  return {
    width: 24,
    height: 24,
    borderRadius: `${componentTheme.radiusSm}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color,
    background: kind === 'loading' ? CHIP_TONE.neutral.tint : tint,
    cursor: kind === 'loading' ? 'default' : 'pointer',
    transition: 'background .12s',
    '&:hover': { background: kind === 'loading' ? CHIP_TONE.neutral.tint : tintHover },
    '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: 1 },
    '& svg': { width: 14, height: 14, display: 'block' },
  } as const;
};

/**
 * One status icon with its peek. Hover and keyboard focus open the peek (MUI's tooltip opens
 * on both and closes on Esc). A Gated or Warnings icon links to the Unit's Overview; the others open the Unit's body.
 */
const StatusIcon = ({
  status,
  onReview,
}: {
  status: UnitHeaderStatus;
  onReview: () => void;
}) => {
  const navigate = useNavigate();
  const { kind, href } = status;
  const tone = CHIP_TONE[TONE_OF[kind]].color;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const common = {
    'data-testid': TEST_ID[kind],
    'aria-label': status.label,
    sx: iconSx(kind),
    onMouseDown: stop,
    onKeyDown: closePeekOnEsc,
  };
  const trigger =
    kind === 'loading' ? (
      <Box component='span' role='img' tabIndex={0} {...common}>
        <CircularProgress size={14} sx={{ color: tone }} />
      </Box>
    ) : href ? (
      <Box component={RouterLink} to={href} onClick={stop} {...common}>
        {GLYPH[kind]()}
      </Box>
    ) : kind === 'stale' || kind === 'unreleased' ? (
      <Box
        component='span'
        role='button'
        tabIndex={0}
        {...common}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onReview();
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
          if (closePeekOnEsc(e)) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onReview();
          }
        }}
      >
        {GLYPH[kind]()}
      </Box>
    ) : (
      <Box component='span' role='img' tabIndex={0} {...common}>
        {GLYPH[kind]()}
      </Box>
    );
  return (
    <InfoPeekTooltip
      color={tone}
      spec={{ eyebrow: status.eyebrow, lines: status.lines, action: status.action }}
      onAction={href ? () => navigate(href) : status.action ? onReview : undefined}
      placement='bottom-end'
      testId='unit-status-peek'
      maxWidth={PEEK_MAX_WIDTH}
    >
      {trigger}
    </InfoPeekTooltip>
  );
};

/** The search matches in a name: a 2px underline in the text colour, as in the sheet, never a fill. */
function underlineMatches(text: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;
  const out: ReactNode[] = [];
  const lower = text.toLowerCase();
  let at = 0;
  for (let from = lower.indexOf(needle); from !== -1; from = lower.indexOf(needle, at)) {
    if (from > at) out.push(text.slice(at, from));
    out.push(
      <span key={from} data-testid='unit-header-match' style={{ textDecoration: `underline 2px ${componentTheme.fgDefault}`, textUnderlineOffset: 3 }}>
        {text.slice(from, from + needle.length)}
      </span>,
    );
    at = from + needle.length;
  }
  out.push(text.slice(at));
  return out;
}

export interface UnitHeaderProps {
  unit: MergedUnit;
  /** Slug of the Unit's Space. */
  spaceSlug: string;
  expanded: boolean;
  /** The oversized-Unit gate holds the Unit back. */
  held: boolean;
  filterText: string;
  /** False when the inline Unit details cannot open, so the name stays a plain link. */
  canOpenDetails: boolean;
  onToggle: () => void;
  onOpenDetails: () => void;
  /** Open the Unit's body, where its upgrade or release is reviewed. */
  onReview: () => void;
  /** The Unit's configuration is still being read. */
  dataLoading?: boolean;
  /** The read of where each field comes from failed. */
  originError?: boolean;
  /** Why the folded Unit shows nothing in the scope ("Nothing incoming"), after its name. */
  note?: string;
}

/**
 * The header of one Unit in the Component view's list: the Unit's name and its status icons,
 * and nothing else. Every other fact is in an icon's peek, the name's tooltip or the header's
 * accessible name. The whole band toggles the Unit.
 */
export const UnitHeader = ({
  unit,
  spaceSlug,
  expanded,
  held,
  filterText,
  canOpenDetails,
  onToggle,
  onOpenDetails,
  onReview,
  dataLoading = false,
  originError = false,
  note,
}: UnitHeaderProps) => {
  const headerRef = useRef<HTMLDivElement>(null);
  const statuses = useMemo(() => unitHeaderStatuses(unit, { expanded, held, dataLoading, originError }),
    [unit, expanded, held, dataLoading, originError],
  );

  return (
    <Box
      ref={headerRef}
      role='button'
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={unitHeaderAriaLabel(spaceSlug, unit.slug, statuses)}
      data-testid='unit-header'
      onClick={onToggle}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      sx={{
        // An open Unit's header sticks under the drawer's filter row, with the part bar under it.
        // PaneContent's 8px of vertical padding is the scrollport's edge for a sticky box, so the
        // header sticks flush with the list's top only when it starts that far above it.
        position: expanded ? 'sticky' : 'relative',
        top: expanded ? HEADER_STICKY_TOP : 'auto',
        // Above the body's value rows (z-index up to 11) that scroll under it.
        zIndex: expanded ? 12 : 'auto',
        boxSizing: 'border-box',
        height: HEADER_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '0 12px 0 10px',
        cursor: 'pointer',
        background: componentTheme.bgDefault,
        borderRadius: expanded ? '8px 8px 0 0' : '8px',
        borderBottom: expanded ? `1px solid ${componentTheme.borderMuted}` : 'none',
        outline: 'none',
        transition: 'background .12s',
        '&:hover': { background: componentTheme.bgSubtle },
        '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: -2 },
        '&:hover .unit-header-chevron': { background: componentTheme.borderDefault },
      }}
    >
      <Box
        component='span'
        className='unit-header-chevron'
        data-testid='unit-header-chevron'
        sx={{
          width: 28,
          height: 28,
          borderRadius: `${componentTheme.radiusSm}px`,
          background: expanded ? componentTheme.borderDefault : componentTheme.bgInset,
          color: expanded ? componentTheme.fgDefault : componentTheme.fgMuted,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform .15s, background .12s',
        }}
      >
        <ChevronRightIcon sx={{ fontSize: 18 }} />
      </Box>
      <Tooltip
        title={`${spaceSlug}/${unit.slug}`}
        placement='bottom-start'
        slotProps={{ tooltip: { 'data-testid': 'unit-name-tooltip' } as object }}
      >
        <Box
          component='a'
          data-testid='unit-header-name'
          href={`/units/${unit.spaceId}/${unit.unitId}`}
          // The real href keeps middle click, cmd or ctrl click and the context menu opening the
          // Unit's page in a new tab; a plain click opens the inline details.
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            if (!canOpenDetails || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
              return;
            }
            e.preventDefault();
            onOpenDetails();
          }}
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            // The link is only as wide as the name (it shrinks, never grows), so the rest of the
            // band is the toggle.
            flex: '0 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            fontFamily: componentTheme.fontMono,
            fontSize: 14,
            fontWeight: 600,
            color: componentTheme.fgDefault,
            whiteSpace: 'nowrap',
            textDecoration: 'none',
            '&:hover': { color: componentTheme.accentEmphasis },
            '&:hover [data-testid="unit-header-slug"]': { textDecoration: 'underline', textUnderlineOffset: '3px' },
            '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: 1, borderRadius: 2 },
          }}
        >
          <Box
            component='span'
            data-testid='unit-header-slug'
            sx={{ flex: '0 1 auto', minWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {filterText ? underlineMatches(unit.slug, filterText) : unit.slug}
          </Box>
        </Box>
      </Tooltip>
      {note && (
        <Box
          component='span'
          data-testid='unit-header-note'
          sx={{ flexShrink: 0, fontFamily: componentTheme.fontSans, fontSize: 12, color: componentTheme.fgMuted, whiteSpace: 'nowrap' }}
        >
          {note}
        </Box>
      )}
      {statuses.length > 0 && (
        <Box
          data-testid='unit-status-icons'
          sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: 'auto' }}
        >
          {statuses.map((status) => (
            <StatusIcon key={status.kind} status={status} onReview={onReview} />
          ))}
        </Box>
      )}
    </Box>
  );
};
