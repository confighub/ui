// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type ReactNode, memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

// ============================================================================
// TYPES
// ============================================================================

export interface FlowGroupNodeData {
  label: string;
  icon: ReactNode;
  unitCount: number;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const NodeContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.5, 2),
  borderRadius: theme.spacing(1),
  border: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.action.hover,
  minWidth: 160,
  maxWidth: 220,
  boxShadow: theme.shadows[1],
}));

// ============================================================================
// COMPONENT
// ============================================================================

export const FlowGroupNode = memo(({ data }: NodeProps<FlowGroupNodeData>) => {
  const { label, icon, unitCount } = data;

  return (
    <>
      <NodeContainer>
        <Box display='flex' alignItems='center' gap={1}>
          <Box sx={{ display: 'flex', color: 'text.secondary', fontSize: 18 }}>{icon}</Box>
          <Badge badgeContent={unitCount} color='primary' max={999}>
            <Typography variant='body2' fontWeight={600} noWrap sx={{ pr: 1 }}>
              {label}
            </Typography>
          </Badge>
        </Box>
      </NodeContainer>
      <Handle type='source' position={Position.Bottom} />
    </>
  );
});

FlowGroupNode.displayName = 'FlowGroupNode';
