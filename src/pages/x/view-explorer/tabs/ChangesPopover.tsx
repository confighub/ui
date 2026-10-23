// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

interface ChangesPopoverProps {
  anchor: HTMLElement | null;
  onClose: () => void;
  /** One plain sentence per change; empty for a temporary view. */
  changes: readonly string[];
  temporary: boolean;
}

/** "What did I change?": the unsaved changes of the active view, in plain words. */
export function ChangesPopover({ anchor, onClose, changes, temporary }: ChangesPopoverProps) {
  // Mounted only while open: closing removes the modal root in the same commit. Left mounted to run its exit transition, a slow CPU can leave it in place, invisible, taking every click.
  if (!anchor) return null;
  return (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 320, p: 1.5 } } }}
    >
      <Typography
        variant='overline'
        color='text.secondary'
        component='div'
        sx={{ lineHeight: 1.6, mb: 0.5 }}
      >
        {temporary ? 'Temporary view' : 'Unsaved changes'}
      </Typography>
      <Stack component='ul' spacing={0.75} sx={{ m: 0, pl: 2 }} data-testid='vx-changes-list'>
        {temporary ? (
          <>
            <Typography component='li' variant='body2'>
              Only you can see this view. It lives in this tab and in its link.
            </Typography>
            <Typography component='li' variant='body2'>
              Save it to share it with your organization.
            </Typography>
          </>
        ) : (
          changes.map((c) => (
            <Typography key={c} component='li' variant='body2'>
              {c}
            </Typography>
          ))
        )}
      </Stack>
    </Popover>
  );
}
