// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { ErrorList } from '@/components/error-list/ErrorList';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { useBulkDeleteUnitsMutation } from '@confighub/rtk-query';
import { IUnitMutationModalProps } from '@/types';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export const BulkDeleteModal = ({
  onClose,
  unitsToEdit = [],
  isOpen = false,
  refresh,
}: IUnitMutationModalProps) => {
  const [errorMessage, setErrorMessage] = useState<string[]>([]);
  const [bulkDeleteUnits, { error, isSuccess, data }] = useBulkDeleteUnitsMutation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setErrorMessage([]);
    onClose();
  };

  useBulkApiErrorMessage(error, isSuccess, data, setErrorMessage, {
    onSuccess: () => {
      refresh?.();
      handleClose();
    },
  });

  const handleDelete = async () => {
    setIsSubmitting(true);

    try {
      const unitIds = unitsToEdit.map((unit) => `'${unit.UnitID}'`).join(',');
      const where = `UnitID IN (${unitIds})`;

      await bulkDeleteUnits({ where });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        <Stack direction='row' alignItems='center' spacing={1}>
          <Typography variant='h6' component='span' sx={{ fontWeight: 600 }}>
            Confirm Bulk Delete
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <ErrorList errors={errorMessage} onClose={() => setErrorMessage([])} />

        <Stack spacing={2}>
          <Typography variant='body2' color='text.secondary'>
            This will permanently delete{' '}
            <Typography
              component='span'
              variant='body2'
              sx={{ fontWeight: 600 }}
              color='error'
            >
              {unitsToEdit.length} {unitsToEdit.length === 1 ? 'unit' : 'units'}
            </Typography>
            . This action cannot be undone.
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting} color='inherit'>
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          variant='contained'
          color='error'
          disabled={isSubmitting || unitsToEdit.length === 0}
        >
          {isSubmitting ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
