// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  type TagRead,
  type UnitRead,
  useBulkTagUnitsMutation,
} from '@confighub/rtk-query';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export interface RemoveTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: UnitRead;
  tag: TagRead;
  setErrorMessage: (message: string) => void;
  onRefresh?: () => void;
}

/**
 * Modal for confirming tag removal from a unit.
 */
export const RemoveTagModal = ({
  isOpen,
  onClose,
  unit,
  tag,
  setErrorMessage,
  onRefresh,
}: RemoveTagModalProps) => {
  const [isRemoving, setIsRemoving] = useState(false);

  const spaceID = unit?.SpaceID || '';
  const unitId = unit?.UnitID || '';
  const tagId = tag?.TagID || '';
  const tagName = tag?.DisplayName || tag?.Slug || 'this tag';

  const [removeTag, { error, isSuccess }] = useBulkTagUnitsMutation();

  useApiErrorMessage(error, isSuccess, setErrorMessage);

  const handleClose = () => {
    if (isRemoving) return;
    onClose();
  };

  const handleRemoveTag = async () => {
    if (!spaceID || !unitId || !tagId) return;

    try {
      setIsRemoving(true);

      const result = await removeTag({
        where: `UnitID = '${unitId}' AND SpaceID = '${spaceID}'`,
        unitTagRequest: {
          TagID: tagId,
          Revision: 'Remove',
        },
      });

      // Check for errors in the response
      if ('data' in result && result.data) {
        const errorItem = result.data.find((item) => item.Error);
        if (errorItem?.Error?.Message) {
          setErrorMessage(errorItem.Error.Message);
          return;
        }
      }

      if ('error' in result) {
        return;
      }

      onRefresh?.();
      onClose();
    } catch (err) {
      console.error('Failed to remove tag:', err);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth='xs'
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
        <Stack direction='row' alignItems='center'>
          <Typography variant='h6'>Remove Tag</Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Typography variant='body1'>
          Are you sure you want to remove the tag <strong>&quot;{tagName}&quot;</strong> from
          this unit?
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isRemoving} variant='outlined'>
          Cancel
        </Button>
        <Button onClick={handleRemoveTag} variant='contained' disabled={isRemoving}>
          {isRemoving ? 'Removing...' : 'Remove Tag'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
