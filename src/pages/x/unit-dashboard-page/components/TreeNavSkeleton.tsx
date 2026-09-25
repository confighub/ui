// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { alpha, styled } from '@mui/material/styles';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Group nodes rendered, and unit leaves nested under each of them. */
const GROUP_IDS = [0, 1, 2, 3];
const LEAF_IDS = [0, 1];

/** Matches the TreeItem content box: 4px/8px padding around ~20px of content. */
const ROW_HEIGHT = 30;

/** groupTransition indent from TreeNode: 16px margin + 12px padding. */
const LEAF_INDENT = 28;

// ============================================================================
// STYLED
// ============================================================================

/** Mirrors the ControlBar in TreeNav so the header does not shift. */
const ControlBarShell = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1, 1.5),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: alpha(theme.palette.background.paper, 0.5),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}));

/** Mirrors the TreeContainer in TreeNav. */
const TreeAreaShell = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: 'hidden',
  padding: theme.spacing(1),
}));

const RowShell = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  minHeight: ROW_HEIGHT,
  padding: theme.spacing(0.5, 1),
  margin: theme.spacing(0.2, 0),
}));

// ============================================================================
// PRIMITIVES
// ============================================================================

/** Group node: expand chevron, checkbox, group icon, label. */
const GroupRowSkeleton = ({ index }: { index: number }) => (
  <RowShell>
    <Skeleton variant='circular' width={18} height={18} sx={{ flexShrink: 0 }} />
    <Skeleton variant='rounded' width={20} height={20} sx={{ flexShrink: 0 }} />
    <Skeleton variant='rounded' width={18} height={18} sx={{ flexShrink: 0 }} />
    <Skeleton variant='text' width={`${34 + (index % 3) * 12}%`} height={16} />
  </RowShell>
);

/** Unit leaf: checkbox, unit icon, space slug, unit slug. */
const UnitRowSkeleton = ({ index }: { index: number }) => (
  <RowShell sx={{ ml: `${LEAF_INDENT}px` }}>
    <Skeleton variant='rounded' width={20} height={20} sx={{ flexShrink: 0 }} />
    <Skeleton variant='rounded' width={18} height={18} sx={{ flexShrink: 0 }} />
    <Skeleton variant='text' width={`${26 + (index % 2) * 8}%`} height={14} />
    <Skeleton variant='text' width={`${34 + (index % 3) * 10}%`} height={14} />
  </RowShell>
);

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Content-shaped loading state for the unit tree: a control-bar row followed by
 * grouped unit rows, matching the TreeNodes/UnitTreeNode layout. Rendered inside
 * TreeNav's Container, which supplies the panel chrome.
 */
export const TreeNavSkeleton = () => (
  <>
    <ControlBarShell>
      <Skeleton variant='rounded' width={132} height={26} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Skeleton variant='text' width={48} height={14} />
        <Skeleton variant='text' width={62} height={14} />
        <Skeleton variant='circular' width={16} height={16} />
      </Box>
    </ControlBarShell>
    <TreeAreaShell>
      {GROUP_IDS.map((group) => (
        <Box key={group}>
          <GroupRowSkeleton index={group} />
          {LEAF_IDS.map((leaf) => (
            <UnitRowSkeleton key={leaf} index={group + leaf} />
          ))}
        </Box>
      ))}
    </TreeAreaShell>
  </>
);
