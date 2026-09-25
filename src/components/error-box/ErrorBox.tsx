// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ServerErrorBox } from '@/components/styled';
import CloseIcon from '@mui/icons-material/Close';
import { BoxProps, IconButton, Typography, TypographyProps } from '@mui/material';

export interface IErrorBoxProps extends Omit<BoxProps, 'children'> {
  /** The error message to display. Component won't render if falsy */
  error?: string | null;
  /** Callback function when close button is clicked */
  onClose: () => void;
  /** Typography variant for the error message */
  variant?: TypographyProps['variant'];
}

export const ErrorBox = ({
  error,
  onClose,
  variant = 'caption',
  sx = {},
  ...props
}: IErrorBoxProps) => {
  if (!error) return null;

  return (
    <ServerErrorBox
      $display={!!error}
      sx={{
        pl: 2,
        ...sx,
      }}
      {...props}
    >
      <Typography variant={variant} color='error'>
        <strong>Error:</strong> {error}
      </Typography>
      <IconButton
        aria-label='close'
        onClick={onClose}
        sx={{
          color: (theme) => theme.palette.error.main,
        }}
        size='small'
      >
        <CloseIcon />
      </IconButton>
    </ServerErrorBox>
  );
};
