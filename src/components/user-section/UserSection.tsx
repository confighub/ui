// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useState } from 'react';

import Skeleton from '@mui/material/Skeleton';

import { useUserInfo } from '../authenticated-context/AuthenticatedContext';
import { UserAvatar } from './UserAvatar';
import { UserMenu } from './UserMenu';

/** User menu section with avatar and dropdown. Shows a skeleton placeholder
 * until `GET /api/me` resolves, since the avatar/menu need real user
 * identity — the rest of the nav chrome around it does not wait on this. */
export const UserSection = memo(() => {
  const { userInfo, isLoading } = useUserInfo();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleOpenMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setAnchorEl(null);
  }, []);

  if (isLoading) {
    return (
      <Skeleton
        variant='circular'
        width={33}
        height={33}
        sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}
        data-testid='user-avatar-skeleton'
      />
    );
  }

  return (
    <>
      <UserAvatar userInfo={userInfo} onClick={handleOpenMenu} />
      <UserMenu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleCloseMenu} />
    </>
  );
});

UserSection.displayName = 'UserSection';
