// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

import { IUnitMutationModalProps } from '../../types';

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onSubmit,
  modalTitleText,
  modalDescriptionText,
}: IUnitMutationModalProps) => {
  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{modalTitleText}</DialogTitle>
      <DialogContent>
        <Typography>{modalDescriptionText}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant='outlined'>
          Cancel
        </Button>
        <Button onClick={() => onSubmit?.()} color='primary' variant='contained'>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
};
