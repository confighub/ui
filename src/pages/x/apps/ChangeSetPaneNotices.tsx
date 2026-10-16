// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

import { changeSetLabel, isChangeSetOpenHere, type DeploymentChangeSet } from './changeSets';
import { componentTheme } from './componentTheme';
import type { ComponentDeployment } from './componentTypes';
import { useOpenChangeSets } from './useOpenChangeSets';

const noticeSx = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  mx: 1,
  mt: '6px',
  mb: '2px',
  px: '10px',
  py: '7px',
  borderRadius: '7px',
  border: `1px solid ${componentTheme.upgradeEdge}`,
  background: componentTheme.bgSubtle,
  fontSize: 11,
  fontFamily: componentTheme.fontSans,
  color: componentTheme.fgMuted,
} as const;

const noticeButtonSx = {
  textTransform: 'none',
  fontWeight: 600,
  fontSize: 12,
  flexShrink: 0,
  color: componentTheme.upgrade,
  px: 1,
  py: 0,
  minWidth: 0,
} as const;

interface ChangeSetCloseBarProps {
  deployment: ComponentDeployment;
  /** Closes the ChangeSet on every unit it is open on; resolves true on success. */
  onCloseChangeSet: (changeSetId: string) => Promise<boolean>;
}

/**
 * The ChangeSet filter's way out of an open ChangeSet: one row per ChangeSet
 * open on the Deployment's units, with a Close button. Closing is what lets
 * the change be promoted: a Deployment downstream cannot take a Revision from
 * the middle of an open ChangeSet.
 */
export const ChangeSetCloseBar = ({ deployment, onCloseChangeSet }: ChangeSetCloseBarProps) => {
  const [confirming, setConfirming] = useState<DeploymentChangeSet | null>(null);
  const open = (deployment.changeSets ?? []).filter(isChangeSetOpenHere);
  if (open.length === 0) return null;
  return (
    <>
      {open.map((cs) => (
        <Box key={cs.changeSetId} sx={noticeSx} data-testid='component-changeset-open-bar'>
          <Box component='span' sx={{ flex: 1, lineHeight: 1.4 }}>
            ChangeSet{' '}
            <Box component='span' sx={{ fontFamily: componentTheme.fontMono, color: componentTheme.fgDefault }}>
              {changeSetLabel(cs, deployment.slug)}
            </Box>{' '}
            is open on {cs.openUnitIds.length} unit{cs.openUnitIds.length === 1 ? '' : 's'} here. Close it when the change is
            complete, so it can be promoted.
          </Box>
          <Button
            size='small'
            variant='text'
            data-testid='component-changeset-close-button'
            onClick={() => setConfirming(cs)}
            sx={noticeButtonSx}
          >
            Close ChangeSet
          </Button>
        </Box>
      ))}
      {confirming && (
        <CloseChangeSetDialog
          entry={confirming}
          deploymentSlug={deployment.slug}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            const ok = await onCloseChangeSet(confirming.changeSetId);
            if (ok) setConfirming(null);
            return ok;
          }}
        />
      )}
    </>
  );
};

interface CloseChangeSetDialogProps {
  entry: DeploymentChangeSet;
  deploymentSlug: string;
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}

const CloseChangeSetDialog = ({ entry, deploymentSlug, onCancel, onConfirm }: CloseChangeSetDialogProps) => {
  const [closing, setClosing] = useState(false);
  // Mounted only while confirming, so the fleet-wide read is made only then.
  const openChangeSets = useOpenChangeSets();
  const otherSpaces = Math.max(0, (openChangeSets.get(entry.changeSetId)?.spaceIds.size ?? 1) - 1);
  const here = entry.openUnitIds.length;
  return (
    <Dialog open onClose={() => !closing && onCancel()} maxWidth='xs' fullWidth>
      <DialogTitle sx={{ fontSize: 16 }}>Close ChangeSet {changeSetLabel(entry, deploymentSlug)}?</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, mb: 1 }}>
          It is open on {here} unit{here === 1 ? '' : 's'} here
          {otherSpaces > 0 ? `, and on units in ${otherSpaces} other Space${otherSpaces === 1 ? '' : 's'}` : ''}. Closing it
          takes all of them out of it and marks where it ends.
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          Its change can then be promoted to the variants downstream. Changes made to these units afterwards are not
          part of it.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button size='small' onClick={onCancel} disabled={closing}>
          Cancel
        </Button>
        <Button
          size='small'
          variant='contained'
          data-testid='component-changeset-close-confirm'
          disabled={closing}
          onClick={async () => {
            setClosing(true);
            const ok = await onConfirm();
            if (!ok) setClosing(false);
          }}
        >
          {closing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : 'Close ChangeSet'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface ChangeSetWaitNoticeProps {
  deployment: ComponentDeployment;
  deployments: readonly ComponentDeployment[];
  /** Opens a Deployment on the ChangeSet filter. */
  onOpenChangeSet?: (deploymentId: string) => void;
}

/**
 * Why a Deployment behind its upstream offers no upgrade: the upstream is
 * partway through a ChangeSet, and nothing can be taken from it until the
 * ChangeSet closes. Links to the upstream's ChangeSet, where it can be closed.
 */
export const ChangeSetWaitNotice = ({ deployment, deployments, onOpenChangeSet }: ChangeSetWaitNoticeProps) => {
  const waiting = deployment.waitingOnChangeSets ?? [];
  if (waiting.length === 0) return null;
  return (
    <>
      {waiting.map((w) => {
        const upstream = deployments.find((d) => d.deploymentId === w.upstreamDeploymentId);
        return (
          <Box key={w.changeSetId} sx={noticeSx} data-testid='component-changeset-wait-notice'>
            <Box component='span' sx={{ flex: 1, lineHeight: 1.4 }}>
              Incoming changes wait for ChangeSet{' '}
              <Box component='span' sx={{ fontFamily: componentTheme.fontMono, color: componentTheme.fgDefault }}>
                {w.label}
              </Box>
              {upstream ? ` on ${upstream.displayName}` : ''} to close: a variant cannot take a change that is still being
              made.
            </Box>
            {upstream && onOpenChangeSet && (
              <Button
                size='small'
                variant='text'
                data-testid='component-changeset-wait-review'
                onClick={() => onOpenChangeSet(upstream.deploymentId)}
                sx={noticeButtonSx}
              >
                Review ChangeSet
              </Button>
            )}
          </Box>
        );
      })}
    </>
  );
};
