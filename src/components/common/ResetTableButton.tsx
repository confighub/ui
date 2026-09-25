// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import Button from '@mui/material/Button';

interface ResetTableButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export const ResetTableButton = ({ onClick, disabled }: ResetTableButtonProps) => {
  return (
    <Button
      size='small'
      variant='text'
      onClick={onClick}
      disabled={disabled}
      startIcon={<RestartAltIcon />}
      aria-label='Reset Table'
      sx={(theme) => ({
        fontSize: '0.875rem',
        fontWeight: 500,
        textTransform: 'none',
        height: 32,
        color: theme.palette.text.secondary,
        backgroundColor: 'transparent',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '8px',
        padding: theme.spacing(0.5, 1.5),
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          color: theme.palette.text.primary,
          backgroundColor: theme.palette.grey[200],
          borderColor: theme.palette.grey[400],
        },
        '&:disabled': {
          opacity: 0.5,
        },
        '& .MuiButton-startIcon': {
          marginRight: '4px',
        },
        '& svg': {
          fontSize: '18px !important',
        },
      })}
    >
      Reset
    </Button>
  );
};
