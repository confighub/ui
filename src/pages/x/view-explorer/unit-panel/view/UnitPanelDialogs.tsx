// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type KeyboardEvent, useMemo } from 'react';

import Box from '@mui/material/Box';

import { BulkRestoreModal } from '@/pages/unit-list/components/modals/bulk-restore-modal/BulkRestoreModal';
import { BulkUpgradeModal } from '@/pages/unit-list/components/modals/bulk-upgrade-modal/BulkUpgradeModal';

import type { UpgradePreviewRequest } from '../upgrade-preview';
import { DiffDialog } from './DiffDialog';
import type { PanelDialog, PanelDialogActions } from './types';
import { UpgradePreviewDialog } from './UpgradePreviewDialog';

/**
 * The panel's dialogs, drawn on every tab, so a key that opens one from the
 * Resources tab shows it too. Each is mounted only while open: closing removes
 * it and its backdrop in the same commit, and MUI gives focus back to what
 * opened it. The dialogs are portalled out of the panel, but their keys still
 * reach the panel's handler through React, which ignores them (`fromPanel`).
 * The page's own `f` listens on the document, so `f` stops here.
 */
export function UnitPanelDialogs({ dialog, actions, upgrade }: { dialog: PanelDialog | null; actions: PanelDialogActions; upgrade: UpgradePreviewRequest | null }) {
  const units = useMemo(() => (dialog?.kind === 'upgrade' || dialog?.kind === 'restore' ? [dialog.unit] : []), [dialog]);
  if (!dialog) return null;
  let content: JSX.Element;
  switch (dialog.kind) {
    case 'diff':
      content = <DiffDialog request={dialog.request} onClose={actions.close} />;
      break;
    case 'preview':
      content = (
        <UpgradePreviewDialog
          request={dialog.request}
          current={upgrade}
          onClose={actions.close}
          onUpgrade={actions.confirmUpgrade}
          onPreviewAgain={actions.previewAgain}
        />
      );
      break;
    case 'upgrade':
      content = <BulkUpgradeModal isOpen onClose={actions.close} unitsToEdit={units} refresh={actions.written} />;
      break;
    case 'restore':
      content = <BulkRestoreModal isOpen onClose={actions.close} unitsToEdit={units} refresh={actions.written} />;
      break;
  }
  return (
    <Box component='span' sx={{ display: 'contents' }} onKeyDown={stopFunctionsKey}>
      {content}
    </Box>
  );
}

/** `f` typed in a dialog is the dialog's, not the page's Functions toggle behind it. */
function stopFunctionsKey(e: KeyboardEvent) {
  if (e.key.toLowerCase() === 'f') e.nativeEvent.stopPropagation();
}
