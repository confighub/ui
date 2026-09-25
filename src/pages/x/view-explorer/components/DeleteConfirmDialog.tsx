// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

interface DeleteConfirmDialogProps {
  open: boolean;
  viewName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ open, viewName, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth='xs'>
      <DialogTitle>Delete View</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete <strong>{viewName}</strong>? This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} size='small'>Cancel</Button>
        <Button onClick={onConfirm} color='error' variant='contained' size='small'>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}
