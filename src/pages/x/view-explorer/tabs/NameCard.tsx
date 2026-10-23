// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { SYSTEM_SPACE_SLUG } from '../queries/useViews';

const Kbd = styled('kbd')(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  fontSize: 10.5,
  fontWeight: 600,
  lineHeight: 1,
  padding: '2px 4px',
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  borderBottomWidth: 2,
  color: theme.palette.text.secondary,
  backgroundColor: theme.palette.background.paper,
}));

interface NameCardProps {
  anchor: HTMLElement | null;
  busy: boolean;
  /** Set when the view has no filters: it would show every row of this entity. */
  unfilteredEntity: 'Unit' | 'Space' | 'Resource' | null;
  onSave: () => void;
}

/**
 * Shown under a temporary tab while its name is asked for. Saving shares the
 * view with the whole organization, so it says so before anything is written.
 * The name itself is typed in the tab; Enter saves, Esc keeps it temporary.
 */
const EVERY: Record<'Unit' | 'Space' | 'Resource', string> = { Unit: 'unit', Space: 'space', Resource: 'resource' };

export function NameCard({ anchor, busy, unfilteredEntity, onSave }: NameCardProps) {
  return (
    <Popper open={!!anchor} anchorEl={anchor} placement='bottom-start' sx={{ zIndex: (t) => t.zIndex.modal }}>
      <Paper data-testid='vx-name-card' elevation={3} sx={{ mt: 0.75, p: 1.5, width: 320 }}>
        <Typography variant='body2' color='text.secondary'>
          <Typography component='span' variant='body2' fontWeight={700} color='text.primary'>
            Name this view to save it.
          </Typography>{' '}
          It will be shared with your organization in{' '}
          <Typography component='span' variant='body2' fontWeight={700} color='text.primary'>
            {SYSTEM_SPACE_SLUG}
          </Typography>
          , and pinned to your tabs.
        </Typography>
        {unfilteredEntity && (
          <Typography variant='body2' color='text.disabled' sx={{ mt: 0.75 }} data-testid='vx-name-card-unfiltered'>
            It has no filters yet, so it shows every {EVERY[unfilteredEntity]}.
          </Typography>
        )}
        <Stack direction='row' alignItems='center' spacing={0.75} sx={{ mt: 1.25, color: 'text.secondary' }}>
          <Kbd>Enter</Kbd>
          <Typography variant='body2' fontSize={11.5}>save</Typography>
          <Kbd>Esc</Kbd>
          <Typography variant='body2' fontSize={11.5}>keep as temporary</Typography>
          <Button
            size='small'
            variant='contained'
            sx={{ ml: 'auto !important' }}
            disabled={busy}
            // Keep focus in the name field, so a blur does not cancel first.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSave}
          >
            Save view
          </Button>
        </Stack>
      </Paper>
    </Popper>
  );
}
