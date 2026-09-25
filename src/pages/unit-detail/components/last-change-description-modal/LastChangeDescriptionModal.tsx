// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Controller, useForm } from 'react-hook-form';

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import Typography from '@mui/material/Typography';

interface ILastChangeDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (lastChangeDescription: string) => void;
}

export const LastChangeDescriptionModal = ({
  isOpen,
  onClose,
  onSubmit,
}: ILastChangeDescriptionModalProps) => {
  const { control, handleSubmit } = useForm<{ lastChangeDescription?: string }>({
    defaultValues: {
      lastChangeDescription: '',
    },
  });

  const handleFormSubmit = (data: { lastChangeDescription?: string }) => {
    onSubmit(data?.lastChangeDescription || '');
    onClose(); // Close the modal after submission
  };

  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>Change Description</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ marginBottom: 2 }}>
          Add a comment to describe the changes you made.
        </Typography>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Controller
            name='lastChangeDescription'
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                multiline
                rows={4}
                label='Change Description'
                placeholder='I changed Foo to Bar because...'
                variant='filled'
              />
            )}
          />
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color='primary'>
          Cancel
        </Button>
        <Button onClick={handleSubmit(handleFormSubmit)} color='primary' variant='contained'>
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
};
