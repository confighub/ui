// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useRef, useState } from 'react';

import { plural } from '@/pages/change-orders/changeOrderHistory';
import { ENFORCEMENT_STAGE_INFO, type EnforcementStage } from '@/utility/triggerEnforcement';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { type ValidationPolicy, failureTotals } from '../validationModel';
import { PolicyCard } from './PolicyCard';

// Small fudge factor so sub-pixel rounding doesn't leave the fade visible when
// the user has effectively scrolled to the bottom.
const SCROLL_BOTTOM_EPSILON = 1;

const COLUMN_BG: Record<EnforcementStage, string> = {
  Created: '#fafafa',
  Audited: '#fff',
  Enforced: '#fff',
  Disabled: '#fafafa',
};

// The failures a stage's Triggers give, totalled under its header: an Audited Trigger warns and an
// Enforced one blocks. Created Triggers select nothing and Disabled ones run nowhere.
const FAILURE_KIND: Record<EnforcementStage, 'error' | 'warning' | undefined> = {
  Created: undefined,
  Audited: 'warning',
  Enforced: 'error',
  Disabled: undefined,
};

const FAILURE_COLOR = { error: 'error.main', warning: 'warning.dark' } as const;

type FailureKind = 'error' | 'warning';

/**
 * The failures of a column's cards, summed, under its header. The other kind of failure shows too
 * when there is any, from before a Trigger changed between warning and blocking, with what to do.
 * Clicking a count shows only the cards with that kind of failure, and clicking it again shows all.
 */
const FailureTotals = ({
  stage,
  kind,
  totals,
  filter,
  onFilterChange,
}: {
  stage: EnforcementStage;
  kind: FailureKind;
  totals: Record<FailureKind, number>;
  filter: FailureKind | null;
  onFilterChange: (filter: FailureKind | null) => void;
}) => {
  const shown = (['error', 'warning'] as const).filter((k) => k === kind || totals[k] > 0);
  return (
    <Box
      data-testid={`validation-column-${stage}-totals`}
      // Indented past the stage's dot, to line up with its label.
      sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 0.5, mt: 0.5, pl: 1.5 }}
    >
      {shown.map((k) => {
        const label = plural(totals[k], k);
        if (totals[k] === 0)
          return (
            <Typography
              key={k}
              variant='body2'
              fontSize='0.75rem'
              color='text.secondary'
              sx={{ px: 0.5 }}
            >
              {label}
            </Typography>
          );
        const active = filter === k;
        const stale =
          k === kind
            ? ''
            : ` Recorded before the Trigger ${kind === 'warning' ? 'returned to audit' : 'was enforced'}: open the Trigger and Evaluate it to update them.`;
        return (
          <Tooltip
            key={k}
            title={`${active ? 'Show all the Triggers.' : `Show only the Triggers with ${k}s.`}${stale}`}
          >
            <ButtonBase
              onClick={() => onFilterChange(active ? null : k)}
              aria-pressed={active}
              data-testid={`validation-column-${stage}-filter-${k}`}
              sx={{
                px: 0.5,
                borderRadius: 1,
                fontSize: '0.75rem',
                fontWeight: 600,
                lineHeight: 1.43,
                color: FAILURE_COLOR[k],
                bgcolor: active ? 'action.selected' : undefined,
                '&:hover': { bgcolor: 'action.hover', textDecoration: 'underline' },
              }}
            >
              {label}
            </ButtonBase>
          </Tooltip>
        );
      })}
    </Box>
  );
};

const COLLAPSED_WIDTH = 44;
const COLUMN_MAX_HEIGHT = 'calc(100vh - 240px)';
const FADE_HEIGHT = 28;

interface KanbanColumnProps {
  stage: EnforcementStage;
  policies: ValidationPolicy[];
  selectedId: string | null;
  isCollapsed: boolean;
  isLast: boolean;
  onToggleCollapse: () => void;
}

/** One stage of the Validation board: the Triggers in it, as cards. */
export const KanbanColumn = ({
  stage,
  policies,
  selectedId,
  isCollapsed,
  isLast,
  onToggleCollapse,
}: KanbanColumnProps) => {
  const config = { ...ENFORCEMENT_STAGE_INFO[stage], bg: COLUMN_BG[stage] };
  const failureKind = FAILURE_KIND[stage];
  const totals = useMemo(() => failureTotals(policies), [policies]);
  const [failureFilter, setFailureFilter] = useState<FailureKind | null>(null);
  // A filter whose failures have all gone, as after an Evaluate or a search, is turned off, so it
  // does not come back on by itself when they return.
  if (failureFilter && totals[failureFilter] === 0) setFailureFilter(null);
  const activeFilter = failureFilter && totals[failureFilter] > 0 ? failureFilter : null;
  const shownPolicies = activeFilter
    ? policies.filter((p) => p.unitCounts[activeFilter] > 0)
    : policies;

  // Only show the bottom fade when the cards container actually overflows AND
  // the user hasn't scrolled to the very bottom. Tracked via a callback ref so
  // we can attach/detach the scroll + resize listeners without a useEffect.
  const [showFade, setShowFade] = useState(false);
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const updateFade = useCallback(() => {
    const el = scrollElRef.current;
    if (!el) {
      setShowFade(false);
      return;
    }
    const hasOverflow = el.scrollHeight > el.clientHeight;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_BOTTOM_EPSILON;
    setShowFade(hasOverflow && !atBottom);
  }, []);

  const scrollCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Tear down any previous observation / listeners.
      if (scrollElRef.current) {
        scrollElRef.current.removeEventListener('scroll', updateFade);
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      scrollElRef.current = node;

      if (!node) {
        setShowFade(false);
        return;
      }

      node.addEventListener('scroll', updateFade, { passive: true });
      const observer = new ResizeObserver(updateFade);
      observer.observe(node);
      // Observe children so that card additions/removals re-evaluate overflow.
      for (const child of Array.from(node.children)) {
        observer.observe(child);
      }
      resizeObserverRef.current = observer;
      updateFade();
    },
    [updateFade],
  );

  if (isCollapsed) {
    return (
      <Tooltip title={`Expand ${config.label}`} placement='top'>
        <Box
          onClick={onToggleCollapse}
          role='button'
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleCollapse();
            }
          }}
          sx={{
            width: COLLAPSED_WIDTH,
            flexShrink: 0,
            py: 1.5,
            px: 0.5,
            borderRight: '1px solid',
            borderColor: 'divider',
            backgroundColor: config.bg,
            '&:last-child': { borderRight: 'none' },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'background-color 0.2s ease',
            '&:hover': { backgroundColor: 'action.hover' },
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: config.dotColor,
              flexShrink: 0,
            }}
          />
          <Chip
            label={policies.length}
            size='small'
            sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500 }}
          />
          <Typography
            variant='subtitle2'
            fontWeight={600}
            color='text.primary'
            sx={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              whiteSpace: 'nowrap',
            }}
          >
            {config.label}
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box
      data-testid={`validation-column-${stage}`}
      sx={{
        flex: 1,
        minWidth: 0,
        p: 1.5,
        borderRight: '1px solid',
        borderColor: 'divider',
        backgroundColor: config.bg,
        '&:last-child': { borderRight: 'none' },
        display: 'flex',
        flexDirection: 'column',
        minHeight: 200,
        maxHeight: COLUMN_MAX_HEIGHT,
        transition: 'background-color 0.2s ease',
      }}
    >
      {/* Column header */}
      <Box
        sx={{
          pb: 1.5,
          mb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Stack direction='row' alignItems='center' spacing={1}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: config.dotColor,
              flexShrink: 0,
            }}
          />
          <Tooltip title={config.description}>
            <Typography variant='subtitle2' fontWeight={600} color='text.primary'>
              {config.label}
            </Typography>
          </Tooltip>
          <Chip
            label={
              activeFilter ? `${shownPolicies.length} of ${policies.length}` : policies.length
            }
            size='small'
            sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500, ml: 'auto !important' }}
          />
          <Tooltip title='Collapse'>
            <IconButton
              size='small'
              onClick={onToggleCollapse}
              aria-label={`Collapse ${config.label}`}
              sx={{ p: 0.25 }}
            >
              {isLast ? (
                <ChevronLeftIcon fontSize='small' />
              ) : (
                <ChevronRightIcon fontSize='small' />
              )}
            </IconButton>
          </Tooltip>
        </Stack>
        {failureKind && policies.length > 0 && (
          <FailureTotals
            stage={stage}
            kind={failureKind}
            totals={totals}
            filter={activeFilter}
            onFilterChange={setFailureFilter}
          />
        )}
      </Box>

      {/* Cards - scrollable with hidden scrollbar and bottom fade */}
      <Stack
        ref={scrollCallbackRef}
        spacing={1}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          // Padding gives hover lift + drop-shadow room so the first/last/side cards aren't clipped
          pt: 1,
          pb: 0.5,
          px: 0.5,
          mx: -0.5,
          // Only fade when content actually overflows and user hasn't scrolled to the bottom.
          ...(showFade
            ? {
                maskImage: `linear-gradient(to bottom, black calc(100% - ${FADE_HEIGHT}px), transparent)`,
                WebkitMaskImage: `linear-gradient(to bottom, black calc(100% - ${FADE_HEIGHT}px), transparent)`,
              }
            : {}),
        }}
      >
        {policies.length === 0 ? (
          <Typography
            variant='body2'
            fontSize='0.75rem'
            color='text.disabled'
            sx={{ textAlign: 'center', py: 4 }}
          >
            {config.description}
          </Typography>
        ) : (
          shownPolicies.map((p) => (
            <PolicyCard key={p.id} policy={p} isSelected={p.id === selectedId} />
          ))
        )}
      </Stack>
    </Box>
  );
};
