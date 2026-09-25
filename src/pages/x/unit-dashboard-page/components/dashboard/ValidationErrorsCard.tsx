// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import {
  HoverCard as GateHoverCard,
  HoverCardHeader,
  HoverCardMetadataLabel,
  HoverCardMetadataRow,
  HoverCardMetadataValueWithTooltip,
  HoverCardSection,
  HoverCardTitle,
} from '@/components/hover-card/HoverCard';
import { HoverCard } from '@/components/styled';
import { findTriggerForGate, useGateTriggers } from '@/hooks/useGateTriggers';
import {
  type ExtendedUnitRead,
  useListTriggersQuery,
} from '@confighub/rtk-query';
import { parseGateName } from '@/utility/name-format-functions';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CircleIcon from '@mui/icons-material/Circle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PolicyIcon from '@mui/icons-material/Policy';
import WarningIcon from '@mui/icons-material/Warning';
import Box from '@mui/material/Box';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

// ============================================================================
// HELPERS & STYLED
// ============================================================================

const SectionLabel = styled(Typography)({
  fontSize: '0.625rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

// ============================================================================
// TYPES
// ============================================================================

export interface UnitGateSummary {
  unit: ExtendedUnitRead;
  gates: { name: string; blocking: boolean; isWarning?: boolean }[];
  blockingCount: number;
  warningCount: number;
  totalCount: number;
}

const buildUnitGateSummaries = (units: ExtendedUnitRead[]): UnitGateSummary[] => {
  return units
    .filter((u): u is ExtendedUnitRead => u !== undefined)
    .filter(
      (u) =>
        (u?.Unit?.ValidationErrors && Object.keys(u.Unit?.ValidationErrors).length > 0) ||
        (u?.Unit?.ValidationWarnings && Object.keys(u.Unit?.ValidationWarnings).length > 0),
    )
    .map((u) => {
      const gates = Object.entries(u.Unit?.ValidationErrors ?? {}).map(([name, failed]) => ({
        name,
        blocking: failed,
      }));
      const warnings = Object.entries(u.Unit?.ValidationWarnings ?? {}).map(
        ([name, failed]) => ({
          name,
          blocking: false,
          isWarning: failed,
        }),
      );
      const allGates = [...gates, ...warnings];
      return {
        unit: u,
        gates: allGates,
        blockingCount: gates.filter((g) => g.blocking).length,
        warningCount: warnings.filter((w) => w.isWarning).length,
        totalCount: allGates.length,
      };
    });
};

const GateHoverContent = ({
  unit,
  gateName,
  blocking,
}: {
  unit: ExtendedUnitRead;
  gateName: string;
  blocking: boolean;
}) => {
  const spaceId = unit?.Unit?.SpaceID || '';
  const { data: triggers = [] } = useListTriggersQuery({ spaceId }, { skip: !spaceId });
  const gateTriggers = useGateTriggers(unit?.Unit);

  const { triggerSlug, functionName } = parseGateName(gateName);
  const trigger = findTriggerForGate(gateName, unit?.Unit, gateTriggers, triggers);

  const displayName = trigger?.Trigger?.DisplayName || triggerSlug;
  const warn = trigger?.Trigger?.Warn;
  const event = trigger?.Trigger?.Event;
  const validating = trigger?.Trigger?.Validating;
  const toolchainType = trigger?.Trigger?.ToolchainType;
  const args = trigger?.Trigger?.Arguments;

  return (
    <>
      <HoverCardHeader>
        <Box sx={{ overflow: 'hidden' }}>
          <HoverCardTitle variant='subtitle2'>{unit.Unit?.Slug}</HoverCardTitle>
        </Box>
        <Stack direction='row' alignItems='center' spacing={0.75}>
          <CircleIcon sx={{ fontSize: 8, color: blocking ? 'error.main' : 'success.main' }} />
          <Typography variant='caption' sx={{ fontSize: '0.625rem', fontWeight: 600 }}>
            {blocking ? 'Blocking' : 'Passed'}
          </Typography>
        </Stack>
      </HoverCardHeader>

      {/* Gate display name + attribute chips */}
      <Box sx={{ mb: 0.75 }}>
        <Typography
          sx={{ fontSize: '0.8rem', fontWeight: 500, color: 'text.secondary', mb: 0.5 }}
        >
          {displayName}
        </Typography>
        <Stack direction='row' flexWrap='wrap' sx={{ gap: 0.5 }}>
          {warn !== undefined && (
            <Chip
              label={warn ? 'Warn' : 'Blocking'}
              color='primary'
              size='small'
              sx={{ height: 16, fontSize: '0.55rem' }}
            />
          )}
          {event && (
            <Chip
              label={event}
              color='warning'
              size='small'
              sx={{ height: 16, fontSize: '0.55rem' }}
            />
          )}
          {validating !== undefined && (
            <Chip
              label={validating ? 'Validating' : 'Non Validating'}
              color='info'
              size='small'
              sx={{ height: 16, fontSize: '0.55rem' }}
            />
          )}
        </Stack>
      </Box>

      {/* Function Details section */}
      {(functionName || toolchainType) && (
        <HoverCardSection>
          <SectionLabel color='text.secondary' sx={{ mb: 0.5, display: 'block' }}>
            Function Details
          </SectionLabel>
          {functionName && (
            <HoverCardMetadataRow>
              <HoverCardMetadataLabel>Function</HoverCardMetadataLabel>
              <HoverCardMetadataValueWithTooltip>
                {functionName}
              </HoverCardMetadataValueWithTooltip>
            </HoverCardMetadataRow>
          )}
          {toolchainType && (
            <HoverCardMetadataRow>
              <HoverCardMetadataLabel>Toolchain</HoverCardMetadataLabel>
              <HoverCardMetadataValueWithTooltip>
                {toolchainType}
              </HoverCardMetadataValueWithTooltip>
            </HoverCardMetadataRow>
          )}
        </HoverCardSection>
      )}

      {/* Parameters section */}
      {args && args.length > 0 && (
        <HoverCardSection>
          <SectionLabel color='text.secondary' sx={{ mb: 0.5, display: 'block' }}>
            Parameters ({args.length})
          </SectionLabel>
          {args.map((arg) => (
            <HoverCardMetadataRow key={arg.ParameterName}>
              <HoverCardMetadataLabel>{arg.ParameterName}</HoverCardMetadataLabel>
              <HoverCardMetadataValueWithTooltip>
                {String(arg?.Value || '')}
              </HoverCardMetadataValueWithTooltip>
            </HoverCardMetadataRow>
          ))}
        </HoverCardSection>
      )}
    </>
  );
};

const GateItemRow = ({
  gate,
  unit,
}: {
  gate: { name: string; blocking: boolean; isWarning?: boolean };
  unit: ExtendedUnitRead;
}) => (
  <GateHoverCard
    content={<GateHoverContent unit={unit} gateName={gate.name} blocking={gate.blocking} />}
    placement='left-start'
  >
    <Stack
      direction='row'
      alignItems='center'
      justifyContent='space-between'
      sx={{
        py: 1,
        px: 2,
        pl: 5,
        width: '100%',
        cursor: 'default',
        '&:hover': {
          backgroundColor: 'action.selected',
        },
        transition: 'background-color 0.2s ease-in-out',
      }}
    >
      <Stack direction='row' alignItems='center' spacing={0.75}>
        {gate.blocking ? (
          <ErrorIcon sx={{ fontSize: 14, color: 'error.main', flexShrink: 0 }} />
        ) : gate.isWarning ? (
          <WarningIcon sx={{ fontSize: 14, color: 'warning.main', flexShrink: 0 }} />
        ) : (
          <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main', flexShrink: 0 }} />
        )}
        <Typography variant='body2' noWrap>
          {gate.name}
        </Typography>
      </Stack>
    </Stack>
  </GateHoverCard>
);

const UnitGateRow = ({ summary }: { summary: UnitGateSummary }) => {
  const [expanded, setExpanded] = useState(false);
  const hasBlocking = summary.blockingCount > 0;

  return (
    <Box>
      <Stack
        direction='row'
        alignItems='center'
        justifyContent='space-between'
        sx={{
          px: 2,
          py: 1.5,
          minWidth: 0,
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          transition: 'background-color 0.2s ease-in-out',
        }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Stack direction='row' alignItems='center' spacing={1} sx={{ minWidth: 0 }}>
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
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <Stack direction='column' sx={{ minWidth: 0 }}>
            <Typography variant='body1' sx={{ fontWeight: 600 }}>
              {summary.unit.Unit?.Slug}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {summary.totalCount} {summary.totalCount === 1 ? 'gate' : 'gates'}
            </Typography>
          </Stack>
        </Stack>
        <Stack direction='row' alignItems='center' spacing={0.75}>
          <CircleIcon
            sx={{
              fontSize: 8,
              color: hasBlocking
                ? 'error.main'
                : summary.warningCount > 0
                  ? 'warning.main'
                  : 'success.main',
            }}
          />
          <Typography variant='caption' color='text.secondary'>
            {hasBlocking
              ? `${summary.blockingCount} blocking`
              : summary.warningCount > 0
                ? `${summary.warningCount} warning${summary.warningCount > 1 ? 's' : ''}`
                : 'All passed'}
          </Typography>
        </Stack>
      </Stack>
      <Collapse in={expanded}>
        <Box sx={{ backgroundColor: 'action.hover' }}>
          {summary.gates.map((gate) => (
            <GateItemRow key={gate.name} gate={gate} unit={summary.unit} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

export const ValidationErrorsCard = ({ units }: { units: ExtendedUnitRead[] }) => {
  const [expanded, setExpanded] = useState(true);
  const summaries = buildUnitGateSummaries(units);

  // const totalBlocking = summaries.reduce((acc, s) => acc + s.blockingCount, 0);

  return (
    <HoverCard
      variant='outlined'
      sx={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        ...(expanded && { height: '432px' }),
        overflow: 'auto',
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
          <PolicyIcon sx={{ fontSize: 18 }} color='primary' />
          <Typography variant='h6'>Validation Errors</Typography>
        </Stack>
        <Stack direction='row' alignItems='center' spacing={1}>
          {/* {summaries.length > 0 && (
            <Chip
              size='small'
              variant='outlined'
              label={totalBlocking > 0 ? `${totalBlocking} blocking` : 'All passed'}
              color={totalBlocking > 0 ? 'error' : 'success'}
            />
          )} */}
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
        <CardContent sx={{ p: 0 }}>
          {summaries.length > 0 ? (
            summaries.map((summary) => (
              <Box key={summary.unit.Unit?.UnitID}>
                <UnitGateRow summary={summary} />
                <Divider />
              </Box>
            ))
          ) : (
            <Box sx={{ p: 2 }}>
              <Typography variant='body2' color='text.secondary'>
                No validation errors or warnings configured
              </Typography>
            </Box>
          )}
        </CardContent>
      </Collapse>
    </HoverCard>
  );
};
