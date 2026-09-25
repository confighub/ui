// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';

const TagContainer = styled(Box)(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: theme.spacing(0.25, 0.75),
  maxWidth: 140,
  transition: 'all 0.15s ease',
  '&:hover': {
    '& .tag-delete-btn': {
      opacity: 1,
      width: 16,
    },
  },
}));

const DeleteButton = styled(IconButton)(({ theme }) => ({
  opacity: 0,
  width: 0,
  height: 16,
  padding: 0,
  marginLeft: 0,
  overflow: 'hidden',
  transition: 'all 0.15s ease',
  color: theme.palette.text.secondary,
  '&:hover': {
    backgroundColor: alpha(theme.palette.error.main, 0.1),
    color: theme.palette.error.main,
  },
}));

export interface TagBadgeProps {
  label: string;
  slug?: string;
  onDelete?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * A compact tag badge with hover-to-reveal delete button.
 * Inspired by GitHub labels and Linear tags.
 */
export const TagBadge = ({
  label,
  slug,
  onDelete,
  disabled,
  disabledReason,
}: TagBadgeProps) => {
  return (
    <Tooltip title={disabled && disabledReason ? disabledReason : slug || label} placement='top' arrow>
      <TagContainer>
      <Typography
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      {onDelete && !disabled && (
        <DeleteButton
          className='tag-delete-btn'
          size='small'
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
        >
          <CloseIcon sx={{ fontSize: 12 }} />
        </DeleteButton>
      )}
      </TagContainer>
    </Tooltip>
  );
};
