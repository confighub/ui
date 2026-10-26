// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

import { useGetUnitDiffQuery } from '@confighub/rtk-query';

import { ConfigDiffView } from '@/components/config-diff/ConfigDiffView';
import { summarizeConfigDiff } from '@/components/config-diff/configDiffTree';

import { DIFF } from '../copy';
import { DIALOG_PAPER, PANEL_DIFF_COLUMNS, panelResourceLabel } from './diff-layout';
import type { UnitDiffRequest } from './types';

/** A read that failed, with the button that asks again. */
export function ReadError({ text, retry, onRetry, testId }: { text: string; retry: string; onRetry: () => void; testId: string }) {
  return (
    <Alert
      severity='error'
      data-testid={testId}
      action={
        <Button size='small' color='inherit' onClick={onRetry}>
          {retry}
        </Button>
      }
    >
      {text}
    </Alert>
  );
}

export function ReadLoading({ text, testId }: { text: string; testId: string }) {
  return (
    <Box data-testid={testId} aria-busy sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3, color: 'text.secondary', fontSize: 13 }}>
      <CircularProgress size={14} thickness={5} aria-hidden />
      {text}
    </Box>
  );
}

export function NoChanges({ title, detail, testId }: { title: string; detail: string; testId: string }) {
  return (
    <Box data-testid={testId} sx={{ py: 3 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{title}</Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 12.5, mt: 0.5 }}>{detail}</Typography>
    </Box>
  );
}

/** The diff, once asked for: read on open, by revision number, so a new head reads a new diff. */
function DiffBody({ request }: { request: UnitDiffRequest }) {
  const { currentData, isError, isFetching, refetch } = useGetUnitDiffQuery({
    spaceId: request.spaceId,
    unitId: request.unitId,
    from: String(request.from),
    to: String(request.to),
  });
  const summary = useMemo(() => (currentData ? summarizeConfigDiff(currentData.Diff) : undefined), [currentData]);

  if (isError && !isFetching) return <ReadError text={DIFF.error} retry={DIFF.retry} onRetry={() => void refetch()} testId='vx-unit-diff-error' />;
  if (!currentData || !summary) return <ReadLoading text={DIFF.loading} testId='vx-unit-diff-loading' />;
  if (summary.total === 0) return <NoChanges title={DIFF.none} detail={DIFF.noneDetail} testId='vx-unit-diff-none' />;
  return <ConfigDiffView diff={currentData.Diff ?? {}} hideContext columns={PANEL_DIFF_COLUMNS} resourceLabel={panelResourceLabel} />;
}

/**
 * The unreleased changes of the open Unit, from its released revision to its
 * head, read only: the same diff the Unit page's revisions compare shows. Esc
 * closes it before the panel, and the panel's keys do not reach through it.
 */
export function DiffDialog({ request, onClose }: { request: UnitDiffRequest; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} maxWidth='md' fullWidth aria-labelledby='vx-unit-diff-title' data-testid='vx-unit-diff' slotProps={DIALOG_PAPER}>
      <DialogTitle id='vx-unit-diff-title' sx={{ pb: 0.5 }}>
        {DIFF.title(request.from, request.to)}
        <Typography component='div' sx={{ fontSize: 12.5, color: 'text.secondary', fontWeight: 400, mt: 0.25 }}>
          {DIFF.sub(request.slug)}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 160 }}>
        <DiffBody request={request} />
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' size='small' onClick={onClose}>
          {DIFF.close}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
