// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

import { componentTheme } from './componentTheme';
import type { PendingWaveAction } from './useWaveActions';

const TITLE_ID = 'wave-action-title';
const BODY_ID = 'wave-action-body';

const deploymentsWord = (n: number) => (n === 1 ? 'Deployment' : 'Deployments');

function copyOf(action: PendingWaveAction): {
  count: number;
  title: string;
  body: string;
  /** Wave members the action leaves out, and why; null when it covers all of them. */
  leftOut: string | null;
  confirm: string;
} {
  const base = action.baseName;
  if (action.kind === 'upgrade') {
    const n = action.plan.spaceIds.length;
    const missing = action.waveCount - n;
    return {
      count: n,
      title: `Upgrade ${n} ${deploymentsWord(n)}?`,
      body:
        n > 0
          ? `Merges the newest ${base} changes into the upgradable Units of ${n} ${deploymentsWord(n)} under ${base}. Local overrides are kept.`
          : `No Unit under ${base} has a newer ${base} change to merge now. The Units may still be loading.`,
      leftOut:
        n > 0 && missing > 0
          ? `${missing} of the ${action.waveCount} Stale ${deploymentsWord(action.waveCount)} have no Unit that can be upgraded now and are left out.`
          : null,
      confirm: `Upgrade ${n}`,
    };
  }
  const n = action.spaceIds.length;
  const missing = action.waveCount - n;
  return {
    count: n,
    title: `Release ${n} ${deploymentsWord(n)}?`,
    body:
      n > 0
        ? `Publishes the head Revisions of ${n} ${deploymentsWord(n)} under ${base} to their release Targets.`
        : `No Deployment of this wave under ${base} has a release Target to publish to.`,
    leftOut:
      n > 0 && missing > 0
        ? `${missing} of the ${action.waveCount} have no release Target and are left out.`
        : null,
    confirm: `Release ${n}`,
  };
}

interface WaveActionDialogProps {
  pending: PendingWaveAction | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirms a wave's bulk action. One click on a fold header can change tens
 * of Deployments, so the dialog says how many, under which Base, and what
 * happens to them before anything is sent. Escape and a click outside cancel.
 */
export function WaveActionDialog({ pending, onConfirm, onCancel }: WaveActionDialogProps) {
  // The last action stays in the dialog while it closes, so the text does not
  // vanish during the fade.
  const [shown, setShown] = useState(pending);
  if (pending !== null && pending !== shown) setShown(pending);
  const copy = shown ? copyOf(shown) : null;
  return (
    <Dialog
      open={pending !== null}
      onClose={onCancel}
      maxWidth='xs'
      fullWidth
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
      data-testid='wave-action-dialog'
    >
      {copy && (
        <>
          <DialogTitle
            id={TITLE_ID}
            sx={{ fontSize: 16, fontWeight: 600, color: componentTheme.fgDefault }}
          >
            {copy.title}
          </DialogTitle>
          <DialogContent>
            <DialogContentText
              id={BODY_ID}
              sx={{ fontSize: 14, color: componentTheme.fgMuted }}
            >
              {copy.body}
            </DialogContentText>
            {copy.leftOut && (
              <DialogContentText sx={{ mt: 1, fontSize: 13, color: componentTheme.fgSubtle }}>
                {copy.leftOut}
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onCancel} sx={{ textTransform: 'none' }}>
              {copy.count > 0 ? 'Cancel' : 'Close'}
            </Button>
            {copy.count > 0 && (
              <Button
                variant='contained'
                color='primary'
                onClick={onConfirm}
                disableElevation
                sx={{ textTransform: 'none' }}
                data-testid='wave-action-confirm'
              >
                {copy.confirm}
              </Button>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
