// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ViewRead } from '@confighub/rtk-query';
import TableChartIcon from '@mui/icons-material/TableChart';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';

interface ViewNavItemProps {
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

export function ViewNavItem({ view, isActive, isDirty, onClick }: ViewNavItemProps) {
  const label = view.DisplayName ?? view.Slug;

  return (
    <Tooltip title={label} placement='right' disableHoverListener={label.length < 24}>
      <StyledListItemButton
        isActive={isActive}
        onClick={() => onClick(view.ViewID!)}
        dense
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
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
