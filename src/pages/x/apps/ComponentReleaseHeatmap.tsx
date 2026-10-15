// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

import {
  HoverCard,
  HoverCardBadge,
  HoverCardHeader,
  HoverCardTitle,
} from '@/components/hover-card/HoverCard';
import { useListReleasesSinceChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { useComponentSlugs } from '@/hooks/useComponentSlugs';
import { usePolling } from '@/hooks/usePolling';
import { formatRelative } from '@/utility/date-format';
import { getApiErrorMessage } from '@/utility/error-functions';
import type { ExtendedSpaceRead } from '@confighub/rtk-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';

import { type SelectedApp } from './appTypes';
import { LIVE_TONE_COLOR } from './componentTheme';
import {
  deriveHealthPresentation,
  deriveSyncPresentation,
  liveStatusLabel,
  resolveLiveStatusProvider,
  type VitalTone,
} from './liveStatus';
import {
  buildReleaseHeatmap,
  dayKey,
  type HeatmapCell,
  type HeatmapRelease,
  heatmapDays,
  heatmapSince,
} from './releaseHeatmap';

// ============================================================================
// CONSTANTS
// ============================================================================

const RANGE_OPTIONS = [14, 30, 90] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];

/** A reporter writes a Release's live status whenever it observes a change, and nothing tells this page when. */
const POLL_MS = 30_000;

const LABEL_WIDTH = 160;
const CELL_GAP = 3;
const CELL_HEIGHT = 18;

/** Legend order, worst last, with what each tone means for the Releases in a cell. */
const TONE_LEGEND: { tone: VitalTone; label: string }[] = [
  { tone: 'ok', label: 'Synced and healthy' },
  { tone: 'neutral', label: 'Not reported' },
  { tone: 'progress', label: 'Progressing' },
  { tone: 'attention', label: 'Out of sync' },
  { tone: 'danger', label: 'Degraded or failed' },
];

// ============================================================================
// HELPERS
// ============================================================================

/** Shade a cell by how many Releases it holds, against the busiest cell. */
const cellOpacity = (count: number, maxCount: number): number =>
  maxCount > 1 ? 0.4 + 0.6 * (count / maxCount) : 1;

const columnLabel = (day: string, totalColumns: number): string => {
  const date = dayjs(day);
  if (totalColumns <= 14) return date.format('MMM D');
  if (totalColumns <= 31) return date.date() % 2 === 1 ? date.format('MMM D') : '';
  return date.day() === 1 ? date.format('MMM D') : '';
};

/** The live status of one Release, in its reporter's words: "Synced · Healthy". */
const liveStatusText = (release: HeatmapRelease): string => {
  const status = release.liveStatus;
  if (!status) return 'Not reported';
  const provider = resolveLiveStatusProvider(status);
  const sync = deriveSyncPresentation(status);
  const health = deriveHealthPresentation(status);
  const words = [
    sync && liveStatusLabel(provider, 'sync', sync),
    health && liveStatusLabel(provider, 'health', health),
  ].filter(Boolean);
  return words.length > 0 ? words.join(' · ') : 'Not reported';
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface CellHoverContentProps {
  componentName: string;
  day: string;
  cell: HeatmapCell;
}

const CellHoverContent = ({ componentName, day, cell }: CellHoverContentProps) => {
  const count = cell.releases.length;
  return (
    <>
      <HoverCardHeader>
        <Box sx={{ overflow: 'hidden' }}>
          <HoverCardTitle variant='subtitle2'>{componentName}</HoverCardTitle>
          <Typography variant='caption' color='text.secondary' sx={{ fontSize: '0.6875rem' }}>
            {dayjs(day).format('dddd, MMMM D')}
          </Typography>
        </Box>
        <HoverCardBadge
          sx={{ bgcolor: alpha(LIVE_TONE_COLOR[cell.tone], 0.12), color: LIVE_TONE_COLOR[cell.tone] }}
        >
          {count} {count === 1 ? 'release' : 'releases'}
        </HoverCardBadge>
      </HoverCardHeader>
      <Box sx={{ maxHeight: 280, overflowY: 'auto' }}>
        {cell.releases.map((release, idx) => (
          <Box key={release.releaseId}>
            <Box sx={{ py: 0.75, px: 0.5 }} data-testid='release-heatmap-release'>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.75rem', fontWeight: 600, minWidth: 0 }}>
                  {release.spaceSlug}
                </Typography>
                <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', flexShrink: 0 }}>
                  Release {release.releaseNum}
                </Typography>
                {!release.published && (
                  <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled', flexShrink: 0 }}>
                    withdrawn
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: LIVE_TONE_COLOR[release.tone],
                    flexShrink: 0,
                  }}
                />
                <Typography noWrap sx={{ fontSize: '0.6875rem', flex: 1, minWidth: 0 }}>
                  {liveStatusText(release)}
                </Typography>
                <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary', flexShrink: 0 }}>
                  {formatRelative(release.createdAt)}
                </Typography>
              </Box>
            </Box>
            {idx < cell.releases.length - 1 && <Divider />}
          </Box>
        ))}
      </Box>
    </>
  );
};

const HeatmapLegend = ({ maxCount }: { maxCount: number }) => {
  const swatch = (color: string, opacity = 1) => (
    <Box
      sx={{
        width: 11,
        height: 11,
        borderRadius: '3px',
        bgcolor: alpha(color, opacity),
        flexShrink: 0,
      }}
    />
  );
  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, pt: 1.5, pl: `${LABEL_WIDTH}px` }}
    >
      {TONE_LEGEND.map(({ tone, label }) => (
        <Box key={tone} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {swatch(LIVE_TONE_COLOR[tone])}
          <Typography variant='caption' color='text.secondary'>
            {label}
          </Typography>
        </Box>
      ))}
      {maxCount > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
          <Typography variant='caption' color='text.secondary'>
            1
          </Typography>
          {[1, Math.ceil(maxCount / 2), maxCount].map((count, i) => (
            <Box key={i}>{swatch(LIVE_TONE_COLOR.ok, cellOpacity(count, maxCount))}</Box>
          ))}
          <Typography variant='caption' color='text.secondary'>
            {maxCount} releases a day
          </Typography>
        </Box>
      )}
    </Box>
  );
};

// ============================================================================
// COMPONENT
// ============================================================================

interface ComponentReleaseHeatmapProps {
  spaces: ExtendedSpaceRead[];
  /** Fires when a row or one of its cells is clicked — opens that Component's own graph. */
  onComponentSelect: (app: SelectedApp) => void;
}

/**
 * Releases by Component and day, each cell coloured by the worst live status
 * among its Releases and shaded by how many there were. See releaseHeatmap.ts.
 */
export const ComponentReleaseHeatmap = ({ spaces, onComponentSelect }: ComponentReleaseHeatmapProps) => {
  const theme = useTheme();
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const { componentById } = useComponentSlugs();

  // Recomputed when the day changes, not on every render.
  const today = dayKey(new Date());
  const days = useMemo(() => heatmapDays(rangeDays, dayjs(today).toDate()), [rangeDays, today]);
  const since = useMemo(() => heatmapSince(rangeDays, dayjs(today).toDate()), [rangeDays, today]);

  const spaceIds = useMemo(
    () => spaces.flatMap((s) => (s.Space?.SpaceID && s.Space.ComponentID ? [s.Space.SpaceID] : [])),
    [spaces],
  );
  const skip = spaceIds.length === 0;
  const { data, isLoading, error, refetch } = useListReleasesSinceChunkedQuery({ spaceIds, since }, { skip });
  const poll = useCallback(() => {
    if (!skip) void refetch();
  }, [skip, refetch]);
  usePolling(poll, POLL_MS);

  const heatmap = useMemo(
    () => buildReleaseHeatmap(data ?? [], spaces, componentById, days),
    [data, spaces, componentById, days],
  );

  if (heatmap.rows.length === 0) return null;

  const gridColumns = `${LABEL_WIDTH}px repeat(${days.length}, minmax(0, 1fr))`;

  let body;
  if (error) {
    body = (
      <Alert severity='error' sx={{ m: 2 }}>
        {getApiErrorMessage(error) || 'Failed to load Releases.'}
      </Alert>
    );
  } else if (isLoading) {
    body = (
      <Box sx={{ p: 2 }}>
        {heatmap.rows.slice(0, 6).map((row) => (
          <Skeleton key={row.componentId} variant='rounded' height={CELL_HEIGHT} sx={{ mb: `${CELL_GAP}px` }} />
        ))}
      </Box>
    );
  } else {
    body = (
      <Box sx={{ px: 2, pt: 1, pb: 1.5 }}>
        {/* Column headers stay put while the rows scroll. */}
        <Box sx={{ display: 'grid', gridTemplateColumns: gridColumns, gap: `${CELL_GAP}px`, mb: `${CELL_GAP}px` }}>
          <Box />
          {days.map((day) => (
            <Box key={day} sx={{ textAlign: 'center', overflow: 'visible', whiteSpace: 'nowrap' }}>
              <Typography variant='caption' color='text.secondary' sx={{ fontSize: '0.625rem', lineHeight: 1 }}>
                {columnLabel(day, days.length)}
              </Typography>
            </Box>
          ))}
        </Box>
        <Box sx={{ maxHeight: 320, overflowY: 'auto', overflowX: 'hidden' }}>
          {heatmap.rows.map((row) => {
            const select = () => onComponentSelect({ name: row.componentName, owner: row.owner });
            return (
              <Box
                key={row.componentId}
                data-testid='release-heatmap-row'
                data-component={row.componentName}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: gridColumns,
                  gap: `${CELL_GAP}px`,
                  mb: `${CELL_GAP}px`,
                  alignItems: 'center',
                }}
              >
                <Typography
                  noWrap
                  onClick={select}
                  title={row.componentName}
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    pr: 1,
                    cursor: 'pointer',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  {row.componentName}
                </Typography>
                {days.map((day) => {
                  const cell = row.cells.get(day);
                  if (!cell) {
                    return (
                      <Box
                        key={day}
                        sx={{ height: CELL_HEIGHT, borderRadius: '3px', border: `1px solid ${theme.palette.divider}` }}
                      />
                    );
                  }
                  return (
                    <HoverCard
                      key={day}
                      content={<CellHoverContent componentName={row.componentName} day={day} cell={cell} />}
                      placement='bottom-start'
                      offset={[0, 8]}
                      triggerSx={{ display: 'block', width: 'auto' }}
                    >
                      <Box
                        onClick={select}
                        data-testid='release-heatmap-cell'
                        data-day={day}
                        data-tone={cell.tone}
                        data-count={cell.releases.length}
                        sx={{
                          height: CELL_HEIGHT,
                          borderRadius: '3px',
                          cursor: 'pointer',
                          bgcolor: alpha(LIVE_TONE_COLOR[cell.tone], cellOpacity(cell.releases.length, heatmap.maxCount)),
                          transition: 'transform 0.1s, box-shadow 0.1s',
                          '&:hover': { transform: 'scale(1.25)', boxShadow: theme.shadows[3], position: 'relative', zIndex: 1 },
                        }}
                      />
                    </HoverCard>
                  );
                })}
              </Box>
            );
          })}
        </Box>
        {heatmap.releaseCount === 0 && (
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', pt: 1, pl: `${LABEL_WIDTH}px` }}>
            No Releases in the last {rangeDays} days.
          </Typography>
        )}
        <HeatmapLegend maxCount={heatmap.maxCount} />
      </Box>
    );
  }

  return (
    <Box data-testid='release-heatmap' sx={{ mt: '24px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: '10px' }}>
        <Typography
          sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}
        >
          Releases
        </Typography>
        <Select
          size='small'
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value) as RangeDays)}
          inputProps={{ 'aria-label': 'Release heatmap range' }}
          sx={{ fontSize: '0.75rem', height: 28 }}
        >
          {RANGE_OPTIONS.map((n) => (
            <MenuItem key={n} value={n} sx={{ fontSize: '0.75rem' }}>
              Last {n} days
            </MenuItem>
          ))}
        </Select>
      </Box>
      <Paper variant='outlined' sx={{ borderRadius: '8px', overflow: 'hidden' }}>
        {body}
      </Paper>
    </Box>
  );
};
