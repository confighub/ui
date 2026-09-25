// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ViewRead } from '@confighub/rtk-query';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';
import Box from '@mui/material/Box';
import TableChartIcon from '@mui/icons-material/TableChart';
import ListItemButton from '@mui/material/ListItemButton';

interface SortableViewNavItemProps {
  view: ViewRead;
  isActive: boolean;
  isDirty: boolean;
  onClick: (viewId: string) => void;
}

const StyledListItemButton = styled(ListItemButton, {
  shouldForwardProp: (prop) => prop !== 'isActive',
})<{ isActive?: boolean }>(({ theme, isActive }) => ({
  borderRadius: theme.shape.borderRadius,
  marginBottom: 2,
  paddingTop: 6,
  paddingBottom: 6,
  backgroundColor: isActive ? theme.palette.action.selected : 'transparent',
  '&:hover': {
    backgroundColor: isActive
      ? theme.palette.action.selected
      : theme.palette.action.hover,
  },
}));

const DirtyDot = styled('span')(({ theme }) => ({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  backgroundColor: theme.palette.warning.main,
  marginLeft: 6,
  verticalAlign: 'middle',
}));

const DragHandle = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  cursor: 'grab',
  color: theme.palette.text.disabled,
  marginRight: -4,
  '&:hover': {
    color: theme.palette.text.secondary,
  },
}));

export function SortableViewNavItem({ view, isActive, isDirty, onClick }: SortableViewNavItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.ViewID! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 'auto' as const,
    position: 'relative' as const,
  };

  const label = view.DisplayName ?? view.Slug;

  return (
    <Tooltip title={label} placement='right' disableHoverListener={label.length < 24}>
      <StyledListItemButton
        ref={setNodeRef}
        style={style}
        isActive={isActive}
        onClick={() => onClick(view.ViewID!)}
        dense
      >
        <DragHandle {...attributes} {...listeners}>
          <DragIndicatorIcon sx={{ fontSize: 16 }} />
        </DragHandle>
        <ListItemIcon sx={{ minWidth: 28 }}>
          <TableChartIcon fontSize='small' sx={{ color: isActive ? 'primary.main' : 'text.secondary' }} />
        </ListItemIcon>
        <ListItemText
          primary={
            <>
              {label}
              {isDirty && <DirtyDot />}
            </>
          }
          primaryTypographyProps={{
            variant: 'body2',
            noWrap: true,
            fontWeight: isActive ? 600 : 400,
            color: isActive ? 'primary.main' : 'text.primary',
          }}
        />
      </StyledListItemButton>
    </Tooltip>
  );
}
