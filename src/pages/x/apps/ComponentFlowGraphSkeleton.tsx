// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

import { componentTheme } from './componentTheme';
import { NODE_HEIGHT, NODE_WIDTH, STAGE_GAP } from './flow-graph/flowLayout';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Fixed placeholder shape. The real deployment/stage counts are only known once
 * the units query resolves, so guessing is impossible — this draws a generic
 * root → fan-out silhouette at the real node metrics instead.
 */
const STAGE_NODE_COUNTS = [1, 2, 2];

/** Matches `NODE_GAP` in flowLayout.ts (module-private there). */
const NODE_GAP = 30;

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * First-paint placeholder for `ComponentFlowGraph`: rounded node cards at
 * NODE_WIDTH x NODE_HEIGHT laid out in stage columns spaced by STAGE_GAP, so
 * the canvas already reads as a promotion graph before any data lands.
 *
 * Deliberately does NOT render a side-pane placeholder — the side pane only
 * slides in after a node is selected.
 */
export const ComponentFlowGraphSkeleton = () => (
  <Box
    aria-hidden
    sx={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      p: 3,
      bgcolor: componentTheme.bgSubtle,
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: `${STAGE_GAP}px` }}>
      {STAGE_NODE_COUNTS.map((nodeCount, stageIndex) => (
        <Box
          key={stageIndex}
          sx={{ display: 'flex', flexDirection: 'column', gap: `${NODE_GAP}px`, flexShrink: 0 }}
        >
          {Array.from({ length: nodeCount }, (_, nodeIndex) => (
            <Skeleton
              key={nodeIndex}
              variant='rounded'
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              sx={{ borderRadius: `${componentTheme.radiusLg}px` }}
            />
          ))}
        </Box>
      ))}
    </Box>
  </Box>
);
