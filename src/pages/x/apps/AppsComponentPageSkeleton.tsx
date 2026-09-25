// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';

import { AppNavigationTreeSkeleton } from './AppNavigationTreeSkeleton';
import { ComponentFlowGraphSkeleton } from './ComponentFlowGraphSkeleton';
import { ComponentOverviewMatrixSkeleton } from './ComponentOverviewMatrixSkeleton';

interface AppsComponentPageSkeletonProps {
  /**
   * Which detail pane the page is about to render. `?app=<name>` deep-links land
   * on the flow graph; everything else lands on the overview matrix. Drawing the
   * right one avoids a second layout change at first paint.
   */
  variant: 'overview' | 'graph';
}

/**
 * Whole-page placeholder for the Components view's first-paint gate. Reproduces
 * `AppsComponentLayout`'s 20% / 80% split (the resizable panel's `defaultSize`)
 * with the nav-tree skeleton on the left and the detail-pane skeleton on the
 * right. Plain flex boxes, not `react-resizable-panels` — same geometry without
 * mounting (and immediately unmounting) the real panel group.
 */
export const AppsComponentPageSkeleton = ({ variant }: AppsComponentPageSkeletonProps) => (
  <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', width: '100%' }}>
    <Box sx={{ width: '20%', minWidth: 0, flexShrink: 0 }}>
      <AppNavigationTreeSkeleton />
    </Box>
    <Box sx={{ width: '1px', bgcolor: 'divider', flexShrink: 0 }} />
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {variant === 'graph' ? <ComponentFlowGraphSkeleton /> : <ComponentOverviewMatrixSkeleton />}
    </Box>
  </Box>
);
