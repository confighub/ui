// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';

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
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';

import { LIVE_TONE_COLOR } from '../x/apps/componentTheme';
import { LIVE_TONE_LEGEND, liveStatusText } from '../x/apps/liveStatus';
import {
  buildReleaseHeatmap,
  type HeatmapCell,
  type HeatmapRow,
  heatmapWindow,
} from './releaseHeatmap';

// ============================================================================
// CONSTANTS
// ============================================================================

/** A reporter writes a Release's live status whenever it observes a change, and nothing tells this page when. */
const POLL_MS = 30_000;

const LABEL_WIDTH = 160;
const CELL_GAP = 3;
const CELL_HEIGHT = 18;

/** How many rows either side of a selected Component stay in view. */
const CONTEXT_ROWS = 2;


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
                  {liveStatusText(release.liveStatus)}
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
      {LIVE_TONE_LEGEND.map(({ tone, label }) => (
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
  /** The local days shown, oldest first (`heatmapDays`). */
  days: string[];
  /** The start of the first of `days` (`heatmapSince`). */
  since: string;
  /** The Component whose row is selected: only it and its neighbours are shown. */
  selectedComponentId?: string;
  /** Fires when a row or one of its cells is clicked. */
  onComponentSelect: (row: HeatmapRow) => void;
}

/**
 * Releases by Component and day, each cell coloured by the worst live status
 * among its Releases and shaded by how many there were. See releaseHeatmap.ts.
 */
export const ComponentReleaseHeatmap = ({ spaces, days, since, selectedComponentId, onComponentSelect }: ComponentReleaseHeatmapProps) => {
  const theme = useTheme();
  const { componentById } = useComponentSlugs();

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
  const rows = useMemo(
    () => (selectedComponentId ? heatmapWindow(heatmap.rows, selectedComponentId, CONTEXT_ROWS) : heatmap.rows),
    [heatmap.rows, selectedComponentId],
  );

  if (heatmap.rows.length === 0) {
    return (
      <Paper variant='outlined' sx={{ borderRadius: '8px', p: 2 }}>
        <Typography variant='body2' color='text.secondary'>
          No Space belongs to a Component, so there are no Releases to show.
        </Typography>
      </Paper>
    );
  }

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
        {rows.slice(0, 12).map((row) => (
          <Skeleton key={row.componentId} variant='rounded' height={CELL_HEIGHT} sx={{ mb: `${CELL_GAP}px` }} />
        ))}
      </Box>
    );
  } else {
    body = (
      <Box sx={{ px: 2, pt: 1, pb: 1.5 }}>
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
        {rows.map((row) => {
          const selected = row.componentId === selectedComponentId;
          const select = () => onComponentSelect(row);
          return (
            <Box
              key={row.componentId}
              data-testid='release-heatmap-row'
              data-component={row.componentName}
              data-selected={selected || undefined}
              sx={{
                display: 'grid',
                gridTemplateColumns: gridColumns,
                gap: `${CELL_GAP}px`,
                mb: `${CELL_GAP}px`,
                alignItems: 'center',
                borderRadius: '4px',
                bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : undefined,
              }}
            >
              <Typography
                noWrap
                onClick={select}
                title={row.componentName}
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: selected ? 700 : 600,
                  color: selected ? 'primary.main' : undefined,
                  pl: 0.5,
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
                      onClick={select}
                      sx={{
                        height: CELL_HEIGHT,
                        borderRadius: '3px',
                        border: `1px solid ${theme.palette.divider}`,
                        cursor: 'pointer',
                      }}
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
        {heatmap.releaseCount === 0 && (
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', pt: 1, pl: `${LABEL_WIDTH}px` }}>
            No Releases in the last {days.length} days.
          </Typography>
        )}
        <HeatmapLegend maxCount={heatmap.maxCount} />
      </Box>
    );
  }

  return (
    <Paper data-testid='release-heatmap' variant='outlined' sx={{ borderRadius: '8px', overflow: 'hidden' }}>
      {body}
    </Paper>
  );
};
