// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { OrganizationMember } from '@confighub/rtk-query';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';

interface UserAvatarProps {
  userInfo: OrganizationMember | undefined;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  size?: 'small' | 'medium' | 'large';
  showTooltip?: boolean;
}

const sizeMap = {
  small: 24,
  medium: 33,
  large: 48,
};

/**
 * Displays a user's profile picture with optional tooltip and click functionality
 */
export const UserAvatar = ({
  userInfo,
  onClick,
  size = 'medium',
  showTooltip = true,
}: UserAvatarProps) => {
  const avatarSize = sizeMap[size];

  const avatar = (
    <Avatar
      data-testid='user-avatar'
      src={userInfo?.ProfilePictureURL as string}
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        height: `${avatarSize}px`,
        width: `${avatarSize}px`,
        position: 'relative',
      }}
      onClick={onClick}
    />
  );

  if (showTooltip && userInfo?.DisplayName) {
    return (
      <Tooltip title={userInfo.DisplayName} arrow>
        {avatar}
      </Tooltip>
    );
  }

  return avatar;
};
