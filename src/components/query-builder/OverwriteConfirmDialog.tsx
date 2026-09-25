// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

export interface OverwriteConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Name of the filter that would be overwritten */
  filterName: string;
  /** Callback when user confirms overwrite */
  onConfirm: () => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Callback when user chooses to change the name instead */
  onChangeName: () => void;
}

export const OverwriteConfirmDialog = ({
  open,
  filterName,
  onConfirm,
  onCancel,
  onChangeName,
}: OverwriteConfirmDialogProps) => {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Filter Already Exists</DialogTitle>
      <DialogContent>
        <DialogContentText>
          A filter named "{filterName}" already exists in this space. Do you want to overwrite it
          with the current filters, or change the name?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onChangeName} color="primary">
          Change Name
        </Button>
        <Button onClick={onConfirm} color="warning" variant="contained">
          Overwrite
        </Button>
      </DialogActions>
    </Dialog>
  );
};
