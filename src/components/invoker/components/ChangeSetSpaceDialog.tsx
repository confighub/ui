// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';

import type { ChangeSetSpace } from '../utils/triggerChangeSet';

/**
 * Asks which Space a run for a Trigger makes its ChangeSet in, when the Units it writes are in
 * several Spaces and no one Space is theirs.
 */
export const ChangeSetSpaceDialog = ({
  choices,
  triggerRef,
  onChoose,
}: {
  /** The Spaces to choose from; none closes the dialog */
  choices: readonly ChangeSetSpace[] | undefined;
  triggerRef: string;
  /** The Space chosen, or undefined when the run is cancelled */
  onChoose: (spaceId: string | undefined) => void;
}) => (
  <Dialog open={choices !== undefined} onClose={() => onChoose(undefined)} maxWidth='xs' fullWidth data-testid='change-set-space-dialog'>
    <DialogTitle>Where should the ChangeSet be?</DialogTitle>
    <DialogContent>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
        The Units are in several Spaces. The change is made in a ChangeSet for{' '}
        <code>{triggerRef}</code>, which is kept in one of them and left open for review.
      </Typography>
      <List dense>
        {(choices ?? []).map((space) => (
          <ListItemButton key={space.spaceId} onClick={() => onChoose(space.spaceId)}>
            <ListItemText primary={space.slug} />
          </ListItemButton>
        ))}
      </List>
    </DialogContent>
    <DialogActions>
      <Button onClick={() => onChoose(undefined)}>Cancel</Button>
    </DialogActions>
  </Dialog>
);
