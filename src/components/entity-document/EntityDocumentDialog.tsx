// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type ReactNode, useState } from 'react';

import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { getApiErrorMessage } from '@/utility/error-functions';
import type { EntityDocument, EntityDocumentEdit } from '@confighub/rtk-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

export interface EntityDocumentDialogProps {
  title: string;
  /** What the document holds, under the title. */
  description: ReactNode;
  /** The entity's document as read, with the Version it was read at. */
  document: EntityDocument | undefined;
  /** The error from reading it, if the read failed. */
  readError?: unknown;
  /** Writes the edit; resolves once the server has taken it. */
  onSave: (edit: EntityDocumentEdit) => Promise<unknown>;
  isSaving?: boolean;
  onClose: () => void;
  /** Prefixes the editor's and the Save button's test ids, as `<testId>-editor` and `<testId>-save`. */
  testId: string;
}

/**
 * An entity's document -- the fields a write can set, with the entities it refers to named -- in a
 * YAML editor, the same document `cub <entity> edit` opens. Saving sends the document as read
 * with the edit, so a change someone made meanwhile is refused rather than overwritten.
 */
export function EntityDocumentDialog({
  title,
  description,
  document,
  readError,
  onSave,
  isSaving = false,
  onClose,
  testId,
}: EntityDocumentDialogProps) {
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const base = document?.Document;
  const text = draft ?? base ?? '';

  const submit = async () => {
    if (base === undefined || document === undefined) return;
    setError(undefined);
    try {
      await onSave({ Base: base, Document: text, Version: document.Version });
      onClose();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'The document could not be saved.');
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth='lg'>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
          {description}
        </Typography>
        {readError ? (
          <Alert severity='error'>{getApiErrorMessage(readError) || 'The document could not be read.'}</Alert>
        ) : null}
        {base !== undefined ? (
          <Box
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px', overflow: 'hidden' }}
            data-testid={`${testId}-editor`}
          >
            <CodeEditor value={base} language='yaml' height='55vh' canEdit showMinimap={false} onCodeChanged={setDraft} />
          </Box>
        ) : (
          !readError && (
            <Typography variant='body2' color='text.secondary'>
              Loading…
            </Typography>
          )
        )}
        {error ? (
          <Alert severity='error' sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant='contained'
          onClick={() => void submit()}
          disabled={isSaving || base === undefined || draft === undefined || draft === base}
          data-testid={`${testId}-save`}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
