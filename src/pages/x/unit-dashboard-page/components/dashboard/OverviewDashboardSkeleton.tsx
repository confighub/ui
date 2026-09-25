// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { HoverCard } from '@/components/styled';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { styled } from '@mui/material/styles';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Expanded height every dashboard widget card renders at (see LatestEventsCard). */
const CARD_HEIGHT = 432;

/** Mirrors SyncActivityHeatmap: default '30d' range, label column and cell gap. */
const HEATMAP_LABEL_WIDTH = 120;
const HEATMAP_CELL_GAP = 3;

/** Width below which the dashboard collapses its two-column rows to one. */
const TWO_COLUMN_MIN_WIDTH = 900;

const range = (count: number): number[] => Array.from({ length: count }, (_, i) => i);

const HEATMAP_COLUMN_IDS = range(30);
const HEATMAP_ROW_IDS = range(8);
const EVENT_ROW_IDS = range(5);
const GATE_ROW_IDS = range(5);
const TARGET_ROW_IDS = range(4);
const STATUS_CARD_IDS = range(6);

// ============================================================================
// SHARED LAYOUT HELPERS
// ============================================================================

/**
 * How many StatusCards fit at a given container width.
 *
 * Shared with OverviewDashboard so the skeleton renders exactly as many
 * placeholder tiles as the loaded dashboard will — keeping the card count from
 * jumping the moment data arrives. Keep the two in sync by using this helper.
 */
export const getVisibleStatusCardCount = (containerWidth: number): number =>
  containerWidth < 400
    ? 2
    : containerWidth < 520
      ? 3
      : containerWidth < 640
        ? 4
        : containerWidth < 760
          ? 5
          : 6;

// ============================================================================
// STYLED
// ============================================================================

/** Matches the CardGrid in OverviewDashboard so the tiles line up exactly. */
const CardGrid = styled(Box)<{ $columns: number }>(({ theme, $columns }) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${$columns}, minmax(0, 1fr))`,
  gap: theme.spacing(1),
}));

/** Mirrors the StatusCard shell: 8px padding, 12px radius, 8px internal gap. */
const StatusCardShell = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1),
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  backgroundColor: theme.palette.background.paper,
}));

// ============================================================================
// PRIMITIVES
// ============================================================================

/**
 * StatusCard placeholder — caption label, value, caption subtitle. The three
 * bar heights sum to the real card's content height so the grid row does not
 * resize when the numbers land.
 */
const StatusCardSkeleton = () => (
  <StatusCardShell>
    <Skeleton variant='text' width='60%' height={12} />
    <Skeleton variant='text' width='38%' height={16} />
    <Skeleton variant='text' width='85%' height={11} />
  </StatusCardShell>
);

interface IWidgetCardSkeletonProps {
  /** Optional right-hand header controls; defaults to a single icon button. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shell shared by every dashboard widget: icon + title header, divider, body.
 * Fixed at the expanded card height so the surrounding grid never reflows.
 */
const WidgetCardSkeleton = ({ action, children }: IWidgetCardSkeletonProps) => (
  <HoverCard
    variant='outlined'
    sx={{
      display: 'flex',
      flexDirection: 'column',
      padding: 0,
      overflow: 'hidden',
      height: CARD_HEIGHT,
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
        <Skeleton variant='rounded' width={18} height={18} />
        <Skeleton variant='text' width={104} height={18} />
      </Stack>
      {action ?? <Skeleton variant='circular' width={18} height={18} />}
    </Stack>
    <Divider />
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</Box>
  </HoverCard>
);

/** Latest-events row: slug + action/status chips, message line, timestamp. */
const EventRowSkeleton = ({ index }: { index: number }) => (
  <>
    <Box sx={{ px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          minWidth: 0,
        }}
      >
        <Skeleton variant='text' width={`${40 + (index % 3) * 12}%`} height={16} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <Skeleton
            variant='rounded'
            width={54}
            height={18}
            sx={{ borderRadius: 'var(--r-pill)' }}
          />
          <Skeleton
            variant='rounded'
            width={68}
            height={18}
            sx={{ borderRadius: 'var(--r-pill)' }}
          />
        </Box>
      </Box>
      <Skeleton variant='text' width={`${55 + (index % 2) * 18}%`} height={13} />
      <Skeleton variant='text' width={62} height={11} />
    </Box>
    <Divider />
  </>
);

/** Gate / target row: leading icon, two-line label, trailing status. */
const ListRowSkeleton = ({ index }: { index: number }) => (
  <>
    <Box
      sx={{
        px: 2,
        py: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
        <Skeleton variant='circular' width={16} height={16} sx={{ flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton variant='text' width={`${38 + (index % 3) * 10}%`} height={18} />
          <Skeleton variant='text' width='22%' height={12} />
        </Box>
      </Box>
      <Skeleton variant='text' width={72} height={12} sx={{ flexShrink: 0 }} />
    </Box>
    <Divider />
  </>
);

/** Sync-activity grid: label column plus a row of day cells per unit. */
const HeatmapBodySkeleton = () => (
  <Box sx={{ px: 2, pt: 1, overflow: 'hidden' }}>
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `${HEATMAP_LABEL_WIDTH}px repeat(${HEATMAP_COLUMN_IDS.length}, 1fr)`,
        gap: `${HEATMAP_CELL_GAP}px`,
        mb: `${HEATMAP_CELL_GAP}px`,
        alignItems: 'end',
      }}
    >
      <Box />
      {HEATMAP_COLUMN_IDS.map((col) => (
        <Skeleton key={col} variant='text' height={10} />
      ))}
    </Box>
    {HEATMAP_ROW_IDS.map((row) => (
      <Box
        key={row}
        sx={{
          display: 'grid',
          gridTemplateColumns: `${HEATMAP_LABEL_WIDTH}px repeat(${HEATMAP_COLUMN_IDS.length}, 1fr)`,
          gap: `${HEATMAP_CELL_GAP}px`,
          mb: `${HEATMAP_CELL_GAP}px`,
          alignItems: 'center',
        }}
      >
        <Skeleton variant='text' width={`${55 + (row % 4) * 10}%`} height={14} />
        {HEATMAP_COLUMN_IDS.map((col) => (
          <Skeleton
            key={col}
            variant='rounded'
            sx={{ aspectRatio: '1', height: 'auto', borderRadius: 'var(--r-sm)' }}
          />
        ))}
      </Box>
    ))}
  </Box>
);

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Content-shaped loading state for the whole OverviewDashboard body: the status
 * card grid, the heatmap / latest-events row, the validation-errors card and
 * the targets card. Widths and card heights mirror the loaded layout so nothing
 * shifts when the units query resolves.
 */
export const OverviewDashboardSkeleton = () => {
  const { containerRef, width: containerWidth } = useContainerWidth();
  const visibleCount = getVisibleStatusCardCount(containerWidth);
  const twoColumns = containerWidth < TWO_COLUMN_MIN_WIDTH ? '1fr' : '2fr 1fr';

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <CardGrid ref={containerRef} $columns={visibleCount}>
        {STATUS_CARD_IDS.slice(0, visibleCount).map((card) => (
          <StatusCardSkeleton key={card} />
        ))}
      </CardGrid>

      {/* Heatmap + Latest Events */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: twoColumns,
          gap: 2,
          minWidth: 0,
          alignItems: 'stretch',
        }}
      >
        <WidgetCardSkeleton
          action={
            <Stack direction='row' alignItems='center' spacing={1}>
              <Skeleton variant='rounded' width={96} height={28} />
              <Skeleton variant='circular' width={18} height={18} />
            </Stack>
          }
        >
          <HeatmapBodySkeleton />
        </WidgetCardSkeleton>
        <Box sx={{ minWidth: 0, overflow: 'hidden', height: '100%' }}>
          <WidgetCardSkeleton>
            {EVENT_ROW_IDS.map((row) => (
              <EventRowSkeleton key={row} index={row} />
            ))}
          </WidgetCardSkeleton>
        </Box>
      </Box>

      {/* Validation Errors */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: twoColumns,
          gap: 2,
          minWidth: 0,
          alignItems: 'start',
        }}
      >
        <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
          <WidgetCardSkeleton>
            {GATE_ROW_IDS.map((row) => (
              <ListRowSkeleton key={row} index={row} />
            ))}
          </WidgetCardSkeleton>
        </Box>
      </Box>

      {/* Targets */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: twoColumns,
          gap: 2,
          minWidth: 0,
          alignItems: 'start',
        }}
      >
        <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
          <WidgetCardSkeleton>
            {TARGET_ROW_IDS.map((row) => (
              <ListRowSkeleton key={row} index={row} />
            ))}
          </WidgetCardSkeleton>
        </Box>
      </Box>
    </Box>
  );
};
