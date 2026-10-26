// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useId, useMemo } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

import type { MutationConflict, UnitCreateOrUpdateResponseRead } from '@confighub/rtk-query';

import { ConfigDiffView } from '@/components/config-diff/ConfigDiffView';
import { summarizeConfigDiff } from '@/components/config-diff/configDiffTree';

import { useGetUnitUpgradePreviewQuery } from '../../../apps/upgradePreviewApi';
import { splitConflicts } from '../conflicts';
import { PREVIEW } from '../copy';
import { isStalePreview, previewEntry, upgradeBlock, upgradePreviewArgs, type UpgradePreviewRequest } from '../upgrade-preview';
import { NoChanges, ReadError, ReadLoading } from './DiffDialog';
import { DIALOG_PAPER, PANEL_DIFF_COLUMNS, panelResourceLabel } from './diff-layout';

function ConflictGroup({ title, conflicts, kind }: { title: string; conflicts: readonly MutationConflict[]; kind: 'withheld' | 'kept' }) {
  if (!conflicts.length) return null;
  return (
    <Box data-testid='vx-unit-preview-conflicts' data-kind={kind} sx={{ mb: 1.5 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 13, color: kind === 'withheld' ? 'warning.dark' : 'text.secondary' }}>{title}</Typography>
      <Box component='ul' sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 12.5, color: 'text.secondary' }}>
        {conflicts.map((c, i) => (
          <li key={`${c.Path ?? ''}:${c.Reason ?? ''}:${i}`}>
            {c.Path && (
              <Box component='code' sx={{ fontFamily: 'var(--font-mono)', color: 'text.primary' }}>
                {c.Path}
              </Box>
            )}
            {c.Path && c.Reason ? ' · ' : ''}
            {c.Reason}
            {c.Details ? ` (${c.Details})` : ''}
          </li>
        ))}
      </Box>
    </Box>
  );
}

/** What the body reads of the dry run's query. */
interface PreviewQuery {
  currentData?: readonly UnitCreateOrUpdateResponseRead[];
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

/** The dry run's answer for this Unit: what it would change, and what it would not apply. */
function PreviewBody({ query, unitId }: { query: PreviewQuery; unitId: string }) {
  const { currentData, isError, isFetching, refetch } = query;
  const entry = previewEntry(currentData, unitId);
  const summary = useMemo(() => (entry ? summarizeConfigDiff(entry.Diff) : undefined), [entry]);
  const conflicts = useMemo(() => splitConflicts(entry?.Conflicts), [entry]);

  if (isError && !isFetching) return <ReadError text={PREVIEW.error} retry={PREVIEW.retry} onRetry={() => void refetch()} testId='vx-unit-preview-error' />;
  if (!currentData) return <ReadLoading text={PREVIEW.loading} testId='vx-unit-preview-loading' />;
  if (!entry || !summary)
    return (
      <Alert severity='warning' data-testid='vx-unit-preview-missing'>
        {PREVIEW.missing}
      </Alert>
    );
  if (entry.Error)
    return (
      <Alert severity='error' data-testid='vx-unit-preview-refused'>
        {PREVIEW.refused(entry.Error.Message)}
      </Alert>
    );
  return (
    <>
      <ConflictGroup title={PREVIEW.withheld(conflicts.withheld.length)} conflicts={conflicts.withheld} kind='withheld' />
      <ConflictGroup title={PREVIEW.kept(conflicts.kept.length)} conflicts={conflicts.kept} kind='kept' />
      {summary.total === 0 ? (
        <NoChanges title={PREVIEW.none} detail={PREVIEW.noneDetail} testId='vx-unit-preview-none' />
      ) : (
        <ConfigDiffView diff={entry.Diff ?? {}} hideContext columns={PANEL_DIFF_COLUMNS} resourceLabel={panelResourceLabel} />
      )}
    </>
  );
}

interface Props {
  request: UpgradePreviewRequest;
  /** The upgrade the Unit has now, from its current row; another than `request` means the upstream moved. */
  current: UpgradePreviewRequest | null;
  onClose: () => void;
  onUpgrade: () => void;
  /** Ask the dry run again, for the revisions the Unit has now. */
  onPreviewAgain: () => void;
}

/**
 * What upgrading the open Unit from its upstream would change, read only: the
 * upgrade dry run. "Upgrade…" goes on to the confirm, which is the only step
 * that writes, and only once the dry run has answered for this Unit without
 * an error, for the revisions the Unit has now; otherwise it says why. Esc
 * closes it before the panel, and the panel's keys do not reach through it.
 */
export function UpgradePreviewDialog({ request, current, onClose, onUpgrade, onPreviewAgain }: Props) {
  const reasonId = useId();
  const query = useGetUnitUpgradePreviewQuery(upgradePreviewArgs(request));
  const block = upgradeBlock({
    stale: isStalePreview(request, current),
    failed: query.isError && !query.isFetching,
    answered: !!query.currentData,
    entry: previewEntry(query.currentData, request.unitId),
  });
  return (
    <Dialog open onClose={onClose} maxWidth='md' fullWidth aria-labelledby='vx-unit-preview-title' data-testid='vx-unit-preview' slotProps={DIALOG_PAPER}>
      <DialogTitle id='vx-unit-preview-title' sx={{ pb: 0.5 }}>
        {PREVIEW.title(request.from, request.to)}
        <Typography component='div' sx={{ fontSize: 12.5, color: 'text.secondary', fontWeight: 400, mt: 0.25 }}>
          {PREVIEW.sub(request.slug, request.upstream)}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 160 }}>
        <PreviewBody query={query} unitId={request.unitId} />
      </DialogContent>
      <DialogActions sx={{ gap: 1 }}>
        {block && (
          <Typography id={reasonId} data-testid='vx-unit-preview-blocked' data-block={block} sx={{ mr: 'auto', fontSize: 12.5, color: 'text.secondary' }}>
            {PREVIEW.blocked[block]}
          </Typography>
        )}
        {block === 'stale' && (
          <Button variant='text' size='small' onClick={onPreviewAgain}>
            {PREVIEW.previewAgain}
          </Button>
        )}
        <Button variant='outlined' size='small' onClick={onClose}>
          {PREVIEW.close}
        </Button>
        <Button
          variant='contained'
          size='small'
          onClick={onUpgrade}
          disabled={!!block}
          aria-describedby={block ? reasonId : undefined}
          aria-description={PREVIEW.upgradeHint}
        >
          {PREVIEW.upgrade}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
