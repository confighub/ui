// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import {
  type ChangeSetRead,
  type ExtendedUnitRead,
  useBulkPatchUnitsMutation,
} from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

export interface ICloseChangeSetModalProps {
  isCloseChangeSetModalOpen: boolean;
  changeSet: ChangeSetRead;
  setErrorMessage: (message: string[]) => void;
  selectedUnits: ExtendedUnitRead[];
  onCloseChangesetModalClosed: () => void;
  onCloseChangeSet: () => void;
}

export const CloseChangeSetModal = ({
  isCloseChangeSetModalOpen,
  changeSet,
  setErrorMessage,
  selectedUnits,
  onCloseChangesetModalClosed,
  onCloseChangeSet,
}: ICloseChangeSetModalProps) => {
  const spaceID = changeSet?.SpaceID;
  const id = changeSet?.ChangeSetID;

  const [isClosing, setIsClosing] = useState(false);

  const [
    bulkPatchUnits,
    { error: bulkPatchError, isSuccess: isBulkPatchSuccess, data: bulkPatchData },
  ] = useBulkPatchUnitsMutation();

  useBulkApiErrorMessage(bulkPatchError, isBulkPatchSuccess, bulkPatchData, setErrorMessage);

  const handleCloseChangeset = async () => {
    if (!spaceID || selectedUnits.length === 0) return;

    setIsClosing(true);

    try {
      // Patch all units to remove the changeset ID (pass empty string to remove)
      const unitIds = selectedUnits.map((u) => `'${u.Unit?.UnitID}'`).join(',');
      await bulkPatchUnits({
        where: `UnitID IN (${unitIds})`,
        changeSetId: id, // Empty string removes the changeset (equivalent to CLI's -)
        // @ts-expect-error TODO:
        body: JSON.stringify({
          ChangeSetID: null,
        }),
      });

      onCloseChangeSet();
      onCloseChangesetModalClosed();
    } catch (error) {
      console.error('Failed to close changeset:', error);
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <Dialog
      open={isCloseChangeSetModalOpen}
      onClose={() => !isClosing && onCloseChangesetModalClosed()}
      maxWidth='sm'
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.12)',
        },
      }}
    >
      <DialogTitle
        sx={{
          pb: 1,
          pt: 3,
          px: 3,
        }}
      >
        <Typography variant='h6' fontWeight={600}>
          Close Changeset
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 2 }}>
        <Typography variant='body2' sx={{ mb: 2 }}>
          The changeset will remain in the system but will no longer be associated with any
          units. This action is typically performed when:
        </Typography>

        <Box component='ul' sx={{ pl: 3, mb: 2 }}>
          <Typography component='li' variant='body2' sx={{ mb: 0.5 }}>
            The changeset has been successfully applied
          </Typography>
          <Typography component='li' variant='body2' sx={{ mb: 0.5 }}>
            You want to archive the changeset without deleting it
          </Typography>
          <Typography component='li' variant='body2'>
            You need to free up units for a new changeset
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          gap: 1,
        }}
      >
        <Button
          onClick={() => onCloseChangesetModalClosed()}
          disabled={isClosing}
          variant='outlined'
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            fontWeight: 500,
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleCloseChangeset}
          variant='contained'
          disabled={isClosing}
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
          }}
        >
          {isClosing ? 'Closing...' : 'Close'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
