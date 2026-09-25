// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';

import type { LockHolder } from '../hooks/useForceUnlockUnits';

interface LockedUnitsDialogProps {
  open: boolean;
  holders: LockHolder[];
  onRetry: () => void;
  onForceUnlock: () => void;
  onClose: () => void;
}

export const LockedUnitsDialog = ({
  open,
  holders,
  onRetry,
  onForceUnlock,
  onClose,
}: LockedUnitsDialogProps) => {
  const canForce = holders.some((h) => h.isInitiativeOwned);
  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Units are locked by another ChangeSet</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ mb: 2 }}>
          Retry to wait for the other ChangeSet to close. Force unlock is only available for
          initiative-owned ChangeSets — manual or non-initiative ChangeSets must be closed by the
          user who opened them.
        </Typography>
        <List dense>
          {holders.map((h) => (
            <ListItem key={h.unitId} divider>
              <ListItemText
                primary={h.changeSetSlug || h.changeSetId}
                secondary={
                  h.isInitiativeOwned
                    ? `Unit ${h.unitId} — initiative-owned (opened ${h.createdAt ?? 'unknown'})`
                    : `Unit ${h.unitId} — non-initiative ChangeSet`
                }
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onRetry}>Retry</Button>
        <Button
          onClick={onForceUnlock}
          color='warning'
          variant='contained'
          disabled={!canForce}
        >
          Force unlock
        </Button>
      </DialogActions>
    </Dialog>
  );
};
