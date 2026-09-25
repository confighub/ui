// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { Ellipses, TruncatedTooltip } from '@/components/styled';
import { HoverCard } from '@/components/styled';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TimelineIcon from '@mui/icons-material/Timeline';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { formatRelative } from '@/utility/date-format';

// ============================================================================
// TYPES & HELPERS
// ============================================================================

const MAX_EVENTS = 20;

interface EventRow {
  unitSlug: string;
  unitId: string;
  action: string;
  status: string;
  message: string;
  startedAt: string;
}

type EventChipColor = 'success' | 'error' | 'info' | 'warning' | 'default';

const statusChipColor = (status: string): EventChipColor => {
  if (status === 'Completed') return 'success';
  if (status === 'Failed') return 'error';
  if (status === 'Progressing' || status === 'Submitted' || status === 'Pending')
    return 'info';
  if (status === 'Canceled' || status === 'Aborted') return 'warning';
  return 'default';
};

// ============================================================================
// COMPONENT
// ============================================================================

interface ILatestEventsCardProps {
  units: ExtendedUnitRead[];
  selectedUnitIds: string[];
}

export const LatestEventsCard = ({ units, selectedUnitIds }: ILatestEventsCardProps) => {
  const [expanded, setExpanded] = useState(true);

  const activeUnits = useMemo(
    () =>
      selectedUnitIds.length > 0
        ? units.filter((u) => selectedUnitIds.includes(u.Unit?.UnitID ?? ''))
        : units,
    [units, selectedUnitIds],
  );

  const events = useMemo<EventRow[]>(() => {
    const rows: EventRow[] = [];
    for (const u of activeUnits) {
      const ev = u.LatestUnitEvent;
      if (!ev?.UnitEventID) continue;
      rows.push({
        unitSlug: u.Unit?.Slug ?? u.Unit?.UnitID ?? '',
        unitId: u.Unit?.UnitID ?? '',
        action: ev.Action ?? 'N/A',
        status: ev.Status ?? '',
        message: ev.Message ?? '',
        startedAt: ev.StartedAt ?? ev.TerminatedAt ?? '',
      });
    }
    rows.sort((a, b) => {
      if (!a.startedAt) return 1;
      if (!b.startedAt) return -1;
      return b.startedAt.localeCompare(a.startedAt);
    });
    return rows.slice(0, MAX_EVENTS);
  }, [activeUnits]);

  return (
    <HoverCard
      variant='outlined'
      sx={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        ...(expanded && { height: 432 }),
        //overflow: 'auto',
      }}
    >
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        p={1}
        sx={{ flexShrink: 0 }}
      >
        <Stack direction='row' alignItems='center' spacing={1}>
          <TimelineIcon sx={{ fontSize: 18 }} color='primary' />
          <Typography variant='h6'>Latest Events</Typography>
        </Stack>
        <IconButton
          size='small'
          sx={{
            p: 0,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <ExpandMoreIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>
      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ height: 432 - 41, overflowY: 'auto' }}>
          {events.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <Typography variant='body2' color='text.secondary'>
                No recent events
              </Typography>
            </Box>
          ) : (
            events.map((ev, i) => (
              <Box key={`${ev.unitId}-${ev.startedAt}`}>
                <Box
                  sx={{ px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      minWidth: 0,
                    }}
                  >
                    <TruncatedTooltip title={ev.unitSlug}>
                      <Ellipses variant='body2' fontWeight={500} noWrap>
                        {ev.unitSlug}
                      </Ellipses>
                    </TruncatedTooltip>
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}
                    >
                      <Chip
                        label={ev.action}
                        size='small'
                        variant='outlined'
                        sx={{ fontSize: '0.65rem', height: 18 }}
                      />
                      <Chip
                        label={ev.status}
                        size='small'
                        color={statusChipColor(ev.status)}
                        sx={{ fontSize: '0.65rem', height: 18 }}
                      />
                    </Box>
                  </Box>
                  {ev.message && (
                    <TruncatedTooltip title={ev.message}>
                      <Ellipses variant='caption' color='text.secondary' noWrap>
                        {ev.message}
                      </Ellipses>
                    </TruncatedTooltip>
                  )}
                  {ev.startedAt && (
                    <Typography
                      variant='caption'
                      color='text.disabled'
                      sx={{ fontSize: '0.65rem' }}
                    >
                      {formatRelative(ev.startedAt)}
                    </Typography>
                  )}
                </Box>
                {i < events.length - 1 && <Divider />}
              </Box>
            ))
          )}
        </Box>
      </Collapse>
    </HoverCard>
  );
};
