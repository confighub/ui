// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { fadeIn } from '@/components/styled';
import { useOrganization } from '@/hooks/useOrganization';
import { useApiInfoQuery } from '@confighub/rtk-query';
import { switchOrganization } from '@/auth/session';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface OrganizationSwitcherProps {
  currentOrganizationId: string;
}

const MENU_ID = 'organization-menu';
const BUTTON_ID = 'organization-switcher-button';

/**
 * Shows the current organization and offers to switch to another one.
 *
 * Switching is a fresh login: the identity provider owns the list of
 * organizations the user may enter and prompts for one, so the UI never
 * enumerates them. (The server only knows organizations it has already seen a
 * login for, so a list built from the API would be missing any the user has
 * never entered on this instance.) The current page is carried through the
 * login so the user lands back where they were, in the organization they picked.
 *
 * Without an identity provider there is exactly one organization and no login
 * route, so the name is rendered as plain text.
 */
export const OrganizationSwitcher = ({ currentOrganizationId }: OrganizationSwitcherProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const { currentOrg } = useOrganization({
    ExternalOrganizationID: currentOrganizationId,
  });
  const { data: info } = useApiInfoQuery();
  // Switching organizations is signing in again for the other one, so it needs
  // an identity provider to sign in against. AuthIssuer is what says there is
  // one.
  const canSwitch = Boolean(info?.AuthIssuer);
  const isOpen = Boolean(anchorEl);
  const name = currentOrg.DisplayName ?? '';

  const handleSwitch = () => {
    setAnchorEl(null);
    switchOrganization();
  };

  if (!canSwitch) {
    return (
      <Fade in={!!name} timeout={1000}>
        <Typography
          variant='subtitle1'
          data-testid='organization-switcher'
          aria-label='Current organization'
          sx={{ color: 'text.primary', fontWeight: 600 }}
        >
          {name}
        </Typography>
      </Fade>
    );
  }

  return (
    <Fade in={!!name} timeout={1000}>
      <Box sx={{ animation: `${fadeIn} 0.3s ease-in` }}>
        <Tooltip title='Current organization' enterDelay={400}>
          <Button
            size='small'
            variant='text'
            data-testid='organization-switcher'
            id={BUTTON_ID}
            aria-haspopup='menu'
            aria-controls={isOpen ? MENU_ID : undefined}
            aria-expanded={isOpen ? 'true' : undefined}
            endIcon={<KeyboardArrowDownIcon />}
            onClick={(event) => setAnchorEl(event.currentTarget)}
            sx={{
              color: 'text.primary',
              fontWeight: 600,
              maxWidth: '250px',
              '& .MuiButton-endIcon': { color: 'text.disabled' },
            }}
          >
            <Box
              component='span'
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {name}
            </Box>
          </Button>
        </Tooltip>
        <Menu
          id={MENU_ID}
          anchorEl={anchorEl}
          open={isOpen}
          onClose={() => setAnchorEl(null)}
          MenuListProps={{ 'aria-labelledby': BUTTON_ID }}
        >
          <MenuItem onClick={handleSwitch}>
            <ListItemIcon>
              <SwapHorizIcon fontSize='small' />
            </ListItemIcon>
            Switch organization
          </MenuItem>
        </Menu>
      </Box>
    </Fade>
  );
};
