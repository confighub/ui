// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import {
  HoverCardHeader,
  HoverCardMetadataLabel,
  HoverCardMetadataRow,
  HoverCardMetadataValue,
  HoverCard as HoverCardOverlay,
} from '@/components/hover-card/HoverCard';
import { HoverCard } from '@/components/styled';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import AdjustIcon from '@mui/icons-material/Adjust';
import CircleIcon from '@mui/icons-material/Circle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// ============================================================================
// TYPES
// ============================================================================

type TargetStatus = 'error' | 'warning' | 'success';

interface TargetSummary {
  targetId: string;
  slug: string;
  name: string;
  toolchainType: string;
  providerType: string;
  liveStateType?: string;
  bridgeHandle?: string;
  labels?: Record<string, string>;
  status: TargetStatus;
  unitCount: number;
}

// ============================================================================
// HELPERS
// ============================================================================

const deriveUnitStatus = (u: ExtendedUnitRead): TargetStatus => {
  if (u.LatestUnitEvent?.Status === 'Failed') return 'error';
  if ((u.Unit?.HeadRevisionNum ?? 0) !== (u.Unit?.LastReleasedRevisionNum ?? 0)) return 'warning';
  return 'success';
};

const buildTargetSummaries = (units: ExtendedUnitRead[]): TargetSummary[] => {
  const seen = new Map<string, TargetSummary & { statuses: TargetStatus[] }>();

  for (const u of units) {
    const target = u.Target;
    const targetId = target?.TargetID;
    const unitId = u.Unit?.UnitID;
    if (!target || !targetId || !unitId) continue;

    if (!seen.has(targetId)) {
      seen.set(targetId, {
        targetId,
        slug: target.Slug,
        name: target.DisplayName ?? target.Slug,
        toolchainType: target.ToolchainType,
        providerType: target.ProviderType,
        liveStateType: target.LiveStateType,
        bridgeHandle: target.BridgeHandle,
        labels:
          target.Labels && Object.keys(target.Labels).length > 0 ? target.Labels : undefined,
        status: 'success',
        unitCount: 0,
        statuses: [],
      });
    }

    const entry = seen.get(targetId)!;
    entry.unitCount++;
    entry.statuses.push(deriveUnitStatus(u));
  }

  const result: TargetSummary[] = [];
  for (const { statuses, ...summary } of seen.values()) {
    if (statuses.some((s) => s === 'error')) summary.status = 'error';
    else if (statuses.some((s) => s === 'warning')) summary.status = 'warning';
    result.push(summary);
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
};

const STATUS_COLOR: Record<TargetStatus, string> = {
  error: 'error.main',
  warning: 'warning.main',
  success: 'success.main',
};

// ============================================================================
// TARGET HOVER CARD CONTENT
// ============================================================================

const TargetHoverContent = ({ summary }: { summary: TargetSummary }) => (
  <>
    <HoverCardHeader>
      <Stack direction='row' alignItems='center' spacing={1} sx={{ minWidth: 0 }}>
        <CircleIcon sx={{ fontSize: 8, color: STATUS_COLOR[summary.status], flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant='body2' fontWeight={600} noWrap>
            {summary.name}
          </Typography>
          {summary.name !== summary.slug && (
            <Typography variant='caption' color='text.disabled' noWrap display='block'>
              {summary.slug}
            </Typography>
          )}
        </Box>
      </Stack>
      <Typography variant='caption' color='text.disabled' sx={{ flexShrink: 0 }}>
        {summary.unitCount} {summary.unitCount === 1 ? 'unit' : 'units'}
      </Typography>
    </HoverCardHeader>

    <HoverCardMetadataRow>
      <HoverCardMetadataLabel>Toolchain</HoverCardMetadataLabel>
      <HoverCardMetadataValue>{summary.toolchainType}</HoverCardMetadataValue>
    </HoverCardMetadataRow>

    <HoverCardMetadataRow>
      <HoverCardMetadataLabel>Provider</HoverCardMetadataLabel>
      <HoverCardMetadataValue>{summary.providerType}</HoverCardMetadataValue>
    </HoverCardMetadataRow>

    {summary.liveStateType && (
      <HoverCardMetadataRow>
        <HoverCardMetadataLabel>Live State</HoverCardMetadataLabel>
        <HoverCardMetadataValue>{summary.liveStateType}</HoverCardMetadataValue>
      </HoverCardMetadataRow>
    )}

    {summary.bridgeHandle && (
      <HoverCardMetadataRow>
        <HoverCardMetadataLabel>Bridge</HoverCardMetadataLabel>
        <HoverCardMetadataValue>{summary.bridgeHandle}</HoverCardMetadataValue>
      </HoverCardMetadataRow>
    )}

    {summary.labels && (
      <>
        <Divider sx={{ my: 0.75 }} />
        {Object.entries(summary.labels).map(([k, v]) => (
          <HoverCardMetadataRow key={k}>
            <HoverCardMetadataLabel>{k}</HoverCardMetadataLabel>
            <HoverCardMetadataValue>{v}</HoverCardMetadataValue>
          </HoverCardMetadataRow>
        ))}
      </>
    )}
  </>
);

// ============================================================================
// TARGET ROW
// ============================================================================

const TargetRow = ({ summary }: { summary: TargetSummary }) => (
  <HoverCardOverlay
    content={<TargetHoverContent summary={summary} />}
    placement='right-start'
    offset={[0, 8]}
  >
    <Stack
      direction='row'
      alignItems='center'
      justifyContent='space-between'
      sx={{
        px: 2,
        py: 1.25,
        width: '100%',
        '&:hover': { backgroundColor: 'action.hover' },
        transition: 'background-color 0.2s ease-in-out',
      }}
    >
      {/* Left: status dot + name + unit count */}
      <Stack direction='row' alignItems='center' spacing={1} sx={{ minWidth: 0 }}>
        <CircleIcon sx={{ fontSize: 8, color: STATUS_COLOR[summary.status], flexShrink: 0 }} />
        <Stack direction='column' sx={{ minWidth: 0 }}>
          <Typography variant='body2' fontWeight={600} noWrap>
            {summary.name}
          </Typography>
          <Typography variant='caption' color='text.secondary' noWrap>
            {summary.unitCount} {summary.unitCount === 1 ? 'unit' : 'units'}
          </Typography>
        </Stack>
      </Stack>

      {/* Right: toolchain chip */}
      <Chip
        size='small'
        label={summary.toolchainType}
        variant='outlined'
        sx={{ fontSize: '0.65rem', height: 20, flexShrink: 0, ml: 1 }}
      />
    </Stack>
  </HoverCardOverlay>
);

// ============================================================================
// COMPONENT
// ============================================================================

export const DashboardTargetsCard = ({ units }: { units: ExtendedUnitRead[] }) => {
  const [expanded, setExpanded] = useState(true);
  const summaries = buildTargetSummaries(units);

  return (
    <HoverCard
      variant='outlined'
      sx={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        minWidth: 0,
        ...(expanded
          ? { height: '432px', overflow: 'auto' }
          : { alignSelf: 'flex-start', width: '100%' }),
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
          <AdjustIcon sx={{ fontSize: 18 }} color='primary' />
          <Typography variant='h6'>Targets</Typography>
        </Stack>
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
      <Collapse in={expanded}>
        <Divider />
        {summaries.length > 0 ? (
          summaries.map((s, idx) => (
            <Box key={s.targetId}>
              <TargetRow summary={s} />
              {idx < summaries.length - 1 && <Divider />}
            </Box>
          ))
        ) : (
          <Typography variant='body2' color='text.secondary' sx={{ p: 2 }}>
            No targets assigned
          </Typography>
        )}
      </Collapse>
    </HoverCard>
  );
};
