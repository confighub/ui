// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';

// ============================================================================
// TYPES
// ============================================================================

export interface IUnitSelectionActionsProps {
  selectedUnits: ExtendedUnitRead[];
  canDiff: boolean;
  canCompareUpstream: boolean;
  isFetchingUpstream: boolean;
  onDiffUnits: () => void;
  onCompareUpstream: () => void;
}

// ============================================================================
// STYLED
// ============================================================================

export const FloatingContainer = styled(Paper)(({ theme }) => ({
  position: 'fixed',
  bottom: theme.spacing(3),
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: theme.spacing(1, 2),
  borderRadius: theme.spacing(3),
  boxShadow: theme.shadows[8],
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  zIndex: theme.zIndex.speedDial,
  transition: 'all 225ms cubic-bezier(0.4, 0, 0.2, 1)',
}));

const ActionButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== '$active',
})<{ $active?: boolean }>(({ theme, $active }) => ({
  width: 40,
  height: 40,
  borderRadius: theme.spacing(1),
  backgroundColor: $active ? theme.palette.primary.main : 'transparent',
  color: $active ? theme.palette.primary.contrastText : theme.palette.text.secondary,
  '&:hover': {
    backgroundColor: $active ? theme.palette.primary.dark : theme.palette.action.hover,
  },
  transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
}));

const VerticalDivider = styled(Box)(({ theme }) => ({
  width: 1,
  height: 24,
  backgroundColor: theme.palette.divider,
  margin: theme.spacing(0, 0.5),
}));

// ============================================================================
// COMPONENT
// ============================================================================

export const UnitSelectionActions = ({
  selectedUnits,
  canDiff,
  canCompareUpstream,
  isFetchingUpstream,
  onDiffUnits,
  onCompareUpstream,
}: IUnitSelectionActionsProps) => {
  if (!selectedUnits.length) return null;

  return (
    <FloatingContainer elevation={8}>
      <Chip
        label={`${selectedUnits.length} selected`}
        size='small'
        color='primary'
        variant='filled'
      />
      <VerticalDivider />
      <Tooltip
        title={canDiff ? 'Compare units side-by-side' : 'Select exactly 2 units to compare'}
      >
        <span>
          <ActionButton onClick={onDiffUnits} disabled={!canDiff} size='small'>
            <CompareArrowsIcon />
          </ActionButton>
        </span>
      </Tooltip>
      <Tooltip
        title={
          canCompareUpstream
            ? 'Compare to upstream source'
            : 'Select 1 unit with an upstream source to compare'
        }
      >
        <span>
          <ActionButton
            onClick={onCompareUpstream}
            disabled={!canCompareUpstream || isFetchingUpstream}
            size='small'
          >
            {isFetchingUpstream ? <CircularProgress size={20} /> : <CallSplitIcon />}
          </ActionButton>
        </span>
      </Tooltip>
    </FloatingContainer>
  );
};
