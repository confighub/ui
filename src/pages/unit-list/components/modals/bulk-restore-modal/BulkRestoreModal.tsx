// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { ErrorList } from '@/components/error-list/ErrorList';
import { HoverCard } from '@/components/styled';
import { useAppDispatch } from '@/hooks/useApp';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { useBulkPatchUnitsMutation } from '@confighub/rtk-query';
import { setAlert } from '@/state/slices/alert';
import { IUnitMutationModalProps } from '@/types';
import { Revision } from '@/types';
import { RevisionType } from '@/types/enums';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';

export const BulkRestoreModal = ({
  onClose,
  unitsToEdit = [],
  isOpen = false,
  refresh,
}: IUnitMutationModalProps) => {
  const [errorMessage, setErrorMessage] = useState<string[]>([]);
  const [bulkPatchUnits, { error, isSuccess, data }] = useBulkPatchUnitsMutation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restore, setRestore] = useState<Revision>(RevisionType.LastReleasedRevisionNum);
  const dispatch = useAppDispatch();

  const handleClose = () => {
    setErrorMessage([]);
    setRestore(RevisionType.LastReleasedRevisionNum);
    onClose();
  };

  useBulkApiErrorMessage(error, isSuccess, data, setErrorMessage, {
    onSuccess: () => {
      refresh?.();
      handleClose();
      dispatch(
        setAlert({
          type: 'success',
          message: 'Restore applied successfully to selected units.',
          isOpen: true,
        }),
      );
    },
  });

  const handleRestore = async () => {
    if (!restore || unitsToEdit.length === 0) return;

    setIsSubmitting(true);

    try {
      const unitIds = unitsToEdit.map((unit) => `'${unit.UnitID}'`).join(',');
      const where = `UnitID IN (${unitIds})`;

      await bulkPatchUnits({
        where,
        restore,
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify({}),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth='sm'
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.12)',
          },
        },
      }}
    >
      <DialogTitle>
        <Typography variant='h6' fontWeight={600}>
          Restore Units
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 2 }}>
        <ErrorList errors={errorMessage} onClose={() => setErrorMessage([])} />
        <RadioGroup
          value={restore}
          onChange={(e) => setRestore(e.target.value as RevisionType)}
        >
          <HoverCard
            variant='outlined'
            onClick={() => !isSubmitting && setRestore(RevisionType.LastReleasedRevisionNum)}
            sx={{ mt: 0.5 }}
            $enableHover
          >
            <FormControlLabel
              value={RevisionType.LastReleasedRevisionNum}
              control={<Radio size='small' sx={{ p: 0, mr: 1.5 }} />}
              label={
                <Box>
                  <Typography variant='body2' fontWeight={600} gutterBottom>
                    Last Released Revision
                  </Typography>
                  <Typography variant='caption' color='text.secondary' display='block'>
                    Rollback to the most recently published revision (last known good state)
                  </Typography>
                </Box>
              }
              disabled={isSubmitting}
              sx={{ width: '100%', m: 0 }}
            />
          </HoverCard>

          <HoverCard
            variant='outlined'
            onClick={() => !isSubmitting && setRestore(RevisionType.HeadRevisionNum)}
            $enableHover
          >
            <FormControlLabel
              value={RevisionType.HeadRevisionNum}
              control={<Radio size='small' sx={{ p: 0, mr: 1.5 }} />}
              label={
                <Box>
                  <Typography variant='body2' fontWeight={600} gutterBottom>
                    Head Revision
                  </Typography>
                  <Typography variant='caption' color='text.secondary' display='block'>
                    Restore to the current head revision (latest change)
                  </Typography>
                </Box>
              }
              disabled={isSubmitting}
              sx={{ width: '100%', m: 0 }}
            />
          </HoverCard>
        </RadioGroup>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting} variant='outlined'>
          Cancel
        </Button>
        <Button
          onClick={handleRestore}
          variant='contained'
          disabled={isSubmitting || unitsToEdit.length === 0}
        >
          {isSubmitting ? 'Restoring...' : 'Restore'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
