// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { SxProps, Theme } from '@mui/material/styles';

/**
 * Marks a hidden entity, on a line of its own under its name, in a list whose columns are fixed
 * so that no Hidden reason column can be chosen. Renders nothing for an entity that is not
 * hidden.
 */
export const HiddenReasonTag = ({
  reason,
  sx,
}: {
  reason: string | null | undefined;
  sx?: SxProps<Theme>;
}) =>
  reason ? (
    <Box
      component='span'
      sx={[{ display: 'block', mt: '2px' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Tooltip arrow title='Hidden, for this reason'>
        <Chip size='small' variant='outlined' label={reason} data-testid='hidden-reason-tag' />
      </Tooltip>
    </Box>
  ) : null;
