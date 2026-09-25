// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type ReactElement } from 'react';

import {
  HoverCard,
  HoverCardBadge,
  HoverCardHeader,
  HoverCardTitle,
} from '@/components/hover-card/HoverCard';
import CircleIcon from '@mui/icons-material/Circle';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';

import { formatRelative } from '@/utility/date-format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeploymentEvent {
  id: string;
  unitSlug: string;
  environment: string;
  timestamp: string;
  triggeredBy: string;
  outcome: 'success' | 'failed' | 'in_progress';
}

export interface CellData {
  total: number;
  success: number;
  failed: number;
  inProgress: number;
  users: string[];
  events: DeploymentEvent[];
}

export const EMPTY_CELL: CellData = {
  total: 0,
  success: 0,
  failed: 0,
  inProgress: 0,
  users: [],
  events: [],
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const actionChipColorMap: Record<
  string,
  'primary' | 'error' | 'info' | 'warning' | 'default'
> = {
  Apply: 'primary',
  Destroy: 'error',
  Refresh: 'info',
  Import: 'warning',
};

const outcomeDotColor: Record<DeploymentEvent['outcome'], string> = {
  success: 'success.main',
  failed: 'error.main',
  in_progress: 'warning.main',
};

const outcomeLabel: Record<DeploymentEvent['outcome'], string> = {
  success: 'Synced successfully',
  failed: 'Sync failed',
  in_progress: 'Syncing',
};

// ---------------------------------------------------------------------------
// Hover card content
// ---------------------------------------------------------------------------

interface CellHoverContentProps {
  date: dayjs.Dayjs;
  unitSlug: string;
  cell: CellData;
}

const CellHoverContent = ({ date, unitSlug, cell }: CellHoverContentProps) => {
  const hasFailures = cell.failed > 0;

  return (
    <>
      <HoverCardHeader>
        <Box sx={{ overflow: 'hidden' }}>
          <HoverCardTitle variant='subtitle2'>{unitSlug}</HoverCardTitle>
          <Typography variant='caption' color='text.secondary' sx={{ fontSize: '0.6875rem' }}>
            {date.format('dddd, MMMM D')}
          </Typography>
        </Box>
        <HoverCardBadge
          sx={
            hasFailures
              ? { bgcolor: 'error.main', color: 'error.contrastText', opacity: 0.85 }
              : undefined
          }
        >
          {cell.total} {cell.total === 1 ? 'sync' : 'syncs'}
        </HoverCardBadge>
      </HoverCardHeader>

      <Stack spacing={0}>
        {cell.events.map((event, idx) => (
          <Box key={event.id}>
            <Stack
              direction='column'
              justifyContent='space-between'
              sx={{ py: 0.75, px: 0.5 }}
            >
              <Stack direction='row' alignItems='center' spacing={0.75} sx={{ minWidth: 0 }}>
                <Chip
                  size='small'
                  label={event.triggeredBy || 'Sync'}
                  color={actionChipColorMap[event.triggeredBy] ?? 'default'}
                  sx={{ height: 18, fontSize: '0.6rem' }}
                />
                <CircleIcon sx={{ fontSize: 6, color: outcomeDotColor[event.outcome] }} />
                <Typography variant='caption' sx={{ fontSize: '0.65rem' }} noWrap>
                  {outcomeLabel[event.outcome]}
                </Typography>
              </Stack>
              <Stack direction='row' alignItems='center' spacing={0.5} sx={{ flexShrink: 0 }}>
                <Typography
                  variant='caption'
                  color='text.secondary'
                  sx={{ fontSize: '0.625rem' }}
                >
                  {formatRelative(event.timestamp)}
                </Typography>
              </Stack>
            </Stack>
            {idx < cell.events.length - 1 && <Divider />}
          </Box>
        ))}
      </Stack>
    </>
  );
};

// ---------------------------------------------------------------------------
// Wrapper component
// ---------------------------------------------------------------------------

interface ICellHoverCardProps {
  children: ReactElement;
  date: dayjs.Dayjs;
  unitSlug: string;
  cell: CellData;
}

export const CellHoverCard = ({ children, date, unitSlug, cell }: ICellHoverCardProps) => (
  <HoverCard
    content={<CellHoverContent date={date} unitSlug={unitSlug} cell={cell} />}
    placement='bottom-start'
    offset={[0, 8]}
    enabled={cell.total > 0}
    triggerSx={{ display: 'block', width: 'auto' }}
  >
    {children}
  </HoverCard>
);
