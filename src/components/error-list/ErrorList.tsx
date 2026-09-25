// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ServerErrorBox } from '@/components/styled';
import CloseIcon from '@mui/icons-material/Close';
import { BoxProps, IconButton, Typography, TypographyProps } from '@mui/material';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { useEffect, useRef } from 'react';

export interface IErrorBoxProps extends Omit<BoxProps, 'children'> {
  /** The error message to display. Component won't render if falsy */
  errors: Array<string> | null;
  /** Callback function when close button is clicked */
  onClose: () => void;
  /** Typography variant for the error message */
  variant?: TypographyProps['variant'];
}

export const ErrorList = ({
  errors,
  onClose,
  variant = 'caption',
  sx = {},
  ...props
}: IErrorBoxProps) => {
  const errorBoxRef = useRef<HTMLDivElement>(null);

  // Filter out empty/falsy errors and check if we have any valid errors
  const validErrors = errors?.filter(Boolean) || [];

  // Scroll to error box when errors appear
  useEffect(() => {
    if (validErrors.length > 0 && errorBoxRef.current) {
      errorBoxRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [validErrors.length]);

  // Don't render if no valid errors
  if (validErrors.length === 0) return null;

  return (
    <ServerErrorBox
      ref={errorBoxRef}
      $display={true}
      sx={{
        mt: 1,
        mb: 2,
        maxHeight: '50px',
        overflowY: 'auto',
        p: 1,
        ...sx,
      }}
      {...props}
    >
      <List
        data-testid='server-error-list'
        sx={{
          listStyleType: 'disc',
          pl: 2,
          borderRadius: '8px',
          height: '-webkit-fill-available',
        }}
      >
        {errors?.map((item, index) => (
          <ListItem
            key={index}
            sx={{
              display: 'list-item',
              p: 0,
            }}
          >
            <ListItemText primary={<Typography variant={variant}>Error: {item}</Typography>} />
          </ListItem>
        ))}
      </List>
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
