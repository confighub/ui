// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { DeleteOrArchiveDialog } from '@/components/delete-or-archive/DeleteOrArchiveDialog';

interface DeleteConfirmDialogProps {
  open: boolean;
  viewName: string;
  /** Archives when archive is true, and deletes permanently otherwise. */
  onConfirm: (archive: boolean) => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  open,
  viewName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  // DeleteOrArchiveDialog is mounted only while open: closing removes the dialog and its backdrop
  // in the same commit, so a slow exit transition cannot leave an invisible backdrop taking clicks.
  return (
    <DeleteOrArchiveDialog
      open={open}
      title='Delete View'
      description={
        <>
          Archive or permanently delete <strong>{viewName}</strong>?
        </>
      }
      onConfirm={onConfirm}
      onClose={onCancel}
    />
  );
}
