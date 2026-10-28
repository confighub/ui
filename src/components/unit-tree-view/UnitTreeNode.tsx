// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo } from 'react';
import { Handle, Position } from 'reactflow';

import { NavLink } from '@/components/nav-link/NavLink';
import { ExtendedUnitRead } from '@confighub/rtk-query';
import { Box, Chip, Typography, styled } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import { hasUnreleasedChanges } from '@/utility/unit-release-functions';

const NodeContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.5),
  borderRadius: theme.spacing(1),
  border: `2px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  minWidth: 200,
  maxWidth: 250,
  boxShadow: theme.shadows[2],
  cursor: 'pointer',
  '&:hover': {
    boxShadow: theme.shadows[4],
    borderColor: theme.palette.primary.main,
  },
}));

const NodeLabel = styled(Typography)({
  fontWeight: 600,
  fontSize: '0.875rem',
  marginBottom: 4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const NodeSublabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}));

const StatusContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(0.5),
  marginTop: theme.spacing(0.5),
  flexWrap: 'wrap',
}));

interface UnitTreeNodeProps {
  data: {
    label: string;
    sublabel: string;
    unit: ExtendedUnitRead;
    nodeType: 'unit' | 'space';
  };
}

export const UnitTreeNode = memo(({ data }: UnitTreeNodeProps) => {
  const { label, sublabel, unit, nodeType } = data;

  const path = nodeType === 'space'
    ? `/spaces/${unit.Unit?.SpaceID}`
    : `/units/${unit.Unit?.SpaceID}/${unit.Unit?.UnitID}`;

  // Determine status indicators
  const unreleased = hasUnreleasedChanges(unit.Unit);
  const needsUpgrade =
    unit.Unit?.UpstreamUnitID &&
    unit.Unit?.UpstreamRevisionNum !== undefined &&
    unit.UpstreamUnit?.HeadRevisionNum !== undefined &&
    unit.Unit.UpstreamRevisionNum !== unit.UpstreamUnit.HeadRevisionNum;
  const hasValidationErrors =
    unit.Unit?.ValidationErrors && Object.keys(unit.Unit.ValidationErrors).length > 0;

  // Determine overall status color
  let statusColor: 'success' | 'warning' | 'error' = 'success';
  let StatusIcon = CheckCircleIcon;

  if (hasValidationErrors) {
    statusColor = 'error';
    StatusIcon = ErrorIcon;
  } else if (needsUpgrade || unreleased) {
    statusColor = 'warning';
    StatusIcon = WarningIcon;
  }

  return (
    <>
      <Handle type="target" position={Position.Top} />
      {/* nodrag/nopan: a press on the link is a click, not a pan of the canvas.
          draggable={false} stops the browser's own link drag. */}
      <NavLink to={path} className='nodrag nopan' draggable={false} style={{ display: 'block' }}>
        <NodeContainer>
          <Box display="flex" alignItems="center" gap={1}>
            <StatusIcon
              sx={{ fontSize: 16 }}
              color={statusColor}
            />
            <NodeLabel>{label}</NodeLabel>
          </Box>
          <NodeSublabel>{sublabel}</NodeSublabel>

          <StatusContainer>
            {unreleased && (
              <Chip
                label="Unapplied"
                size="small"
                color="warning"
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}
            {needsUpgrade && (
              <Chip
                label="Upgrade"
                size="small"
                color="warning"
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}
            {hasValidationErrors && (
              <Chip
                label="Gated"
                size="small"
                color="error"
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}
          </StatusContainer>
        </NodeContainer>
      </NavLink>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
});

UnitTreeNode.displayName = 'UnitTreeNode';
