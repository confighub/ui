// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

import { type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { StatusCard, type StatusCardSeverity } from '@/components/status-card/StatusCard';
import { EmptyIconBubble } from '@/components/styled';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import DataObjectIcon from '@mui/icons-material/DataObject';
import LayersIcon from '@mui/icons-material/Layers';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { UnitFlowGraph } from '../unit-flow-graph/UnitFlowGraph';
import { ValidationErrorsCard } from './ValidationErrorsCard';
import { DashboardTargetsCard } from './DashboardTargetsCard';
import { LatestEventsCard } from './LatestEventsCard';
import {
  OverviewDashboardSkeleton,
  getVisibleStatusCardCount,
} from './OverviewDashboardSkeleton';
import { OverviewHeader } from './OverviewHeader';
import { SyncActivityHeatmap } from './SyncActivityHeatmap';

// ============================================================================
// TYPES
// ============================================================================

export interface IOverviewDashboardProps {
  units: ExtendedUnitRead[];
  isLoading?: boolean;
  groupBy: GroupByOption;
  selectedUnitIds: Array<string>;
  isMultiSelect: boolean;
  selectedUnitId: string | undefined;
  activeCardLabel: string | null;
  onActiveCardChange: (label: string | null) => void;
  onSelectUnits?: (ids: string[]) => void;
  onFilterByIds?: (ids: string[]) => void;
  children?: React.ReactNode;
}

interface StatusCardConfig {
  label: string;
  value: number;
  subtitle: string;
  severity: StatusCardSeverity;
  unitIds: string[];
}

interface IStatusCardListProps {
  cards: StatusCardConfig[];
  activeCardLabel: string | null;
  onCardClick: (label: string, unitIds: string[]) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

const IN_PROGRESS_STATUSES = new Set(['Pending', 'Submitted', 'Progressing']);

interface DashboardStats {
  total: number;
  unapplied: number;
  unappliedIds: string[];
  upgradesAvailable: number;
  upgradeIds: string[];
  noTarget: number;
  noTargetIds: string[];
  inProgress: number;
  inProgressIds: string[];
  synced: number;
  syncedIds: string[];
  blockingGates: number;
  blockingGateIds: string[];
}

const computeStats = (units: ExtendedUnitRead[]): DashboardStats => {
  let unapplied = 0;
  const unappliedIds: string[] = [];
  let upgradesAvailable = 0;
  const upgradeIds: string[] = [];
  let noTarget = 0;
  const noTargetIds: string[] = [];
  let inProgress = 0;
  const inProgressIds: string[] = [];
  let synced = 0;
  const syncedIds: string[] = [];
  let blockingGates = 0;
  const blockingGateIds: string[] = [];

  for (const u of units) {
    const id = u.Unit?.UnitID;
    if (!id) continue;
    const head = u.Unit?.HeadRevisionNum ?? 0;
    const live = u.Unit?.LastReleasedRevisionNum ?? 0;
    const hasTarget = !!u.Unit?.TargetID;
    const eventStatus = u.LatestUnitEvent?.Status ?? '';

    if (head !== live) {
      unapplied++;
      unappliedIds.push(id);
    } else if (hasTarget) {
      synced++;
      syncedIds.push(id);
    }

    if (u.Unit?.UpstreamUnitID) {
      const upstreamHead = u.UpstreamUnit?.HeadRevisionNum ?? 0;
      const currentUpstream = u.Unit?.UpstreamRevisionNum ?? 0;
      if (upstreamHead > currentUpstream) {
        upgradesAvailable++;
        upgradeIds.push(id);
      }
    }

    if (!hasTarget) {
      noTarget++;
      noTargetIds.push(id);
    }

    if (IN_PROGRESS_STATUSES.has(eventStatus)) {
      inProgress++;
      inProgressIds.push(id);
    }

    const validationErrors = u.Unit?.ValidationErrors ?? {};
    if (Object.values(validationErrors).some((failed) => failed === true)) {
      blockingGates++;
      blockingGateIds.push(id);
    }
  }

  return {
    total: units.length,
    unapplied,
    unappliedIds,
    upgradesAvailable,
    upgradeIds,
    noTarget,
    noTargetIds,
    inProgress,
    inProgressIds,
    synced,
    syncedIds,
    blockingGates,
    blockingGateIds,
  };
};

// ============================================================================
// STYLED
// ============================================================================

const CardGrid = styled(Box)<{ $columns: number }>(({ theme, $columns }) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${$columns}, minmax(0, 1fr))`,
  gap: theme.spacing(1),
}));

// ============================================================================
// EMPTY STATE
// ============================================================================

const EmptyUnits = () => (
  <Container maxWidth='sm'>
    <Box
      display='flex'
      flexDirection='column'
      justifyContent='center'
      alignItems='center'
      minHeight='50vh'
      textAlign='center'
    >
      <EmptyIconBubble>
        <DataObjectIcon sx={{ fontSize: 28 }} />
      </EmptyIconBubble>
      <Typography variant='h5' gutterBottom>
        No Units Found
      </Typography>
      <Typography variant='subtitle1' color='text.secondary' gutterBottom>
        A Unit is a deployable configuration artifact in ConfigHub — it holds the rendered
        config for a specific environment, toolchain, and target, and tracks every revision
        applied over time.
      </Typography>
      <Typography variant='body2' color='text.secondary' sx={{ mt: 1, mb: 3 }}>
        <Link
          href='https://docs.confighub.com/background/entities/unit/'
          target='_blank'
          rel='noopener noreferrer'
          underline='hover'
        >
          Read more about Units →
        </Link>
      </Typography>
      <Button
        variant='contained'
        color='primary'
        size='large'
        startIcon={<LayersIcon />}
        href='https://docs.confighub.com/get-started/setup/'
        target='_blank'
        rel='noopener noreferrer'
      >
        Get started with ConfigHub
      </Button>
    </Box>
  </Container>
);

// ============================================================================
// STATUS CARD LIST
// ============================================================================

const StatusCardList = ({ cards, activeCardLabel, onCardClick }: IStatusCardListProps) => (
  <>
    {cards.map((card) => (
      <StatusCard
        key={card.label}
        label={card.label}
        value={card.value}
        subtitle={card.subtitle}
        severity={card.severity}
        isActive={activeCardLabel === card.label}
        onClick={() => onCardClick(card.label, card.unitIds)}
      />
    ))}
  </>
);

// ============================================================================
// COMPONENT
// ============================================================================

export const OverviewDashboard = ({
  units,
  isLoading = false,
  groupBy,
  selectedUnitIds,
  isMultiSelect,
  selectedUnitId,
  activeCardLabel,
  onActiveCardChange,
  onSelectUnits,
  onFilterByIds,
  children,
}: IOverviewDashboardProps) => {
  const [isUnitFlow, setIsUnitFlow] = useState(false);

  const stats = useMemo(() => computeStats(units), [units]);

  const { containerRef, width: containerWidth } = useContainerWidth();
  // Shared with OverviewDashboardSkeleton so the loading tiles and the loaded
  // cards always use the same breakpoints.
  const visibleCount = getVisibleStatusCardCount(containerWidth);

  const handleFlowViewToggle = useCallback(() => setIsUnitFlow((prev) => !prev), []);

  const handleCardClick = useCallback(
    (label: string, unitIds: string[]) => {
      if (activeCardLabel === label) {
        onActiveCardChange(null);
        onSelectUnits?.([]);
        onFilterByIds?.([]);
      } else {
        onActiveCardChange(label);
        onFilterByIds?.(unitIds);
        onSelectUnits?.(unitIds);
      }
    },
    [activeCardLabel, onActiveCardChange, onSelectUnits, onFilterByIds],
  );

  const cards: StatusCardConfig[] = useMemo(() => {
    const syncedPct = stats.total > 0 ? Math.round((stats.synced / stats.total) * 100) : 0;
    const unappliedPct =
      stats.total > 0 ? Math.round((stats.unapplied / stats.total) * 100) : 0;

    return [
      {
        label: 'Unreleased Changes',
        value: stats.unapplied,
        unitIds: stats.unappliedIds,
        subtitle:
          stats.unapplied > 0
            ? `${unappliedPct}% of units pending deployment`
            : 'All units are up to date',
        severity: stats.unapplied > 0 ? 'warning' : 'success',
      },
      {
        label: 'In Progress',
        value: stats.inProgress,
        unitIds: stats.inProgressIds,
        subtitle: stats.inProgress > 0 ? 'Actions currently running' : 'No active operations',
        severity: stats.inProgress > 0 ? 'info' : 'default',
      },
      {
        label: 'Blocking Gates',
        value: stats.blockingGates,
        unitIds: stats.blockingGateIds,
        subtitle:
          stats.blockingGates > 0
            ? `${stats.blockingGates} unit${stats.blockingGates !== 1 ? 's' : ''} blocked from applying`
            : 'No gates blocking',
        severity: stats.blockingGates > 0 ? 'error' : 'default',
      },
      {
        label: 'No Target Assigned',
        value: stats.noTarget,
        unitIds: stats.noTargetIds,
        subtitle:
          stats.noTarget > 0
            ? 'Cannot be deployed without a target'
            : 'All units have a target',
        severity: stats.noTarget > 0 ? 'error' : 'default',
      },
      {
        label: 'Upgrades Available',
        value: stats.upgradesAvailable,
        unitIds: stats.upgradeIds,
        subtitle:
          stats.upgradesAvailable > 0
            ? 'Behind upstream source'
            : 'All units at latest upstream',
        severity: stats.upgradesAvailable > 0 ? 'info' : 'default',
      },
      {
        label: 'Synced',
        value: stats.synced,
        unitIds: stats.syncedIds,
        subtitle: `${syncedPct}% of units healthy`,
        severity: stats.synced === stats.total && stats.total > 0 ? 'success' : 'default',
      },
    ];
  }, [stats]);

  // First load only — `isLoading` stays false on the 5s background polls, so
  // the skeleton never replaces already-rendered data.
  if (isLoading && units.length === 0) {
    return (
      <>
        <OverviewHeader
          isFlowViewEnabled={isUnitFlow}
          onFlowViewToggle={handleFlowViewToggle}
        />
        {children}
        <OverviewDashboardSkeleton />
      </>
    );
  }

  // Keep the same chrome as the loading and loaded branches so there is no
  // vertical jump when an empty org finishes loading.
  if (units.length === 0) {
    return (
      <>
        <OverviewHeader
          isFlowViewEnabled={isUnitFlow}
          onFlowViewToggle={handleFlowViewToggle}
        />
        <EmptyUnits />
      </>
    );
  }

  return (
    <>
      <OverviewHeader isFlowViewEnabled={isUnitFlow} onFlowViewToggle={handleFlowViewToggle} />
      {children}
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {isUnitFlow ? (
          <UnitFlowGraph
            units={units}
            isMultiSelect={isMultiSelect}
            selectedUnitId={selectedUnitId}
            selectedUnitIds={selectedUnitIds}
            groupBy={groupBy}
          />
        ) : (
          <>
            <CardGrid ref={containerRef} $columns={visibleCount}>
              <StatusCardList
                cards={cards.slice(0, visibleCount)}
                activeCardLabel={activeCardLabel}
                onCardClick={handleCardClick}
              />
            </CardGrid>

            {/* Heatmap + Latest Events */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: containerWidth < 900 ? '1fr' : '2fr 1fr',
                gap: 2,
                minWidth: 0,
                alignItems: 'stretch',
              }}
            >
              <SyncActivityHeatmap units={units} />
              <Box sx={{ minWidth: 0, overflow: 'hidden', height: '100%' }}>
                <LatestEventsCard units={units} selectedUnitIds={selectedUnitIds} />
              </Box>
            </Box>

            {/* Validation Errors */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: containerWidth < 900 ? '1fr' : '2fr 1fr',
                gap: 2,
                minWidth: 0,
                alignItems: 'start',
              }}
            >
              <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                <ValidationErrorsCard units={units} />
              </Box>
            </Box>

            {/* Targets */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: containerWidth < 900 ? '1fr' : '2fr 1fr',
                gap: 2,
                minWidth: 0,
                alignItems: 'start',
              }}
            >
              <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                <DashboardTargetsCard units={units} />
              </Box>
            </Box>
          </>
        )}
      </Box>
    </>
  );
};
