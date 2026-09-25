// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

import { type ExtendedUnitRead } from '@confighub/rtk-query';
import DnsIcon from '@mui/icons-material/Dns';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

// ============================================================================
// TYPES
// ============================================================================

export interface FlowUnitNodeData {
  unit: ExtendedUnitRead;
  isSelected: boolean;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const NodeContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== '$isSelected',
})<{ $isSelected: boolean }>(({ theme, $isSelected }) => ({
  padding: theme.spacing(1.5),
  borderRadius: theme.spacing(1),
  border: `2px solid ${$isSelected ? theme.palette.primary.main : theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  minWidth: 200,
  maxWidth: 250,
  boxShadow: $isSelected ? `0 0 0 2px ${theme.palette.primary.light}` : theme.shadows[2],
  transition: 'border-color 0.2s, box-shadow 0.2s',
  '&:hover': {
    boxShadow: theme.shadows[4],
    borderColor: theme.palette.primary.main,
  },
}));

const StatusContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(0.5),
  marginTop: theme.spacing(0.5),
  flexWrap: 'wrap',
}));

// ============================================================================
// COMPONENT
// ============================================================================

export const FlowUnitNode = memo(({ data }: NodeProps<FlowUnitNodeData>) => {
  const { unit, isSelected } = data;

  const slug = unit.Unit?.Slug ?? '';
  const spaceName = unit.Space?.Slug ?? '';
  const toolchainType = unit.Unit?.ToolchainType ?? '';

  const hasUnreleasedChanges = unit.Unit?.HeadRevisionNum !== unit.Unit?.LastReleasedRevisionNum;
  const needsUpgrade =
    unit.Unit?.UpstreamUnitID &&
    unit.Unit?.UpstreamRevisionNum !== undefined &&
    unit.UpstreamUnit?.HeadRevisionNum !== undefined &&
    unit.Unit.UpstreamRevisionNum !== unit.UpstreamUnit.HeadRevisionNum;
  const hasValidationErrors = unit.Unit?.ValidationErrors && Object.keys(unit.Unit.ValidationErrors).length > 0;

  return (
    <>
      <Handle type='target' position={Position.Top} />
      <NodeContainer $isSelected={isSelected}>
        <Box display='flex' alignItems='center' gap={1}>
          <DnsIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant='body2' fontWeight={600} noWrap sx={{ maxWidth: 180 }}>
            {slug}
          </Typography>
        </Box>
        <Typography
          variant='caption'
          color='text.secondary'
          noWrap
          sx={{ display: 'block', mt: 0.25 }}
        >
          {spaceName}
        </Typography>
        <StatusContainer>
          {toolchainType && (
            <Chip
              label={toolchainType}
              size='small'
              variant='outlined'
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
          )}
          {hasUnreleasedChanges && (
            <Chip
              label='Unapplied'
              size='small'
              color='warning'
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
          )}
          {needsUpgrade && (
            <Chip
              label='Upgrade'
              size='small'
              color='warning'
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
          )}
          {hasValidationErrors && (
            <Chip
              label='Gated'
              size='small'
              color='error'
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
          )}
        </StatusContainer>
      </NodeContainer>
      <Handle type='source' position={Position.Bottom} />
    </>
  );
});

FlowUnitNode.displayName = 'FlowUnitNode';
