// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { Ellipses, TruncatedTooltip } from '@/components/styled';
import { HoverCard } from '@/components/styled';
import {
  type ActionStatusType,
  type ExtendedUnitRead,
} from '@confighub/rtk-query';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled, useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';

import {
  type CellData,
  CellHoverCard,
  type DeploymentEvent,
  EMPTY_CELL,
} from './CellHoverCard';

// ============================================================================
// TYPES
// ============================================================================

type TimeRange = '24h' | '7d' | '14d' | '30d' | '90d';

export interface ISyncActivityHeatmapProps {
  units: ExtendedUnitRead[];
}

interface UnitRow {
  /** UnitID — unique grid lookup key */
  key: string;
  slug: string;
  spaceSlug: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  // { value: '24h', label: 'Last 24 hours' },
  // { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  '24h': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

const CELL_GAP = 3;
const LABEL_WIDTH = 120;

// ============================================================================
// HELPERS
// ============================================================================

const mapOutcome = (
  status: ActionStatusType | undefined,
): DeploymentEvent['outcome'] | null => {
  switch (status) {
    case 'Completed':
      return 'success';
    case 'Failed':
    case 'Canceled':
    case 'Aborted':
      return 'failed';
    case 'Pending':
    case 'Submitted':
    case 'Progressing':
      return 'in_progress';
    default:
      return null;
  }
};

const buildEvents = (units: ExtendedUnitRead[]): DeploymentEvent[] => {
  const events: DeploymentEvent[] = [];
  for (const u of units) {
    const unitId = u.Unit?.UnitID;
    const slug = u.Unit?.Slug;
    const event = u.LatestUnitEvent;
    if (!unitId || !slug || !event) continue;

    const outcome = mapOutcome(event.Status);
    if (!outcome) continue;

    events.push({
      id: event.UnitEventID ?? unitId,
      unitSlug: unitId,
      environment: u.Space?.Slug ?? '',
      timestamp: event.CreatedAt ?? event.StartedAt ?? new Date().toISOString(),
      triggeredBy: event.Action ?? '',
      outcome,
    });
  }
  return events;
};

const getCellColor = (cell: CellData, maxCount: number, isDark: boolean): string => {
  if (cell.total === 0) return 'transparent';

  const successRate = cell.total > 0 ? cell.success / cell.total : 1;
  const hue = Math.round(successRate * 140);
  const intensity = maxCount > 1 ? 0.3 + (cell.total / maxCount) * 0.7 : 0.6;
  const lightness = isDark ? 40 : 45;

  return `hsla(${hue}, 75%, ${lightness}%, ${intensity})`;
};

const buildDayColumns = (days: number): dayjs.Dayjs[] => {
  const columns: dayjs.Dayjs[] = [];
  for (let i = days - 1; i >= 0; i--) {
    columns.push(dayjs().subtract(i, 'day').startOf('day'));
  }
  return columns;
};

const formatColumnLabel = (date: dayjs.Dayjs, totalColumns: number): string => {
  if (totalColumns <= 14) return date.format('MMM D');
  if (totalColumns <= 31) return date.date() % 2 === 1 ? date.format('MMM D') : '';
  return date.day() === 1 ? date.format('MMM D') : '';
};

// ============================================================================
// STYLED
// ============================================================================

const HeatmapCell = styled(Box)<{ $isEmpty?: boolean }>(({ theme, $isEmpty }) => ({
  aspectRatio: '1',
  borderRadius: theme.shape.borderRadius,
  cursor: 'default',
  border: `1px solid ${theme.palette.divider}`,
  ...(!$isEmpty && {
    transition: 'transform 0.1s, box-shadow 0.1s',
    '&:hover': {
      transform: 'scale(1.3)',
      zIndex: 1,
      boxShadow: theme.shadows[3],
    },
  }),
}));

const RowLabelContainer = styled(Box)({
  width: LABEL_WIDTH,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
  gap: 2,
});

const RowLabelSlug = styled(Ellipses)({
  fontSize: '0.75rem',
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: '1 1 auto',
  minWidth: 0,
});

const RowLabelSpace = styled(Ellipses)(({ theme }) => ({
  fontSize: '0.65rem',
  color: theme.palette.text.secondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  maxWidth: 36,
}));

const RowLabelSeparator = styled(Typography)(({ theme }) => ({
  fontSize: '0.65rem',
  color: theme.palette.text.disabled,
  flexShrink: 0,
  userSelect: 'none',
}));

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const HeatmapLegend = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Stack
      direction='row'
      alignItems='center'
      spacing={1}
      sx={{ pt: 1, pl: `${LABEL_WIDTH}px` }}
    >
      <Typography variant='caption' color='text.secondary'>
        Less
      </Typography>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <Box
          key={ratio}
          sx={{
            width: 12,
            height: 12,
            borderRadius: 0.5,
            bgcolor:
              ratio === 0
                ? 'transparent'
                : `hsla(140, 75%, ${isDark ? 40 : 45}%, ${0.3 + ratio * 0.7})`,
            border: '1px solid',
            borderColor: 'divider',
          }}
        />
      ))}
      <Typography variant='caption' color='text.secondary'>
        More
      </Typography>
      <Divider orientation='vertical' flexItem sx={{ mx: 0.5 }} />
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: 0.5,
          bgcolor: `hsla(140, 75%, ${isDark ? 40 : 45}%, 0.7)`,
        }}
      />
      <Typography variant='caption' color='text.secondary'>
        Healthy
      </Typography>
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: 0.5,
          bgcolor: `hsla(0, 75%, ${isDark ? 40 : 45}%, 0.7)`,
        }}
      />
      <Typography variant='caption' color='text.secondary'>
        Failing
      </Typography>
    </Stack>
  );
};

// ============================================================================
// COMPONENT
// ============================================================================

export const SyncActivityHeatmap = ({ units }: ISyncActivityHeatmapProps) => {
  const [expanded, setExpanded] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const days = TIME_RANGE_DAYS[timeRange];
  const columns = useMemo(() => buildDayColumns(days), [days]);
  const columnCount = columns.length;

  const allEvents = useMemo(() => buildEvents(units), [units]);

  const filteredEvents = useMemo(() => {
    const cutoff = dayjs().subtract(columnCount, 'day').startOf('day');
    return allEvents.filter((e) => dayjs(e.timestamp).isAfter(cutoff));
  }, [allEvents, columnCount]);

  // Build a lookup: unitSlug -> dayKey -> CellData
  const { grid, maxCount } = useMemo(() => {
    const map = new Map<string, Map<string, CellData>>();
    let max = 0;

    for (const event of filteredEvents) {
      const dayKey = dayjs(event.timestamp).startOf('day').toISOString();
      if (!map.has(event.unitSlug)) {
        map.set(event.unitSlug, new Map());
      }
      const unitMap = map.get(event.unitSlug)!;
      if (!unitMap.has(dayKey)) {
        unitMap.set(dayKey, {
          total: 0,
          success: 0,
          failed: 0,
          inProgress: 0,
          users: [],
          events: [],
        });
      }
      const cell = unitMap.get(dayKey)!;
      cell.total++;
      if (event.outcome === 'success') cell.success++;
      else if (event.outcome === 'failed') cell.failed++;
      else cell.inProgress++;
      if (!cell.users.includes(event.triggeredBy)) {
        cell.users.push(event.triggeredBy);
      }
      cell.events.push(event);
      if (cell.total > max) max = cell.total;
    }

    return { grid: map, maxCount: max };
  }, [filteredEvents]);

  const rows = useMemo((): UnitRow[] => {
    const rowMap = new Map<string, UnitRow>();
    for (const u of units) {
      const unitId = u.Unit?.UnitID;
      const slug = u.Unit?.Slug;
      if (unitId && slug) {
        rowMap.set(unitId, { key: unitId, slug, spaceSlug: u.Space?.Slug ?? '' });
      }
    }
    // Defensive: include any grid keys not covered by units
    for (const key of grid.keys()) {
      if (!rowMap.has(key)) {
        rowMap.set(key, { key, slug: key, spaceSlug: '' });
      }
    }
    return Array.from(rowMap.values()).sort((a, b) => a.slug.localeCompare(b.slug));
  }, [units, grid]);

  return (
    <HoverCard
      variant='outlined'
      sx={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        overflow: 'hidden',
        ...(expanded ? { height: 432 } : { alignSelf: 'flex-start', width: '100%' }),
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
          <AssessmentIcon sx={{ fontSize: 18 }} color='primary' />
          <Typography variant='h6'>Sync Activity</Typography>
        </Stack>
        <Stack direction='row' alignItems='center' spacing={1}>
          <FormControl size='small'>
            <Select
              size='small'
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              variant='outlined'
              sx={{ fontSize: '0.75rem', height: 28 }}
            >
              {TIME_RANGE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.75rem' }}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton
            size='small'
            sx={{
              p: 0,
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          >
            <ExpandMoreIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </Stack>

      <Collapse in={expanded}>
        <Divider />
        {/* Column headers — fixed, never scrolls */}
        <Box sx={{ px: 2, pt: 1, overflow: 'hidden' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `${LABEL_WIDTH}px repeat(${columns.length}, 1fr)`,
              gap: `${CELL_GAP}px`,
              mb: `${CELL_GAP}px`,
              alignItems: 'end',
            }}
          >
            <Box />
            {columns.map((col) => {
              const label = formatColumnLabel(col, columns.length);
              return (
                <Box key={col.toISOString()} sx={{ textAlign: 'center', overflow: 'hidden' }}>
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    sx={{ fontSize: '0.6rem', lineHeight: 1 }}
                  >
                    {label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Scrollable rows */}
        <Box sx={{ maxHeight: 300, overflowY: 'auto', overflowX: 'hidden', px: 2 }}>
          {rows.map((row) => {
            const unitMap = grid.get(row.key);
            return (
              <Box
                key={row.key}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `${LABEL_WIDTH}px repeat(${columns.length}, 1fr)`,
                  gap: `${CELL_GAP}px`,
                  mb: `${CELL_GAP}px`,
                  alignItems: 'center',
                }}
              >
                <RowLabelContainer>
                  {row.spaceSlug && (
                    <>
                      <TruncatedTooltip title={row.spaceSlug}>
                        <RowLabelSpace>{row.spaceSlug}</RowLabelSpace>
                      </TruncatedTooltip>
                      <RowLabelSeparator>/</RowLabelSeparator>
                    </>
                  )}
                  <TruncatedTooltip title={row.slug}>
                    <RowLabelSlug>{row.slug}</RowLabelSlug>
                  </TruncatedTooltip>
                </RowLabelContainer>
                {columns.map((col) => {
                  const dayKey = col.toISOString();
                  const cell = unitMap?.get(dayKey) ?? EMPTY_CELL;
                  const bgColor = getCellColor(cell, maxCount, isDark);

                  const isEmpty = cell.total === 0;

                  return isEmpty ? (
                    <HeatmapCell key={dayKey} $isEmpty sx={{ bgcolor: bgColor }} />
                  ) : (
                    <CellHoverCard key={dayKey} date={col} unitSlug={row.slug} cell={cell}>
                      <HeatmapCell sx={{ bgcolor: bgColor }} />
                    </CellHoverCard>
                  );
                })}
              </Box>
            );
          })}
        </Box>

        {/* Legend — fixed below rows */}
        <Box sx={{ px: 2, pb: 1 }}>
          <HeatmapLegend />
        </Box>
      </Collapse>
    </HoverCard>
  );
};
