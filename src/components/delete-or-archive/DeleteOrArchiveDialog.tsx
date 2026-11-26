// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';

/**
 * A delete either archives, keeping the entity hidden so that it can be unarchived, or deletes it
 * permanently. Archive is the choice a delete dialog starts with; the API's default stays a
 * permanent delete, so every delete this dialog confirms passes `archive` explicitly.
 */
export type DeleteChoice = 'archive' | 'delete';

export function DeleteOrArchiveChoice({
  value,
  onChange,
  disabled,
}: {
  value: DeleteChoice;
  onChange: (choice: DeleteChoice) => void;
  disabled?: boolean;
}) {
  const option = (choice: DeleteChoice, label: string, detail: string) => (
    <FormControlLabel
      value={choice}
      disabled={disabled}
      control={<Radio size='small' sx={{ pt: 0.25 }} />}
      sx={{ alignItems: 'flex-start', mb: 0.75 }}
      label={
        <Box>
          <Typography variant='subtitle1'>{label}</Typography>
          <Typography variant='body2' color='text.secondary'>
            {detail}
          </Typography>
        </Box>
      }
    />
  );
  return (
    <RadioGroup
      value={value}
      onChange={(e) => onChange(e.target.value as DeleteChoice)}
      data-testid='delete-or-archive-choice'
    >
      {option('archive', 'Archive', 'Hidden from lists, and can be unarchived.')}
      {option('delete', 'Delete permanently', "Can't be undone.")}
    </RadioGroup>
  );
}

export interface DeleteOrArchiveDialogProps {
  open: boolean;
  title: string;
  /** What the dialog archives or deletes. */
  description?: ReactNode;
  onClose: () => void;
  /** Archives when archive is true, and deletes permanently otherwise. */
  onConfirm: (archive: boolean) => void | Promise<void>;
  /** A slug to type before a permanent delete. An archive, which can be undone, needs none. */
  confirmSlug?: string;
  /** The write is running. */
  busy?: boolean;
  /** Why the last attempt failed. */
  error?: string;
}

export function DeleteOrArchiveDialog(props: DeleteOrArchiveDialogProps) {
  // Mounted only while open, so that each opening starts from Archive with nothing typed.
  if (!props.open) return null;
  return <OpenDeleteOrArchiveDialog {...props} />;
}

function OpenDeleteOrArchiveDialog({
  title,
  description,
  onClose,
  onConfirm,
  confirmSlug,
  busy,
  error,
}: DeleteOrArchiveDialogProps) {
  const [choice, setChoice] = useState<DeleteChoice>('archive');
  const [typed, setTyped] = useState('');
  const archive = choice === 'archive';
  const needsTyping = !archive && !!confirmSlug && typed !== confirmSlug;

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth='xs'
      data-testid='delete-or-archive-dialog'
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {description ? (
          <Typography variant='body2' sx={{ mb: 1.5 }}>
            {description}
          </Typography>
        ) : null}
        <DeleteOrArchiveChoice value={choice} onChange={setChoice} disabled={busy} />
        {!archive && confirmSlug ? (
          <TextField
            fullWidth
            size='small'
            sx={{ mt: 1.5 }}
            label={`Type ${confirmSlug} to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-testid='delete-or-archive-confirm-input'
          />
        ) : null}
        {error ? (
          <Alert severity='error' sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant='contained'
          color={archive ? 'primary' : 'error'}
          disabled={busy || needsTyping}
          onClick={() => void onConfirm(archive)}
          data-testid='delete-or-archive-confirm'
        >
          {busy ? (
            <CircularProgress size={16} sx={{ color: 'inherit' }} />
          ) : archive ? (
            'Archive'
          ) : (
            'Delete permanently'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
