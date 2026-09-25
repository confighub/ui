// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { ErrorList } from '@/components/error-list/ErrorList';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { useBulkPatchUnitsMutation } from '@confighub/rtk-query';
import { IUnitMutationModalProps } from '@/types';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export const BulkUpgradeModal = ({
  onClose,
  unitsToEdit = [],
  isOpen = false,
  refresh,
}: IUnitMutationModalProps) => {
  const [errorMessage, setErrorMessage] = useState<string[]>([]);
  const [bulkPatchUnits, { error, isSuccess, data }] = useBulkPatchUnitsMutation();
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

  const handleUpgrade = async () => {
    setIsSubmitting(true);

    try {
      const unitIds = unitsToEdit.map((unit) => `'${unit.UnitID}'`).join(',');
      const where = `UnitID IN (${unitIds})`;

      await bulkPatchUnits({
        upgrade: true,
        where,
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify({}),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        <Stack direction='row' alignItems='center'>
          <Typography variant='h6' component='span' sx={{ fontWeight: 600 }}>
            Confirm Bulk Upgrade
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <ErrorList errors={errorMessage} onClose={() => setErrorMessage([])} />

        <Stack spacing={2}>
          <Typography variant='body2' color='text.secondary'>
            This operation will synchronize the selected units to match their upstream units'
            latest configurations. Each unit will be updated to reflect the current state of
            its upstream source.
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting} color='inherit'>
          Cancel
        </Button>
        <Button
          onClick={handleUpgrade}
          variant='contained'
          disabled={isSubmitting || unitsToEdit.length === 0}
        >
          {isSubmitting ? 'Upgrading...' : 'Upgrade'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
