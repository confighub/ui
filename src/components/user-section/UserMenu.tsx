// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { logout } from '@/auth/session';
import Logout from '@mui/icons-material/Logout';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';

interface UserMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Dropdown menu for user account actions
 */
export function UserMenu({ anchorEl, open, onClose }: UserMenuProps): JSX.Element {
  const handleLogout = (): void => {
    logout();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      id='account-menu'
      open={open}
      onClose={onClose}
      onClick={onClose}
      disableEnforceFocus
      slotProps={{
        paper: {
          elevation: 0,
          sx: {
            overflow: 'visible',
            filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
            mt: 1.5,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
            '&::before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
            },
          },
        },
      }}
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
    >
      <MenuItem onClick={handleLogout}>
        <ListItemIcon>
          <Logout fontSize='small' />
        </ListItemIcon>
        Logout
      </MenuItem>
    </Menu>
  );
}
