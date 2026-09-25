// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================
//
// These mirror `AppNavigationTree.tsx`'s own chrome (Container / Header /
// TreeContainer) and the `StyledTreeItem` row metrics so the skeleton occupies
// exactly the space the real tree will occupy — swapping one for the other must
// not shift anything.

const Container = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: theme.palette.background.paper,
}));

const Header = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.5, 2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: alpha(theme.palette.background.paper, 0.5),
}));

const TreeContainer = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: 'auto',
  padding: theme.spacing(1),
}));

/** Matches `treeItemClasses.content`: padding 0.5/1, margin 0.2/0. */
const RowShell = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: theme.spacing(0.5, 1),
  margin: theme.spacing(0.2, 0),
}));

/** Matches `treeItemClasses.groupTransition`: marginLeft 16, paddingLeft 12. */
const ChildGroup = styled(Box)(({ theme }) => ({
  marginLeft: 16,
  paddingLeft: 12,
  borderLeft: `1px dashed ${alpha(theme.palette.text.primary, 0.2)}`,
}));

// ============================================================================
// ROW PRIMITIVES
// ============================================================================

interface TreeRowSkeletonProps {
  /** Width of the label placeholder, as a percentage of the row. */
  labelWidth: string;
}

/**
 * One tree row: 20px icon-container slot, an 18px item icon, a text label and a
 * trailing count-badge pill — the exact composition of `ItemLabel`.
 */
const TreeRowSkeleton = ({ labelWidth }: TreeRowSkeletonProps) => (
  <RowShell>
    <Box sx={{ width: 20, flexShrink: 0 }} />
    <Skeleton variant='rounded' width={18} height={18} sx={{ flexShrink: 0 }} />
    <Skeleton variant='text' width={labelWidth} height={14} sx={{ flex: 1 }} />
    <Skeleton variant='rounded' width={22} height={16} sx={{ borderRadius: 9, flexShrink: 0 }} />
  </RowShell>
);

// ============================================================================
// PUBLIC COMPONENTS
// ============================================================================

interface AppNavigationTreeRowsSkeletonProps {
  /** Number of owner groups to draw. Each renders two nested app rows. */
  groupCount?: number;
}

/**
 * Just the rows — owner groups each with two nested app children. Used on its
 * own as the nav tree's partial-load affordance (`isLoadingMore`), where real
 * rows are already on screen above it.
 */
export const AppNavigationTreeRowsSkeleton = ({
  groupCount = 3,
}: AppNavigationTreeRowsSkeletonProps) => (
  <Box aria-hidden>
    {Array.from({ length: groupCount }, (_, i) => (
      <Box key={i}>
        <TreeRowSkeleton labelWidth={`${58 + i * 8}%`} />
        <ChildGroup>
          <TreeRowSkeleton labelWidth={`${62 + i * 6}%`} />
          <TreeRowSkeleton labelWidth={`${48 + i * 6}%`} />
        </ChildGroup>
      </Box>
    ))}
  </Box>
);

/**
 * Full left-panel placeholder: the "Components" header plus the row skeletons.
 * Used by the page-level first-paint gate, where no tree exists yet.
 */
export const AppNavigationTreeSkeleton = () => (
  <Container>
    <Header>
      <Typography variant='body2' color='text.secondary' fontWeight={500}>
        Components
      </Typography>
    </Header>
    <TreeContainer>
      <RowShell>
        <Box sx={{ width: 20, flexShrink: 0 }} />
        <Skeleton variant='rounded' width={18} height={18} sx={{ flexShrink: 0 }} />
        <Skeleton variant='text' width='40%' height={14} sx={{ flex: 1 }} />
      </RowShell>
      <Box sx={{ my: 0.5, mx: 1, height: '1px', bgcolor: 'divider' }} />
      <AppNavigationTreeRowsSkeleton />
    </TreeContainer>
  </Container>
);
