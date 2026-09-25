// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { findTriggerForGate, useGateTriggers } from '@/hooks/useGateTriggers';
import type { ExtendedUnitRead, FunctionArgument } from '@confighub/rtk-query';
import { useListTriggersQuery } from '@confighub/rtk-query';
import { parseGateName } from '@/utility/name-format-functions';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import WarningIcon from '@mui/icons-material/Warning';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled, useTheme } from '@mui/material/styles';

import {
  HoverCard,
  HoverCardHeader,
  HoverCardMetadataLabel,
  HoverCardMetadataRow,
  HoverCardMetadataValueWithTooltip,
  HoverCardSection,
  HoverCardTitle,
} from '../hover-card/HoverCard';

// ============================================================================
// TYPES
// ============================================================================

interface GateInfo {
  name: string;
  spaceSlug?: string;
  triggerSlug: string;
  functionName: string;
  passed: boolean;
  isWarning?: boolean;
  displayName?: string;
  description?: string;
  warn?: boolean;
  event?: string;
  validating?: boolean;
  toolchainType?: string;
  arguments?: FunctionArgument[] | null;
}

// ============================================================================
// STYLED COMPONENTS — gate-specific styles
// ============================================================================

const SummaryBadge = styled(Box, {
  shouldForwardProp: (prop) => prop !== '$variant',
})<{ $variant: 'blocking' | 'warning' | 'passed' }>(({ theme, $variant }) => ({
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: theme.spacing(0.25, 0.75),
  borderRadius: 4,
  color:
    $variant === 'blocking'
      ? theme.palette.error.main
      : $variant === 'warning'
        ? theme.palette.warning.main
        : theme.palette.success.main,
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
}));

const GateItemContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== '$passed',
})<{ $passed: boolean }>(({ theme }) => ({
  borderRadius: 4,
  marginBottom: theme.spacing(0.5),
  overflow: 'hidden',
  '&:last-child': {
    marginBottom: 0,
  },
}));

const GateItemHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(0.5, 0.75),
  cursor: 'pointer',
}));

const GateName = styled(Typography)(({ theme }) => ({
  fontSize: '0.8rem',
  color: theme.palette.text.secondary,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
}));

// ============================================================================
// HELPERS
// ============================================================================

// ============================================================================
// GATE ITEM COMPONENT
// ============================================================================

interface GateItemProps {
  gate: GateInfo;
  isLast?: boolean;
}

const SectionLabel = styled(Typography)({
  fontSize: '0.625rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

const ExpandableGateItem = ({ gate }: GateItemProps) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const label = gate.displayName || gate.triggerSlug;

  return (
    <GateItemContainer $passed={gate.passed}>
      <GateItemHeader onClick={handleToggle}>
        <Box
          sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, flex: 1, minWidth: 0 }}
        >
          <Box sx={{ pt: 0.25, flexShrink: 0 }}>
            {gate.passed ? (
              <CheckCircleIcon sx={{ color: theme.palette.success.main, fontSize: 14 }} />
            ) : gate.isWarning ? (
              <WarningIcon sx={{ color: theme.palette.warning.main, fontSize: 14 }} />
            ) : (
              <ErrorIcon sx={{ color: theme.palette.error.main, fontSize: 14 }} />
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <GateName>{label}</GateName>
          </Box>
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            color: 'text.secondary',
            flexShrink: 0,
          }}
        >
          {expanded ? (
            <ExpandLess sx={{ fontSize: 16 }} />
          ) : (
            <ExpandMore sx={{ fontSize: 16 }} />
          )}
        </Box>
      </GateItemHeader>

      <Collapse in={expanded} timeout='auto' unmountOnExit>
        <Box sx={{ px: 1, pb: 1, pt: 0.5 }}>
          {/* Description — shown if provided by the trigger, otherwise show function name as fallback */}
          {gate.description ? (
            <Typography
              variant='body2'
              sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.75 }}
            >
              {gate.description}
            </Typography>
          ) : gate.functionName && gate.arguments && gate.arguments.length > 0 ? (
            <Typography
              variant='body2'
              sx={{
                fontSize: '0.75rem',
                color: 'text.secondary',
                mb: 0.75,
                fontStyle: 'italic',
              }}
            >
              {gate.functionName}(
              {gate.arguments.map((a) => String(a?.Value || '')).join(', ')})
            </Typography>
          ) : null}
          {/* Trigger attribute chips */}
          <Stack direction='row' spacing={0.5} flexWrap='wrap' sx={{ gap: 0.5 }}>
            {gate.warn !== undefined && (
              <Chip
                label={gate.warn ? 'Warn' : 'Blocking'}
                color='primary'
                size='small'
                sx={{ height: 16, fontSize: '0.55rem' }}
              />
            )}
            {gate.event && (
              <Chip
                label={gate.event}
                color='warning'
                size='small'
                sx={{ height: 16, fontSize: '0.55rem' }}
              />
            )}
            {gate.validating !== undefined && (
              <Chip
                label={gate.validating ? 'Validating' : 'Non Validating'}
                color='info'
                size='small'
                sx={{ height: 16, fontSize: '0.55rem' }}
              />
            )}
          </Stack>
          {/* Function Details section */}
          {(gate.functionName || gate.toolchainType) && (
            <HoverCardSection sx={{ mt: 1, pt: 0.75 }}>
              <SectionLabel color='text.secondary' sx={{ mb: 0.5, display: 'block' }}>
                Function Details
              </SectionLabel>
              {gate.functionName && (
                <HoverCardMetadataRow>
                  <HoverCardMetadataLabel>Function</HoverCardMetadataLabel>
                  <HoverCardMetadataValueWithTooltip>
                    {gate.functionName}
                  </HoverCardMetadataValueWithTooltip>
                </HoverCardMetadataRow>
              )}
              {gate.toolchainType && (
                <HoverCardMetadataRow>
                  <HoverCardMetadataLabel>Toolchain</HoverCardMetadataLabel>
                  <HoverCardMetadataValueWithTooltip>
                    {gate.toolchainType}
                  </HoverCardMetadataValueWithTooltip>
                </HoverCardMetadataRow>
              )}
            </HoverCardSection>
          )}

          {/* Parameters section */}
          {gate.arguments && gate.arguments.length > 0 && (
            <HoverCardSection>
              <SectionLabel color='text.secondary' sx={{ mb: 0.5, display: 'block' }}>
                Parameters ({gate.arguments.length})
              </SectionLabel>
              {gate.arguments.map((arg) => (
                <HoverCardMetadataRow key={arg.ParameterName}>
                  <HoverCardMetadataLabel>{arg.ParameterName}</HoverCardMetadataLabel>
                  <HoverCardMetadataValueWithTooltip>
                    {String(arg?.Value || '')}
                  </HoverCardMetadataValueWithTooltip>
                </HoverCardMetadataRow>
              ))}
            </HoverCardSection>
          )}
        </Box>
      </Collapse>
    </GateItemContainer>
  );
};

// ============================================================================
// CONTENT COMPONENT
// ============================================================================

interface ValidationErrorsContentProps {
  gates: GateInfo[];
  warnings: GateInfo[];
  hasBlockingGates: boolean;
  summary: { total: number; blocking: number; passed: number; warnings: number };
}

const ValidationErrorsContent = ({
  gates,
  warnings,
  hasBlockingGates,
  summary,
}: ValidationErrorsContentProps) => (
  <>
    <HoverCardHeader>
      <Box sx={{ overflow: 'hidden' }}>
        <HoverCardTitle variant='subtitle2'>Validation Errors</HoverCardTitle>
      </Box>
      <SummaryBadge
        $variant={hasBlockingGates ? 'blocking' : summary.warnings > 0 ? 'warning' : 'passed'}
      >
        {hasBlockingGates
          ? `${summary.blocking} Blocking`
          : summary.warnings > 0
            ? `${summary.warnings} Warning${summary.warnings > 1 ? 's' : ''}`
            : 'All Passed'}
      </SummaryBadge>
    </HoverCardHeader>

    <Box>
      {gates.map((gate, index) => (
        <ExpandableGateItem key={gate.name} gate={gate} isLast={index === gates.length - 1} />
      ))}
    </Box>

    {warnings.length > 0 && (
      <>
        <HoverCardHeader sx={{ mt: 1 }}>
          <Box sx={{ overflow: 'hidden' }}>
            <HoverCardTitle variant='subtitle2'>Validation Warnings</HoverCardTitle>
          </Box>
          <SummaryBadge $variant='warning'>
            {summary.warnings} Warning{summary.warnings > 1 ? 's' : ''}
          </SummaryBadge>
        </HoverCardHeader>
        <Box>
          {warnings.map((warning, index) => (
            <ExpandableGateItem
              key={warning.name}
              gate={warning}
              isLast={index === warnings.length - 1}
            />
          ))}
        </Box>
      </>
    )}
  </>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ValidationErrorsHoverCardProps {
  unit: ExtendedUnitRead;
  children: React.ReactElement;
}

export const ValidationErrorsHoverCard = ({
  unit,
  children,
}: ValidationErrorsHoverCardProps) => {
  const spaceId = unit?.Unit?.SpaceID || '';

  // Fetch triggers to get arguments
  const { data: triggers = [] } = useListTriggersQuery({ spaceId }, { skip: !spaceId });
  const gateTriggers = useGateTriggers(unit?.Unit);

  // Helper to build GateInfo from a gate entry
  const buildGateInfo = (name: string, failed: boolean, isWarning: boolean): GateInfo => {
    const { spaceSlug, triggerSlug, functionName } = parseGateName(name);
    const trigger = findTriggerForGate(name, unit?.Unit, gateTriggers, triggers);
    return {
      name,
      spaceSlug,
      triggerSlug,
      functionName,
      passed: !failed,
      isWarning,
      displayName: trigger?.Trigger?.DisplayName,
      description: trigger?.Trigger?.Description,
      warn: trigger?.Trigger?.Warn,
      event: trigger?.Trigger?.Event,
      validating: trigger?.Trigger?.Validating,
      toolchainType: trigger?.Trigger?.ToolchainType,
      arguments: trigger?.Trigger?.Arguments,
    };
  };

  // Parse validation errors from unit
  const gates = useMemo((): GateInfo[] => {
    const validationErrors = unit.Unit?.ValidationErrors;
    if (!validationErrors || Object.keys(validationErrors).length === 0) {
      return [];
    }
    return Object.entries(validationErrors).map(([name, failed]) =>
      buildGateInfo(name, failed, false),
    );
  }, [unit.Unit?.ValidationErrors, triggers, gateTriggers]);

  // Parse validation warnings from unit
  const warnings = useMemo((): GateInfo[] => {
    const validationWarnings = unit.Unit?.ValidationWarnings;
    if (!validationWarnings || Object.keys(validationWarnings).length === 0) {
      return [];
    }
    return Object.entries(validationWarnings).map(([name, failed]) =>
      buildGateInfo(name, failed, true),
    );
  }, [unit.Unit?.ValidationWarnings, triggers, gateTriggers]);

  // Calculate summary
  const summary = useMemo(() => {
    const total = gates.length + warnings.length;
    const blocking = gates.filter((g) => !g.passed).length;
    const passed = gates.filter((g) => g.passed).length;
    const warningCount = warnings.filter((w) => !w.passed).length;
    return { total, blocking, passed, warnings: warningCount };
  }, [gates, warnings]);

  const hasBlockingGates = summary.blocking > 0;

  return (
    <HoverCard
      content={
        <ValidationErrorsContent
          gates={gates}
          warnings={warnings}
          hasBlockingGates={hasBlockingGates}
          summary={summary}
        />
      }
      placement='bottom-start'
      offset={[0, 8]}
      enabled={gates.length > 0 || warnings.length > 0}
      triggerSx={{ width: 'auto' }}
    >
      {children}
    </HoverCard>
  );
};
