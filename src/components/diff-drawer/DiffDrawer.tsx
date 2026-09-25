// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import SwapVertIcon from '@mui/icons-material/SwapVert';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Fade from '@mui/material/Fade';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useTheme from '@mui/material/styles/useTheme';
import { Box } from '@mui/system';

import { DiffEditor } from '../diff-editor/DiffEditor';
import { Ellipses } from '../styled';

export interface DiffDrawerProps {
  isDiffDrawerOpen: boolean;
  onDiffDrawerClosed: () => void;
  fromData: string;
  toData: string;
  diffFromMessage: string;
  diffToMessage: string;
  canRestoreDiff?: boolean;
  onDiffConfirmed?: () => void;
  confirmationTooltip?: string;
  diffFromMessagePrefix?: string;
  defaultShowConfirmation?: boolean;
}

export const DiffDrawer = ({
  isDiffDrawerOpen,
  onDiffDrawerClosed,
  fromData,
  toData,
  diffFromMessage,
  diffToMessage,
  canRestoreDiff = true,
  onDiffConfirmed,
  confirmationTooltip = 'Select to restore the revision',
  diffFromMessagePrefix = 'Restore from',
  defaultShowConfirmation = false,
}: DiffDrawerProps) => {
  const [showConfirmation, setShowConfirmation] = useState(defaultShowConfirmation);
  const theme = useTheme();

  useEffect(() => {
    if (isDiffDrawerOpen) {
      setShowConfirmation(defaultShowConfirmation);
    }
  }, [isDiffDrawerOpen, defaultShowConfirmation]);

  const onConfirm = async () => {
    onDiffConfirmed?.();
  };

  return (
    <Drawer
      anchor='right'
      open={isDiffDrawerOpen}
      onClose={() => {
        onDiffDrawerClosed();
      }}
      PaperProps={{
        sx: {
          width: '50%',
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          bgcolor: theme.palette.background.paper,
          p: 2,
        }}
      >
        <Typography variant='h5' sx={{ fontWeight: 'bold' }} color='text.primary'>
          Diff
        </Typography>
        {canRestoreDiff ? (
          <Tooltip title={confirmationTooltip} arrow placement='bottom-start'>
            <Stack
              direction={'row'}
              spacing={1}
              sx={{ cursor: 'pointer' }}
              onClick={() => setShowConfirmation((prev) => !prev)}
            >
              <SwapVertIcon />
              <Typography variant='body1'>{diffFromMessagePrefix}</Typography>
              <Ellipses variant='body1' color='primary'>
                {diffFromMessage}
              </Ellipses>
              <Typography variant='body1'>to</Typography>
              <Ellipses variant='body1' color='primary'>
                {diffToMessage}
              </Ellipses>
            </Stack>
          </Tooltip>
        ) : (
          <Stack direction='row' spacing={1}>
            <SwapVertIcon />
            <Typography variant='body1'>From</Typography>
            <Typography sx={{ fontStyle: 'italic' }} variant='body1' color='primary'>
              {diffFromMessage}
            </Typography>
            <Typography variant='body1'>to</Typography>
            <Typography sx={{ fontStyle: 'italic' }} variant='body1' color='primary'>
              {diffToMessage}
            </Typography>
          </Stack>
        )}
        <Fade in={showConfirmation}>
          <Button variant='text' onClick={onConfirm}>
            Confirm
          </Button>
        </Fade>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100% - 64px)',
        }}
      >
        <Box
          sx={{
            flex: 1,
            bgcolor: theme.palette.background.paper,
            overflow: 'hidden',
            boxShadow: `0 2px 4px ${theme.palette.grey[200]}`,
          }}
        >
          <DiffEditor
            modifiedContent={toData}
            originalContent={fromData}
            language='yaml'
          />
        </Box>
      </Box>
    </Drawer>
  );
};
