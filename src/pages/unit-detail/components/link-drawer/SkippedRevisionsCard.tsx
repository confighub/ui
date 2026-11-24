// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The upstream Revisions a Link passes over, as `cub link skip|unskip [--decline]` writes them:
// each skipped run with its reason, the Revisions merged out of order above the merge pointer, and
// the actions that skip, unskip and decline them.
import { Fragment, type ReactNode, useState } from 'react';

import { NavLink } from '@/components/nav-link/NavLink';
import { SectionCard } from '@/components/styled';
import { getApiErrorMessage } from '@/utility/error-functions';
import { type LinkRead, type LinkSkippedRevisions, usePatchLinkMutation } from '@confighub/rtk-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { unitRevisionHref } from '../../unitDetailHrefs';
import { runSelector } from './linkFormat';
import { ListTable } from './LinkTables';

/** What a skip, unskip or decline asks the server for, beside the Link's Version. */
interface SkipWrite {
  skipRevisions?: string;
  unskipRevisions?: string;
  skipReason?: string;
  declineSkips?: boolean;
}

export interface SkippedRevisionsCardProps {
  link: LinkRead;
  /** The upstream Unit, as `SPACE/Unit`. */
  toName: string;
  /** The form has edits: a skip writes the Link, so they are saved or discarded first. */
  dirty: boolean;
  /** After the Link was written, with what to tell the reader. */
  onDone: (message: string) => void;
}

export function SkippedRevisionsCard({ link, toName, dirty, onDone }: SkippedRevisionsCardProps) {
  const [patchLink, { isLoading }] = usePatchLinkMutation();
  const [error, setError] = useState('');
  const [skipping, setSkipping] = useState(false);
  const runs = link.UpstreamSkipped ?? [];
  const mergedAbove = link.UpstreamMergedAbove ?? [];

  const revisionLink = (num: number): ReactNode =>
    link.ToSpaceID && link.ToUnitID ? (
      <NavLink key={num} to={unitRevisionHref(link.ToSpaceID, link.ToUnitID, num)} style={{ textDecoration: 'underline' }}>
        {num}
      </NavLink>
    ) : (
      String(num)
    );
  const runLinks = (run: LinkSkippedRevisions): ReactNode => {
    const from = run.FromRevisionNum ?? 0;
    const to = run.ToRevisionNum ?? from;
    return from === to ? (
      revisionLink(from)
    ) : (
      <>
        {revisionLink(from)}–{revisionLink(to)}
      </>
    );
  };
  const runWords = (run: LinkSkippedRevisions) =>
    run.FromRevisionNum === run.ToRevisionNum
      ? `revision ${run.FromRevisionNum}`
      : `revisions ${run.FromRevisionNum}–${run.ToRevisionNum}`;

  const write = async (request: SkipWrite, message: string): Promise<boolean> => {
    setError('');
    try {
      await patchLink({
        spaceId: link.SpaceID ?? '',
        linkId: link.LinkID ?? '',
        ...request,
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify({ Version: link.Version }),
      }).unwrap();
      onDone(message);
      return true;
    } catch (e) {
      setError(`The Link was not changed. ${getApiErrorMessage(e, '')}`);
      return false;
    }
  };

  const disabledWhy = dirty ? 'Save or discard the edits first: this writes the Link.' : '';
  const action = (label: string, title: string, onClick: () => void, testId: string) => (
    <Tooltip arrow title={disabledWhy || title}>
      <span>
        <Button size='small' onClick={onClick} disabled={dirty || isLoading} data-testid={testId}>
          {label}
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <SectionCard
      title='Skipped upstream revisions'
      badge={runs.length > 0 ? runs.length : undefined}
      testId='link-skipped-revisions'
      action={action(
        'Skip revisions',
        `Make merges over this Link pass over revisions of ${toName}.`,
        () => setSkipping(true),
        'link-skip-open',
      )}
    >
      <Stack spacing={1.5}>
        <Typography variant='body2' color='text.secondary'>
          Merges over this Link do not take these revisions of {toName}. Unskip a revision to take it in the next
          merge. Decline a revision so that no merge takes it, not even a ChangeOrder&apos;s promotion.
        </Typography>
        {runs.length === 0 ? (
          <Typography variant='body2' data-testid='link-skipped-none'>
            The Link has not skipped a revision.
          </Typography>
        ) : (
          <ListTable
            columns={['Revisions', 'Reason', '']}
            testId='link-skipped-runs'
            rows={runs.map((run) => [
              <Fragment key='revisions'>
                {runLinks(run)}
                {run.Declined ? ' (declined)' : ''}
              </Fragment>,
              run.Reason ?? '',
              <Stack key='actions' direction='row' spacing={0.5} justifyContent='flex-end'>
                {action(
                  'Unskip',
                  `The next merge takes ${runWords(run)}.`,
                  () => void write({ unskipRevisions: runSelector(run) }, `Unskipped ${runWords(run)} of ${toName}.`),
                  'link-unskip',
                )}
                {run.Declined
                  ? action(
                      'Undecline',
                      `Keep ${runWords(run)} skipped, but let a merge that names them take them.`,
                      () =>
                        void write(
                          { skipRevisions: runSelector(run), declineSkips: false },
                          `Undeclined ${runWords(run)} of ${toName}.`,
                        ),
                      'link-undecline',
                    )
                  : action(
                      'Decline',
                      `No merge takes ${runWords(run)}, not even one that names them.`,
                      () =>
                        void write(
                          { skipRevisions: runSelector(run), declineSkips: true },
                          `Declined ${runWords(run)} of ${toName}.`,
                        ),
                      'link-decline',
                    )}
              </Stack>,
            ])}
          />
        )}
        {mergedAbove.length > 0 && (
          <Typography variant='body2' data-testid='link-merged-above'>
            Merged out of order, above the last merged revision:{' '}
            {mergedAbove.map((num, i) => (
              <Fragment key={num}>
                {i > 0 ? ', ' : ''}
                {revisionLink(num)}
              </Fragment>
            ))}
          </Typography>
        )}
        {error && <Alert severity='error'>{error}</Alert>}
      </Stack>
      {skipping && (
        <SkipRevisionsDialog
          toName={toName}
          saving={isLoading}
          onClose={() => setSkipping(false)}
          onSkip={async (request) => {
            const ok = await write(request, `Skipped ${request.skipRevisions} of ${toName}.`);
            if (ok) setSkipping(false);
            return ok;
          }}
        />
      )}
    </SectionCard>
  );
}

function SkipRevisionsDialog({
  toName,
  saving,
  onClose,
  onSkip,
}: {
  toName: string;
  saving: boolean;
  onClose: () => void;
  onSkip: (request: SkipWrite) => Promise<boolean>;
}) {
  const [revisions, setRevisions] = useState('');
  const [reason, setReason] = useState('');
  const [decline, setDecline] = useState(false);
  const entries = revisions.trim();
  return (
    <Dialog open onClose={onClose} maxWidth='sm' fullWidth data-testid='link-skip-dialog'>
      <DialogTitle>Skip revisions of {toName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label='Revisions'
            size='small'
            value={revisions}
            onChange={(e) => setRevisions(e.target.value)}
            autoFocus
            placeholder='6, 8..10, ChangeSet:<id>'
            helperText='A revision number, a range such as 4..7 (the revisions after 4, up to and including 7), or a ChangeSet:, ChangeOrder:, Tag: or Release: ID. Separate entries with commas. Only revisions the Link has not merged are skipped.'
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'link-skip-revisions' } }}
          />
          <TextField
            label='Reason'
            size='small'
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText='Shown with the skipped revisions.'
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'link-skip-reason' } }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={decline}
                onChange={(e) => setDecline(e.target.checked)}
                slotProps={{ input: { 'data-testid': 'link-skip-decline' } as object }}
              />
            }
            label='Decline: no merge takes these revisions, not even one that names them'
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant='outlined'>
          Cancel
        </Button>
        <Button
          variant='contained'
          disabled={entries === '' || saving}
          onClick={() =>
            void onSkip({
              skipRevisions: entries,
              skipReason: reason.trim() || undefined,
              declineSkips: decline ? true : undefined,
            })
          }
          data-testid='link-skip-confirm'
        >
          Skip
        </Button>
      </DialogActions>
    </Dialog>
  );
}
